# 👨‍💼 GUIA PRÁTICO DE USO

## Cenário Real: Importação de Produtos

Você recebeu uma NF-e de um fornecedor e quer importar os produtos, calcular o custo real e estabelecer preços de venda.

---

## 📝 Exemplo Prático Completo

### Dados de Entrada (XML)
```
NF-e: 123
Emitente: EMPRESA FORNECEDORA LTDA
Frete: R$ 500,00

Produtos:
1. PRODUTO 1
   - Quantidade: 100
   - Valor Unitário XML: R$ 50,00
   - Valor Total: R$ 5.000,00
   - IPI Total: R$ 250,00

2. PRODUTO 2
   - Quantidade: 50
   - Valor Unitário XML: R$ 100,00
   - Valor Total: R$ 5.000,00
   - IPI Total: R$ 0,00

TOTAL VALOR: R$ 10.000,00
TOTAL IPI: R$ 250,00
```

---

## 🧮 Cálculos Automáticos

### Passo 1: Ratear Frete

**Fórmula**: `freteItem = (valorItem / valorTotal) × freteTotal`

```
Produto 1:
  freteRateado = (5000 / 10000) × 500
  freteRateado = 0,50 × 500
  freteRateado = R$ 250,00

Produto 2:
  freteRateado = (5000 / 10000) × 500
  freteRateado = 0,50 × 500
  freteRateado = R$ 250,00

Total rateio: R$ 250 + R$ 250 = R$ 500 ✓
```

### Passo 2: Calcular Custo Real Unitário

**Produto 1:**
```
Custo Base Unitário = 5000 / 100 = R$ 50,00
IPI Unitário = 250 / 100 = R$ 2,50
Frete Unitário = 250 / 100 = R$ 2,50
────────────────────────────────
CUSTO REAL UNITÁRIO = 50 + 2,50 + 2,50 = R$ 55,00
```

**Produto 2:**
```
Custo Base Unitário = 5000 / 50 = R$ 100,00
IPI Unitário = 0 / 50 = R$ 0,00
Frete Unitário = 250 / 50 = R$ 5,00
────────────────────────────────
CUSTO REAL UNITÁRIO = 100 + 0 + 5 = R$ 105,00
```

### Passo 3: Calcular Preço de Venda

Você define **Margem Global: 30%** (significa adicionar 30% ao custo)

**Fórmula**: `precoVenda = custoReal × (1 + margem/100)`

**Produto 1:**
```
Preço Venda = 55,00 × (1 + 30/100)
Preço Venda = 55,00 × 1,30
Preço Venda = R$ 71,50
```

**Produto 2:**
```
Preço Venda = 105,00 × (1 + 30/100)
Preço Venda = 105,00 × 1,30
Preço Venda = R$ 136,50
```

### Passo 4: Resumo Total

```
Quantidade Total: 150 unidades
Valor Total Produtos (XML): R$ 10.000,00
IPI Total: R$ 250,00
Frete Total: R$ 500,00
────────────────────────────────
CUSTO TOTAL REAL: (55 × 100) + (105 × 50) = R$ 5.500 + R$ 5.250 = R$ 10.750
VENDA TOTAL: (71,50 × 100) + (136,50 × 50) = R$ 7.150 + R$ 6.825 = R$ 13.975
────────────────────────────────
LUCRO ESTIMADO: 13.975 - 10.750 = R$ 3.225
```

---

## 🖥️ Passo a Passo na Interface

### 1. Iniciar Sistema

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```
Esperado: `✓ Servidor rodando em http://localhost:3001`

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```
Esperado: `➜ Local: http://localhost:5173/`

**Navegador:**
```
http://localhost:5173
```

---

### 2. Página Inicial

```
┌─────────────────────────────────────┐
│  📊 Importador XML de Produtos      │
│  Importe NF-e e calcule custos...   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Margem Global de Lucro (%): [30]    │  ← Configure aqui
└─────────────────────────────────────┘

┌───────────────────────────────────────┐
│  📤 Arraste seu XML aqui              │
│     ou clique para selecionar         │
│  Aceita arquivos .xml de NF-e        │
└───────────────────────────────────────┘

☐ Informar frete manualmente (se necessário)
```

---

### 3. Upload do Arquivo

**Opção 1: Arrastar e Soltar**
- Clique no arquivo `exemplo_nfe.xml`
- Arraste sobre a área azul
- Solte o arquivo

**Opção 2: Clicar para Selecionar**
- Clique na área de upload
- Selecione o arquivo
- Clique "Abrir"

**Resultado:**
```
✓ XML processado com sucesso!
```

---

### 4. Tabela de Produtos Gerada

O sistema mostra uma tabela com **16 colunas**:

