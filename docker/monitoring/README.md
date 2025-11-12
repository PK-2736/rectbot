Monitoring stack (OCI side)

このディレクトリには、rectbot の監視スタックが含まれます:
- Loki (logs)
- Prometheus (metrics)
- Pushgateway (Xserver からの push を受ける)
- Grafana (dashboards)
- Metabase (optional BI)

目的（本番に近い挙動の再現）
- 公開は Grafana のみ（本番では Cloudflare Tunnel または Caddy 経由）
- Loki/Prometheus/Pushgateway は内部通信（localhost/同一ホスト）
- Pushgateway への push は「自己署名TLS + IP制限 + Basic Auth」を Nginx リバースプロキシで再現

クイックスタート（開発・本番に近いモード）
1) 自己署名証明書と Basic 認証を用意
   - 証明書（ローカル用）:
     - 生成例
       openssl req -x509 -newkey rsa:2048 -keyout docker/monitoring/tls/tls.key -out docker/monitoring/tls/tls.crt -days 365 -nodes -subj "/CN=localhost"
   - Basic 認証（htpasswd）:
     - 例: apk add --no-cache apache2-utils && htpasswd -nB prom > docker/monitoring/pushgateway/htpasswd
     - 参考: docker/monitoring/pushgateway/htpasswd.example

2) 起動
   - docker compose -f ../../docker-compose.monitoring.yml up -d
   - Nginx リバースプロキシ（9443/TLS）と Pushgateway（9091）、Prometheus（9090）、Loki（3100）、Grafana（3000）が起動します。

3) Push（開発環境から prod-like に）
   - デフォルトで scripts/prometheus-push.sh は https://localhost:9443/metrics/job/xserver-bot に POST します。
   - 必要に応じて環境変数を設定:
     - PUSHGATEWAY_USER, PUSHGATEWAY_PASSWORD（Basic 認証）
     - PUSHGATEWAY_CACERT（自己署名CAのパス、例: docker/monitoring/tls/tls.crt）
     - PUSHGATEWAY_INSECURE=true（検証を無効にしたい場合のみ）

4) Grafana
    - http://localhost:3000 （開発ではポート公開）
    - 本番公開方式:
       - Cloudflare Tunnel + Basic Auth（従来方式）
       - Caddy リバースプロキシ（新方式・推奨）: `docker-compose.monitoring.yml` の `caddy` サービス + `docker/monitoring/caddy/Caddyfile`
          - 手順: docs/GRAFANA_CADDY_SETUP.md を参照

5) アラート（遅延を考慮した緩めのルール）
    - Prometheus は `/etc/prometheus/alerts/*.yml` を読み込みます（本リポでは `prometheus/alerts/xserver.yml`）。
    - 内容:
       - XserverPushStale: 最終 push が3分超で stale を warning（for: 2m）
       - XserverPushMissing: 10分間まったく push が無い場合に critical
       - XserverHighCPU: 5分平均が85%超、10分継続で warning
       - XserverHighMemory: 5分平均が2GiB超、10分継続で warning（必要に応じて閾値調整）
    - 通知連携は Alertmanager または Grafana Alerting で追加可能（Discord Webhook を推奨）。

6) フェイルオーバー（二重構成・冗長化）
    - 目的: Xserver 側 bot が停止したら、OCI 側で即座に代替 bot を起動し、Xserver 復帰時は優先的に Xserver 側へ戻す。
    - 実装方式: Redis を用いたリーダーロック + ハートビート（bot 側に内蔵）。
       - 環境変数で有効化: `FAILOVER_ENABLED=true`
       - サイト識別: `SITE_ID=oci`（OCI 側）, `SITE_ID=xserver`（Xserver 側）
       - 共有 Redis: 双方の bot が同一の Redis に接続（本開発構成では `redis` サービス。実運用では OCI 側 Redis を共有）
       - キー: ロック `rectbot:leader`、ハートビート `rectbot:hb:{site}`（TTL ~90s）
       - ポリシー: Xserver のハートビートが新鮮な場合、OCI がリーダーでも自発的に降格（Xserver 優先）
    - 使い方（OCI 側）:
       - この compose に `bot-oci` サービスを用意（`SITE_ID=oci`, `FAILOVER_ENABLED=true`）。
       - `DISCORD_BOT_TOKEN` は .env などで指定。
    - 使い方（Xserver 側）:
       - Xserver 上の bot 実行環境に `FAILOVER_ENABLED=true`, `SITE_ID=xserver`, `REDIS_HOST` など Redis 接続を設定。
       - 共有 Redis（OCI）に到達できることが前提。到達不能時は OCI が引き続きリーダーを維持します。
    - 注意:
       - ロック TTL は ~90s、更新は ~30s 間隔。短時間の重複を避けるため、ロック取得前にはログインせず、降格時は Discord クライアントを破棄します。
       - これにより「同一トークンで二重接続」の競合を回避します。

IP 制限（Nginx）
- デフォルトは `127.0.0.1` と Docker ブリッジ `172.16.0.0/12` を許可
- 調整: `docker/monitoring/pushgateway/nginx.conf` の `allow/deny` を編集
- 本番は OCI のパブリックIFに対して Xserver の固定IPのみ `allow` を設定

プロビジョニング
- Grafana データソース: `grafana/provisioning/datasources/datasources.yaml`
- ダッシュボード: `grafana/dashboards` に配置（自動で読み込み）

公開方式
- Cloudflare Tunnel（本番従来）
   - 公開対象は Grafana のみ（例: grafana.recrubo.net -> localhost:3000）
   - loki/prom はトンネル公開しない（内部通信）
   - サンプル: `cloudflared/config.example.yml`
- Caddy（新方式）
   - DNS: `grafana.recrubo.net` をこのホストのパブリックIPに向ける
   - 80/443 を開放（初回 ACME 取得に 80 必須）
   - Caddy が Let's Encrypt 証明書を自動管理し grafana コンテナへ reverse_proxy
   - 設定ファイル: `docker/monitoring/caddy/Caddyfile`

Xserver 側 push スクリプト
- `scripts/prometheus-push.sh` を cron から実行（毎分など）
- デフォルトの送信先はローカルの prod-like プロキシ (9443/TLS)。実環境では `PUSHGATEWAY_URL` で `https://prom.recrubo.net/metrics/job/xserver-bot` に切替。

Discord アラート
- `scripts/discord-alert.sh` を使用
- `DISCORD_ALERT_WEBHOOK_URL` を設定
