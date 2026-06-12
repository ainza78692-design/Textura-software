# Architecture

Textile Flow HQ is being structured as an enterprise client-server workflow system.

```text
Client PCs / future .exe desktop app
  -> HTTP API calls
Centralized backend server
  -> PostgreSQL database on server
```

## Folders

```text
frontend/
  API client, frontend environment config, shared UI-facing types.

backend/
  Express API, authentication, role checks, validation, business services,
  repositories, PostgreSQL connection.

database/
  PostgreSQL migrations, seed scripts, database setup notes.

docs/
  Deployment, environment, and API documentation.
```

The existing React UI currently remains at the project root during migration. It should be moved under `frontend/` after the API-backed flows replace mock data.

## Business Rule Ownership

The backend owns workflow rules:

- New invoice documents default to `pending`.
- Operators/admins can update document statuses before final submit.
- Final status is calculated by the backend on final submit.
- Final status is never accepted from the frontend as user input.
- Audit log records create/update/document/final-submit actions.

## Backend Layers

```text
Route -> Controller -> Service -> Repository -> PostgreSQL
```

Routes handle HTTP shape, controllers parse request/response, services enforce business rules, and repositories contain SQL.
