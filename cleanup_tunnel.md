# Cloudflare Tunnel 削除手順

## 1. DNS レコードの削除（Cloudflare ダッシュボード）
1. Cloudflare にログイン → rectbot.tech ドメインを選択
2. 「DNS」タブを開く
3. `redis.rectbot.tech` のエントリを削除（A レコードまたは CNAME）

## 2. Public Hostname の削除（Cloudflare ダッシュボード）
1. 「Zero Trust」→「Tunnels」を開く
2. `rectbot-internal` トンネルを選択
3. 「Public hostnames」タブで `redis.rectbot.tech` の行を削除

## 3. DNS ルートの削除（origin Ubuntu サーバーで実行）
```bash
# DNS ルートを削除
cloudflared tunnel route dns delete redis.rectbot.tech

# ルートが削除されたことを確認
cloudflared tunnel route dns list
```

## 4. トンネルの停止と削除（必要に応じて）
```bash
# トンネルサービス停止（systemd で管理している場合）
sudo systemctl stop cloudflared
sudo systemctl disable cloudflared

# または pm2 で管理している場合
pm2 stop cloudflared
pm2 delete cloudflared

# トンネル自体を削除（完全に削除したい場合）
cloudflared tunnel delete bab4882c-ed94-4b0a-92f1-497e4f18c7a7
```

## 5. DNS キャッシュクリア
Windows（ローカル）で：
```powershell
ipconfig /flushdns
```

## 6. 新しいアーキテクチャでのテスト
```powershell
# Worker 経由での募集データ取得をテスト
Invoke-RestMethod -Uri 'https://api.rectbot.tech/api/recruitment' -Method Get -Verbose
```

## 注意事項
- EXPRESS_ORIGIN は Worker 環境変数から削除するか、削除された redis.rectbot.tech を指さないように変更してください
- SERVICE_TOKEN が Worker と Express の両方で正しく設定されていることを確認してください