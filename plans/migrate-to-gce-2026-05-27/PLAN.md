# Migrate Server: Render → Google Compute Engine — Plan

**Date:** 2026-05-27
**Goal:** Move the Express API from Render's/railway free tier (which spins down after ~15 min idle, causing a ~50s cold start) to a Google Compute Engine `e2-micro` VM on the always-free tier. Server runs 24/7, no sleep, $0/month. Deployment is automated via GitHub Actions over SSH.

> Note: the repo also has a legacy `server/railway.json`; this plan retires both Railway and Render configs once GCE is stable.

---

## Why GCE `e2-micro`

| Option | Free | No sleep | Easy deploy | Verdict |
|---|---|---|---|---|
| Render free (current) | ✅ | ❌ (15-min sleep) | ✅ | The problem |
| Cloud Run free | ✅ | ❌ (cold starts) | ✅ | Still has cold starts unless paid |
| **GCE `e2-micro`** | ✅ (forever) | ✅ | ❌ (DIY — this plan fixes that) | Chosen |
| Hetzner CX22 | ❌ (€4/mo) | ✅ | ❌ | Backup if GCE quota is unavailable |

GCE always-free quota: **1× `e2-micro` per project**, only in `us-west1` / `us-central1` / `us-east1`, 30 GB standard persistent disk, 1 GB egress/month (plenty for an API serving one user). 0.25 vCPU burstable to 2, **1 GB RAM** — enough headroom since Turso handles all data and the server is stateless.

**Region tradeoff:** Render is currently in Frankfurt; GCE free-tier regions are US-only. Expect ~100-150ms added latency from Europe. Acceptable for this app (interactive but not real-time); revisit if it feels slow.

## Stack on the VM

- **OS:** Debian 12 (default GCE image, smaller and lighter than Ubuntu)
- **Runtime:** Node.js 20 LTS via NodeSource apt repo
- **Process manager:** `systemd` unit (simpler than pm2, no extra dependency, auto-restart on crash and on boot)
- **TLS:** **Cloudflare proxy** in front of the VM's static IP (default — zero-config TLS, also gives DDoS protection and caching). Alternative: nginx + certbot on the VM if you'd rather not depend on Cloudflare.
- **Deploy:** GitHub Actions workflow on push to `main`, SSH into VM, `git pull` → `npm ci` → `npm run build` → `systemctl restart`.

## Principles

1. **No app code changes.** The server is already env-driven and stateless. Migration is purely operational.
2. **Reversibility.** Render service stays up until GCE is verified for ~7 days. DNS flip is the last step and is instant to roll back.
3. **Secrets stay out of git.** Env vars live in an `EnvironmentFile=` referenced by the systemd unit, written once on the VM by hand. The GH Actions workflow never touches them.
4. **Idempotent provisioning.** Every script in the bootstrap should be safe to re-run.

---

## Phasing

| Phase | Scope | Verification |
|---|---|---|
| **1** | Provision `e2-micro` VM, reserve static IP, configure firewall. | Can SSH in; `curl` from VM works. |
| **2** | Install Node 20, clone repo, build, run server manually under systemd. Set env vars. | `curl http://<static-ip>:3001/api/health` returns `{"status":"ok",...}`. |
| **3** | Put Cloudflare in front (or nginx+certbot if not using CF). Verify HTTPS. | `curl https://api.<your-domain>/api/health` returns OK with a valid cert. |
| **4** | GitHub Actions deploy workflow. Push to `main` triggers SSH-deploy. | A no-op commit redeploys cleanly; logs visible via `journalctl`. |
| **5** | Cut over: update Vercel `VITE_API_URL` and server `CORS_ORIGIN`. Monitor for 7 days. | Frontend hits GCE; Render can be paused. |
| **6** | Cleanup: delete Render service, remove `render.yaml` and `server/railway.json` and `server/Procfile`, update `DEPLOYMENT.md`. | Repo has a single source of truth for deploy. |

One PR for phases 4–6 (everything that touches the repo). Phases 1–3 happen on the GCP console / VM and don't touch the codebase except for the final cleanup.

---

## Phase 1 — Provision the VM

### 1.1 GCP project setup
1. Create a new GCP project (or reuse an existing one) at https://console.cloud.google.com.
2. Enable billing on the project. **Always-free is free even with billing enabled** — billing is required so the account can exist, but you won't be charged as long as you stay within the free tier limits. Set a `$1` budget alert as a safety net.
3. Enable the Compute Engine API.
4. Install `gcloud` locally: https://cloud.google.com/sdk/docs/install (or do everything via the web console — the gcloud commands below are just for reproducibility).

### 1.2 Create the instance

```bash
gcloud compute instances create life-on-track-api \
  --project=<PROJECT_ID> \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=http-server,https-server
```

Free-tier zones: `us-west1-{a,b,c}`, `us-central1-{a,b,c,f}`, `us-east1-{b,c,d}`. Pick whichever is closest to most traffic; `us-central1` is the conventional default.

