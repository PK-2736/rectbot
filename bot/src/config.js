module.exports = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  // Accept either BACKEND_API_URL or BACKEND_URL for compatibility with older env names
  BACKEND_API_URL: process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'https://80cbc750-94a4-4b87-b86d-b328b7e76779.cfargotunnel.com',
  // Redis connection helpers
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: process.env.REDIS_PORT || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  // その他必要に応じて追加
};
