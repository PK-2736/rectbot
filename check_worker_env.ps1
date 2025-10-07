# PowerShellでWorkerの環境変数を確認

Write-Host "=== Cloudflare Worker 環境変数確認 ===" -ForegroundColor Cyan
Write-Host ""

try {
    # SSL証明書の検証をスキップして接続
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
    
    $response = Invoke-WebRequest -Uri "https://api.rectbot.tech/api/status" -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    
    Write-Host "✅ Worker接続成功" -ForegroundColor Green
    Write-Host ""
    Write-Host "Status: $($json.status)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "環境変数:" -ForegroundColor Yellow
    
    $env = $json.env
    
    # 重要な環境変数をチェック
    $critical = @("VPS_EXPRESS_URL", "SERVICE_TOKEN", "DISCORD_CLIENT_ID", "JWT_SECRET")
    
    foreach ($key in $critical) {
        $value = $env.$key
        if ($value -eq $true) {
            Write-Host "  ✅ $key`: 設定済み" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $key`: 未設定" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    
    # tunnelUrlPreviewがあれば表示
    if ($json.tunnelUrlPreview) {
        Write-Host "Tunnel URL Preview: $($json.tunnelUrlPreview)" -ForegroundColor Cyan
    }
    
} catch {
    Write-Host "❌ Worker接続失敗" -ForegroundColor Red
    Write-Host "エラー: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "対処方法:" -ForegroundColor Yellow
    Write-Host "1. Cloudflare Dashboard でCustom Domainを設定"
    Write-Host "   https://dash.cloudflare.com → Workers & Pages → rectbot-backend"
    Write-Host "   Settings → Triggers → Custom Domains → Add 'api.rectbot.tech'"
    Write-Host ""
    Write-Host "2. GitHub Secretsを確認"
    Write-Host "   https://github.com/PK-2736/rectbot/settings/secrets/actions"
}

Write-Host ""
Write-Host "=== 確認完了 ===" -ForegroundColor Cyan
