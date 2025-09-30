# Discord Bot 募集管理システム（Worker 集約 + Redis Tunnel）

## 概要
このプロジェクトは、Discord 上の募集を管理する Bot と、管理者／ユーザー向けダッシュボードを統合したシステムです。  
特徴：

- Cloudflare Worker による API 集約
- OCI VM + Redis を短期データ管理に利用
- 管理者ダッシュボードは Cloudflare Pages 上に構築
- Sentry でエラーログ収集・Discord通知
- Supabase でギルド設定・サブスク情報・Stripe 連携管理
- Worker 集約 API を経由して Redis に安全にアクセス（Tunnel 経由）

---

## 使用技術

| 用途 | 技術 |
|------|------|
| Bot 実行環境 | OCI VM + Node.js + pm2 |
| 短期データ（進行中の募集） | Redis（OCI VM 内） |
| 永続データ（ギルド設定・サブスク状況） | Supabase |
| リアルタイムキャッシュ | Cloudflare KV |
| API 集約 | Cloudflare Worker |
| 管理者ダッシュボード UI | Cloudflare Pages（React/Vue/Svelte 可） |
| エラーログ収集 | Sentry |
| エラー通知 | Discord Webhook |
| 課金管理 | Stripe |

---

## サブドメイン構成

| サブドメイン | 用途 |
|--------------|------|
| `api.rectbot.tech` | Cloudflare Worker（公開 API 集約用） |
| `redis.rectbot.tech` | Cloudflare Tunnel 経由で OCI VM 上の Redis に接続 |

- サブドメインを分けることで **役割の分離**と **セキュリティ強化**が可能  
- Worker は Redis に直接 TCP 接続できないため、**Express API 経由で Redis を操作**する設計

---

## アーキテクチャ

```
[Bot / Web / Pages / Stripe / Discord]
                 │
         api.rectbot.tech (Cloudflare Worker)
                 │
 ┌───────────────┴
 │                               
 Supabase  (永続データ)            (キャッシュ)
 │
 Tunnel → redis.rectbot.tech → Express (OCI VM) → Redis (短期データ)
```

- Worker はフロント・Bot・外部サービスからの API を一元管理  
- Redis は揮発的データ（進行中募集など）専用  
- KV はダッシュボード用キャッシュや、多少の遅延が許容されるデータ向け  

---

## データ構造

### Supabase: ギルド設定・サブスク情報
- テーブル例:
  - `guilds`: 通知用ロール、募集チャンネル、募集パネルカラー、サブスク適用状況
  - `subscriptions`: ユーザーの課金情報、サブスク上限数
  - `stripe_webhooks`: Stripe Webhook 処理用

---

## Worker → Tunnel → Redis 接続例

1. **Express API（OCI VM 内）**
```js
// 進行中の募集を取得
app.get("/recruit/:guildId", async (req, res) => {
  const data = await redis.get(`guild:${req.params.guildId}:recruit`);
  res.json({ data: data ? JSON.parse(data) : null });
});
```

2. **Cloudflare Tunnel 設定**
```yaml
ingress:
  - hostname: redis.rectbot.tech
    service: http://localhost:3000
  - service: http_status:404
```

3. **Worker 側 fetch**
```js
const resp = await fetch(`https://redis.rectbot.tech/recruit/${guildId}`);
const data = await resp.json();
```

- Express は外部に直接公開せず、Tunnel 経由でのみアクセス可能  
- Worker が Redis の窓口となり、セキュリティを確保

---

## ダッシュボード表示の切り分け
- **管理者**: サーバー募集状況、サブスク人数、リアルタイム募集一覧  
- **ユーザー**: 自分のサブスク状況、適用済みサーバー情報  
- **認証**: Discord OAuth でログイン → ユーザーIDで権限判定

---

## 注意事項
- 短期データは Redis に集約、永続データは Supabase に保存  
- KV は表示用キャッシュとして利用  
- Worker → Express → Redis 経路を通すことで、外部から Redis を直接触らせない安全設計  

