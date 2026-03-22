/**
 * Walmart SAP API Schema - Enterprise Bridge Integration Layer
 *
 * This module defines the schema validators, data models, and
 * bridge utilities for the Walmart SAP ERP integration.
 *
 * Endpoints covered:
 *   POST /api/v1/walmart/session/init
 *   POST /api/v1/sync/inventory
 *   POST /api/v1/webhook/order
 *   GET  /api/v1/walmart/analytics/events
 *   GET  /api/walmart/v1/products
 *   POST /api/walmart/v1/inventory
 *   POST /api/v1/walmart/payroll/verify
 *
 * Auth: OAuth 2.0 client credentials + OIDC SSO, Bearer token
 * Compatibility: SAP legacy on-prem deployments
 */

// ── Data Models ──────────────────────────────────────────────────────────

var WalmartSchema = (function () {
  'use strict';

  // ── Field validators ─────────────────────────────────────────────────

  function isNonEmptyString(val) {
    return typeof val === 'string' && val.trim().length > 0;
  }

  function isPositiveNumber(val) {
    return typeof val === 'number' && val >= 0 && isFinite(val);
  }

  function isValidSku(sku) {
    // Walmart SKU format: alphanumeric, 6-20 chars
    return typeof sku === 'string' && /^[A-Za-z0-9\-]{6,20}$/.test(sku);
  }

  function isValidTimestamp(ts) {
    if (typeof ts === 'number') return ts > 0 && isFinite(ts);
    if (typeof ts === 'string') return !isNaN(Date.parse(ts));
    return false;
  }

  // ── Schema Definitions ───────────────────────────────────────────────

  var schemas = {
    InventoryItem: {
      required: ['sku', 'quantity', 'warehouse'],
      fields: {
        sku:       { type: 'string', validate: isValidSku },
        quantity:  { type: 'number', validate: isPositiveNumber },
        warehouse: { type: 'string', validate: isNonEmptyString }
      }
    },

    Product: {
      required: ['id', 'name', 'price', 'category'],
      fields: {
        id:       { type: 'string', validate: isNonEmptyString },
        name:     { type: 'string', validate: isNonEmptyString },
        price:    { type: 'number', validate: isPositiveNumber },
        category: { type: 'string', validate: isNonEmptyString }
      }
    },

    SessionInit: {
      required: ['user_id', 'sso_token', 'client_id'],
      fields: {
        user_id:    { type: 'string', validate: isNonEmptyString },
        sso_token:  { type: 'string', validate: isNonEmptyString },
        client_id:  { type: 'string', validate: isNonEmptyString },
        session_ttl: { type: 'number', validate: isPositiveNumber }
      }
    },

    OrderWebhook: {
      required: ['order_id', 'event_type', 'timestamp', 'payload'],
      fields: {
        order_id:   { type: 'string', validate: isNonEmptyString },
        event_type: { type: 'string', validate: isNonEmptyString },
        timestamp:  { type: 'string', validate: isValidTimestamp },
        payload:    { type: 'object' }
      }
    },

    AnalyticsEvent: {
      required: ['event', 'user_id', 'score'],
      fields: {
        event:         { type: 'string', validate: isNonEmptyString },
        user_id:       { type: 'string', validate: isNonEmptyString },
        score:         { type: 'number', validate: isPositiveNumber },
        revenue_share: { type: 'number', validate: isPositiveNumber },
        timestamp:     { type: 'string', validate: isValidTimestamp }
      }
    },

    PayrollVerify: {
      required: ['employee_id', 'store_id', 'period'],
      fields: {
        employee_id: { type: 'string', validate: isNonEmptyString },
        store_id:    { type: 'string', validate: isNonEmptyString },
        period:      { type: 'string', validate: isNonEmptyString },
        amount:      { type: 'number', validate: isPositiveNumber }
      }
    },

    InventorySync: {
      required: ['items', 'warehouse_id', 'sync_timestamp'],
      fields: {
        items:          { type: 'array' },
        warehouse_id:   { type: 'string', validate: isNonEmptyString },
        sync_timestamp: { type: 'string', validate: isValidTimestamp },
        sap_batch_id:   { type: 'string', validate: isNonEmptyString }
      }
    }
  };

  // ── Validation Engine ────────────────────────────────────────────────

  function validate(schemaName, data) {
    var schema = schemas[schemaName];
    if (!schema) {
      return { valid: false, errors: ['Unknown schema: ' + schemaName] };
    }

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Data must be a non-null object'] };
    }

    var errors = [];

    // Check required fields
    for (var i = 0; i < schema.required.length; i++) {
      var field = schema.required[i];
      if (data[field] === undefined || data[field] === null) {
        errors.push('Missing required field: ' + field);
      }
    }

    // Validate field types and constraints
    var fieldNames = Object.keys(schema.fields);
    for (var j = 0; j < fieldNames.length; j++) {
      var name = fieldNames[j];
      var spec = schema.fields[name];
      var value = data[name];

      if (value === undefined || value === null) continue;

      // Type check (skip for 'array' and 'object' — handled separately)
      if (spec.type === 'array') {
        if (!Array.isArray(value)) {
          errors.push('Field ' + name + ' must be an array');
        }
      } else if (spec.type === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push('Field ' + name + ' must be an object');
        }
      } else if (typeof value !== spec.type) {
        errors.push('Field ' + name + ' must be of type ' + spec.type);
      }

      // Custom validator
      if (spec.validate && !spec.validate(value)) {
        errors.push('Field ' + name + ' failed validation');
      }
    }

    return { valid: errors.length === 0, errors: errors };
  }

  // ── SAP Bridge Utilities ─────────────────────────────────────────────

  /**
   * Transform a ystack analytics event into SAP-compatible format.
   * SAP expects flat key-value with uppercase field names.
   */
  function toSapPayload(event) {
    return {
      SAP_EVENT_TYPE: (event.event || '').toUpperCase(),
      SAP_USER_REF:  event.user_id || '',
      SAP_SCORE_VAL: event.score || 0,
      SAP_REV_SHARE: event.revenue_share || 0,
      SAP_TIMESTAMP: event.timestamp || new Date().toISOString(),
      SAP_SOURCE:    'YSTACK_ENTERPRISE_BRIDGE',
      SAP_VERSION:   '1.0'
    };
  }

  /**
   * Transform a SAP inventory record into ystack InventoryItem format.
   */
  function fromSapInventory(sapRecord) {
    return {
      sku:       sapRecord.MATNR || sapRecord.SKU || '',
      quantity:  parseInt(sapRecord.LABST || sapRecord.QTY || '0', 10),
      warehouse: sapRecord.LGORT || sapRecord.WERKS || ''
    };
  }

  /**
   * Build the auth header for Walmart API calls.
   * Expects an OAuth token obtained via client credentials flow.
   */
  function buildAuthHeader(token) {
    if (!isNonEmptyString(token)) {
      throw new Error('Valid Bearer token required');
    }
    return {
      'Authorization': 'Bearer ' + token,
      'Content-Type':  'application/json',
      'X-Walmart-Bridge': 'ystack-sap-v1',
      'X-Request-Id': generateRequestId()
    };
  }

  function generateRequestId() {
    var chars = 'abcdef0123456789';
    var id = '';
    for (var i = 0; i < 32; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id.slice(0, 8) + '-' + id.slice(8, 12) + '-' +
           id.slice(12, 16) + '-' + id.slice(16, 20) + '-' + id.slice(20);
  }

  // ── Endpoint Registry ────────────────────────────────────────────────

  var endpoints = {
    sessionInit:     { method: 'POST', path: '/api/v1/walmart/session/init',      schema: 'SessionInit' },
    inventorySync:   { method: 'POST', path: '/api/v1/sync/inventory',            schema: 'InventorySync' },
    orderWebhook:    { method: 'POST', path: '/api/v1/webhook/order',             schema: 'OrderWebhook' },
    analyticsEvents: { method: 'GET',  path: '/api/v1/walmart/analytics/events',  schema: null },
    getProducts:     { method: 'GET',  path: '/api/walmart/v1/products',           schema: null },
    updateInventory: { method: 'POST', path: '/api/walmart/v1/inventory',          schema: 'InventoryItem' },
    payrollVerify:   { method: 'POST', path: '/api/v1/walmart/payroll/verify',     schema: 'PayrollVerify' }
  };

  // ── Public API ───────────────────────────────────────────────────────

  return {
    schemas:          schemas,
    endpoints:        endpoints,
    validate:         validate,
    toSapPayload:     toSapPayload,
    fromSapInventory: fromSapInventory,
    buildAuthHeader:  buildAuthHeader,
    VERSION:          '1.0.0'
  };
})();

// Export for Node.js / CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WalmartSchema;
}
