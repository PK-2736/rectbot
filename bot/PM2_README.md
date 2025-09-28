# PM2での Express サーバ運用 (server.js)

このファイルでは `bot/server.js` を PM2 で起動・永続化するための手順を記載します。

## 1) pm2 のインストール（未導入の場合）

```bash
# グローバルに pm2 をインストール
npm install -g pm2
```

## 2) 起動（用意した設定ファイルを使う）
このリポジトリには `pm2-server.config.js` と起動スクリプトが用意されています。

```bash
# bot ディレクトリへ移動
cd /path/to/rectbot/bot

# pm2 起動（production 環境）
pm install # （まだ依存をインストールしていない場合）
pm ci     # CI 環境向けにクリーンインストールする場合

# 設定ファイルを使って起動
pm2 start pm2-server.config.js --env production

# スクリプトを使う場合
bash pm2-server-start.sh
```

## 3) ログ確認

```bash
# PM2 のログ（標準出力）
pm2 logs rectbot-server --lines 200

# またはファイル直接
tail -n 200 ~/.pm2/logs/rectbot-server-out.log
tail -n 200 ~/.pm2/logs/rectbot-server-error.log
```

## 4) 再起動・停止・ステータス

```bash
bash pm2-server-restart.sh
bash pm2-server-stop.sh
bash pm2-server-status.sh
```

## 5) 再起動後も復元する（サーバ再起動時に自動で pm2 がプロセスを復元）

```bash
# 現在のプロセス状態を保存
pm2 save

# OS の起動時に pm2 を自動起動設定（1回だけ実行）
pm2 startup
# 出力されるコマンドをコピーして実行する（sudo 付きの行）
```

## 6) 環境変数
`pm2-server.config.js` の `env` セクションで主要な環境変数を渡すようにしています。実運用では次の点に注意してください：
- `DISCORD_BOT_TOKEN` は bot がコマンドデプロイ等を行うために必須です。未設定だと `/internal/deploy-commands` は spawn を拒否します。
- `DEPLOY_SECRET` は `internal/cleanup/run` を保護するために使います。ダッシュボードからの手動クリーンアップに使う場合は `NEXT_PUBLIC_DEPLOY_SECRET` をフロント側に渡すか、別の安全な管理手段を用意してください。

## 7) トラブルシュート
- `MODULE_NOT_FOUND` が出る場合は依存がインストールされていない可能性があります。`npm ci` を実行してください。
- pm2 CLI が見つからない場合は `npm install -g pm2` を実行してください（権限に注意）。

---

必要なら、私がこのマシンで `pm2 start`／`pm2 save` を代行してログを確認し、問題がなければ `pm2 startup` の実行手順まで進めます。指示ください。