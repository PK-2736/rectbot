# SSL証明書エラー - 詳細トラブルシューティング

## 📋 現状確認

### ✅ 確認済み
- SSL証明書: **アクティブ** (api.rectbot.tech, rectbot.tech)
- DNS設定: **正常** (104.21.61.227, 172.67.216.8)
- 有効期限: 2025-12-10まで

### ❌ 問題点
- PowerShellからのアクセスでSSLエラー
- ブラウザでも「接続がプライベートではありません」エラー

## 🔍 考えられる原因

### 1. Workerのカスタムドメイン設定が不完全

Cloudflare Dashboardで以下を確認してください：

#### 手順:
1. https://dash.cloudflare.com → **Workers & Pages**
2. **rectbot-backend** を選択
3. **Settings** → **Triggers** タブ

#### 確認ポイント:

**Custom Domains** セクションに `api.rectbot.tech` が表示されているか？

- ✅ 表示されている → 次のステップへ
- ❌ 表示されていない → 追加が必要

#### 追加方法:
1. **Triggers** タブ
2. **Custom Domains** セクション
3. **Add Custom Domain** をクリック
4. `api.rectbot.tech` を入力
5. **Add Domain** をクリック

---

### 2. Routes設定との競合

`wrangler.toml` に `route` が設定されている場合、Custom Domainsと競合する可能性があります。

#### 解決方法A: Routeを削除してCustom Domainのみ使用（推奨）

**backend/wrangler.toml** を以下のように修正:

```toml
name = "rectbot-backend"
account_id = "74749d85b9c280c0daa93e12ea5d5a14"
# route = "https://api.rectbot.tech/*"  # この行を削除またはコメントアウト
main = "index.js"
compatibility_date = "2025-09-11"
workers_dev = false
```

その後、再デプロイ:

```powershell
cd backend
npx wrangler deploy
```

#### 解決方法B: Custom Domainを削除してRouteのみ使用

1. Dashboard → Workers → rectbot-backend → Settings → Triggers
2. Custom Domains セクションから `api.rectbot.tech` を削除
3. wrangler.toml の route 設定をそのまま使用

---

### 3. SSL/TLS暗号化モードの確認

#### 確認手順:
1. https://dash.cloudflare.com → **rectbot.tech** ドメイン
2. **SSL/TLS** タブ
3. **Overview** で暗号化モードを確認

#### 推奨設定:
- ✅ **Full** または **Full (strict)**
- ❌ Flexible（これだと証明書エラーが出る場合があります）

#### 変更方法:
1. 暗号化モードを **Full (strict)** に変更
2. 5分ほど待つ
3. ブラウザキャッシュをクリア (Ctrl + Shift + Delete)
4. 再度アクセス

---

### 4. Universal SSL証明書の再発行

まれに証明書が正しく適用されていない場合があります。

#### 手順:
1. Cloudflare Dashboard → **rectbot.tech** ドメイン
2. **SSL/TLS** → **Edge Certificates**
3. **Universal SSL** の右側にある「...」メニュー
4. **Disable Universal SSL** をクリック
5. 確認ダイアログで **Understand** をクリック
6. 30秒待つ
7. 再度 **Enable Universal SSL** をクリック
8. 5〜15分待つ（証明書が再発行されます）

---

### 5. Cloudflare Pageキャッシュのパージ

#### 手順:
1. Cloudflare Dashboard → **rectbot.tech** ドメイン
2. **Caching** → **Configuration**
3. **Purge Everything** をクリック
4. 確認して実行

---

## 🔧 推奨する解決手順（順番に試してください）

### ステップ1: Custom Domain設定の確認と追加

```powershell
# ブラウザで確認
start https://dash.cloudflare.com
```

1. Workers & Pages → rectbot-backend → Settings → **Triggers** タブ
2. **Custom Domains** に `api.rectbot.tech` があるか確認
3. なければ **Add Custom Domain** で追加

### ステップ2: wrangler.toml の route を削除

**backend/wrangler.toml** を修正:
```toml
name = "rectbot-backend"
account_id = "74749d85b9c280c0daa93e12ea5d5a14"
# route = "https://api.rectbot.tech/*"  # コメントアウト
main = "index.js"
compatibility_date = "2025-09-11"
workers_dev = false
```

再デプロイ:
```powershell
cd backend
npx wrangler deploy
```

### ステップ3: SSL/TLS設定を確認

1. Cloudflare Dashboard → rectbot.tech → SSL/TLS
2. 暗号化モードを **Full (strict)** に設定

### ステップ4: キャッシュクリア

**Cloudflareキャッシュ:**
1. rectbot.tech → Caching → Configuration
2. Purge Everything

**ブラウザキャッシュ:**
- Ctrl + Shift + Delete
- または、シークレットモードで開く

### ステップ5: 5〜10分待って再テスト

```powershell
# シークレットウィンドウで開く
start msedge -inprivate https://api.rectbot.tech/api/status
```

---

## 📝 確認コマンド

### DNS確認:
```powershell
nslookup api.rectbot.tech 1.1.1.1
```

### SSL証明書確認（外部サイト）:
```powershell
start https://www.ssllabs.com/ssltest/analyze.html?d=api.rectbot.tech
```

### ブラウザでの確認:
```powershell
start msedge -inprivate https://api.rectbot.tech/api/status
```

---

## ✅ 成功時の状態

### ブラウザ:
- 🔒 鍵マークが表示される
- JSONレスポンスが返ってくる

### PowerShell:
```powershell
curl https://api.rectbot.tech/api/status
```
エラーなく、JSONが返ってくる

---

## 🆘 それでも解決しない場合

### 一時的な回避策: workers.dev を使用

1. **backend/wrangler.toml** を修正:
```toml
name = "rectbot-backend"
account_id = "74749d85b9c280c0daa93e12ea5d5a14"
# route = "https://api.rectbot.tech/*"
main = "index.js"
compatibility_date = "2025-09-11"
workers_dev = true  # これをtrueに
```

2. 再デプロイ:
```powershell
cd backend
npx wrangler deploy
```

3. アクセス先を変更:
```
https://rectbot-backend.workers.dev/api/status
```

4. VPS環境変数を更新:
```bash
# bot/.env
BACKEND_API_URL=https://rectbot-backend.workers.dev
```

5. PM2再起動:
```bash
pm2 restart all
```

この方法なら確実にSSLエラーは出ません。

---

## 📞 サポート情報

上記の手順を試しても解決しない場合、以下の情報を共有してください：

1. Custom Domains の設定状況（スクリーンショット）
2. SSL/TLS 暗号化モード
3. シークレットウィンドウでのアクセス結果
4. `npx wrangler deploy` の出力結果

そうすれば、より詳細な診断ができます！
