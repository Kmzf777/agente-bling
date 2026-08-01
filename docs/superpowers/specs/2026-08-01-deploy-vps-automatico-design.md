---
title: Deploy Automático VPS via GitHub Actions
date: 2026-08-01
status: approved
---

# Deploy Automático VPS via GitHub Actions

## Objetivo

Cada push na branch `main` do GitHub dispara um deploy automático na VPS, sem intervenção manual. O domínio `agentebling.canastrainteligencia.com` serve tanto a API quanto o frontend React (Express serve `web/dist/` como SPA).

## Arquitetura

```
push → main
  └─ GitHub Actions (ubuntu-latest)
       ├─ npm ci + npm test          (cancela se testes falham)
       └─ SSH → VPS
            ├─ git pull origin main
            ├─ npm ci
            ├─ npm --prefix web install
            ├─ npm --prefix web run build
            └─ pm2 restart agente-bling

VPS Ubuntu 22.04
  nginx :443 (HTTPS, certbot) → Express :3000
    ├─ /api/*          → agente Bling (Node + tsx via PM2)
    └─ /*              → React SPA (web/dist/index.html)

  docker-compose (independente, não reiniciado pelo CI):
    Usado apenas para serviços auxiliares futuros
    (Evolution API removida; docker-compose.yml deletado neste sprint)
```

## Correções no repositório

### 1. `tsx` → mover para `dependencies`
`npm start` usa `tsx`. Hoje está em `devDependencies`; `npm ci --omit=dev` quebraria. Mover para `dependencies` resolve.

### 2. `web/.env.production` → `VITE_API_BASE=` (vazio)
Frontend e backend ficam na mesma origem. `API_BASE` vira `""` e todas as chamadas usam `/api/...` (URL relativa). Nenhuma configuração de domínio hardcoded no repo.

### 3. `ecosystem.config.cjs` na raiz
PM2 usa este arquivo para nomear o processo e garantir restart automático após reboot da VPS.

```js
module.exports = {
  apps: [{
    name: "agente-bling",
    script: "./node_modules/.bin/tsx",
    args: "src/bootstrap.ts",
    autorestart: true,
    env: { NODE_ENV: "production" },
  }],
};
```

## Workflow GitHub Actions

Arquivo: `.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm test
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd ${{ secrets.VPS_APP_PATH }}
            git pull origin main
            npm ci
            npm --prefix web install
            npm --prefix web run build
            pm2 restart ecosystem.config.cjs --update-env || \
              pm2 start ecosystem.config.cjs
            pm2 save
```

## GitHub Secrets necessários

| Secret | Exemplo |
|---|---|
| `VPS_HOST` | `123.45.67.89` |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_KEY` | conteúdo da chave privada SSH (começa com `-----BEGIN`) |
| `VPS_APP_PATH` | `/home/ubuntu/agente-bling` |

## nginx — `/etc/nginx/sites-available/agente-bling`

```nginx
server {
    listen 80;
    server_name agentebling.canastrainteligencia.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name agentebling.canastrainteligencia.com;

    ssl_certificate     /etc/letsencrypt/live/agentebling.canastrainteligencia.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agentebling.canastrainteligencia.com/privkey.pem;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;

        # SSE (streaming de respostas do agente)
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }
}
```

## VPS — setup inicial (uma única vez)

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2
pm2 startup systemd   # segue a instrução impressa no console

# nginx + certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Clone do repo
cd /home/ubuntu
git clone https://github.com/Kmzf777/agente-bling.git agente-bling
cd agente-bling
cp .env.example .env   # preencher manualmente

# Tokens Bling (uma vez)
npm run bling:auth

# Primeiro start
npm ci
npm --prefix web install && npm --prefix web run build
pm2 start ecosystem.config.cjs
pm2 save

# nginx
sudo cp /home/ubuntu/agente-bling/docs/nginx-agente-bling.conf /etc/nginx/sites-available/agente-bling
sudo ln -s /etc/nginx/sites-available/agente-bling /etc/nginx/sites-enabled/
sudo certbot --nginx -d agentebling.canastrainteligencia.com
sudo nginx -t && sudo systemctl reload nginx
```

## `.env` de produção — variáveis adicionais ao exemplo

```
BLING_REDIRECT_URI=https://agentebling.canastrainteligencia.com/api/bling/callback
APP_URL=https://agentebling.canastrainteligencia.com
```

## Fluxo de rollback

Se o deploy quebrar: na VPS, `git log --oneline` → `git checkout <commit anterior>` → `pm2 restart agente-bling`. O workflow do GitHub mostra o log completo de cada step, facilitando o diagnóstico.

## Fora do escopo

- DNS (usuário aponta o subdomínio para o IP da VPS)
- Renovação do certificado SSL (certbot cron automático)
- Monitoramento/alertas de uptime
