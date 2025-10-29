# rectbot（旧Recrubo）

<aside>
🧭 **rectbot プロジェクト概要**

主要構成や運用方針をひと目で確認できます。

</aside>

---

## プロジェクト概要

- Discord での募集をdiscord component v2 + 画像生成で円滑に行うbot
- Cloudflare Workers / Pages + Supabase + Durable Objects + R2 によりリアルタイム更新とバックアップを提供
- 管理者とユーザーで表示を切替え、エラーは Sentry と Discord 通知で監視

### 特徴

- ギルド単位の募集状況をリアルタイム表示
- 管理者／ユーザーで UI と権限を切替
- Bot 再起動時に進行中募集をリセットし通知
- Cloudflare Pages 上で公式サイトと管理用ダッシュボードを提供
- Sentry でエラー監視し、Discord に通知
- Supabase でギルド設定、Stripe サブスク、Discord OAuth2 データを管理
- Cloudflare R2 でバックアップ保存
- Durable Objects によるキャッシュでほぼリアルタイム更新

---

## ディレクトリ構造

---

| パス | 種別 | 説明 |
| --- | --- | --- |
| `.dockerignore` | ファイル | Dockerビルド時に除外するファイル指定 |
| `.gitignore` | ファイル | Gitで無視するファイルの定義 |
| `add_private_[network.sh](http://network.sh)` | スクリプト | VPSにプライベートネットワークを追加するスクリプト |
| `backup_local_to_[r2.sh](http://r2.sh)` | スクリプト | ローカルからCloudflare R2へバックアップ |
| `BACKUP_SETUP_[GUIDE.md](http://GUIDE.md)` | ドキュメント | バックアップ設定手順書 |
| `backup_supabase_[api.sh](http://api.sh)` | スクリプト | Supabase API経由でバックアップ取得 |
| `backup_supabase_to_[r2.sh](http://r2.sh)` | スクリプト | SupabaseからR2へバックアップ |
| `BACKUP_SYSTEM_[SUMMARY.md](http://SUMMARY.md)` | ドキュメント | バックアップシステムの概要説明 |
| `deploy_backup_to_[vps.sh](http://vps.sh)` | スクリプト | バックアップをVPSにデプロイ |
| [`git.sh`](http://git.sh) | スクリプト | Git操作の補助スクリプト |
| `GITHUB_SECRETS_[SETUP.md](http://SETUP.md)` | ドキュメント | GitHub Secretsの設定手順 |
| [`README.md`](http://README.md) | ドキュメント | プロジェクト全体の概要 |
| `requirements..txt` | ファイル | 依存関係リスト（拡張子に誤りの可能性） |
| `restore_from_[r2.sh](http://r2.sh)` | スクリプト | R2からバックアップを復元 |
| `setup_cloudflare_[tunnel.sh](http://tunnel.sh)` | スクリプト | Cloudflare Tunnelのセットアップ |
| `setup_[cron.sh](http://cron.sh)` | スクリプト | Cronジョブの設定 |

---

### 📁 .github/workflows

| ファイル名 | 説明 |
| --- | --- |
| `deploy-cloudflare-pages.yml` | Cloudflare PagesへのデプロイCI |
| `deploy-cloudflare-workers.yml` | Cloudflare WorkersへのデプロイCI |
| `deploy-oci.yml` | OCI環境へのデプロイCI |

---

### 📁 backend

| パス | 説明 |
| --- | --- |
| `index.js` | バックエンドのエントリーポイント |
| `package.json` / `package-lock.json` | 依存関係とスクリプト定義 |
| `wrangler.toml` | Cloudflare Workers設定 |
| `src/utils/sentry.js` | Sentryによるエラートラッキング設定 |

---

### 📁 bot

| パス | 説明 |
| --- | --- |
| `package.json` / `package-lock.json` | Botの依存関係とスクリプト |
| [`README.md`](http://README.md) | Botの概要説明 |

### 📁 bot/data

| ファイル名 | 説明 |
| --- | --- |
| `Corporate-Logo-Rounded-Bold-ver3.otf` | Bot用フォントファイル |

### 📁 bot/images

| ファイル名 | 説明 |
| --- | --- |
| `aaa.png`, `boshu.png` | Bot用画像素材 現在未使用|

### 📁 bot/src

| ファイル名 | 説明 |
| --- | --- |
| `index.js` | Botのメイン処理 |
| `config.js` | Botの設定 |
| `deploy-commands.js` | コマンド登録スクリプト |
| `clear-commands.js` | コマンド削除スクリプト |
| `update-notify.js` | 更新通知処理 |
| [`README.md`](http://README.md) | ソースディレクトリの説明 |

### 📁 bot/src/commands

| ファイル名 | 説明 |
| --- | --- |
| `editRecruit.js`, `gameRecruit.js` | 募集関連コマンド |
| `friendCode.js` | フレンドコード表示 |
| `guildSettings.js` | ギルド設定変更 |
| `help.js`, `ping.js`, `testwelcome.js` | ユーティリティ系コマンド |

### 📁 bot/src/events

| ファイル名 | 説明 |
| --- | --- |
| `guildCreate.js`, `ready.js` | Bot起動・参加時の処理 |
| `interactionCreate.js` | スラッシュコマンド処理 |
| `messageReactionAdd.js` | リアクション追加イベント処理 |

### 📁 bot/src/utils

| ファイル名 | 説明 |
| --- | --- |
| `backendFetch.js` | バックエンドとの通信 |
| `canvasRecruit.js` | Canvasで画像生成 |
| `db.js`, `db.js.rewrite`, `db.__fixed.js` | DB操作（複数バージョン） |
| `embedBuilder.js` | Embed生成ユーティリティ |
| `recruitHelpers.js` | 募集補助関数 |
| `safeReply.js` | 安全な返信処理 |
| `sentry.js` | Sentry設定 |

### 📁 docs

| ファイル名 | 説明 |
| --- | --- |
| `CLOUDFLARE_TUNNEL_[SETUP.md](http://SETUP.md)` | Cloudflare Tunnel のセットアップ手順書 |
| `GITHUB_ACTIONS_BACKUP_[SETUP.md](http://SETUP.md)` | GitHub Actions を使ったバックアップ設定手順 |
| `README_[SUPPORT.md](http://SUPPORT.md)` | サポート機能の概要説明 |
| `SETUP_[SUPPORT.md](http://SUPPORT.md)` | サポート環境のセットアップ手順 |

---

### 📁 frontend/astro

| パス | 説明 |
| --- | --- |
| `astro.config.mjs` | Astro の設定ファイル |
| `package.json` / `package-lock.json` | Astro プロジェクトの依存関係とスクリプト |
| [`README.md`](http://README.md) | Astro フロントエンドの概要 |
| `tailwind.config.mjs` | Tailwind CSS の設定ファイル |
| `wrangler.toml` | Cloudflare Pages 用のデプロイ設定 |

### 📁 frontend/astro/public

| ファイル名 | 説明 |
| --- | --- |
| `favicon.svg` | サイトのファビコン（SVG形式） |

### 📁 frontend/astro/src

| ファイル名 | 説明 |
| --- | --- |
| `env.d.ts` | 環境変数の型定義（TypeScript） |

### 📁 layouts

| ファイル名 | 説明 |
| --- | --- |
| `BaseLayout.astro` | 全ページ共通のレイアウトコンポーネント |

### 📁 pages

| ファイル名 | 説明 |
| --- | --- |
| `Home.astro` | ホームページ |
| `index.astro` | トップページ（ルート） |
| `privacy.astro` | プライバシーポリシー |
| `support.astro` | サポートページ |
| `terms.astro` | 利用規約ページ |

### 📁 pages/commands

| ファイル名 | 説明 |
| --- | --- |
| `CommandLayout.astro` | コマンド紹介ページのレイアウト |
| `fastResponse.astro` | 高速応答コマンドの紹介 |
| `friendCode.astro` | フレンドコードコマンドの紹介 |
| `gameRecruit.astro` | ゲーム募集コマンドの紹介 |

### 📁 styles

| ファイル名 | 説明 |
| --- | --- |
| `global.css` | 全体に適用されるスタイルシート |

---

### 📁 frontend/dashboard

| パス | 説明 |
| --- | --- |
| `.gitignore` | Git 除外設定 |
| `eslint.config.mjs` | ESLint の設定ファイル |
| `next.config.js` / `next.config.ts` | Next.js の設定（JS/TS両対応） |
| `package.json` / `package-lock.json` | ダッシュボードの依存関係とスクリプト |
| `postcss.config.js` | PostCSS の設定 |
| [`README.md`](http://README.md) | ダッシュボードの概要説明 |
| `SECURITY_[SETUP.md](http://SETUP.md)` | セキュリティ設定手順 |
| `tailwind.config.ts` | Tailwind CSS の設定 |
| `tsconfig.json` | TypeScript の設定 |
| `wrangler.toml` | Cloudflare Pages 用の設定 |

### 📁 functions/api

| ファイル名 | 説明 |
| --- | --- |
| `cleanup.ts` | 不要データのクリーンアップAPI |
| `recruitment.ts` | 募集関連のAPIエンドポイント |

### 📁 public

| ファイル名 | 説明 |
| --- | --- |
| `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | UI用アイコン素材（SVG） |

### 📁 src/app

| ファイル名 | 説明 |
| --- | --- |
| `favicon.ico` | ダッシュボード用ファビコン |
| `globals.css` | グローバルスタイル |
| `layout.tsx` | アプリ全体のレイアウト |
| `page.module.css` | トップページ用のCSSモジュール |
| `page.tsx` | トップページのコンポーネント |
| `providers.tsx` | コンテキストプロバイダー設定 |

### 📁 src/components

| ファイル名 | 説明 |
| --- | --- |
| `AdminDashboard.tsx` | 管理者用ダッシュボード |
| `AuthProvider.tsx` | 認証プロバイダー |
| `UserDashboard.tsx` | 一般ユーザー用ダッシュボード |

### 📁 src/lib

| ファイル名 | 説明 |
| --- | --- |
| `config.ts` | 設定ファイル |
| `discord-auth.ts` | Discord認証処理 |
| `utils.ts` | 汎用ユーティリティ関数 |

### 📁 src/types

| ファイル名 | 説明 |
| --- | --- |
| `dashboard.ts` | ダッシュボード関連の型定義 |
| `global.d.ts` | グローバル型定義 |
| `next-auth.d.ts` | NextAuth.js 用の型定義 |

---

## 環境一覧

### 開発環境

- Windows 11
- 16GB RAM / i5 11th Gen
- VSCode + GitHub Copilot
- Node.js 18.x、npm
- GitHub Desktop / Actions / Secrets
- 依存: discord.js、node-canvas、dotenv

### ステージング（OCI VPS）

- A1 Flex 4 OCPU / 24GB RAM
- Bot: discord.js + node-canvas
- API: Worker 経由で Supabase
- キャッシュ: Durable Objects
- 管理用: Grafana / Loki / Sentry / Metabase
- DB: Supabase（テスト）
- セキュリティ: JWT + Service Token + Cloudflare Access
- 用途: 開発・テスト
- domain: rectbot.tech (今現在のドメイン)

### 本番（Xserver VPS）

- 3 core / 2GB RAM
- Bot: 24 時間稼働
- DB: Supabase（本番）
- キャッシュ: Durable Objects
- ログ転送: Promtail → loki(OCI)に送信
- リソースログ: workerに送信 → OCIで受信 →garifana
- セキュリティ: JWT + Service Token + Cloudflare Access
- 用途: Bot 実働の軽量環境
- domain: recrubo.net (Xserver dmainで取得予定)

---

## 自動デプロイ手順

### ✅ 準備

1. GitHub ActionsのSecretsに `.env` 内の値を登録　参考：環境変数 (.env)
2. Cloudflare Pages・WorkerをGitHub連携しておく
3. VPS内にも `.env` を配置（SSHで転送）

### 🚀 自動デプロイの流れ

1. `git push main`
2. GitHub Actions が自動で実行：
    - **VPS**: SSH経由で再起動 or PM2再デプロイ
    - **Worker**: `wrangler deploy` で更新
    - **Pages**: Cloudflareが自動でビルド＆公開
3. 成功後、Discord Webhookに通知（任意）

---

## 手動デプロイ手順

### VPS (Bot)

```bash
ssh ubuntu@your-vps
cd /home/ubuntu/rectbot
git pull origin main
pm2 restart all

```

### Worker (API)

```bash
cd worker
npx wrangler deploy

```

### Pages (フロント)

```bash
cd frontend
npm run build
npx wrangler pages deploy ./out

```

---

## セキュリティポイント

- **Cloudflare Access** で API をトークン保護（外部アクセス不可）
- **Bot ⇄ Worker** 通信には `SERVICE_TOKEN` または `INTERNAL_SECRET` を使用
- **Redis / Supabase / R2** はすべてプライベート接続 or HTTPS経由
- `.env` はGitに含めず、SecretsまたはVPS直配置で管理

---

## 運用メモ

- 環境変数を変更したら `pm2 restart all` または Actions再実行
- バックアップは `backup_supabase_to_r2.sh` をCRON登録
- Workerエラーは `SENTRY_DSN` 経由で通知可能

---

## Backend（API）

- Cloudflare Worker: [`api.recrubo.net`](http://api.recrubo.net)
- 主要ルート
    - `/api/recruitment/list` 募集一覧
    - `/api/recruitment/settings` ギルド設定取得・更新
    - `/api/discord/auth` Discord OAuth2
    - `/api/mail` お問い合わせ送信
- セキュリティ
    - JWT による認証
    - Service Token による安全な相互通信
    - Cloudflare Access による追加保護（必要時）
- CORS: Pages と Worker 間で有効

了解です 👍

では、あなたがNotionにそのまま貼れるように、見やすいMarkdown形式でまとめました👇

---

## 募集機能 API & キャッシュ設計

```
Discord Bot
  ↓ (HTTP fetch)
Cloudflare Worker API
  ↓
Durable Object（Redisキャッシュ相当）

```

- **Redis / Durable Object**：募集データを一時保存（TTL＝8時間）
- **Cloudflare Worker API**：募集の作成・取得・参加・削除、およびギルド設定保存を提供
- **Bot**：ユーザー操作からAPIを呼び出す

---

## 💾 Redisデータ構造

**キー形式**

```
recruit:{募集ID}

```

**値（JSON例）**

```json
{
  "title": "splatoon3募集",
  "description": "バンカラマッチ回します！",
  "startTime": "2025-10-22T20:00:00Z",
  "maxMembers": 5,
  "voice": true,
  "recruitId": "abc123",
  "ownerId": "user_id",
  "currentMembers": ["user_id", "user_id"]
}

```

**保存時（Node.js例）**

```jsx
await redis.set(`recruit:${recruitId}`, JSON.stringify(data), { EX: 8 * 3600 }); // TTL 8時間

```

---

## API設計

### 1️⃣ POST `/recruits`

募集作成

**Request**

```json
{
  "title": "splatoon3募集",
  "description": "バンカラマッチ回します！",
  "startTime": "2025-10-22T20:00:00Z",
  "maxMembers": 5,
  "voice": true,
  "recruitId": "abc123",
  "ownerId": "user_id",
  "currentMembers": ["user_id", "user_id"]
}

```

**Response**

```json
{
  "recruitId": "abc123",
  "status": "created"
}

```

---

### 2️⃣ GET `/recruits/:id`

募集詳細取得

**Response**

```json
{
  "title": "splatoon3募集",
  "description": "バンカラマッチ回します！",
  "startTime": "2025-10-22T20:00:00Z",
  "maxMembers": 5,
  "voice": true,
  "recruitId": "abc123",
  "ownerId": "user_id",
  "currentMembers": ["user_id", "user_id"]
}

```

---

### 3️⃣ POST `/recruits/:id/join`

募集に参加

**Request**

```json
{
  "user_Id": "67890"
}

```

**動作**

- Redisから取得 → `currentMembers`に追加
- 上限人数を超えない場合のみ保存

---

### 4️⃣ DELETE `/recruits/:id`

募集削除（主催者のみ）

**Request**

```json
{
  "userId": "12345"
}

```

---

## Redis設計の工夫

| データ種別 | キー形式 | TTL | 備考 |
| --- | --- | --- | --- |
| 募集本体 | `recruit:{id}` | 8h | 募集情報全体 |
| 募集一覧 | `recruit:list` | 8h | 全募集IDをLISTで保持 |

```jsx
const ids = await redis.lrange("recruit:list", 0, -1);
const recruits = await Promise.all(ids.map(id => redis.get(`recruit:${id}`)));

```

---

## Frontend

### HP（[recrubo.net](http://recrubo.net)）

- Bot 説明、サポート、招待 URL、プライバシーポリシー、商品取り扱い

### ダッシュボード（[dashboard.recrubo.net](http://dashboard.recrubo.net)）

- 全ギルドの募集状況表示
- ギルド設定の確認と変更（通知ロール、募集チャンネル、パネル色）
- サブスク状態確認
- Discord Auth で権限に応じて表示切替
- キャッシュは Durable Objects でリアルタイム寄りに更新
- メールフォームは Cloudflare Mail Routing 連携
- セキュリティ: Discord OAuth2 + JWT

---

## Database（Supabase）

- 保存データ
    - ギルド募集設定（チャンネル ID、通知ロール、パネル色）
    - Stripe サブスク
    - フレンドコード
    - Discord OAuth2 ユーザーデータ
- RLS によるギルド単位アクセス制御
- バックアップ
    - Supabase → OCI VPS（pg_dump）→ R2
- セキュリティ
    - Service Key はサーバー側のみ
    - API 経由で JWT 認証
    - Edge Function は未使用（必要に応じて追加）

---

## Mail

- Cloudflare Mail Routing
- 送信: [`support@recrubo.net](mailto:support@recrubo.net) → [Gmail（teppei.oga.0409@gmail.com](mailto:Gmail（teppei.oga.0409@gmail.com)）`
- Worker で送信予定（11 月）参考：(https://blog.cloudflare.com/email-service/)
- 用途: お問い合わせフォーム、返信
- SMTP: Cloudflare Mail + Worker または Mailchannels
- セキュリティ: 認証必須、フォームは CAPTCHA で保護

---

## ログ・監視

- ダッシュボード: [`dashboard.recrubo.net`](http://dashboard.recrubo.net)（管理者用、権限で表示切替）
- サービス: Grafana / Loki / Sentry / Metabase
- URL
    - [`grafana.recrubo.net`](http://grafana.recrubo.net)
    - [`metabase.recrubo.net`](http://metabase.recrubo.net)
    - [`sentry.recrubo.net`](http://sentry.recrubo.net)
- 保護: Basic Auth / TOKEN
- 本番環境ではPromtailをXserverに置き、loki(OCi)へ送信
- リソースログ(本番)はXserverからworkerへ送信し、garifana(OCI)が表示
- 通知: Discord へリアルタイム通知
- 目的: エラー、バックアップ失敗、デプロイ通知の監視

---

## セキュリティ

- Bot / Worker / Dashboard / Supabase
    - Bot: Cloudflare Tunnel + Service Token + JWT
    - Dashboard: Discord OAuth2（管理者のみ）
    - Worker API: JWT + Service Token
    - メールフォーム: Cloudflare Mail + Worker + CAPTCHA
- Firewall / DNS
    - DNS は Cloudflare 管理
    - Firewall ルール
        - Worker API / Bot アクセスを IP 制限
        - 管理ダッシュボードは Basic Auth で保護
        - 国別アクセス制限も可能
- CORS: Pages ↔ Worker 間で有効

---

---

## 🔑 ユーザー権限・OAuthスコープ一覧

---

## 🧭 全体権限フロー

```
Discord User
   │ (OAuth認証)
   ▼
[ Cloudflare Pages (フロント) ]
   │
   ▼
[ Cloudflare Worker (API) ]
   │── 検証：Discord OAuth Token / Supabase User Token
   ▼
[ Supabase (ユーザーDB管理) ]
   │
   ▼
[ Discord Bot (VPS) ]

```

---

## 🧍‍♂️ ユーザー権限レベル

| 権限レベル | 対応ユーザー | 権限内容 | 主な利用箇所 |
| --- | --- | --- | --- |
| **Guest** | 未ログインユーザー | 公開ページの閲覧のみ | Pages（閲覧専用） |
| **User** | Discordログイン済み | 募集参加、マイページ閲覧 | Worker API（一般操作） |
| **Recruiter** | 募集作成者 | 募集の開始・削除・編集 | Worker API（POST/DELETE） |
| **Admin** | 管理者（Bot管理者ID一致） | 全募集・全ユーザーの管理、承認機能 | Supabase（管理テーブル）、Worker（admin route） |

---

## ⚙️ Discord OAuth2 設定

### 🔸 リダイレクト設定

```
https://<your-pages-domain>/auth/callback

```

### 🔸 OAuth2 スコープ（Scopes）

| スコープ | 用途 |
| --- | --- |
| `identify` | DiscordユーザーID・タグ・アバター取得 |
| `guilds` | ユーザーが所属するサーバー一覧取得 |
| `email`（任意） | メールアドレス識別（Supabase連携時） |
| `applications.commands` | スラッシュコマンド登録 |
| `bot` | Bot追加用（管理者のみ） |

**実際の構成例**

```
identify guilds applications.commands

```

---

## 🔐 OAuth2 認可フロー（概要）

```
1️⃣ ユーザー → Pages で「Discordでログイン」
    ↓
2️⃣ Discord OAuth認証画面へ遷移
    ↓
3️⃣ 認証成功後、Pagesが code を受け取る
    ↓
4️⃣ Workerが Discord API へトークン交換リクエスト
    ↓
5️⃣ Discordユーザー情報をSupabaseに保存 / 更新

```

---

## 🧩 Supabase 側の認証・権限

| テーブル | 用途 | 備考 |
| --- | --- | --- |
| `users` | Discordユーザー基本情報 | id, username, discriminator, avatar |
| `recruitments` | 募集情報 | `owner_id` により作成者紐付け |
| `participations` | 参加記録 | user_id と recruitment_id のリレーション |
| `admins` | 管理者一覧 | Discord ID 登録ベース |

**RLS (Row Level Security) ポリシー例**

- `recruitments`: `auth.uid() = owner_id` の場合のみ `UPDATE/DELETE` 可
- `admins`: 管理者のみ全権アクセス

---

## 🧰 Worker / API 側の認可ロジック

| ルート例 | 認可方法 | 備考 |
| --- | --- | --- |
| `GET /recruitments` | 公開（ゲスト可） | Redisキャッシュ対応 |
| `POST /recruitments` | Discord OAuthトークン検証 | 募集作成者のみ |
| `DELETE /recruitments/:id` | トークン＋owner_id一致 |  |
| `GET /admin/*` | `ADMIN_DISCORD_ID` 一致確認 | 内部用ツール |

**トークン検証の流れ**

1. Pages → Worker に `Authorization: Bearer <access_token>` を送信
2. Worker → Discord API (`/users/@me`) でユーザー照合
3. Supabaseユーザー情報と照合し、権限を決定

---

## 🧱 Bot（VPS） 側の権限

| 権限 | 必要か | 用途 |
| --- | --- | --- |
| `Send Messages` | ✅ | 通知・案内 |
| `Embed Links` | ✅ | 埋め込みメッセージ |
| `Read Message History` | ✅ | 募集履歴参照 |
| `Manage Messages` | ⚙️ 任意 | 不要メッセージ削除など |
| `Use Application Commands` | ✅ | `/` コマンド利用 |
| `Attach Files` | ✅ | 画像・添付送信用 |

**招待URLテンプレート**

```
https://discord.com/api/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&permissions=274878221312&scope=bot%20applications.commands

```

---

## 🔒 セキュリティ・権限管理のポイント

- DiscordユーザーIDをSupabaseの主キーとして統一
- Workerで「スコープの欠如」「トークン期限切れ」を明示的に拒否
- Bot・API・Pages間通信は必ず `INTERNAL_SECRET` 署名付き
- Admin操作は `ADMIN_DISCORD_ID` のみに制限

---

## ✅ チェックリスト（Notionで使える）

| 項目 | 状況 | 備考 |
| --- | --- | --- |
| Discord OAuthスコープが設定済み | ☐ | identify, guilds |
| リダイレクトURIが正しい | ☐ | /auth/callback |
| Supabaseユーザー保存が正常 | ☐ | users テーブル確認 |
| Workerでトークン検証成功 | ☐ | /auth/test |
| Admin限定ルート動作確認 | ☐ | /admin/ping |
| Bot権限が正しい | ☐ | Discord招待リンク再確認 |

---
---

## 🧾 `.env`　環境変数

```bash
# ====== Discord Bot ======
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=
DISCORD_WEBHOOK_URL=

ADMIN_DISCORD_ID=

# ====== API / Backend ======
BACKEND_API_URL=                     # Worker API の内部エンドポイント
PUBLIC_API_BASE_URL=                 # Public (Pagesなどから叩く用)
NEXT_PUBLIC_API_BASE_URL=            # Frontend用APIエンドポイント

INTERNAL_SECRET=                     # Bot ⇔ Worker 間で共通利用する内部トークン（JWT検証用）
JWT_SECRET=                          # APIのJWT署名用

SERVICE_TOKEN=                       # Bot → Worker 通信用のサービス トークン

# ====== Cloudflare Access ======
CF_ACCESS_CLIENT_ID=                 # Cloudflare Zero Trust Service Token ID
CF_ACCESS_CLIENT_SECRET=             # Cloudflare Zero Trust Service Token Secret
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# ====== Cloudflare Tunnel ======
TUNNEL_ID=                           # Tunnel ID (任意)
TUNNEL_CREDENTIAL_FILE=              # JSON認証ファイルへのパス
TUNNEL_HOSTNAME=                     # api.example.com など

# ====== Storage / Backup ======
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
BACKUP_RETENTION_DAYS=

# ====== Supabase ======
SUPABASE_URL=
SUPABASE_PROJECT_REF=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
SUPABASE_REST_URL=

# ====== Database / Cache (DO) ======
REDIS_HOST=
REDIS_PORT=6379

# ====== OCI / VPS ======
OCI_HOST=
OCI_USER=
OCI_SSH_KEY=

# ====== Security / Monitoring ======
SENTRY_DSN=
PUBLIC_RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET=
RECAPTCHA_SCORE_THRESHOLD=

# ====== Notifications / Mail ======
MAILCHANNELS_API_KEY=
SUPPORT_EMAIL=

# ====== Runtime Options ======
NODE_ENV=production
TZ=Asia/Tokyo

```

> ℹ️ `SUPABASE_URL` が利用できない場合は、`SUPABASE_REST_URL` もしくは `SUPABASE_PROJECT_REF`
>（`fkxxxxxxxxxxxxx` 形式）を設定すると Worker 側で自動的に REST エンドポイント URL を解決します。

---

## 📦 説明補足

| 区分 | 目的 |
| --- | --- |
| **Cloudflare Access** | Bot → Worker 通信用の認証（`CF_ACCESS_CLIENT_ID/SECRET`） |
| **Tunnel関連** | Botからの通信をCloudflare経由で安全に転送 |
| **INTERNAL_SECRET / SERVICE_TOKEN** | Bot ↔ Worker など内部API用の認証 |
| **R2 / Supabase / Redis** | データ保存・キャッシュ関連 |
| **SENTRY / RECAPTCHA / MAIL** | モニタリング・セキュリティ対策 |
| **TZ** | タイムゾーンをJSTに統一 |

---

## 🧭 全体構成フロー

```
[ Discord Bot (VPS) ]
       │  (Cloudflare Tunnel)
       ▼
[ Cloudflare Access (認証) ]
       ▼
[ Cloudflare Worker (API) ]
       │
       ├── Supabase（DB）
       ├── DO Redis（キャッシュ）
       └── Cloudflare R2（バックアップ）
       │
       ▼
[ Cloudflare Pages（フロント） ]

```

---

## 🚨 復旧手順（障害発生時）

### 🟥 1. VPS（Bot）

**主な障害例**

- Botが反応しない
- Worker APIとの通信が失敗 (`ECONNREFUSED` / `502`)
- Redisキャッシュ不調

**対応手順**

```bash
# VPSログイン
ssh ubuntu@<VPS_IP>

# 稼働確認
pm2 list

# ログ確認
pm2 logs rectbot --lines 50

# 再デプロイ
git pull origin main
pm2 restart all

# Redis再起動（必要時）
sudo systemctl restart redis

```

**補足**

- `.env` が破損した場合、GitHub Secrets または Notionから再取得
- Cloudflare Tunnelが落ちている場合は再起動
    
    ```bash
    cloudflared tunnel list
    cloudflared tunnel run <TUNNEL_NAME>
    
    ```
    

---

### 🟨 2. Worker（Cloudflare API）

**主な障害例**

- Workerが403/500エラーを返す
- Cloudflare Accessトークン認証失敗
- Service Token期限切れ

**対応手順**

```bash
cd worker
npx wrangler whoami
npx wrangler deploy

```

**補足**

- `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` が有効か確認
- Workerルートの「Service Bindings」と「環境変数」が正しいか確認

---

### 🟩 3. Pages（フロント）

**主な障害例**

- ページが真っ白 or APIエラー
- ビルドエラー

**対応手順**

```bash
cd frontend
npm run build
npx wrangler pages deploy ./out

```

**補足**

- `.env.production` の `NEXT_PUBLIC_API_BASE_URL` が Workerの公開URLになっているか確認
- CORS設定をWorker側で確認
  
---
---

## 💾 4. Cloudflare R2（バックアップ復旧）

**主な用途**

- Supabaseデータ・Bot設定・キャッシュデータのバックアップ保存
- バックアップは `backup_local_to_r2.sh` で自動同期

**バックアップ確認**

```bash
# R2バケット内の一覧を確認
npx wrangler r2 object list <R2_BUCKET_NAME>

```

**復旧手順**

```bash
# R2からローカルへダウンロード
npx wrangler r2 object get <R2_BUCKET_NAME>/<backup_name>.sql --file=./restore.sql

# Supabaseへ復元
psql <database_url> -f restore.sql

```

**補足**

- `.env` 内の `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` が正しいか確認
- 認証失敗時は Cloudflare Dashboard → R2 → API Tokens で再生成

---

## 🧱 5. データソース別確認項目

| サービス | チェック項目 | コマンド |
| --- | --- | --- |
| VPS | Botが起動中 | `pm2 list` |
| Worker | `/ping` に正常応答 | `curl https://api.rectbot.tech/ping` |
| Redis | 応答確認 | `redis-cli ping` |
| Supabase | DB接続確認 | Supabase Studioまたは`psql` |
| R2 | バケット一覧 | `npx wrangler r2 object list <bucket>` |
| Pages | 正常表示 | ブラウザ確認 |

---

## 🔁 手動復旧フロー（概要）

```
1️⃣ 障害発生
    ↓
2️⃣ ログ確認（pm2 logs / wrangler tail）
    ↓
3️⃣ 影響範囲特定（Bot / Worker / Pages）
    ↓
4️⃣ 修正 or 再デプロイ
    ↓
5️⃣ API・Bot動作確認
    ↓
6️⃣ Notion「復旧報告」へ記録

```

---

## 🔒 セキュリティ確認リスト

- Cloudflare Accessトークン期限確認
- Cloudflare R2 APIキーの有効性確認
- Supabase Service Role Key / JWT Secretの漏洩チェック
- Discord Bot Tokenの再生成（必要時）
---

## 運用・費用

- Cloudflare Paid: $5/月
- Xserver VPS: 1,150 円/月
- ドメイン: 1,600 円/年
- 合計: 約 2,000 円/月
- CI/CD: GitHub Actions
- プロセス監視: pm2
- エラー通知: Sentry / Discord
- バックアップ
    - Supabase → OCI VPS → R2
    - Worker Cron で自動化を検討中
- 将来予定
    - Stripe サブスク連携
    - Edge Function 活用
    - Durable Objects で募集状態キャッシュ最適化
    - Cloudflare Access + Service Token の自動ローテーション

---

---

## 追記用メモ

- 環境情報や依存パッケージのバージョン
- API ルートの追加
- Dashboard UI 変更やページ追加
- 新機能（Stripe / Mail 送信など）の追加

## 🧭 技術的ロードマップ（Technical Roadmap）

だ
---

## 🏗 フェーズ 1：設計・準備段階

### 🎯 目的
開発環境・リポジトリ・アーキテクチャを整備し、開発の基盤を確立する。

### ✅ 手順
- Node.js / npm / Wrangler / Supabase CLI の導入  
- Docker / GitHub Actions 設定  
- `.env` に以下のキーを設定：  
  - Discord Bot Token  
  - Supabase Keys  
  - Cloudflare API Token  
  - Sentry DSN / Stripe Secret など  
- GitHub リポジトリ初期化  
  - `.gitignore`, `.dockerignore` 反映  
  - GitHub Secrets 設定（`GITHUB_SECRETS_SETUP.md` 参照）  
- アーキテクチャ構成定義  
  - Discord Bot（VPS）  
  - Cloudflare Pages（UI）  
  - Cloudflare Workers（API）  
  - Supabase（DB）  
  - Cloudflare R2（バックアップ）

### 📚 参考項目
- GitHub Secrets 設定と環境変数管理  
- Docker環境最適化  
- Supabase構造設計（ER図レベル）  
- Cloudflare Pages × Workers 連携フロー  
- Cloudflare Tunnel 設定・セキュリティモデル  

---

## ⚙️ フェーズ 2：バックエンド構築

### 🎯 目的
リアルタイムなデータ更新とAPI通信を支える基盤を整える。

### ✅ 手順
- Supabase で DB スキーマ定義  
  - Guild設定 / 募集データ / Discord OAuth  
- Cloudflare Workers 構築  
  - API 実装・ルーティング設定  
  - Durable Object / KV / R2 連携  
  - JWT / Service Token による認証実装  
- Cloudflare Pages セットアップ  
  - 管理ダッシュボード / 公開ページ作成  
  - CI/CD 構築

### 📚 参考項目
- Supabase 認証フロー (Discord OAuth対応)  
- Worker環境変数と機密情報管理  
- JWT・Service Token・Access認証の共存設計  
- Cloudflare Pages でのデータ取得手順  
- Sentry / R2 の統合運用  

---

## 🤖 フェーズ 3：Discord Bot 実装

### 🎯 目的
ギルド募集・設定・通知などのBot機能を構築。

### ✅ 手順　 
- `bot/src/index.js` — Bot起動スクリプト構築   
- コマンド群を `bot/src/commands/` に実装  
  - `/gameRecruit`, `/editRecruit`, `/guildSettings`, `/friendCode`, `/help`  
- コマンド登録／削除スクリプト  
  - `deploy-commands.js`, `clear-commands.js`  
- 画像生成・送信 (`bot/images/`)  
- 再起動時に進行中募集をリセット  
- 更新通知機能 (`update-notify.js`)  
- Sentry連携でエラー監視

### 📚 参考項目
- Discord.js v14 コンポーネント設計  
- Component v2の連携実装  
- スラッシュコマンド自動デプロイの仕組み  
- ログ監視 / Sentry連携手順  
- 画像生成処理の最適化 (Canvas / Sharp)  

---

## ☁️ フェーズ 4：デプロイ・運用基盤

### 🎯 目的
本番環境への自動デプロイとデータ保全体制を確立。

### ✅ 手順
- GitHub Actions 構築  
  - `deploy-cloudflare-pages.yml`  
  - `deploy-cloudflare-workers.yml`
  - `deploy-oci.yml` 
- Supabase / Cloudflare R2 への自動バックアップ  
  - `backup_supabase_to_r2.sh`  
  - `backup_local_to_r2.sh`  
- R2 バケット構成設計  
- エラーモニタリングとログ集約 (Loki + Grafana)  
- Cloudflare Tunnel による安全通信

### 📚 参考項目
- GitHub Actions ワークフロー最適化  
- R2 バックアップ & 署名URL設計  
- Loki / Grafana の構築と保護方法  
- Cloudflare Tunnel の認証連携  
- サービス監視・自動復旧スクリプト設計  

---

## 🔄 フェーズ 5：拡張・運用フェーズ

### 🎯 目的
スケーラブルな運用と機能拡張を見据えた改善。

### ✅ 手順
- クラスタリングによるBot高可用化  
- Pages → Workers → Supabase 間のキャッシュ最適化  
- レスポンス高速化 (Redis / CDN キャッシュ活用)  
- ダッシュボード機能拡張 (Guild単位の募集分析)  
- リリースノート・更新履歴管理 (`CHANGELOG.md`)

### 📚 参考項目
- Redis キャッシュ設計とTTL運用  
- 分析ページ (Charts.js / ECharts) 統合  
- 負荷試験 (k6 / autocannon)  
- Supabase Row-Level Security (RLS) 実装  
- Cloudflare CDN / KV キャッシュ最適化  


## 🧭 フェーズ 6：安定運用・改善フェーズ

### 🎯 目的
安定した運用を継続しつつ、リリース管理・監視・改善サイクルを確立する。

### ✅ 手順
- GitHub Release 運用  
- バージョン履歴管理（`CHANGELOG.md` / Notion更新履歴）  
- ユーザーからのバグ報告 → Sentry 自動収集・通知  
- 定期バックアップ・復元検証（R2 / Supabase）  
- 安定版公開後の次フェーズ開発計画策定（ロードマップ更新）

### 💡 参考項目
- バージョニングポリシー（SemVer準拠）  
- Sentry Issue トリアージ手順  
- バックアップ検証の頻度・自動化方法  
- Notion運用ルール（更新履歴・リリースノート整備）  
- 公開後のインシデント対応・ロールバックフロー  
- SLA / 稼働率目標の策定と監視（UptimeRobot / Grafana）  
- GitHub Projects または Linear を用いた改善タスク管理  

⸻

## 🕒 更新履歴（Changelog）
- 追々記述予定
