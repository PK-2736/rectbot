-- recruit_templatesテーブルが存在しない場合は作成する
CREATE TABLE IF NOT EXISTS recruit_templates (
  id          BIGSERIAL PRIMARY KEY,
  guild_id    TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  title       TEXT,
  participants INTEGER,
  color       TEXT,
  notification_role_id TEXT,
  content     TEXT,
  start_time_text TEXT,
  regulation_members INTEGER,
  voice_place TEXT,
  voice_option TEXT,
  created_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, name)
);

-- design / layout カラムを追加（既存テーブルにも対応）
ALTER TABLE recruit_templates
  ADD COLUMN IF NOT EXISTS background_image_url TEXT,
  ADD COLUMN IF NOT EXISTS background_asset_key TEXT,
  ADD COLUMN IF NOT EXISTS title_x INTEGER,
  ADD COLUMN IF NOT EXISTS title_y INTEGER,
  ADD COLUMN IF NOT EXISTS members_x INTEGER,
  ADD COLUMN IF NOT EXISTS members_y INTEGER,
  ADD COLUMN IF NOT EXISTS font_family TEXT,
  ADD COLUMN IF NOT EXISTS font_size INTEGER,
  ADD COLUMN IF NOT EXISTS text_color TEXT,
  ADD COLUMN IF NOT EXISTS layout_json JSONB;
