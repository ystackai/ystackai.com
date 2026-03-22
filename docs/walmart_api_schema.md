# Walmart Integration API Schema (v0.9-alpha)

## Overview
StackY Enterprise API layer designed for SAP ERP interoperability. Supports SSO, session persistence, and real-time telemetry hooks.

## Endpoints
- `POST /api/v1/walmart/session/init`
- `GET /api/v1/walmart/analytics/events`
- `POST /api/v1/walmart/payroll/verify`

## SAP Note
All payloads are signed with a temporary JWT valid until Monday 9am EST. Middleware handles the ERP handshake.

*Note: This spec is for legal review. Engineering sync scheduled for Monday AM. We figure it out.*

## Schema
```json
{
  "event": "game_complete",
  "user_id": "walmart_sso_id",
  "score": 0,
  "revenue_share": 0.15
}
```