# Manual production deploy for faravon-cafeteria, bypassing the Vercel<->GitHub
# integration.
#
# `vercel --prod` packages the CURRENT working tree, not whatever is on main
# on GitHub - so we first check the local tree matches origin/main, to avoid
# accidentally deploying unmerged or unpushed work.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/deploy-prod.ps1
#   -SkipConfirm  skip the y/n prompts before the migration and the deploy
#     (for CI/automation - avoid using it manually).

param(
    [switch]$SkipConfirm
)

$ErrorActionPreference = "Stop"

function Confirm-Step($message) {
    if ($SkipConfirm) { return }
    $answer = Read-Host "$message [y/N]"
    if ($answer -ne "y" -and $answer -ne "Y") {
        Write-Host "Aborted by user." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "== 1. Checking working tree ==" -ForegroundColor Cyan
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$diff = git diff --stat origin/main HEAD
if ($diff) {
    Write-Host "Working tree DIFFERS from origin/main:" -ForegroundColor Red
    Write-Host $diff
    Write-Host "Merge your PR into main and update this checkout (git checkout main; git pull), or push/merge current work first - otherwise you would deploy the wrong thing." -ForegroundColor Yellow
    exit 1
}
Write-Host "OK - tree matches origin/main." -ForegroundColor Green

Write-Host ""
Write-Host "== 2. Prisma client and migrations ==" -ForegroundColor Cyan
Confirm-Step "Apply pending migrations (prisma migrate deploy) and continue?"

npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed (check whether another running dev server is locking the engine file)" }

npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed" }

Write-Host ""
Write-Host "== 3. Deploying to Vercel (production) ==" -ForegroundColor Cyan
Confirm-Step "Deploy to PRODUCTION (faravon-cafeteria.vercel.app)?"

npx vercel --prod --scope farovon
if ($LASTEXITCODE -ne 0) { throw "vercel --prod failed" }

Write-Host ""
Write-Host "Done." -ForegroundColor Green
