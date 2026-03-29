module.exports = {
  apps: [
    {
      name: "rectbot-server",
      script: "./src/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        SITE_ID: "oci",
        FAILOVER_ENABLED: "false",
        BACKEND_API_URL: process.env.BACKEND_API_URL,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
        SERVICE_TOKEN: process.env.SERVICE_TOKEN,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        INTERNAL_SECRET: process.env.INTERNAL_SECRET
      },
      error_file: "./logs/server-error.log",
      out_file: "./logs/server-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      exp_backoff_restart_delay: 100
    },
    {
      name: "rectbot-image-worker",
      script: "./src/workers/image-worker.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        SITE_ID: "oci",
        FAILOVER_ENABLED: "false",
        BACKEND_API_URL: process.env.BACKEND_API_URL,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
        SERVICE_TOKEN: process.env.SERVICE_TOKEN,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        INTERNAL_SECRET: process.env.INTERNAL_SECRET
      },
      error_file: "./logs/image-worker-error.log",
      out_file: "./logs/image-worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      exp_backoff_restart_delay: 100
    }
  ]
};
