#!/usr/bin/env bash
# deploy-update.sh — Runs ON the VM (scp'd from laptop each deploy, executed via sudo).
# Untars the build bundle, installs runtime deps, restarts service, smoke-tests.

set -euo pipefail

APP_DIR=/home/auditor/app
APP_USER=auditor
SERVICE=life-on-track-api
BUNDLE=/tmp/server-bundle.tgz
HEALTH_URL=http://127.0.0.1:3001/api/health

trap 'rm -f "$BUNDLE" /tmp/deploy-update.sh' EXIT

echo "→ Unpacking bundle into $APP_DIR/server"
sudo -u "$APP_USER" tar -C "$APP_DIR/server" -xzf "$BUNDLE"

echo "→ Installing runtime deps (npm install --omit=dev)"
sudo -u "$APP_USER" bash -c "cd $APP_DIR/server && npm install --omit=dev --no-audit --no-fund --silent"

echo "→ Restarting $SERVICE"
systemctl restart "$SERVICE"

echo "→ Smoke test against $HEALTH_URL (waiting up to 30s for service to come up)"
for i in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "✓ Health OK on $(hostname) (after ${i}s)"
    exit 0
  fi
  sleep 1
done

echo "✗ Health check failed on $(hostname)" >&2
echo "  Recent service logs:" >&2
journalctl -u "$SERVICE" -n 20 --no-pager >&2
exit 1
