# rectbot ドメイン設定ガイド

## カスタムドメイン設定

### dash.rectbot.tech の設定手順

1. **Cloudflare Pagesでカスタムドメインを追加**
   - Cloudflareダッシュボードで `rect-dashboard` プロジェクトを開く
   - 「Custom domains」タブに移動
   - 「Set up a custom domain」をクリック
   - `dash.rectbot.tech` を入力

2. **DNSレコードの設定**
   以下のCNAMEレコードをDNS設定に追加：
   ```
   Type: CNAME
   Name: dash
   Target: rect-dashboard.pages.dev
   Proxy status: プロキシ済み (オレンジ雲)
   ```

3. **SSL/TLS設定**
   - SSL/TLS暗号化モードを「フル」または「フル（厳密）」に設定
   - Edge Certificatesで「常にHTTPSを使用」を有効化

### 環境変数の更新

デプロイ後、以下の環境変数をGitHub Secretsで更新してください：

```bash
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://dash.rectbot.tech/auth/callback
```

### Discord アプリケーション設定

Discord Developer Portalで以下のリダイレクトURLを追加：
- `https://dash.rectbot.tech/auth/callback`

## デプロイ構成

- **公開サイト**: `rectbot` プロジェクト → `rectbot.tech`
- **管理画面**: `rect-dashboard` プロジェクト → `dash.rectbot.tech`

## 注意事項

1. DNS設定の反映には最大48時間かかる場合があります
2. SSL証明書の発行には数分〜数時間かかる場合があります
3. カスタムドメイン設定後は、古いURL（*.pages.dev）もアクセス可能です