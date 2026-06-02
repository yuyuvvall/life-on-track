# `update-server.sh` — Local-Push Deploy to GCE

**Date:** 2026-06-02
**Parent plan:** [PLAN.md](./PLAN.md) — this replaces Phase 4 (GitHub Actions) with a manual local-push model.

## Goal

A single script run from the laptop that updates the GCE VM — build locally, ship the artifact, refresh env on demand, restart the systemd service, smoke-test. Modeled on `C:\code\rendi-api\rendi-backend\deploy\update-servers.sh` but diverges where the reference's choices don't fit our stack.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Trigger | Manual from laptop | No GH Actions; one developer, one repo |
| Build location | **Local** (laptop), ship `server/dist/` as tarball | Avoids OOM on 1 GB `e2-micro`; the reference is Python with no compile step, so its build-on-VM model doesn't apply |
| VM discovery | **Hardcoded name + zone** with `--name`/`--zone` overrides | YAGNI on tag-discovery — only one always-free VM |
| Env source | Google Secret Manager, **fetched laptop-side**, written via ssh | No `gcloud` install on VM, no IAM grant to VM service account; secret only transits laptop where the developer already has full IAM |
| Env refresh cadence | **Opt-in via `--refresh-env` flag** | PLAN.md principle: env is hand-managed; most deploys are code-only |
| SSH transport | `gcloud compute ssh --tunnel-through-iap` | Matches reference; no public port 22 needed |
| Confirmation prompt | **Only on the ssh-exec call** | The mutating step. Read-only `instances list` and the build step run without prompts |
| Remote deploy script | **Static, committed file** (not heredoc-generated) | Reviewable in PRs, no quoting traps, no `rm` cleanup |
| Reproducibility (lockfile) | `npm install --omit=dev` on VM (no lockfile) | Workspaces repo has no per-workspace lockfile; deferred to a follow-up if needed |

## Repo layout

```
life-on-track/
  deploy/
    update-server.sh        ← laptop orchestrator (committed)
    deploy-update.sh        ← runs on VM, scp'd each deploy (committed)
```

Both files committed and reviewable. No generated artifacts to gitignore.

## High-level flow

```
laptop                                                          VM
──────                                                          ──
1. npm ci  (sanity)
2. npm run build --workspace=server
3. tar server/dist + server/package.json → /tmp/server-bundle.tgz
4. gcloud compute scp bundle ───────────────────────────────►   /tmp/server-bundle.tgz
5. (if --refresh-env)
   gcloud secrets versions access ─[piped via ssh]────────►     sudo tee /home/auditor/app/server/.env.production
6. gcloud compute scp deploy-update.sh ─────────────────►      /tmp/deploy-update.sh
7. [PROMPT] gcloud compute ssh "sudo bash /tmp/deploy-update.sh"
                                                                ├─ untar bundle over server/{dist,package.json}
                                                                ├─ cd server && npm install --omit=dev
                                                                ├─ systemctl restart life-on-track-api  (blocks until active)
                                                                ├─ smoke-test 127.0.0.1:3001/api/health
                                                                └─ rm bundle + script
```

Single ssh-exec wraps the VM-side mutation. One prompt per deploy.

## `update-server.sh` (laptop) — structure

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT="<gcp-project-id>"                  # hardcode
INSTANCE_NAME="life-on-track-api"           # default; --name overrides
ZONE="us-central1-a"                        # default; --zone overrides
SECRET_NAME="life-on-track-server-env"
APP_DIR="/home/auditor/app"

# Args: --name <n> --zone <z> --refresh-env
REFRESH_ENV=false
# … arg parse …

# run_gcloud wrapper — same as reference, prompts before running.
# Used only for the destructive ssh-exec step.

# 1-3. Build & bundle locally
echo "Building..."
npm ci --silent
npm run build --workspace=server
tar -C server -czf /tmp/server-bundle.tgz dist package.json

# 4. Ship bundle
echo "Shipping bundle..."
gcloud compute scp /tmp/server-bundle.tgz \
  "$INSTANCE_NAME:/tmp/server-bundle.tgz" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet

# 5. Refresh env if requested
if [ "$REFRESH_ENV" = true ]; then
  echo "Refreshing env from Secret Manager..."
  gcloud secrets versions access latest --secret="$SECRET_NAME" \
    | gcloud compute ssh "$INSTANCE_NAME" \
        --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
        --command="sudo tee $APP_DIR/server/.env.production > /dev/null \
                   && sudo chown auditor:auditor $APP_DIR/server/.env.production \
                   && sudo chmod 600 $APP_DIR/server/.env.production"
fi

# 6. Ship deploy script
gcloud compute scp deploy/deploy-update.sh \
  "$INSTANCE_NAME:/tmp/deploy-update.sh" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet

