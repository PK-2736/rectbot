# Grafana を Caddy リバースプロキシで公開する

この手順では、Cloudflare（プロキシ有効）配下で Caddy を用いて `https://grafana.recrubo.net/` を公開する方法と、Cloudflare プロキシ無効（DNS のみ）で Let's Encrypt を使う方法を示します。

前提
- このホストがパブリックIPで 80/443 を受けられること（ファイアウォール/セキュリティリストで許可）
- DNS で `grafana.recrubo.net` の A/AAAA レコードがこのホストを指していること
- 可能なら初回は Cloudflare のプロキシを無効（灰色雲）にして HTTP-01 で証明書取得（後で有効化可）

## 1. 構成概要
- Docker Compose `docker-compose.monitoring.yml` に `caddy` サービスを追加済み
- 設定ファイル: `docker/monitoring/caddy/Caddyfile`
- 公開モード:
  - Cloudflare プロキシ有効（推奨）: Cloudflare Origin 証明書を Caddy に設定（デフォルト）
  - Cloudflare プロキシ無効（DNS のみ）: Let's Encrypt (ACME) を Caddy で自動取得

## 2. Cloudflare プロキシ有効モード（推奨）
1) Cloudflare ダッシュボード → SSL/TLS → Origin Server → Create Certificate で `grafana.recrubo.net` 用 Origin 証明書を発行
  - 証明書: `origin.crt`
  - 秘密鍵: `origin.key`
2) ファイル配置（リポジトリ側）

```bash
mkdir -p docker/monitoring/tls
# ブラウザでダウンロードしたファイルを以下へ配置
# docker/monitoring/tls/origin.crt
# docker/monitoring/tls/origin.key
```

3) Caddy は `docker/monitoring/tls` を `/etc/caddy/certs` として読むよう compose でマウント済み
4) Cloudflare 側の SSL/TLS モードを「Full (strict)」に設定
5) DNS はオレンジ雲（プロキシ有効）で `grafana.recrubo.net` → OCI のグローバルIP を指すように設定

## 3. 環境変数（任意：ACME 用）
Cloudflare プロキシ無効（DNS のみ）で Let's Encrypt を使う場合、ACME 連絡先メールを設定すると発行上限緩和・通知に有用です。

```bash
export CADDY_ACME_EMAIL=you@example.com
```

`.env` を使う場合は Compose 実行ディレクトリに配置してください。

## 4. 起動/再起動

```bash
# 初回起動（監視スタック全体）
docker compose -f docker-compose.monitoring.yml up -d caddy grafana

# 状態確認
 docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'caddy|grafana'

# ログ（証明書発行の様子を確認）
docker logs -f caddy
```

ブラウザで https://grafana.recrubo.net/ にアクセスして表示を確認します。
Cloudflare プロキシ有効時は、Caddy には Cloudflare Origin 証明書が設定されているため、`docker logs -f caddy` では ACME 発行ログは出ません。

## 5. Grafana 側の設定
`docker-compose.monitoring.yml` では以下を設定済みです。
- `GF_SERVER_DOMAIN=grafana.recrubo.net`
- `GF_SERVER_ROOT_URL=https://grafana.recrubo.net/`

サブパス公開は行わないため `serve_from_sub_path` は不要です。

## 6. Cloudflare Tunnel の停止（使っている場合）
- systemd 等で稼働している `cloudflared` を停止/無効化
  - 例: `sudo systemctl disable --now cloudflared`
- 既存トンネルの DNS 設定が残っていれば削除

## 7. セキュリティ拡張（任意）
Caddyfile はデフォルトでセキュリティヘッダを付与しています。追加で以下を検討できます。

- Basic 認証（Grafana 認証の前段で簡易ゲート）

```caddyfile
# Caddyfile 内のサーバーブロックで
basicauth /* {
  # 生成: docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpass'
  user JDJhJDEwJHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eG
}
```

- 国/IP 制限（OCI セキュリティリストや Linux firewall での制限が推奨）

## 8. トラブルシュート
- 証明書が取得できない: 80/443 が到達可能か、DNS が正しいか、Cloudflare プロキシを一時無効化して再試行
- 502/404: `grafana` コンテナの起動状態、`monitoring` ネットワーク参加、`Caddyfile` のホスト名が正しいか確認
- リダイレクトループ: `GF_SERVER_ROOT_URL` を `https://grafana.recrubo.net/` に統一

## 9. ロールバック
- 旧 Cloudflare Tunnel に戻す場合は、`caddy` を停止し cloudflared を有効化、DNS/公開経路を元に戻してください。
