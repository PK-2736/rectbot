# 🔧 管理画面の募集データ更新問題の修正ガイド

## 問題の症状
管理画面にアクセスできるが、新しい募集が立っても総募集数が更新されない。

## 原因
バックエンドAPIが**テストデータ（ハードコードされた固定データ）**を返していたため、実際のRedisに保存されている募集データが取得されていませんでした。

---

## ✅ 実施した修正

### 1. バックエンドAPIの実装変更
`/api/recruitment/list` エンドポイントを、**VPS Express APIにプロキシ**するように変更しました。

#### 変更内容:
- **変更前**: 固定のテストデータを返す
- **変更後**: VPS Express API（Cloudflare Tunnel経由）にService Token認証でプロキシ

### 2. フロントエンドのデバッグログ強化
取得したデータ件数や内容をコンソールに出力するように改善しました。

---

## 🏗️ アーキテクチャ

現在のシステムは以下のような構成になっています:

```
ブラウザ
  ↓ JWT Cookie
Cloudflare Worker (api.rectbot.tech)
  ↓ Service Token
Cloudflare Tunnel
  ↓
VPS Express API (server.js)
  ↓ ローカル接続
Redis (VPS内)
```

### データの流れ

1. **Discord Bot** が募集を作成し、**VPS内のRedis**に保存
2. **VPS Express API** がRedisからデータを読み取り
3. **Cloudflare Worker** がExpress APIにプロキシ（Service Token認証）
4. **ブラウザ** が管理画面でデータを表示

---

## 🔑 必要な環境変数

### Cloudflare Workers に必要な環境変数

以下の環境変数が**既に設定されているはず**です。追加の環境変数は不要です。

1. **SERVICE_TOKEN**
   - Worker → Express API の認証トークン
   - 既に設定済み

2. **VPS_EXPRESS_URL** または **TUNNEL_URL**
   - Cloudflare Tunnel の URL
   - 例: `https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com`
   - 既に設定済み

3. **ADMIN_DISCORD_ID**
   - 管理者のDiscord ユーザーID（カンマ区切り）
   - 既に設定済み

4. **JWT_SECRET**
   - JWT署名用の秘密鍵
   - 既に設定済み

5. **DISCORD_CLIENT_ID** と **DISCORD_CLIENT_SECRET**
   - Discord OAuth認証用
   - 既に設定済み

---

## 🚀 デプロイ手順

修正をデプロイするには:

```bash
cd /workspaces/rectbot/backend
wrangler deploy
```

フロントエンドは変更不要（既にデバッグログ強化済み）

---

## 🔍 動作確認

### 1. ブラウザのコンソールで確認

管理画面を開いて F12 キーを押し、Console タブを開きます。

以下のようなログが表示されれば正常です:

```
Fetching recruitments from: https://api.rectbot.tech/api/recruitment/list
Fetched 5 recruitments from API
Recruitment data: [...]
Total recruitments: 5
Active recruitments: 3
Unique guilds: 2
```

### 2. Worker のログで確認

Cloudflare Dashboard でWorkerのログを確認:

```
Admin API: /api/recruitment/list accessed
Cookie header: present
JWT validation passed for admin: 726195003780628621
Proxying to Express API: https://...cfargotunnel.com/api/recruitment/list
Express API responded with status: 200
Fetched 5 recruitments from Express API
```

### 3. 自動更新の確認

- 管理画面は **5秒ごと** に自動的にデータを更新します
- 「最終更新」の時刻が5秒ごとに更新されることを確認

### 4. 新しい募集を立ててテスト

1. Discordで新しい募集を立てる
2. 最大5秒待つ（自動更新のタイミング）
3. 管理画面の「総募集数」が増えることを確認

---

## 🐛 トラブルシューティング

### 問題1: 「総募集数: 0」のまま変わらない

#### 原因1: Cloudflare Tunnel が動作していない

**確認方法:**
```bash
# VPSにSSH接続して確認
ssh user@your-vps-ip
sudo cloudflared tunnel list
```

**解決策:**
- Cloudflare Tunnel を再起動
- `cloudflared` サービスが起動しているか確認

#### 原因2: Express API が起動していない

**確認方法:**
```bash
# VPSにSSH接続して確認
pm2 list
# または
curl http://localhost:3001/api/recruitment/list
```

**解決策:**
```bash
# Express API を再起動
pm2 restart rectbot-server
```

#### 原因3: Redis が起動していない

**確認方法:**
```bash
# VPSで確認
redis-cli ping
# PONG と返ってくれば正常
```

**解決策:**
```bash
# Redisを再起動
sudo systemctl restart redis
```

### 問題2: "VPS Express unreachable" エラー

