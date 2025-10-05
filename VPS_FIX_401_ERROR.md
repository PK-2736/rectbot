# VPS サーバー 401 エラー 即座の修正方法

## 問題

VPS Express サーバーが `401 Unauthorized` を返しています。

```bash
curl -I http://localhost:3000/api/recruitment/list
# HTTP/1.1 401 Unauthorized
```

## 原因

`SERVICE_TOKEN` が Express サーバーの環境変数に設定されていないか、Backend Worker と一致していません。

## ✅ 即座の修正手順

### ステップ 1: VPS サーバーにログイン

```bash
ssh ubuntu@your-vps-ip
```

### ステップ 2: SERVICE_TOKEN を確認

GitHub Secrets から SERVICE_TOKEN を取得：
https://github.com/PK-2736/rectbot/settings/secrets/actions

### ステップ 3: .env ファイルに追加

```bash
cd ~/rectbot/bot

# .env ファイルを編集
nano .env
```

以下を追加（GitHub Secrets の値を使用）:
```
SERVICE_TOKEN=your-actual-service-token-here
```

Ctrl+X, Y, Enter で保存

### ステップ 4: Express サーバーを再起動

```bash
# PM2 で管理している場合
pm2 restart rectbot-express

# または PM2 を使っていない場合
pkill -f "node.*server.js"
nohup node server.js > server.log 2>&1 &
```

### ステップ 5: 動作確認

```bash
# SERVICE_TOKEN を取得
SERVICE_TOKEN=$(grep "^SERVICE_TOKEN=" .env | cut -d= -f2 | tr -d '"' | tr -d "'")

# 認証付きでテスト
curl -H "x-service-token: $SERVICE_TOKEN" http://localhost:3000/api/recruitment/list
```

**期待される結果:**
```json
[]
```
または
```json
[{"recruitId": "...", ...}]
```

**401 エラーが出る場合:**
- SERVICE_TOKEN が間違っている
- .env ファイルが読み込まれていない
- Express サーバーが再起動されていない

## 🔧 完全な修復コマンド（コピー&ペースト）

```bash
# 1. bot ディレクトリに移動
cd ~/rectbot/bot

# 2. 最新のコードを取得
git pull origin main

# 3. SERVICE_TOKEN を .env に追加（値は GitHub Secrets から）
# 以下の YOUR_TOKEN_HERE を実際の値に置き換えてください
echo "SERVICE_TOKEN=YOUR_TOKEN_HERE" >> .env

# 4. PM2 でサーバーを再起動（環境変数を再読み込み）
pm2 delete rectbot-express
pm2 start server.js --name rectbot-express
pm2 save

# 5. ステータス確認
pm2 status

# 6. ログ確認
pm2 logs rectbot-express --lines 20
```

## 📊 診断用コマンド

```bash
# .env ファイルの内容確認（SERVICE_TOKEN の最初の10文字のみ）
cd ~/rectbot/bot
grep "SERVICE_TOKEN" .env | cut -d= -f2 | cut -c1-10

# PM2 プロセス確認
pm2 list

# API テスト（認証なし - 401 が期待される）
curl -I http://localhost:3000/api/recruitment/list

# API テスト（認証あり - 200 が期待される）
SERVICE_TOKEN=$(grep "^SERVICE_TOKEN=" .env | cut -d= -f2 | tr -d '"' | tr -d "'")
curl -H "x-service-token: $SERVICE_TOKEN" http://localhost:3000/api/recruitment/list
```

## ✅ 成功の確認

### VPS サーバー側:

```bash
curl -H "x-service-token: $SERVICE_TOKEN" http://localhost:3000/api/recruitment/list
# 200 OK が返る
```

### ダッシュボード側:

1. https://dash.rectbot.tech にアクセス
2. Discord でログイン
3. **エラーメッセージが消えている**
4. データが表示される（実データまたはテストデータ）

## 🐛 トラブルシューティング

### 401 が続く場合

**問題 A: .env が読み込まれていない**
```bash
# 環境変数を明示的に設定して起動
cd ~/rectbot/bot
pm2 delete rectbot-express
export $(cat .env | xargs)
pm2 start server.js --name rectbot-express
pm2 save
```

**問題 B: SERVICE_TOKEN が間違っている**
```bash
# GitHub Secrets の値を再確認
# https://github.com/PK-2736/rectbot/settings/secrets/actions

# .env を削除して再作成
cd ~/rectbot/bot
rm .env
nano .env
# SERVICE_TOKEN=correct-token-here と入力して保存
pm2 restart rectbot-express
```

**問題 C: PM2 が環境変数を認識していない**
```bash
# PM2 の ecosystem.config.js を使用
cd ~/rectbot/bot

# ecosystem.config.js を作成
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'rectbot-express',
    script: './server.js',
    env_file: '.env',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
}
EOF

# PM2 で起動
pm2 delete rectbot-express
pm2 start ecosystem.config.js
pm2 save
```

### それでも解決しない場合

**デバッグモードを有効化:**

```bash
cd ~/rectbot/bot

# DEBUG_REQUESTS を有効化
echo "DEBUG_REQUESTS=true" >> .env

# 再起動
pm2 restart rectbot-express

# ログをリアルタイムで確認
pm2 logs rectbot-express

# 別のターミナルで API をテスト
SERVICE_TOKEN=$(grep "^SERVICE_TOKEN=" .env | cut -d= -f2 | tr -d '"' | tr -d "'")
curl -v -H "x-service-token: $SERVICE_TOKEN" http://localhost:3000/api/recruitment/list
```

ログに以下が表示されるはず:
```
[req-debug] GET /api/recruitment/list from ::ffff:127.0.0.1
[req-debug] headers: {..., 'x-service-token': '[present]'}
```

**'x-service-token': '[missing]'** が表示される場合、ヘッダーが送信されていません。

## 📝 まとめ

最も簡単な修正方法:

```bash
cd ~/rectbot/bot
echo "SERVICE_TOKEN=<GitHub Secrets の値>" >> .env
pm2 delete rectbot-express
pm2 start server.js --name rectbot-express
pm2 save
```

これで 401 エラーが解決するはずです！
