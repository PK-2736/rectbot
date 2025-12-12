## Supabase スキーマ移行ガイド

既存の設定データを新しいカラムに移行するため、以下の **2つの SQL ファイル** を Supabase SQL エディタで順番に実行してください。

### 実行順序

#### **ステップ 1: 新カラムの追加** ✅
**ファイル:** `migrations/20251212_add_guild_settings_columns.sql`

このファイルの内容をコピーして、Supabase ダッシュボードの SQL エディタで実行してください。

新カラムを追加します：
- `recruit_channel_id` - プライマリ募集チャンネル（既存の `recruit_channel` との互換性維持用）
- `recruit_channel_ids` - 複数募集チャンネルの JSON 配列
- `enable_dedicated_channel` - 専用チャンネルボタンの有効/無効フラグ（デフォルト: false）
- `dedicated_channel_category_id` - 専用チャンネルを作成するカテゴリ ID

#### **ステップ 2: 既存データを新カラムに移行** ✅
**ファイル:** `migrations/20251212_migrate_guild_settings_data.sql`

このファイルの内容をコピーして、ステップ 1 の実行後に実行してください。

既存の設定データを新カラムに移行します：
- 既存の `recruit_channel` → `recruit_channel_id` へコピー
- `recruit_channel_id` を配列に変換して `recruit_channel_ids` に格納
- `enable_dedicated_channel` を全ギルド false で初期化（ユーザーがオン/オフで切り替え可能に）
- `dedicated_channel_category_id` を NULL で初期化（ユーザーが指定可能に）

### 移行検証

ステップ 2 の SQL 実行時に、最後の `SELECT` ステートメント（オプション）でデータ移行の統計が表示されます：

```
total_guilds - 総ギルド数
guilds_with_recruit_channel_id - recruit_channel_id が設定されたギルド数
guilds_with_recruit_channel_ids - recruit_channel_ids が設定されたギルド数
guilds_with_dedicated_enabled - 専用チャンネルが有効なギルド数（初期値は 0）
guilds_with_dedicated_category - カテゴリが指定されたギルド数（初期値は 0）
```

### 実行確認後

両方のマイグレーション SQL を実行した後：

1. **ボットを再起動** - Redis キャッシュをクリアするため `npm start` で再起動
2. **一つのギルドで設定を開く** - `/guild_settings` コマンドで設定を確認
3. **新カラムが表示される** - 「📍 チャンネル設定」に募集チャンネルと通知チャンネルが表示される
4. **設定を保存** - 「保存」ボタンで新カラムに値が正しく保存される

### トラブルシューティング

#### Q: ステップ 1 実行時に「Column already exists」エラーが出た
→ カラムは既に存在します。続けてステップ 2 を実行してください。

#### Q: ステップ 2 実行後も既存の `recruit_channel` が表示されない
→ 以下の SQL を実行して手動確認：
```sql
SELECT guild_id, recruit_channel, recruit_channel_id, recruit_channel_ids 
FROM guild_settings 
LIMIT 5;
```

#### Q: 特定のギルドのデータが移行されていない
→ 手動で特定ギルド ID に対して UPDATE を実行：
```sql
UPDATE guild_settings
SET recruit_channel_id = recruit_channel,
    recruit_channel_ids = to_jsonb(ARRAY[recruit_channel])
WHERE guild_id = 'YOUR_GUILD_ID'
  AND recruit_channel IS NOT NULL;
```