#### 原因: Cloudflare Tunnel の接続エラー

**確認方法:**
1. VPSにSSH接続
2. Tunnel のステータスを確認:
   ```bash
   sudo cloudflared tunnel info
   ```

**解決策:**
```bash
# Cloudflare Tunnel を再起動
sudo systemctl restart cloudflared
```

### 問題3: "Service token not configured" エラー

#### 原因: SERVICE_TOKEN 環境変数が設定されていない

**確認方法:**
1. Cloudflare Dashboard → Workers & Pages → rectbot-backend
2. Settings → Variables → `SERVICE_TOKEN` の存在確認

**解決策:**
- `SERVICE_TOKEN` を設定してWorkerを再デプロイ

### 問題4: コンソールに「401 Unauthorized」エラー

#### 原因: JWT認証エラー

**解決策:**
1. ログアウトして再ログイン
2. ブラウザのCookieをクリア
3. Discord IDが `ADMIN_DISCORD_ID` に含まれているか確認

---

## 📊 システム全体のデータフロー

正常な動作時の完全なフロー:

```
1. ユーザーがDiscordで募集を立てる
   ↓
2. Discord Botがイベントをキャッチ
   ↓
3. Botが募集データをRedis（VPS内）に保存
   ↓
4. 管理画面が5秒ごとに /api/recruitment/list を呼び出す
   ↓
5. Cloudflare WorkerがJWT Cookieを検証
   ↓
6. WorkerがVPS Express APIにService Tokenでプロキシ
   ↓
7. Cloudflare Tunnelが VPS Express APIにリクエストを転送
   ↓
8. Express APIがService Tokenを検証
   ↓
9. Express APIがRedis（ローカル接続）からデータを取得
   ↓
10. データが逆順でブラウザに返される
   ↓
11. 管理画面に最新のデータが表示される
```

---

## 🎯 期待される動作

修正とデプロイ完了後:

1. **リアルタイム更新**
   - 5秒ごとに自動でデータが更新される
   - 「最終更新」時刻が更新される

2. **新規募集の反映**
   - Discord で新しい募集が立つ
   - 最大5秒以内に管理画面に表示される
   - 総募集数が自動的にカウントアップされる

3. **募集ステータスの更新**
   - 募集が締め切られると「アクティブ募集」が減る
   - 総募集数には過去の募集も含まれる

4. **複数サーバー対応**
   - 複数のDiscordサーバーの募集を一覧表示
   - 「導入サーバー数」が正しくカウントされる

---

## 📝 デバッグ用コマンド

### VPSでRedisのデータを確認
```bash
# SSH接続
ssh user@your-vps-ip

# Redisに接続
redis-cli

# キーの一覧を表示
KEYS recruit:*

# 特定の募集データを確認
GET recruit:123456789012345678

# 参加者データを確認
GET participants:123456789012345678
```

### Express API を直接テスト
```bash
# VPS内で実行
curl -H "x-service-token: your-service-token" \
  http://localhost:3001/api/recruitment/list
```

### Cloudflare Tunnel の接続確認
```bash
# VPSで実行
sudo cloudflared tunnel info
sudo systemctl status cloudflared
```

---

## ✅ チェックリスト

修正が完了したら、以下を確認してください:

- [ ] Worker を再デプロイした（`wrangler deploy`）
- [ ] VPS で Express API が起動している（`pm2 list`）
- [ ] VPS で Redis が起動している（`redis-cli ping`）
- [ ] Cloudflare Tunnel が動作している（`cloudflared tunnel list`）
- [ ] 管理画面を開いて F12 → Console を確認した
- [ ] コンソールに「Fetched X recruitments from API」と表示される
- [ ] Discord で新しい募集を立てた
- [ ] 5秒以内に管理画面に反映された
- [ ] 総募集数が正しくカウントされている

---

## 💡 重要な注意点

### ❌ 間違った理解
- Worker が直接 Redis にアクセスする
- Upstash Redis REST API を使用する
- フロントエンドが直接 VPS にアクセスする

### ✅ 正しい理解
- **VPS内のRedis** にデータが保存される
- **VPS Express API** がRedisから読み取る
- **Cloudflare Worker** がExpress APIにプロキシする（Service Token認証）
- **Cloudflare Tunnel** がWorkerとVPSを接続する
- **追加の環境変数は不要**（既存の設定で動作）

---

## 🔗 関連ドキュメント

- `SECURITY_SETUP.md` - セキュリティとアーキテクチャの詳細
- `CLOUDFLARE_TUNNEL_SETUP.md` - Tunnel の設定方法
- `VPS_EXPRESS_TROUBLESHOOTING.md` - Express API のトラブルシューティング
