#!/bin/bash
# 使い方: ./git-auto.sh "コミットメッセージ"

if [ -z "$1" ]; then
  echo "コミットメッセージを入力してください"
  exit 1
fi

git add .
git commit -m "$1"
git push origin main
