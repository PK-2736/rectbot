# 完全版 README.md  
Xserver ↔ OCI 監視・統合構成

---

## 🎯 目的
- **Xserver 側**は Bot 稼働環境を軽量に保ち、必要なログ・メトリクスのみ収集  
- **OCI 側**で監視・可視化・BI を一元化  
- **SaaS 連携**（Sentry.io など）を API 経由で Grafana に統合  
- **外部通知**は緊急時のみ Discord に送信  
- **Grafana 公開**は Cloudflare Tunnel 経由 + Basic Auth で安全に提供  

---

## 🧩 全体構成

### Xserver (軽量化重視)
- Discord Bot (Node.js)
- Redis（キャッシュ）
- Promtail（ログ収集 → Loki）
- Node Exporter（リソース監視 → Pushgateway に定期POST）

### OCI (監視・統合用)
- Loki（ログ集約）
- Prometheus（メトリクス収集）
- Pushgateway（Xserver からのメトリクス受け口）
- Grafana（可視化・統合ダッシュボード）
- Metabase（BI/データ分析）

### SaaS → OCI 連携
- **Sentry.io**  
  - Bot / Worker / Pages / Dashboard から直接送信  
  - API 経由で Grafana に統合（アラート・イベント連携）

### 外部監視・通知
- **Discord**  
  - 緊急対応の内容のみ Webhook で専用チャンネルに送信  
  - 通常監視は Grafana 側で集約

---

## 📦 データフロー図



[Xserver VPS] ├─ Bot / Redis ├─ Promtail ────────────────┐ └─ Node Exporter → Pushgateway│ ▼ [ Cloudflare Tunnel ] ▼ [ OCI ] ├─ Loki  ←── Promtail ├─ Prometheus ←── Pushgateway ├─ Grafana (統合可視化) └─ Metabase (BI/分析)

[SaaS] ├─ Sentry.io → Grafana (API連携) └─ その他サービス → Grafana (API連携)

[外部通知] └─ Discord (Webhook, 緊急時のみ)


---

## ⚙️ 設定例

### 1. Promtail 設定
`/etc/promtail/config.yml`
```yaml
server:
  http_listen_port: 9080
positions:
  filename: /tmp/positions.yaml
clients:
  - url: https://loki.recrubo.net/loki/api/v1/push
    tenant_id: default
    basic_auth:
      username: loki
      password: ${LOKI_PASSWORD}
scrape_configs:
  - job_name: bot-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: bot
          host: xserver
          __path__: /var/log/bot/*.log


---

2. Node Exporter → Pushgateway スクリプト

/usr/local/bin/prometheus-push.sh

#!/bin/bash
CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2 + $4}')
MEM=$(free -m | awk '/Mem:/ {print $3}')
echo "bot_cpu_usage $CPU" | curl --data-binary @- https://prom.recrubo.net/metrics/job/xserver-bot
echo "bot_mem_usage $MEM" | curl --data-binary @- https://prom.recrubo.net/metrics/job/xserver-bot


cron 登録例：

* * * * * /usr/local/bin/prometheus-push.sh


---

3. Cloudflare Tunnel 設定

/etc/cloudflared/config.yml

tunnel: oci-monitoring
credentials-file: /etc/cloudflared/oci-monitoring.json

ingress:
  - hostname: loki.recrubo.net
    service: http://localhost:3100
  - hostname: prom.recrubo.net
    service: http://localhost:9091
  - hostname: grafana.recrubo.net
    service: http://localhost:3000
  - service: http_status:404


起動:

systemctl enable cloudflared
systemctl start cloudflared


---

4. Grafana 設定 (Basic Auth + Tunnel 公開)

/etc/grafana/grafana.ini

[server]
http_addr = 127.0.0.1
http_port = 3000
domain = grafana.recrubo.net
root_url = https://grafana.recrubo.net/

[auth.basic]
enabled = true

[security]
admin_user = admin
admin_password = ${GRAFANA_ADMIN_PASSWORD}


• http_addr = 127.0.0.1 → 外部から直接アクセス不可
• 公開は Cloudflare Tunnel 経由のみ
• Basic Auth で認証必須


---

5. Grafana データソース設定例

• Loki• URL: https://loki.recrubo.net
• Auth: Basic Auth (loki / ${LOKI_PASSWORD})

• Prometheus• URL: https://prom.recrubo.net
• Auth: Basic Auth (prom / ${PROM_PASSWORD})

• Metabase API (JSON API プラグイン利用)• URL: https://metabase.recrubo.net/api/card/:id/query
• Auth: Bearer Token (Metabase API Key)

• Sentry.io API• URL: https://sentry.io/api/0/projects/<org>/<project>/events/
• Auth: Bearer Token (Sentry API Key)



---

6. Discord Webhook 設定例

/usr/local/bin/discord-alert.sh

#!/bin/bash
WEBHOOK_URL="https://discord.com/api/webhooks/XXXX/XXXX"
MESSAGE="🚨 緊急アラート: $1"
curl -H "Content-Type: application/json" \
     -X POST \
     -d "{\"content\": \"$MESSAGE\"}" \
     $WEBHOOK_URL


Prometheus Alertmanager または Grafana Alerting から呼び出し可能。

---

🔒 セキュリティ・運用ポイント

• 通信経路：Xserver ↔ OCI は Cloudflare Tunnel 経由（外部ポート不要）
• 認証：Cloudflare Access Token / Basic Auth
• データ保持：OCI 側 Loki / Prometheus に永続化
• 通知制御：通常監視は Grafana、緊急時のみ Discord へ限定送信
• 役割分担：• Grafana → 監視・統合ビュー
• Metabase → BI/業務データ分析
• Sentry → エラートラッキング
• Discord → 緊急アラート



---

✅ まとめ

• Xserver 側は軽量構成（Bot + Redis + Promtail + Node Exporter）
• OCI 側で監視・可視化を一元化（Loki + Prometheus + Grafana + Metabase）
• SaaS 連携は API 経由で Grafana に統合
• Grafana 公開は Cloudflare Tunnel + Basic Auth
• 緊急通知は Discord Webhook に限定


→ 「軽量なエッジ（Xserver）」＋「強力な監視基盤（OCI）」＋「外部SaaS連携」＋「安全な公開」の完全構成


---

これで **今までの要素をすべて落とし込んだ完全版 README.md** です。  
このまま GitHub に置けば、Copilot と一緒にコードや IaC を展開していけますね。