```
┌──────┬──────────┬──────┬────┬───┬────┬──────┬────────┬─────┬───────┬──────┬──────┬───────┬──────┬───────┬────────┐
│Código│Descrição │ NCM  │CFOP│Un.│Qtd │V.Unit│V.Total │ IPI │Frete R│C.Base│IPI Un│Frete U│C.Real│Margem%│V.Venda │
├──────┼──────────┼──────┼────┼───┼────┼──────┼────────┼─────┼───────┼──────┼──────┼───────┼──────┼───────┼────────┤
│ 001  │PRODUTO 1 │12345 │5102│UND│100 │50.00 │5000.00 │250 │ 250.00│50.00 │ 2.50 │ 2.50 │[55.00]│[30]    │[71.50] │
├──────┼──────────┼──────┼────┼───┼────┼──────┼────────┼─────┼───────┼──────┼──────┼───────┼──────┼───────┼────────┤
│ 002  │PRODUTO 2 │87654 │5102│UND│ 50 │100.00│5000.00 │ 0  │ 250.00│100.00│ 0.00 │ 5.00 │[105.00]│[30]   │[136.50]│
└──────┴──────────┴──────┴────┴───┴────┴──────┴────────┴─────┴───────┴──────┴──────┴───────┴──────┴───────┴────────┘

[  ] = Campo editável
```

---

### 5. Cards de Resumo

```
┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────┐
│  Itens   │  │ Quantidade   │  │ Valor XML  │  │ IPI Total  │
│    2     │  │    150,00    │  │ R$ 10.000  │  │ R$ 250,00  │
└──────────┘  └──────────────┘  └────────────┘  └────────────┘

┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────┐
│Frete Tot │  │ Custo Total  │  │Venda Total │  │   Lucro    │
│ R$ 500   │  │ R$ 10.750    │  │ R$ 13.975  │  │ R$ 3.225   │
└──────────┘  └──────────────┘  └────────────┘  └────────────┘
```

---

### 6. Editar Valores (Opcional)

Na tabela, você pode editar 3 colunas:

#### Editar Margem Individual
```
Produto 1: [30] → [35]
Novo Preço: 55 × 1,35 = R$ 74,25
```

#### Editar Custo Real Manualmente
```
Produto 2: [105.00] → [110.00]
O sistema recalcula o preço se manter a margem
```

#### Editar Preço Manualmente
```
Produto 1: [71.50] → [75.00]
Você define exatamente o preço que quer
```

**Campos editados ganham destaque amarelo ⚠️**

---

### 7. Salvar Importação

Clique: **💾 Salvar Importação**

```
Salvando importação...
✓ Importação salva com sucesso!
```

Dados salvos no SQLite:
- Informações da NF-e (chave, número, emitente, data)
- Margem global usada
- Frete manual (se informado)
- Todos os produtos com valores calculados

---

### 8. Ver Histórico

Seção inferior: **📋 Histórico de Importações**

```
┌─────────────────────────────────┐
│ NF-e 123                        │  ← Clique para ver
│ 📅 15/01/2025 10:30             │    detalhes
│ 🏢 EMPRESA FORNECEDORA          │
│ 📦 2 itens • R$ 13.975,00       │
└─────────────────────────────────┘
```

---

### 9. Ver Detalhes

Ao clicar em uma importação:

```
┌─────────────────────────────────────────┐
│ Detalhes da Importação              ✕   │
├─────────────────────────────────────────┤
│ NF-e: 123                               │
│ Emitente: EMPRESA FORNECEDORA           │
│ Importado em: 15/01/2025 10:30          │
│ Margem Global: 30,00%                   │
│                                         │
│ [Tabela com produtos]                   │
│                                         │
│ [📥 Exportar CSV] [📊 Exportar XLSX]    │
│ [← Voltar]                              │
└─────────────────────────────────────────┘
```

---

### 10. Exportar em CSV

Clique: **📥 Exportar CSV**

Arquivo baixado: `importacao-<id>.csv`

Abre in Excel:
```
Código,Descrição,NCM,CFOP,Unidade,Quantidade,Valor Unitário XML,...
001,PRODUTO 1,12345,5102,UNID,100,50.00,...
002,PRODUTO 2,87654,5102,UNID,50,100.00,...
```

---

### 11. Exportar em XLSX

Clique: **📊 Exportar XLSX**

Arquivo baixado: `importacao-<id>.xlsx`

Excel com formatação:
- Cabeçalhos em azul
- Números formatados em BRL
- Colunas dimensionadas
- Seção de resumo no final

---

## 🔄 Fluxos de Uso Típicos

### Fluxo 1: Novo Fornecedor (Padrão)

```
1. Upload XML
   ↓
2. Revisar cálculos automáticos
   ↓
3. Margem padrão 30% OK?
   → Sim: próximo
   → Não: ajustar campo Margem Global
   ↓
4. Clique em "Salvar Importação"
   ↓
5. Done! Importação salva
```

### Fluxo 2: Ajuste de Margens

```
1. Upload XML
   ↓
2. Revisa cada produto na tabela
   ↓
3. Produto A: margem alta → ajusta para 25%
   Produto B: margem baixa → ajusta para 40%
   ↓
4. "Salvar Importação"
   ↓
5. Histórico mostra com margens corretas
```

