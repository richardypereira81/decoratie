# ✅ CHECKLIST DE DEPLOYMENT

## 📦 Opções Disponíveis

### ✅ Opção 1: VPS Linux + PM2 (Recomendado - $5-10/mês)
**Documentação:** DEPLOY_REMOTO.md (Seção: Passo 1-8)
**Script Automático:** `deploy.sh` (configure e rode)
**Custo:** Muito barato
**Facilidade:** Média
**Performance:** Excelente

### ✅ Opção 2: Docker + docker-compose (Profissional)
**Documentação:** DOCKER_SETUP.md + DEPLOY_REMOTO.md (Opção 5)
**Arquivo:** `Dockerfile` + `docker-compose.yml` + `nginx.conf`
**Custo:** Variável (mesmos servidores)
**Facilidade:** Média (primeira vez)
**Performance:** Excelente

### ✅ Opção 3: Heroku (Muito Fácil - Gratuito com limitações)
**Documentação:** DEPLOY_REMOTO.md (Opção 2)
**Tempo:** 5 minutos
**Custo:** Grátis (Dylan free plan deprecado), Hobby $7/mês
**Facilidade:** Muito Fácil
**Performance:** Boa

### ✅ Opção 4: Railway (Muito Fácil - Gratuito com créditos)
**Documentação:** DEPLOY_REMOTO.md (Opção 3)
**Tempo:** 5 minutos
**Custo:** Grátis com créditos iniciais
**Facilidade:** Muito Fácil
**Performance:** Excelente

### ✅ Opção 5: Render (Muito Fácil - Gratuito)
**Documentação:** DEPLOY_REMOTO.md (Opção 4)
**Tempo:** 5 minutos
**Custo:** Grátis para tier gratuito
**Facilidade:** Muito Fácil
**Performance:** Boa

---

## 🚀 Recomendação

| Cenário | Recomendação |
|---------|--------------|
| Começar rápido | **Railway ou Render** |
| Controle máximo | **VPS + PM2** |
| Escalabilidade | **Docker** |
| Prototipagem | **Heroku** |

---

## ⚡ Quick Start (Escolha uma)

### Para Railway (Recomendado - 5 min)

```bash
# 1. Ter repositório no GitHub
# 2. Ir para https://railway.app
# 3. Clique: New Project → Deploy from GitHub
# 4. Selecione seu repositório
# 5. Pronto! Deployment automático
```

### Para VPS Linux com Script Automático (10 min)

```bash
# 1. Ter um servidor Linux (Ubuntu)
# 2. Ter acesso SSH
# 3. Executar:
chmod +x deploy.sh
./deploy.sh seu-ip-do-servidor

# 4. Pronto! Acesse http://seu-ip-do-servidor
```

### Para Docker (15 min)

```bash
# 1. Servidor com Docker instalado
# 2. Arquivos criados: Dockerfile, docker-compose.yml
# 3. Executar:
docker-compose up -d

# 4. Pronto! Acesse http://seu-ip-do-servidor
```

---

## 📋 Checklist Pré-Deployment

### Código
- [ ] Todos os arquivos do projeto estão prontos
- [ ] Backend instala com `npm install --production` sem erro
- [ ] Frontend faz build com `npm run build` sem erro
- [ ] Exemplo XML funciona localmente
- [ ] Cálculos foram validados

### Servidor (Se VPS)
- [ ] Servidor Linux criado (Ubuntu 20.04+)
- [ ] SSH key configurada
- [ ] Firewall permite porta 80 e 443
- [ ] Domínio apontando para o IP (opcional)

### Arquivo
- [ ] Git repository criado (se deploy automático)
- [ ] .gitignore configurado
- [ ] Nenhum arquivo sensível no Git

### Performance
- [ ] Banco SQLite testado com > 100 registros
- [ ] Upload de arquivo testado
- [ ] Exportação CSV/XLSX testada
- [ ] Tabela carrega rápido

---

## 📊 Arquivos de Deployment Criados

```
xml-importador-produtos/
├── DEPLOY_REMOTO.md         ← Guia completo (5 opções)
├── DOCKER_SETUP.md          ← Setup Docker pronto para copiar
├── deploy.sh                ← Script automático de deploy
├── Dockerfile               ← Gerado automaticamente
├── docker-compose.yml       ← Gerado automaticamente
└── nginx.conf               ← Gerado automaticamente
```

---

## 🎯 Passos Específicos por Opção

### OPÇÃO 1: VPS Linux + PM2

```bash
# Máquina local
chmod +x deploy.sh
./deploy.sh seu-ip-do-servidor

# Pronto! Sistema rodando em http://seu-ip
```

### OPÇÃO 2: Docker

