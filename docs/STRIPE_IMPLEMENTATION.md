# Recrubo Dashboard - Stripe 決済機能実装

## 変更概要

Recrubo ダッシュボード（https://dash.recrubo.net/）に以下の機能を実装しました：

1. **Discord ログイン** - 既存機能を維持
2. **Stripe 決済機能** - プレミアムプランへのアップグレード
3. **募集監視ページの削除** - 管理者向けページを一般ユーザー向けに変更

## 実装内容

### フロントエンド（`/frontend/dashboard`）

#### 変更されたファイル

1. **`src/app/page.tsx`**
   - 管理者チェックを削除
   - ログイン後に `UserDashboard` を表示
   - Discord ログイン画面の UI 改善

2. **`src/components/UserDashboard.tsx`**
   - 完全に新規実装
   - Stripe Checkout 統合
   - 無料プラン vs プレミアムプランの比較表示
   - プレミアム機能の詳細説明
   - FAQ セクション

3. **`package.json`**
   - `@stripe/stripe-js` と `stripe` パッケージを追加

#### 新規作成されたファイル

1. **`src/app/success/page.tsx`**
   - 決済成功ページ
   - 自動リダイレクト機能

2. **`src/app/cancel/page.tsx`**
   - 決済キャンセルページ
   - 自動リダイレクト機能

### バックエンド（`/backend`）

#### 新規作成されたファイル

1. **`src/routes/stripe.js`**
   - `/api/stripe/create-checkout-session` - Checkout セッション作成
   - `/api/stripe/webhook` - Stripe からの Webhook 処理
   - `/api/stripe/success` - 決済成功時のリダイレクト
   - `/api/stripe/cancel` - 決済キャンセル時のリダイレクト
   
   主な機能：
   - ユーザー認証（Cookie ベース）
   - Stripe Checkout セッション作成
   - サブスクリプション状態の管理（Webhook 経由）
   - Supabase へのサブスクリプション情報保存

#### 変更されたファイル

1. **`src/index.js`**
   - `handleStripeRoutes` をインポート
   - ルートハンドラーに追加

2. **`package.json`**
   - `stripe` パッケージが既に含まれていることを確認

## 必要な環境変数

### フロントエンド

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_API_BASE_URL=https://api.recrubo.net
NEXT_PUBLIC_DISCORD_CLIENT_ID=...
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://api.recrubo.net/api/discord/callback
```

### バックエンド（Cloudflare Workers）

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
DASHBOARD_URL=https://dash.recrubo.net
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

## セットアップ手順

詳細なセットアップ手順は [`/docs/STRIPE_SETUP.md`](../docs/STRIPE_SETUP.md) を参照してください。

### クイックスタート

1. **Stripe アカウントを作成**
   - https://stripe.com でアカウント作成
   - API キーを取得

2. **環境変数を設定**
   ```bash
   # フロントエンド
   cd frontend/dashboard
   cp .env.example .env.local
   # .env.local を編集

   # バックエンド
   cd backend
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

3. **Stripe 商品を作成**
   - Stripe ダッシュボードで「プレミアムプラン」を作成
   - 価格 ID をコピー
   - `UserDashboard.tsx` の `handleSubscribe` 関数で価格 ID を更新

4. **Webhook を設定**
   - エンドポイント: `https://api.recrubo.net/api/stripe/webhook`
   - イベント: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

5. **デプロイ**
   ```bash
   # フロントエンド
   cd frontend/dashboard
   npm run build

   # バックエンド
   cd backend
   npm run deploy
   ```

## ユーザーフロー

1. **ログイン**
   - ユーザーが dash.recrubo.net にアクセス
   - Discord でログインボタンをクリック
   - Discord OAuth 認証
   - ダッシュボードにリダイレクト

2. **プラン確認**
   - 無料プランとプレミアムプランの比較を表示
   - プレミアム機能の詳細を確認

3. **決済**
   - 「プレミアムプランに登録」ボタンをクリック
   - Stripe Checkout ページにリダイレクト
   - カード情報を入力
   - 決済完了

4. **決済後**
   - 成功: `/success` ページに遷移 → 5秒後にダッシュボードへ
   - キャンセル: `/cancel` ページに遷移 → 5秒後にダッシュボードへ

5. **Webhook 処理**
   - Stripe が `/api/stripe/webhook` にイベントを送信
   - サブスクリプション情報を Supabase に保存
   - ユーザーのプレミアム状態を更新

## データベーススキーマ

Supabase に以下のテーブルを作成することを推奨：

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
```

## セキュリティ考慮事項

現在の実装は基本的な機能のみ含まれています。本番環境では以下を強化してください：

1. **JWT 検証の強化**
   - 現在は簡易的な JWT デコードのみ
   - 署名検証を実装する必要があります

2. **CORS 設定**
   - 適切なオリジンのみ許可

3. **Webhook 署名検証**
   - 実装済みだが、環境変数が必要

4. **HTTPS 必須**
   - すべての通信を HTTPS で行う

## テスト

### Stripe テストカード

```
カード番号: 4242 4242 4242 4242
有効期限: 12/34
CVC: 123
```

### ローカルテスト

```bash
# Stripe CLI でローカル Webhook をテスト
stripe listen --forward-to http://localhost:8787/api/stripe/webhook
```

## トラブルシューティング

- **決済ボタンが動作しない**: ブラウザのコンソールでエラーを確認
- **Webhook が受信されない**: Stripe ダッシュボードでログを確認
- **認証エラー**: Cookie 設定と JWT 検証を確認

## 今後の拡張案

- [ ] サブスクリプション管理ページ
- [ ] ユーザーごとのサブスクリプション状態表示
- [ ] キャンセル/プラン変更機能
- [ ] 請求履歴
- [ ] クーポンコード対応
- [ ] 複数プランの対応
- [ ] チーム/組織プラン

## 関連ドキュメント

- [Stripe セットアップガイド](../docs/STRIPE_SETUP.md)
- [Stripe 公式ドキュメント](https://stripe.com/docs)
- [Next.js + Stripe サンプル](https://github.com/vercel/next.js/tree/canary/examples/with-stripe-typescript)
