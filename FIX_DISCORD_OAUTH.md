# Discord OAuth エラー修正ガイド

## ❌ 現在のエラー
```
Failed to get Discord access token: unknown error - no description
```

## 🔧 解決方法

### ステップ1: GitHub Secretsに DISCORD_REDIRECT_URI を追加

1. https://github.com/PK-2736/rectbot/settings/secrets/actions にアクセス
2. **New repository secret** をクリック
3. 以下を追加:

```
Name: DISCORD_REDIRECT_URI
Value: https://api.rectbot.tech/api/discord/callback
```

### ステップ2: Discord Developer Portal でRedirect URIを確認

1. https://discord.com/developers/applications にアクセス
2. あなたのBotアプリケーションを選択
3. **OAuth2** → **General**
4. **Redirects** セクションに以下が含まれているか確認:
   - `https://api.rectbot.tech/api/discord/callback`
   
5. もし無ければ、**Add Redirect** をクリックして追加
6. **Save Changes** をクリック

### ステップ3: 変更をpushして再デプロイ

```powershell
git add .
git commit -m "Add DISCORD_REDIRECT_URI to GitHub Actions"
git push origin main
```

### ステップ4: GitHub Actionsの実行を確認

1. https://github.com/PK-2736/rectbot/actions にアクセス
2. 最新のワークフローが成功するまで待つ（約2-3分）

### ステップ5: 動作確認

```powershell
# ブラウザで開く
start https://dash.rectbot.tech
```

Discord認証が正常に動作するはずです！

---

## 📋 必要なGitHub Secrets一覧（確認用）

すべて設定されているか確認してください：

- [x] `CLOUDFLARE_API_TOKEN`
- [x] `CLOUDFLARE_ACCOUNT_ID`
- [x] `VPS_EXPRESS_URL`
- [x] `SERVICE_TOKEN`
- [x] `DISCORD_CLIENT_ID`
- [x] `DISCORD_CLIENT_SECRET`
- [ ] `DISCORD_REDIRECT_URI` ← **これを追加！**
- [x] `JWT_SECRET`
- [x] `ADMIN_DISCORD_ID`

---

## 🐛 それでもエラーが出る場合

### エラー: "Invalid redirect_uri"

**原因:** Discord Developer PortalのRedirect URIが一致していない

**解決方法:**
- Discord Developer Portal で `https://api.rectbot.tech/api/discord/callback` を追加
- URLの末尾にスラッシュ `/` が無いことを確認
- HTTPSであることを確認

### エラー: "SSL/TLS のセキュリティで保護されているチャネルに対する信頼関係を確立できませんでした"

**原因:** カスタムドメインのSSL設定が不完全

**解決方法:**
1. Cloudflare Dashboard → Workers & Pages → rectbot-backend
2. Settings → Triggers → Custom Domains
3. `api.rectbot.tech` が表示されているか確認
4. 表示されていなければ **Add Custom Domain** で追加

### Worker Logsの確認方法

1. https://dash.cloudflare.com → Workers & Pages
2. rectbot-backend を選択
3. **Logs** タブをクリック
4. リアルタイムでエラーを確認

---

## ✅ 成功時の動作

すべて正しく設定されると：

1. ✅ `https://dash.rectbot.tech` にアクセス
2. ✅ **Discord でログイン** ボタンをクリック
3. ✅ Discord認証画面が表示される
4. ✅ 認証後、ダッシュボードにリダイレクトされる
5. ✅ 管理者は募集データを管理できる

完璧に動作します！🎉
