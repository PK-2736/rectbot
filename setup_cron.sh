#!/bin/bash

# Supabase→R2バックアップの自動実行設定
# 毎日午前3時に実行

SCRIPT_DIR="/home/ubuntu/rectbot"
BACKUP_SCRIPT="$SCRIPT_DIR/backup_supabase_to_r2.sh"
LOG_FILE="$SCRIPT_DIR/backup.log"

echo "現在のcrontab設定:"
crontab -l 2>/dev/null

echo ""
echo "新しいcronジョブを追加します..."
echo "スケジュール: 毎日午前3時 (JST)"
echo "実行スクリプト: $BACKUP_SCRIPT"
echo "ログ出力先: $LOG_FILE"
echo ""

# 既存のcrontabを保持して新しいジョブを追加
(crontab -l 2>/dev/null; echo "# Supabase to R2 backup - Daily at 3:00 AM JST") | crontab -
(crontab -l 2>/dev/null | grep -v "backup_supabase_to_r2.sh"; echo "0 3 * * * cd $SCRIPT_DIR && /bin/bash $BACKUP_SCRIPT >> $LOG_FILE 2>&1") | crontab -

echo "✅ cronジョブの設定完了"
echo ""
echo "設定内容:"
crontab -l

echo ""
echo "📝 次回実行予定:"
date -d "tomorrow 03:00" "+%Y-%m-%d %H:%M:%S"

echo ""
echo "💡 手動でバックアップを実行する場合:"
echo "   cd $SCRIPT_DIR && ./backup_supabase_to_r2.sh"
echo ""
echo "📊 ログを確認する場合:"
echo "   tail -f $LOG_FILE"
