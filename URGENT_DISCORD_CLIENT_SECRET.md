# 🚨 緊急: DISCORD_CLIENT_SECRET が未設定です

## 現在の状況

Discord OAuth認証で以下のエラーが発生しています：
```
Failed to get Discord access token
```

**原因:** `DISCORD_CLIENT_SECRET` がGitHub Secretsに設定されていません。

---

## ✅ 即座に実行すべき手順

### 1. Discord Client Secret を取得

1. 以下のURLにアクセス：
   ```
   https://discord.com/developers/applications/1048950201974542477/oauth2
   ```

2. **Client information** セクションを見つける

3. **Client Secret** の下にある `Reset Secret` ボタンをクリック
   ⚠️ **重要:** Secretは一度しか表示されません！

4. 表示された長い文字列をコピー（例: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`）

5. **安全な場所に保存**（後で使用します）

### 2. GitHub Secretsに追加

1. 以下のURLにアクセス：
   ```
   https://github.com/PK-2736/rectbot/settings/secrets/actions
   ```

2. `New repository secret` ボタンをクリック

3. 以下を入力：
   - **Name:** `DISCORD_CLIENT_SECRET`
   - **Value:** （ステップ1でコピーしたSecret）

4. `Add secret` ボタンをクリック

### 3. 他の必須Secretsも追加

同じ手順で以下も追加してください：

#### JWT_SECRET
- **Name:** `JWT_SECRET`
- **Value:** `T/JxEeeJZZ0ywZTnropyM/DWHtwy2b/F0eSgSrHqSUM=`

#### SERVICE_TOKEN
- **Name:** `SERVICE_TOKEN`
- **Value:** 任意のランダム文字列（生成方法は下記参照）

```bash
# ランダムトークンを生成
openssl rand -base64 32
```

#### SUPABASE_SERVICE_ROLE_KEY
- **Name:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** Supabase Dashboard → Project Settings → API → service_role key

### 4. 再デプロイ

Secretsを追加したら、リポジトリを更新してデプロイをトリガーします：

```bash
git commit --allow-empty -m "Trigger redeploy after adding secrets"
git push origin main
```

### 5. デプロイログで確認

GitHub Actions のログ（https://github.com/PK-2736/rectbot/actions）で以下が表示されることを確認：

```
Registering DISCORD_CLIENT_SECRET
Registering JWT_SECRET
Registering SUPABASE_SERVICE_ROLE_KEY
Registering SERVICE_TOKEN
```

そして、Worker bindings に以下が表示されるべき：

```
env.DISCORD_CLIENT_ID ("(hidden)")
env.DISCORD_CLIENT_SECRET ("(hidden)")  ← これが追加される
env.DISCORD_REDIRECT_URI ("...")
env.JWT_SECRET ("(hidden)")  ← これが追加される
env.SUPABASE_URL ("(hidden)")
env.SUPABASE_SERVICE_ROLE_KEY ("(hidden)")  ← これが追加される
env.SERVICE_TOKEN ("(hidden)")  ← これが追加される
```

---

## 🧪 テスト

すべてのSecretsを設定した後：

1. https://dash.rectbot.tech にアクセス
2. Discord OAuth ログインをクリック
3. Discordで認可
4. エラーが出ずにダッシュボードにリダイレクトされる ✅

---

## 📋 チェックリスト

- [ ] Discord Developer PortalでClient Secretを取得
- [ ] GitHub Secretsに `DISCORD_CLIENT_SECRET` を追加
- [ ] GitHub Secretsに `JWT_SECRET` を追加
- [ ] GitHub Secretsに `SERVICE_TOKEN` を追加
- [ ] GitHub Secretsに `SUPABASE_SERVICE_ROLE_KEY` を追加
- [ ] 再デプロイ（git push）
- [ ] デプロイログでSecretsの登録を確認
- [ ] OAuth認証をテスト

---

## ❓ トラブルシューティング

### Q: Client Secretが見つからない

**A:** Discord Developer Portalで `Reset Secret` をクリックすると新しいSecretが生成されます。古いSecretは無効になります。

### Q: Secretを間違えて入力した

**A:** GitHub Secrets ページで該当のSecretを削除し、正しい値で再度追加してください。

### Q: デプロイ後もエラーが続く

**A:** 詳細なエラーログが追加されました。もう一度認証を試して、表示されるエラーメッセージを確認してください。

---

## 🎯 まとめ

最も重要なのは **`DISCORD_CLIENT_SECRET`** です。これがないとDiscord APIへの認証が一切できません。

上記の手順1〜5を実行すれば、認証が成功するはずです！🚀
