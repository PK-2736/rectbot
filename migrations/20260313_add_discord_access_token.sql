-- Discord OAuth access token storage for guild selection feature
-- Adds columns to store Discord access token per user (used for /api/discord/guilds)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS discord_access_token TEXT,
  ADD COLUMN IF NOT EXISTS discord_token_expires_at TIMESTAMPTZ;
