# Cloudflare Worker手動デプロイスクリプト
# GitHub Actionsを使わずに直接デプロイする場合に使用

# 必要な環境変数を確認
$requiredVars = @(
    "CLOUDFLARE_API_TOKEN",
    "SUPABASE_URL",
    "DISCORD_CLIENT_ID",
    "PUBLIC_RECAPTCHA_SITE_KEY",
    "ADMIN_DISCORD_ID"
)

Write-Host "=== Cloudflare Worker 手動デプロイ ===" -ForegroundColor Cyan
Write-Host ""

# 環境変数のチェック
$missing = @()
foreach ($var in $requiredVars) {
    $value = [Environment]::GetEnvironmentVariable($var)
    if ([string]::IsNullOrEmpty($value)) {
        Write-Host "❌ $var is not set" -ForegroundColor Red
        $missing += $var
    } else {
        Write-Host "✅ $var is set" -ForegroundColor Green
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "以下の環境変数を設定してください:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "PowerShellで設定する場合:" -ForegroundColor Cyan
    foreach ($var in $missing) {
        Write-Host "`$env:$var=`"your_value_here`"" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "または、.envファイルを作成して以下のコマンドを実行:" -ForegroundColor Cyan
    Write-Host "Get-Content .env | ForEach-Object { if (`$_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable(`$matches[1], `$matches[2]) } }" -ForegroundColor White
    exit 1
}

# デフォルト値を設定
$DISCORD_REDIRECT_URI = if ([string]::IsNullOrEmpty($env:DISCORD_REDIRECT_URI)) { "https://api.recrubo.net/api/discord/callback" } else { $env:DISCORD_REDIRECT_URI }
$VPS_EXPRESS_URL = if ([string]::IsNullOrEmpty($env:VPS_EXPRESS_URL)) { "https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com" } else { $env:VPS_EXPRESS_URL }

Write-Host ""
Write-Host "=== デプロイ設定 ===" -ForegroundColor Cyan
Write-Host "DISCORD_CLIENT_ID: $env:DISCORD_CLIENT_ID"
Write-Host "DISCORD_REDIRECT_URI: $DISCORD_REDIRECT_URI"
Write-Host "SUPABASE_URL: $env:SUPABASE_URL"
Write-Host "PUBLIC_RECAPTCHA_SITE_KEY: $env:PUBLIC_RECAPTCHA_SITE_KEY"
Write-Host "ADMIN_DISCORD_ID: $env:ADMIN_DISCORD_ID"
Write-Host "VPS_EXPRESS_URL: $VPS_EXPRESS_URL"
Write-Host ""

# 確認
$confirm = Read-Host "この設定でデプロイしますか? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "デプロイをキャンセルしました" -ForegroundColor Yellow
    exit 0
}

# backendディレクトリに移動
Set-Location -Path "$PSScriptRoot\backend"

Write-Host ""
Write-Host "=== Wrangler デプロイ実行 ===" -ForegroundColor Cyan

# デプロイコマンドを実行
$deployCmd = "npx wrangler deploy --compatibility-date=2024-01-01 " +
    "--var DISCORD_CLIENT_ID:`"$env:DISCORD_CLIENT_ID`" " +
    "--var DISCORD_REDIRECT_URI:`"$DISCORD_REDIRECT_URI`" " +
    "--var SUPABASE_URL:`"$env:SUPABASE_URL`" " +
    "--var PUBLIC_RECAPTCHA_SITE_KEY:`"$env:PUBLIC_RECAPTCHA_SITE_KEY`" " +
    "--var ADMIN_DISCORD_ID:`"$env:ADMIN_DISCORD_ID`" " +
    "--var VPS_EXPRESS_URL:`"$VPS_EXPRESS_URL`""

Write-Host "実行コマンド:" -ForegroundColor Cyan
Write-Host $deployCmd -ForegroundColor White
Write-Host ""

Invoke-Expression $deployCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ デプロイが完了しました！" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ デプロイに失敗しました (Exit Code: $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}