# 7. Execute (the only prompted step)
run_gcloud gcloud compute ssh "$INSTANCE_NAME" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap \
  --command="sudo bash /tmp/deploy-update.sh"

# Local cleanup
rm -f /tmp/server-bundle.tgz
echo "✓ Deploy complete"
```

## `deploy-update.sh` (runs on VM) — structure

```bash
#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/home/auditor/app
SERVICE=life-on-track-api
BUNDLE=/tmp/server-bundle.tgz

echo "Unpacking bundle..."
sudo -u auditor tar -C "$APP_DIR/server" -xzf "$BUNDLE"

echo "Installing runtime deps..."
sudo -u auditor bash -c "cd $APP_DIR/server && npm install --omit=dev --no-audit --no-fund --silent"

echo "Restarting $SERVICE..."
# No --no-block: let systemctl wait for the unit to be active before we curl
systemctl restart "$SERVICE"

echo "Smoke test..."
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
    echo "✓ Health OK on $(hostname)"
    rm -f "$BUNDLE" /tmp/deploy-update.sh
    exit 0
  fi
  sleep 1
done

echo "✗ Health check failed on $(hostname)" >&2
echo "  Investigate: journalctl -u $SERVICE -n 50 --no-pager" >&2
exit 1
```

## VM prerequisites (one-time, lives in PLAN.md Phase 2)

This script assumes the VM has:

1. Repo cloned at `/home/auditor/app` (just for git history / rollback; deploys overwrite `server/dist` + `server/package.json` directly). Could equivalently be a bare directory; cloning makes rollback by `git reset` possible.
2. Node 20 + npm installed system-wide.
3. systemd unit `life-on-track-api.service` installed and enabled, with `WorkingDirectory=/home/auditor/app/server`, `EnvironmentFile=/home/auditor/app/server/.env.production`, `User=auditor`.
4. Sudoers entry:
   ```
   auditor ALL=(root) NOPASSWD: /bin/systemctl restart life-on-track-api
   ```
   But note: the deploy-update script runs as **root** (via `sudo bash`), so this sudoers entry is only relevant if we ever split the deploy steps. Keeping it for completeness — also matches PLAN.md.
5. `.env.production` already populated (manually for first deploy, via `--refresh-env` thereafter). systemd `EnvironmentFile` requires `KEY=value` lines with no shell quoting and no inline comments — confirm secret contents match this format.
6. Network tag `http-server` / `https-server` on the instance (per PLAN.md 1.2) — unrelated to deploy, used for firewall.

What we **don't** need on the VM compared to my first draft:
- ❌ `apt install google-cloud-cli`
- ❌ `roles/secretmanager.secretAccessor` on the VM service account
- ❌ `git fetch` deploy key (we ship the build artifact, not git history)
- ❌ Node build heap tuning (`NODE_OPTIONS=--max-old-space-size=768`)

## Laptop prerequisites

1. `gcloud` authenticated as a user with:
   - `roles/compute.osLogin` or equivalent on the project (for ssh/scp via IAP)
   - `roles/iap.tunnelResourceAccessor` on the project (IAP tunneling)
   - `roles/secretmanager.secretAccessor` on `life-on-track-server-env`
2. **Secret Manager seeded once**:
   ```bash
   gcloud secrets create life-on-track-server-env --replication-policy=automatic
   gcloud secrets versions add life-on-track-server-env --data-file=server/.env.production
   ```
   Future rotations: `gcloud secrets versions add … --data-file=…` then `./deploy/update-server.sh --refresh-env`.

## Secret rotation workflow

```
1. Edit server/.env.production locally (gitignored)
2. gcloud secrets versions add life-on-track-server-env --data-file=server/.env.production
3. ./deploy/update-server.sh --refresh-env
4. Delete the local .env.production OR keep it as your dev copy of prod values
```

## Open follow-ups (deferred from v1)

1. **PLAN.md Phase 4 rewrite** — delete the GH Actions section, point readers here. Lands in the same PR as the script.
2. **Lockfile reproducibility** — if `npm install --omit=dev` drift becomes a problem, add a pre-tar step: `cd server && npm install --package-lock-only --omit=dev` then include the generated lockfile in the tarball and switch the VM to `npm ci --omit=dev`. Local artifact: gitignore `server/package-lock.json`.
3. **Build-on-VM fallback** — currently obsolete. If we ever lose the local build host (e.g., CI takes over), revisit.
4. **Multi-VM** — if we go beyond one always-free VM, swap the hardcoded name/zone for the tag-discovery loop from the reference.
5. **Rollback** — out of scope for v1. Manual recovery: `ssh` in, `git reset --hard <prev-sha>` on the VM clone, `npm run build --workspace=server` (yes, on VM — one-time, OOM risk acknowledged), `systemctl restart`. Or just re-run `update-server.sh` from the laptop after `git checkout <prev-sha>` locally.

## Phase 0 — VM status check (run before anything else)

Before installing anything, SSH into the VM and run a single check block. It's read-only — every line either reports a value or says `[MISSING]`. Share the full output and we'll know exactly what's already done and what still needs to be installed.

### Connect

From the laptop:
```bash
gcloud compute ssh life-on-track-api --zone=us-central1-a --tunnel-through-iap
```
(Adjust zone/name if you used different ones in the GCP UI.)

### Run this once you're in

Paste the whole block — it's safe, all commands are read-only:

```bash
set +e
section() { echo; echo "═══ $1 ═══"; }

