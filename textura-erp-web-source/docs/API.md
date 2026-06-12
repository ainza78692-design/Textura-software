# API

All protected endpoints require:

```http
Authorization: Bearer <jwt>
```

## Auth

`POST /api/auth/bootstrap-admin`

Creates the first admin account. This endpoint works only when `BOOTSTRAP_ADMIN_ENABLED=true` and no users exist yet.

```json
{
  "fullName": "System Administrator",
  "email": "admin@example.com",
  "password": "password123"
}
```

`POST /api/auth/login`

```json
{
  "email": "operator@example.com",
  "password": "password"
}
```

`POST /api/auth/register`

Requires an authenticated admin user. Use the database seed/bootstrap process to create the first admin account.

```json
{
  "fullName": "Operator One",
  "email": "operator@example.com",
  "password": "password123",
  "role": "operator"
}
```

## Invoices

`POST /api/invoices`

Creates an invoice and automatically creates all document rows as `pending`.

```json
{
  "customerName": "Vardhman Textiles",
  "invoiceNumber": "INV-2026-04567",
  "ewayBill": "EWB123",
  "grsNumber": "GRS-2042",
  "poNumber": "PO-7845",
  "countConstruction": "40s / 120x90",
  "mbs": "MBS-312",
  "tcStatus": "Received",
  "remark": "Initial entry",
  "invoiceDate": "2026-05-18"
}
```

`PATCH /api/invoices/:id/documents/:documentCode`

```json
{
  "status": "approved",
  "remark": "Verified"
}
```

`POST /api/invoices/:id/final-submit`

Calculates final status:

- any rejected document -> `rejected`
- all approved documents -> `approved`
- otherwise -> `pending`

The request body is intentionally empty.

## Search

`GET /api/invoices?q=INV-2026&status=pending&customer=Vardhman&limit=50&offset=0`

Supported filters:

- `q`
- `status`
- `customer`
- `document`
- `documentStatus`
- `dateFrom`
- `dateTo`
- `limit`
- `offset`
