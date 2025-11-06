# Supabase RLS（Row Level Security）ポリシー設定ガイド

## 📋 現状分析と推奨設定

### テーブル一覧と用途

| テーブル名 | 用途 | 主要カラム | アクセス要件 |
|-----------|------|-----------|------------|
| `guild_settings` | ギルド募集設定 | guild_id, recruit_channel_id, notification_role_id, default_title, default_color | ギルド管理者のみ更新可 |
| `users` | Discordユーザー基本情報 | id, username, discriminator, avatar | 本人のみ更新可、全員読み取り可 |
| `recruitments` | 募集情報 | id, owner_id, guild_id, message_id, status | 作成者のみ更新/削除可、全員読み取り可 |
| `participations` | 参加記録 | user_id, recruitment_id | 本人のみ作成/削除可、募集作成者も読み取り可 |
| `admins` | 管理者一覧 | user_id, discord_id | 管理者のみ全権アクセス |

---

## ⚠️ 重要な原則

### 1. Service Role Key の使用制限
- **Backend Worker** と **Bot サーバー** のみが Service Role Key を使用
- Service Role Key は **RLS をバイパスする全権限** を持つ
- フロントエンド（Next.js Pages）では **絶対に使用しない**

### 2. フロントエンドの認証
- `anon` キーを使用
- ユーザー認証は Discord OAuth2 経由
- JWT トークンで `auth.uid()` を取得
- RLS ポリシーで自動的にアクセス制御

### 3. RLS ポリシーの適用範囲
- **全テーブルに RLS を有効化**
- Service Role Key 使用時は RLS バイパス（Backend/Bot のみ）
- anon キー使用時は RLS が自動適用（フロントエンド）

---

## 🔒 推奨 RLS ポリシー設定

### テーブル: `guild_settings`

```sql
-- RLS を有効化
ALTER TABLE guild_settings ENABLE ROW LEVEL SECURITY;

-- ポリシー 1: 全員が自分のギルド設定を読み取り可能
CREATE POLICY "guild_settings_select_policy" ON guild_settings
  FOR SELECT
  USING (true);

-- ポリシー 2: Service Role（Backend/Bot）のみが書き込み可能
-- フロントエンドからの直接書き込みは不可
CREATE POLICY "guild_settings_insert_policy" ON guild_settings
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "guild_settings_update_policy" ON guild_settings
  FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "guild_settings_delete_policy" ON guild_settings
  FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');
```

**代替案（ギルドオーナーのみ更新可能にする場合）:**
```sql
-- ギルドオーナーのみ更新可能
CREATE POLICY "guild_settings_update_owner_policy" ON guild_settings
  FOR UPDATE
  USING (
    guild_id IN (
      SELECT guild_id FROM user_guild_roles
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
```

---

### テーブル: `users`

```sql
-- RLS を有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ポリシー 1: 全員が全ユーザー情報を読み取り可能（公開情報のみ）
CREATE POLICY "users_select_policy" ON users
  FOR SELECT
  USING (true);

-- ポリシー 2: 本人のみが自分の情報を更新可能
CREATE POLICY "users_update_policy" ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- ポリシー 3: 新規ユーザー作成は認証済みユーザーのみ
CREATE POLICY "users_insert_policy" ON users
  FOR INSERT
  WITH CHECK (auth.uid() = id);
```

---

### テーブル: `recruitments`

```sql
-- RLS を有効化
ALTER TABLE recruitments ENABLE ROW LEVEL SECURITY;

-- ポリシー 1: 全員が募集情報を読み取り可能
CREATE POLICY "recruitments_select_policy" ON recruitments
  FOR SELECT
  USING (true);

-- ポリシー 2: 認証済みユーザーは募集を作成可能
CREATE POLICY "recruitments_insert_policy" ON recruitments
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- ポリシー 3: 作成者のみが募集を更新可能
CREATE POLICY "recruitments_update_policy" ON recruitments
  FOR UPDATE
  USING (auth.uid() = owner_id);

-- ポリシー 4: 作成者のみが募集を削除可能
CREATE POLICY "recruitments_delete_policy" ON recruitments
  FOR DELETE
  USING (auth.uid() = owner_id);
```

---

### テーブル: `participations`