section "OS & Resources"
. /etc/os-release; echo "Distro: $PRETTY_NAME"
uname -r
free -h | head -2
df -h / | tail -1

section "Node / npm / git"
node --version 2>/dev/null || echo "[MISSING] node"
npm --version 2>/dev/null || echo "[MISSING] npm"
git --version 2>/dev/null || echo "[MISSING] git"

section "auditor user"
id auditor 2>&1
[ -d /home/auditor ] && ls -ld /home/auditor || echo "[MISSING] /home/auditor"

section "App repo"
if [ -d /home/auditor/app ]; then
  ls -la /home/auditor/app | head -5
  [ -d /home/auditor/app/.git ] && (cd /home/auditor/app && git remote -v && git log -1 --oneline) || echo "[MISSING] not a git repo"
else
  echo "[MISSING] /home/auditor/app"
fi

section "Env file"
ls -la /home/auditor/app/server/.env.production 2>&1

section "systemd unit"
if [ -f /etc/systemd/system/life-on-track-api.service ]; then
  systemctl is-enabled life-on-track-api
  systemctl is-active life-on-track-api
  systemctl status life-on-track-api --no-pager -n 5
else
  echo "[MISSING] life-on-track-api.service"
fi

section "sudoers entries"
sudo ls /etc/sudoers.d/ 2>&1

section "nginx"
nginx -v 2>&1 || echo "[MISSING] nginx"
systemctl is-active nginx 2>&1
ls /etc/nginx/sites-enabled/ 2>&1

section "Listening ports (22 / 80 / 443 / 3001)"
sudo ss -tlnp 2>&1 | grep -E 'LISTEN.*:(22|80|443|3001)\b' || echo "none of those ports listening"

section "Health endpoint (only succeeds if server already running)"
curl -fsS --max-time 3 http://127.0.0.1:3001/api/health 2>&1 || echo "[not responding]"

section "DONE"
```

### What the output tells us

| Line | If OK | If MISSING / wrong |
|---|---|---|
| Distro | `Debian GNU/Linux 12` | We'll adjust apt commands for your distro |
| `free -h` | `Mem: 0.9Gi …` | Wrong machine type |
| `df -h /` | ~30 GB | Wrong disk size |
| `node --version` | `v20.x.x` | Install Node 20 (Phase 2.1) |
| `id auditor` | `uid=… auditor` | Create user (Phase 2.2) |
| `/home/auditor/app` exists + `.git` | Repo present | Clone repo (Phase 2.3) |
| `.env.production` exists, mode 600 | Env file set | Write it (Phase 2.4) |
| `systemctl is-active life-on-track-api` | `active` | Install + enable unit (Phase 2.5) |
| `/etc/sudoers.d/auditor-restart` listed | Sudoers in place | Add it (Phase 4.4 of PLAN.md) |
| `nginx -v` | `nginx/1.x` + `:80 LISTEN` | Install nginx + config (Phase 3) |
| `curl /api/health` returns JSON | Server running | All previous steps done correctly |

Once we see the output, we'll have an exact punch list of what to install. Most likely on a fresh GCP VM: everything from Node down is MISSING and we'll go top-to-bottom.

---

## Implementation order

1. **Phase 0 status check** (above) — establishes the gap.
2. **VM prerequisites** (PLAN.md Phase 2): user, systemd unit, sudoers, manual `.env.production`. Verify with `systemctl status life-on-track-api` + `curl http://127.0.0.1:3001/api/health` from inside the VM.
3. **Seed Secret Manager** with current env (one-off).
4. **PR**: add `deploy/update-server.sh` + `deploy/deploy-update.sh` + PLAN.md Phase 4 rewrite. No code changes in `server/` or `client/`.
5. **Live test**: `./deploy/update-server.sh` (no `--refresh-env`) against the VM. Confirm smoke test passes, confirm a code change actually ships.
6. **Live test env refresh**: rotate the secret to a no-op change, run with `--refresh-env`, confirm env on VM matches.
7. **Cleanup** (after ~7 days stable): delete `render.yaml`, `server/railway.json`, `server/Procfile` (PLAN.md Phase 6).
