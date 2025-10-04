# 🚨 OAuth エラー解決方法（確定版）

## 問題の診断結果

### ✅ 正常な設定
1. Discord Developer Portal の Redirects: `https://api.rectbot.tech/api/discord/callback` ✅
2. Cloudflare Worker の環境変数: 正常 ✅
3. コードの実装: 正常 ✅

### ❌ 問題箇所
**GitHub Secret `DISCORD_REDIRECT_URI` の値が間違っている可能性**

スクリーンショットの Discord 認証画面 URL:
```
redirect_uri=https%3A%2F%2Fdash.rectbot.tech%...
```

これは `https://dash.rectbot.tech/...` にデコードされますが、
正しくは `https://api.rectbot.tech/api/discord/callback` であるべきです。

---

## 🔧 解決方法

### Step 1: GitHub Secrets を確認・修正

1. **アクセス**: https://github.com/PK-2736/rectbot/settings/secrets/actions

2. **確認**: `DISCORD_REDIRECT_URI` の値を確認

3. **修正が必要な場合**:
   - `DISCORD_REDIRECT_URI` をクリック
   - "Update secret" をクリック
   - 以下をコピー&ペースト:
     ```
     https://api.rectbot.tech/api/discord/callback
     ```
   - "Update secret" をクリック

### Step 2: 再デプロイ

GitHub Secret を修正したら、以下のいずれかで再デプロイ:

#### 方法A: 空コミットでトリガー
```bash
cd /workspaces/rectbot
git commit --allow-empty -m "Trigger redeploy after GitHub Secret fix"
git push origin main
```

#### 方法B: GitHub Actions で手動再実行
1. https://github.com/PK-2736/rectbot/actions にアクセス
2. 最新の workflow をクリック
3. "Re-run all jobs" をクリック

### Step 3: デプロイログを確認

GitHub Actions のログで以下を確認:

```
=== Environment Variables Check ===
NEXT_PUBLIC_DISCORD_CLIENT_ID: SET
NEXT_PUBLIC_DISCORD_REDIRECT_URI: SET   ← これが SET であることを確認
NEXT_PUBLIC_API_BASE_URL: SET
NEXT_PUBLIC_ADMIN_IDS: SET
===================================
```

### Step 4: テスト

1. **新しいシークレットウィンドウ** を開く（重要！）
2. https://dash.rectbot.tech にアクセス
3. 「Discordでログイン」をクリック
4. **Discord認証画面のURLバー**を確認:

   ✅ **正しい場合**:
   ```
   discord.com/oauth2/authorize?...&redirect_uri=https%3A%2F%2Fapi.rectbot.tech%2Fapi%2Fdiscord%2Fcallback
   ```

   ❌ **まだ間違っている場合**:
   ```
   discord.com/oauth2/authorize?...&redirect_uri=https%3A%2F%2Fdash.rectbot.tech%...
   ```
   → GitHub Secret の修正が反映されていないので、もう一度確認

5. 「認証」をクリック
6. dash.rectbot.tech にリダイレクトされればOK！ 🎉

---

## 📋 トラブルシューティング

### Q1: GitHub Secret を修正したのにまだ間違っている
**A**: 
- ブラウザのキャッシュをクリア（Ctrl+Shift+Delete）
- 必ず新しいシークレットウィンドウを使う
- Cloudflare Pages のキャッシュが残っている可能性
  → 10分ほど待ってから再度テスト

### Q2: デプロイログで "SET" と表示されるのに反映されない
**A**: 
- Next.js のビルドキャッシュが残っている可能性
- GitHub Actions で "Re-run all jobs" を実行
- または以下で強制再ビルド:
  ```bash
  cd /workspaces/rectbot/frontend/dashboard
  rm -rf .next out node_modules/.cache
  ```
  その後コミット&プッシュ

### Q3: まだ "Invalid code" エラーが出る
**A**:
- Discord認証画面のURLで `redirect_uri` を確認
- もし正しくなっていれば、**必ず新しいシークレットウィンドウ**で試す
- OAuth code は1回しか使えないため、エラー後に戻るボタンを押すと必ず失敗する

---

## 🎯 確認チェックリスト

- [ ] GitHub Secret `DISCORD_REDIRECT_URI` = `https://api.rectbot.tech/api/discord/callback`
- [ ] GitHub Actions で再デプロイ実行
- [ ] デプロイログで `NEXT_PUBLIC_DISCORD_REDIRECT_URI: SET` を確認
- [ ] 新しいシークレットウィンドウで https://dash.rectbot.tech にアクセス
- [ ] Discord認証画面のURLで `redirect_uri=https%3A%2F%2Fapi.rectbot.tech` を確認
- [ ] 認証成功後、dash.rectbot.tech にリダイレクトされる

---

## 💡 重要なポイント

1. **GitHub Secret が最優先**: コードやファイルが正しくても、GitHub Secret が間違っていたら動作しません
2. **必ず新しいウィンドウ**: OAuth code は1回限り有効なので、毎回新しいシークレットウィンドウで試してください
3. **URLバーで確認**: Discord認証画面で必ずURLバーの `redirect_uri` を確認してください

---

準備ができたら、上記の手順で GitHub Secret を確認・修正してください！
