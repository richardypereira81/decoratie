import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  processarXML,
  salvarImportacaoHandler,
  listarImportacoesHandler,
  obterDetalhesHandler,
  atualizarItemHandler,
  exportarCSVHandler,
  exportarXLSXHandler,
} from '../controllers/importacaoController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = express.Router();

// Configurar multer para upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Rotas
router.post('/processar-xml', upload.single('arquivo'), processarXML);
router.post('/salvar-importacao', salvarImportacaoHandler);
router.get('/listar-importacoes', listarImportacoesHandler);
router.get('/detalhes/:id', obterDetalhesHandler);
router.put('/atualizar-item/:itemId', atualizarItemHandler);
router.get('/exportar-csv/:id', exportarCSVHandler);
router.get('/exportar-xlsx/:id', exportarXLSXHandler);

export default router;
