@echo off
REM ==================================================================
REM Importador XML de Produtos - Script de Inicialização
REM ==================================================================
REM Este script inicia o sistema completo em Windows

echo.
echo ╔═════════════════════════════════════════════════════════════╗
echo ║  Importador XML de Produtos de NF-e                        ║
echo ║  Sistema Completo de Importação e Cálculo de Custos        ║
echo ╚═════════════════════════════════════════════════════════════╝
echo.

REM Verificar se backend existe
if not exist "backend\package.json" (
    echo ✗ Erro: Pasta backend não encontrada
    echo.
    echo Por favor, execute este script a partir da raiz do projeto
    pause
    exit /b
)

REM Verificar se frontend existe
if not exist "frontend\package.json" (
    echo ✗ Erro: Pasta frontend não encontrada
    echo.
    echo Por favor, execute este script a partir da raiz do projeto
    pause
    exit /b
)

echo.
echo 📦 Iniciando instalação de dependências...
echo.

REM Instalar backend se necessário
if not exist "backend\node_modules" (
    echo [1/2] Instalando dependências do Backend...
    cd backend
    call npm install
    cd ..
    echo ✓ Backend pronto
)

REM Instalar frontend se necessário
if not exist "frontend\node_modules" (
    echo [2/2] Instalando dependências do Frontend...
    cd frontend
    call npm install
    cd ..
    echo ✓ Frontend pronto
)

echo.
echo ═════════════════════════════════════════════════════════════
echo.
echo ✓ Sistema pronto para usar!
echo.
echo Próximos passos:
echo.
echo 1) Abra DOIS terminais
echo.
echo    Terminal 1 (Backend):
echo    ^> cd backend
echo    ^> npm run dev
echo.
echo    Aguarde: "✓ Servidor rodando em http://localhost:3001"
echo.
echo    Terminal 2 (Frontend):
echo    ^> cd frontend
echo    ^> npm run dev
echo.
echo    Aguarde: "➜ Local: http://localhost:5173/"
echo.
echo 2) Abra seu navegador em:
echo    http://localhost:5173
echo.
echo 3) Arraste exemplo_nfe.xml no upload para testar
echo.
echo ═════════════════════════════════════════════════════════════
echo.
echo Documentação disponível:
echo - INICIO_RAPIDO.md        (comece aqui!)
echo - README.md               (tudo em detalhes)
echo - GUIA_PRATICO.md         (exemplos de uso)
echo - TROUBLESHOOTING.md      (resolver problemas)
echo.
echo ═════════════════════════════════════════════════════════════
echo.

pause
