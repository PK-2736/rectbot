-- Migration: Add dedicated channel creation type settings
-- Created: 2026-03-18

ALTER TABLE guild_settings
ADD COLUMN IF NOT EXISTS dedicated_channel_type TEXT DEFAULT 'voice',
ADD COLUMN IF NOT EXISTS dedicated_thread_parent_channel_id TEXT;

-- Backfill existing rows
UPDATE guild_settings
SET dedicated_channel_type = 'voice'
WHERE dedicated_channel_type IS NULL OR dedicated_channel_type = '';

-- Optional sanity normalization
UPDATE guild_settings
SET dedicated_channel_type = 'voice'
WHERE dedicated_channel_type NOT IN ('voice', 'text', 'thread');

COMMENT ON COLUMN guild_settings.dedicated_channel_type IS 'Dedicated space type: voice | text | thread';
COMMENT ON COLUMN guild_settings.dedicated_thread_parent_channel_id IS 'Parent channel ID used when dedicated_channel_type=thread';
