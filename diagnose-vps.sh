#!/bin/bash

# VPS診断スクリプト
# 使用方法: ./diagnose-vps.sh [VPS_HOST]

echo "🔍 VPS サービス診断スクリプト"
echo "================================"
echo ""

# VPS接続情報（引数またはデフォルト）
VPS_HOST="${1:-your-vps-ip}"
VPS_USER="${2:-ubuntu}"

echo "📡 対象VPS: $VPS_USER@$VPS_HOST"
echo ""

# SSH接続テスト
echo "1️⃣ SSH接続テスト..."
if ssh -o ConnectTimeout=5 -o BatchMode=yes "$VPS_USER@$VPS_HOST" "echo 'SSH OK'" 2>/dev/null; then
    echo "   ✅ SSH接続: 成功"
else
    echo "   ❌ SSH接続: 失敗"
    echo "   💡 SSH鍵が設定されているか確認してください"
    exit 1
fi
echo ""

# Redis 状態確認
echo "2️⃣ Redis サービス確認..."
REDIS_STATUS=$(ssh "$VPS_USER@$VPS_HOST" "redis-cli ping 2>/dev/null" 2>/dev/null)
if [ "$REDIS_STATUS" = "PONG" ]; then
    echo "   ✅ Redis: 起動中"
    
    # Redisのキー数を確認
    RECRUIT_KEYS=$(ssh "$VPS_USER@$VPS_HOST" "redis-cli KEYS 'recruit:*' 2>/dev/null | wc -l" 2>/dev/null)
    echo "   📊 募集データ: ${RECRUIT_KEYS}件"
else
    echo "   ❌ Redis: 停止中または接続不可"
    echo "   💡 修復コマンド: sudo systemctl restart redis"
fi
echo ""

# Express API (PM2) 状態確認
echo "3️⃣ Express API (PM2) 確認..."
PM2_STATUS=$(ssh "$VPS_USER@$VPS_HOST" "pm2 list 2>/dev/null | grep rectbot-server" 2>/dev/null)
if [ -n "$PM2_STATUS" ]; then
    echo "   ✅ PM2プロセス: 起動中"
    echo "   $PM2_STATUS"
    
    # Express APIの応答確認
    echo ""
    echo "   🔍 Express API 応答テスト..."
    API_RESPONSE=$(ssh "$VPS_USER@$VPS_HOST" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/recruitment/list 2>/dev/null" 2>/dev/null)
    if [ "$API_RESPONSE" = "200" ] || [ "$API_RESPONSE" = "401" ]; then
        echo "   ✅ Express API: 応答あり (HTTP $API_RESPONSE)"
    else
        echo "   ⚠️  Express API: 応答なし or エラー (HTTP $API_RESPONSE)"
        echo "   💡 修復コマンド: pm2 restart rectbot-server"
    fi
else
    echo "   ❌ PM2プロセス: 停止中"
    echo "   💡 修復コマンド: cd ~/rectbot/bot && pm2 start server.js --name rectbot-server"
fi
echo ""

# Cloudflare Tunnel 状態確認
echo "4️⃣ Cloudflare Tunnel 確認..."
TUNNEL_STATUS=$(ssh "$VPS_USER@$VPS_HOST" "sudo systemctl is-active cloudflared 2>/dev/null" 2>/dev/null)
if [ "$TUNNEL_STATUS" = "active" ]; then
    echo "   ✅ Cloudflare Tunnel: 起動中"
    
    # Tunnelの詳細情報
    echo ""
    echo "   🔍 Tunnel詳細..."
    ssh "$VPS_USER@$VPS_HOST" "sudo cloudflared tunnel info 2>/dev/null" 2>/dev/null | head -n 5
else
    echo "   ❌ Cloudflare Tunnel: 停止中"
    echo "   💡 修復コマンド: sudo systemctl restart cloudflared"
fi
echo ""

# Discord Bot 状態確認
echo "5️⃣ Discord Bot 確認..."
BOT_STATUS=$(ssh "$VPS_USER@$VPS_HOST" "pm2 list 2>/dev/null | grep rectbot" 2>/dev/null | grep -v server)
if [ -n "$BOT_STATUS" ]; then
    echo "   ✅ Discord Bot: 起動中"
    echo "   $BOT_STATUS"
else
    echo "   ⚠️  Discord Bot: 停止中"
    echo "   💡 起動コマンド: cd ~/rectbot/bot && pm2 start src/index.js --name rectbot"
fi
echo ""

# まとめ
echo "================================"
echo "📊 診断結果サマリー"
echo "================================"
echo ""

# エラーがあるかチェック
ERRORS=0

if [ "$REDIS_STATUS" != "PONG" ]; then
    echo "❌ Redis が起動していません"
    echo "   sudo systemctl restart redis"
    ERRORS=$((ERRORS + 1))
fi

if [ -z "$PM2_STATUS" ]; then
    echo "❌ Express API が起動していません"
    echo "   pm2 restart rectbot-server"
    ERRORS=$((ERRORS + 1))
fi

if [ "$TUNNEL_STATUS" != "active" ]; then
    echo "❌ Cloudflare Tunnel が起動していません"
    echo "   sudo systemctl restart cloudflared"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -eq 0 ]; then
    echo "✅ すべてのサービスが正常に動作しています"
    echo ""
    echo "🎯 次のステップ:"
    echo "   1. Cloudflare Workerを再デプロイ: wrangler deploy"
    echo "   2. 管理画面でF12を開いてコンソールログを確認"
    echo "   3. Worker のログを確認: wrangler tail"
else
    echo ""
    echo "⚠️  $ERRORS 個の問題が見つかりました"
    echo ""
    echo "🔧 修復方法:"
    echo "   VPSにSSH接続: ssh $VPS_USER@$VPS_HOST"
    echo "   上記のコマンドを実行してサービスを再起動してください"
fi

echo ""
echo "================================"
