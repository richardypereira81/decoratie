#!/bin/bash

# ==================================================================
# Importador XML de Produtos - Script de Inicialização
# ==================================================================
# Este script inicia o sistema completo em Linux/Mac

echo ""
echo "╔═════════════════════════════════════════════════════════════╗"
echo "║  Importador XML de Produtos de NF-e                        ║"
echo "║  Sistema Completo de Importação e Cálculo de Custos        ║"
echo "╚═════════════════════════════════════════════════════════════╝"
echo ""

# Verificar se backend existe
if [ ! -f "backend/package.json" ]; then
    echo "✗ Erro: Pasta backend não encontrada"
    echo ""
    echo "Por favor, execute este script a partir da raiz do projeto"
    exit 1
fi

# Verificar se frontend existe
if [ ! -f "frontend/package.json" ]; then
    echo "✗ Erro: Pasta frontend não encontrada"
    echo ""
    echo "Por favor, execute este script a partir da raiz do projeto"
    exit 1
fi

echo ""
echo "📦 Iniciando instalação de dependências..."
echo ""

# Instalar backend se necessário
if [ ! -d "backend/node_modules" ]; then
    echo "[1/2] Instalando dependências do Backend..."
    cd backend
    npm install
    cd ..
    echo "✓ Backend pronto"
fi

# Instalar frontend se necessário
if [ ! -d "frontend/node_modules" ]; then
    echo "[2/2] Instalando dependências do Frontend..."
    cd frontend
    npm install
    cd ..
    echo "✓ Frontend pronto"
fi

echo ""
echo "═════════════════════════════════════════════════════════════"
echo ""
echo "✓ Sistema pronto para usar!"
echo ""
echo "Próximos passos:"
echo ""
echo "1) Abra DOIS terminais"
echo ""
echo "   Terminal 1 (Backend):"
echo "   \$ cd backend"
echo "   \$ npm run dev"
echo ""
echo "   Aguarde: '✓ Servidor rodando em http://localhost:3001'"
echo ""
echo "   Terminal 2 (Frontend):"
echo "   \$ cd frontend"
echo "   \$ npm run dev"
echo ""
echo "   Aguarde: '➜ Local: http://localhost:5173/'"
echo ""
echo "2) Abra seu navegador em:"
echo "   http://localhost:5173"
echo ""
echo "3) Arraste exemplo_nfe.xml no upload para testar"
echo ""
echo "═════════════════════════════════════════════════════════════"
echo ""
echo "Documentação disponível:"
echo "- INICIO_RAPIDO.md        (comece aqui!)"
echo "- README.md               (tudo em detalhes)"
echo "- GUIA_PRATICO.md         (exemplos de uso)"
echo "- TROUBLESHOOTING.md      (resolver problemas)"
echo ""
echo "═════════════════════════════════════════════════════════════"
echo ""
