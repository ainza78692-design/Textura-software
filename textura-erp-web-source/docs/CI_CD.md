# Production CI/CD

## Repository Findings

Textura is a Windows-oriented client/server application:

- The active client is the root React 19 application in `src/`, using TanStack Router,
  TanStack Query, Vite, Tailwind CSS 4, Radix UI, and Excel import/export.
- Electron 39 can package the client as a Windows NSIS installer, but that client artifact is
  intentionally outside this GitHub/server deployment pipeline.
- `backend/` is a Node.js 22, Express 4, TypeScript API compiled to CommonJS.
- PostgreSQL is the only persistent application data store.
- `database/migrations/` contains ordered SQL migrations.
- `frontend/` is migration-era shared API/type code; it is not the active UI.
- There is no Docker or Kubernetes configuration, and production remains non-containerized.
- Existing PowerShell scripts already cover database backup, restore, retention, migrations,
  and health checks.
- Automated test coverage is limited. This production pipeline runs backend workflow-status unit
  tests; broader API/integration coverage should be added.

## Strict Client Artifact Boundary

The production CI/CD pipeline is **backend-only**.

It must not:

- build Electron installers,
- upload `.exe` files to GitHub artifacts or releases,
- upload desktop renderer bundles to GitHub artifacts,
- copy client files to the company server,
- publish desktop update manifests from this workflow,
- use the server as a client installer/update host.

The Electron `.exe` is a client-side distribution concern and must be handled manually or through a
separate private process that you explicitly approve later. This workflow packages only:

- `backend/dist`,
- `backend/package.json`,
- `backend/package-lock.json`,
- `database/migrations`.

The production self-hosted runner uses sparse checkout for `ops/windows` only. The server runner
does not receive the full frontend/Electron source tree from the deploy job, and the release ZIP
does not contain client assets.

## Selected Deployment Architecture

Production uses blue-green backend deployment on one Windows company server:

```text
Electron clients
  -> stable server URL :4000
  -> Caddy service: TexturaProxy
       -> blue API service:  TexturaBackendBlue  on 127.0.0.1:4101
       -> green API service: TexturaBackendGreen on 127.0.0.1:4102
  -> PostgreSQL on localhost:5432
```

Caddy is selected because it provides a stable endpoint and atomic configuration reloads on
Windows without introducing Docker. NSSM manages Caddy and both Node.js backend slots as Windows
services.

Each deployment installs into a new immutable directory:

```text
D:\Textura\
  config\backend.env
  releases\<commit>\
  state\deployment.json
  proxy\Caddyfile
  proxy\active-backend.caddy
  backups\
  logs\
```

Configuration, PostgreSQL data, backups, and logs are outside release directories and survive every
deployment. Client installers and client update files are not stored here by this CI/CD pipeline.

## Availability And Cutover

The deployment script:

1. Extracts the validated CI artifact into a new release directory.
2. Copies the server-owned `config\backend.env` into the release.
3. Installs production-only backend dependencies.
4. Creates and verifies a predeploy PostgreSQL backup.
5. Applies pending tracked migrations.
6. Configures and starts the inactive NSSM slot.
7. Checks the inactive slot directly through `/health/ready`.
8. Atomically changes Caddy to the healthy slot and reloads Caddy.
9. Verifies the public endpoint returns the expected release and slot.
10. Keeps the previous slot alive for a drain period, then stops only that old slot.

The public URL never changes. Existing clients continue using the old slot until the proxy
cutover, so normal deployments have little to no interruption.

## Automatic Rollback

The active slot is not stopped until the new slot passes both direct and public health checks.

If public verification fails after cutover, the deployment script:

- starts or retains the previous service,
- rewrites the Caddy upstream to the previous slot,
- reloads Caddy,
- verifies the restored public health endpoint,
- stops the failed new slot,
- fails the GitHub Actions job.

If dependency installation, backup, migration, service startup, or direct health checking fails,
traffic is never switched.

Database migrations are not automatically reversed. Automatic database restoration while users
are writing data can lose valid production transactions. Every migration must therefore use the
expand/contract pattern and remain backward-compatible with the previous backend release. A
predeploy backup is retained for an operator-approved disaster restore.

## GitHub Actions Behavior

Workflow: `.github/workflows/production-deploy.yml`

- Pull requests to `main` or `production`: validation only.
- Pushes to `main`: validation only.
- Pushes to `production`: validation, immutable artifact creation, environment approval, and
  blue-green production deployment.
- Manual runs are supported through `workflow_dispatch`.
- Production deployment concurrency is serialized.
- Deployment logs are uploaded as GitHub artifacts.
- A webhook notification is sent when configured.

Validation includes:

- locked backend dependency installation with `npm ci`,
- critical backend production dependency audit,
- backend final-status unit tests,
- backend TypeScript build,
- backend release packaging.

Frontend/client validation should be added in a separate non-deploying workflow if desired. It
must not publish `.exe` or desktop bundles as artifacts unless you explicitly approve a separate
client distribution process.

The server deploys only the backend API. Desktop installer publishing remains a separate client
process and is intentionally not implemented here.

## GitHub Configuration

Create a GitHub Environment named `production`.

Recommended protection:

- required approver from operations or engineering,
- deployment branch restricted to `production`,
- protected `production` branch,
- required `validate` job,
- at least one pull-request approval,
- no direct force pushes.

Repository or environment variables:

| Variable | Required | Example |
| --- | --- | --- |
| `TEXTURA_INSTALL_ROOT` | No | `D:\Textura` |
| `TEXTURA_PUBLIC_HEALTH_URL` | No | `http://127.0.0.1:4000/health/ready` |

