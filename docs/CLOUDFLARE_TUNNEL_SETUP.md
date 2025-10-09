# Cloudflare Tunnel - Supabase Private Network 追加ガイド

## 概要

**既存の Cloudflare Tunnel** に Supabase への Private Network ルートを追加して、VPS から IPv6 の Supabase に接続できるようにします。

## 前提条件

✅ Cloudflare Tunnel が既にセットアップ済み（Redis → Express → Worker の構成）  
✅ cloudflared がインストール済み  
✅ Tunnel が正常に動作している

## アーキテクチャ

```
VPS (IPv4 only)
  ↓
既存の Cloudflare Tunnel (cloudflared)
  ├─ Redis → Express → Worker (既存のルート)
  └─ Supabase Database (新規追加の Private Network ルート)
       ↓
Cloudflare Network (IPv4/IPv6 Bridge)
  ↓ IPv6
Supabase Database (2406:da14:271:9901:acf1:9453:83e3:d1d0)
```

## メリット

- ✅ **既存の Tunnel を活用**: 新しい Tunnel を作成する必要なし
- ✅ **IPv6 対応**: Cloudflare が IPv4→IPv6 変換を処理
- ✅ **セキュア**: 既存の暗号化トンネルを使用
- ✅ **追加コストなし**: 既存の無料プランで利用可能

## セットアップ手順

### ステップ1: VPS に接続して確認スクリプトを実行

```bash
ssh ubuntu@<VPS_IP>
cd ~/rectbot
git pull

# 確認スクリプトを実行
chmod +x setup_cloudflare_tunnel.sh
./setup_cloudflare_tunnel.sh
```

このスクリプトは以下を確認します：

- cloudflared のインストール状態
- 既存の Tunnel 一覧
- 現在の設定ファイル（`/etc/cloudflared/config.yml`）

### ステップ2: config.yml に warp-routing を追加

既存の `/etc/cloudflared/config.yml` を編集：

```bash
sudo nano /etc/cloudflared/config.yml
```

以下を**追加**（既存の設定は残す）：

```yaml
# WARP モードを有効化（IPv6 サポート）
warp-routing:
  enabled: true
```

**例：既存の config.yml に追加後**

```yaml
tunnel: <既存のTunnel ID>
credentials-file: /etc/cloudflared/<既存のTunnel ID>.json

# 既存の ingress ルール
ingress:
  - hostname: your-existing-hostname.example.com
    service: http://localhost:3000
  - service: http_status:404

# ↓ ここに追加 ↓
# WARP モードを有効化（IPv6 サポート）
warp-routing:
  enabled: true
```

保存して終了（Ctrl + X → Y → Enter）

### ステップ3: cloudflared サービスを再起動

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

エラーがないことを確認してください。

### ステップ4: Cloudflare Zero Trust Dashboard で Private Network を追加

1. ブラウザで https://one.dash.cloudflare.com/ を開く

2. **Networks** → **Tunnels** をクリック

3. **既存の Tunnel 名**（Redis→Express で使用している Tunnel）を選択

4. **Configure** タブをクリック

5. **Private Networks** セクションまでスクロール

6. **Add a private network** をクリック

7. 以下のいずれかを入力：

#### 【方法1】サブネット全体を追加（推奨）

- **CIDR**: `2406:da14:271:9901::/64`
- **Description**: `Supabase Database Network`

#### 【方法2】特定のホストのみ追加

- **Type**: `Single Host` を選択
- **Hostname**: `db.fkqynvlkwbexbndfxwtf.supabase.co`
- **IP Address**: `2406:da14:271:9901:acf1:9453:83e3:d1d0`

8. **Save** をクリック

### ステップ5: VPS に WARP クライアントをインストール

Cloudflare WARP を VPS にインストールして、Private Network 経由でルーティング：

```bash
# Cloudflare WARP リポジトリを追加
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list

# WARP をインストール
sudo apt-get update
sudo apt-get install cloudflare-warp

# WARP を登録
warp-cli register

# WARP に接続
warp-cli connect

# 接続状態を確認
warp-cli status
```

出力例：
```
Status update: Connected
Success
```

### ステップ6: 接続テスト

```bash
# DNS 解決テスト
dig +short db.fkqynvlkwbexbndfxwtf.supabase.co

# ping6 テスト（Cloudflare Tunnel 経由）
ping6 -c 3 db.fkqynvlkwbexbndfxwtf.supabase.co
```

