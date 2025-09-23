-- ギルド設定テーブルの作成
CREATE TABLE IF NOT EXISTS guild_settings (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT UNIQUE NOT NULL,
    recruit_channel_id TEXT,
    notification_role_id TEXT,
    default_title TEXT DEFAULT '参加者募集',
    default_color TEXT DEFAULT '#00FFFF',
    update_channel_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスを作成（高速検索のため）
CREATE INDEX IF NOT EXISTS idx_guild_settings_guild_id ON guild_settings(guild_id);

-- updated_at を自動更新するトリガーを作成
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_guild_settings_updated_at
    BEFORE UPDATE ON guild_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) の設定
ALTER TABLE guild_settings ENABLE ROW LEVEL SECURITY;

-- Service roleでの読み書きを許可するポリシー
CREATE POLICY "Service role can manage guild settings" ON guild_settings
    FOR ALL USING (auth.role() = 'service_role');

-- 認証されたユーザーは読み取りのみ許可（将来のダッシュボード用）
CREATE POLICY "Authenticated users can read guild settings" ON guild_settings
    FOR SELECT USING (auth.role() = 'authenticated');

-- コメントを追加
COMMENT ON TABLE guild_settings IS 'Discord ギルドの募集設定を保存するテーブル';
COMMENT ON COLUMN guild_settings.guild_id IS 'Discord ギルドID（サーバーID）';
COMMENT ON COLUMN guild_settings.recruit_channel_id IS '募集投稿を行うチャンネルID';
COMMENT ON COLUMN guild_settings.notification_role_id IS '募集通知を受け取るロールID';
COMMENT ON COLUMN guild_settings.default_title IS '募集投稿のデフォルトタイトル';
COMMENT ON COLUMN guild_settings.default_color IS '募集画像のデフォルトアクセントカラー';
COMMENT ON COLUMN guild_settings.update_channel_id IS 'ボットのアップデート通知を受け取るチャンネルID';