# Migration Recap: Render → GCE

**Completed:** 2026-06-02
**Status:** Production — Vercel frontend now talks to GCE-hosted API. Render still up as a fallback for the 7-day soak.

This document is a **handoff/runbook**. It captures what's running where, how to deploy, what's still TODO, and what to do when things break. Anyone (human or agent) picking up this codebase should be able to operate the deployment after reading this.

---

## TL;DR

- **API runs on**: GCE `e2-micro` (always-free tier) at `35.253.176.201`, project `life-on-track-497619`, zone `us-central1-a`.
- **Public URL**: `https://life-on-track.duckdns.org` (DuckDNS subdomain → static IP, Let's Encrypt cert).
- **Frontend**: Vercel at `https://life-on-track-client.vercel.app`, env var `VITE_API_URL=https://life-on-track.duckdns.org/api`.
- **Database**: Unchanged — Turso (`libsql://life-track-db-yuyuvvall.aws-eu-west-1.turso.io`).
- **Deploy**: `.\deploy\update-server.ps1` from **PowerShell** on Windows. (Bash version exists but is broken on this developer's Git Bash — see Known Issues.)
- **Cost**: $0/month (GCE always-free + DuckDNS + Let's Encrypt + Vercel hobby + Turso free tier).

---

## Architecture

```
Browser ──HTTPS──> Vercel (life-on-track-client.vercel.app, static React build)
                        │ XHR ──> https://life-on-track.duckdns.org/api/*
                        ▼
                  DuckDNS DNS ──> 35.253.176.201
                                       │
                                  GCE e2-micro (Debian 12)
                                       │
                                  nginx :443 (Let's Encrypt cert)
                                       │ proxy_pass
                                  node :3001 (systemd: life-on-track-api)
                                       │
                                  libsql client ──> Turso (eu-west-1)
```

Vercel is unchanged from before migration (same project, same custom domain). Only the API target moved.

---

## GCP infrastructure

| Resource | Value |
|---|---|
| Project ID | `life-on-track-497619` |
| Project name | "Life On Track" |
| Owner account | `yuval.yak1603@gmail.com` |
| VM instance name | `life-on-track-api` |
| Zone | `us-central1-a` |
| Machine type | `e2-micro` (0.25 vCPU burstable to 2, 1 GB RAM) |
| OS | Debian 12 (bookworm), kernel 6.1 |
| Disk | 30 GB pd-standard |
| Static IP | `35.253.176.201` (reserved, attached to instance) |
| Network tags | `http-server`, `https-server` (open 80/443 from anywhere) |
| Internal IP | `10.128.0.2` |
| Status | RUNNING (24/7, no sleep — that was the whole point) |

**Free-tier status**: GCE always-free includes 1× `e2-micro` per project in `us-west1`/`us-central1`/`us-east1`, 30 GB standard disk, 1 GB egress. We're well under all limits.

**To access:**
```powershell
# From the laptop (requires gcloud authed to yuval.yak1603@gmail.com, project life-on-track-497619):
gcloud compute ssh life-on-track-api --tunnel-through-iap

# Or from browser SSH in GCP console: Compute Engine → VM instances → click life-on-track-api → SSH
```

---

## VM internals

### Service user
- Username: `auditor` (uid 999, gid 994)
- Home: `/home/auditor`
- Created during initial bootstrap (Phase 2 of original PLAN.md)
- All app processes run as this user, not root.

### App directory
- Path: `/home/auditor/app`
- Cloned from: `https://github.com/yuyuvvall/life-on-track.git` (origin/main)
- Updated by deploys via tarball overlay (NOT `git pull`) — see Deploy section
- `.git` is present (left over from initial bootstrap clone) but deploys don't use it

### systemd unit
- File: `/etc/systemd/system/life-on-track-api.service`
- Enabled at boot
- Contents (canonical version after we fixed the broken line continuations during bootstrap):

```ini
[Unit]
Description=Life on Track API
After=network.target

[Service]
Type=simple
User=auditor
WorkingDirectory=/home/auditor/app/server
EnvironmentFile=/home/auditor/app/server/.env.production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- Commands:
  - `sudo systemctl status life-on-track-api`
  - `sudo systemctl restart life-on-track-api`
  - `sudo journalctl -u life-on-track-api -n 50 --no-pager` (recent logs)
  - `sudo journalctl -u life-on-track-api -f` (tail logs)

### Env file
- Path: `/home/auditor/app/server/.env.production`
- Permissions: `600`, owner `auditor:auditor`
- Loaded by systemd `EnvironmentFile=` directive (vars injected into process env before node starts)
- Current keys (values redacted):
  - `DATABASE_URL=libsql://life-track-db-yuyuvvall.aws-eu-west-1.turso.io`
  - `DATABASE_AUTH_TOKEN=<turso token>`
  - `CORS_ORIGIN=` (empty → server defaults to `*`)
- **NOT** set but probably should be:
  - `NODE_ENV=production` (cosmetic — only affects one log line in `server/src/index.ts`)
  - `CORS_ORIGIN=https://life-on-track-client.vercel.app` (cutover works because of `*` fallback; tightening is a TODO)

### nginx
- Installed via apt (`nginx 1.22.x` on Debian 12)
- Config: `/etc/nginx/sites-available/api`, symlinked to `/etc/nginx/sites-enabled/api`
- Default site (`/etc/nginx/sites-enabled/default`) was removed
- Proxies `:80` and `:443` → `127.0.0.1:3001`
- certbot's nginx plugin added the `:443 ssl` server block and HTTP→HTTPS redirect during cert installation
- Reload: `sudo nginx -t && sudo systemctl reload nginx`

### Let's Encrypt cert
- Domain: `life-on-track.duckdns.org`
- Email registered: `yuval.yak1603@gmail.com`
- Cert location: `/etc/letsencrypt/live/life-on-track.duckdns.org/`
- Initial expiry: 2026-08-31
- Auto-renewal: `certbot.timer` systemd unit (runs twice daily, renews when <30 days remain)
- Verify timer: `sudo systemctl list-timers | grep certbot`
- Manual renewal: `sudo certbot renew` (dry-run: `sudo certbot renew --dry-run`)

### Firewall (GCP-side, not iptables on the VM)
- Default project firewall rules allow:
  - `tcp:22` from anywhere (for SSH and IAP)
  - `tcp:80` from anywhere (because VM has `http-server` tag)
  - `tcp:443` from anywhere (because VM has `https-server` tag)
- Port `3001` is NOT publicly open — only `127.0.0.1:3001` is reachable, nginx proxies it.
- IAP tunneling works (used by `gcloud compute ssh --tunnel-through-iap` and by the deploy script).

---

## DNS

- Provider: **DuckDNS** (free forever, no payment, no auto-renew, no domain ownership)
- Subdomain: `life-on-track.duckdns.org`
- Points at: `35.253.176.201` (the static IP)
- Account: signed in via Google as `yuval.yak1603@gmail.com`
- Dashboard: https://www.duckdns.org
- If the IP ever changes, manually update via the DuckDNS dashboard OR use their update API with the account's token. (Static IP makes this a non-issue for now.)

---

## Deploy pipeline

### Scripts in the repo
- `deploy/update-server.ps1` — **PowerShell, laptop-side orchestrator (the working one)**
- `deploy/update-server.sh` — bash equivalent, broken in this dev's Git Bash (see Known Issues). Kept for portability / a teammate on Mac/Linux could use it.
- `deploy/deploy-update.sh` — runs ON the VM, scp'd by the orchestrator each deploy

### How a code-only deploy works
1. Developer edits server code locally
2. Runs `.\deploy\update-server.ps1` from PowerShell at the repo root
3. Script:
   - `npm run build --workspace=server` (builds `server/dist/`)
   - tars `dist + package.json` → `%TEMP%\life-on-track-server-bundle.tgz`
   - scp's bundle to `vm:/tmp/server-bundle.tgz` (via IAP tunnel)
   - scp's `deploy/deploy-update.sh` to `vm:/tmp/deploy-update.sh`
   - **Prompts** `Allow? [y/N]` once before the destructive step
   - ssh's into the VM and runs `sudo bash /tmp/deploy-update.sh`
4. VM-side (`deploy-update.sh`):
   - Untars over `/home/auditor/app/server/{dist,package.json}` as user `auditor`
   - Runs `npm install --omit=dev` in `server/` as `auditor` (creates/updates `server/node_modules`)
   - `systemctl restart life-on-track-api`
   - Smoke-tests `http://127.0.0.1:3001/api/health` up to 30 times (1s apart) — gives the node app ~30s to finish initializing (Turso schema check takes ~10s)
   - Cleans up `/tmp/server-bundle.tgz` and `/tmp/deploy-update.sh`
5. Laptop-side cleanup: removes the local tarball.

### How an env refresh deploy works (`-RefreshEnv`)
1. Developer edits `server/.env.production` locally (gitignored)
2. `gcloud secrets versions add life-on-track-server-env --data-file=server\.env.production` — pushes a new version to Secret Manager
3. `.\deploy\update-server.ps1 -RefreshEnv` — same as code deploy PLUS:
   - Fetches the latest secret value via `gcloud secrets versions access`
   - scp's it to `vm:/tmp/env.tmp`
   - ssh-moves it to `/home/auditor/app/server/.env.production`, chowns to auditor, chmods 600

> **NOTE — Secret Manager not yet seeded.** The `-RefreshEnv` flag will fail until someone runs `gcloud secrets create life-on-track-server-env --replication-policy=automatic` + the first `gcloud secrets versions add`. This is intentional — we deferred it because cutover worked without tightening CORS.

### Override args
- `.\deploy\update-server.ps1 -Name X -Zone Y` — target a different instance/zone (currently only one VM exists)

---

## Secrets / env vars

| Variable | Where set | Current value | Notes |
|---|---|---|---|
| `DATABASE_URL` | VM `.env.production` | `libsql://life-track-db-yuyuvvall.aws-eu-west-1.turso.io` | Turso instance, eu-west-1 |
| `DATABASE_AUTH_TOKEN` | VM `.env.production` | (redacted) | Turso auth token, copied over from Render |
| `CORS_ORIGIN` | VM `.env.production` | empty → `*` fallback in code | TODO: tighten to Vercel URL |
| `PORT` | (not set) | defaults to `3001` in code | nginx hardcoded to proxy `:3001` |
| `NODE_ENV` | (not set) | defaults to `development` in log line | Purely cosmetic |
| `VITE_API_URL` | **Vercel** project settings | `https://life-on-track.duckdns.org/api` | Updated during cutover, triggered Vercel redeploy |

To inspect the live env on the VM (without leaking values):

```bash
sudo grep -oE '^[A-Z_]+=' /home/auditor/app/server/.env.production
```

To edit by hand (quick path, no Secret Manager round-trip):

```bash
sudo nano /home/auditor/app/server/.env.production
sudo systemctl restart life-on-track-api
```

---

## Known issues / gotchas

### 1. Git Bash + gcloud SSL clash on Windows
**Symptom**: From Git Bash on this developer's Windows machine, every `gcloud` call hitting `*.googleapis.com` fails with:
```
[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1002 or 1006)
```
**Tried unsuccessfully**:
- `unset SSL_CERT_FILE SSL_CERT_DIR REQUESTS_CA_BUNDLE CURL_CA_BUNDLE`
- `gcloud config set core/custom_ca_certs_file` to Git Bash's `ca-bundle.crt` and to a fresh Mozilla bundle
- `CLOUDSDK_PYTHON=` set to the user's `C:\Users\igory\AppData\Local\Programs\Python\Python311\python.exe` (real, non-sandboxed Python)
- Default Python in gcloud info: Microsoft Store Python (`PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0`) — sandboxed, can't read Program Files. This was the initial suspect but switching Pythons didn't help, suggesting deeper trust-store mismatch (possibly AV/MITM, never confirmed).

**Workaround**: Use **PowerShell**, where gcloud works fine. The deploy is fully usable from PowerShell via `.\deploy\update-server.ps1`.

**Bash script `update-server.sh` is kept in the repo** as a portable fallback for Mac/Linux contributors. It does the same thing as the PS1, modulo the SSL issue.

### 2. systemd `Type=simple` means "active" ≠ "ready"
The service is `Type=simple`, so `systemctl restart` returns as soon as `/usr/bin/node` is fork-exec'd — NOT when the app is actually listening on `:3001`. The app needs ~10s to:
- Connect to Turso
- Run 27 schema-init statements
- Seed/backfill categories
- Bind to port 3001

The smoke test in `deploy-update.sh` retries up to 30 times (1s apart) to cover this. If you see the deploy fail with "Health check failed" but the service is running, increase the retry count.

Long-term fix: change to `Type=notify` and have the app call `sd_notify(0, "READY=1")` after `app.listen` succeeds. Not done yet.

### 3. Workspace lockfile not used on the VM
`npm install --omit=dev` runs in `server/` on the VM without a lockfile (the repo's `package-lock.json` is at the root and covers all workspaces). This means deps on the VM aren't strictly pinned. Drift between deploys is possible but unlikely with semver-pinned deps. Upgrade path (if drift becomes a real issue):
- Add `cd server && npm install --package-lock-only --omit=dev` to the deploy script (generates a throwaway lockfile)
- Include the lockfile in the tarball
- VM uses `npm ci --omit=dev` instead of `npm install`

### 4. dotenv path vs systemd
The server uses `import 'dotenv/config'` which loads `.env` (not `.env.production`). On the VM, `.env` doesn't exist — but it doesn't matter because systemd `EnvironmentFile=` injects vars into the process env BEFORE node starts. So `process.env.DATABASE_URL` etc. are already set when dotenv runs (dotenv silently does nothing because there's no `.env` file). Works, but counterintuitive. Don't add a `.env` to the VM — it'd override the EnvironmentFile-injected vars.

### 5. PowerShell `curl` is `Invoke-WebRequest`
On Windows, `curl` is aliased to `Invoke-WebRequest`. It prompts a security warning the first time. The user typed `y` each time. It also auto-follows redirects, which makes the HTTP→HTTPS redirect test indistinguishable from a direct HTTPS hit. Not a problem, just a quirk to remember.

---

## Outstanding work / followups

### Phase 5 status: DONE
Vercel `VITE_API_URL` updated to point at GCE. Frontend exercising the new API live in production. CORS_ORIGIN not yet tightened (still `*`).

### Phase 6 — Cleanup (after 7-day soak, ~2026-06-09)
Currently in the repo (TO DELETE):
- `render.yaml` — Render Blueprint config
- `server/railway.json` — Railway config
- `server/Procfile` — Procfile (Heroku-style)

Single PR titled something like `chore(deploy): remove Render/Railway configs after GCE migration`.

Also during cleanup:
- Pause/delete the Render service in the Render dashboard
- Update or create a top-level `DEPLOYMENT.md` summarizing the current setup (this file is a great starting point)

### Hardening TODOs (optional, not blocking)
1. **Tighten CORS_ORIGIN** to `https://life-on-track-client.vercel.app` (no trailing slash). Currently `*`. Requires either the quick manual edit or the proper Secret Manager flow.
2. **Add `NODE_ENV=production`** to the env file. Purely cosmetic but tidier.
3. **Seed Secret Manager** with current env values so `-RefreshEnv` works for future rotations.
4. **Sudoers entry** for `auditor` to restart the service without root (`auditor ALL=(root) NOPASSWD: /bin/systemctl restart life-on-track-api`). Currently the deploy script runs `sudo bash` so we don't need this, but it'd allow finer-grained future scripts.
5. **Restrict SSH firewall** from `0.0.0.0/0` to either the developer's IP or only the IAP range `35.235.240.0/20`. Defense-in-depth.
6. **Add monitoring** — UptimeRobot free tier can ping `/api/health` every 5 min and email on downtime.
7. **Multi-origin CORS** — if you want to hit the prod API from a local `npm run dev` session, the server code at `server/src/index.ts:24` needs to parse `CORS_ORIGIN` as a comma-separated list. Trivial change, deferred until needed.

---

## Disaster recovery

### The VM dies / is deleted
All app state lives in Turso. No data to back up from the VM. To rebuild:
1. Create a new `e2-micro` in `life-on-track-497619` project, us-central1 zone
2. Re-run the bootstrap from `PLAN.md` Phase 2 (install Node 20, create auditor user, clone repo, write `.env.production`, install systemd unit, install nginx, install certbot)
3. Update DuckDNS A record to the new static IP (or re-reserve the old IP if not released)
4. Total recovery time: ~20 minutes if you follow PLAN.md step by step
5. The deploy script keeps working unchanged once the VM is back

### The cert expires (auto-renewal failed)
- Check `sudo systemctl status certbot.timer`
- Manual renew: `sudo certbot renew`
- Manual cert request: `sudo certbot --nginx -d life-on-track.duckdns.org --non-interactive --agree-tos -m yuval.yak1603@gmail.com`

### The DuckDNS account is locked / lost
DuckDNS is the only thing that'd need a rebuild outside GCE. Migration path:
- Buy a real domain ($10/yr from Porkbun/Cloudflare Registrar with auto-renew off)
- Point it at `35.253.176.201`
- Update the certbot domain: `sudo certbot --nginx -d <new-domain> --expand`
- Update nginx config `server_name` line
- Update Vercel `VITE_API_URL` and server `CORS_ORIGIN`

### gcloud auth lost on laptop
- `gcloud auth login` (browser opens, sign in as `yuval.yak1603@gmail.com`)
- `gcloud config configurations activate life-on-track` (or recreate if config is gone)
- `gcloud config set project life-on-track-497619`

### Deploy script breaks (regression)
- Worst case: SSH to VM, manually overwrite `server/dist/` and `server/package.json` from a local build, `npm install --omit=dev`, restart service. Slow but reliable fallback.
- Or `cd /home/auditor/app && sudo -u auditor git pull && cd server && sudo -u auditor bash -c "npm install && npm run build" && sudo systemctl restart life-on-track-api` — manual "build on VM" emergency path. Caveat: OOM risk on the 1GB box.

---

## Costs (annualized)

| Item | Cost |
|---|---|
| GCE e2-micro 30 GB | $0 (always-free tier) |
| Static external IP | $0 (free while attached to running VM) |
| GCE egress | $0 (1 GB/mo allowance; usage is well under) |
| Cloud Storage / Secret Manager | $0 (under free tier) |
| DuckDNS | $0 (free forever) |
| Let's Encrypt cert | $0 (free, auto-renews) |
| Vercel | $0 (hobby plan) |
| Turso | $0 (free tier) |
| **Total** | **$0 / month** |

Safety budget alert on GCP: set to $1 (so any anomaly notifies before becoming a bill).

---

## File map (where to look when you need to change something)

| What | Where |
|---|---|
| Deploy script (laptop, Windows) | `deploy/update-server.ps1` |
| Deploy script (laptop, bash — currently unused) | `deploy/update-server.sh` |
| Deploy script (VM-side) | `deploy/deploy-update.sh` |
| Server entry / health endpoint | `server/src/index.ts` |
| Server CORS config | `server/src/index.ts:23-27` |
| Turso connection | `server/src/db/index.ts` |
| Original migration plan | `plans/migrate-to-gce-2026-05-27/PLAN.md` |
| Deploy-script design plan | `plans/migrate-to-gce-2026-05-27/UPDATE-SERVER-SCRIPT.md` |
| This handoff doc | `plans/migrate-to-gce-2026-05-27/SUMMARY.md` |
| Legacy Render config (TO DELETE post-soak) | `render.yaml` |
| Legacy Railway config (TO DELETE post-soak) | `server/railway.json` |
| Legacy Procfile (TO DELETE post-soak) | `server/Procfile` |

On the VM, the corresponding paths:

| What | Where |
|---|---|
| App root | `/home/auditor/app` |
| Server entry (deployed) | `/home/auditor/app/server/dist/index.js` |
| Env file | `/home/auditor/app/server/.env.production` |
| systemd unit | `/etc/systemd/system/life-on-track-api.service` |
| nginx site config | `/etc/nginx/sites-available/api` (symlinked into `sites-enabled`) |
| Let's Encrypt certs | `/etc/letsencrypt/live/life-on-track.duckdns.org/` |
| Service logs | `journalctl -u life-on-track-api` |

---

## Day-to-day flow (the happy path)

1. Edit code in `server/`.
2. From PowerShell at repo root: `.\deploy\update-server.ps1`.
3. Type `y` at the one prompt.
4. Wait ~30s. Look for `[OK] Deploy complete`.
5. `curl https://life-on-track.duckdns.org/api/health` to confirm.

That's it. The browser-facing app (Vercel) automatically uses the new code because it just calls the same DuckDNS URL.
