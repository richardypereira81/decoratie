#!/bin/bash

################################################################################
#  Importador XML de Produtos - Script de Deploy Automático
#  
#  Script para fazer deploy automático em um servidor VPS/Cloud
#  
#  Uso: ./deploy.sh seu-ip-do-servidor
#  
#  Pré-requisitos no servidor:
#  - Ubuntu/Debian
#  - SSH key configurada
################################################################################

set -e

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configurações
SERVIDOR=${1:-}
USUARIO=${2:-root}
PORTA_SSH=${3:-22}
APP_PATH="/var/www/xml-importador-produtos"
BACKUP_PATH="/var/backups/xml-importador"

################################################################################
# Funções Auxiliares
################################################################################

print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  $1"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC}  $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC}  $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

print_error() {
    echo -e "${RED}✗${NC}  $1"
}

################################################################################
# Validação
################################################################################

if [ -z "$SERVIDOR" ]; then
    print_error "IP do servidor não fornecido!"
    echo ""
    echo "Uso: ./deploy.sh seu-ip-do-servidor [usuario] [porta_ssh]"
    echo ""
    echo "Exemplos:"
    echo "  ./deploy.sh 192.168.1.100"
    echo "  ./deploy.sh 192.168.1.100 ubuntu 2222"
    exit 1
fi

print_header "DEPLOY AUTOMÁTICO - XML Importador de Produtos"

print_info "Servidor: $SERVIDOR"
print_info "Usuário: $USUARIO"
print_info "Porta SSH: $PORTA_SSH"
print_info "Caminho da app: $APP_PATH"

################################################################################
# Passo 1: Testar conexão SSH
################################################################################

print_header "PASSO 1: Testando Conexão SSH"

if ! ssh -p "$PORTA_SSH" "$USUARIO@$SERVIDOR" exit 2>/dev/null; then
    print_error "Não foi possível conectar ao servidor!"
    print_warning "Verifique:"
    print_warning "  - IP está correto"
    print_warning "  - SSH key está configurada"
    print_warning "  - Porta SSH está aberta"
    exit 1
fi

print_success "Conexão SSH OK"

################################################################################
# Passo 2: Preparar o Servidor
################################################################################

print_header "PASSO 2: Preparando o Servidor"

ssh -p "$PORTA_SSH" "$USUARIO@$SERVIDOR" << 'ENDSSH'

print_step() {
    echo "▶  $1"
}

# Atualizar sistema
print_step "Atualizando sistema..."
sudo apt update -qq
sudo apt upgrade -y -qq

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    print_step "Instalando Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - -qq
    sudo apt install -y nodejs -qq
fi

# Instalar dependências
print_step "Instalando dependências..."
sudo apt install -y git curl wget zip unzip -qq

# Verificar se PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    print_step "Instalando PM2..."
    sudo npm install -g pm2 -qq
fi

# Instalar Nginx
if ! command -v nginx &> /dev/null; then
    print_step "Instalando Nginx..."
    sudo apt install -y nginx -qq
    sudo systemctl enable nginx
fi

# Criar pastas
print_step "Criando estrutura de diretórios..."
sudo mkdir -p /var/www
sudo mkdir -p /var/backups/xml-importador
sudo mkdir -p /var/log/xml-importador

# Verificações finais
echo ""
echo "✓ Node.js: $(node --version)"
echo "✓ NPM: $(npm --version)"
echo "✓ PM2: $(pm2 --version)"
echo "✓ Nginx: $(nginx -v 2>&1)"
echo "✓ Git: $(git --version)"

ENDSSH

print_success "Servidor preparado"

################################################################################
# Passo 3: Clonar/Atualizar Projeto
################################################################################

print_header "PASSO 3: Clonando/Atualizando Projeto"

ssh -p "$PORTA_SSH" "$USUARIO@$SERVIDOR" << ENDSSH
if [ -d "$APP_PATH" ]; then
    echo "▶  Atualizando projeto existente..."
    cd "$APP_PATH"
    git pull
else
    echo "▶  Clonando novo projeto..."
    # Ajuste para seu repositório
    git clone https://github.com/seu-usuario/xml-importador-produtos.git "$APP_PATH"
fi
ENDSSH

print_success "Projeto clonado/atualizado"

################################################################################
# Passo 4: Instalar Dependências
################################################################################

print_header "PASSO 4: Instalando Dependências"

ssh -p "$PORTA_SSH" "$USUARIO@$SERVIDOR" << ENDSSH
cd "$APP_PATH"

echo "▶  Backend..."
cd backend
npm install --production
cd ..

echo "▶  Frontend..."
cd frontend
npm install --production
npm run build
cd ..

ENDSSH

print_success "Dependências instaladas"

################################################################################
# Passo 5: Configurar PM2
################################################################################

