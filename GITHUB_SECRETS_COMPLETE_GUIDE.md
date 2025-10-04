# 🔧 GitHub Secrets 設定ガイド（完全版）

## 必須の GitHub Secrets

https://github.com/PK-2736/rectbot/settings/secrets/actions にアクセスして、以下をすべて追加してください:

---

### 1. DISCORD_CLIENT_ID
```
Name:  DISCORD_CLIENT_ID
Value: 1048950201974542477
```

### 2. DISCORD_REDIRECT_URI
```
Name:  DISCORD_REDIRECT_URI
Value: https://api.rectbot.tech/api/discord/callback
```

### 3. NEXT_PUBLIC_API_BASE_URL ⚠️ **これが不足しています！**
```
Name:  NEXT_PUBLIC_API_BASE_URL
Value: https://api.rectbot.tech
```

### 4. ADMIN_DISCORD_ID
```
Name:  ADMIN_DISCORD_ID
Value: 726195003780628621
```

### 5. DISCORD_CLIENT_SECRET ⚠️ **Discord Developer Portal から取得**
```
Name:  DISCORD_CLIENT_SECRET
Value: (Discord Developer Portal で取得した値)
```

取得方法:
1. https://discord.com/developers/applications/1048950201974542477/oauth2 にアクセス
2. "Client Secret" の "Reset Secret" をクリック
3. 表示された値をコピー
4. GitHub Secrets に貼り付け

### 6. JWT_SECRET
```
Name:  JWT_SECRET
Value: T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=
```

### 7. SERVICE_TOKEN
```
Name:  SERVICE_TOKEN
Value: (以下のコマンドで生成)
```

生成方法:
```bash
openssl rand -base64 32
```

### 8. SUPABASE_SERVICE_ROLE_KEY
```
Name:  SUPABASE_SERVICE_ROLE_KEY
Value: (Supabase Dashboard から取得)
```

取得方法:
1. Supabase Dashboard にアクセス
2. プロジェクトを選択
3. Settings → API
4. "service_role" の "secret" をコピー

### 9. SUPABASE_URL
```
Name:  SUPABASE_URL
Value: https://[your-project-ref].supabase.co
```

取得方法:
- Supabase Dashboard → Settings → API → Project URL

### 10. CLOUDFLARE_API_TOKEN
```
Name:  CLOUDFLARE_API_TOKEN
Value: (既に設定済み)
```

### 11. CLOUDFLARE_ACCOUNT_ID
```
Name:  CLOUDFLARE_ACCOUNT_ID
Value: (既に設定済み)
```

---

## 設定手順

### Step 1: GitHub Secrets ページにアクセス
https://github.com/PK-2736/rectbot/settings/secrets/actions

### Step 2: 各 Secret を追加

1. "New repository secret" をクリック
2. Name と Value を入力
3. "Add secret" をクリック
4. 次の Secret へ

### Step 3: すべて追加したか確認

以下のリストが表示されているはず:
- ADMIN_DISCORD_ID
- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN
- DISCORD_CLIENT_ID
- DISCORD_CLIENT_SECRET
- DISCORD_REDIRECT_URI
- JWT_SECRET
- NEXT_PUBLIC_API_BASE_URL ← **これが重要！**
- SERVICE_TOKEN
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_URL

---

## 最優先で追加するべきSecret

現在のエラーを解決するには、以下の3つを最優先で追加してください:

### 1. NEXT_PUBLIC_API_BASE_URL (最優先!)
```
https://api.rectbot.tech
```

### 2. DISCORD_CLIENT_SECRET
Discord Developer Portal から取得

### 3. DISCORD_REDIRECT_URI
```
https://api.rectbot.tech/api/discord/callback
```

---

## Secret 追加後

すべてのSecretを追加したら:

1. 空のコミットでデプロイをトリガー:
   ```bash
   cd /workspaces/rectbot
   git commit --allow-empty -m "Trigger redeploy after adding secrets"
   git push origin main
   ```

2. GitHub Actions が完了するまで待つ（約2-3分）:
   https://github.com/PK-2736/rectbot/actions

3. ブラウザのキャッシュとCookieをクリア:
   - Ctrl+Shift+Delete
   - すべての時間
   - Cookie とキャッシュをクリア

4. 新しいシークレットウィンドウでテスト:
   - https://dash.rectbot.tech にアクセス
   - 「Discordでログイン」をクリック
   - 認証後、ダッシュボードが表示されればOK！

---

## トラブルシューティング

### Q: Secret を追加したのにまだエラーが出る

**A**: 
1. GitHub Actions のログを確認:
   ```
   === Environment Variables Check ===
   NEXT_PUBLIC_API_BASE_URL: SET  ← これが SET になっているか
   ```

2. ブラウザのキャッシュを完全にクリア

3. 5分待ってから再度テスト（Cloudflareのキャッシュ反映待ち）

### Q: どのSecretが必須か？

**A**: 
- **最優先**: NEXT_PUBLIC_API_BASE_URL, DISCORD_CLIENT_SECRET
- **認証に必要**: DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI, JWT_SECRET
- **データベース**: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- **Worker間通信**: SERVICE_TOKEN

---

**まず NEXT_PUBLIC_API_BASE_URL を追加してください！これが現在のエラーの原因です。**
