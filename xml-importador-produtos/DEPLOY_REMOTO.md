# 🚀 GUIA DE DEPLOY EM SERVIDOR REMOTO

## Opção 1: Deploy em VPS Linux (Recomendado - $5-10/mês)

### Pré-requisitos
- Servidor Linux (Ubuntu 20.04+ recomendado)
- Acesso SSH
- Domínio (opcional)

### Provedores Recomendados
- **DigitalOcean** - Droplet (muito simples)
- **Linode** - Linode
- **Vultr** - Cloud Compute
- **AWS** - EC2 (free tier)
- **Hetzner** - Cloud Server (barato)

---

## Passo 1: Conectar ao Servidor

```bash
# No seu computador
ssh root@seu-ip-do-servidor

# Ou com usuário
ssh usuario@seu-ip-do-servidor
```

---

## Passo 2: Preparar o Servidor

```bash
# Atualizar sistema
sudo apt update
sudo apt upgrade -y

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalação
node --version
npm --version

# Instalar Git
sudo apt install -y git

# Instalar PM2 (gerenciador de processo)
sudo npm install -g pm2

# Instalar Nginx (webserver + reverse proxy)
sudo apt install -y nginx

# Verificar instalação
nginx -v
```

---

## Passo 3: Clonar o Projeto

```bash
# Criar pasta de aplicação
mkdir -p /var/www
cd /var/www

# Clonar seu repositório Git
# Opção A: Se tem GitHub
git clone https://github.com/seu-usuario/xml-importador-produtos.git

# Opção B: Se não tem Git, copiar manualmente via SCP
# Do seu computador:
scp -r xml-importador-produtos usuario@seu-ip:/var/www/

# Entrar na pasta
cd xml-importador-produtos
```

---

## Passo 4: Instalar Dependências

```bash
# Backend
cd backend
npm install --production
cd ..

# Frontend
cd frontend
npm install --production

# Build do frontend
npm run build
cd ..
```

---

## Passo 5: Configurar PM2 para Backend

```bash
# Criar arquivo de configuração
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: "xml-importador-backend",
      script: "./src/server.js",
      cwd: "/var/www/xml-importador-produtos/backend",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      },
      restart_delay: 4000,
      max_memory_restart: "500M"
    }
  ]
};
EOF

# Iniciar com PM2
pm2 start ecosystem.config.js

# Fazer autostart
pm2 startup
pm2 save
```

---

## Passo 6: Configurar Nginx

```bash
# Criar config do Nginx
sudo tee /etc/nginx/sites-available/default > /dev/null << 'EOF'
upstream backend {
    server localhost:3001;
    server localhost:3001;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    # Frontend - arquivos estáticos
    location / {
        root /var/www/xml-importador-produtos/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 100M;
}
EOF

# Verificar sintaxe
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## Passo 7: Acessar a Aplicação

Na o navegador:
```
http://seu-ip-do-servidor
```

---

## Passo 8: Configurar SSL (HTTPS) - Recomendado

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Gerar certificado (substitua seu domínio)
sudo certbot --nginx -d seu-dominio.com

# Auto-renew
sudo systemctl enable certbot.timer
```

---

## Monitoramento & Manutenção

### Verificar Status

```bash
# Ver processos PM2
pm2 status

# Ver logs
pm2 logs xml-importador-backend

# Ver recursos
pm2 monit
```

### Backup do Banco de Dados

```bash
# Backup do SQLite
cp backend/data/database.db backup-$(date +%Y%m%d-%H%M%S).db

# Ou agendar backup automático
crontab -e

# Adicione (backup diário às 2 AM):
0 2 * * * cp /var/www/xml-importador-produtos/backend/data/database.db /var/www/backups/db-$(date +\%Y\%m\%d).db
```

### Atualizar Aplicação

