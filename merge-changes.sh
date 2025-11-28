#!/bin/bash
# リモートの変更を取り込みつつローカルの変更を保持するスクリプト

echo "=== Git マージ作業開始 ==="

# 1. 現在の変更をコミット（変更がある場合のみ）
echo "1. 変更をコミット中..."
if git diff --quiet bot/src/utils/recruitMessage.js bot/src/commands/gameRecruit/handlers.js && \
   git diff --cached --quiet bot/src/utils/recruitMessage.js bot/src/commands/gameRecruit/handlers.js; then
  echo "  → 変更なし、またはコミット済み"
else
  git add bot/src/utils/recruitMessage.js bot/src/commands/gameRecruit/handlers.js
  git commit -m "Fix: 通知ロール表示位置と開始時刻通知の重複送信を修正

- 通知ロールを画像の上（subHeaderText）に表示
- 開始時刻通知の重複送信を防止
- 開始時刻通知をEmbedに統合（ボイスチャンネル、詳細リンク含む）"
fi

# 2. リモートの変更を取得
echo "2. リモートの変更を取得中..."
git fetch origin main

# 3. rebaseで統合
echo "3. rebaseで統合中..."
if git rebase origin/main; then
  echo "  → rebase成功"
else
  echo "  ⚠ コンフリクトが発生しました"
  echo "  以下のコマンドでコンフリクトを解決してください:"
  echo "    git status"
  echo "    # ファイルを編集してコンフリクトを解決"
  echo "    git add <解決したファイル>"
  echo "    git rebase --continue"
  echo "    git push origin main"
  exit 1
fi

# 4. プッシュ
echo "4. プッシュ中..."
if git push origin main; then
  echo "  → プッシュ成功"
else
  echo "  ⚠ プッシュに失敗しました"
  echo "  force pushが必要な場合は以下を実行:"
  echo "    git push -f origin main"
  exit 1
fi

echo "=== 完了 ==="
