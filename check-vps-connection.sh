#!/bin/bash

# VPS接続情報確認スクリプト
# 
# このスクリプトは、VPSへの接続に必要な情報を確認します

echo "🔍 VPS接続情報の確認"
echo "===================="
echo ""

echo "📝 以下の情報が必要です:"
echo ""
echo "1. VPSのIPアドレス"
echo "   - パブリックIPアドレス（例: 203.0.113.45）"
echo "   - VPSプロバイダーのコントロールパネルで確認できます"
echo ""
echo "2. VPSのユーザー名"
echo "   - 通常は 'ubuntu' または 'root'"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "💡 VPSのIPアドレスを確認する方法:"
echo ""
echo "【方法1】VPSプロバイダーのコントロールパネル"
echo "   - AWS EC2: EC2ダッシュボード → インスタンス → パブリックIPv4"
echo "   - GCP: Compute Engine → VM インスタンス → 外部IP"
echo "   - Azure: 仮想マシン → 概要 → パブリックIPアドレス"
echo "   - さくらVPS: コントロールパネル → サーバー情報 → IPアドレス"
echo "   - ConoHa: コントロールパネル → サーバー → IPアドレス"
echo ""
echo "【方法2】SSH設定ファイルから確認"
echo "   cat ~/.ssh/config | grep -A 5 rectbot"
echo ""
echo "【方法3】Cloudflare Tunnelの設定から推測"
echo "   VPS上のTunnel設定ファイルに記載されている可能性があります"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🔧 SSH接続のテスト:"
echo ""
echo "以下のコマンドでVPSに接続できるか確認してください:"
echo ""
echo "   ssh YOUR_USERNAME@YOUR_VPS_IP"
echo ""
echo "例:"
echo "   ssh ubuntu@203.0.113.45"
echo "   ssh root@198.51.100.10"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "✅ 接続情報がわかったら、以下のコマンドを実行:"
echo ""
echo "   ./fix-503.sh YOUR_VPS_IP YOUR_USERNAME"
echo ""
echo "例:"
echo "   ./fix-503.sh 203.0.113.45 ubuntu"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# SSH設定ファイルをチェック
if [ -f ~/.ssh/config ]; then
    echo "🔎 ~/.ssh/config を確認しています..."
    echo ""
    
    # rectbot関連の設定を探す
    if grep -qi "rectbot\|vps" ~/.ssh/config 2>/dev/null; then
        echo "✅ SSH設定ファイルに関連する設定が見つかりました:"
        echo ""
        grep -i -A 5 "rectbot\|vps" ~/.ssh/config
        echo ""
        echo "上記の 'HostName' の値がVPSのIPアドレスです"
    else
        echo "ℹ️  SSH設定ファイルに関連する設定は見つかりませんでした"
    fi
else
    echo "ℹ️  ~/.ssh/config ファイルが見つかりませんでした"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 最近のSSH接続履歴をチェック（bashの場合）
if [ -f ~/.bash_history ]; then
    echo "🔎 最近のSSH接続履歴を確認しています..."
    echo ""
    
    recent_ssh=$(grep "^ssh " ~/.bash_history | tail -n 5)
    if [ -n "$recent_ssh" ]; then
        echo "✅ 最近のSSH接続:"
        echo ""
        echo "$recent_ssh"
        echo ""
        echo "上記のコマンドにVPSのIPアドレスが含まれている可能性があります"
    else
        echo "ℹ️  最近のSSH接続履歴は見つかりませんでした"
    fi
else
    echo "ℹ️  Bash履歴ファイルが見つかりませんでした"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "❓ VPSのIPアドレスがわからない場合:"
echo ""
echo "1. VPSプロバイダーのコントロールパネルにログイン"
echo "2. サーバー一覧から該当のサーバーを選択"
echo "3. 'パブリックIP' または '外部IP' を確認"
echo ""
echo "または、VPS管理者に確認してください。"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "VPSのIPアドレスを入力してください（Enterでスキップ）: " vps_ip
echo ""

if [ -n "$vps_ip" ]; then
    read -p "VPSのユーザー名を入力してください [ubuntu]: " vps_user
    vps_user=${vps_user:-ubuntu}
    echo ""
    
    echo "📡 SSH接続テスト中..."
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "$vps_user@$vps_ip" exit 2>/dev/null; then
        echo "✅ SSH接続成功！"
        echo ""
        echo "🚀 503エラーを修復しますか？"
        read -p "修復スクリプトを実行しますか？ (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ./fix-503.sh "$vps_ip" "$vps_user"
        fi
    else
        echo "❌ SSH接続に失敗しました"
        echo ""
        echo "以下を確認してください:"
        echo "  1. IPアドレスが正しいか"
        echo "  2. ユーザー名が正しいか"
        echo "  3. SSH鍵の設定が正しいか"
        echo "  4. VPSのファイアウォールでSSH（ポート22）が許可されているか"
        echo ""
        echo "手動でSSH接続を試してください:"
        echo "  ssh $vps_user@$vps_ip"
    fi
else
    echo "ℹ️  スキップしました"
    echo ""
    echo "VPSのIPアドレスがわかったら、以下を実行してください:"
    echo "  ./fix-503.sh YOUR_VPS_IP YOUR_USERNAME"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 詳細なドキュメント:"
echo "  - FIX_503_NOW.md - 503エラーの修復手順"
echo "  - QUICK_FIX_503.md - クイック修復ガイド"
echo "  - ERROR_503_TROUBLESHOOTING.md - 詳細なトラブルシューティング"
echo ""
