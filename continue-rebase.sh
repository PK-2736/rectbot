#!/bin/bash
# コンフリクト解決後にrebaseを続行するスクリプト

echo "=== rebase続行 ==="

# 解決したファイルをadd
echo "1. 解決したファイルをステージング..."
git add bot/src/utils/recruitMessage.js

# rebase続行
echo "2. rebase続行中..."
if git rebase --continue; then
  echo "  → rebase成功"
else
  echo "  ⚠ rebaseに失敗しました"
  echo "  エラー内容を確認してください"
  exit 1
fi

# プッシュ
echo "3. プッシュ中..."
if git push origin main; then
  echo "  → プッシュ成功"
  echo "=== 完了 ==="
else
  echo "  ⚠ プッシュに失敗しました"
  echo "  force pushが必要な場合は以下を実行:"
  echo "    git push -f origin main"
  exit 1
fi