### Fluxo 3: Preço Fixo

```
1. Upload XML
   ↓
2. Edita coluna "V. Venda" diretamente
   Produto: R$ 71,50 → R$ 75,00
   ↓
3. "Salvar Importação"
   ↓
4. Exporta em XLSX para enviar cliente
```

### Fluxo 4: Sem Frete no XML

```
1. Marca "Informar frete manualmente"
   ↓
2. Upload XML
   ↓
3. Campo de frete aparece
   Digita: R$ 500,00
   ↓
4. Sistema calcula tudo com frete manual
   ↓
5. "Salvar Importação"
```

---

## 💾 Dados Salvo no SQLite

Após clicar "Salvar", o sistema persiste:

### Tabela IMPORTACOES
```
id: 'uuid-123'
numeroNota: '123'
emitente: 'EMPRESA FORNECEDORA'
dataEmissao: '2025-01-15'
freteTotal: 500.00
margemGlobal: 30
dataImportacao: '2025-01-15T10:30:00.000Z'
totalItens: 2
vendaTotal: 13975.00
custoTotal: 10750.00
```

### Tabela IMPORTACAO_ITENS (item 1)
```
id: 'uuid-456'
importacaoId: 'uuid-123'
cProd: '001'
xProd: 'PRODUTO 1'
quantidade: 100
custoRealUnitario: 55.00
margem: 30
valorVenda: 71.50
... (outros campos)
```

---

## 📊 Casos de Uso Reais

### Caso 1: Distribuidor import/export
```
Recebe 10 NF-es de fornecedores diferentes
→ Importa cada uma no sistema
→ Define margem por fornecedor
→ Exporta XLSX para seu sistema de preços
→ Todos os preços calculados automaticamente!
```

### Caso 2: Loja que revende
```
Fornecedor envia NF-e
→ Upload no sistema
→ Ajusta preço final (estratégia comercial)
→ Exporta em CSV
→ Importa em seu ERP
```

### Caso 3: Análise de Custo Operacional
```
Quer entender custo real (com frete + IPI)
→ Upload do XML
→ Sistema mostra custos unitários reais
→ Identifica produtos mais caros
→ Negocia melhor com fornecedor
```

---

## 🎯 Dicas Práticas

1. **Margem Mínima**: Défina sempre acima de 20% (cobre impostos)
2. **Frete**: Rateio automático é preciso, confira totalizadores
3. **IPI**: Sistema detecta automaticamente
4. **Edição**: Campos editados marcam em amarelo (rastreável)
5. **Histórico**: Guarde tudo salvo no BD para referência futura
6. **Export**: Use XLSX se precisar enviar para Excel/Sheets
7. **Backup**: Copy do arquivo `backend/data/database.db` = backup

---

## 🚨 Validações Automáticas

Sistema valida:
- ✅ XML válido e estrutura NF-e
- ✅ Campos obrigatórios presentes
- ✅ Números positivos (quantidade, valores)
- ✅ Cálculos precisos (até 2 casas decimais)
- ✅ Rateio = soma igual ao original

---

## 📞 Exemplos de Erros e Soluções

### Erro 1: "Arquivo XML não foi enviado"
```
Solução: Selecione um arquivo antes de fazer upload
```

### Erro 2: "Não foi encontrada uma NF-e válida no XML"
```
Solução: Verifique se é um XML válido de NF-e
Use exemplo_nfe.xml como referência
```

### Erro 3: "Erro ao processar XML"
```
Solução: Arquivo pode estar corrompido
Tente reexportar de seu sistema fiscal
```

---

## 🎓 Aprendendo a Interface

1. **Primeiro uso**: Use `exemplo_nfe.xml` incluído
2. **Entenda os cálculos**: Leia a seção "Cálculos Automáticos" acima
3. **Teste edição**: Mude margem e veja preço atualizar
4. **Experimente exportar**: Gere CSV e XLSX
5. **Salve importações**: Veja no histórico e recupere depois

---

## ✅ Checklist de Primeiro Uso

- [ ] Backend rodando (http://localhost:3001/health)
- [ ] Frontend rodando (http://localhost:5173)
- [ ] Arquivo `exemplo_nfe.xml` visível
- [ ] Upload dos arquivos realizado com sucesso
- [ ] Tabela com 2 produtos exibida
- [ ] Cards de resumo mostram valores
- [ ] Clique em "Salvar Importação"
- [ ] Veja novo item no Histórico
- [ ] Clique para ver detalhes
- [ ] Exporte em CSV
- [ ] Exporte em XLSX
- [ ] 🎉 Tudo funcionando!

---

**Parabéns! Você está pronto para usar o Importador XML de Produtos!**

Qualquer dúvida, consulte o README.md ou ARQUIVO_ESTRUTURA.md

Divirta-se! 🚀
