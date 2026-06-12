# Textura Production Checklist

Use this checklist for the first client-server rollout.

## Server Setup

- Install Windows Server 2022/2025.
- Install Node.js 22 LTS, Git, PostgreSQL 16/17, Tailscale, NSSM, and GitHub Actions runner.
- Create `D:\Textura\app`, `D:\Textura\updates`, `D:\Textura\rollback`, `D:\Textura\backups`, and `D:\Textura\logs`.
- Clone the GitHub repository into `D:\Textura\app`.
- Configure `backend\.env` with production database credentials, JWT secret, CORS origins, and `UPDATE_DIR=D:\Textura\updates`.
- Create PostgreSQL database `textile_invoice` and runtime user `invoice_app`.
- Run `ops\windows\run-migrations.ps1`.
- Install `TexturaBackend` as a Windows service running `node backend\dist\server.js`.
- Verify `http://127.0.0.1:4000/health`.

## Secure Access

- Join server to Tailscale.
- Restrict RDP/admin access to Tailscale admins only.
- Keep PostgreSQL private to localhost/server only.
- Allow API port `4000` only from office LAN and admin tailnet, unless using reverse-proxy TLS.
- Disable `BOOTSTRAP_ADMIN_ENABLED` after first admin is created.

## CI/CD

- Ensure the server path is a real Git checkout.
- Install GitHub self-hosted runner with labels `self-hosted`, `windows`, `textura-production`.
- Protect the `production` branch.
- Require approval for the `production` environment.
- Use `.github\workflows\production-deploy.yml` for deployment.

## Backups And Retention

- Run `ops\windows\install-scheduled-tasks.ps1`.
- Confirm daily backups under `D:\Textura\backups\daily`.
- Confirm weekly backups under `D:\Textura\backups\weekly`.
- Confirm predeploy backups before deployments.
- Confirm retention job archives/deletes according to policy.
- Copy weekly/monthly backups to encrypted off-server storage.
- Test restore with `ops\windows\restore-db.ps1` before go-live.

## Desktop Client

- Build installer with `npm run desktop:build`.
- Install `Textura ERP Setup <version>.exe` on one pilot client PC.
- Open Settings and save server URL, for example `http://SERVER_IP:4000`.
- Test login, invoice creation, search, export, and final-submit.
- Test updater with a newer pilot manifest before broad rollout.

## Update Release

- Increment `package.json` version.
- Build installer with `npm run desktop:build`.
- Copy previous installer to `D:\Textura\rollback`.
- Generate manifest with `ops\windows\generate-update-manifest.ps1`.
- Verify `http://SERVER_IP:4000/updates/latest.json`.
- Run `npm run desktop:test-updater` locally.
- Test on one real Windows client PC.
- Roll out to all office PCs after pilot success.

## Recovery

- If backend deployment fails, redeploy previous GitHub commit.
- If migration fails before completion, restore latest predeploy backup.
- If update fails on clients, publish a rollback manifest pointing to the previous installer.
- If server disk fails, reinstall OS/runtime, restore PostgreSQL backup, restore `backend\.env`, restore update installers, and reconnect clients to the same server address.
