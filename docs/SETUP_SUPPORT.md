# 🚀 Rectbot Support System セットアップガイド

## 📋 目次

1. [Sentry設定](#1-sentry設定)
2. [Cloudflare Email Routing設定](#2-cloudflare-email-routing設定)
3. [Support Worker デプロイ](#3-support-worker-デプロイ)
4. [Support Form デプロイ](#4-support-form-デプロイ)
5. [Bot統合](#5-bot統合)
6. [Backend統合](#6-backend統合)
7. [動作確認](#7-動作確認)

---

## 1. Sentry設定

### 1️⃣ Sentryプロジェクト作成

1. [Sentry.io](https://sentry.io/) にログイン
2. **Create Project** をクリック
3. プラットフォーム: **Node.js** を選択
4. プロジェクト名: `rectbot` または任意の名前
5. DSNをコピー（例: `https://xxxxx@o123456.ingest.sentry.io/789012`）

### 2️⃣ Discord通知設定

1. Sentryプロジェクト → **Settings → Integrations**
2. **Discord** を検索して **Add Integration**
3. Discordサーバーを選択 → 通知チャンネルを設定
4. **Alerts** で通知条件を設定（例: すべてのエラー）

### 3️⃣ 環境変数設定

各サービスに `SENTRY_DSN` を設定：

**Bot（Botサーバー）:**
```bash
# .env.local に追加
SENTRY_DSN=https://xxxxx@o123456.ingest.sentry.io/789012
```

**Backend（Express）:**
```bash
# .env に追加
SENTRY_DSN=https://xxxxx@o123456.ingest.sentry.io/789012
```

**Worker:**
```bash
cd support-worker
wrangler secret put SENTRY_DSN
# プロンプトでDSNを入力
```

---

## 2. Cloudflare Email Routing設定

### 1️⃣ Email Routing有効化

1. Cloudflare Dashboard → `rectbot.tech` を選択
2. **Email Routing** タブを開く
3. **Enable Email Routing** をクリック
4. 以下を設定：
   - Custom address: `support@rectbot.tech`
   - Destination: `teppei.oga.0409@gmail.com`
5. **Save** をクリック

### 2️⃣ DNS設定確認

Email Routingが以下のDNSレコードを自動追加します（数分待機）：

- **MX レコード**: メール受信用
- **TXT レコード (SPF)**: 送信元認証
- **TXT レコード (DKIM)**: 署名認証

Cloudflare Dashboard → **DNS** → **Records** で確認できます。

### 3️⃣ MailChannels DKIM設定（オプション）

MailChannelsから送信するメールのDKIM署名を設定：

1. **DNS** → **Add Record**
2. 以下を追加：
   - Type: `TXT`
   - Name: `mailchannels._domainkey.rectbot.tech`
   - Content: （MailChannelsから提供されるDKIM公開鍵）
   - TTL: `Auto`

---

## 3. Support Worker デプロイ

### 1️⃣ 依存関係インストール

```bash
cd support-worker
npm install
```

### 2️⃣ 環境変数設定

```bash
# Discord Webhook URL を設定
wrangler secret put DISCORD_WEBHOOK_URL

# Sentry DSN を設定（オプション）
wrangler secret put SENTRY_DSN
```

**Discord Webhook URL の取得方法:**
1. Discordサーバー → チャンネル設定 → **連携サービス**
2. **ウェブフック** → **新しいウェブフック**
3. 名前: `Rectbot Support`
4. **ウェブフックURLをコピー**

### 3️⃣ デプロイ

```bash
npm run deploy
# または
wrangler deploy
```

デプロイ後、URLが表示されます：
```
https://rectbot-support-worker.YOUR_SUBDOMAIN.workers.dev
```

このURLを後でフォームに設定します。

---

## 4. Support Form デプロイ

### 1️⃣ Worker URLを更新

`frontend/support-form/public/index.html` の85行目を編集：

```javascript
const response = await fetch("https://rectbot-support-worker.YOUR_SUBDOMAIN.workers.dev", {
```

実際のWorker URLに置き換えてください。

### 2️⃣ Cloudflare Pagesにデプロイ

**方法A: Wrangler CLI**

```bash
cd frontend/support-form
npx wrangler pages deploy public --project-name=rectbot-support-form
```

**方法B: GitHub連携**

1. GitHubリポジトリにプッシュ
2. Cloudflare Dashboard → **Pages** → **Create a project**
3. リポジトリを選択 → `frontend/support-form` を指定
4. ビルド設定:
   - Build command: （空欄）
   - Build output directory: `public`
5. **Save and Deploy**

### 3️⃣ カスタムドメイン設定（オプション）

1. Cloudflare Pages → プロジェクト → **Custom domains**
2. **Set up a custom domain** をクリック
3. `support.rectbot.tech` を入力
4. DNS設定が自動追加されます

---

## 5. Bot統合

### 1️⃣ Sentryモジュールをインポート

`bot/src/index.js` の先頭に追加：

```javascript
import { initSentry, captureException } from "./utils/sentry.js";

// Sentry初期化
initSentry();
```

### 2️⃣ エラーハンドラに統合

既存のエラーハンドラを更新：

```javascript
// 例: interactionCreate イベント
client.on("interactionCreate", async (interaction) => {
  try {
    // コマンド実行処理
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    
    // Sentryに送信
    captureException(error, {
      command: interaction.commandName,
      user: interaction.user.tag,
      guild: interaction.guild?.name,
    });
    
    await interaction.reply({
      content: "エラーが発生しました。",
      ephemeral: true,
    });
  }
});
```

### 3️⃣ 環境変数設定

```bash
cd bot
echo "SENTRY_DSN=https://xxxxx@o123456.ingest.sentry.io/789012" >> .env.local
```

### 4️⃣ Bot再起動

```bash
pm2 restart rectbot
```

---

## 6. Backend統合

### 1️⃣ Sentryモジュールをインポート

`backend/src/index.js` の先頭に追加：

```javascript
import { initSentry, getSentryMiddleware } from "./utils/sentry.js";

// Sentry初期化
initSentry();

const app = express();
const { requestHandler, tracingHandler, errorHandler } = getSentryMiddleware();

// Sentryミドルウェアを最初に追加
app.use(requestHandler);
app.use(tracingHandler);
```

### 2️⃣ エラーハンドラに統合

`backend/src/index.js` の最後に追加：

```javascript
// 通常のルート定義...

// Sentryエラーハンドラ（必ず他のミドルウェアより後に配置）
app.use(errorHandler);

// カスタムエラーハンドラ
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});
```

### 3️⃣ 環境変数設定

```bash
cd backend
echo "SENTRY_DSN=https://xxxxx@o123456.ingest.sentry.io/789012" >> .env
```

### 4️⃣ Backend再起動

```bash
pm2 restart rectbot-backend
```

---

## 7. 動作確認

### ✅ チェックリスト

#### Sentry

- [ ] Bot起動時に「✅ Sentry初期化完了」ログが表示される
- [ ] Backendアクセス時にSentryにトレースが記録される
- [ ] エラー発生時にSentryダッシュボードに表示される
- [ ] Discordにエラー通知が届く

#### Email Routing

- [ ] `support@rectbot.tech` にメール送信 → Gmailに届く
- [ ] Email Routing Dashboard で配信ログを確認

#### Support Worker

- [ ] `https://rectbot-support-worker.YOUR_SUBDOMAIN.workers.dev` にアクセス → "Method Not Allowed"
- [ ] POSTリクエストでメール送信成功

#### Support Form

- [ ] `https://rectbot-support-form.pages.dev` （または `support.rectbot.tech`）にアクセス
- [ ] フォーム入力 → 送信 → 「✅ 送信しました！」
- [ ] Gmailに問い合わせメールが届く
- [ ] Discordに通知が届く

---

## 🐛 トラブルシューティング

### Sentryにエラーが表示されない

- 環境変数 `SENTRY_DSN` が正しく設定されているか確認
- `NODE_ENV=production` の場合、サンプリングレートを確認
- Sentryダッシュボード → **Settings → Inbound Filters** でフィルタを確認

### メールが届かない

- Cloudflare Email Routing が有効か確認
- DNS設定（MX, SPF, DKIM）が正しいか確認（`dig MX rectbot.tech`）
- Gmailの迷惑メールフォルダを確認
- MailChannels APIの応答を確認（Worker logs）

### Discord通知が届かない

- `DISCORD_WEBHOOK_URL` が正しく設定されているか確認
- Webhook URLが削除されていないか確認
- Discordチャンネルの権限を確認

### フォーム送信時に CORS エラー

- Worker の `corsHeaders` 設定を確認
- ブラウザのコンソールでエラー詳細を確認
- Worker URLが正しいか確認

---

## 📊 監視ダッシュボード

### Sentry
- URL: https://sentry.io/organizations/YOUR_ORG/projects/rectbot/
- エラー率、パフォーマンス、リリース追跡

### Cloudflare Analytics
- Workers Analytics: https://dash.cloudflare.com/?to=/:account/workers/overview
- Pages Analytics: https://dash.cloudflare.com/?to=/:account/pages
- Email Routing: https://dash.cloudflare.com/?to=/:account/:zone/email

### Discord
- エラー通知チャンネル: `#rectbot-errors`
- 問い合わせ通知チャンネル: `#rectbot-support`

---

## 🎯 次のステップ

- [ ] Turnstile (Cloudflare CAPTCHA) でスパム対策
- [ ] Sentryのカスタムタグ・コンテキスト追加
- [ ] Supabaseバックアップ完了時にDiscord通知
- [ ] Support Formにファイルアップロード機能追加
- [ ] 問い合わせ履歴をSupabaseに保存

---

**セットアップ完了お疲れさまでした！🎉**

問題があれば `support@rectbot.tech` までご連絡ください。
