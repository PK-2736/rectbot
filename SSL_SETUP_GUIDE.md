# SSL証明書エラーの解決ガイド

## ❌ エラー内容
```
接続がプライベートではありません
攻撃者が、api.rectbot.tech から個人情報を盗み取ろうとしている可能性があります。
```

## 🔍 原因
`api.rectbot.tech` のSSL証明書が正しく設定されていない、またはDNS設定が不完全です。

## ✅ 解決方法

### オプション1: Cloudflare DNS + SSL（推奨）

#### ステップ1: DNSレコードの確認・追加

1. https://dash.cloudflare.com にアクセス
2. **rectbot.tech** ドメインを選択
3. **DNS** → **Records** タブ

#### 必要なDNSレコード:

| Type | Name | Content | Proxy status | TTL |
|------|------|---------|--------------|-----|
| CNAME | api | rectbot-backend.workers.dev | Proxied (オレンジ雲) | Auto |

または

| Type | Name | Content | Proxy status | TTL |
|------|------|---------|--------------|-----|
| CNAME | api | @（rootドメイン） | Proxied (オレンジ雲) | Auto |

**重要**: Proxy statusを必ず **Proxied（オレンジ色の雲）** にしてください！

#### ステップ2: Worker カスタムドメイン設定

1. https://dash.cloudflare.com → **Workers & Pages**
2. **rectbot-backend** を選択
3. **Settings** → **Domains & Routes**
4. **Add Custom Domain** をクリック
5. `api.rectbot.tech` を入力
6. **Add Domain** をクリック

#### ステップ3: SSL/TLS設定の確認

1. Cloudflare Dashboard → **rectbot.tech** ドメイン
2. **SSL/TLS** タブ
3. **暗号化モード** を **Full (strict)** に設定

   - ❌ Off: 暗号化なし
   - ❌ Flexible: CloudflareとVisitor間のみ暗号化
   - ✅ **Full (strict)**: 推奨設定（エンドツーエンド暗号化）
   - ✅ Full: 証明書検証なしで暗号化

#### ステップ4: 証明書の確認

1. **SSL/TLS** → **Edge Certificates**
2. **Universal SSL** が **Active** になっていることを確認
3. もし Pending の場合、最大24時間待つ

---

### オプション2: Worker カスタムドメインのみ（簡単）

DNSレコードを手動で追加せず、Workerのカスタムドメイン機能だけで設定する方法:

1. https://dash.cloudflare.com → **Workers & Pages**
2. **rectbot-backend** を選択
3. **Settings** → **Domains & Routes**
4. **Add Custom Domain** をクリック
5. `api.rectbot.tech` を入力
6. Cloudflareが自動的にDNSレコードとSSL証明書を設定

**この方法が最も簡単です！**

---

### オプション3: workers.dev を一時的に使用

本番環境の設定が完了するまで、Cloudflareが提供する workers.dev サブドメインを使用:

#### backend/wrangler.toml を変更:

```toml
name = "rectbot-backend"
account_id = "74749d85b9c280c0daa93e12ea5d5a14"
# route = "https://api.rectbot.tech/*"  # 一時的にコメントアウト
workers_dev = true  # これを true に変更
```

#### デプロイ:

```bash
cd backend
npx wrangler deploy
```

これで `https://rectbot-backend.workers.dev` でアクセス可能になります。

#### フロントエンドの設定も変更:

```bash
# VPSの環境変数を更新
BACKEND_API_URL=https://rectbot-backend.workers.dev
```

---

## 🔍 トラブルシューティング

### 1. DNS反映待ち

DNSレコードを追加した直後はエラーが出る場合があります。
- 通常: 数分〜15分
- 最大: 24時間

### 2. SSL証明書の状態確認

```bash
# PowerShellで確認
curl -v https://api.rectbot.tech/api/status 2>&1 | Select-String "SSL"
```

### 3. Cloudflare キャッシュクリア

1. Cloudflare Dashboard → **rectbot.tech**
2. **Caching** → **Configuration**
3. **Purge Everything** をクリック

### 4. ブラウザキャッシュクリア

- Chrome: Ctrl + Shift + Delete
- Edge: Ctrl + Shift + Delete
- Firefox: Ctrl + Shift + Delete

---

## ✅ 設定確認

### 正常な場合のレスポンス:

```bash
curl https://api.rectbot.tech/api/status
```

```json
{
  "status": "ok",
  "timestamp": "2025-10-07T...",
  "env": {
    "VPS_EXPRESS_URL": true,
    "SERVICE_TOKEN": true
  }
}
```

### DNS確認:

```powershell
nslookup api.rectbot.tech
```

正しい設定:
```
Server:  cloudflare-dns.com
Address:  1.1.1.1

Non-authoritative answer:
Name:    api.rectbot.tech
Addresses:  104.21.x.x
          172.67.x.x
```

---

## 📝 推奨設定まとめ

1. ✅ **オプション2** を推奨: Worker カスタムドメイン機能で自動設定
2. ✅ SSL/TLS モード: **Full (strict)**
3. ✅ DNS Proxy Status: **Proxied（オレンジ雲）**
4. ✅ Universal SSL: **Active**

この設定で、安全な HTTPS 接続が確立されます！
