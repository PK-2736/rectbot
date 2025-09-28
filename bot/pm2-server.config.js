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
      }
    }
  ]
};
