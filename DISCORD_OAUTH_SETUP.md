# Discord OAuth エラーの解決ガイド

## ❌ 現在のエラー
```
認証エラー
Failed to get Discord access token: unknown error - no description
```

## 🔍 原因
Cloudflare Workerに Discord OAuth の環境変数が設定されていません。

## ✅ 必要な環境変数

Cloudflare Dashboard で以下の環境変数/シークレットを設定してください：

### 1. Discord OAuth 設定

| 変数名 | 値の取得方法 | タイプ |
|--------|-------------|--------|
| `DISCORD_CLIENT_ID` | Discord Developer Portal | Text |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal | **Encrypt (シークレット)** |
| `DISCORD_REDIRECT_URI` | `https://api.rectbot.tech/api/discord/callback` | Text |

### 2. セキュリティ設定

| 変数名 | 値 | タイプ |
|--------|-----|--------|
| `JWT_SECRET` | ランダムな長い文字列（32文字以上推奨） | **Encrypt (シークレット)** |
| `ADMIN_DISCORD_ID` | あなたのDiscord User ID | Text |

### 3. Supabase 設定（オプション）

| 変数名 | 値の取得方法 | タイプ |
|--------|-------------|--------|
| `SUPABASE_URL` | Supabase Project Settings | Text |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API Settings | **Encrypt (シークレット)** |

### 4. VPS接続設定（既に設定済み）

| 変数名 | 値 | タイプ |
|--------|-----|--------|
| `VPS_EXPRESS_URL` | `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com` | Text |
| `SERVICE_TOKEN` | `rectbot-service-token-2024` | **Encrypt (シークレット)** |

---

## 🔧 Discord Developer Portal での設定

### ステップ1: Discord Application にアクセス

1. https://discord.com/developers/applications にアクセス
2. あなたの Discord Bot アプリケーションを選択

### ステップ2: OAuth2 設定を確認

1. 左メニューから **OAuth2** → **General** を選択
2. 以下の情報を確認：

   - **CLIENT ID**: コピーしておく
   - **CLIENT SECRET**: 「Reset Secret」をクリックして新しいシークレットを生成（既存のものがあればそれを使用）
   - **Redirects**: `https://api.rectbot.tech/api/discord/callback` が登録されているか確認

### ステップ3: Redirect URI の追加（必要な場合）

1. **Redirects** セクション
2. **Add Redirect** をクリック
3. `https://api.rectbot.tech/api/discord/callback` を入力
4. **Save Changes** をクリック

---

## 🔧 Cloudflare Dashboard での設定

### ステップ1: Worker Settings にアクセス

1. https://dash.cloudflare.com → **Workers & Pages**
2. **rectbot-backend** を選択
3. **Settings** → **Variables and Secrets**

### ステップ2: 環境変数を追加

#### 必須の設定（Discord OAuth）:

1. **DISCORD_CLIENT_ID**
   - Variable name: `DISCORD_CLIENT_ID`
   - Value: Discord Developer Portal からコピーした CLIENT ID
   - Type: **Text**

2. **DISCORD_CLIENT_SECRET** ⚠️ シークレット
   - Variable name: `DISCORD_CLIENT_SECRET`
   - Value: Discord Developer Portal からコピーした CLIENT SECRET
   - Type: **Encrypt** ← 必ず暗号化！

3. **DISCORD_REDIRECT_URI**
   - Variable name: `DISCORD_REDIRECT_URI`
   - Value: `https://api.rectbot.tech/api/discord/callback`
   - Type: **Text**

4. **JWT_SECRET** ⚠️ シークレット
   - Variable name: `JWT_SECRET`
   - Value: ランダムな文字列（例: `your-super-secret-jwt-key-2024-rectbot-secure`）
   - Type: **Encrypt** ← 必ず暗号化！

