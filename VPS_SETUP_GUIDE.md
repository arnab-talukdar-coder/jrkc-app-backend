# VPS Complete Setup Guide: Dual Environments (Production & Test)

This guide provides step-by-step instructions to configure a single Linux VPS (Ubuntu 22.04 / 24.04 LTS) to host **two independent environments** (Production and Test) for the JRKC HR Backend on **`jrkcrail.com`**, with PM2, Nginx, SSL, Database separation, and automated GitHub Actions deployment.

---

## 🌐 Step 0: DNS Records for `jrkcrail.com`

Your VPS IP address: `187.127.152.233`

Add the following two **A Records** in your domain management panel:

| Type | Name | Full Hostname | Value / Points To | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `api` | `api.jrkcrail.com` | `187.127.152.233` | Production Backend API |
| **A** | `api-test` | `api-test.jrkcrail.com` | `187.127.152.233` | Test/Staging Backend API |

---

## 🗄️ Database Architecture (Dual Database Setup)

To keep Production and Test data completely isolated on the same VPS:

| Environment | Database Engine | Database Name | Connection URI |
| :--- | :--- | :--- | :--- |
| **Production** | MongoDB or PostgreSQL | `jrkc_hr_prod` | `mongodb://localhost:27017/jrkc_hr_prod` |
| **Test / Staging** | MongoDB or PostgreSQL | `jrkc_hr_test` | `mongodb://localhost:27017/jrkc_hr_test` |

---

## Step 1: Initial VPS Server Setup & Database Installation

SSH into your VPS:
```bash
ssh root@187.127.152.233
```

### 1. Update system packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw nginx certbot python3-certbot-nginx
```

### 2. Install Node.js 20 LTS & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2
sudo pm2 startup
```

### 3. Install Database (Option A: MongoDB or Option B: PostgreSQL)

#### Option A: Install MongoDB Community Server on Ubuntu
```bash
sudo apt install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

#### Option B: Install PostgreSQL on Ubuntu
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE DATABASE jrkc_hr_prod;"
sudo -u postgres psql -c "CREATE DATABASE jrkc_hr_test;"
```

### 4. Configure Firewall (UFW)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## Step 2: Set Up Directories & Environment Variables (`.env`)

Create separate project folders:

```bash
sudo mkdir -p /var/www/jrkc-backend-prod
sudo mkdir -p /var/www/jrkc-backend-test
sudo chown -R $USER:$USER /var/www/jrkc-backend-prod
sudo chown -R $USER:$USER /var/www/jrkc-backend-test
```

### 1. Production Environment File (`/var/www/jrkc-backend-prod/.env`)
```bash
cat << 'EOF' > /var/www/jrkc-backend-prod/.env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/jrkc_hr_prod
DATABASE_URL=mongodb://localhost:27017/jrkc_hr_prod
EOF
```

### 2. Test Environment File (`/var/www/jrkc-backend-test/.env`)
```bash
cat << 'EOF' > /var/www/jrkc-backend-test/.env
PORT=5001
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/jrkc_hr_test
DATABASE_URL=mongodb://localhost:27017/jrkc_hr_test
EOF
```

---

## Step 3: Clone & Launch PM2 Processes

**Production (`dev-prod` branch):**
```bash
cd /var/www/jrkc-backend-prod
git clone https://github.com/YOUR_GITHUB_USERNAME/jrkc-app-backend.git .
git checkout -b dev-prod origin/dev-prod || git checkout dev-prod
npm ci --only=production
pm2 start ecosystem.config.cjs --only jrkc-backend-prod --env production
```

**Test (`dev-test` branch):**
```bash
cd /var/www/jrkc-backend-test
git clone https://github.com/YOUR_GITHUB_USERNAME/jrkc-app-backend.git .
git checkout -b dev-test origin/dev-test || git checkout dev-test
npm ci --only=production
pm2 start ecosystem.config.cjs --only jrkc-backend-test --env test
```

Save PM2 processes to survive server reboots:
```bash
pm2 save
```

---

## Step 4: Configure Nginx & SSL (Certbot)

### 1. Create Nginx Site Configuration (`/etc/nginx/sites-available/jrkc-backend`)
```nginx
# PRODUCTION
server {
    listen 80;
    server_name api.jrkcrail.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# TEST / STAGING
server {
    listen 80;
    server_name api-test.jrkcrail.com;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable & restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/jrkc-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 2. Generate Free SSL Certificates
```bash
sudo certbot --nginx -d api.jrkcrail.com -d api-test.jrkcrail.com
```

---

## Step 5: Configure GitHub Actions SSH Deployment

Generate SSH key pair on VPS:
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy
```

Add secrets in **Backend GitHub Repository** (`Settings > Secrets and variables > Actions`):
- `VPS_HOST`: `187.127.152.233`
- `VPS_USERNAME`: `root`
- `VPS_SSH_KEY`: (private key output)
- `VPS_PORT`: `22`
- `VPS_PROD_PATH`: `/var/www/jrkc-backend-prod`
- `VPS_TEST_PATH`: `/var/www/jrkc-backend-test`
