# Importador XML de Produtos NF-e

Um sistema completo e funcional para importar produtos de Notas Fiscais Eletrônicas (NF-e), calcular custos reais e preços de venda, com persistência em banco de dados local.

## 🎯 Características

- ✅ Upload e leitura de arquivos XML de NF-e
- ✅ Cálculo automático de custo real (incluindo IPI e frete rateado)
- ✅ Cálculo de preço de venda com margens configuráveis
- ✅ Tabela editável para ajustes manuais
- ✅ Banco de dados SQLite local
- ✅ Exportação em CSV e XLSX
- ✅ Interface moderna e responsiva
- ✅ Histórico de importações
- ✅ 100% local (sem cloud)
- ✅ Sem autenticação

## 🛠 Stack Tecnológico

### Frontend
- React 18
- Vite
- CSS puro (sem dependências)
- JavaScript ES6+

### Backend
- Node.js
- Express
- SQLite3
- Fast-XML-Parser
- ExcelJS (para XLSX)
- csv-stringify (para CSV)

## 📋 Requisitos

- Node.js v16+ (recomendado v18+)
- NPM ou Yarn
- Windows, macOS ou Linux

## 🚀 Instalação e Execução

### 1. Clone ou extraia o projeto

```bash
cd xml-importador-produtos
```

### 2. Instalar dependências do Backend

```bash
cd backend
npm install
```

### 3. Iniciar o Backend

```bash
npm run dev
```

Você verá algo como:
```
✓ Banco de dados inicializado
✓ Servidor rodando em http://localhost:3001
✓ CORS habilitado
```

### 4. Em outro terminal, instalar dependências do Frontend

```bash
cd frontend
npm install
```

### 5. Iniciar o Frontend

```bash
npm run dev
```

Você verá algo como:
```
VITE v4.x.x ready in xx ms

➜  Local:   http://localhost:5173/
```

### 6. Abrir no navegador

Acesse http://localhost:5173 no seu navegador favorito.

## 📖 Como Usar

### Passo 1: Preparar o XML
- Tenha um arquivo XML de NF-e de um fornecedor (ou use o arquivo `exemplo_nfe.xml` incluído)

### Passo 2: Definir Margem Global
- Na interface, defina a margem de lucro global (ex: 30% para adicionar 30% de margem em todos os produtos)

### Passo 3: Fazer Upload
- Clique na área de upload ou arraste o arquivo XML
- Se o XML não contiver informações de frete, marque a opção para informar manualmente

### Passo 4: Revisar Cálculos
- O sistema mostrará um resumo com:
  - Quantidade de itens
  - Valor total dos produtos
  - IPI total
  - Frete total (rateado proporcionalmente)
  - Custo total real (com IPI e frete)
  - Valor total de venda
  - Lucro estimado

### Passo 5: Ajustar (Opcional)
- Na tabela, você pode editar:
  - **Margem %**: alterar a margem de lucro individual
  - **Custo Real Unitário**: ajustar o custo manualmente se necessário
  - **Valor Venda**: definir um preço de venda específico

- Campos editados ganham destaque em amarelo

### Passo 6: Salvar
- Clique em "Salvar Importação"
- Os dados serão armazenados no banco SQLite

### Passo 7: Exportar
- Veja o histórico de importações na seção "Histórico de Importações"
- Clique em uma importação para visualizar os detalhes
- Exporte em CSV ou XLSX clicando nos botões de exportação

## 📊 Fórmulas Utilizadas

### Frete Rateado por Item
```
freteRateadoItem = (valorTotalItem / somaTotalItens) × freteTotal
```

### Custo Base Unitário
```
custoBaseUnitario = valorTotalItem / quantidade
```

### IPI Unitário
```
ipiUnitario = valorIPITotal / quantidade
```

### Frete Unitário
```
freteUnitario = freteRateadoItem / quantidade
```

### Custo Real Unitário
```
custoRealUnitario = custoBaseUnitario + ipiUnitario + freteUnitario
```

### Valor de Venda
```
valorVenda = custoRealUnitario × (1 + margem/100)
```

