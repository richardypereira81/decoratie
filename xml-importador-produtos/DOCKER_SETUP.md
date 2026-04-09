# 🐳 Docker Setup para Deploy (Pronto para Copiar/Colar)

## Arquivo 1: Dockerfile (Crie na raiz do projeto)

```dockerfile
# Dockerfile
FROM node:18-alpine AS build

WORKDIR /app

# Copiar package.json
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Instalar dependências do backend
WORKDIR /app/backend
RUN npm install --production

# Instalar dependências e buildar frontend
WORKDIR /app/frontend
RUN npm install && npm run build

# Estágio final
FROM node:18-alpine

WORKDIR /app

# Copiar backend
COPY backend/package*.json ./backend/
COPY backend/src ./backend/src

# Instalar dependências do backend
WORKDIR /app/backend
RUN npm install --production

# Copiar frontend build
COPY --from=build /app/frontend/dist ./frontend/dist

# Criar pastas necessárias
RUN mkdir -p data uploads

WORKDIR /app
EXPOSE 3001

CMD ["npm", "--prefix", "backend", "start"]
```

## Arquivo 2: docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:3001"        # HTTP
      - "443:3001"       # HTTPS (via Nginx)
    environment:
      - NODE_ENV=production
      - PORT=3001
    volumes:
      - ./data:/app/backend/data              # Persistência de BD
      - ./uploads:/app/backend/uploads        # Persistência de uploads
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Opcional: Nginx na frente para HTTPS
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: always
```

## Arquivo 3: nginx.conf (Certificado SSL)

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    upstream backend {
        server app:3001;
    }

    # Redirecionar HTTP para HTTPS
    server {
        listen 80;
        server_name _;

        # Certbot challenge
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # Redirecionar tudo para HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS
    server {
        listen 443 ssl http2;
        server_name _;

        # Certificados SSL
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # Configurações SSL
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Gzip compression
        gzip on;
        gzip_vary on;
        gzip_proxied any;
        gzip_comp_level 6;
        gzip_types text/plain text/css text/xml text/javascript 
                   application/json application/javascript application/xml+rss 
                   application/rss+xml font/truetype font/opentype 
                   application/vnd.ms-fontobject image/svg+xml;

        # Frontend - arquivos estáticos
        location / {
            root /app/frontend/dist;
            try_files $uri $uri/ /index.html;
            expires 1h;
            add_header Cache-Control "public, max-age=3600";
            
            limit_req zone=general burst=20 nodelay;
        }

        # API Backend
        location /api/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $server_name;
            
            proxy_cache_bypass $http_upgrade;
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
            
            # Rate limiting para API
            limit_req zone=api burst=50 nodelay;
        }

        # Health check
        location /health {
            proxy_pass http://backend;
            access_log off;
        }
    }
}
```

---

## Como Usar (Copie/Cole)

### 1️⃣ Criar Dockerfile e docker-compose.yml

```bash
# Na raiz de xml-importador-produtos

# Copiar Dockerfile
cat > Dockerfile << 'EOF'
# (Conteúdo acima)
EOF

# Copiar docker-compose.yml
cat > docker-compose.yml << 'EOF'
# (Conteúdo acima)
EOF
```

### 2️⃣ No Servidor (VPS/Cloud)

```bash
# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verificar instalações
docker --version
docker-compose --version

# Clonar projeto
cd /opt
git clone https://github.com/seu-usuario/xml-importador-produtos.git
cd xml-importador-produtos

# Rodar com docker-compose
sudo docker-compose up -d

# Ver logs
sudo docker-compose logs -f app
```

### 3️⃣ Configurar SSL (Let's Encrypt)

```bash
# Criar pasta para certificados
mkdir -p ssl

# Gerar certificado auto-assinado (temporário)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem \
  -subj "/C=BR/ST=SP/L=Sao Paulo/O=Seu Negocio/CN=seu-dominio.com"

# Depois, instalar Certbot para renovação automática
sudo apt install certbot
sudo certbot certonly --standalone -d seu-dominio.com

# Copiar certificados
sudo cp /etc/letsencrypt/live/seu-dominio.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/seu-dominio.com/privkey.pem ssl/key.pem

# Restart Docker
sudo docker-compose restart
```

---

## Estrutura de Pastas Esperada

```
xml-importador-produtos/
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── ssl/
│   ├── cert.pem
│   └── key.pem
├── backend/
├── frontend/
└── ...
```

---

## Comandos Docker Úteis

```bash
# Ver status
sudo docker-compose ps

# Ver logs em tempo real
sudo docker-compose logs -f

# Parar tudo
sudo docker-compose down

# Remover volume (cuidado com dados!)
sudo docker-compose down -v

# Rebuild após mudanças
sudo docker-compose build --no-cache
sudo docker-compose up -d

# Executar comando dentro do container
sudo docker-compose exec app npm status

# Backup do banco
sudo docker-compose exec app cp backend/data/database.db backup-$(date +%Y%m%d-%H%M%S).db
```

---

## Monitoramento em Produção

### Ver Recursos Usados
```bash
docker stats
```

### Ver Logs de Erro
```bash
sudo docker-compose logs app --tail 100
```

### Health Check
```bash
curl https://seu-dominio.com/health
```

---

## Escalar para Múltiplas Instâncias

```yaml
# Adicionar em docker-compose.yml
services:
  app:
    deploy:
      replicas: 3  # 3 instâncias
```

Rodar:
```bash
sudo docker-compose -f docker-compose.yml up -d
```

---

## CI/CD com GitHub Actions (Automático)

Criar `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/xml-importador-produtos
            git pull
            sudo docker-compose build --no-cache
            sudo docker-compose up -d
```

---

## Resumo das Opções

### 🐳 Docker (Recomendado para Produção)
✅ Fácil escalar  
✅ Mesma em todos os servidores  
✅ Isolado  
❌ Um pouco mais complexo no início

### 📦 Node.js Puro + PM2
✅ Simples  
✅ Direto  
❌ Precisa configurar tudo manualmente

### ☁️ Platform as a Service (Heroku, Railway, Render)
✅ Muito fácil  
✅ Deploy automático  
❌ Menos controle  
❌ Pode ser caro

---

**Escolha: Docker + docker-compose é o melhor balanço entre facilidade e profissionalismo!** 🚀

Pronto para deploy? Siga os passos e você terá seu sistema em produção em 10 minutos!
