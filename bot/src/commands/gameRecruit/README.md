# GameRecruit コマンド - フォルダ構造

このディレクトリは Discord recruitment bot の募集機能を実装しています。
機能別にモジュール化され、以下のサブフォルダに整理されています。

## 📁 フォルダ構成

### 🎯 `handlers.js` (メインエントリーポイント)
- モーダル送信とボタンインタラクションのオーケストレーター
- 簡素化版（135行）- 各モジュールに処理を委譲

### 📊 `data/` - データ管理
状態管理、定数、データ永続化、参加者情報を担当

- `state.js` - グローバル状態（recruitParticipants, pendingModalOptions等）
- `constants.js` - 定数定義（MIN_PARTICIPANTS, EXEMPT_GUILD_IDS等）
- `data-loader.js` - Redis からのデータ読み込み・ハイドレーション
- `dataPersistence.js` - データ永続化処理
- `participantManager.js` - 参加者管理ロジック

### 🎨 `ui/` - UI構築・表示
募集パネルや通知の UI コンポーネント生成を担当

- `ui-preparation.js` - UI準備（画像、コンテナ、テキスト）
- `ui-builders.js` - レガシー UI ビルダー
- `uiBuilders.js` - UI ビルダー
- `uiUtils.js` - UI ユーティリティ
- `text-builders.js` - テキスト要素構築（ラベル、詳細テキスト等）
- `message-updater.js` - メッセージ編集処理
- `message-finalization.js` - メッセージ確定処理

### 🔔 `notifications/` - 通知・アナウンス
募集案内の送信や通知ロール選択を担当

- `announcement-flow.js` - アナウンスメント送信フロー
- `announcements.js` - アナウンスメント処理
- `notificationSystem.js` - 通知システム
- `notification-role-selector.js` - 通知ロール選択UI

### ✅ `validation/` - バリデーション
ユーザー入力やコマンド実行の検証を担当

- `validation.js` - クールダウン、募集上限チェック
- `validation-helpers.js` - バリデーションヘルパー関数

### 🔄 `flows/` - ワークフロー
複雑なビジネスロジックフローを担当

- `modal-submit-flow.js` - モーダル送信時の全フロー処理
  - バリデーション → データ構築 → 永続化 → 通知
- `modal-data-extractor.js` - モーダルからデータを抽出・構築

### ⚙️ `actions/` - アクション処理
ボタンクリック等のユーザーアクション処理を担当

- `buttonActions.js` - 参加/キャンセル/完了ボタン処理
- `participant-actions.js` - 参加者管理アクション
- `recruit-create.js` - 募集作成処理（大規模）
- `recruit-close.js` - 募集締め切り処理

### 📢 `channels/` - 専用チャンネル管理
ボイスチャンネル作成・管理を担当

- `dedicatedChannelHandler.js` - 専用チャンネル作成メインロジック
- `dedicated-channel.js` - 専用チャンネル関連処理

### 🛠️ `utils/` - ユーティリティ
汎用ヘルパー関数を担当

- `handlerUtils.js` - ハンドラーユーティリティ
- `reply-helpers.js` - エラー返信ヘルパー
- `parameter-objects.js` - パラメータオブジェクト定義
- `start-time.js` - 開始時刻関連処理

### 📋 その他
- `execute.js` - コマンド実行エントリーポイント
- `handlers-old-backup.js` - 旧バージョンバックアップ

## 📈 改善実績

| 項目 | 前 | 後 | 削減率 |
|------|-----|-----|--------|
| handlers.js 行数 | 1,048行 | 135行 | **87%削減** |
| handlers.js 関数数 | 68個 | 2個 | **97%削減** |
| トップレベルファイル | 33個 | 11個 | **67%削減** |
| モジュール数 | 1個 | 9個 | 機能別に整理 |

## 🔗 インポート例

```javascript
// データ管理から states を取得
const { recruitParticipants } = require('./data/state');

// UI準備モジュールから関数を取得
const { prepareUIComponentsForCreate } = require('./ui/ui-preparation');

// 検証モジュールから関数を取得
const { validateModalSubmission } = require('./flows/modal-submit-flow');

// アクション処理から関数を取得
const { processJoin } = require('./actions/buttonActions');
```

## 🎯 設計原則

1. **責任分離**: 各モジュールは単一の責任を持つ
2. **依存管理**: 下位レイヤーへの単方向依存
3. **再利用性**: 共通ロジックはユーティリティ化
4. **テスト容易性**: モジュール単位でテスト可能
5. **保守性**: 明確なフォルダ構造と命名規則

## 📝 コードの流れ

```
📥 ユーザーインタラクション
  ↓
🎯 handlers.js (オーケストレーター)
  ├→ 📊 validation/ (入力検証)
  ├→ 🔄 flows/ (ビジネスロジック)
  │  ├→ 📊 data/ (データ取得/保存)
  │  ├→ 🎨 ui/ (UI生成)
  │  └→ 🔔 notifications/ (通知送信)
  ├→ ⚙️ actions/ (ユーザーアクション)
  │  ├→ 📢 channels/ (チャンネル操作)
  │  └→ 🛠️ utils/ (ヘルパー)
  └→ 📤 Discord API
```

