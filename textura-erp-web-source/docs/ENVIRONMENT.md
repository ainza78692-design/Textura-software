# Environment

## Backend

Create `backend/.env` from `backend/.env.example`.

```env
NODE_ENV=production
PORT=4000
API_PREFIX=/api
CORS_ORIGIN=http://CLIENT_OR_FRONTEND_HOST

DB_HOST=SERVER_DB_HOST
DB_PORT=5432
DB_USER=invoice_app
DB_PASSWORD=strong_password
DB_NAME=textile_invoice
DB_SSL=false

JWT_SECRET=long_random_secret_at_least_64_characters
JWT_EXPIRES_IN=8h
BOOTSTRAP_ADMIN_ENABLED=false
```

Only the backend should know database credentials and `JWT_SECRET`.

## Frontend / Electron Desktop Client

Create frontend environment config from `frontend/.env.example`.

```env
VITE_API_BASE_URL=http://SERVER_IP_OR_DOMAIN:4000/api
```

When the UI is packaged as an Electron desktop `.exe`, this value must point to the centralized backend server. Users can also change the server URL inside the desktop app; the value is stored in the app's browser storage.

The desktop app does not need database credentials, `JWT_SECRET`, or backend environment variables.

If bootstrap has already closed because users exist, reset or create an admin account from the backend server:

```powershell
cd backend
npm run admin:reset -- --email=admin@example.com --password=StrongPass123 --name="System Administrator"
```

## Desktop Build Toolchain

Electron only requires Node.js and npm on the build machine.

Build the Windows installer from the project root:

```powershell
npm install
npm run desktop:icon
npm run desktop:build
```