### 1.3 Reserve a static external IP
An ephemeral IP changes on every stop/start. Reserve a static one — **free while attached to a running VM**, costs ~$3/mo only if unattached.

```bash
gcloud compute addresses create life-on-track-api-ip --region=us-central1
gcloud compute instances delete-access-config life-on-track-api --zone=us-central1-a --access-config-name="External NAT"
gcloud compute instances add-access-config life-on-track-api \
  --zone=us-central1-a \
  --address=$(gcloud compute addresses describe life-on-track-api-ip --region=us-central1 --format='value(address)')
```

### 1.4 Firewall

GCE default firewall rules already allow SSH on port 22 from the entire internet via the `default-allow-ssh` rule. We open 80/443:

```bash
gcloud compute firewall-rules create allow-http-https \
  --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server \
  --source-ranges=0.0.0.0/0
```

We do **not** open 3001 to the public — nginx (or Cloudflare's tunneled traffic) terminates HTTPS on 443 and proxies to 127.0.0.1:3001 inside the VM. If using Cloudflare without a tunnel, 443 is open and Cloudflare's IPs hit it.

### 1.5 SSH access

```bash
gcloud compute ssh life-on-track-api --zone=us-central1-a
```

This auto-generates a key pair on first use and uploads the public key as instance metadata.

---

## Phase 2 — Install runtime, deploy server manually

All commands run as the SSH user on the VM.

### 2.1 System packages

```bash
sudo apt-get update
sudo apt-get install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # expect v20.x
```

### 2.2 Create a service user

Running the API as root is sloppy. Create a dedicated user:

```bash
sudo useradd --system --create-home --shell /bin/bash auditor
sudo -u auditor mkdir -p /home/auditor/app
```

### 2.3 Clone and build

The repo can be public (`https://github.com/...`) or private (deploy key — see Phase 4). For now, assume public:

```bash
sudo -u auditor git clone https://github.com/yuyuvvall/life-on-track.git /home/auditor/app
cd /home/auditor/app
sudo -u auditor npm ci
sudo -u auditor npm run build --workspace=server
```

### 2.4 Env file

```bash
sudo -u auditor tee /home/auditor/app/server/.env.production > /dev/null <<'EOF'
NODE_ENV=production
PORT=3001
DATABASE_URL=libsql://life-track-db-yuyuvvall.aws-eu-west-1.turso.io
DATABASE_AUTH_TOKEN=<paste-from-render-or-regenerate-via-turso-cli>
CORS_ORIGIN=https://<your-app>.vercel.app
EOF
sudo chmod 600 /home/auditor/app/server/.env.production
```

### 2.5 systemd unit

Create `/etc/systemd/system/life-on-track-api.service`:

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

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now life-on-track-api
sudo systemctl status life-on-track-api
journalctl -u life-on-track-api -f  # tail logs
```

### 2.6 Smoke test

From your laptop:
```bash
curl http://<static-ip>:3001/api/health
```
This won't actually work yet because 3001 isn't open in the firewall — that's intentional. SSH-tunnel to verify instead:
```bash
gcloud compute ssh life-on-track-api --zone=us-central1-a -- -L 3001:localhost:3001
# in another terminal:
curl http://localhost:3001/api/health
```

---

## Phase 3 — HTTPS in front

**Default: Cloudflare proxy.** Zero certbot maintenance, free, also gives caching and DDoS protection. Requires a domain (any TLD on Cloudflare). Steps:

1. Add your domain to Cloudflare (free plan).
2. Create an `A` record: `api.<your-domain>` → `<static-ip>`, **proxied (orange cloud)**.
3. In Cloudflare → SSL/TLS → set encryption mode to **Flexible** initially (Cloudflare ↔ origin is plain HTTP, browser ↔ Cloudflare is HTTPS). Upgrade to **Full (strict)** later if you also put certbot on the VM.
4. Install a small nginx on the VM to forward 80 → 3001:

```bash
sudo apt-get install -y nginx
sudo tee /etc/nginx/sites-available/api > /dev/null <<'EOF'
server {
  listen 80 default_server;
  server_name _;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF
sudo ln -sf /etc/nginx/sites-available/api /etc/nginx/sites-enabled/api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

5. Verify: `curl https://api.<your-domain>/api/health` returns OK.
6. Optional hardening: restrict the GCE firewall on port 80 to Cloudflare IP ranges only (https://www.cloudflare.com/ips/) so attackers can't bypass CF by hitting the IP directly.

**Alternative: direct Let's Encrypt** (skip Cloudflare). Same nginx config, plus:
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.<your-domain> --non-interactive --agree-tos -m <your-email>
```
Certbot auto-installs a renewal timer. Cert renews every ~60 days.

---

## Phase 4 — GitHub Actions deploy

### 4.1 Generate a deploy SSH key

On your laptop:
```bash
ssh-keygen -t ed25519 -f gh-deploy-key -N "" -C "github-actions-deploy"
```

Add the **public** key (`gh-deploy-key.pub`) to `/home/auditor/.ssh/authorized_keys` on the VM:
```bash
gcloud compute ssh life-on-track-api --zone=us-central1-a
sudo -u auditor mkdir -p /home/auditor/.ssh
sudo -u auditor chmod 700 /home/auditor/.ssh
echo "ssh-ed25519 AAAA..." | sudo -u auditor tee -a /home/auditor/.ssh/authorized_keys
sudo -u auditor chmod 600 /home/auditor/.ssh/authorized_keys
```

### 4.2 Configure GH repo secrets

In GitHub → repo → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `GCE_HOST` | `<static-ip>` |
| `GCE_USER` | `auditor` |
| `GCE_SSH_KEY` | contents of `gh-deploy-key` (private key, includes `-----BEGIN`/`-----END`) |

### 4.3 Workflow file

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GCE
on:
  push:
    branches: [main]

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.GCE_HOST }}
          username: ${{ secrets.GCE_USER }}
          key: ${{ secrets.GCE_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /home/auditor/app
            git fetch --depth=1 origin main
            git reset --hard origin/main
            npm ci
            npm run build --workspace=server
            sudo /bin/systemctl restart life-on-track-api
            # smoke test
            for i in 1 2 3 4 5 6 7 8 9 10; do
              if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
                echo "Health OK"; exit 0
              fi
              sleep 2
            done
            echo "Health check failed"; exit 1
```

### 4.4 Sudoers entry

So the `auditor` user can restart the service without a password prompt (which would hang the GH Action), add a narrow sudoers rule on the VM:

```bash
echo 'auditor ALL=(root) NOPASSWD: /bin/systemctl restart life-on-track-api' | sudo tee /etc/sudoers.d/auditor-restart
sudo chmod 440 /etc/sudoers.d/auditor-restart
```

### 4.5 Verify

Make a trivial commit on `main` → watch the Actions tab → `journalctl -u life-on-track-api -f` on the VM shows the new boot.

---

## Phase 5 — Cut over

1. Update **Vercel** env var:
   - `VITE_API_URL` = `https://api.<your-domain>/api`
   - Redeploy frontend.
2. Update **server** env on the VM:
   - `CORS_ORIGIN` = `https://<your-app>.vercel.app` (already correct from Phase 2 if you set it then)
   - `sudo systemctl restart life-on-track-api`
3. Verify the app end-to-end in a browser.
4. Leave Render running but unused for ~7 days as a rollback fallback. Rollback = flip `VITE_API_URL` back to the Render URL.

---

## Phase 6 — Cleanup (the only PR-worthy phase)

After 7 days of stable GCE operation:

1. Delete the Render service in the Render dashboard.
2. In the repo, delete:
   - `render.yaml`
   - `server/railway.json`
   - `server/Procfile`
3. Update `DEPLOYMENT.md` to describe the GCE flow (replace the Render section; keep Vercel and Turso sections).
4. Add a brief note in `DEPLOYMENT.md` on **how to recover the VM** if it dies:
   - All state is in Turso (no VM data to back up).
   - Re-run the Phase 1–4 steps; total recovery time ~20 min.

One PR titled `chore(deploy): migrate from Render to GCE` containing the deletes + `DEPLOYMENT.md` update + `.github/workflows/deploy.yml`.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| GCE always-free quota unavailable in chosen region | Try `us-west1` and `us-east1`. If still none, fall back to Hetzner CX22 (€4/mo) — every other phase of this plan applies unchanged. |
| Oracle-style reclamation of idle free-tier resources | GCP does not reclaim always-free `e2-micro` instances for inactivity. No action needed. |
| 1 GB RAM exhausted by build | Run `npm ci && npm run build` on the VM with `NODE_OPTIONS=--max-old-space-size=768`. If still OOM, **build in GH Actions and rsync `dist/` to the VM** instead of building on the VM. |
| Forgetting to renew Cloudflare cert / Let's Encrypt | Cloudflare: automatic, never expires. Certbot: systemd timer auto-renews. Either way, no manual step. |
| Free egress (1 GB/mo to most regions) exceeded | For a personal app this won't happen. If it does, Cloudflare cache hides most responses from GCE entirely. |
| SSH brute-force on port 22 | Default GCP firewall allows SSH from `0.0.0.0/0`. Tighten to your home IP, or disable password auth (already off in Debian 12), or use `gcloud compute ssh` which uses IAP tunneling and doesn't need port 22 open at all (then restrict the SSH firewall rule to `35.235.240.0/20`, the IAP range). |

---

## Out of scope

- Migrating the **frontend** (stays on Vercel).
- Migrating the **database** (stays on Turso).
- Adding monitoring/alerting (consider UptimeRobot free tier later — pings `/api/health` every 5 min, emails on downtime).
- Replacing `npm` with `pnpm` or other tooling changes.
