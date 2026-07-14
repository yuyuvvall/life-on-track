# update-server.ps1 - Build locally and deploy server/dist to the GCE VM.
#
# Usage:
#   .\deploy\update-server.ps1                      # code-only deploy
#   .\deploy\update-server.ps1 -RefreshEnv          # also refresh .env.production from Secret Manager
#   .\deploy\update-server.ps1 -Name X -Zone Y      # override target instance
#
# Prerequisites:
#   - gcloud authed against life-on-track project
#       gcloud auth login
#       gcloud config set project life-on-track-497619
#   - Secret Manager seeded once (only needed if you'll ever use -RefreshEnv):
#       gcloud secrets create life-on-track-server-env --replication-policy=automatic
#       gcloud secrets versions add life-on-track-server-env --data-file=server\.env.production
#   - VM bootstrapped per plans\migrate-to-gce-2026-05-27\UPDATE-SERVER-SCRIPT.md
#
# After editing server\package.json, run `npm install` locally before this script.

[CmdletBinding()]
param(
    [string]$Name = "life-on-track-api",
    [string]$Zone = "us-central1-a",
    [switch]$RefreshEnv
)

$ErrorActionPreference = "Stop"

$PROJECT = "life-on-track-497619"
$SECRET_NAME = "life-on-track-server-env"
$REMOTE_ENV = "/home/auditor/app/server/.env.production"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DeployScript = Join-Path $RepoRoot "deploy\deploy-update.sh"
$Bundle = Join-Path $env:TEMP "life-on-track-server-bundle.tgz"

function Section($Text) {
    Write-Host ""
    Write-Host "=== $Text ===" -ForegroundColor Cyan
}

function Check-Exit($Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit code $LASTEXITCODE)" }
}

try {
    Section "Building server"
    Set-Location $RepoRoot
    npm run build --workspace=server
    Check-Exit "Build"

    Section "Bundling dist + package.json"
    tar -C "$RepoRoot\server" -czf $Bundle dist package.json
    Check-Exit "tar"
    $kb = [math]::Round((Get-Item $Bundle).Length / 1KB)
    Write-Host "Bundle size: ${kb}KB"

    Section "Shipping bundle to $Name"
    gcloud compute scp $Bundle "${Name}:/tmp/server-bundle.tgz" `
        --project=$PROJECT --zone=$Zone --tunnel-through-iap --quiet
    Check-Exit "scp (bundle)"

    if ($RefreshEnv) {
        Section "Refreshing env from Secret Manager"
        $tmpEnv = New-TemporaryFile
        try {
            # --out-file writes the raw secret bytes; a PowerShell `>` redirect would
            # re-encode as UTF-16 and corrupt the env file on the Linux VM.
            # The path must be wrapped in "$()" - in a token like --out-file=$x.FullName,
            # PowerShell expands $x but keeps ".FullName" as literal text, silently
            # writing to the wrong file (this shipped an empty env once).
            gcloud secrets versions access latest --secret=$SECRET_NAME --project=$PROJECT --out-file="$($tmpEnv.FullName)"
            Check-Exit "secret fetch"
            if ((Get-Item $tmpEnv.FullName).Length -eq 0) { throw "Fetched secret is empty - refusing to ship it" }
            gcloud compute scp $tmpEnv.FullName "${Name}:/tmp/env.tmp" `
                --project=$PROJECT --zone=$Zone --tunnel-through-iap --quiet
            Check-Exit "scp (env)"
            gcloud compute ssh $Name `
                --project=$PROJECT --zone=$Zone --tunnel-through-iap --quiet `
                --command="sudo mv /tmp/env.tmp $REMOTE_ENV && sudo chown auditor:auditor $REMOTE_ENV && sudo chmod 600 $REMOTE_ENV"
            Check-Exit "env move"
        }
        finally {
            Remove-Item $tmpEnv -Force -ErrorAction SilentlyContinue
        }
    }

    Section "Shipping deploy script"
    gcloud compute scp $DeployScript "${Name}:/tmp/deploy-update.sh" `
        --project=$PROJECT --zone=$Zone --tunnel-through-iap --quiet
    Check-Exit "scp (deploy script)"

    Section "Executing deploy on VM"
    Write-Host ">>> About to run:" -ForegroundColor Yellow
    Write-Host "  gcloud compute ssh $Name ... --command=`"sudo bash /tmp/deploy-update.sh`""
    $answer = Read-Host "Allow? [y/N]"
    if ($answer -ne 'y') { throw "Aborted by user." }

    gcloud compute ssh $Name `
        --project=$PROJECT --zone=$Zone --tunnel-through-iap `
        --command="sudo bash /tmp/deploy-update.sh"
    Check-Exit "ssh-exec"

    Write-Host ""
    Write-Host "[OK] Deploy complete" -ForegroundColor Green
}
finally {
    if (Test-Path $Bundle) { Remove-Item $Bundle -Force -ErrorAction SilentlyContinue }
}
