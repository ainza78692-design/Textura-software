# Textura Production Architecture

This runbook is tailored to the current Textura codebase.

## 1. Codebase Summary

Textura currently consists of:

- Desktop/client UI: React 19, TanStack Router/Start, Vite, Tailwind CSS 4, shadcn/Radix-style components.
- Desktop shell: Electron 39 packaged by `electron-builder` as a Windows NSIS installer.
- Backend: Node.js/Express 4 in `backend/`, TypeScript compiled to CommonJS in `backend/dist`.
- Database: PostgreSQL using `pg` connection pooling, SQL migrations in `database/migrations`.
- Auth: JWT bearer tokens, bcrypt password hashes, roles `operator`, `admin`, `management`.
- APIs: `/health`, `/api/auth/*`, `/api/invoices/*`, plus production update endpoints `/updates/*`.
- Storage: PostgreSQL only. This snapshot has no uploaded document binary store and no OCR pipeline.
- Document model: invoice document statuses are workflow rows in `invoice_documents`, not files.
- Logging: Pino HTTP logs to stdout; Windows service manager should redirect stdout/stderr to files.
- Existing backup logic before this runbook: none.
- Existing update flow before this runbook: app version exposed over IPC, but no updater.

Important current gaps:

- No migration tracking existed; `ops/windows/run-migrations.ps1` now records applied SQL files in `schema_migrations`.
- No OCR service is present; plan OCR as a phase 2 service when document ingestion is built.
- Root `src/` is the active desktop/web UI. `frontend/` contains older/migration-era API code.
- The folder is not currently a Git checkout, so CI/CD requires the production server path to be a proper clone.

## 2. Recommended On-Prem Server

Recommended OS: Windows Server 2022 or 2025 Standard.

Reason: Textura targets Windows desktop clients, the build system creates Windows NSIS installers, the office likely already operates Windows endpoints, and PowerShell/Task Scheduler/NSSM are a good fit. Linux is also viable for the backend, but Windows keeps server and desktop release operations together.

Server layout:

```text
D:\Textura\
  app\                  Git checkout
  data\postgres\         PostgreSQL data directory if using dedicated volume
  updates\               latest.json and installer files
  backups\
    daily\
    weekly\
    predeploy\
    archive\
    logs\
  logs\
    backend\
    deploy\
    health\
  rollback\
```

Runtime services:

- PostgreSQL 16 or 17, bound to `127.0.0.1` and the server LAN IP only if required.
- `TexturaBackend` Windows service running `node backend/dist/server.js`.
- Tailscale service for admin VPN.
- GitHub Actions self-hosted runner service with label `textura-production`.
- Optional Caddy or Nginx reverse proxy in front of backend.

Recommended ports:

- `4000/tcp`: Textura API on LAN only, or reverse-proxied by `443/tcp`.
- `5432/tcp`: PostgreSQL local-only. Do not expose to client PCs.
- Tailscale: no inbound public port required.
- `3389/tcp`: RDP only over Tailscale, not public Internet.

## 3. Deployment Model

Client PCs run `Textura ERP.exe`. The app stores the server URL and token in Electron browser storage. On update, local settings survive because NSIS updates the application install, not the user data directory.

Client server runs:

```text
Textura.exe clients -> http(s)://server:4000/api -> Express -> PostgreSQL
```

For production, set `backend/.env`:

```env
NODE_ENV=production
PORT=4000
API_PREFIX=/api
CORS_ORIGIN=http://SERVER_IP:4000,http://SERVER_NAME:4000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=invoice_app
DB_PASSWORD=strong_unique_password
DB_NAME=textile_invoice
DB_SSL=false
JWT_SECRET=64_plus_random_chars
JWT_EXPIRES_IN=8h
BOOTSTRAP_ADMIN_ENABLED=false
UPDATE_DIR=D:\Textura\updates
```

## 4. CI/CD

Workflow added: `.github/workflows/production-deploy.yml`.

Production branch strategy:

- `main`: development/integration.
- `production`: protected branch.
- Require PR review and successful build before merging to `production`.
- Deployment environment requires manual approval for office production.

Self-hosted runner:

- Install on the client server as a Windows service.
- Labels: `self-hosted`, `windows`, `textura-production`.
- Runner account should have permission to restart `TexturaBackend`, run `npm`, `psql`, `pg_dump`, and write `D:\Textura`.

Deployment flow:

1. Checkout production code.
2. Run `npm ci`.
3. Run backend dependency install and `npm run build`.
4. Backup database with `backup-textura.ps1 -Mode predeploy`.
5. Apply migrations in order with schema tracking.
6. Build desktop renderer assets.
7. Restart `TexturaBackend`.
8. Verify `/health`.

Rollback:

- Code rollback: redeploy previous GitHub release/commit.
- Database rollback: restore latest predeploy `.dump` only when the migration cannot be forward-fixed.
- Installer rollback: publish an older installer with a higher emergency version or use the archived installer manually.
- Update rollback: keep the previous installer in `D:\Textura\rollback` and include it in the manifest as `previousInstallerUrl`.

## 5. Desktop Auto-Update

Implemented current-stack updater:

- Backend serves update feed from `UPDATE_DIR`.
- Manifest endpoint: `GET /updates/latest.json`.
- Installer endpoint: `GET /updates/downloads/<installer.exe>`.
- Electron checks shortly after launch and every 6 hours.
- User sees "New update available".
- Installer is downloaded to temp, SHA-256 verified, launched, and app quits.
- Supports optional and mandatory updates with `mandatory` and `minSupportedVersion`.
- Failed updates write `textura-update-failure.json` under Electron `userData`.
- Failed updates show rollback details when `previousInstallerUrl` exists.