GitHub secrets:

| Secret | Required | Purpose |
| --- | --- | --- |
| `TEXTURA_DEPLOY_WEBHOOK_URL` | No | Teams/Slack-compatible deployment notification webhook |

Database passwords and JWT secrets are deliberately not GitHub Secrets in this design. They remain
only in `D:\Textura\config\backend.env` on the server. This reduces credential movement through CI
and prevents releases from overwriting production configuration.

No Electron signing, installer publishing, or desktop release secret is required for this backend
pipeline.

## Self-Hosted Runner

Install the GitHub Actions runner on the production server with labels:

```text
self-hosted
windows
x64
textura-production
```

Runner requirements:

- Windows Server 2022 or 2025.
- Node.js 22 LTS and npm in system `PATH`.
- PostgreSQL client tools (`psql`, `pg_dump`, `pg_restore`) in system `PATH`.
- Caddy and NSSM installed in the paths used by the scripts.
- Network access to GitHub Actions and the npm registry.
- Write permission to `D:\Textura`.
- Permission to control `TexturaBackendBlue`, `TexturaBackendGreen`, and `TexturaProxy`.
- No interactive user login dependency.

Run the runner as a dedicated Windows service account, not an administrator's personal account.
Grant only the filesystem and service-control permissions required above. Restrict RDP access to
Tailscale/VPN administrators.

The Administrator bootstrap creates the three service identities. The runner account should be
allowed to query/reconfigure/start/stop only those services; it does not need general permission
to create arbitrary Windows services.

Do not install a runner from an untrusted public repository on the production server. Pull-request
jobs use GitHub-hosted runners; only the protected production deployment job reaches the
self-hosted runner.

## One-Time Server Setup

Install:

- Node.js 22 LTS
- PostgreSQL 16 or 17 client/server tools
- NSSM under `C:\Program Files\nssm\win64\nssm.exe`
- Caddy under `C:\Program Files\Caddy\caddy.exe`
- GitHub Actions runner as a Windows service

Add PostgreSQL's `bin` directory to the system `PATH`.

From an Administrator PowerShell:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope LocalMachine
cd D:\Textura\bootstrap-repository
.\ops\windows\install-blue-green.ps1 -InstallRoot D:\Textura -StopLegacyBackend
```

`-StopLegacyBackend` is needed only for the one-time transition from a backend directly occupying
port 4000. Future deployments are zero-downtime.

Edit:

```text
D:\Textura\config\backend.env
```

Required production values:

```env
NODE_ENV=production
API_PREFIX=/api
CORS_ORIGIN=https://textura.company.internal
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=invoice_app
DB_PASSWORD=<strong database password>
DB_NAME=textile_invoice
DB_SSL=false
JWT_SECRET=<at least 64 random characters>
JWT_EXPIRES_IN=8h
BOOTSTRAP_ADMIN_ENABLED=false
```

Restrict the file ACL to Administrators and the backend/runner service accounts:

```powershell
icacls D:\Textura\config\backend.env /inheritance:r
icacls D:\Textura\config\backend.env /grant:r `
  "Administrators:(F)" `
  "SYSTEM:(F)" `
  "DOMAIN\TexturaService:(R)"
```

Replace `DOMAIN\TexturaService` with the actual service identity.

For a database that existed before `schema_migrations`, verify its schema matches all current SQL
files, then run exactly once:

```powershell
.\ops\windows\run-migrations.ps1 `
  -AppDir D:\Textura\bootstrap-repository `
  -EnvFile D:\Textura\config\backend.env `
  -BaselineExistingSchema
```

New empty databases do not require baselining.

## First Deployment

1. Push the reviewed commit to the protected `production` branch.
2. Approve the protected `production` GitHub Environment deployment.
3. Confirm the inactive slot becomes healthy.
4. Confirm `D:\Textura\state\deployment.json` records the active release.
5. Verify:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/health/live
Invoke-RestMethod http://127.0.0.1:4000/health/ready
Get-Service TexturaProxy,TexturaBackendBlue,TexturaBackendGreen
```

Only one backend slot is expected to remain running after the drain period.

## Logs And Debugging

Server logs:

```text
D:\Textura\logs\deploy\deploy-*.log
D:\Textura\logs\deploy\deploy-*.json
D:\Textura\logs\backend\blue-stdout.log
D:\Textura\logs\backend\blue-stderr.log
D:\Textura\logs\backend\green-stdout.log
D:\Textura\logs\backend\green-stderr.log
D:\Textura\logs\caddy\access.json
D:\Textura\logs\caddy\service-stdout.log
D:\Textura\logs\caddy\service-stderr.log
```

GitHub retains the deployment transcript/result files for 30 days.

## Monitoring Recommendations

Minimum production monitoring:

- poll `/health/live` every minute,
- poll `/health/ready` every minute and alert after two consecutive failures,
- monitor `TexturaProxy` and the active backend Windows service,
- monitor PostgreSQL service state,
- alert below 20% free disk on app, database, and backup volumes,
- alert on missing daily backup or failed backup transcript,
- centralize Caddy and Pino logs,
- track API latency and HTTP 5xx rate from Caddy JSON logs,
- perform a quarterly restore drill.

Recommended tools are an existing company monitoring platform, or Prometheus/Grafana with a
Windows exporter and a log collector such as Grafana Alloy/Promtail. Keep monitoring agents
separate from the application release directories.
