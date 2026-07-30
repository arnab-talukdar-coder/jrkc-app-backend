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
        PORT: 5000
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
        PORT: 5001
      }
    },
    {
      name: 'jrkc-v2-backend-prod',
      script: './src/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5002
      }
    },
    {
      name: 'jrkc-v2-backend-test',
      script: './src/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'test',
        PORT: 5003
      }
    }
  ]
};
