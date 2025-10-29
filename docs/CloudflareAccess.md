# Cloudflare Access: Upstream 保護ガイド

このドキュメントでは、Grafana / Metabase 等の Upstream サービスを Cloudflare Access で保護する手順をまとめます。目的は「ダッシュボードや内部ツールへアクセスできるユーザーを明確に制御し、オリジンを直接叩かれないようにする」ことです。

重要: ここで説明する設定は `grafana.recrubo.net` 等のホスト名が Cloudflare に管理されていることを前提とします。

## ゴール
- ブラウザ経由のユーザーは Cloudflare Access 経由でログインし、許可されたユーザーのみ Grafana に到達できる。
- Worker（api.rectbot.tech）や自動化クライアントは Service Token または別の機械認証で Upstream にアクセスできる。
- オリジン（Grafana/Metabase）は直接の public アクセスを拒否し、Cloudflare 経由のみ受け入れる。

## 高レベル手順

1. Cloudflare ダッシュボードで Access → Applications を開く。
2. "Add an application" を選び、Type は "Self-hosted" を選択。
3. アプリケーション名と保護するホスト名（例: `grafana.recrubo.net`）を入力。
4. Identity Provider を選択（例: Google, GitHub, Okta）。
   - 注: Discord は標準 OIDC Provider ではないため、Discord ログインを使いたい場合は Supabase 側で Discord 認証を行い Worker で検証するフローが必要です。
5. Policy を作成：メールドメイン、特定ユーザー、または Cloudflare Access のグループを用いてアクセス条件を設定。
6. （オプション）Service Token を作成して、Worker や CI 用の機械クライアントに付与する。

## オリジン側の硬化（必須）
Cloudflare Access を入れても、オリジンが公開されたままだと意味が薄いです。最低でもどれかを実施してください：

- **バインドを localhost にする**（例: Grafana の `http_addr = 127.0.0.1`） + Cloudflare Tunnel を使って公開する。これで直接 Public IP からのアクセスを防げます。
- **ファイアウォールで Cloudflare の IP 範囲のみ許可**（Cloudflare の IP リストは公式から取得）。
- **Basic Auth またはリバースプロキシで認証を付与**し、Worker にのみその資格情報を渡す。

## Worker との連携案（api.rectbot.tech を使う場合）

- Worker は「機械クライアント」として Service Token を使うか、オリジン側の Basic 認証を使用して Upstream にアクセスします。
- 推奨：Worker は Cloudflare Access の Service Token を使って Upstream にアクセスする（Cloudflare の設定で Service Token を許可する）。代替として、Worker が Basic Auth を付けてローカルバインドの Grafana にアクセスする構成も可能。

## テスト手順（簡易）

1. Cloudflare Access で Application を作成し、ブラウザで `https://grafana.recrubo.net` にアクセスしてログインが要求されることを確認。
2. Worker から Upstream にリクエストを送り、Worker が正常に認証ヘッダを付与してレスポンスが返ってくることを確認。
3. オリジンに直接ブラウザからアクセスし、404/拒否されることを確認。

## 参考リンク
- Cloudflare Access docs: https://developers.cloudflare.com/cloudflare-one/apps/
- Cloudflare Tunnel docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

---
このドキュメントをベースに、必要なら Worker 側・wrangler 設定・例コマンドを生成します。どれを次に出しますか：Service Token 用の Worker サンプル、または具体的な firewall 設定コマンド？