```bash
# No servidor
git clone seu-repo
cd xml-importador-produtos
docker-compose up -d

# Pronto! Sistema rodando
```

### OPÇÃO 3: Railway

1. Push para GitHub
2. Vá para railway.app
3. New Project → Deploy from GitHub
4. Selecione repositório
5. Deploy automático iniciado

### OPÇÃO 4: Heroku

```bash
heroku login
heroku create seu-app-name
git push heroku main
heroku logs --tail
```

### OPÇÃO 5: Render

1. Vá para render.com
2. New Web Service
3. Conecte GitHub
4. Deploy automático

---

## 🔍 Verificação Pós-Deploy

### Teste de Funcionamento

```bash
# Backend rodando
curl https://seu-dominio.com/health
# Esperado: {"status":"ok","message":"Backend rodando"}

# Frontend carregando
curl https://seu-dominio.com/
# Esperado: HTML da aplicação React

# API acessível
curl -X GET https://seu-dominio.com/api/importacoes/listar-importacoes
# Esperado: {"sucesso":true,"importacoes":[]}
```

### Performance

```bash
# Ver uso de recursos
docker stats
# ou
pm2 monit
```

### Logs

```bash
# Docker
docker-compose logs -f app

# PM2
pm2 logs

# Nginx
tail -f /var/log/nginx/error.log
```

---

## 🗄️ Banco de Dados em Produção

### Backup
```bash
# Manual
cp backend/data/database.db backup-$(date +%Y%m%d).db

# Automático (crontab)
0 2 * * * cp /var/www/xml-importador-produtos/backend/data/database.db /backup/db-$(date +\%Y\%m\%d).db
```

### Restaurar
```bash
cp backup-20250115.db backend/data/database.db
# Restart do backend
pm2 restart xml-importador-backend
```

---

## 🔐 Segurança em Produção

### SSL/HTTPS (Essencial)

```bash
# Let's Encrypt (gratuito)
sudo certbot --nginx -d seu-dominio.com
# ou
sudo certbot --standalone -d seu-dominio.com

# Renovação automática
sudo systemctl enable certbot.timer
```

### Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Variáveis de Ambiente

```bash
# .env (não commitar no Git)
NODE_ENV=production
PORT=3001
DATABASE_URL=sqlite:///data/database.db
MAX_FILE_SIZE=100M
```

---

## 📈 Monitoramento em Produção

### Ferramentas Recomendadas

1. **PM2 Plus** - Dashboard para PM2
   ```bash
   pm2 plus
   ```

2. **Nginx Status**
   ```bash
   systemctl status nginx
   tail -f /var/log/nginx/access.log
   ```

3. **Disco
   ```bash
   df -h /var/www
   ```

4. **Processos**
   ```bash
   pm2 status
   pm2 monit
   ```

---

## 🚨 Troubleshooting Deploy

### "502 Bad Gateway"
```bash
pm2 status              # Ver se backend está rodando
pm2 restart all         # Restart
pm2 logs                # Ver erros
```

### "Cannot find module"
```bash
npm install --production
pm2 restart all
```

### "Port already in use"
```bash
sudo lsof -i :3001
sudo kill -9 <PID>
```

### "CORS error"
- Backend: verificar CORS habilitado
- Frontend: verificar URL da API
- Nginx: verificar headers

---

## 📞 Suporte Rápido

**Problema** | **Solução**
---|---
Não consegue conectar SSH | Verificar IP, porta, firewall
Backend não inicia | Ver `pm2 logs`
Frontend em branco | Ver console do navegador (F12)
Upload não funciona | Verificar permissões pasta uploads/
Banco não persiste | Verificar volume Docker ou pasta /data/
SSL não funciona | Renovar certificado com Certbot

---

## ✅ Checklist Final

- [ ] Escolhida a opção de deployment
- [ ] Pré-requisitos atendidos
- [ ] Documentação correspondente lida
- [ ] Deployment executado
- [ ] Sistema acessível
- [ ] Teste com XML bem-sucedido
- [ ] HTTPS configurado (se aplicável)
- [ ] Backup configurado
- [ ] Monitoramento ativo
- [ ] Time treinado

---

## 🎓 Próximos Passos

1. **Escolha a opção** que melhor se encaixa
2. **Leia a documentação** correspondente
3. **Prepare o servidor** (se VPS)
4. **Execute o deployment**
5. **Teste cada funcionalidade**
6. **Configure monitoramento**
7. **Treinar usuários**

---

## 🎉 Parabéns!

Seu sistema **Importador XML de Produtos** está pronto para qualquer ambiente!

**Escolha a opção e comece o deployment agora** 🚀

---

**Versão Deployment**: 1.0.0  
**Data**: Janeiro 2025  
**Status**: Production Ready  

