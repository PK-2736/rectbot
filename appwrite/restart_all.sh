#!/bin/bash
# FastAPI/Appwrite/nginx 設定反映＆再起動スクリプト
# appwriteディレクトリで実行してください

echo "Stopping and removing all containers..."
docker-compose down

echo "Building and starting containers..."
docker-compose up --build -d

echo "All containers restarted."