print_header "PASSO 5: Configurando PM2"

ssh -p "$PORTA_SSH" "$USUARIO@$SERVIDOR" << 'ENDSSH'

APP_PATH="/var/www/xml-importador-produtos"

# Parar instâncias anteriores
pm2 stop xml-importador-backend 2>/dev/null || true
pm2 delete xml-importador-backend 2>/dev/null || true

# Criar configuração
cd "$APP_PATH"
cat > ecosystem.config.js << 'EOL'
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
      error_file: "/var/log/xml-importador/err.log",
      out_file: "/var/log/xml-importador/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      restart_delay: 4000,
      max_memory_restart: "500M",
      merge_logs: true
    }
  ]
};
EOL

# Iniciar com PM2
pm2 start ecosystem.config.js
pm2 save

# Configurar PM2 para autostart
sudo pm2 startup systemd -u root --hp /root
sudo systemctl enable pm2-root

echo "✓ PM2 configurado e iniciado"

ENDSSH

print_success "PM2 configurado"

################################################################################
# Passo 6: Configurar Nginx
################################################################################

print_header "PASSO 6: Configurando Nginx"

ssh -p "$PORTA_SSH" "$USUARIO@$SERVIDOR" << 'ENDSSH'

# Criar configuração do Nginx
sudo tee /etc/nginx/sites-available/default > /dev/null << 'EOL'
upstream backend {
    server localhost:3001 max_fails=3 fail_timeout=30s;
    server localhost:3001 max_fails=3 fail_timeout=30s;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Logs
    access_log /var/log/nginx/xml-importador-access.log;
    error_log /var/log/nginx/xml-importador-error.log;

    # Frontend - arquivos estáticos
    location / {
        root /var/www/xml-importador-produtos/frontend/dist;
        try_files $uri $uri/ /index.html;
        expires 6h;
        add_header Cache-Control "public, max-age=21600";
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
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        proxy_pass http://backend;
        access_log off;
    }

    client_max_body_size 100M;
}
EOL

# Testar configuração
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx

echo "✓ Nginx configurado e reiniciado"

ENDSSH

print_success "Nginx configurado"

################################################################################
# Passo 7: Configurar Backup Automático
################################################################################

print_header "PASSO 7: Configurando Backup Automático"

ssh -p "$PORTA_SSH" "$USUARIO@$SERVIDOR" << 'ENDSSH'

# Criar script de backup
sudo tee /usr/local/bin/backup-xml-importador.sh > /dev/null << 'EOL'
#!/bin/bash
BACKUP_DIR="/var/backups/xml-importador"
DB_FILE="/var/www/xml-importador-produtos/backend/data/database.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/database_$TIMESTAMP.db.gz"

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_FILE" ]; then
    gzip < "$DB_FILE" > "$BACKUP_FILE"
    echo "Backup criado: $BACKUP_FILE"
    
    # Manter últimos 30 backups
    find "$BACKUP_DIR" -name "database_*.db.gz" -mtime +30 -delete
else
    echo "Arquivo de banco não encontrado: $DB_FILE"
fi
EOL

sudo chmod +x /usr/local/bin/backup-xml-importador.sh

# Agendar backup diário (2 AM)
(sudo crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-xml-importador.sh") | sudo crontab -

echo "✓ Backup automático configurado (diariamente às 2 AM)"

ENDSSH

print_success "Backup automático configurado"

################################################################################
# Passo 8: Resumo Final
################################################################################

print_header "✓ DEPLOY CONCLUÍDO COM SUCESSO!"

print_info "Seu sistema está pronto em:"
echo ""
echo -e "  ${GREEN}http://$SERVIDOR${NC}"
echo ""

print_info "Verificações finais:"
echo ""

ssh -p "$PORTA_SSH" "$USUARIO@$SERVIDOR" << ENDSSH 2>/dev/null

echo "  PM2 Status:"
pm2 status

echo ""
echo "  Nginx Status:"
sudo systemctl status nginx | grep Active

echo ""
echo "  Espaço em disco:"
df -h /var/www | head -2

echo ""
echo "  Último backup:"
ls -lh /var/backups/xml-importador/ | tail -1

ENDSSH

print_warning "Próximos passos:"
echo ""
echo "1. Acessar: http://$SERVIDOR"
echo "2. Testar upload de um arquivo XML"
echo "3. Ver logs: ssh -p $PORTA_SSH $USUARIO@$SERVIDOR 'pm2 logs'"
echo "4. Configurar domínio + SSL (Let's Encrypt)"
echo "5. Monitorar: ssh -p $PORTA_SSH $USUARIO@$SERVIDOR 'pm2 monit'"
echo ""

print_success "Deploy realizado com sucesso! 🚀"

################################################################################
