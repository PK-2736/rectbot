# RectBot File Cleanup Script
# Remove unnecessary documentation and scripts

# Use current directory
$rootPath = Get-Location

# Files to keep
$keepFiles = @(
    # Important documentation
    "README.md",
    "REAME2.md",
    "503_error_fix.md",
    "deploy_troubleshooting.md",
    "CLEANUP_PLAN.md",
    
    # Important scripts
    "vps_complete_repair.sh",
    "fix_backend_url.sh",
    "complete_server_fix.sh",
    "vps_fix.sh",
    "vps_diagnose.sh",
    
    # Config and data files
    "git.sh",
    "requirements..txt",
    "setup_verification.sh",
    "supabase_guild_settings_table.sql",
    "supabase_manager.sh"
)

Write-Host "RectBot File Cleanup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check .md files in root directory
Write-Host "Checking Markdown files..." -ForegroundColor Yellow
$mdFiles = Get-ChildItem -Path $rootPath -Filter "*.md" -File
$mdToDelete = @()

foreach ($file in $mdFiles) {
    if ($keepFiles -notcontains $file.Name) {
        $mdToDelete += $file
    }
}

Write-Host "MD files to delete: $($mdToDelete.Count)" -ForegroundColor Yellow
foreach ($file in $mdToDelete) {
    Write-Host "  - $($file.Name)" -ForegroundColor Gray
}
Write-Host ""

# Check .sh files in root directory
Write-Host "Checking Shell scripts..." -ForegroundColor Yellow
$shFiles = Get-ChildItem -Path $rootPath -Filter "*.sh" -File
$shToDelete = @()

foreach ($file in $shFiles) {
    if ($keepFiles -notcontains $file.Name) {
        $shToDelete += $file
    }
}

Write-Host "SH files to delete: $($shToDelete.Count)" -ForegroundColor Yellow
foreach ($file in $shToDelete) {
    Write-Host "  - $($file.Name)" -ForegroundColor Gray
}
Write-Host ""

# Check HTML test files
Write-Host "Checking HTML test files..." -ForegroundColor Yellow
$htmlFiles = Get-ChildItem -Path $rootPath -Filter "test_*.html" -File
$htmlToDelete = @()

foreach ($file in $htmlFiles) {
    $htmlToDelete += $file
}

Write-Host "HTML files to delete: $($htmlToDelete.Count)" -ForegroundColor Yellow
foreach ($file in $htmlToDelete) {
    Write-Host "  - $($file.Name)" -ForegroundColor Gray
}
Write-Host ""

# Total
$totalToDelete = $mdToDelete.Count + $shToDelete.Count + $htmlToDelete.Count
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Total files to delete: $totalToDelete" -ForegroundColor Yellow
Write-Host ""

# Confirmation
$confirmation = Read-Host "Delete these files? (y/n)"

if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
    Write-Host ""
    Write-Host "Deleting files..." -ForegroundColor Red
    
    $deletedCount = 0
    
    # Delete .md files
    foreach ($file in $mdToDelete) {
        try {
            Remove-Item -Path $file.FullName -Force
            Write-Host "  Deleted: $($file.Name)" -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host "  Failed: $($file.Name) - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    # Delete .sh files
    foreach ($file in $shToDelete) {
        try {
            Remove-Item -Path $file.FullName -Force
            Write-Host "  Deleted: $($file.Name)" -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host "  Failed: $($file.Name) - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    # Delete .html files
    foreach ($file in $htmlToDelete) {
        try {
            Remove-Item -Path $file.FullName -Force
            Write-Host "  Deleted: $($file.Name)" -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host "  Failed: $($file.Name) - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Cleanup completed!" -ForegroundColor Green
    Write-Host "Deleted files: $deletedCount / $totalToDelete" -ForegroundColor Green
    Write-Host ""
    
    # Show remaining files
    Write-Host "Kept files:" -ForegroundColor Cyan
    foreach ($keepFile in $keepFiles) {
        $filePath = Join-Path $rootPath $keepFile
        if (Test-Path $filePath) {
            Write-Host "  $keepFile" -ForegroundColor Gray
        }
    }
    
} else {
    Write-Host ""
    Write-Host "Cleanup cancelled" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done" -ForegroundColor Cyan