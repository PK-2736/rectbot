# Discord OAuth フローのデバッグ手順

## 問題: "Invalid code in request" エラー

このエラーは以下の理由で発生します:

### 1. リダイレクトURIの不一致（最も一般的）

Discord OAuth では以下の3箇所でリダイレクトURIが**完全に一致**している必要があります:

#### ① Discord Developer Portal
```
https://api.rectbot.tech/api/discord/callback
```

#### ② 認証URLの生成時（フロントエンド）
```typescript
// discord-auth.ts または AdminDashboard.tsx
redirect_uri: 'https://api.rectbot.tech/api/discord/callback'
```

#### ③ トークン交換時（バックエンド）
```javascript
// backend/index.js
env.DISCORD_REDIRECT_URI = 'https://api.rectbot.tech/api/discord/callback'
```

### 2. 確認手順

#### Step 1: Discord Developer Portal を確認

1. https://discord.com/developers/applications/1048950201974542477/oauth2 にアクセス
2. "Redirects" セクションを確認
3. 以下が登録されているか確認:
   ```
   https://api.rectbot.tech/api/discord/callback
   ```
4. もし以下のような**異なる**URIが登録されている場合は削除:
   - `https://dash.rectbot.tech/...` ← ダッシュボードのURL（間違い）
   - `http://api.rectbot.tech/...` ← httpプロトコル（間違い）
   - `https://api.rectbot.tech/api/discord/callback/` ← 末尾のスラッシュ（間違い）

#### Step 2: 環境変数を確認

ターミナルで以下を実行:

```bash
cd /workspaces/rectbot
echo "=== Backend wrangler.toml ==="
grep -A 1 "DISCORD_REDIRECT_URI" backend/wrangler.toml

echo ""
echo "=== Frontend .env.production ==="
grep "REDIRECT_URI" frontend/dashboard/.env.production

echo ""
echo "=== GitHub Secrets (Actions) ==="
echo "GitHub Actions で設定されている DISCORD_REDIRECT_URI を確認してください"
```

#### Step 3: 新しいOAuth認証を試す

**重要**: OAuth code は1回しか使えません。以下の手順で**新しい**認証を開始してください:

1. ブラウザのシークレットモード/プライベートモードを開く
2. https://dash.rectbot.tech にアクセス
3. 「Discordでログイン」をクリック
4. Discord認証画面で「認証」をクリック
5. エラーが出たら、ブラウザのURLバーのURLをコピーして教えてください

### 3. よくある間違い

#### ❌ 間違い 1: ページをリロード
```
OAuth code は1回しか使えないため、認証後のページをリロードすると
"Invalid code" エラーになります
```

#### ❌ 間違い 2: Discord Developer Portal に dash.rectbot.tech を登録
```
リダイレクト先は api.rectbot.tech であり、dash.rectbot.tech ではありません
Worker（API）が OAuth コールバックを処理した後、Worker がダッシュボードにリダイレクトします
```

#### ❌ 間違い 3: 環境変数の不一致
```
GitHub Actions: DISCORD_REDIRECT_URI=https://api.rectbot.tech/api/discord/callback
wrangler.toml:  DISCORD_REDIRECT_URI = "https://api.rectbot.tech/api/discord/callback"
.env.production: NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://api.rectbot.tech/api/discord/callback

すべて完全に一致している必要があります
```

### 4. デバッグ方法

#### Worker ログを確認:

```bash
cd /workspaces/rectbot/backend
npx wrangler tail
```

別のターミナルで認証を試行すると、リアルタイムでログが表示されます:
- `redirect_uri` の実際の値
- `code` が存在するか
- Discord API のエラーレスポンス

### 5. 解決策

もし上記を確認しても解決しない場合、以下を試してください:

#### 解決策 A: Discord Developer Portal を再設定

1. 既存のリダイレクトURIをすべて削除
2. 以下を新規追加（コピー&ペースト）:
   ```
   https://api.rectbot.tech/api/discord/callback
   ```
3. "Save Changes" をクリック
4. 5分待ってから再度認証を試す

#### 解決策 B: 環境変数を再デプロイ

```bash
cd /workspaces/rectbot
git add .
git commit -m "Fix Discord OAuth redirect URI"
git push origin main
```

GitHub Actions が完了するまで待ってから、再度認証を試してください。

---

## 次のステップ

1. Discord Developer Portal の Redirects を確認して、スクリーンショットまたはテキストで教えてください
2. 上記の環境変数確認コマンドの結果を教えてください
3. 新しいシークレットモードで認証を試して、エラーが出た場合はURLとエラーメッセージを教えてください