Manifest shape:

```json
{
  "version": "0.1.1",
  "mandatory": false,
  "minSupportedVersion": "0.1.0",
  "installerUrl": "/updates/downloads/Textura ERP Setup 0.1.1.exe",
  "sha256": "lowercase_sha256",
  "previousVersion": "0.1.0",
  "previousInstallerUrl": "/updates/downloads/Textura ERP Setup 0.1.0.exe",
  "previousSha256": "lowercase_previous_sha256",
  "releaseNotes": "Fixes invoice export and improves search.",
  "publishedAt": "2026-05-27T00:00:00.000Z"
}
```

Generate it after building the installer:

```powershell
.\ops\windows\generate-update-manifest.ps1 `
  -InstallerPath ".\release\electron\Textura ERP Setup 0.1.1.exe" `
  -Version "0.1.1" `
  -UpdateDir "D:\Textura\updates" `
  -PreviousVersion "0.1.0" `
  -PreviousInstallerPath "D:\Textura\rollback\Textura ERP Setup 0.1.0.exe" `
  -ReleaseNotes "Production maintenance release"
```

Local updater test:

```powershell
npm run desktop:test-updater
```

This test creates a local update feed, verifies that the update prompt path is reached, downloads a dummy installer, validates SHA-256, verifies installer launch handoff through a shell mock, then verifies checksum-failure handling and rollback messaging. A final physical Windows client test is still required before office rollout because only a real PC can prove NSIS replacement, UAC behavior, antivirus interaction, and app restart behavior.

Code-signing recommendation:

- Buy an OV/EV code-signing certificate.
- Enable `signAndEditExecutable`.
- Keep SHA-256 manifest verification even after signing.

## 6. Backup And Retention

Implemented scripts:

- `ops/windows/backup-textura.ps1`: `pg_dump --format=custom`, compression, verification list, metadata hash.
- `ops/windows/restore-db.ps1`: restores a selected `.dump`.
- `ops/windows/apply-retention.ps1`: daily/weekly/predeploy cleanup and archive handling.
- `ops/windows/install-scheduled-tasks.ps1`: installs Task Scheduler jobs.

Recommended schedule:

- Daily backup at 02:00.
- Weekly full backup at 03:00 Sunday.
- Retention cleanup at 04:00.
- Copy weekly backups to external encrypted disk or NAS.
- Copy monthly archive off-site.

Retention:

- Daily: keep 14 days.
- Weekly: keep 90 days.
- Predeploy: keep 30 days.
- Archive: move long-term backups after 1 year; keep archive for 7 years unless client policy says otherwise.

Current Textura has no binary document store. When OCR/file uploads are added, back up that storage root with the same schedule and record file hashes.

## 7. Security Hardening

Required:

- Tailscale VPN for all admin access.
- PostgreSQL not exposed publicly.
- RDP/SSH allowed only from Tailscale IP range.
- Windows Firewall allows Textura API only from office LAN and Tailscale admin subnet.
- Backend `.env` ACL restricted to Administrators and service account.
- `BOOTSTRAP_ADMIN_ENABLED=false` after first admin creation.
- Strong `JWT_SECRET`, rotated on credential compromise.
- Least-privilege PostgreSQL user for app runtime.
- Separate PostgreSQL admin credentials for maintenance only.
- Signed installer and checksum manifest.
- GitHub branch protection and environment approval.

Tailscale admin model:

- Server joins tailnet as `textura-client-server`.
- Admin laptops join tailnet with MFA.
- Use Tailscale ACLs to allow only admins to RDP, access logs, and run deployment troubleshooting.
- No public database or backend admin port.

## 8. Monitoring

Minimum monitoring:

- `/health` every 1-5 minutes.
- Windows service state for `TexturaBackend`.
- PostgreSQL service state.
- Disk free space on OS, data, and backup volumes.
- Backup success logs.
- Deployment logs.
- Windows Event Viewer forwarding if available.

Added script:

```powershell
.\ops\windows\health-check.ps1 -HealthUrl "http://127.0.0.1:4000/health"
```

Phase 2 monitoring:

- Prometheus/Grafana or Netdata on the server.
- Loki or a simple log shipper for Pino logs.
- Email/SMS alerts for failed backups, low disk, service down.

## 9. Phase Plan

Phase 1 essentials:

- Put production server folder under Git.
- Install PostgreSQL, Node.js 22 LTS, Git, Tailscale, NSSM, GitHub runner.
- Configure `backend/.env`.
- Install `TexturaBackend` as a Windows service.
- Run migrations.
- Install scheduled backup/retention tasks.
- Enable GitHub protected `production` branch.
- Publish first signed installer/update manifest.
- Validate client PC connection and updater.

Phase 2 improvements:

- Add OCR/document upload service when business flow is ready.
- Add file/object storage root with antivirus scanning.
- Add structured audit logs for auth events, exports, deletes, and admin actions.
- Add Prometheus metrics endpoint.
- Add refresh-token/session revocation.
- Add database migration tool in Node or Prisma/Drizzle-style migration framework.
- Add reverse proxy TLS with internal CA certificate.
- Add off-site immutable backup storage.
