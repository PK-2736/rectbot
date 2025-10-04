# 🔧 JWT Cookie 認証修正 - 完了

## 修正内容

### 1. Worker (backend/index.js)
**問題**: Cookie に Domain 属性がなく、サブドメイン間で共有できなかった

**修正**:
```javascript
'Set-Cookie': `jwt=${jwt}; Domain=.rectbot.tech; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`
```

`Domain=.rectbot.tech` を追加することで:
- `api.rectbot.tech` で設定したCookieを
- `dash.rectbot.tech` から読み取れるようになりました

---

### 2. AuthProvider (frontend/dashboard/src/components/AuthProvider.tsx)
**問題**: URLパラメータとlocalStorageだけをチェックし、Cookieを確認していなかった

**修正**:
- ページロード時に Worker の `/api/recruitment/list` を呼び出し
- `credentials: 'include'` でCookieを送信
- レスポンスが200なら認証済み、401なら未認証と判定

---

### 3. AdminDashboard (frontend/dashboard/src/components/AdminDashboard.tsx)
**問題**: 相対パス `/api/recruitment` を使っていたため、`dash.rectbot.tech/api/recruitment` を呼び出していた

**修正**:
```typescript
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.rectbot.tech';
const url = `${apiBaseUrl}/api/recruitment/list`;
```

正しいWorkerのエンドポイントを呼び出すように修正

---

## テスト手順

### Step 1: デプロイ完了を待つ

約2-3分後、以下を確認:
- https://github.com/PK-2736/rectbot/actions
- "Deploy to Cloudflare Pages" が成功
- "Deploy Cloudflare Workers" が成功

---

### Step 2: ブラウザのCookieをクリア

**重要**: 古いCookieが残っていると問題が起きます

1. Ctrl+Shift+Delete（Windowsの場合）
2. "すべての時間" を選択
3. "Cookie とその他のサイトデータ" にチェック
4. "データを削除" をクリック

---

### Step 3: 新しいシークレットウィンドウでテスト

1. **新しいシークレットウィンドウ** を開く（Ctrl+Shift+N）
2. https://dash.rectbot.tech にアクセス
3. 「Discordでログイン」をクリック
4. Discord で「認証」をクリック
5. dash.rectbot.tech にリダイレクトされる
6. **ダッシュボードが表示されればOK！** 🎉

---

### Step 4: Cookie を確認（オプション）

デバッグのため、ブラウザの開発者ツールで確認:

1. F12 キーを押す
2. "Application" タブ → "Cookies" → "https://dash.rectbot.tech"
3. `jwt` という名前のCookieが存在するか確認
4. Domain が `.rectbot.tech` になっているか確認

---

## 期待される動作

### ✅ 成功パターン

1. ログインボタンクリック
2. Discord認証画面が表示
3. 「認証」をクリック
4. dash.rectbot.tech にリダイレクト
5. **ダッシュボードが表示される**（ログイン画面に戻らない）

### ❌ 失敗パターン

もしまだログイン画面に戻る場合:

#### チェックリスト:
- [ ] デプロイが完了している
- [ ] ブラウザのCookieをクリアした
- [ ] 新しいシークレットウィンドウを使っている
- [ ] F12 → Console タブでエラーが出ていないか確認

#### デバッグ情報:
F12 → Console タブに以下が表示されるはず:

```
User authenticated via cookie  ← 認証成功
```

または:

```
User not authenticated  ← 認証失敗
```

認証失敗の場合:
- Network タブで `/api/recruitment/list` のリクエストを確認
- Cookie ヘッダーに `jwt` が含まれているか確認
- レスポンスのステータスコードを確認（200 or 401）

---

## トラブルシューティング

### Q1: まだログイン画面に戻る
**A**: 
1. ブラウザのCookieを完全にクリア
2. 5分待ってからテスト（Cloudflareのキャッシュ反映待ち）
3. F12 → Console → Network で `/api/recruitment/list` の詳細を確認

### Q2: "CORS error" が出る
**A**: 
- Worker の CORS 設定は修正済み
- ブラウザのキャッシュをクリア
- シークレットウィンドウで試す

### Q3: Cookie が設定されない
**A**:
- Worker のログを確認: `cd /workspaces/rectbot/backend && npx wrangler tail`
- 認証後のリダイレクトで `Set-Cookie` ヘッダーが送信されているか確認

---

**デプロイが完了したら、上記の手順でテストしてください！**
