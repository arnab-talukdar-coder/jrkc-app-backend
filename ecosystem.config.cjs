const path = require('path');

module.exports = {
  apps: [
    {
      name: 'jrkc-backend-prod',
      script: './src/server.js',
      cwd: __dirname, // Critical: ensures dotenv resolves .env from project root
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    },
    {
      name: 'jrkc-backend-test',
      script: './src/server.js',
      cwd: __dirname, // Critical: ensures dotenv resolves .env from project root
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'test',
        PORT: 5001
      },
      env_test: {
        NODE_ENV: 'test',
        PORT: 5001
      }
    }
  ]
};
