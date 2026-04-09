# 🔧 TROUBLESHOOTING E DICAS AVANÇADAS

## 🆘 Problemas Comuns

### 1. "Port 3001 already in use"

**Problema**: Backend não inicia porque porta está em uso.

**Solução 1 - Usar Porta Diferente:**
```bash
SET PORT=3002  # Windows PowerShell
npm run dev

# Depois alterar frontend para:
# vite.config.js
server: {
  port: 5174,
  proxy: {
    '/api': {
      target: 'http://localhost:3002',  // alterado
      changeOrigin: true,
    },
  },
}
```

**Solução 2 - Matar Processo:**
```bash
# Windows - Encontrar qual processo usa porta 3001
netstat -ano | findstr :3001

# Ex: PID 1234 usa a porta
taskkill /PID 1234 /F

# Depois iniciar novamente
npm run dev
```

**Solução 3 - VSCode:**
- Abra terminal integrado (Ctrl+`)
- Clique no ícone de lixo para "Kill Terminal"
- Inicie novamente

---

### 2. "Port 5173 already in use"

**Problema**: Frontend não inicia.

**Solução:**
```bash
# Linux/Mac
lsof -i :5173
kill -9 <PID>

# Windows PowerShell
Get-NetTCPConnection -LocalPort 5173 | Stop-Process -Force
```

---

### 3. "Cannot find module 'express'"

**Problema**: npm install não foi executado.

**Solução:**
```bash
# Certifique-se de estar no diretório correto
cd backend
npm install

# Aguarde conclusão (2-3 minutos)
# Veja se terminou com sucesso
```

---

### 4. "Banco de dados bloqueado" (database locked)

**Problema**: Múltiplas instâncias acessando BD simultaneamente.

**Solução:**
```bash
# Deletar banco e recriar
rm backend/data/database.db

# Reiniciar backend
npm run dev

# Sistema recria automaticamente
```

---

### 5. "CORS error no console"

**Problema**: Frontend não consegue comunicar com backend.

**Erro típico:**
```
Access to XMLHttpRequest at 'http://localhost:3001/api/...'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Solução:**
1. Verificar se backend está rodando: `http://localhost:3001/health`
2. Verificar endpoint exato (POST vs GET)
3. Verificar se Content-Type é application/json

---

### 6. "XMLHttpRequest failed: Network Error"

**Problema**: Backend não está acessível.

**Solução:**
```bash
# Verificar se backend está rodando
curl http://localhost:3001/health
# Ou navegador: http://localhost:3001/health

# Se não responder, iniciar backend
cd backend
npm run dev
```

---

### 7. "XML não é reconhecido"

**Problema**: "Não foi encontrada uma NF-e válida no XML"

**Possíveis Causas:**
```
1. XML não segue padrão NF-e
   → Use exemplo_nfe.xml como referência
   
2. XML corrompido ou inválido
   → Reexporte do seu sistema fiscal
   
3. Codificação errada (não UTF-8)
   → Converta: iconv -f CP1252 -t UTF-8 arquivo.xml > novo.xml
   
4. Estrutura XML diferente
   → Sistema espera estrutura NFe/infNFe
   → Se for nfeProc, pode haver compatibilidade
```

---

### 8. "Cannot GET /api/importacoes/listar-importacoes"

**Problema**: Rota não existe ou endpoint errado.

**Verificar:**
```bash
# Backend deve estar no console indicando:
✓ Servidor rodando em http://localhost:3001

# Rotas disponíveis (backend/src/routes/importacaoRoutes.js):
POST   /api/importacoes/processar-xml
POST   /api/importacoes/salvar-importacao
GET    /api/importacoes/listar-importacoes
GET    /api/importacoes/detalhes/:id
PUT    /api/importacoes/atualizar-item/:itemId
GET    /api/importacoes/exportar-csv/:id
GET    /api/importacoes/exportar-xlsx/:id
```

---

### 9. "npm ERR! code ERESOLVE"

**Problema**: Conflito de versões de dependências.

**Solução:**
```bash
# Usar --force para ignorar conflitos
npm install --force

# Ou usar legacy peer deps
npm install --legacy-peer-deps
```

---

### 10. "Module not found: ./exemplo_nfe.xml"

**Problema**: Arquivo de exemplo não está no lugar certo.

**Solução:**
```bash
# Arquivo deve estar em:
xml-importador-produtos/exemplo_nfe.xml

# Se não existir, está em:
backend/uploads/ ou frontend/public/

# Mover para raiz do projeto
```

---

## 🐛 Debug Mode

### Habilitar Logs Detalhados

**Backend (src/server.js):**
```javascript
// Adicionar antes de app.listen()
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});
```

**Frontend (src/App.jsx):**
```javascript
// Adicionar em handleUpload()
console.log('Request payload:', {
  cabecalho,
  produtos,
  resumo,
});
```

### Browser DevTools (F12)

**Network Tab:**
- Veja todas as requisições HTTP
- Status code deve ser 200 ou 201
- Check Response para erros

**Console Tab:**
- Erros em vermelho
- Warnings em amarelo
- Seus console.log() em branco

**Storage Tab:**
- Se houver localStorage (pronto para expansão)

---

## ⚡ Otimizações

### Otimizar Performance

**Backend:**
```javascript
// Adicionar cache de importações
const cache = new Map();

app.get('/api/importacoes/listar-importacoes', (req, res) => {
  if (cache.has('importacoes')) {
    return res.json({ importacoes: cache.get('importacoes') });
  }
  // ... fetch e cache
});
```

**Frontend:**
```javascript
// Memoizar componentes pesados
const TabelaProdutos = React.memo(({ produtos, onAtualizar }) => {
  // ... componente
});
```

---

## 🔒 Segurança

### Validações Adicionais

**Backend (server.js):**
```javascript
// Limitar tamanho de upload
app.use(express.json({ limit: '10mb' })); // de 50mb para 10mb

// Whitelist de endpoints
const allowedOrigins = ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  }
}));
```

**Validação de XML:**
```javascript
// Em xmlParser.js
export function validateXML(xmlContent) {
  if (!xmlContent.includes('NFe')) {
    throw new Error('XML não contém NFe');
  }
  if (xmlContent.length > 5000000) {
    throw new Error('XML muito grande (>5MB)');
  }
  return true;
}
```

---

## 📊 Backup e Recovery

### Backup Manual

```bash
# Backup do banco de dados
copy backend/data/database.db backend/data/database.backup.db

# Backup de todas importações
mkdir -p backups
copy uploads/* backups/

# Criar arquivo ZIP
# Você pode usar 7z, WinRAR, ou Python:
python -m zipfile -c backup-20250115.zip backend/data/database.db
```

### Restaurar de Backup

```bash
# Restore do banco
copy backend/data/database.backup.db backend/data/database.db

# Reiniciar backend
npm run dev
```

---

## 🚀 Deploy Local em Rede

### Acessar de Outro Computador na Rede

**Backend (src/server.js):**
```javascript
// Mudar:
app.listen(PORT, () => {

// Para:
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Acessível em: http://<seu-ip>:${PORT}`);
});
```

**Frontend (vite.config.js):**
```javascript
server: {
  host: '0.0.0.0', // adicionar
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://<seu-ip>:3001', // usar seu IP
      changeOrigin: true,
    },
  },
}
```

**Encontrar seu IP:**
```bash
# Windows
ipconfig
# Buscar por IPv4 Address (ex: 192.168.1.100)

