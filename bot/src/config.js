module.exports = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  // Accept either BACKEND_API_URL or BACKEND_URL for compatibility with older env names
  BACKEND_API_URL: process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'https://api.recrubo.net',
  // Web dashboard base URL for template customization page links
  DASHBOARD_BASE_URL: process.env.DASHBOARD_BASE_URL || process.env.DASHBOARD_URL || process.env.FRONTEND_BASE_URL || 'https://dash.recrubo.net',
  TEMPLATE_GUEST_TOKEN_SECRET: process.env.TEMPLATE_GUEST_TOKEN_SECRET,
  TEMPLATE_GUEST_TOKEN_TTL_SECONDS: Number(process.env.TEMPLATE_GUEST_TOKEN_TTL_SECONDS || 1800),
  // Redis connection helpers
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: process.env.REDIS_PORT || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  // メール送信設定
  GMAIL_USER: process.env.GMAIL_USER,
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
  NOTIFICATION_EMAIL_TO: process.env.NOTIFICATION_EMAIL_TO,
  ERROR_WEBHOOK_ENABLED: process.env.ERROR_WEBHOOK_ENABLED,
  // その他必要に応じて追加
};