```bash
cd /var/www/xml-importador-produtos

# Pull do Git
git pull

# Rebuild frontend
cd frontend
npm run build
cd ..

# Restart backend
pm2 restart xml-importador-backend
```

---

## Opção 2: Deploy em Heroku (Mais Fácil - Gratuito com limitações)

### Preparar Repositório

```bash
# Criar arquivo Procfile
cat > Procfile << 'EOF'
web: cd backend && npm start
EOF

# Criar .gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
dist/
build/
data/
uploads/
*.log
EOF

# Commitar
git add .
git commit -m "Production ready"
```

### Deploy

```bash
# Instalar Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

heroku login
heroku create seu-app-name
git push heroku main

# Ver logs
heroku logs --tail
```

---

## Opção 3: Deploy em Railway (Muito Simples)

1. Vá para https://railway.app
2. Clique "New Project"
3. Selecione "Deploy from GitHub"
4. Autorize sua conta GitHub
5. Selecione o repositório
6. Clique "Deploy"

Pronto! Railway detecta Node.js automaticamente.

---

## Opção 4: Deploy em Render (Gratuito)

1. Vá para https://render.com
2. Clique "New Web Service"
3. Conecte seu GitHub
4. Selecione repositório
5. Configure:
   - **Build Command**: `cd backend && npm install; cd ../frontend && npm install && npm run build`
   - **Start Command**: `cd backend && npm start`
6. Deploy automático!

---

## Opção 5: Docker (Para Qualquer Servidor)

### Criar Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN cd backend && npm install --production && cd ..
RUN cd frontend && npm install --production && npm run build && cd ..

COPY . .

EXPOSE 3001

CMD ["npm", "--prefix", "backend", "start"]
```

### Criar docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "80:3001"
    environment:
      - NODE_ENV=production
    volumes:
      - ./backend/data:/app/backend/data
    restart: always
```

### Rodar

```bash
docker-compose up -d
```

---

## Comparação de Opções

| Opção | Custo | Facilidade | Performance | Melhor Para |
|-------|-------|-----------|-------------|-----------|
| VPS Linux | $5-20/mês | Média | Excelente | Produção profissional |
| Heroku | Grátis/Pago | Muito Fácil | Boa | Testes/Hobby |
| Railway | Grátis/Pago | Muito Fácil | Excelente | Rápido setup |
| Render | Grátis/Pago | Muito Fácil | Boa | Simplificado |
| Docker | Variável | Difícil | Excelente | Escalável |

---

## Checklist Final

- [ ] Servidor preparado (Node.js + npm + git)
- [ ] Projeto clonado/copiado
- [ ] Dependências instaladas
- [ ] Build do frontend realizado
- [ ] Backend rodando com PM2
- [ ] Nginx configurado
- [ ] Banco de dados criado
- [ ] HTTPS configurado (SSL)
- [ ] Domínio apontando para IP
- [ ] Backup configurado
- [ ] Monitoramento ativo

---

## Troubleshooting Deploy

### Erro: "Port 3001 already in use"
```bash
# Verificar portas
sudo netstat -tulpn
# Matar processo
sudo kill -9 <PID>
```

### Erro: "Cannot find module"
```bash
npm install --production
```

### Erro: Nginx 502 Bad Gateway
```bash
# Verificar se backend está rodando
pm2 status
# Ver logs
pm2 logs
# Restart
pm2 restart all
```

### Erro: "Permission denied"
```bash
sudo chown -R $USER:$USER /var/www/xml-importador-produtos
chmod -R 755 /var/www/xml-importador-produtos
```

---

## URLs Finais

Após deploy:
- Frontend: `https://seu-dominio.com`
- API: `https://seu-dominio.com/api`

---

## Próximos Passos

1. Escolha a opção que se encaixa melhor
2. Siga os passos
3. Teste em http://seu-ip ou seu-dominio.com
4. Configure SSL/HTTPS
5. Monitore com PM2 ou Dashboard do provider

Good luck! 🚀
