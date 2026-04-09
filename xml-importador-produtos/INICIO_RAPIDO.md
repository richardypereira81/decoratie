# 🚀 INÍCIO RÁPIDO

## Executar em 3 passos!

### Terminal 1 - Backend (deixe rodando)
```bash
cd backend
npm install
npm run dev
```

### Terminal 2 - Frontend (deixe rodando)
```bash
cd frontend
npm install
npm run dev
```

### Terminal 3 - Abrir navegador
```
http://localhost:5173
```

---

## Primeiro Teste (30 segundos)

1. ✅ Espere ambos os terminais mostrarem "pronto"
2. ✅ Abra http://localhost:5173
3. ✅ Arraste o arquivo `exemplo_nfe.xml` na área de upload
4. ✅ Clique "Salvar Importação"
5. ✅ Veja no histórico!

---

## Estrutura de Pastas Importantes

```
backend/
  └── data/             ← Banco SQLite criado aqui
  └── uploads/          ← XMLs temporários
  
frontend/
  └── dist/             ← Gerado após npm run build
```

---

## Portas Padrão

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **Banco de dados**: backend/data/database.db (SQLite)

---

## Próximos Passos

1. Teste com o arquivo `exemplo_nfe.xml`
2. Importe seus próprios XMLs de NF-e
3. Configure margens conforme sua política
4. Exporte em CSV ou XLSX para usar em outros sistemas

---

## 🆘 Problemas Comuns?

**Porta em uso?**
- Backend: mudar porta em vite.config.js ou usar `PORT=3002 npm run dev`
- Frontend: mudar server.port em vite.config.js

**Banco não funciona?**
- Delete backend/data/database.db e reinicie

**XML não é lido?**
- Use exemplo_nfe.xml para testar a estrutura esperada
- Verifique se é um XML válido de NF-e

---

## Documentação Completa

Veja **README.md** para informações detalhadas!

Divirta-se! 🎉
