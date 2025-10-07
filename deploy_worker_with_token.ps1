# Cloudflare Worker デプロイスクリプト（API Token使用）
# 
# 使い方:
# 1. このファイルの CLOUDFLARE_API_TOKEN の値を実際のTokenに置き換える
# 2. PowerShellで実行: .\deploy_worker_with_token.ps1

# ⚠️ セキュリティ警告: このファイルにはAPIトークンが含まれています
# Git にコミットしないでください！

# Cloudflare API Token（要置き換え）
$env:CLOUDFLARE_API_TOKEN = "YOUR_API_TOKEN_HERE"
$env:CLOUDFLARE_ACCOUNT_ID = "74749d85b9c280c0daa93e12ea5d5a14"

Write-Host "=== Cloudflare Worker デプロイ ===" -ForegroundColor Cyan
Write-Host ""

# 環境変数確認
if ($env:CLOUDFLARE_API_TOKEN -eq "YOUR_API_TOKEN_HERE") {
    Write-Host "❌ エラー: CLOUDFLARE_API_TOKEN を設定してください" -ForegroundColor Red
    Write-Host ""
    Write-Host "手順:" -ForegroundColor Yellow
    Write-Host "1. https://dash.cloudflare.com/profile/api-tokens でAPI Tokenを作成"
    Write-Host "2. このスクリプトの CLOUDFLARE_API_TOKEN の値を実際のTokenに置き換える"
    Write-Host "3. 再度実行"
    exit 1
}

Write-Host "✅ API Token設定済み" -ForegroundColor Green
Write-Host ""

# backend ディレクトリに移動
Set-Location -Path backend

# デプロイ実行
Write-Host "🚀 Workerをデプロイしています..." -ForegroundColor Cyan
npx wrangler deploy --env production

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ デプロイ成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "次のステップ:" -ForegroundColor Cyan
    Write-Host "1. 環境変数を設定:"
    Write-Host "   npx wrangler secret put VPS_EXPRESS_URL"
    Write-Host "   npx wrangler secret put SERVICE_TOKEN"
    Write-Host ""
    Write-Host "2. 動作確認:"
    Write-Host "   curl https://rectbot-backend.workers.dev/api/status"
} else {
    Write-Host ""
    Write-Host "❌ デプロイ失敗" -ForegroundColor Red
    Write-Host "エラーログを確認してください"
}

# 元のディレクトリに戻る
Set-Location -Path ..
