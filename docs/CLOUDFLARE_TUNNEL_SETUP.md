# Cloudflare Tunnel - Supabase 専用 Tunnel セットアップガイド

## 概要

Supabase バックアップ専用の新しい Cloudflare Tunnel を作成して、VPS から IPv6 の Supabase に接続できるようにします。

**既存の `express-tunnel`（Redis → Express → Worker）には影響しません。**

## アーキテクチャ

```
VPS (IPv4 only)
  ├─ express-tunnel (既存)
  │   └─ backend.rectbot.tech → Express (port 3000)
  │
  └─ supabase-backup-tunnel (新規)
      └─ Private Network → Supabase Database (IPv6)
           ↓
      Cloudflare Network (IPv4/IPv6 Bridge)
           ↓ IPv6
      Supabase Database (2406:da14:271:9901:acf1:9453:83e3:d1d0)
```

## メリット

- ✅ **既存の Tunnel に影響なし**: 完全に独立した新しい Tunnel
- ✅ **専用設定**: Supabase 接続専用の設定ファイル
- ✅ **独立したサービス**: `cloudflared-supabase.service` として管理
- ✅ **IPv6 対応**: Cloudflare が IPv4→IPv6 変換を処理
- ✅ **セキュア**: 暗号化されたトンネル接続

## 前提条件

✅ cloudflared がインストール済み  
✅ Cloudflare アカウントでログイン済み（`cloudflared tunnel login` 実行済み）  
✅ VPS への SSH アクセス

## セットアップ手順

### ステップ1: VPS に接続してスクリプトを実行

```bash
ssh ubuntu@<VPS_IP>
cd ~/rectbot
git pull

# セットアップスクリプトを実行
chmod +x setup_cloudflare_tunnel.sh
./setup_cloudflare_tunnel.sh
```

このスクリプトは以下を自動で実行します：

1. ✅ cloudflared のインストール確認
2. ✅ 既存の Tunnel 一覧表示
3. ✅ 新しい Tunnel の作成（`supabase-backup-tunnel`）
4. ✅ 専用設定ファイルの生成（`/etc/cloudflared-supabase/config.yml`）
5. ✅ systemd サービスの作成と起動（`cloudflared-supabase.service`）

**実行後の確認：**

```bash
# 新しい Tunnel が作成されたか確認
cloudflared tunnel list

# サービスが起動しているか確認
sudo systemctl status cloudflared-supabase

# 既存の express-tunnel も正常か確認
sudo systemctl status cloudflared
```

### ステップ2: Cloudflare Zero Trust Dashboard で Private Network を追加

#### 方法A: コマンドラインで追加（推奨）

VPS で以下のコマンドを実行：

```bash
cd ~/rectbot
chmod +x add_private_network.sh
./add_private_network.sh
```

このスクリプトは自動で以下を実行します：

1. Tunnel ID を取得
2. `cloudflared tunnel route ip add` コマンドで Private Network を追加
3. 追加されたルートを確認

**手動で実行する場合：**

```bash
# Tunnel ID を取得
TUNNEL_ID=$(cloudflared tunnel list | grep supabase-backup-tunnel | awk '{print $1}')

# Private Network を追加
cloudflared tunnel route ip add 2406:da14:271:9901::/64 ${TUNNEL_ID}

# 確認
cloudflared tunnel route ip show ${TUNNEL_ID}
```

**出力例：**
```
2406:da14:271:9901::/64 via Tunnel supabase-backup-tunnel (a1b2c3d4-...)
```

#### 方法B: Cloudflare Dashboard で追加（GUI）

1. ブラウザで https://one.dash.cloudflare.com/ を開く

2. **Networks** → **Tunnels** をクリック

3. **`supabase-backup-tunnel`**（新しく作成された Tunnel）を選択

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

**注意**: `express-tunnel` ではなく、**`supabase-backup-tunnel`** に追加してください。

### ステップ3: VPS に WARP クライアントをインストール（まだの場合）

Cloudflare WARP を VPS にインストールして、Private Network 経由でルーティング：

```bash
# Cloudflare WARP リポジトリを追加
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list

# WARP をインストール
sudo apt-get update
sudo apt-get install cloudflare-warp

# WARP を登録（新しいコマンド）
warp-cli registration new

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

### ステップ4: 接続テスト

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

### ステップ5: バックアップスクリプトをテスト

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

### ステップ6: Cron ジョブを設定

```bash
crontab -e
```

以下の行を追加（毎日午前3時に実行）：

```cron
0 3 * * * cd /home/ubuntu/rectbot && /bin/bash backup_supabase_to_r2.sh >> /home/ubuntu/rectbot/backup.log 2>&1
```

## 2つの Tunnel の管理

### Tunnel 一覧

```bash
cloudflared tunnel list
```

出力例：
```
ID                                   NAME                     CREATED              CONNECTIONS
80cbc750-94a4-4b87-b86d-b328b7e76779 express-tunnel           2025-10-01T15:17:18Z 2xkix03, 1xkix05
a1b2c3d4-... supabase-backup-tunnel 2025-10-09T05:30:00Z 2xkix03
```

### サービス管理

#### express-tunnel（既存）

```bash
# ステータス確認
sudo systemctl status cloudflared

# 再起動
sudo systemctl restart cloudflared

# ログ確認
sudo journalctl -u cloudflared -f
```

#### supabase-backup-tunnel（新規）

```bash
# ステータス確認
sudo systemctl status cloudflared-supabase

# 再起動
sudo systemctl restart cloudflared-supabase

# 停止
sudo systemctl stop cloudflared-supabase

# 起動
sudo systemctl start cloudflared-supabase

# ログ確認
sudo journalctl -u cloudflared-supabase -f
```

### 設定ファイル

| Tunnel | 設定ファイル | 用途 |
|--------|------------|------|
| express-tunnel | `/etc/cloudflared/config.yml` | backend.rectbot.tech 向け |
| supabase-backup-tunnel | `/etc/cloudflared-supabase/config.yml` | Supabase IPv6 接続専用 |

## 重要なポイント

### 独立した構成

✅ **express-tunnel には影響なし**  
✅ **別々の設定ファイル**（`/etc/cloudflared/` vs `/etc/cloudflared-supabase/`）  
✅ **別々の systemd サービス**（`cloudflared.service` vs `cloudflared-supabase.service`）  
✅ **同時に動作可能**

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
