# Grafana Logs - 色付きログの見方

## 📊 ダッシュボード

### 1. 🎨 Colored Logs Dashboard
カラーコーディングされた高度なログダッシュボード

**特徴:**
- ログレベルごとに色分け表示
- エラー数・警告数のリアルタイム表示
- ログレート推移グラフ
- フィルター済みログビュー（エラーのみ、警告のみ）

**色の意味:**
- 🔴 **赤**: ERROR, EXCEPTION, FAILED, FATAL
- 🟡 **黄**: WARN, WARNING
- 🟢 **緑**: INFO, SUCCESS, COMPLETED, READY
- 🔵 **青**: DEBUG

### 2. 📋 Rectbot Logs Dashboard
基本的なログダッシュボード

**表示内容:**
- PM2 Bot ログ（全て）
- PM2 エラーログ（フィルター済み）
- Docker コンテナログ
- システムログ（/var/log）

## 🎨 ログの色付けカスタマイズ

### Grafanaでの設定方法

1. **ダッシュボード編集モードに入る**
   - ダッシュボード右上の⚙️（Settings）→ 編集

2. **パネルを編集**
   - パネル右上の三点リーダー → Edit

3. **色のオーバーライド設定**
   ```
   Field Config → Overrides → Add field override
   - Matcher: Fields with name matching regex
   - Pattern: .*error.*|.*Error.*|.*ERROR.*
   - Property: Color scheme → Fixed color → Red
   ```

4. **保存**
   - 右上の「Save dashboard」

## 📝 LogQLクエリ例

### エラーログのみ表示
```logql
{job="pm2"} |~ "(?i)(error|exception|failed|fatal)"
```

### 警告ログのみ表示
```logql
{job="pm2"} |~ "(?i)(warn|warning)"
```

### 特定のアプリのログ
```logql
{job="pm2", app="rectbot"}
```

### キーワード検索
```logql
{job="pm2"} |= "discord" |= "guild"
```

### 複数キーワード（OR条件）
```logql
{job="pm2"} |~ "error|warning|failed"
```

### 除外（NOT条件）
```logql
{job="pm2"} != "debug"
```

### ログレート（秒あたりのログ数）
```logql
sum(rate({job="pm2"}[5m]))
```

### エラー数カウント（5分間）
```logql
sum(count_over_time({job="pm2"} |~ "(?i)error" [5m]))
```

## 🔧 トラブルシューティング

### ログが表示されない場合

1. **Promtailが動いているか確認**
   ```bash
   docker compose -f docker-compose.monitoring.yml ps promtail
   docker compose -f docker-compose.monitoring.yml logs promtail
   ```

2. **PM2ログパスが正しいか確認**
   ```bash
   ls -la /home/ubuntu/.pm2/logs/
   ```

3. **Promtailの設定確認**
   ```bash
   cat ~/rectbot/docker/monitoring/promtail-config.yaml
   ```

4. **Lokiへの接続確認**
   ```bash
   curl http://localhost:3100/ready
   ```

### 色が表示されない場合

- Grafanaのテーマが「Dark」になっているか確認
- ブラウザのキャッシュをクリア
- パネルの Field Config → Overrides が正しく設定されているか確認

## 🎯 推奨設定

### リフレッシュ間隔
- リアルタイム監視: **5秒**
- 通常監視: **10-30秒**
- 履歴確認: **1分以上**

### 時間範囲
- トラブルシューティング: **Last 5-15 minutes**
- 通常監視: **Last 30 minutes - 1 hour**
- トレンド分析: **Last 6-24 hours**

### クエリパフォーマンス
- `count_over_time`の範囲は5分以内を推奨
- 長期間のログは`rate()`を使用
- 複雑な正規表現は避ける

## 📚 参考リンク

- [Loki LogQL Documentation](https://grafana.com/docs/loki/latest/logql/)
- [Grafana Logs Panel](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/logs/)
- [Promtail Configuration](https://grafana.com/docs/loki/latest/clients/promtail/configuration/)
