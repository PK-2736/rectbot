#!/bin/bash
# Sentry データソース設定ガイド

cat << 'EOF'
🔧 Grafana Sentry データソース設定ガイド
==========================================

前提条件
--------
1. Sentry アカウントが必要
2. Sentry Auth Token が必要
3. Sentry Organization Slug が必要


ステップ1: Sentry Auth Token を取得
-----------------------------------
1. https://rectbot.sentry.io にアクセス
2. Settings → Account → API → Auth Tokens
3. "Create New Token" をクリック
4. 権限を設定:
   - Project: Read
   - Event: Read
   - Organization: Read
5. Token をコピー（後で使用）


ステップ2: Organization Slug を確認
-----------------------------------
Sentry URL を確認:
  https://sentry.io/organizations/{organization_slug}/

例: https://rectbot.sentry.io
→ organization_slug = "orgaci"


ステップ3: Grafanaでデータソースを追加
--------------------------------------
手動設定の場合:

1. Grafana にアクセス: https://grafana.recrubo.net
2. Configuration (⚙️) → Data sources
3. "Add data source" をクリック
4. "Sentry" を検索して選択
5. 以下を入力:
   - Name: Sentry-1
   - Sentry URL: https://rectbot.sentry.io
   - Sentry Org: orgaci
   - Sentry Auth Token: (上記で取得したトークン)
6. "Save & test" をクリック


ステップ4: 自動プロビジョニング設定
-----------------------------------
datasources.yml に追加する場合:

```yaml
  - name: Sentry-1
    type: grafana-sentry-datasource
    access: proxy
    url: https://rectbot.sentry.io
    isDefault: false
    version: 1
    editable: true
    jsonData:
      orgSlug: orgaci
    secureJsonData:
      authToken: ${SENTRY_AUTH_TOKEN}
```

環境変数を設定:
```bash
# .env ファイルまたは docker-compose.yml に追加
SENTRY_AUTH_TOKEN=your-sentry-auth-token-here
```


ステップ5: Docker Compose設定を更新
-----------------------------------
docker-compose.monitoring.yml の grafana セクション:

```yaml
grafana:
  environment:
    SENTRY_AUTH_TOKEN: ${SENTRY_AUTH_TOKEN}
```


トラブルシューティング
----------------------
403 Forbidden エラーの場合:
1. Auth Token の権限を確認
   - Project: Read ✓
   - Event: Read ✓
   - Organization: Read ✓

2. Organization Slug が正しいか確認
   - Sentry URL の /organizations/{slug}/ 部分

3. Token が有効期限切れでないか確認

4. Sentry URL が正しいか確認
   - https://sentry.io または
   - https://rectbot.sentry.io


現在の設定を確認
----------------
Grafanaで既に設定されている場合:
- Sentry URL: https://rectbot.sentry.io
- Sentry Org: orgaci
- Auth Token: Configured (ただし権限エラー)

対処法:
1. 新しいAuth Tokenを作成（より広い権限で）
2. Grafana で "Reset" ボタンをクリック
3. 新しいTokenを入力
4. "Save & test" で確認


参考リンク
----------
- Grafana Sentry Plugin: https://grafana.com/grafana/plugins/grafana-sentry-datasource/
- Sentry API Tokens: https://docs.sentry.io/api/auth/
- Sentry Organizations: https://docs.sentry.io/product/accounts/membership/

==========================================
EOF
