# クリーンアップスクリプト - 不要なMD/SHファイルを削除

Write-Host "=== 不要ファイルのクリーンアップ ===" -ForegroundColor Cyan
Write-Host ""

# 保持するファイル（重要なドキュメント）
$keepFiles = @(
    "README.md",
    "REAME2.md",
    "bot\README.md",
    "bot\PM2_README.md",
    "bot\src\README.md",
    "frontend\astro\README.md",
    "frontend\dashboard\README.md"
)

# 削除する一時的なMDファイル
$tempMdFiles = @(
    "503_error_fix.md",
    "503_FIX_GUIDE.md",
    "CLEANUP_PLAN.md",
    "DEPLOY_WORKER.md",
    "DISCORD_OAUTH_SETUP.md",
    "FIX_503_COMPLETE_GUIDE.md",
    "FIX_DISCORD_OAUTH.md",
    "FIX_ERROR_1102.md",
    "FIX_ERROR_1102_COMPLETE.md",
    "GITHUB_ACTIONS_SETUP.md",
    "SETUP_PUBLIC_HOSTNAME.md",
    "SSL_SETUP_GUIDE.md",
    "SSL_TROUBLESHOOTING.md",
    "TUNNEL_CONNECTION_GUIDE.md",
    "WORKER_ENV_SETUP.md",
    "WORKER_SETUP_QUICK.md",
    "backend\TEST_TUNNEL_E2E.md"
)

# 削除する一時的なSHファイル
$tempShFiles = @(
    "check_tunnel_config.sh",
    "check_worker_env.sh",
    "complete_server_fix.sh",
    "diagnose_503.sh",
    "diagnose_vps.sh",
    "fix_backend_url.sh",
    "fix_env_direct.sh",
    "fix_pm2_config.sh",
    "fix_service_token.sh",
    "fix_service_token_force.sh",
    "fix_tunnel_config.sh",
    "full_diagnosis.sh",
    "test_tunnel.sh",
    "test_tunnel_connection.sh",
    "vps_complete_repair.sh",
    "vps_diagnose.sh",
    "vps_fix.sh"
)

# 削除する一時的なPSファイル
$tempPsFiles = @(
    "check_worker_env.ps1",
    "deploy_worker_with_token.ps1",
    "quick_deploy.ps1"
)

Write-Host "削除予定のファイル:" -ForegroundColor Yellow
Write-Host ""

$allFiles = $tempMdFiles + $tempShFiles + $tempPsFiles
$deletedCount = 0
$notFoundCount = 0

foreach ($file in $allFiles) {
    if (Test-Path $file) {
        Write-Host "  ❌ $file" -ForegroundColor Red
    } else {
        Write-Host "  ⚠️  $file (見つかりません)" -ForegroundColor Gray
        $notFoundCount++
    }
}

Write-Host ""
Write-Host "合計: $($allFiles.Count) ファイル (見つからない: $notFoundCount)" -ForegroundColor Cyan
Write-Host ""

$confirm = Read-Host "これらのファイルを削除しますか? (y/N)"

if ($confirm -eq "y" -or $confirm -eq "Y") {
    Write-Host ""
    Write-Host "削除中..." -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($file in $allFiles) {
        if (Test-Path $file) {
            Remove-Item $file -Force
            Write-Host "  ✅ 削除: $file" -ForegroundColor Green
            $deletedCount++
        }
    }
    
    Write-Host ""
    Write-Host "✅ $deletedCount ファイルを削除しました" -ForegroundColor Green
    Write-Host ""
    
    # Gitステータス確認
    Write-Host "Gitステータス:" -ForegroundColor Cyan
    git status --short
    Write-Host ""
    
    Write-Host "次のステップ:" -ForegroundColor Yellow
    Write-Host "  git add ."
    Write-Host "  git commit -m 'Clean up temporary documentation and scripts'"
    Write-Host "  git push origin main"
    
} else {
    Write-Host ""
    Write-Host "❌ キャンセルしました" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== クリーンアップ完了 ===" -ForegroundColor Cyan
