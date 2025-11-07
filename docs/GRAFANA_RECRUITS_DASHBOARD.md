# 📋 Grafana 募集状況ダッシュボード

## 概要
Cloudflare Durable Objects (DO) に保存されている募集データをGrafanaで可視化します。

## アーキテクチャ

```
┌──────────────────┐
│  Discord Bot     │
│  (PM2)           │
└────────┬─────────┘
         │ POST /api/recruitments
         ↓
┌──────────────────────────┐
│ Cloudflare Worker        │
│ (backend/src/index.js)   │
│                          │
│  - /api/recruitments     │← Bot writes recruits
│  - /metrics              │← Prometheus scrapes
│  - /api/grafana/recruits │← Grafana JSON API reads
└────────┬─────────────────┘
         │
         ↓
┌──────────────────┐
│  Durable Object  │
│  (RecruitsDO)    │
│  - Ephemeral     │
│  - 8h TTL        │
└──────────────────┘
         │
         ↓
┌──────────────────┐   ┌──────────────────┐
│  Prometheus      │   │  Grafana         │
│  (Scrapes /metrics)│  │  (JSON Datasource)│
│  - recruits_total│   │  - Table view    │
│  - recruits_active│  │  - Card display  │
└──────────────────┘   └──────────────────┘
```

## エンドポイント

### 1. `/metrics` - Prometheus メトリクス
```
GET https://api.recrubo.net/metrics

# HELP recruits_total Total number of recruitment posts
# TYPE recruits_total gauge
recruits_total 5

# HELP recruits_active Active recruitment posts
# TYPE recruits_active gauge
recruits_active 3

# HELP recruits_participants_total Total participants across all recruits
# TYPE recruits_participants_total gauge
recruits_participants_total 12
```

### 2. `/api/grafana/recruits` - Grafana JSON API
```json
POST https://api.recrubo.net/api/grafana/recruits

[
  {
    "id": "abc123",
    "title": "モンハン周回募集",
    "game": "Monster Hunter",
    "platform": "PS5",
    "currentMembers": 2,
    "maxMembers": 4,
    "voice": true,
    "status": "recruiting",
    "createdAt": "2025-11-02T10:00:00Z",
    "expiresAt": "2025-11-02T18:00:00Z"
  }
]
```

## Grafana 設定

### データソース
1. **Prometheus** (`datasources.yml`)
   - URL: `http://prometheus:9090`
   - 用途: 募集数・参加者数のメトリクス

2. **Cloudflare-Recruits-API** (`json-api.yml`)
   - Type: `marcusolsson-json-datasource`
   - URL: `https://api.recrubo.net`
   - Custom Headers: `X-Grafana-Token: <GRAFANA_ACCESS_TOKEN>`
   - 用途: 募集詳細データのテーブル表示

### ダッシュボードパネル

#### 📊 統計パネル (Stat)
- **アクティブ募集数**: `recruits_active`
- **総参加者数**: `recruits_participants_total`
- **総募集投稿数**: `recruits_total`

#### 📈 時系列グラフ (Timeseries)
- アクティブ募集数の推移
- 総募集数の推移

#### 🎮 募集一覧テーブル (Table)
- タイトル
- ゲーム名
- プラットフォーム
- 現在人数 / 最大人数
- VC有無 (🎤/❌)
- ステータス
- 作成日時

## デプロイ手順

### 1. バックエンドのデプロイ
```bash
cd backend
wrangler deploy
```

### 2. Prometheusの再起動
```bash
docker compose -f docker-compose.monitoring.yml restart prometheus
```

### 3. Grafanaの再起動
```bash
docker compose -f docker-compose.monitoring.yml restart grafana
```

### 4. ダッシュボードの確認
1. Grafana にアクセス: `https://grafana.recrubo.net`
2. 左メニュー → Dashboards
3. 「📋 募集状況ダッシュボード」を開く

## トラブルシューティング

### メトリクスが表示されない
```bash
# Prometheusのターゲット確認
curl http://localhost:9090/api/v1/targets

# バックエンドのメトリクス確認
curl https://api.recrubo.net/metrics

# Prometheusでクエリ実行
curl 'http://localhost:9090/api/v1/query?query=recruits_active'
```

### JSON datasource でデータが取得できない
```bash
# APIレスポンス確認
curl -X POST https://api.recrubo.net/api/grafana/recruits

# Grafana logs確認
docker compose -f docker-compose.monitoring.yml logs grafana | grep json
```

### CORS エラーが出る場合
`backend/src/index.js` の `CORS_ORIGINS` に Grafana の URL を追加:
```javascript
const raw = env.CORS_ORIGINS || 'https://recrubo.net,https://grafana.recrubo.net';
```

## カスタマイズ

### リフレッシュ間隔の変更
`recruits-dashboard.json`:
```json
"refresh": "30s"  // 10s, 1m, 5m など
```

### メトリクス保持期間の変更
`docker-compose.monitoring.yml`:
```yaml
prometheus:
  command:
    - --storage.tsdb.retention.time=30d  // デフォルト30日
```

### テーブルカラムの追加
`recruits-dashboard.json` の `transformations` セクションで設定:
```json
"renameByName": {
  "description": "説明",
  "startTime": "開始時刻"
}
```

## 監視アラート設定

Prometheus Alertmanager 用のルールを追加する場合:
```yaml
# docker/monitoring/prometheus/alerts/recruits.yml
groups:
  - name: recruits
    interval: 30s
    rules:
      - alert: NoActiveRecruits
        expr: recruits_active == 0
        for: 1h
        annotations:
          summary: "アクティブな募集が1時間以上ありません"
```

## 参考リンク
- [Grafana JSON API datasource](https://grafana.com/grafana/plugins/marcusolsson-json-datasource/)
- [Prometheus Exposition Formats](https://prometheus.io/docs/instrumenting/exposition_formats/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