```sql
-- RLS を有効化
ALTER TABLE participations ENABLE ROW LEVEL SECURITY;

-- ポリシー 1: 本人と募集作成者が参加記録を読み取り可能
CREATE POLICY "participations_select_policy" ON participations
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    auth.uid() IN (
      SELECT owner_id FROM recruitments
      WHERE id = participations.recruitment_id
    )
  );

-- ポリシー 2: 本人のみが参加記録を作成可能
CREATE POLICY "participations_insert_policy" ON participations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ポリシー 3: 本人のみが参加記録を削除可能
CREATE POLICY "participations_delete_policy" ON participations
  FOR DELETE
  USING (auth.uid() = user_id);
```

---

### テーブル: `admins`

```sql
-- RLS を有効化
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ポリシー 1: 全員が管理者一覧を読み取り可能（管理者判定のため）
CREATE POLICY "admins_select_policy" ON admins
  FOR SELECT
  USING (true);

-- ポリシー 2: 既存の管理者のみが新しい管理者を追加可能
CREATE POLICY "admins_insert_policy" ON admins
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM admins)
  );

-- ポリシー 3: 既存の管理者のみが管理者を削除可能
CREATE POLICY "admins_delete_policy" ON admins
  FOR DELETE
  USING (
    auth.uid() IN (SELECT user_id FROM admins)
  );
```

---

## 🧪 RLS テスト方法

### 1. Service Role Key でのアクセス確認
```bash
# Backend/Bot は Service Role Key を使用（RLS バイパス）
curl -X GET "https://your-project.supabase.co/rest/v1/guild_settings" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### 2. anon キーでのアクセス確認
```bash
# フロントエンドは anon キーを使用（RLS 適用）
curl -X GET "https://your-project.supabase.co/rest/v1/recruitments" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Supabase ダッシュボードでの確認
1. Supabase ダッシュボード → **Authentication** → **Policies**
2. 各テーブルの RLS ステータスを確認
3. ポリシーの詳細を確認・編集

---

## 📝 実装チェックリスト

### Backend (Cloudflare Workers)
- [x] Service Role Key を環境変数に設定
- [x] `getSupabaseClient()` で Service Role Key を使用
- [ ] RLS バイパスを意図していることを確認

### Bot (Node.js)
- [x] Service Role Key を `.env` に設定
- [x] `getSupabase()` で Service Role Key を使用
- [ ] RLS バイパスを意図していることを確認

### Frontend (Next.js)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` を使用
- [ ] **絶対に Service Role Key を含めない**
- [ ] Discord OAuth2 認証を実装
- [ ] JWT トークンで `auth.uid()` を取得

### Supabase ダッシュボード
- [ ] 全テーブルで RLS を有効化
- [ ] 各テーブルにポリシーを設定
- [ ] ポリシーのテストを実施

---

## ⚙️ 設定適用手順

### 1. Supabase ダッシュボードで設定
```sql
-- 1. RLS を有効化（全テーブル）
ALTER TABLE guild_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- 2. 上記のポリシーを順に実行
-- （各テーブルのポリシーを Supabase SQL Editor で実行）
```

### 2. Backend/Bot の確認
```bash
# Backend と Bot が Service Role Key を使用していることを確認
grep -r "SUPABASE_SERVICE_ROLE_KEY" backend/
grep -r "SUPABASE_SERVICE_ROLE_KEY" bot/
```

### 3. フロントエンドの確認
```bash
# フロントエンドが anon キーを使用していることを確認
grep -r "NEXT_PUBLIC_SUPABASE_ANON_KEY" frontend/
# Service Role Key が含まれていないことを確認
grep -r "SERVICE_ROLE_KEY" frontend/
```

---

## 🚨 セキュリティ注意事項

### 絶対にやってはいけないこと
1. ❌ フロントエンドに Service Role Key を含める
2. ❌ Git に Service Role Key をコミット
3. ❌ RLS を無効化したまま本番運用
4. ❌ anon キーで全権限を付与

### 推奨事項
1. ✅ Service Role Key は Backend/Bot のみに限定
2. ✅ フロントエンドは必ず anon キー + JWT
3. ✅ 全テーブルで RLS を有効化
4. ✅ 定期的にポリシーを監査

---

## 📚 参考リンク

- [Supabase RLS 公式ドキュメント](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers)
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
