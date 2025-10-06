# RectBot ドキュメント・スクリプト クリーンアップ

## 保持するファイル（重要）

### ドキュメント (.md)
- README.md - プロジェクトのメイン説明
- 503_error_fix.md - 503エラー対応ガイド
- deploy_troubleshooting.md - デプロイのトラブルシューティング

### スクリプト (.sh)
- vps_complete_repair.sh - VPS完全修復スクリプト
- fix_backend_url.sh - BACKEND_API_URL修正
- complete_server_fix.sh - サーバー完全修復

### 設定ファイル
- bot/ecosystem.config.js
- bot/pm2-server.config.js
- backend/wrangler.toml

## 削除予定のファイル（重複・古い）

以下のファイルは重複または古い情報のため削除します：
- CLOUDFLARE_*.md (多数の重複ドキュメント)
- VPS_*.md (重複ドキュメント)
- ERROR_*.md (重複トラブルシューティング)
- 診断系スクリプトの重複ファイル

## クリーンアップの実行

PowerShellで実行:
```powershell
cd "c:\Users\小川 哲平\OneDrive\document\rectbot"
.\cleanup_docs.ps1
```

または手動で削除:
1. 上記の保持リストにないファイルを選択
2. Deleteキーで削除
3. ゴミ箱を空にする