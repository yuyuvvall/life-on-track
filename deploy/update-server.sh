#!/usr/bin/env bash
# update-server.sh — Build locally and deploy server/dist to the GCE VM.
#
# Usage:
#   ./deploy/update-server.sh                      # code-only deploy
#   ./deploy/update-server.sh --refresh-env        # also refresh .env.production from Secret Manager
#   ./deploy/update-server.sh --name X --zone Y    # override target instance
#
# Prerequisites:
#   - gcloud authed against the life-on-track project (gcloud auth login + gcloud config set project life-on-track-497619)
#   - Secret Manager seeded once: gcloud secrets create life-on-track-server-env --replication-policy=automatic
#                                 gcloud secrets versions add life-on-track-server-env --data-file=server/.env.production
#   - VM bootstrapped per plans/migrate-to-gce-2026-05-27/UPDATE-SERVER-SCRIPT.md
#
# After editing server/package.json, run `npm install` locally before this script.

set -euo pipefail

PROJECT="life-on-track-497619"
INSTANCE_NAME="life-on-track-api"
ZONE="us-central1-a"
SECRET_NAME="life-on-track-server-env"
REMOTE_ENV_PATH="/home/auditor/app/server/.env.production"

REFRESH_ENV=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --refresh-env) REFRESH_ENV=true; shift ;;
    --name)        INSTANCE_NAME="$2"; shift 2 ;;
    --zone)        ZONE="$2"; shift 2 ;;
    -h|--help)     sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)             echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Prompts before running the wrapped command. Used only for the destructive ssh-exec.
run_gcloud() {
  echo "" >&2
  echo ">>> About to run:" >&2
  echo "  $*" >&2
  read -rp "Allow? [y/N] " answer < /dev/tty
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    "$@"
  else
    echo "Aborted by user." >&2
    return 1
  fi
}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/deploy/deploy-update.sh"
BUNDLE="/tmp/life-on-track-server-bundle.tgz"

cleanup() { rm -f "$BUNDLE"; }
trap cleanup EXIT

echo "=== Building server ==="
cd "$REPO_ROOT"
npm run build --workspace=server

echo "=== Bundling dist + package.json ==="
tar -C "$REPO_ROOT/server" -czf "$BUNDLE" dist package.json
echo "Bundle size: $(du -h "$BUNDLE" | cut -f1)"

echo "=== Shipping bundle to $INSTANCE_NAME ==="
gcloud compute scp "$BUNDLE" \
  "$INSTANCE_NAME:/tmp/server-bundle.tgz" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet

if [ "$REFRESH_ENV" = true ]; then
  echo "=== Refreshing env from Secret Manager ==="
  gcloud secrets versions access latest --secret="$SECRET_NAME" \
    | gcloud compute ssh "$INSTANCE_NAME" \
        --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
        --command="sudo tee $REMOTE_ENV_PATH > /dev/null && sudo chown auditor:auditor $REMOTE_ENV_PATH && sudo chmod 600 $REMOTE_ENV_PATH"
fi

echo "=== Shipping deploy script ==="
gcloud compute scp "$DEPLOY_SCRIPT" \
  "$INSTANCE_NAME:/tmp/deploy-update.sh" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet

echo "=== Executing deploy on VM (you'll be prompted) ==="
run_gcloud gcloud compute ssh "$INSTANCE_NAME" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap \
  --command="sudo bash /tmp/deploy-update.sh"

echo ""
echo "✓ Deploy complete"
