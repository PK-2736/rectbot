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
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || 'MTA0ODk1MDIwMTk3NDU0MjQ3Nw.Go-lzO.47nonv6LiIxpvGGYW89imcQ82c37SJdlBmOq24',
        CLEANUP_WEBHOOK_URL: process.env.CLEANUP_WEBHOOK_URL || '',
  // Internal secret used to authenticate Worker->Origin requests
  INTERNAL_SECRET: process.env.INTERNAL_SECRET || '862cf90b910da363c1f727715988c494eac3ed4518fba7b2e19454e4461031ef786f3f922614a864a28a9f06cce6d9c4',
  // Token used by Express to call backend Worker (if Worker enforces SERVICE_TOKEN)
  SERVICE_TOKEN: process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || 'JYmyGe/m/UuwDl1x2duSKHFRCTgTz4JstBATo+ZM7go=',
  BACKEND_SERVICE_TOKEN: process.env.BACKEND_SERVICE_TOKEN || process.env.SERVICE_TOKEN || 'JYmyGe/m/UuwDl1x2duSKHFRCTgTz4JstBATo+ZM7go=',
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
