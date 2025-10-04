# 🎯 OAuth問題 - 最終確認手順

## 現在の状況

✅ Discord Developer Portal: 正しく設定済み
✅ コード実装: 正しく実装済み
✅ Cloudflare Workers: 正常にデプロイ済み
❓ GitHub Secret `DISCORD_REDIRECT_URI`: **確認が必要**

---

## 📋 3ステップで解決

### Step 1: GitHub Secret を確認

1. https://github.com/PK-2736/rectbot/settings/secrets/actions にアクセス

2. `DISCORD_REDIRECT_URI` が存在するか確認

3. 存在する場合:
   - クリックして "Update secret"
   - 値を確認（表示はされませんが、間違っている可能性あり）
   - 以下をコピー&ペーストで上書き:
     ```
     https://api.rectbot.tech/api/discord/callback
     ```
   - "Update secret" をクリック

4. 存在しない場合:
   - "New repository secret" をクリック
   - Name: `DISCORD_REDIRECT_URI`
   - Value: `https://api.rectbot.tech/api/discord/callback`
   - "Add secret" をクリック

---

### Step 2: 再デプロイ

以下のコマンドを実行:

```bash
cd /workspaces/rectbot
git commit --allow-empty -m "Redeploy to fix OAuth redirect URI"
git push origin main
```

---

### Step 3: テスト

デプロイ完了後（約2分）:

1. **新しいシークレットウィンドウ**を開く（Ctrl+Shift+N）

2. https://dash.rectbot.tech にアクセス

3. 「Discordでログイン」をクリック

4. **重要**: Discord認証画面のURLバーを確認
   
   ✅ **成功パターン**:
   ```
   discord.com/oauth2/authorize?...&redirect_uri=https%3A%2F%2Fapi.rectbot.tech%2Fapi%2Fdiscord%2Fcallback
   ```
   → このURLなら「認証」をクリックしてOK！

   ❌ **失敗パターン**:
   ```
   discord.com/oauth2/authorize?...&redirect_uri=https%3A%2F%2Fdash.rectbot.tech%...
   ```
   → まだ GitHub Secret が反映されていません
   → もう一度 Step 1 を確認

---

## 🔍 トラブルシューティング

### Q: Step 2の後もまだ失敗パターンのURLになる

**A**: 以下を確認:

1. GitHub Actions が完了したか確認
   https://github.com/PK-2736/rectbot/actions

2. "Build Dashboard" ステップのログを確認:
   ```
   NEXT_PUBLIC_DISCORD_REDIRECT_URI: SET
   ```
   と表示されているか

3. ブラウザのキャッシュをクリア:
   - Ctrl+Shift+Delete
   - "すべての時間" を選択
   - "キャッシュされた画像とファイル" にチェック
   - クリア

4. それでもダメなら10分待ってから再度テスト
   （Cloudflare Pages のキャッシュ反映待ち）

---

### Q: "Invalid code" エラーが出る

**A**: 以下を確認:

1. Discord認証画面のURLが正しい（api.rectbot.tech）か確認済み？
   → YES: 必ず**新しいシークレットウィンドウ**で試す
   → NO: まだ GitHub Secret が反映されていない

2. エラー後に「戻る」ボタンを押して再試行していない？
   → OAuth code は1回限り有効
   → 必ず新しいシークレットウィンドウで最初から試す

---

## ✅ 成功の確認

以下がすべて当てはまればOK:

- [ ] Discord認証画面のURLに `api.rectbot.tech` が含まれている
- [ ] 「認証」をクリック後、エラーなく dash.rectbot.tech にリダイレクトされる
- [ ] ダッシュボードが表示される

---

**まず Step 1 の GitHub Secret 確認から始めてください！**
