# Deploy VPS Automático Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar deploy automático: cada push na branch `main` roda os testes e faz deploy na VPS via GitHub Actions + SSH.

**Architecture:** GitHub Actions abre SSH na VPS, roda `git pull + npm ci + build web + pm2 restart`. nginx serve HTTPS em `agentebling.canastrainteligencia.com`, proxy para Express :3000 (PM2). Express serve tanto a API quanto o React buildado.

**Tech Stack:** GitHub Actions (`appleboy/ssh-action`), PM2, nginx, certbot/Let's Encrypt.

**Pré-requisito:** executar o plano `2026-08-01-canal-telegram.md` primeiro (ou em paralelo, pois são independentes a nível de código).

---

### Task 1: Mover tsx para dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

O script `npm start` usa `tsx`. Se estiver em `devDependencies`, `npm ci --omit=dev` na VPS quebraria o start.

- [ ] **Step 1: Editar package.json**

Em `package.json`, mover a linha `"tsx": "^4.19.2"` do bloco `devDependencies` para o bloco `dependencies`. Apenas esta linha muda — não alterar versões de outras dependências.

Antes (em `devDependencies`):
```json
"tsx": "^4.19.2",
```

Depois (em `dependencies`):
```json
"tsx": "^4.19.2",
```

- [ ] **Step 2: Atualizar lock file**

```bash
npm install
```

- [ ] **Step 3: Verificar que npm start funciona**

```bash
npm test
```

Esperado: todos os testes passam.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix: move tsx para dependencies (necessário para npm start na VPS)"
```

---

### Task 2: Corrigir web/.env.production

**Files:**
- Modify: `web/.env.production`

`VITE_API_BASE` aponta para ngrok de dev. Com frontend e backend na mesma origem (VPS), o valor correto é vazio — o frontend passa a usar `/api/...` (URL relativa).

- [ ] **Step 1: Editar web/.env.production**

Substituir o conteúdo do arquivo por:

```
# VITE_API_BASE vazio = frontend e backend na mesma origem (VPS).
# Todas as chamadas de API usam URLs relativas (/api/...).
VITE_API_BASE=
```

- [ ] **Step 2: Commit**

```bash
git add web/.env.production
git commit -m "fix: VITE_API_BASE vazio para deploy same-origin na VPS"
```

---

### Task 3: Adicionar ecosystem.config.cjs

**Files:**
- Create: `ecosystem.config.cjs`

PM2 usa este arquivo para nomear o processo, garantir autorestart, e persistir entre reboots da VPS.

- [ ] **Step 1: Criar na raiz do projeto**

Criar `ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: "agente-bling",
      script: "./node_modules/.bin/tsx",
      args: "src/bootstrap.ts",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add ecosystem.config.cjs
git commit -m "chore: adiciona ecosystem.config.cjs para PM2"
```

---

### Task 4: Adicionar .github/workflows/deploy.yml

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Criar a pasta e o workflow**

```bash
mkdir -p .github/workflows
```

No Windows PowerShell:
```powershell
New-Item -ItemType Directory -Force .github/workflows
```

- [ ] **Step 2: Criar .github/workflows/deploy.yml**

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

      - name: Instalar dependências
        run: npm ci

      - name: Rodar testes
        run: npm test

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
            pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
            pm2 save
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: GitHub Actions — testa e deploya na VPS a cada push em main"
```

---

### Task 5: Adicionar configuração nginx

**Files:**
- Create: `docs/nginx-agente-bling.conf`

Salvar no repo para referência — o arquivo será copiado para a VPS durante o setup inicial.

- [ ] **Step 1: Criar docs/nginx-agente-bling.conf**

