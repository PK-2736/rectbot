# Discord Bot + Web + サブスク小規模サービス構成

## 主要機能

### 🎮 ゲーム募集機能
- **募集作成**: `/gamerecruit` コマンドで美しい募集カードを生成
- **参加管理**: ボタンクリックで簡単に参加・取り消し
- **リアルタイム更新**: 参加者リストの自動更新

### ⚙️ ギルド設定機能
各ギルド（サーバー）毎に以下の設定をカスタマイズ可能：

- **📍 募集チャンネル設定**: 募集を投稿するチャンネルを指定
- **🔔 募集通知ロール設定**: 募集作成時にメンションするロールを設定
- **📝 既定募集タイトル設定**: 募集作成時の初期タイトルテンプレート
- **🎨 既定募集カラー設定**: 募集カードのアクセントカラーをカスタマイズ
- **📢 アップデート通知チャンネル設定**: Bot更新情報を受け取るチャンネル

**使用方法**: `/guildsettings` コマンド（サーバー管理権限必須）
**UI**: Discord Components v2を使用した直感的な設定画面

---

## 1. プロジェクト概要

このプロジェクトは、以下を目的とした小規模商用サービスです：

- Discord Bot を OCI 上で常時稼働  
- Web 上でユーザー管理・サブスクリプション情報確認  
- Stripe による小規模サブスク（月額/年額）課金対応  
- Supabase を利用した認証・DB管理・リアルタイムAPI  
- Cloudflare Workers/Pages を利用した高速・安全な Web / API ホスティング  

想定ユーザー数：**200 人程度**  

---

## 2. 使用サービス

| コンポーネント | サービス | プラン | 用途 | コメント |
|---------------|---------|-------|-----|---------|
| Web | Cloudflare Pages | Free | フロントエンドホスティング | React/Next.jsなど静的・SSG/SSR対応 |
| API | Cloudflare Workers | Free | 軽量 API / Stripe Webhook | Serverless 関数でサブスク更新 |
| BaaS / DB | Supabase | Free | DB + 認証 + Realtime | 200ユーザー規模なら無料枠で十分 |
| Discord Bot | OCI Arm インスタンス | Always Free | Bot常時稼働 | Pythonで開発。サブスク権限管理 |
| 課金 | Stripe | Free（手数料のみ） | 月額/年額サブスク課金 | 学生オファー利用可 |
| 監視 / ログ | Sentry Free | Free | バックエンド・Botのログ管理 | 必要に応じ有料プランに切替可能 |

---

## 3. 構成の利点

- 小規模サービスに最適。無料枠で開発・運用可能  
- Cloudflare のセキュリティ機能で TLS/DDoS 対策済  
- Supabase で認証・DB・リアルタイムAPIを統合管理  
- OCI VM で Bot を自由に開発・運用可能  
- Stripe 学生オファーで手数料軽減、商用課金対応可能  

---

## 4. ディレクトリ構造

```plaintext
project-root/
├─ frontend/                         # Cloudflare Pages (React/Next.jsなど)
│   ├─ package.json                  # npmプロジェクト管理ファイル
│   ├─ src/
│   │   ├─ App.jsx                   # Reactメインコンポーネント
│   │   └─ index.jsx                 # エントリーポイント
│   └─ public/
│       └─ index.html                # 静的HTML
├─ backend/                          # Cloudflare Workers + Stripe Webhook
│   ├─ wrangler.toml                  # Workers設定ファイル
│   ├─ package.json                   # npm管理 (依存パッケージ)
│   └─ index.js                       # Worker本体 (Webhook処理, Supabase連携)
├─ bot/                              # Discord Bot (OCI VM, Python)
│   ├─ requirements.txt              # Python依存パッケージ
│   ├─ bot.py                         # メインBotスクリプト
│   └─ config.env                     # 環境変数 (TOKEN, DB接続情報)
├─ infra/                            # Caddy/Docker 設定、環境変数管理
│   ├─ Caddyfile                      # HTTPS/TLS設定
│   ├─ docker-compose.yml             # Dockerコンテナ設定例
│   └─ env.example                     # サンプル環境変数
├─ .github/                          # CI/CD ワークフロー
│   └─ workflows/
│       └─ deploy.yml                 # GitHub Actionsによる自動デプロイ設定
└─ README.md                          # プロジェクト概要・構成説明
```

### 追加ポイント

