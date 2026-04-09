import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database/db.js';
import importacaoRoutes from './routes/importacaoRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Criar diretórios necessários
import fs from 'fs';
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

if (!fs.existsSync('data')) {
  fs.mkdirSync('data', { recursive: true });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend rodando' });
});

// Rotas de API
app.use('/api/importacoes', importacaoRoutes);

// Inicializar banco de dados e iniciar servidor
async function iniciar() {
  try {
    await initializeDatabase();
    console.log('✓ Banco de dados inicializado');

    app.listen(PORT, () => {
      console.log(`✓ Servidor rodando em http://localhost:${PORT}`);
      console.log(`✓ CORS habilitado`);
    });
  } catch (error) {
    console.error('✗ Erro ao inicializar:', error);
    process.exit(1);
  }
}

iniciar();
