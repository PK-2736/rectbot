# Discord Bot 募集管理システム

## 概要
このプロジェクトは、Discord 上での募集を管理する Bot と、管理者／ユーザー向けダッシュボードを統合したシステムです。  
特徴：

- ギルドごとの募集状況をほぼリアルタイムで確認  
- 管理者と一般ユーザーで表示内容を切り替え  
- Bot 再起動時に進行中募集のリセットと通知  
- Cloudflare Pages 上で公式サイトと管理者ダッシュボードを共存  
- Sentry を使ったエラーログ収集＋Discord通知  
- Supabase でギルド設定・サブスク情報・Stripe連携を管理

---

## 使用技術

| 用途 | 技術 |
|------|------|
| Bot 実行環境 | OCI VM + Node.js + pm2 |
| 募集状態保存 | Cloudflare KV（最新状態のみ） |
| ギルド設定・サブスク情報 | Supabase BaaS |
| 管理者ダッシュボード UI | Cloudflare Pages（React/Vue/Svelte 可） |
| API 層 | Cloudflare Worker（KV / Supabase 参照） |
| エラーログ収集 | Sentry |
| エラー通知 | Discord Webhook |
| 課金 | Stripe |

---

## データ構造

### 1. KV: 最新募集状態
- Key: `guild_<guildId>`  
- Value (JSON):

```json
{
  "channelId": "123456789",
  "recruitCount": 2,
  "startTime": "2025-09-17T18:00:00Z"
}

````

### 2. Supabase: ギルド設定

| カラム名                 | 型         | 説明                  |
| -------------------- | --------- | ------------------- |
| `guild_id`           | string    | Discord サーバーID      |
| `base_limit`         | int       | 無料枠募集上限             |
| `sub_limit`          | int       | サブスク枠募集上限           |
| `is_subscribed`      | boolean   | サブスク契約中か            |
| `notify_role_id`     | string    | 募集通知用ロールID          |
| `recruit_channel_id` | string    | 募集を行うチャンネルID        |
| `panel_main_color`   | string    | 募集パネルのメインカラー（16進数等） |
| `created_at`         | timestamp | レコード作成日時            |
| `updated_at`         | timestamp | レコード更新日時            |

---

## 募集数管理フロー

1. Bot が募集コマンドを受け取る
2. KV またはメモリキャッシュで現在の募集数を確認
3. Supabase からギルド上限を取得

   * 無料枠 → `base_limit`
   * サブスク枠 → `sub_limit`
4. 上限未達なら募集開始、達していればエラー返却
5. 募集開始時、KV に最新状態を保存
6. 募集終了時、KV から削除
7. 募集パネル作成時には `panel_main_color` を Embed に反映
8. 通知用ロール (`notify_role_id`) にメンションして募集開始を告知
9. メッセージ投稿先は `recruit_channel_id` を参照

---

## 再起動時の処理

* Bot 起動時に KV から全ギルドの募集情報を取得
* 進行中の募集は無効化し、該当チャンネルに通知
* KV から該当エントリを削除して状態リセット

---

## ダッシュボード設計

### 1. URL

* 共通 URL: `/admin`
* **同じ URL で管理者／ユーザー表示を切り替え**

### 2. 表示内容

| ユーザー種別 | 表示内容                                             |
| ------ | ------------------------------------------------ |
| 一般ユーザー | 自分のギルドのサブスク状況、サブスクコード適用済みサーバー一覧                  |
| 管理者    | 全ギルドの募集状況テーブル（ギルド名・募集チャンネル・人数・上限・サブスク人数・開始時刻・状態） |

### 3. テーブル型 UI（管理者向け）

* プログレスバーで現在人数 / 上限を表示
* 色分け：

  * 緑：募集中
  * 黄：残り枠少
  * 赤：上限達成
* 募集状態は文字＋色で表示（募集中／終了／キャンセル）

### 4. リアルタイム更新

* Worker API から KV を取得
* ページ側で **数秒ごとに fetch** して再描画（3～5秒間隔推奨）
* 中間キャッシュでアクセス集中時の無料枠超過を防止

---

## 管理者判定

* **ユーザーIDベース**で判定
* 環境変数または Supabase に管理者IDリストを保持
* OAuth2 で取得したユーザーIDがリストに含まれる場合は管理者表示

```js
const ADMIN_IDS = process.env.ADMIN_IDS.split(',');
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}
```

* メリット

  * 複数ギルド導入でも簡単に管理者権限を一元管理
  * Bot やギルドの権限に依存しない
* 将来的にギルド単位で権限を管理したい場合は Supabase に切り替え可能

---

## データフロー

```
[Discord Bot @ OCI VM]
   │ 募集イベント
   ├─> KV（最新募集状態）
   └─> Supabase（ギルド設定・Stripe情報）

[Cloudflare Worker API]
   ├─ KV参照 → ダッシュボードに最新募集返却
   └─ Supabase参照 → ギルド設定・課金情報取得

[Cloudflare Pages /admin]
   ├─ OAuth2 ログイン → ユーザーID取得
   ├─ 管理者判定
   └─ 管理者 or ユーザー表示切替（テーブル型 / リスト型）
```

---

## Sentry + Discord 通知

* Bot / Worker / Pages / Supabase / Stripe のエラーを Sentry に集約
* Discord Webhook で管理者にリアルタイム通知
* Bot 内で例外発生時に `Sentry.captureException(err)`
* Worker でも HTTP POST で Sentry に送信可能

---

## ポイントまとめ

* 同じ URL で管理者／ユーザー表示を切り替え
* KV + Supabase + Stripe + Sentry で、最新募集状態とエラー監視を両立
* 管理者は全ギルドの募集状況を一目で確認可能
* 一般ユーザーは自分のサブスク状況とサブスクコード適用状況を確認可能
* ギルドごとの通知ロール・募集チャンネル・パネルカラーなども設定可能

---

## 今後の拡張案

* WebSocket / SSE による即時リアルタイム更新
* 募集履歴を Supabase に保存して統計・分析
* サブスクレベルに応じた募集上限の自動反映
* 管理者がダッシュボード上で直接「募集開始／終了」操作可能
* Sentry 通知のカスタマイズ（重要度別チャンネル振り分け）
