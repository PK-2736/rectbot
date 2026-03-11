-- Migration: Add new guild settings columns for multi-channel and dedicated channel support
-- Created: 2025-12-12

-- Add columns for recruit channel multi-select
ALTER TABLE guild_settings
ADD COLUMN IF NOT EXISTS recruit_channel_id TEXT,
ADD COLUMN IF NOT EXISTS recruit_channel_ids JSONB;

-- Add columns for dedicated channel configuration
ALTER TABLE guild_settings
ADD COLUMN IF NOT EXISTS enable_dedicated_channel BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS dedicated_channel_category_id TEXT;

-- Create index on guild_id if not exists (for faster lookups)
CREATE INDEX IF NOT EXISTS guild_settings_guild_id_idx ON guild_settings(guild_id);

-- Add comments for documentation
COMMENT ON COLUMN guild_settings.recruit_channel_id IS 'Primary recruit channel ID (kept for backwards compatibility)';
COMMENT ON COLUMN guild_settings.recruit_channel_ids IS 'Array of allowed recruit channel IDs (JSON format)';
COMMENT ON COLUMN guild_settings.enable_dedicated_channel IS 'Enable/disable dedicated channel creation button';
COMMENT ON COLUMN guild_settings.dedicated_channel_category_id IS 'Category ID where dedicated channels are created';
