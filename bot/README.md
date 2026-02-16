# Recrubo - Discord Bot

## 概要
Recrubo は Discord 上でゲーム募集やフレンドコード管理を行う Bot です。  
- 言語: **Node.js (discord.js)**
- 画像処理: **canvas**
- データ管理: **Supabase/PostgreSQL**
- API連携: Cloudflare Worker 経由で Supabase / Express と通信（Service Token 認証）
- 監視: Sentry と Discord Webhookで障害通知

---

## 主な機能

### ゲーム募集機能
1. ユーザーがスラッシュコマンドを実行  
2. Discord Modal で募集内容、人数、時間、通知有無を入力  
3. 用意した募集画像に埋め込み  
4. Discord Button を付与（参加 / 取り消し / 締め）  
5. 参加ボタン押下 → 画像のメンバー欄にアイコンを追加  
6. 取り消しボタン押下 → 画像から削除  
7. 締めボタン押下 → 画像上に「CLOSE」を埋め込み

### フレンドコード保存機能
- スラッシュコマンドでゲームごとのフレンドIDやプロフィールを保存  
- 必要時にスラッシュコマンドで表示可能

### サブスク関連機能（将来的に実装）
- サーバーごとのサブスク有効確認  
- サブスクを有効化する設定  
- サブスク特典：
  - 一度に募集できる数が増加（例: 1 → 3）  
  - フレンドコード保存機能追加  
- サブスクメンバーはサポートサーバーでロール付与  
- Web 上でコードを入手 → 対応サーバーで有効化  
- サブスク解約時はサーバー側で無効化

### その他機能
- 募集通知ロール設定  
- 募集チャンネル設定  
- ヘルプコマンド  
- サブスクヘルプコマンド

---

## ディレクトリ構成

```plaintext
bot/
├─ package.json # Node.js プロジェクト情報・依存関係
├─ package-lock.json # 依存関係の固定バージョン管理
├─ .gitignore # node_modules, .env を無視
├─ src/ # ソースコード
│ ├─ index.js # Bot エントリーポイント
│ ├─ config.js # トークン・環境変数管理
│ ├─ commands/ # スラッシュコマンド
│ │ ├─ ping.js
│ │ ├─ gameRecruit.js
│ │ └─ friendCode.js
│ ├─ events/ # Discord イベント処理
│ │ ├─ ready.js
│ │ ├─ interactionCreate.js
│ │ └─ messageReactionAdd.js
│ └─ utils/ # ユーティリティ関数
│ ├─ embedBuilder.js # 募集画像・埋め込み生成
│ └─ db.js # Supabase/PostgreSQL 接続処理
└─ node_modules/ # npm install で作成（GitHubには上げない）

```


---

## ファイル詳細

### package.json
- Bot の依存関係やスクリプトを管理
- 例：
```json
{
  "name": "rectbot",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js"
  },
  "dependencies": {
    "discord.js": "^14.22.1",
    "@supabase/supabase-js": "^2.57.4",
    "dotenv": "^16.0.0",
    "canvas": "^3.2.0",
    "ioredis": "^5.8.0"
  }
}
```

### 環境変数のポイント
- `DISCORD_BOT_TOKEN`, `SERVICE_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` など機密値は `.env` もしくは GitHub Secrets で管理します。
- `VPS_EXPRESS_URL` には Cloudflare Tunnel 経由の HTTPS エンドポイントを設定します。
- `SENTRY_DSN` と `JWT_PRIVATE_KEY` を指定すると Worker との認証およびエラー監視が有効になります。
