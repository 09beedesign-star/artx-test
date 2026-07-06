module.exports = {
  apps: [
    {
      name: "artx-backstage",
      cwd: "/var/www/artx-backstage/current",
      script: "dist/index.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1024M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3000",
        ARTX_DATA_DIR: "/var/lib/artx",
        ARTX_UPLOADS_DIR: "/var/lib/artx/uploads",
        ARTX_ADMIN_DATA_BACKEND: "json",
        ARTX_AUTH_DATA_BACKEND: "json",
      },
      error_file: "/var/log/artx/artx-backstage-error.log",
      out_file: "/var/log/artx/artx-backstage-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
