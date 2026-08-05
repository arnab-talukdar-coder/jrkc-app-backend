const path = require('path');

module.exports = {
  apps: [
    {
      name: 'jrkc-backend-prod',
      script: './src/server.js',
      exec_mode: 'fork',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        SMTP_HOST: 'cad.crystalregistry.com',
        SMTP_PORT: 465,
        SMTP_SECURE: 'true',
        GMAIL_USER: 'cmd@jrkcrail.com',
        GMAIL_APP_PASSWORD: 'Abhishek@09',
        ADMIN_EMAIL: 'cmd@jrkcrail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        SMTP_HOST: 'cad.crystalregistry.com',
        SMTP_PORT: 465,
        SMTP_SECURE: 'true',
        GMAIL_USER: 'cmd@jrkcrail.com',
        GMAIL_APP_PASSWORD: 'Abhishek@09',
        ADMIN_EMAIL: 'cmd@jrkcrail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      }
    },
    {
      name: 'jrkc-backend-test',
      script: './src/server.js',
      exec_mode: 'fork',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'test',
        PORT: 5001,
        GMAIL_USER: 'gameboyarnab.talukdar1999@gmail.com',
        GMAIL_APP_PASSWORD: 'crybohbblfigqcqy',
        ADMIN_EMAIL: 'gameboyarnab.talukdar1999@gmail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      },
      env_test: {
        NODE_ENV: 'test',
        PORT: 5001,
        GMAIL_USER: 'gameboyarnab.talukdar1999@gmail.com',
        GMAIL_APP_PASSWORD: 'crybohbblfigqcqy',
        ADMIN_EMAIL: 'gameboyarnab.talukdar1999@gmail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      }
    },
    {
      name: 'jrkc-backend-dev-prod',
      script: './src/server.js',
      exec_mode: 'fork',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
        GMAIL_USER: 'cmd@jrkcrail.com',
        GMAIL_APP_PASSWORD: 'Abhishek@09',
        ADMIN_EMAIL: 'cmd@jrkcrail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5002,
        GMAIL_USER: 'cmd@jrkcrail.com',
        GMAIL_APP_PASSWORD: 'Abhishek@09',
        ADMIN_EMAIL: 'cmd@jrkcrail.com',
        SENDER_NAME: 'JRKC Rail Infra'
      }
    }
  ]
};
