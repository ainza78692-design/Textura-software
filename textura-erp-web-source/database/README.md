# Database

This folder contains PostgreSQL scripts for the centralized server database.

Apply migrations in order:

```bash
psql "postgresql://invoice_app:password@localhost:5432/textile_invoice" -f database/migrations/001_init_schema.sql
```

Seed scripts are optional. Replace seed password hashes before production use.