```nginx
# /etc/nginx/sites-available/agente-bling
# Colocar em: sudo cp docs/nginx-agente-bling.conf /etc/nginx/sites-available/agente-bling
# Ativar com: sudo ln -s /etc/nginx/sites-available/agente-bling /etc/nginx/sites-enabled/
# HTTPS: sudo certbot --nginx -d agentebling.canastrainteligencia.com

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
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # SSE: respostas do agente são streaming — não bufferizar
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add docs/nginx-agente-bling.conf
git commit -m "docs: adiciona config nginx para VPS (agentebling.canastrainteligencia.com)"
```

---

### Task 6: Atualizar README com seção de deploy na VPS

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Adicionar seção de deploy VPS após a seção de desenvolvimento**

Adicionar após a seção `## Modo desenvolvimento` (ou ao final do README, antes de `## O que dá para perguntar`):

````markdown
## Deploy na VPS (agentebling.canastrainteligencia.com)

Cada push na branch `main` dispara o deploy automático via GitHub Actions.

### Setup inicial da VPS (uma única vez)

```bash
# 1. Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. PM2
sudo npm install -g pm2
pm2 startup systemd
# → copie e execute o comando impresso pelo pm2 startup

# 3. nginx + certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 4. Clone do repositório
cd /home/ubuntu
git clone https://github.com/Kmzf777/agente-bling.git agente-bling
cd agente-bling

# 5. Variáveis de ambiente
cp .env.example .env
# → editar .env com as credenciais reais (ver tabela abaixo)
nano .env

# 6. Autenticação Bling (uma única vez)
npm run bling:auth
# → siga a URL impressa, autorize no Bling; .bling-tokens.json é gerado

# 7. Primeiro build e start
npm ci
npm --prefix web install && npm --prefix web run build
pm2 start ecosystem.config.cjs
pm2 save

# 8. nginx
sudo cp docs/nginx-agente-bling.conf /etc/nginx/sites-available/agente-bling
sudo ln -s /etc/nginx/sites-available/agente-bling /etc/nginx/sites-enabled/
sudo certbot --nginx -d agentebling.canastrainteligencia.com
sudo nginx -t && sudo systemctl reload nginx
```

### Variáveis adicionais no .env de produção

| Variável | Valor em produção |
|---|---|
| `BLING_REDIRECT_URI` | `https://agentebling.canastrainteligencia.com/api/bling/callback` |
| `APP_URL` | `https://agentebling.canastrainteligencia.com` |
| `CORS_ORIGIN` | `https://agentebling.canastrainteligencia.com` |

### GitHub Secrets necessários

Configure em **Settings → Secrets and variables → Actions** do repositório:

| Secret | Descrição |
|---|---|
| `VPS_HOST` | IP público da VPS |
| `VPS_USER` | usuário SSH (ex.: `ubuntu`) |
| `VPS_SSH_KEY` | conteúdo da chave privada SSH (começa com `-----BEGIN`) |
| `VPS_APP_PATH` | caminho do repo na VPS (ex.: `/home/ubuntu/agente-bling`) |

### Rollback manual

```bash
# Na VPS:
cd /home/ubuntu/agente-bling
git log --oneline -5          # ver commits
git checkout <hash-anterior>   # voltar para versão anterior
pm2 restart agente-bling
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: adiciona seção de deploy VPS com setup inicial e GitHub Secrets"
```

---

### Task 7: Verificação final e push

- [ ] **Step 1: Rodar toda a suíte de testes**

```bash
npm test
```

Esperado: todos os testes passam.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 3: Push para main (dispara o primeiro workflow)**

```bash
git push origin main
```

- [ ] **Step 4: Verificar o workflow no GitHub**

Acesse `https://github.com/Kmzf777/agente-bling/actions` e confirme:
- Job "Instalar dependências" → verde
- Job "Rodar testes" → verde
- Job "Deploy via SSH" → vermelho (esperado: os Secrets VPS ainda não estão configurados)

O workflow vai falhar no step SSH até os Secrets serem adicionados no GitHub. Isso é correto — o código está pronto; o setup da VPS é o próximo passo operacional.