- **frontend/**: React / Next.js の簡易構成。Pages にデプロイ可能  
- **backend/**: Wrangler 設定 + Worker 本体。Stripe Webhook と Supabase連携を想定  
- **bot/**: Python Bot。本番環境では OCI VM 上で常時稼働  
- **infra/**: Caddy で TLS 自動化、Docker でローカル開発・テスト  
- **.github/**: GitHub Actions でフロント・バックエンド・Botの自動デプロイ  
- **README.md**: 今回作ったプロジェクト概要・構成説明を格納  

---


### 各ディレクトリ詳細

- **frontend/**  
  - Webページと UI  
  - Discord OAuth フロー・Stripe Checkout UI  
- **backend/**  
  - Cloudflare Workers 関数  
  - Stripe Webhook 受信  
  - Supabase DB からサブスク状態取得/更新  
- **bot/**  
  - Discord Bot (Python)  
  - サブスク権限チェック、サーバー管理  
- **infra/**  
  - Caddy/Docker 設定  
  - 環境変数・TLS証明書管理  
- **.github/**  
  - GitHub Actions による CI/CD  
  - 自動デプロイ、テスト、ビルド  

---

## 5. Stripe 連携ポイント

- Webフロントで Checkout Session 作成  
- Cloudflare Workers で Webhook 受信  
- Supabase DB にサブスク状態を保存  
- Discord Bot が DB 参照しサーバー権限を更新  

---

## 6. Cloudflare 無料枠制限

| 項目 | 無料枠 | コメント |
|------|--------|---------|
| Workers リクエスト | 100,000/月 | 200ユーザー規模なら十分 |
| Workers CPU時間 | 50ms/リクエスト | APIレスポンス軽量設計推奨 |
| Pages ビルド | 500/月 | CI/CD 更新頻度注意 |
| Pages 帯域 | 100GB/月 | 画像/動画多い場合注意 |

> 必要に応じ有料プランにアップグレード可能  

---

## 7. セキュリティ対策

- TLS/HTTPS 自動化 (Cloudflare + Caddy)  
- API / Webhook は JWT 認証  
- DB 接続は SSL + IP制限  
- バックアップ: Supabase 自動バックアップ + OCI Botログ保存  
- 監視: Sentry / Supabase Audit Log  

---

## 8. 商用化ロードマップ

1. 開発・テストは無料枠で対応  
2. ユーザー増加や安定運用の際、有料プランに切り替え  
   - Cloudflare Workers/Pages Paid  
   - Supabase Pro Plan  
   - OCI VM 必要に応じリソース増加  
3. Stripe によるサブスク課金開始  
4. 監視・バックアップ・セキュリティ維持  

---

## 9. バックアップ / データ管理

- **Supabase**: 自動スナップショット + Audit Log  
- **OCI Bot**: 定期ログ保存  
- **Cloudflare Workers / Pages**: ソースコードは GitHub 管理  

---

## 10. 注意点

- 無料枠だけで長期運用は安定性が不安  
- 200ユーザー規模の小規模サービス向け  
- 将来的にアクセスが増える場合は有料プランへの移行を推奨  

## 11. 環境変数 (.env) サンプル

このプロジェクトでは、各種シークレットや接続情報を `.env` ファイルで管理します。  
以下はサンプルです。

```env
# ==========================
# Frontend / OAuth
# ==========================
REACT_APP_DISCORD_CLIENT_ID=your_discord_client_id
REACT_APP_DISCORD_REDIRECT_URI=https://yourdomain.com/auth/callback
REACT_APP_SUPABASE_URL=https://your-supabase-url.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key

# ==========================
# Backend / Workers
# ==========================
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
WORKERS_ENV=production

# ==========================
# Discord Bot (OCI VM)
# ==========================
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_guild_id
SUPABASE_DB_URL=postgresql://user:password@host:5432/dbname
SUPABASE_DB_KEY=your_supabase_service_role_key

# ==========================
# General
# ==========================
NODE_ENV=development
PORT=3000

```
---

## 12. まとめ

この構成は **初期費用ほぼゼロで商用利用可能な小規模サブスクサービス** に最適です：

- **Cloudflare Pages + Workers**: Web/API高速配信 + TLS/DDoS保護  
- **Supabase Free**: 認証・DB・リアルタイム管理  
- **OCI Arm VM**: Discord Bot常時稼働  
- **Stripe**: 月額/年額サブスク課金  

> 無料枠で開発・PoC → ユーザー増加に応じて有料プランに切替すれば安全に商用運用可能。
