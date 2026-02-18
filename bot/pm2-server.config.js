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
        FAILOVER_ENABLED: "false"
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
        FAILOVER_ENABLED: "false"
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
