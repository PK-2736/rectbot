-- Check existing columns in guild_settings table
-- Run this first to see what columns currently exist

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'guild_settings'
ORDER BY ordinal_position;
