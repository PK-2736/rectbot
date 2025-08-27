#!/bin/bash
# OCIサーバー上でSSL/TLS疎通・時刻・ネットワーク状態を確認するスクリプト

set -e

echo "==== 1. サーバー時刻の確認 ===="
date

echo "\n==== 2. DNS解決の確認 (auth.pwy.rectbot.tech) ===="
dig +short auth.pwy.rectbot.tech

echo "\n==== 3. HTTPS疎通・証明書チェーンの確認 ===="
openssl s_client -connect auth.pwy.rectbot.tech:443 -servername auth.pwy.rectbot.tech -showcerts </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName

# HTTP/HTTPSリクエストの疎通確認
echo "\n==== 4. curlでHTTPSアクセス確認 ===="
curl -Iv https://auth.pwy.rectbot.tech 2>&1 | grep -E 'subject:|issuer:|SSL|HTTP/'

echo "\n==== 5. ネットワーク経路の確認 (traceroute) ===="
traceroute auth.pwy.rectbot.tech || echo 'tracerouteコマンドがありません'

echo "\n==== 6. プロキシ環境変数の確認 ===="
env | grep -i proxy || echo 'プロキシ環境変数は設定されていません'

echo "\n==== 7. 完了 ===="
