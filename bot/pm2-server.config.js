module.exports = {
  apps: [
    {
      name: 'rectbot-server',
      script: './server.js',
      cwd: __dirname,
      env: {
        PORT: process.env.PORT || 3000,
        BACKEND_API_URL: process.env.BACKEND_API_URL || 'https://api.rectbot.tech',
        REDIS_HOST: process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.REDIS_PORT || 6379,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
        REDIS_DB: process.env.REDIS_DB || 0,
  DEPLOY_SECRET: process.env.DEPLOY_SECRET || '',
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
        CLEANUP_WEBHOOK_URL: process.env.CLEANUP_WEBHOOK_URL || '',
  // Internal secret used to authenticate Worker->Origin requests
  INTERNAL_SECRET: process.env.INTERNAL_SECRET || '',
  // Token used by Express to call backend Worker (if Worker enforces SERVICE_TOKEN)
  SERVICE_TOKEN: process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '',
  BACKEND_SERVICE_TOKEN: process.env.BACKEND_SERVICE_TOKEN || process.env.SERVICE_TOKEN || '',
  // Redis TTL / cleanup settings
  REDIS_RECRUIT_TTL_SECONDS: process.env.REDIS_RECRUIT_TTL_SECONDS || 28800,
  CLEANUP_INTERVAL_MS: process.env.CLEANUP_INTERVAL_MS || 1000 * 60 * 60,
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'production',
  // Optional alternate backend URL key
  BACKEND_URL: process.env.BACKEND_URL || process.env.BACKEND_API_URL || 'https://api.rectbot.tech'
      }
    }
  ]
};