## 🗄 Estrutura do Banco de Dados

### Tabela: importacoes
```sql
CREATE TABLE importacoes (
  id TEXT PRIMARY KEY,
  chaveNota TEXT,
  numeroNota TEXT,
  emitente TEXT,
  dataEmissao TEXT,
  freteTotal REAL DEFAULT 0,
  freteManual REAL,
  margemGlobal REAL,
  dataImportacao TEXT,
  totalItens INTEGER,
  valorTotal REAL,
  ipiTotal REAL,
  custoTotal REAL,
  vendaTotal REAL
);
```

### Tabela: importacao_itens
```sql
CREATE TABLE importacao_itens (
  id TEXT PRIMARY KEY,
  importacaoId TEXT NOT NULL,
  cProd TEXT,
  xProd TEXT,
  ncm TEXT,
  cfop TEXT,
  unidade TEXT,
  quantidade REAL,
  valorUnitarioXml REAL,
  valorTotalItem REAL,
  ipiTotal REAL,
  freteRateado REAL,
  custoBaseUnitario REAL,
  ipiUnitario REAL,
  freteUnitario REAL,
  custoRealUnitario REAL,
  margem REAL,
  valorVenda REAL,
  cest TEXT,
  ean TEXT,
  editadoManualmente INTEGER DEFAULT 0,
  FOREIGN KEY (importacaoId) REFERENCES importacoes(id)
);
```

## 📁 Estrutura do Projeto

```
xml-importador-produtos/
├── backend/
│   ├── src/
│   │   ├── database/
│   │   │   └── db.js              # Inicialização do SQLite
│   │   ├── controllers/
│   │   │   └── importacaoController.js
│   │   ├── services/
│   │   │   ├── importacaoService.js
│   │   │   └── exportService.js
│   │   ├── utils/
│   │   │   ├── xmlParser.js        # Parser de XML
│   │   │   └── calculos.js         # Funções de cálculo
│   │   ├── routes/
│   │   │   └── importacaoRoutes.js
│   │   └── server.js               # Servidor principal
│   ├── uploads/                    # Pasta para uploads temporários
│   ├── data/                       # Banco de dados (criado automaticamente)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── UploadArea.jsx
│   │   │   ├── TabelaProdutos.jsx
│   │   │   ├── Resumo.jsx
│   │   │   ├── Historico.jsx
│   │   │   └── DetalhesImportacao.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── exemplo_nfe.xml
└── README.md
```

## 🔌 APIs do Backend

### 1. Processar XML
```
POST /api/importacoes/processar-xml
Content-Type: multipart/form-data

Parâmetros:
- arquivo: arquivo XML
- margemGlobal: número (ex: 30)
- freteManual: número opcional (ex: 500.00)

Resposta:
{
  "sucesso": true,
  "cabecalho": { chaveNota, numeroNota, emitente, dataEmissao },
  "freteTotal": 500.00,
  "margemGlobal": 30,
  "produtos": [...],
  "resumo": { totalItens, quantidade, valorTotal, ... }
}
```

### 2. Salvar Importação
```
POST /api/importacoes/salvar-importacao
Content-Type: application/json

Body:
{
  "xmlContent": "...",
  "cabecalho": { ... },
  "produtos": [ ... ],
  "resumo": { ... },
  "margemGlobal": 30,
  "freteManual": "500.00"
}

Resposta:
{
  "sucesso": true,
  "importacaoId": "uuid",
  "mensagem": "Importação salva com sucesso"
}
```

### 3. Listar Importações
```
GET /api/importacoes/listar-importacoes

Resposta:
{
  "sucesso": true,
  "importacoes": [
    {
      "id": "uuid",
      "numeroNota": "123",
      "emitente": "EMPRESA",
      "dataImportacao": "2025-01-15T10:30:00",
      "totalItens": 2,
      "vendaTotal": 12345.67
    },
    ...
  ]
}
```

