# Cloudflare Tunnel を使用した Supabase バックアップ セットアップガイド

## 概要

VPS の IPv6 制限により Supabase（IPv6 のみ）に直接接続できない問題を、Cloudflare Tunnel を使用して解決します。

## アーキテクチャ

```
VPS (IPv4 only)
  ↓
Cloudflare Tunnel (cloudflared)
  ↓
Cloudflare Network (IPv4/IPv6 Bridge)
  ↓ IPv6
Supabase Database (2406:da14:271:9901:acf1:9453:83e3:d1d0)
```

## メリット

- ✅ **IPv6 対応**: Cloudflare が IPv4→IPv6 変換を処理
- ✅ **セキュア**: 暗号化されたトンネル接続
- ✅ **無料**: Cloudflare Zero Trust の無料プラン内で利用可能
- ✅ **高速**: Cloudflare のグローバルネットワーク経由
- ✅ **管理不要**: systemd サービスとして自動起動

## 前提条件

1. **Cloudflare アカウント**（無料）
2. **VPS への SSH アクセス**
3. **sudo 権限**

## セットアップ手順

### ステップ1: VPS に接続

```bash
ssh ubuntu@<VPS_IP>
cd ~/rectbot
```

### ステップ2: セットアップスクリプトを実行

```bash
# スクリプトに実行権限を付与
chmod +x setup_cloudflare_tunnel.sh

# スクリプトを実行
./setup_cloudflare_tunnel.sh
```

このスクリプトは以下を自動で実行します：

1. cloudflared のインストール
2. Cloudflare アカウントへのログイン（ブラウザ認証）
3. Tunnel の作成（`rectbot-supabase-backup`）
4. 設定ファイルの生成
5. systemd サービスの登録と起動

### ステップ3: Cloudflare Zero Trust Dashboard で設定

スクリプト完了後、以下の URL にアクセス：

https://one.dash.cloudflare.com/

#### 3-1. Private Network を追加

1. **Networks** → **Tunnels** をクリック
2. `rectbot-supabase-backup` Tunnel を選択
3. **Configure** タブをクリック
4. **Private Networks** セクションで **Add a private network** をクリック
5. 以下を入力：
   - **CIDR**: `2406:da14:271:9901::/64`（Supabase の IPv6 サブネット）
   - **Description**: `Supabase Database Network`
6. **Save** をクリック

#### 3-2. （オプション）特定のホストを追加

または、特定のホストのみを追加：

1. **Private Networks** → **Add a private network**
2. **Single Host** を選択
3. **Hostname**: `db.fkqynvlkwbexbndfxwtf.supabase.co`
4. **IP Address**: `2406:da14:271:9901:acf1:9453:83e3:d1d0`
5. **Save**

### ステップ4: VPS に WARP クライアントをインストール

Cloudflare WARP を VPS にインストールして、Tunnel 経由でルーティング：

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

### ステップ5: 接続テスト

```bash
# DNS 解決テスト
dig +short db.fkqynvlkwbexbndfxwtf.supabase.co

# ping6 テスト（Tunnel 経由）
ping6 -c 3 db.fkqynvlkwbexbndfxwtf.supabase.co

# PostgreSQL 接続テスト
cd ~/rectbot
source .env.backup

PGPASSWORD="${SUPABASE_DB_PASSWORD}" psql \
  -h "db.${SUPABASE_PROJECT_REF}.supabase.co" \
  -p 5432 \
  -U postgres \
  -d postgres \
  -c "SELECT version();"
```

### ステップ6: バックアップスクリプトをテスト

```bash
cd ~/rectbot
./backup_supabase_to_r2.sh
```

成功すれば、以下のような出力が表示されます：

```
✅ Database dump successful
✅ Compression successful
✅ Upload to R2 successful
```

### ステップ7: Cron ジョブを設定

```bash
crontab -e
```

以下の行を追加（毎日午前3時に実行）：

```cron
0 3 * * * cd /home/ubuntu/rectbot && /bin/bash backup_supabase_to_r2.sh >> /home/ubuntu/rectbot/backup.log 2>&1
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
