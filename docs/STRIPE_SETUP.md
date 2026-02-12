# Stripe 決済機能の設定ガイド

## 概要

Recrubo ダッシュボードに Discord ログインと Stripe 決済機能が実装されました。以下の設定を行うことで、プレミアムプラン機能が利用可能になります。

## 実装内容

### フロントエンド (dashboard)
- Discord ログイン機能（既存）
- Stripe Checkout による決済フロー
- プレミアムプラン紹介ページ
- 募集監視ページを削除

### バックエンド (backend)
- Stripe Checkout セッション作成API (`/api/stripe/create-checkout-session`)
- Stripe Webhook 処理 (`/api/stripe/webhook`)
- 決済成功/キャンセル処理

## 必要な環境変数

### フロントエンド (.env.local)

```bash
# Stripe 公開可能キー
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx

# API ベース URL
NEXT_PUBLIC_API_BASE_URL=https://api.recrubo.net

# Discord OAuth
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_discord_client_id
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://api.recrubo.net/api/discord/callback
```

### バックエンド (Cloudflare Workers)

Cloudflare Workers の環境変数に以下を設定：

```bash
# Stripe シークレットキー
STRIPE_SECRET_KEY=sk_test_xxxxx

# Stripe Webhook シークレット
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# ダッシュボード URL（リダイレクト用）
DASHBOARD_URL=https://dash.recrubo.net

# Supabase 設定（既存）
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

## Stripe の設定手順

### 1. Stripe アカウントの作成

1. [Stripe](https://stripe.com) にアクセス
2. アカウントを作成
3. ダッシュボードにログイン

### 2. API キーの取得

1. Stripe ダッシュボードで「開発者」→「API キー」に移動
2. 公開可能キー (`pk_test_...`) と秘密キー (`sk_test_...`) をコピー
3. フロントエンドとバックエンドの環境変数に設定

### 3. 商品と価格の作成

1. Stripe ダッシュボードで「商品」→「商品を追加」
2. プレミアムプランを作成：
   - 商品名: "Recrubo Premium"
   - 説明: "プレミアムプラン - 無制限の募集作成など"
3. 価格を設定（月額980円など）
4. 作成した価格の ID (`price_xxxxx`) をコピー
5. フロントエンドの `UserDashboard.tsx` の `handleSubscribe` 関数内の価格IDを更新

### 4. Webhook の設定

1. Stripe ダッシュボードで「開発者」→「Webhook」に移動
2. 「エンドポイントを追加」をクリック
3. エンドポイント URL: `https://api.recrubo.net/api/stripe/webhook`
4. 以下のイベントを選択：
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Webhook署名シークレット (`whsec_xxxxx`) をコピー
6. バックエンドの環境変数に設定

## データベーステーブル

Supabase に以下のテーブルを作成（オプション）：

```sql
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
```

## デプロイ手順

### 1. フロントエンド

```bash
cd /workspaces/rectbot/frontend/dashboard

# 環境変数を設定
cat > .env.local << EOF
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
NEXT_PUBLIC_API_BASE_URL=https://api.recrubo.net
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_discord_client_id
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://api.recrubo.net/api/discord/callback
EOF

# ビルド
npm run build

# デプロイ（Cloudflare Pages など）
```

### 2. バックエンド

```bash
cd /workspaces/rectbot/backend

# Cloudflare Workers に環境変数を設定
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET

# デプロイ
npm run deploy
```

## テスト手順

### 1. テストモードでの確認

1. Stripe のテストモードを使用
2. [Stripe テストカード](https://stripe.com/docs/testing#cards) を使用して決済テスト
3. 成功カード: `4242 4242 4242 4242`
4. 有効期限: 未来の日付（例: 12/34）
5. CVC: 任意の3桁（例: 123）

### 2. Webhook のテスト

1. [Stripe CLI](https://stripe.com/docs/stripe-cli) をインストール
2. ローカルでWebhookをテスト：
   ```bash
   stripe listen --forward-to https://api.recrubo.net/api/stripe/webhook
   ```

## トラブルシューティング

### 決済ボタンを押してもエラーが発生する

- ブラウザのコンソールでエラーを確認
- バックエンドの環境変数が正しく設定されているか確認
- Stripe API キーが正しいか確認

### Webhook が受信されない

- Stripe ダッシュボードでWebhook のログを確認
- エンドポイント URL が正しいか確認
- Webhook シークレットが正しいか確認

### 認証エラーが発生する

- Discord OAuth の設定を確認
- Cookie が正しく設定されているか確認
- CORS 設定を確認

## セキュリティ注意事項

1. **本番環境では必ず本番用のAPIキーを使用**
2. **Webhook シークレットは必ず検証**
3. **JWT の検証を適切に実装**（現在は簡易実装）
4. **HTTPS を必ず使用**
5. **環境変数を Git にコミットしない**

## 今後の拡張

- [ ] サブスクリプション管理ページの追加
- [ ] ユーザーごとのサブスクリプション状態表示
- [ ] キャンセル/プラン変更機能
- [ ] 請求履歴の表示
- [ ] クーポンコード対応

## 参考リンク

- [Stripe ドキュメント](https://stripe.com/docs)
- [Stripe Checkout](https://stripe.com/docs/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Next.js + Stripe](https://github.com/vercel/next.js/tree/canary/examples/with-stripe-typescript)