### 4. Obter Detalhes
```
GET /api/importacoes/detalhes/:id

Resposta:
{
  "sucesso": true,
  "importacao": {
    "id": "uuid",
    ...,
    "itens": [ ... ]
  }
}
```

### 5. Exportar CSV
```
GET /api/importacoes/exportar-csv/:id

Retorna arquivo CSV
```

### 6. Exportar XLSX
```
GET /api/importacoes/exportar-xlsx/:id

Retorna arquivo Excel
```

## 🐛 Solução de Problemas

### Porta já em uso
Se receber erro "port already in use":

**Frontend:**
```bash
# Mudar porta no vite.config.js
server: {
  port: 5174,  // de 5173 para 5174
}
```

**Backend:**
```bash
# Ou na linha de comando
PORT=3002 npm run dev
```

### Banco de dados não inicializa
```bash
# Deletar banco antigo
rm backend/data/database.db

# Iniciar novamente
npm run dev
```

### CORS error
Certifique-se que o backend está rodando em `http://localhost:3001`
E o frontend em `http://localhost:5173`

### XML não é lido
- Verifique se o XML segue o padrão NF-e
- Use o arquivo `exemplo_nfe.xml` para testar
- Verifique a estrutura XML no console do navegador (F12)

## 📝 Exemplo de Uso

1. **Primeiro upload:**
   - Use o arquivo `exemplo_nfe.xml` incluído
   - Configure margem global: 30%
   - Clique em "Salvar Importação"

2. **Verificar resultado:**
   - Veja o histórico de importações
   - Clique para ver os detalhes
   - Exporte em CSV ou XLSX

3. **Próximas importações:**
   - Repita com outros XMLs de NF-e
   - Ajuste margens conforme necessário

## 🎨 Interface

- **Upload Area**: Área destacada para arrastar/selecionar XML
- **Margem Global**: Campo para definir margem padrão
- **Resumo**: Cards com totais (itens, valores, lucro)
- **Tabela**: Visualização completa de todos os dados com edição
- **Histórico**: Lista de importações anteriores com quick-access

## ⚙ Fluxo de Dados

```
XML Upload
    ↓
Parser XML (fast-xml-parser)
    ↓
Extração de dados (campos obrigatórios e opcionais)
    ↓
Cálculo de custos:
  - Frete rateado
  - Custo real unitário
  - Preço de venda
    ↓
Exibição em tabela editável
    ↓
Salva em SQLite
    ↓
Exporta em CSV/XLSX
```

## 📦 Dependências Principais

### Backend
- `express`: Framework web
- `sqlite3`: Banco de dados local
- `fast-xml-parser`: Parse de XML
- `exceljs`: Geração de XLSX
- `csv-stringify`: Geração de CSV
- `multer`: Upload de arquivos
- `cors`: CORS enablement

### Frontend
- `react`: UI library
- `react-dom`: DOM rendering
- `vite`: Build tool

## 🔒 Segurança

- ✅ Sem autenticação (para uso local)
- ✅ Sem armazenamento em cloud
- ✅ Dados apenas no banco SQLite local
- ✅ Validação de XML
- ✅ CORS configurado

## 📄 Licença

Livre para uso pessoal e comercial.

## 👨‍💻 Desenvolvimento

### Adicionar nova funcionalidade

1. **Backend**: Adicione rota em `src/routes/` → controlador em `src/controllers/`
2. **Frontend**: Crie componente em `src/components/` → use em `App.jsx`
3. **Testes**: Use `exemplo_nfe.xml` para validar

### Build para produção

```bash
# Frontend
cd frontend
npm run build
# Gera pasta dist/

# Backend
# Já está pronto (Node.js serve arquivos estáticos se necessário)
```

## 🆘 Suporte

Para dúvidas ou problemas:
1. Verifique se o backend está rodando: http://localhost:3001/health
2. Verifique se o frontend está acessível: http://localhost:5173
3. Limpe o cache do navegador (Ctrl+Shift+Delete)
4. Reinicie ambos os servidores

---

**Desenvolvido com ❤️ para gestão eficiente de importações de NF-e**

**Status**: ✅ Pronto para produção local
