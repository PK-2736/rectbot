# 🔧 管理者権限エラー修正ガイド

## 問題の症状

```
アクセス拒否
管理者権限がありません。
ログアウト
```

このエラーが表示される場合、以下のいずれかの原因が考えられます。

---

## 原因と解決方法

### ✅ 1. Discord ユーザー ID を確認

まず、あなたの Discord ユーザー ID を確認してください。

#### 方法1: Discord 開発者モードで確認
1. Discord アプリを開く
2. **設定** → **詳細設定** → **開発者モード** をオンにする
3. 自分のアイコンを右クリック → **"ID をコピー"**
4. コピーした ID を控えておく（例: `726195003780628621`）

#### 方法2: ブラウザの開発者コンソールで確認
1. https://dash.rectbot.tech にアクセス
2. **F12** キーを押して開発者ツールを開く
3. **Console** タブを開く
4. Discord ログイン後、以下のログを確認:
   ```
   User authenticated: { id: "726195003780628621", username: "YourName", ... }
   User ID: 726195003780628621
   User role: user または admin
   Is admin: true または false
   ```

5. **Is admin: false** と表示されている場合、環境変数の設定が必要です

---

### ✅ 2. Cloudflare Workers の環境変数を確認・設定

#### Step 1: Cloudflare Dashboard にアクセス
1. https://dash.cloudflare.com/ にログイン
2. **Workers & Pages** をクリック
3. **rectbot-backend** (または該当する Worker 名) をクリック

#### Step 2: 環境変数を確認
1. **Settings** タブをクリック
2. **Variables** セクションを開く
3. `ADMIN_DISCORD_ID` を探す

#### Step 3: 環境変数を設定
- **既に ADMIN_DISCORD_ID が存在する場合**:
  1. **Edit** をクリック
  2. Value に正しい Discord ユーザー ID を入力（例: `726195003780628621`）
  3. **Save** をクリック

- **ADMIN_DISCORD_ID が存在しない場合**:
  1. **Add variable** をクリック
  2. Variable name: `ADMIN_DISCORD_ID`
  3. Value: あなたの Discord ユーザー ID（例: `726195003780628621`）
  4. **Type**: `Text` を選択（**Secret** にはしない）
  5. **Save** をクリック

#### 複数の管理者を設定する場合
カンマ区切りで複数の ID を指定できます:
```
726195003780628621,123456789012345678,987654321098765432
```

#### Step 4: Worker を再デプロイ
環境変数を変更した後は、Worker を再デプロイする必要があります:

```bash
cd /workspaces/rectbot/backend
wrangler deploy
```

---

### ✅ 3. GitHub Actions で自動デプロイしている場合

#### GitHub Secrets を確認
1. https://github.com/PK-2736/rectbot/settings/secrets/actions にアクセス
2. `ADMIN_DISCORD_ID` を確認

#### 設定または更新
- **既に存在する場合**:
  1. `ADMIN_DISCORD_ID` をクリック
  2. **Update secret** をクリック
  3. Value に正しい Discord ユーザー ID を入力
  4. **Update secret** をクリック

- **存在しない場合**:
  1. **New repository secret** をクリック
  2. Name: `ADMIN_DISCORD_ID`
  3. Value: あなたの Discord ユーザー ID
  4. **Add secret** をクリック

#### 再デプロイ
GitHub Actions でデプロイする場合:
```bash
git commit --allow-empty -m "Redeploy with updated ADMIN_DISCORD_ID"
git push
```

---

## 🔍 デバッグ手順

### 1. ブラウザのコンソールで確認
F12 キーを押して Console タブを開き、以下の情報を確認:

```javascript
// ログイン後に表示されるログ
User authenticated: { id: "...", username: "...", ... }
User ID: ...
User role: user または admin
Is admin: true または false
```

### 2. Worker のログを確認
Cloudflare Dashboard から:
1. **Workers & Pages** → **rectbot-backend**
2. **Logs** タブをクリック
3. **Begin log stream** をクリック
4. ダッシュボードにアクセスして、以下のログを確認:

```
Auth check - User: YourName Role: admin
```

もし `Role: user` と表示されている場合、ADMIN_DISCORD_ID が正しく設定されていません。

### 3. 環境変数が正しく読み込まれているか確認
Worker のコンソールログで以下を確認:
```
Discord OAuth success: YourName
User ID: 726195003780628621
User role: admin ← これが "user" になっている場合は設定が間違っている
```

---

## 📋 チェックリスト

- [ ] Discord ユーザー ID を確認した
- [ ] Cloudflare Workers の環境変数 `ADMIN_DISCORD_ID` を設定した
- [ ] Worker を再デプロイした（`wrangler deploy`）
- [ ] ブラウザのキャッシュとCookieをクリアした
- [ ] 再度ログインして管理者権限を確認した

---

## 🚨 それでも解決しない場合

### Cookie が正しく設定されていない可能性
1. ブラウザの開発者ツール（F12）を開く
2. **Application** タブ → **Cookies** → `https://dash.rectbot.tech`
3. `jwt` という名前の Cookie が存在することを確認
4. 存在しない場合:
   - ログアウトして再度ログイン
   - Cookie が設定されるか確認

### ドメイン設定を確認
`backend/index.js` の Cookie 設定を確認:
```javascript
const cookieValue = `jwt=${jwt}; Domain=.rectbot.tech; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`;
```

- `Domain=.rectbot.tech` が正しく設定されているか
- ローカル開発の場合、`Domain` を削除する必要がある場合がある

---

## 💡 今回の修正内容

### 修正1: `/api/auth/me` エンドポイントを追加
- JWT から実際のユーザー情報を返すエンドポイントを実装
- ユーザー ID、ユーザー名、ロール、管理者フラグを返す

### 修正2: `AuthProvider` の認証チェックを改善
- `/api/auth/me` を呼び出して実際のユーザー情報を取得
- ダミーデータではなく、実際の Discord ユーザー ID を使用
- 管理者判定が正しく機能するように修正

### 修正3: デバッグログを追加
- ユーザー情報と管理者フラグをコンソールに出力
- 問題の診断がしやすくなった

---

## 📝 環境変数の最終確認

以下のコマンドで環境変数を確認できます（ローカル開発の場合）:

```bash
cd /workspaces/rectbot/backend
cat wrangler.toml | grep ADMIN_DISCORD_ID
```

本番環境（Cloudflare Workers）の場合:
1. Cloudflare Dashboard
2. Workers & Pages → rectbot-backend
3. Settings → Variables
4. `ADMIN_DISCORD_ID` の値を確認

---

## 🎯 期待される動作

修正後の正常な動作:
1. Discord でログインする
2. `/api/auth/me` が呼ばれ、JWT からユーザー情報を取得
3. ユーザー ID が `ADMIN_DISCORD_ID` と一致する場合、`isAdmin: true` が返される
4. 管理者ダッシュボードが表示される

ブラウザのコンソールに表示されるログ:
```
User authenticated: { id: "726195003780628621", username: "YourName", role: "admin", isAdmin: true }
User ID: 726195003780628621
User role: admin
Is admin: true
```
