# 🔐 管理者権限エラー解決ガイド

## エラー内容
```
管理者権限がありません。
このページを表示するには管理者としてログインする必要があります。
```

---

## 原因

Worker が JWT を発行する際、`ADMIN_DISCORD_ID` と比較してロールを決定しますが、
一致しない場合は `role: 'user'` になってしまいます。

---

## 解決方法

### Step 1: Discord ユーザー ID を確認

あなたの Discord ユーザー ID を確認してください:

**方法1: Discord開発者モードで確認**
1. Discord を開く
2. 設定 → 詳細設定 → 開発者モード をオン
3. 自分のアイコンを右クリック → "IDをコピー"

**方法2: ブラウザのコンソールで確認**
1. https://dash.rectbot.tech で F12 を押す
2. Console タブで Discord ログイン後に表示される:
   ```
   Discord OAuth success: [ユーザー名]
   User ID: 726195003780628621  ← これがあなたのID
   User role: user または admin
   ```

---

### Step 2: GitHub Secrets を確認・修正

https://github.com/PK-2736/rectbot/settings/secrets/actions にアクセス

#### ケースA: ADMIN_DISCORD_ID が存在する場合
1. `ADMIN_DISCORD_ID` をクリック
2. "Update secret" をクリック
3. Value に正しいDiscordユーザーIDを入力:
   ```
   726195003780628621
   ```
4. "Update secret" をクリック

#### ケースB: ADMIN_DISCORD_ID が存在しない場合
1. "New repository secret" をクリック
2. 設定:
   - Name: `ADMIN_DISCORD_ID`
   - Value: `726195003780628621`
3. "Add secret" をクリック

---

### Step 3: Worker を再デプロイ

```bash
cd /workspaces/rectbot
git commit --allow-empty -m "Trigger Worker redeploy for admin ID fix"
git push origin main
```

または GitHub Actions で手動再実行:
https://github.com/PK-2736/rectbot/actions
→ "Deploy Cloudflare Workers" → "Re-run all jobs"

---

### Step 4: テスト

1. **重要**: ブラウザのCookieを完全にクリア
   - Ctrl+Shift+Delete
   - "すべての時間" を選択
   - "Cookie とその他のサイトデータ" をクリア

2. 新しいシークレットウィンドウを開く

3. https://dash.rectbot.tech にアクセス

4. F12 → Console タブで以下を確認:
   ```
   Discord OAuth success: [ユーザー名]
   User ID: 726195003780628621
   User role: admin  ← これが "admin" になっていればOK
   ```

5. Discord ログインを実行

6. ダッシュボードが表示されればOK！🎉

---

## トラブルシューティング

### Q1: まだ "User role: user" と表示される

**A**: GitHub Secret の更新が反映されていません

1. GitHub Actions のログを確認:
   - https://github.com/PK-2736/rectbot/actions
   - "Deploy Cloudflare Workers" の最新ログ
   - Secret の登録ログを確認

2. Worker を手動で再デプロイ:
   ```bash
   cd /workspaces/rectbot/backend
   npx wrangler deploy
   ```

3. 5分待ってから再度テスト

### Q2: "User ID: [違うID]" と表示される

**A**: 別のDiscordアカウントでログインしています

1. Discord からログアウト
2. 正しいアカウントでログイン
3. ブラウザのCookieをクリア
4. 再度 OAuth 認証

### Q3: コンソールに何も表示されない

**A**: Worker のログが出力されていません

1. F12 → Network タブを確認
2. `/api/discord/callback` のリクエストを確認
3. レスポンスヘッダーに `Set-Cookie` があるか確認

---

## 複数の管理者を設定

複数のDiscordユーザーを管理者にする場合:

GitHub Secret `ADMIN_DISCORD_ID` の値をカンマ区切りで設定:
```
726195003780628621,987654321012345678,123456789012345678
```

スペースは入れないでください（カンマのみ）

---

## 確認コマンド

現在の設定を確認:

```bash
# backend/wrangler.toml
grep ADMIN_DISCORD_ID backend/wrangler.toml

# Worker の環境変数（デプロイ済み）
cd backend && npx wrangler secret list
```

---

**まず Step 1 と Step 2 を完了してください。GitHub Secret が正しく設定されていれば、再デプロイ後に管理者権限が付与されます。**