# Linux/Mac
ifconfig
# Buscar por inet (ex: 192.168.1.100)
```

**Outros computadores acessam:**
```
http://192.168.1.100:5173
```

---

## 📈 Expandindo o Sistema

### Adicionar Nova Rota

**1. Backend - Criar em `/src/routes/importacaoRoutes.js`:**
```javascript
router.get('/minha-rota', minhaFuncao);
```

**2. Backend - Criar controller em `/src/controllers/importacaoController.js`:**
```javascript
export async function minhaFuncao(req, res) {
  try {
    // sua lógica
    res.json({ resultado: true });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
}
```

**3. Frontend - Chamar em `App.jsx`:**
```javascript
const res = await fetch('http://localhost:3001/api/importacoes/minha-rota');
const data = await res.json();
```

---

### Adicionar Novo Campo

**1. Database - Alterar schema em `/src/database/db.js`:**
```javascript
db.run(`
  ALTER TABLE importacoes
  ADD COLUMN meuCampo TEXT;
`);
```

**2. Backend - Usar em `/src/controllers/`:**
```javascript
// Salvar
INSERT INTO importacoes (meuCampo) VALUES (?)

// Recuperar
SELECT meuCampo FROM importacoes WHERE id = ?
```

**3. Frontend - Exibir em componente:**
```jsx
<div>{importacao.meuCampo}</div>
```

---

### Customizar Cálculos

**Modificar fórmulas em `/src/utils/calculos.js`:**
```javascript
// Exemplo: Adicionar desconto de volume
export function calcularPrecoVendaComDesconto(custoReal, margem, quantidade) {
  let margemFinal = margem;
  
  if (quantidade > 1000) {
    margemFinal = margem - 5; // desconto 5% acima de 1000 unidades
  }
  
  return custoReal + (custoReal * margemFinal / 100);
}
```

---

## 📋 Checklist de Deployment

Antes de usar em produção:

- [ ] Testar com XMLs reais
- [ ] Verificar arredondamentos de valores
- [ ] Validar cálculos com calculadora
- [ ] Backup automático do BD
- [ ] Testar com múltiplos usuários
- [ ] Documentar processos customizados
- [ ] Setup de monitoramento (logs)
- [ ] Plano de backup e recovery
- [ ] Treinamento de usuários

---

## 🎯 Melhorias Futuras

### Curto Prazo (Fácil)
- [ ] Adicionar search/filtro no histórico
- [ ] Exportar banco para backup automático
- [ ] Temas dark/light mode
- [ ] Impressão da tabela

### Médio Prazo (Médio)
- [ ] Autenticação básica por usuário
- [ ] Upload em lote (múltiplos XMLs)
- [ ] Gráficos de análise (margem, volume)
- [ ] API pública (simples)

### Longo Prazo (Complexo)
- [ ] Webhooks para notificações
- [ ] Integração com ERP popular
- [ ] Sincronização cloud (opcional)
- [ ] Multiarmazenamento

---

## 📞 Recursos de Ajuda

### Documentação Oficial
- Node.js: https://nodejs.org/docs/
- React: https://react.dev
- Vite: https://vitejs.dev
- SQLite: https://www.sqlite.org/docs.html
- Express: https://expressjs.com

### Ferramentas Úteis
- **Postman**: Testar APIs
- **DB Browser for SQLite**: Ver dados
- **VS Code**: Editor recomendado
- **DevTools (F12)**: Debug no navegador

### Comunidades
- Stack Overflow: Busque "erro específico"
- GitHub Issues: Problemas similares
- Reddit r/webdev: Dúvidas gerais

---

## 🎓 Learning Resources

### Entender Frete Rateado
```
Video: "Rateio de frete proporcional"
Fórmula: (Valor Item / Valor Total) × Frete Total
```

### Entender NF-e
```
Documentação: Manual NF-e SEFAZ
http://www.nfe.fazenda.gov.br/
```

### JavaScript Avançado
```
Object.entries(), Array.map(), async/await
Docs: https://developer.mozilla.org/
```

---

## 🏆 Dicas Pro

1. **Versionamento**: Use Git desde o início
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Ambiente Separado**: Crie .env.example
   ```
   PORT=3001
   NODE_ENV=development
   ```

3. **Logs Estruturados**: Use timestamps
   ```javascript
   console.log(`[${new Date().toISOString()}] ✓ Operação bem-sucedida`);
   ```

4. **Tratamento de Erro**: Sempre try/catch
   ```javascript
   try {
     // código
   } catch (error) {
     console.error('Erro:', error.message);
     res.status(500).json({ erro: error.message });
   }
   ```

5. **Teste Manual**: Sempre valide resultado
   - Upload → Verificar cálculos
   - Salvar → Verificar no histórico
   - Exportar → Fopen em Excel/Sheets

---

## ✅ Verificação Final

Antes de considerar "pronto":

```bash
# Terminal 1 - Backend
npm run dev
# Verifica: "✓ Servidor rodando em http://localhost:3001"

# Terminal 2 - Frontend
npm run dev
# Verifica: "➜ Local: http://localhost:5173/"

# Terminal 3 - Teste health check
curl http://localhost:3001/health
# Verifica: {"status":"ok","message":"Backend rodando"}

# Navegador
http://localhost:5173
# Verifica: Página carrega, layout correto
```

---

**Tudo correto? 🎉 Sistema pronto para usar!**

Qualquer dúvida restante, consulte os outros documentos (README.md, GUIA_PRATICO.md, etc)

Boa sorte! 🚀
