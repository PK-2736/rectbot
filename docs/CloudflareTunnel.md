# Cloudflare Tunnel/Access 設定ガイド（OCI で Grafana を公開）

この手順は、OCI 上の監視スタック（Grafana/Loki/Prometheus など）をインターネットに直公開せず、Cloudflare Tunnel 経由で `grafana.recrubo.net` に安全に公開するためのものです。最小構成では Grafana のみを公開し、他はローカルバインドのままにします。

関連ファイル:
- `docker-compose.monitoring.yml` … Grafana は `127.0.0.1:3000` にバインド
- `docker/monitoring/cloudflared/config.example.yml` … 複数ホスト名を 127.0.0.1 の各サービスへルーティングする例
- `docker/monitoring/grafana/grafana.ini` … 基本認証/ログイン設定（サインアップ無効化）

## 構成の要点
- 露出方針:
  - Grafana: Cloudflare Tunnel で `grafana.recrubo.net -> http://localhost:3000` へ。Cloudflare Access を任意で有効化。
  - Loki/Prometheus/Metabase: 原則ローカルのみ（Cloudflare Tunnel 経由の個別ホスト名を必要時に追加）。
  - Pushgateway プロキシ(Nginx): `:9443` をパブリック公開（Xserver からの push 用）。自己署名 TLS + Basic 認証 + IP 制限を前提（`docker/monitoring/pushgateway/nginx.conf` を参照）。
- 安全性:
  - Docker 側は localhost ポートバインドで外部直アクセスを遮断。
  - Cloudflare 側で HTTPs/Tunnel 経由に限定。必要に応じて Access ポリシーで本人認証。

## A. Cloudflare ダッシュボード側の準備
1) ドメインの管理
- `recrubo.net` を Cloudflare に移管/管理していること。

2) Zero Trust (Access/Tunnels) を有効化
- Cloudflare ダッシュボード → Zero Trust → 設定を初期化（無料枠で可）。

3) Tunnel の作成
- Zero Trust → Networks → Tunnels → Create a tunnel
- トンネル名: `oci-monitoring`
- "Cloudflared" を選択し作成。表示される「トークン」を控える（後で OCI に設定）。

4) Public Hostname の追加
- Tunnel 詳細 → Public Hostnames → Add a public hostname
  - Hostname: `grafana.recrubo.net`
  - Service: `http://localhost:3000`
  - 必要に応じて Cloudflare Access を ON（後述）。
- 追加で必要なら:
  - `loki.recrubo.net` → `http://localhost:3100`
  - `prom.recrubo.net` → `http://localhost:9090` など（原則は非公開推奨）。

5) (推奨) Cloudflare Access を設定
- Zero Trust → Access → Applications → Add an application → Self-hosted
  - App name: `Grafana`
  - Session duration: 8h など
  - Policies: Include → Emails/Identity Provider 等、許可するユーザーを指定
- Tunnel の `grafana.recrubo.net` の Hostname に Access を関連付け（Public Hostname の編集画面で設定可能）。

## B. OCI ホスト（Ubuntu）で cloudflared を常駐化
以降は OCI 上で作業します。`docker compose` で監視スタックが起動済み（Grafana が `127.0.0.1:3000`）であることを想定します。

方法は2通りあります。簡単なのは「トークン方式（service install）」です。

### 方法1: トークン方式（推奨・簡単）
1) cloudflared インストール（公式リポジトリ）
- 公式ドキュメント: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

2) サービス登録
- Cloudflare ダッシュボードで控えたトンネルトークンを使い、以下のコマンドで systemd サービスを作成します:

  cloudflared service install <YOUR_TUNNEL_TOKEN>

- 自動で `/etc/systemd/system/cloudflared.service` が作られ、起動・自動起動が有効化されます。

3) 動作確認
- `systemctl status cloudflared` で起動状態を確認し、Cloudflare ダッシュボードのトンネル画面でも `HEALTHY` になっているかを確認。
- ブラウザで `https://grafana.recrubo.net` にアクセスしてログイン。

### 方法2: 設定ファイル + 手動 systemd ユニット
1) 認証情報（アカウント cert）を取得（どちらか）
- `cloudflared tunnel login` を実行し、ブラウザで認証→ `~/.cloudflared/cert.pem` を取得。
- もしくはダッシュボードでトンネル作成→ "Download credentials file" を入手（`<TUNNEL_ID>.json`）。

2) 設定ファイルを配置
- `sudo mkdir -p /etc/cloudflared`
- `docker/monitoring/cloudflared/config.example.yml` を参考に `/etc/cloudflared/config.yml` を作成:

  tunnel: oci-monitoring
  # credentials-file: /etc/cloudflared/oci-monitoring.json
  ingress:
    - hostname: grafana.recrubo.net
      service: http://localhost:3000
    - service: http_status:404

- 認証ファイル方式の場合は `credentials-file` を有効化し、ダウンロードした JSON を `/etc/cloudflared/` に置く。

