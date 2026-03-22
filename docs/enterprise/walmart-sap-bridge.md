# Walmart SAP Bridge — Integration Specification

**Version:** 1.0.0
**Status:** Pre-production (Monday demo target)
**Owner:** ystackai Enterprise Platform Team
**SAP System:** WMT-PRD-800 / Client 100

---

## Overview

The Walmart SAP Bridge is a middleware integration layer that connects ystackai's inventory platform with Walmart's SAP ERP system. It provides a JavaScript-native API for posting inventory movements, checking material availability, and managing batch operations — all mapped to SAP RFC/BAPI calls under the hood.

This bridge handles the translation between ystackai's JSON payload format and SAP's BAPI interfaces (`BAPI_GOODSMVT_CREATE`, `BAPI_MATERIAL_AVAILABILITY`, `BAPI_TRANSACTION_COMMIT`), including IDoc generation, transaction ID management, and full audit logging.

---

## Quick Start

```javascript
const WalmartSAPBridge = require('../src/integrations/walmart-sap-bridge');

const bridge = new WalmartSAPBridge({ environment: 'staging' });

// Initialize connection
await bridge.initialize();

// Post an inventory update
const result = await bridge.postInventoryUpdate({
  storeId: '4521',
  movementType: '101',    // Goods receipt
  items: [
    { sku: 'WMT-88820145', quantity: 240, uom: 'CS' },
    { sku: 'WMT-77301092', quantity: 48,  uom: 'EA' }
  ],
  referenceId: 'PO-2026-03-22-001'
});

console.log(result.transactionId);
// => "SAP-WMT-20260322-a7c3e9f1"

console.log(result.sapResponse.materialDocument);
// => "4923847561"
```

---

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `environment` | `string` | `'development'` | Target environment: `production`, `staging`, or `development` |
| `apiKey` | `string` | `null` | API key for authenticated endpoints |
| `maxRetries` | `number` | `3` | Maximum retry attempts on transient failures |
| `backoffMs` | `number` | `500` | Initial backoff delay in milliseconds |
| `backoffMultiplier` | `number` | `2` | Exponential backoff multiplier |

### Environments

| Environment | Endpoint | Simulated Latency |
|-------------|----------|-------------------|
| `production` | `sap-rfc.walmart.ystackai.com` | 80–200ms |
| `staging` | `sap-rfc-stg.walmart.ystackai.com` | 40–120ms |
| `development` | `localhost` | 5–20ms |

---

## API Reference

### `bridge.initialize()`

Establishes a connection to the SAP system. Must be called before any other operations.

**Returns:** `Promise<Object>` — Connection status with session ID.

---

### `bridge.postInventoryUpdate(payload)`

Posts an inventory movement to SAP via `BAPI_GOODSMVT_CREATE`.

**Payload schema:**

```javascript
{
  storeId: '4521',           // Required. SAP plant code (4-6 digits)
  movementType: '101',       // Required. SAP movement type
  items: [                   // Required. Non-empty array, max 10,000 items
    {
      sku: 'WMT-88820145',  // Required. Material number
      quantity: 240,          // Required. Non-negative number
      uom: 'CS'              // Optional. EA, CS, PK, LB, KG, or PAL (default: EA)
    }
  ],
  referenceId: 'PO-001',    // Optional. External reference document
  postingDate: '2026-03-22' // Optional. Defaults to today
}
```

**Response:**

```javascript
{
  transactionId: 'SAP-WMT-20260322-a7c3e9f1',
  status: 'POSTED',
  sapResponse: {
    materialDocument: '4923847561',
    materialDocumentYear: '2026',
    postingDate: '2026-03-22',
    returnCode: '000',
    returnType: 'S',
    returnMessage: 'Document posted successfully'
  },
  idoc: {
    number: '3847291056',
    type: 'WMMBXY',
    messageType: 'ZINVENTORY_SYNC',
    status: '53'
  },
  lineItems: [ ... ],
  meta: {
    bridge: 'WalmartSAPBridge',
    version: '1.0.0',
    environment: 'staging',
    latencyMs: 87,
    timestamp: '2026-03-22T14:30:00.000Z'
  }
}
```

---

### `bridge.checkAvailability(storeId, sku, uom?)`

Checks available stock for a material at a given plant via `BAPI_MATERIAL_AVAILABILITY`.

---

### `bridge.postBatch(payloads)`

Sequentially posts an array of inventory payloads. Returns individual results for each.

**Response:**

```javascript
{
  batchId: 'BATCH-a7c3e9f1',
  total: 5,
  succeeded: 4,
  failed: 1,
  results: [ ... ],
  timestamp: '2026-03-22T14:30:00.000Z'
}
```

---

### `bridge.on(event, handler)`

Register lifecycle hooks. Chainable.

| Event | Description |
|-------|-------------|
| `beforePost` | Fired before payload is sent to SAP |
| `afterPost` | Fired after successful posting |
| `onError` | Fired on posting failure |

---

### `bridge.getHealth()`

Returns bridge health status, connection pool info, and request metrics (success rate, avg/p99 latency, IDocs processed).

---

### `bridge.getAuditLog()`

Returns the full RFC call log for debugging and compliance review.

---

### `bridge.shutdown()`

Disconnects from SAP and releases connection pool resources.

---

## SAP Movement Types

| Constant | Code | Description |
|----------|------|-------------|
| `GOODS_RECEIPT` | `101` | Goods receipt from purchase order |
| `GOODS_ISSUE` | `201` | Goods issue to cost center |
| `TRANSFER_POST` | `301` | Transfer posting plant-to-plant |
| `STOCK_ADJUST_POS` | `561` | Initial entry / positive adjustment |
| `STOCK_ADJUST_NEG` | `562` | Negative adjustment |
| `RETURN_VENDOR` | `122` | Return delivery to vendor |
| `SCRAP` | `551` | Scrapping |

Access via `WalmartSAPBridge.MOVEMENT_TYPES`.

---

## SAP Return Codes

| Code | Type | Meaning |
|------|------|---------|
| `000` | S (Success) | Document posted successfully |
| `001` | W (Warning) | Document posted with warnings |
| `100` | E (Error) | Duplicate IDoc number |
| `201` | E (Error) | Material master not found |
| `302` | E (Error) | Plant locked for posting |
| `401` | A (Abort) | Authorization failure |
| `500` | X (Exception) | System exception |

Access via `WalmartSAPBridge.RETURN_CODES`.

---

## Validation

All payloads are validated before reaching SAP. Validation errors return a structured error object:

```javascript
{
  error: 'VALIDATION_ERROR',
  code: 'WMT-SAP-400',
  message: 'Payload validation failed',
  details: [
    { field: 'storeId', code: 'FORMAT', message: 'storeId must be 4-6 digits' }
  ]
}
```

---

## Demo Notes (Monday 2026-03-23)

- Use `environment: 'staging'` for the demo
- The mock SAP client simulates realistic latency ranges per environment
- All transaction IDs follow the format `SAP-WMT-YYYYMMDD-xxxxxxxx`
- Material documents are 10-digit numbers prefixed with `49`
- IDoc numbers are 10-digit random values
- The audit log captures every BAPI call for live demo walkthrough
- Health endpoint shows live metrics that update in real-time during the demo

---

## File Location

```
src/integrations/walmart-sap-bridge.js
```