5. **ADMIN_DISCORD_ID**
   - Variable name: `ADMIN_DISCORD_ID`
   - Value: あなたの Discord User ID（カンマ区切りで複数指定可）
   - Type: **Text**
   - 例: `123456789012345678` または `123456789012345678,987654321098765432`

#### オプション（Supabase）:

6. **SUPABASE_URL**
   - Variable name: `SUPABASE_URL`
   - Value: `https://your-project.supabase.co`
   - Type: **Text**

7. **SUPABASE_SERVICE_ROLE_KEY** ⚠️ シークレット
   - Variable name: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: Supabase の Service Role Key
   - Type: **Encrypt**

---

## 📝 Discord User ID の取得方法

### 方法1: Discord Developer Mode（推奨）

1. Discord アプリを開く
2. **設定** → **詳細設定** → **開発者モード** をオンにする
3. 自分のユーザー名を右クリック → **IDをコピー**

### 方法2: ブラウザで確認

1. Discord Web版にアクセス: https://discord.com/app
2. F12 キーでデベロッパーツールを開く
3. Consoleタブで以下を実行:
   ```javascript
   DiscordNative.crashReporter.getMetadata().user_id
   ```

---

## 🧪 JWT_SECRET の生成方法

### PowerShell で生成:

```powershell
# 32文字のランダム文字列を生成
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### オンラインツール:

- https://randomkeygen.com/
- "Fort Knox Passwords" セクションの値を使用

---

## ✅ 設定完了後の確認

### 1. 環境変数の確認

Cloudflare Worker の Status endpoint で確認:

```powershell
curl https://api.rectbot.tech/api/status
```

期待されるレスポンス:
```json
{
  "status": "ok",
  "env": {
    "VPS_EXPRESS_URL": true,
    "SERVICE_TOKEN": true,
    "DISCORD_CLIENT_ID": true,
    "DISCORD_CLIENT_SECRET": true,
    "DISCORD_REDIRECT_URI": true,
    "JWT_SECRET": true,
    "ADMIN_DISCORD_ID": true
  }
}
```

### 2. OAuth フローのテスト

1. ブラウザで以下にアクセス:
   ```
   https://dash.rectbot.tech
   ```

2. **Discord でログイン** ボタンをクリック

3. Discord 認証画面が表示される

4. 認証後、ダッシュボードにリダイレクトされる

5. エラーが出なければ成功！

---

## 🐛 トラブルシューティング

### エラー: "unknown error - no description"

**原因**: DISCORD_CLIENT_SECRET が設定されていない、または間違っている

**解決方法**:
1. Discord Developer Portal で CLIENT SECRET を確認
2. Cloudflare Dashboard で DISCORD_CLIENT_SECRET を再設定
3. 5分待ってから再テスト

### エラー: "Invalid redirect_uri"

**原因**: Discord Developer Portal の Redirect URI が正しく設定されていない

**解決方法**:
1. Discord Developer Portal → OAuth2 → General
2. Redirects に `https://api.rectbot.tech/api/discord/callback` を追加
3. Save Changes

### エラー: "Unauthorized" (401)

**原因**: JWT_SECRET が設定されていない、または ADMIN_DISCORD_ID が正しくない

**解決方法**:
1. JWT_SECRET を設定
2. ADMIN_DISCORD_ID にあなたの Discord User ID を設定
3. Worker を再デプロイ

### 環境変数が反映されない

**解決方法**:
```powershell
cd backend
npx wrangler deploy
```

---

## 📚 参考資料

- Discord OAuth2 Documentation: https://discord.com/developers/docs/topics/oauth2
- Cloudflare Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/

---

## ✨ 設定完了後の動作

すべての設定が完了すると：

1. ✅ ユーザーが Discord でログイン
2. ✅ JWT が発行され、Cookie に保存
3. ✅ 管理者は募集データを管理できる
4. ✅ 一般ユーザーは閲覧のみ可能

セキュアな認証フローが完成します！🎉
