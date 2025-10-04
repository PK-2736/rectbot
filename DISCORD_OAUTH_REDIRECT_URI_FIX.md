# Discord OAuth リダイレクトURI 設定ガイド

## ⚠️ 「リダイレクトURIが無効です」エラーの解決方法

### 問題
Discord OAuthログイン時に「リダイレクトURIが無効です」というエラーが表示される。

### 原因
Discord Developer Portalに登録されているリダイレクトURIと、アプリケーションが使用しているリダイレクトURIが一致していない。

---

## 📋 正しい設定

### 1. アプリケーションが使用するリダイレクトURI

現在の設定（`.env.production`）:
```
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://api.rectbot.tech/api/discord/callback
```

これは **Cloudflare Worker（API）のエンドポイント** です。

### 2. Discord Developer Portalでの設定

#### ステップ1: Discord Developer Portalにアクセス
```
https://discord.com/developers/applications
```

#### ステップ2: アプリケーションを選択
- アプリケーションID: `1048950201974542477`

#### ステップ3: OAuth2設定を開く
- 左メニュー → **OAuth2** → **General**

#### ステップ4: リダイレクトURIを追加

**Redirects** セクションで、以下を**正確に**追加してください：

```
https://api.rectbot.tech/api/discord/callback
```

⚠️ **重要な注意点:**
- ✅ プロトコルは `https://`（`http://`ではない）
- ✅ ドメインは `api.rectbot.tech`（`dash.rectbot.tech`ではない）
- ✅ パスは `/api/discord/callback`
- ✅ 末尾にスラッシュ `/` は**つけない**
- ✅ 大文字小文字は厳密に一致させる

#### ステップ5: 保存
- **Save Changes** ボタンをクリック

---

## 🔍 よくある間違い

| ❌ 間違った設定 | ✅ 正しい設定 |
|--------------|------------|
| `https://dash.rectbot.tech/callback` | `https://api.rectbot.tech/api/discord/callback` |
| `https://api.rectbot.tech/api/discord/callback/` | `https://api.rectbot.tech/api/discord/callback` |
| `http://api.rectbot.tech/api/discord/callback` | `https://api.rectbot.tech/api/discord/callback` |
| `https://API.rectbot.tech/api/discord/callback` | `https://api.rectbot.tech/api/discord/callback` |

---

## 🧪 テスト方法

### 1. 設定を確認

Discord Developer Portalで、リダイレクトURIが正しく登録されているか確認：

```
https://discord.com/developers/applications/1048950201974542477/oauth2
```

### 2. OAuth URLを手動で構築してテスト

ブラウザで以下のURLにアクセス：

```
https://discord.com/api/oauth2/authorize?client_id=1048950201974542477&redirect_uri=https%3A%2F%2Fapi.rectbot.tech%2Fapi%2Fdiscord%2Fcallback&response_type=code&scope=identify
```

**期待される動作:**
1. Discordのログイン画面が表示される
2. 認可後、`https://api.rectbot.tech/api/discord/callback?code=...` にリダイレクトされる
3. Worker が Discord API を呼び出してトークンを取得
4. JWT Cookie をセットして `https://dash.rectbot.tech` にリダイレクト

**エラーが出る場合:**
- Discord Developer Portal の設定を再確認
- URIが完全一致しているか確認（コピー&ペースト推奨）

---

## 🔧 トラブルシューティング

### エラー: 「リダイレクトURIが無効です」

**チェックリスト:**

1. ✅ Discord Developer Portal に **正確に** `https://api.rectbot.tech/api/discord/callback` が登録されている
2. ✅ `.env.production` の `NEXT_PUBLIC_DISCORD_REDIRECT_URI` が同じ値
3. ✅ GitHub Secrets の `DISCORD_REDIRECT_URI` が同じ値
4. ✅ 設定変更後、Discord Developer Portal で **Save Changes** をクリックした
5. ✅ アプリケーションを再デプロイした

### エラーが続く場合

#### A. Discord Developer Portalのキャッシュクリア

1. ブラウザのキャッシュをクリア
2. シークレットモード/プライベートブラウズで再度テスト

#### B. リダイレクトURIを削除して再登録

1. Discord Developer Portal → OAuth2 → Redirects
2. 既存のURIを削除
3. `https://api.rectbot.tech/api/discord/callback` を新規追加
4. Save Changes

#### C. デプロイログで環境変数を確認

GitHub Actions のログで以下を確認：

```
=== Environment Variables Check ===
NEXT_PUBLIC_DISCORD_REDIRECT_URI: SET
```

`EMPTY` と表示される場合は、GitHub Secrets が設定されていません。

---

## 📄 関連ファイル

### コード内でのリダイレクトURI使用箇所

1. **discord-auth.ts**
   ```typescript
   this.redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || 
     'https://api.rectbot.tech/api/discord/callback';
   ```

2. **AdminDashboard.tsx**
   ```typescript
   const redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || 
     'https://api.rectbot.tech/api/discord/callback';
   ```

3. **backend/index.js (Worker)**
   ```javascript
   const redirectUri = env.DISCORD_REDIRECT_URI; // Worker側の環境変数
   ```

### 環境変数設定

- **Pages (フロントエンド)**: `NEXT_PUBLIC_DISCORD_REDIRECT_URI`
- **Worker (バックエンド)**: `DISCORD_REDIRECT_URI`

両方とも同じ値 `https://api.rectbot.tech/api/discord/callback` を設定する必要があります。

---

## ✅ 最終チェックリスト

デプロイ前に以下を確認：

- [ ] Discord Developer Portalに `https://api.rectbot.tech/api/discord/callback` が登録されている
- [ ] `.env.production` の `NEXT_PUBLIC_DISCORD_REDIRECT_URI` が正しい
- [ ] GitHub Secrets の `DISCORD_REDIRECT_URI` が正しい（Pages & Workers両方）
- [ ] コード内のハードコードされたURIを削除した（✅ 完了）
- [ ] 環境変数のフォールバック値が正しい（✅ 完了）
- [ ] デプロイ後、OAuth フローをテストした

すべてチェックできたら、ログインが正常に動作するはずです！🎉
