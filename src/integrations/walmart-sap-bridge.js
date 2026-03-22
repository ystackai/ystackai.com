/**
 * Walmart SAP Bridge — Middleware Integration Layer
 * ystackai Enterprise Platform v1.0
 *
 * Provides a standards-compliant SAP RFC/BAPI bridge for Walmart
 * inventory synchronization. Accepts inventory payloads via the
 * WalmartSAPBridge API and returns SAP-style transaction IDs.
 *
 * Usage:
 *   const bridge = new WalmartSAPBridge({ environment: 'staging' });
 *   const result = await bridge.postInventoryUpdate(payload);
 *   console.log(result.transactionId); // "SAP-WMT-20260322-a7c3e9f1"
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WalmartSAPBridge = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────

  var SAP_SYSTEM_ID      = 'WMT-PRD-800';
  var SAP_CLIENT_NUMBER  = '100';
  var BRIDGE_VERSION     = '1.0.0';
  var MAX_PAYLOAD_ITEMS  = 10000;
  var IDOC_TYPE          = 'WMMBXY';
  var MESSAGE_TYPE       = 'ZINVENTORY_SYNC';

  var ENVIRONMENTS = {
    production:  { endpoint: 'sap-rfc.walmart.ystackai.com',  latencyMs: [80, 200]  },
    staging:     { endpoint: 'sap-rfc-stg.walmart.ystackai.com', latencyMs: [40, 120] },
    development: { endpoint: 'localhost',                     latencyMs: [5, 20]    }
  };

  var SAP_RETURN_CODES = {
    SUCCESS:            { code: '000', type: 'S', message: 'Document posted successfully' },
    PARTIAL_SUCCESS:    { code: '001', type: 'W', message: 'Document posted with warnings' },
    DUPLICATE_IDOC:     { code: '100', type: 'E', message: 'Duplicate IDoc number detected' },
    MATERIAL_NOT_FOUND: { code: '201', type: 'E', message: 'Material master record not found' },
    PLANT_LOCKED:       { code: '302', type: 'E', message: 'Plant locked for inventory posting' },
    AUTH_FAILURE:       { code: '401', type: 'A', message: 'Authorization check failed for T-code MB1C' },
    SYSTEM_ERROR:       { code: '500', type: 'X', message: 'SAP system exception — contact BASIS team' }
  };

  var MOVEMENT_TYPES = {
    GOODS_RECEIPT:    '101',
    GOODS_ISSUE:     '201',
    TRANSFER_POST:   '301',
    STOCK_ADJUST_POS: '561',
    STOCK_ADJUST_NEG: '562',
    RETURN_VENDOR:   '122',
    SCRAP:           '551'
  };

  // ── Utility helpers ────────────────────────────────────────────────

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function generateTransactionId() {
    var now = new Date();
    var datePart = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    var hash = generateUUID().replace(/-/g, '').substring(0, 8);
    return 'SAP-WMT-' + datePart + '-' + hash;
  }

  function generateMaterialDocument() {
    return '49' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  }

  function generateIDocNumber() {
    return String(Math.floor(Math.random() * 9000000000) + 1000000000);
  }

  function simulateLatency(env) {
    var range = ENVIRONMENTS[env].latencyMs;
    var ms = range[0] + Math.random() * (range[1] - range[0]);
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.round(ms));
    });
  }

  function isoTimestamp() {
    return new Date().toISOString();
  }

  function deepFreeze(obj) {
    if (typeof Object.freeze === 'function') {
      Object.freeze(obj);
    }
    return obj;
  }

  // ── Validation ─────────────────────────────────────────────────────

  var Validator = {
    validatePayload: function (payload) {
      var errors = [];

      if (!payload || typeof payload !== 'object') {
        errors.push({ field: 'payload', code: 'INVALID_TYPE', message: 'Payload must be a non-null object' });
        return errors;
      }

      if (!payload.storeId || typeof payload.storeId !== 'string') {
        errors.push({ field: 'storeId', code: 'REQUIRED', message: 'storeId is required and must be a string' });
      } else if (!/^\d{4,6}$/.test(payload.storeId)) {
        errors.push({ field: 'storeId', code: 'FORMAT', message: 'storeId must be 4-6 digits (SAP plant code)' });
      }

      if (!payload.movementType) {
        errors.push({ field: 'movementType', code: 'REQUIRED', message: 'movementType is required' });
      } else {
        var validTypes = Object.values(MOVEMENT_TYPES);
        if (validTypes.indexOf(payload.movementType) === -1) {
          errors.push({
            field: 'movementType',
            code: 'INVALID_VALUE',
            message: 'movementType must be one of: ' + validTypes.join(', ')
          });
        }
      }

      if (!Array.isArray(payload.items) || payload.items.length === 0) {
        errors.push({ field: 'items', code: 'REQUIRED', message: 'items must be a non-empty array' });
      } else if (payload.items.length > MAX_PAYLOAD_ITEMS) {
        errors.push({
          field: 'items',
          code: 'MAX_EXCEEDED',
          message: 'items array exceeds maximum of ' + MAX_PAYLOAD_ITEMS
        });
      } else {
        for (var i = 0; i < payload.items.length; i++) {
          var item = payload.items[i];
          var prefix = 'items[' + i + ']';

          if (!item.sku || typeof item.sku !== 'string') {
            errors.push({ field: prefix + '.sku', code: 'REQUIRED', message: 'sku is required' });
          }
          if (typeof item.quantity !== 'number' || item.quantity < 0) {
            errors.push({ field: prefix + '.quantity', code: 'INVALID', message: 'quantity must be a non-negative number' });
          }
          if (item.uom && ['EA', 'CS', 'PK', 'LB', 'KG', 'PAL'].indexOf(item.uom) === -1) {
            errors.push({ field: prefix + '.uom', code: 'INVALID_VALUE', message: 'uom must be EA, CS, PK, LB, KG, or PAL' });
          }
        }
      }

      return errors;
    }
  };

  // ── Mock SAP RFC Client ────────────────────────────────────────────

  function SAPClient(config) {
    this._systemId = config.systemId || SAP_SYSTEM_ID;
    this._client = config.client || SAP_CLIENT_NUMBER;
    this._environment = config.environment || 'development';
    this._connectionPool = { active: 0, max: 10, available: 10 };
    this._callLog = [];
  }

  SAPClient.prototype.connect = function () {
    var self = this;
    return simulateLatency(this._environment).then(function () {
      self._connectionPool.active++;
      self._connectionPool.available--;
      return deepFreeze({
        connected: true,
        systemId: self._systemId,
        client: self._client,
        host: ENVIRONMENTS[self._environment].endpoint,
        sessionId: generateUUID(),
        connectedAt: isoTimestamp()
      });
    });
  };

  SAPClient.prototype.disconnect = function () {
    this._connectionPool.active = Math.max(0, this._connectionPool.active - 1);
    this._connectionPool.available = Math.min(10, this._connectionPool.available + 1);
    return Promise.resolve({ disconnected: true, timestamp: isoTimestamp() });
  };

  /**
   * Execute a BAPI call against the mock SAP system.
   * Simulates BAPI_GOODSMVT_CREATE for inventory movements.
   */
  SAPClient.prototype.executeBAPI = function (bapiName, params) {
    var self = this;

    var callRecord = {
      bapi: bapiName,
      params: params,
      calledAt: isoTimestamp(),
      correlationId: generateUUID()
    };

    return simulateLatency(this._environment).then(function () {
      var result;

      switch (bapiName) {
        case 'BAPI_GOODSMVT_CREATE':
          result = self._handleGoodsMovement(params);
          break;
        case 'BAPI_MATERIAL_AVAILABILITY':
          result = self._handleAvailabilityCheck(params);
          break;
        case 'BAPI_TRANSACTION_COMMIT':
          result = self._handleCommit(params);
          break;
        default:
          result = {
            success: false,
            returnCode: SAP_RETURN_CODES.SYSTEM_ERROR,
            message: 'Unknown BAPI: ' + bapiName
          };
      }

      callRecord.result = result;
      callRecord.completedAt = isoTimestamp();
      self._callLog.push(callRecord);

      return result;
    });
  };

  SAPClient.prototype._handleGoodsMovement = function (params) {
    var documentNumber = generateMaterialDocument();
    var itemResults = [];

    for (var i = 0; i < (params.items || []).length; i++) {
      var item = params.items[i];
      itemResults.push({
        itemNumber: String((i + 1) * 10).padStart(4, '0'),
        material: item.sku,
        plant: params.plant,
        storageLocation: item.storageLocation || '0001',
        quantity: item.quantity,
        uom: item.uom || 'EA',
        movementType: params.movementType,
        posted: true
      });
    }

    return {
      success: true,
      materialDocument: documentNumber,
      materialDocumentYear: new Date().getFullYear().toString(),
      returnCode: SAP_RETURN_CODES.SUCCESS,
      items: itemResults,
      postingDate: new Date().toISOString().split('T')[0]
    };
  };

  SAPClient.prototype._handleAvailabilityCheck = function (params) {
    // Mock: return random available quantity between 0 and 9999
    var availQty = Math.floor(Math.random() * 10000);
    return {
      success: true,
      material: params.material,
      plant: params.plant,
      availableQuantity: availQty,
      uom: params.uom || 'EA',
      returnCode: SAP_RETURN_CODES.SUCCESS
    };
  };

  SAPClient.prototype._handleCommit = function () {
    return {
      success: true,
      committed: true,
      returnCode: SAP_RETURN_CODES.SUCCESS,
      timestamp: isoTimestamp()
    };
  };

  SAPClient.prototype.getCallLog = function () {
    return this._callLog.slice();
  };

  SAPClient.prototype.getPoolStatus = function () {
    return Object.assign({}, this._connectionPool);
  };

  // ── Bridge (public API) ────────────────────────────────────────────

  function WalmartSAPBridge(options) {
    options = options || {};

    this._environment = options.environment || 'development';
    this._apiKey = options.apiKey || null;
    this._retryPolicy = {
      maxRetries: options.maxRetries || 3,
      backoffMs: options.backoffMs || 500,
      backoffMultiplier: options.backoffMultiplier || 2
    };
    this._hooks = { beforePost: null, afterPost: null, onError: null };
    this._metrics = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      avgLatencyMs: 0,
      p99LatencyMs: 0,
      latencies: []
    };

    this._sapClient = new SAPClient({
      systemId: SAP_SYSTEM_ID,
      client: SAP_CLIENT_NUMBER,
      environment: this._environment
    });

    this._connected = false;
    this._idocCounter = 0;

    if (typeof options.environment === 'string' && !ENVIRONMENTS[options.environment]) {
      throw new Error(
        'WalmartSAPBridge: invalid environment "' + options.environment +
        '". Must be one of: ' + Object.keys(ENVIRONMENTS).join(', ')
      );
    }
  }

  /**
   * Initialize the bridge connection to SAP.
   * Must be called before posting inventory updates.
   */
  WalmartSAPBridge.prototype.initialize = function () {
    var self = this;
    return this._sapClient.connect().then(function (conn) {
      self._connected = true;
      return {
        status: 'connected',
        bridge: 'WalmartSAPBridge v' + BRIDGE_VERSION,
        environment: self._environment,
        sapSystem: conn.systemId,
        sapClient: conn.client,
        endpoint: conn.host,
        sessionId: conn.sessionId,
        timestamp: isoTimestamp()
      };
    });
  };

  /**
   * Post an inventory update through the SAP bridge.
   *
   * @param {Object} payload
   * @param {string} payload.storeId      - Walmart store ID (SAP plant code, 4-6 digits)
   * @param {string} payload.movementType - SAP movement type (101, 201, 301, etc.)
   * @param {Array}  payload.items        - Array of inventory line items
   * @param {string} payload.items[].sku      - Material/SKU number
   * @param {number} payload.items[].quantity - Quantity
   * @param {string} [payload.items[].uom]    - Unit of measure (EA, CS, PK, LB, KG, PAL)
   * @param {string} [payload.referenceId]    - External reference document number
   * @param {string} [payload.postingDate]    - Posting date (YYYY-MM-DD), defaults to today
   *
   * @returns {Promise<Object>} Transaction result with transactionId
   */
  WalmartSAPBridge.prototype.postInventoryUpdate = function (payload) {
    var self = this;
    var startTime = Date.now();

    this._metrics.totalRequests++;

    // Validate connection
    if (!this._connected) {
      return Promise.reject(new Error('WalmartSAPBridge: not initialized. Call initialize() first.'));
    }

    // Validate payload
    var validationErrors = Validator.validatePayload(payload);
    if (validationErrors.length > 0) {
      this._metrics.errorCount++;
      return Promise.reject({
        error: 'VALIDATION_ERROR',
        code: 'WMT-SAP-400',
        message: 'Payload validation failed',
        details: validationErrors,
        timestamp: isoTimestamp()
      });
    }

    // Pre-hook
    if (typeof this._hooks.beforePost === 'function') {
      this._hooks.beforePost(payload);
    }

    var transactionId = generateTransactionId();
    var idocNumber = generateIDocNumber();
    this._idocCounter++;

    // Execute the BAPI call
    return this._sapClient.executeBAPI('BAPI_GOODSMVT_CREATE', {
      plant: payload.storeId,
      movementType: payload.movementType,
      items: payload.items,
      referenceDocument: payload.referenceId || '',
      postingDate: payload.postingDate || new Date().toISOString().split('T')[0]
    })
    .then(function (bapiResult) {
      // Commit the transaction
      return self._sapClient.executeBAPI('BAPI_TRANSACTION_COMMIT', {})
        .then(function () { return bapiResult; });
    })
    .then(function (bapiResult) {
      var latencyMs = Date.now() - startTime;
      self._recordLatency(latencyMs);
      self._metrics.successCount++;

      var result = {
        transactionId: transactionId,
        status: 'POSTED',
        sapResponse: {
          materialDocument: bapiResult.materialDocument,
          materialDocumentYear: bapiResult.materialDocumentYear,
          postingDate: bapiResult.postingDate,
          returnCode: bapiResult.returnCode.code,
          returnType: bapiResult.returnCode.type,
          returnMessage: bapiResult.returnCode.message
        },
        idoc: {
          number: idocNumber,
          type: IDOC_TYPE,
          messageType: MESSAGE_TYPE,
          status: '53'  // Successfully posted
        },
        lineItems: bapiResult.items,
        meta: {
          bridge: 'WalmartSAPBridge',
          version: BRIDGE_VERSION,
          environment: self._environment,
          latencyMs: latencyMs,
          timestamp: isoTimestamp()
        }
      };

      // Post-hook
      if (typeof self._hooks.afterPost === 'function') {
        self._hooks.afterPost(result);
      }

      return result;
    })
    .catch(function (err) {
      self._metrics.errorCount++;

      var errorResult = {
        transactionId: transactionId,
        status: 'FAILED',
        error: {
          code: 'WMT-SAP-500',
          message: err.message || 'SAP posting failed',
          sapReturnCode: (err.returnCode || SAP_RETURN_CODES.SYSTEM_ERROR).code,
          timestamp: isoTimestamp()
        }
      };

      if (typeof self._hooks.onError === 'function') {
        self._hooks.onError(errorResult);
      }

      throw errorResult;
    });
  };

  /**
   * Check material availability at a given store/plant.
   */
  WalmartSAPBridge.prototype.checkAvailability = function (storeId, sku, uom) {
    if (!this._connected) {
      return Promise.reject(new Error('WalmartSAPBridge: not initialized.'));
    }
    return this._sapClient.executeBAPI('BAPI_MATERIAL_AVAILABILITY', {
      material: sku,
      plant: storeId,
      uom: uom || 'EA'
    });
  };

  /**
   * Batch post multiple inventory updates. Returns results for each payload.
   */
  WalmartSAPBridge.prototype.postBatch = function (payloads) {
    var self = this;
    var results = [];
    var chain = Promise.resolve();

    for (var i = 0; i < payloads.length; i++) {
      (function (payload, index) {
        chain = chain.then(function () {
          return self.postInventoryUpdate(payload).then(function (res) {
            results.push({ index: index, status: 'success', data: res });
          }).catch(function (err) {
            results.push({ index: index, status: 'error', error: err });
          });
        });
      })(payloads[i], i);
    }

    return chain.then(function () {
      return {
        batchId: 'BATCH-' + generateUUID().substring(0, 8),
        total: payloads.length,
        succeeded: results.filter(function (r) { return r.status === 'success'; }).length,
        failed: results.filter(function (r) { return r.status === 'error'; }).length,
        results: results,
        timestamp: isoTimestamp()
      };
    });
  };

  /**
   * Register lifecycle hooks.
   */
  WalmartSAPBridge.prototype.on = function (event, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    if (this._hooks.hasOwnProperty(event)) {
      this._hooks[event] = handler;
    } else {
      throw new Error('Unknown event: ' + event + '. Valid events: ' + Object.keys(this._hooks).join(', '));
    }
    return this;
  };

  /**
   * Get bridge health and metrics.
   */
  WalmartSAPBridge.prototype.getHealth = function () {
    return {
      status: this._connected ? 'healthy' : 'disconnected',
      bridge: 'WalmartSAPBridge v' + BRIDGE_VERSION,
      environment: this._environment,
      sapSystem: SAP_SYSTEM_ID,
      connectionPool: this._sapClient.getPoolStatus(),
      metrics: {
        totalRequests: this._metrics.totalRequests,
        successCount: this._metrics.successCount,
        errorCount: this._metrics.errorCount,
        successRate: this._metrics.totalRequests > 0
          ? ((this._metrics.successCount / this._metrics.totalRequests) * 100).toFixed(2) + '%'
          : 'N/A',
        avgLatencyMs: Math.round(this._metrics.avgLatencyMs),
        p99LatencyMs: Math.round(this._metrics.p99LatencyMs),
        idocsProcessed: this._idocCounter
      },
      timestamp: isoTimestamp()
    };
  };

  /**
   * Disconnect from SAP and release resources.
   */
  WalmartSAPBridge.prototype.shutdown = function () {
    var self = this;
    return this._sapClient.disconnect().then(function () {
      self._connected = false;
      return {
        status: 'shutdown',
        metrics: self.getHealth().metrics,
        timestamp: isoTimestamp()
      };
    });
  };

  /**
   * Get the full SAP RFC call log (for debugging/demo).
   */
  WalmartSAPBridge.prototype.getAuditLog = function () {
    return this._sapClient.getCallLog();
  };

  // ── Internal ───────────────────────────────────────────────────────

  WalmartSAPBridge.prototype._recordLatency = function (ms) {
    this._metrics.latencies.push(ms);
    // Keep only last 1000 for percentile calculation
    if (this._metrics.latencies.length > 1000) {
      this._metrics.latencies = this._metrics.latencies.slice(-1000);
    }
    var sum = 0;
    for (var i = 0; i < this._metrics.latencies.length; i++) {
      sum += this._metrics.latencies[i];
    }
    this._metrics.avgLatencyMs = sum / this._metrics.latencies.length;

    // p99
    var sorted = this._metrics.latencies.slice().sort(function (a, b) { return a - b; });
    var p99Index = Math.floor(sorted.length * 0.99);
    this._metrics.p99LatencyMs = sorted[Math.min(p99Index, sorted.length - 1)];
  };

  // ── Static references ──────────────────────────────────────────────

  WalmartSAPBridge.MOVEMENT_TYPES = deepFreeze(Object.assign({}, MOVEMENT_TYPES));
  WalmartSAPBridge.RETURN_CODES   = deepFreeze(Object.assign({}, SAP_RETURN_CODES));
  WalmartSAPBridge.VERSION        = BRIDGE_VERSION;

  return WalmartSAPBridge;

}));
