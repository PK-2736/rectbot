-- Migration: Migrate existing guild settings data to new columns
-- Created: 2025-12-12
-- Purpose: Populate new columns (recruit_channel_ids, enable_dedicated_channel, dedicated_channel_category_id) 
--          from existing data with backwards-compatible values

-- Note: recruit_channel_id already exists and contains the primary recruit channel
-- We only need to migrate recruit_channel_id → recruit_channel_ids (as JSON array)

-- 1. Initialize recruit_channel_ids as JSON array with single recruit_channel_id value
-- This creates a JSON array from the existing primary recruit_channel_id so multi-channel features work
UPDATE guild_settings
SET recruit_channel_ids = to_jsonb(ARRAY[recruit_channel_id])
WHERE recruit_channel_id IS NOT NULL
  AND (recruit_channel_ids IS NULL OR recruit_channel_ids = '[]'::jsonb);

-- 2. Initialize enable_dedicated_channel to false (default behavior)
-- If guilds currently don't have this setting, they default to false (no dedicated channel button shown)
UPDATE guild_settings
SET enable_dedicated_channel = false
WHERE enable_dedicated_channel IS NULL;

-- 3. Ensure dedicated_channel_category_id remains NULL for guilds without explicit setting
-- (Guilds without a specified category will create channels at server root level)
-- This step is optional since the column already defaults to NULL
UPDATE guild_settings
SET dedicated_channel_category_id = NULL
WHERE dedicated_channel_category_id IS NOT NULL 
  AND dedicated_channel_category_id = '';

-- 3. Ensure dedicated_channel_category_id remains NULL for guilds without explicit setting
-- (Guilds without a specified category will create channels at server root level)
-- This step is optional since the column already defaults to NULL
UPDATE guild_settings
SET dedicated_channel_category_id = NULL
WHERE dedicated_channel_category_id IS NOT NULL 
  AND dedicated_channel_category_id = '';

-- 4. Verify migration success (optional - comment out if not needed)
SELECT 
  COUNT(*) as total_guilds,
  COUNT(recruit_channel_id) as guilds_with_recruit_channel_id,
  COUNT(recruit_channel_ids) as guilds_with_recruit_channel_ids,
  COUNT(CASE WHEN recruit_channel_ids IS NOT NULL AND jsonb_array_length(recruit_channel_ids) > 0 THEN 1 END) as guilds_with_array_data,
  COUNT(CASE WHEN enable_dedicated_channel = true THEN 1 END) as guilds_with_dedicated_enabled,
  COUNT(dedicated_channel_category_id) as guilds_with_dedicated_category
FROM guild_settings;
