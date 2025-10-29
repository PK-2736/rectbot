# 📘 Recrubo Support System — README

## 🧩 概要

本プロジェクトは、**Recrubo関連サービス（Bot / Worker / API / Backup / Pages など）**における
共通サポート基盤を提供します。

構成要素は以下の通りです：

| 要素 | 目的 |
|------|------|
| 🧠 **Sentry** | 各プロセスの例外・エラー監視（Discord通知対応） |
| 💌 **Cloudflare Email Routing + Worker** | Web問い合わせフォームからのメール転送 |
| 🌐 **Cloudflare Pages** | 問い合わせフォームのホスティング |
| ⚙️ **Discord Webhook** | エラー・問い合わせの通知集約 |
| 🧱 **OCI VPS / Supabase / Redis / Express / Worker** | 運用サービス群 |

---

## 🧠 1. Sentry 統合

### ✅ 目的

* Bot・Worker・Pages・Backupなどのすべてのアプリから
  エラーレポートを一元管理。
* Discordにも自動通知（Sentry Integration使用）。

---

### 🧩 導入手順（Node.js / Express / Worker共通）

#### 1. Sentry SDK の導入

```bash
npm install @sentry/node @sentry/tracing
```

#### 2. 初期化コード（例：`src/utils/sentry.js`）

```js
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
});

export default Sentry;
```

#### 3. Expressへの組み込み例

```js
import express from "express";
import Sentry from "./utils/sentry.js";

const app = express();

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// 通常ルート
app.get("/", (req, res) => res.send("OK"));

// エラー発生例
app.get("/error", () => {
  throw new Error("Test Error for Sentry");
});

// エラーハンドラ
app.use(Sentry.Handlers.errorHandler());
app.use((err, req, res, next) => {
  res.status(500).send("Internal Server Error");
});

app.listen(3000);
```

---

### ⚙️ Worker版（例）

```js
import * as Sentry from "@sentry/cloudflare";

export default {
  async fetch(request, env, ctx) {
    return Sentry.withSentry(
      {
        dsn: env.SENTRY_DSN,
        tracesSampleRate: 1.0,
      },
      async () => {
        try {
          // ここにWorker処理
          return new Response("OK");
        } catch (e) {
          Sentry.captureException(e);
          throw e;
        }
      }
    )(request, env, ctx);
  },
};
```

---

### 📡 Discord通知連携（Sentry側設定）

1. [Sentry Dashboard](https://sentry.io/) → プロジェクトを開く
2. **Settings → Integrations → Discord**
3. 「Add Integration」→ Discordサーバーを選択
4. 通知先チャンネルを設定

これで、Recrubo各プロセスのエラーがDiscordに自動通知されます ✅

---

## 💌 2. Cloudflare Email Routing（問い合わせフォーム）

### ✅ 構成

| 要素 | 役割 |
|------|------|
| Cloudflare Pages | フロント（HTMLフォーム） |
| Cloudflare Worker | メール送信処理 |
| Cloudflare Email Routing | `support@recrubo.net` 宛を Gmail へ転送 |

---

### 🪄 手順

#### 1️⃣ Email Routing 設定

1. Cloudflare Dashboard → `rectbot.tech` → **Email Routing**
2. 「Set up Email Routing」をクリック
3. 以下を設定：

   ```
   Custom address: support@recrubo.net
   Destination: operations@recrubo.net
   ```
4. MX / SPF / TXT レコードが自動追加される（数分で有効）

---

#### 2️⃣ Cloudflare Pages にフォームを設置

詳細は `/frontend/support-form/` を参照してください。

---

#### 3️⃣ Workerでメールを送信（MailChannels経由）

詳細は `/support-worker/` を参照してください。

---

### ✅ 動作確認

1. Cloudflare Pages にデプロイ
2. フォームに入力して送信
3. Gmail に `support@recrubo.net` 宛のメールが届く
4. Discord にも通知が届く

---

## 🔐 5. 環境変数設定（例）

| 変数名 | 用途 |
|--------|------|
| `SENTRY_DSN` | 各アプリ共通（SentryプロジェクトDSN） |
| `DISCORD_WEBHOOK_URL` | 通知チャンネル用 |
| `SUPPORT_EMAIL` | `support@recrubo.net` |
| `ADMIN_EMAIL` | `operations@recrubo.net` |

---

## ✅ 6. 費用まとめ

| サービス | 用途 | 料金 |
|----------|------|------|
| Cloudflare Pages | フォームホスティング | 無料 |
| Cloudflare Workers | メール送信処理 | 無料枠内 |
| Cloudflare Email Routing | メール転送 | 無料 |
| Sentry | 監視・Discord通知 | 無料枠あり（最大5kイベント/月） |
| Discord | 通知集約 | 無料 |

---

## 🚀 今後の拡張予定

* [ ] reCAPTCHA v3 / Cloudflare Turnstile でスパム対策
* [ ] Sentryタグ連携（Bot名・サーバー名を自動識別）
* [ ] Supabaseバックアップ完了通知を自動送信
* [ ] DiscordサポートチケットBotとの統合

---

## 📂 プロジェクト構成

```
rectbot/
├── docs/
│   └── README_SUPPORT.md        # このファイル
├── bot/
│   └── src/utils/sentry.js      # Bot用Sentry統合
├── backend/
│   └── src/utils/sentry.js      # Express用Sentry統合
├── support-worker/              # 問い合わせWorker
│   ├── src/index.js
│   ├── wrangler.toml
│   └── package.json
└── frontend/
    └── support-form/            # 問い合わせフォーム（Pages）
        ├── public/
        │   └── index.html
        └── wrangler.toml
```

---

## 🎯 実装状況

- [x] README作成
- [ ] Bot用Sentry統合
- [ ] Backend用Sentry統合
- [ ] Support Worker作成
- [ ] Pages フォーム作成
- [ ] Email Routing設定
- [ ] Discord Webhook統合
- [ ] テスト実行