**成功例：**
```
PING db.fkqynvlkwbexbndfxwtf.supabase.co(2406:da14:271:9901:acf1:9453:83e3:d1d0) 56 data bytes
64 bytes from 2406:da14:271:9901:acf1:9453:83e3:d1d0: icmp_seq=1 ttl=64 time=25.3 ms
64 bytes from 2406:da14:271:9901:acf1:9453:83e3:d1d0: icmp_seq=2 ttl=64 time=24.8 ms
```

PostgreSQL 接続テスト：

```bash
cd ~/rectbot
source .env.backup

PGPASSWORD="${SUPABASE_DB_PASSWORD}" psql \
  -h "db.${SUPABASE_PROJECT_REF}.supabase.co" \
  -p 5432 \
  -U postgres \
  -d postgres \
  -c "SELECT version();"
```

### ステップ7: バックアップスクリプトをテスト

```bash
cd ~/rectbot
./backup_supabase_to_r2.sh
```

成功すれば、以下のような出力が表示されます：

```
✅ Database dump successful
✅ Compression successful
✅ Upload to R2 successful
✅ Cleanup completed
```

### ステップ8: Cron ジョブを設定

```bash
crontab -e
```

以下の行を追加（毎日午前3時に実行）：

```cron
0 3 * * * cd /home/ubuntu/rectbot && /bin/bash backup_supabase_to_r2.sh >> /home/ubuntu/rectbot/backup.log 2>&1
```

## 重要なポイント

### 既存の Tunnel への影響

✅ **既存のルート（Redis → Express → Worker）は影響を受けません**  
✅ Private Network ルートは**追加**されるだけです  
✅ 同じ Tunnel で複数のルートを管理できます

### config.yml の構成例

```yaml
tunnel: <既存のTunnel ID>
credentials-file: /etc/cloudflared/<Tunnel ID>.json

# 既存の Web アプリケーション向けルート
ingress:
  - hostname: your-app.example.com
    service: http://localhost:3000
  - hostname: api.example.com
    service: http://localhost:8080
  - service: http_status:404

# Private Network（Supabase 接続用）
warp-routing:
  enabled: true
```

## トラブルシューティング

### Tunnel が起動しない

```bash
# ログを確認
sudo journalctl -u cloudflared -f

# サービスを再起動
sudo systemctl restart cloudflared

# 設定ファイルをチェック
cat /etc/cloudflared/config.yml
```

### WARP が接続できない

```bash
# WARP のログを確認
warp-cli status

# WARP を再接続
warp-cli disconnect
warp-cli connect

# デバッグモードで実行
warp-cli --verbose connect
```

### DNS が解決しない

Cloudflare Zero Trust Dashboard で Private Network の設定を確認：

1. CIDR が正しいか（`2406:da14:271:9901::/64`）
2. Tunnel が "Healthy" 状態か
3. WARP クライアントが "Connected" 状態か

### バックアップが失敗する

```bash
# 手動で pg_dump を実行
cd ~/rectbot
source .env.backup

PGPASSWORD="${SUPABASE_DB_PASSWORD}" pg_dump \
  -h "db.${SUPABASE_PROJECT_REF}.supabase.co" \
  -p 5432 \
  -U postgres \
  -d postgres \
  -v \
  --no-owner \
  --no-acl \
  -f test_backup.sql
```

エラーメッセージを確認して対応してください。

## コスト

### Cloudflare Zero Trust

- **無料プラン**: 50ユーザーまで無料
- **Tunnel**: 無料
- **WARP**: 無料

**このセットアップは完全に無料です。**

## セキュリティ

- ✅ すべての通信が暗号化
- ✅ Cloudflare の認証システムを使用
- ✅ Private Network は外部からアクセス不可
- ✅ VPS からのみアクセス可能

## サービス管理コマンド

### Cloudflare Tunnel

```bash
# ステータス確認
sudo systemctl status cloudflared

# 再起動
sudo systemctl restart cloudflared

# 停止
sudo systemctl stop cloudflared

# 起動
sudo systemctl start cloudflared

# ログ確認
sudo journalctl -u cloudflared -f
```

### WARP

```bash
# ステータス確認
warp-cli status

# 接続
warp-cli connect

# 切断
warp-cli disconnect

# 設定確認
warp-cli settings
```

## まとめ

Cloudflare Tunnel を使用することで：

1. ✅ VPS の IPv6 制限を回避
2. ✅ Supabase（IPv6 のみ）に接続可能
3. ✅ 自動バックアップが正常に動作
4. ✅ セキュアで高速な接続
5. ✅ 完全無料

セットアップ完了後は、既存の `backup_supabase_to_r2.sh` スクリプトがそのまま動作します。
