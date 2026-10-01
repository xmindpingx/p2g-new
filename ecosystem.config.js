// places2go — PM2 Ecosystem (production)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save              ← persist across reboots
//   pm2 startup           ← print the systemd command to run once as root
//
// Both servers read env vars from their own .env file in server/.  Create:
//   server/.env  (gitignored)  — see server/.env.example
//
// Port map:
//   3001  bug-report-server
//   3002  stripe-server

module.exports = {
  apps: [
    {
      name: 'places2go-bug-reports',
      script: './server/bug-report-server.js',
      cwd: '/www/wwwroot/places2go',          // ← adjust to your aaPanel site root
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        BUG_REPORT_PORT: '3001',
        BUG_REPORT_DIR: '/www/wwwroot/places2go/server/bug-reports',
      },
      env_file: '/www/wwwroot/places2go/server/.env',
      error_file: '/www/wwwlogs/places2go-bug-reports-error.log',
      out_file:   '/www/wwwlogs/places2go-bug-reports-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'places2go-stripe',
      script: './server/stripe-server.js',
      cwd: '/www/wwwroot/places2go',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        STRIPE_PORT: '3002',
      },
      env_file: '/www/wwwroot/places2go/server/.env',
      error_file: '/www/wwwlogs/places2go-stripe-error.log',
      out_file:   '/www/wwwlogs/places2go-stripe-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
