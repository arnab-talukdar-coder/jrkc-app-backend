const path = require('path');

module.exports = {
  apps: [
    {
      name: 'jrkc-backend-prod',
      script: './src/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        GMAIL_USER: 'gameboyarnab.talukdar1999@gmail.com',
        GMAIL_APP_PASSWORD: 'crybohbblfigqcqy',
        ADMIN_EMAIL: 'gameboyarnab.talukdar1999@gmail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        GMAIL_USER: 'gameboyarnab.talukdar1999@gmail.com',
        GMAIL_APP_PASSWORD: 'crybohbblfigqcqy',
        ADMIN_EMAIL: 'gameboyarnab.talukdar1999@gmail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      }
    },
    {
      name: 'jrkc-backend-test',
      script: './src/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'test',
        PORT: 5000,
        GMAIL_USER: 'gameboyarnab.talukdar1999@gmail.com',
        GMAIL_APP_PASSWORD: 'crybohbblfigqcqy',
        ADMIN_EMAIL: 'gameboyarnab.talukdar1999@gmail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      },
      env_test: {
        NODE_ENV: 'test',
        PORT: 5000,
        GMAIL_USER: 'gameboyarnab.talukdar1999@gmail.com',
        GMAIL_APP_PASSWORD: 'crybohbblfigqcqy',
        ADMIN_EMAIL: 'gameboyarnab.talukdar1999@gmail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      }
    }
  ]
};