3) systemd ユニット（例）
- `/etc/systemd/system/cloudflared-grafana.service` を作成:

  [Unit]
  Description=cloudflared tunnel for Grafana
  After=network-online.target
  Wants=network-online.target

  [Service]
  Type=simple
  User=root
  ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel run oci-monitoring
  Restart=always
  RestartSec=3

  [Install]
  WantedBy=multi-user.target

- 反映と起動:
  - `sudo systemctl daemon-reload`
  - `sudo systemctl enable --now cloudflared-grafana`

4) 動作確認
- `systemctl status cloudflared-grafana` や `journalctl -u cloudflared-grafana -f` でログ確認。
- ブラウザで `https://grafana.recrubo.net` にアクセスして確認。

## C. Grafana 側の注意
- 管理者ユーザー/パスワードは GitHub Secrets から `docker-compose.monitoring.yml` に渡しています（`GF_SECURITY_ADMIN_*`）。
- `GF_USERS_ALLOW_SIGN_UP=false` で新規サインアップ無効。
- 追加のログイン制御が必要なら Cloudflare Access を併用してください。

## D. Pushgateway について（Xserver → OCI）
- OCI 側は `:9443`（自己署名 + 基本認証 + 任意のIP制限）で公開。
- Xserver 側の `scripts/prometheus-push.sh` の `PUSHGATEWAY_URL` を `https://<user>:<pass>@<OCI_PUBLIC_IP>:9443` へ設定してください。
- より厳格にする場合は Cloudflare Tunnel で専用ホスト名を作り、Xserver からそのホスト名へ送る構成に変更可能です。

## E. トラブルシュート
- `grafana.recrubo.net` が 522/525 などで失敗 → Cloudflare トンネルが起動中か / Public Hostname 設定の Service が正しいか確認。
- ローカルで `curl -I http://127.0.0.1:3000` が返らない → `docker compose -f docker-compose.monitoring.yml ps` で Grafana 起動状態とポートを確認。
- Access を有効にしたが 403 → ポリシーの対象（メール/IdP）とセッション時間、Cookie ドメインを確認。

### 1033: Cloudflare Tunnel error の対処（最短チェックリスト）
"Cloudflare is currently unable to resolve it" は、該当ホスト名に結びつくトンネルが Cloudflare 側でアクティブでないケースが大半です。以下を上から順に確認してください。

1) Cloudflare ダッシュボード → Zero Trust → Networks → Tunnels
- 対象トンネル（例: `oci-monitoring`）のステータスが `HEALTHY` か。
- Connectors タブに少なくとも 1 台 `Connected` がいるか（全 Offline なら 1033 になり得ます）。

2) Public Hostname のひも付け
- Tunnel 詳細 → Public Hostnames に `grafana.recrubo.net -> http://localhost:3000` が存在するか。
- 万一、別トンネルにホスト名を作っていると、起動中のトンネルと不一致で 1033 になります。

3) DNS レコードの確認（Cloudflare 側）
- DNS タブで `grafana.recrubo.net` が Proxied (オレンジ雲) の CNAME になり、値が `<TUNNEL_UUID>.cfargotunnel.com` になっているか。
  - A/AAAA 直書きや、Proxied 解除（グレー雲）は Tunnel では使いません。

4) OCI ホストで cloudflared が起動しているか（token 方式）
- 以下は OCI で実行:

```bash
sudo systemctl status cloudflared --no-pager
sudo journalctl -u cloudflared -n 200 --no-pager
```

- Connector 未接続の場合、ダッシュボードから新しいトークンを発行して再インストールが最短です:

```bash
sudo systemctl disable --now cloudflared || true
sudo rm -f /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
# ダッシュボードで発行した最新トークンを貼る
sudo cloudflared service install <YOUR_TUNNEL_TOKEN>
sudo systemctl status cloudflared --no-pager
```

5) 設定ファイル方式の場合の確認
- `/etc/cloudflared/config.yml` の `ingress:` に `grafana.recrubo.net -> http://localhost:3000` があるか。
- credentials-file を使う場合、JSON が存在し権限が正しいか。
- 手動ユニット運用なら:

```bash
sudo systemctl status cloudflared-grafana --no-pager
sudo journalctl -u cloudflared-grafana -n 200 --no-pager
```

6) バックエンド（Grafana）がローカルで応答しているか
- OCI 上で:

```bash
curl -sSf -I http://127.0.0.1:3000/login | head -n 1
```

- ここで HTTP/1.1 302/200 等が返らない場合は、`docker compose -f docker-compose.monitoring.yml ps` で grafana の起動/ポートを確認し、必要なら `docker compose ... up -d` を再実行。

7) よくある原因まとめ
- トークン違い（別トンネルのトークンで `service install` している）
- Public Hostname を別トンネルに作成している
- トンネルは起動しているが Connectors が全 Offline（OCI の cloudflared が停止）
- DNS が Proxied ではない/CNAME ではない

---
このドキュメントに沿えば、Cloudflare の設定（Tunnel/Access）と OCI 側の常駐化（systemd）が一通り完了します。