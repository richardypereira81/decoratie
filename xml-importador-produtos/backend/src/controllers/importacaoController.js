import fs from 'fs';
import { getDatabase } from '../database/db.js';
import { parseXmlNFe, extrairInformacoesCabecalho, extrairFreteTotal, extrairProdutos } from '../utils/xmlParser.js';
import { processarProdutosCompleto } from '../utils/calculos.js';
import { salvarImportacao, listarImportacoes, obterDetalhesImportacao, atualizarItemImportacao } from '../services/importacaoService.js';
import { exportarCSV, exportarXLSX } from '../services/exportService.js';

export async function processarXML(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Arquivo XML não foi enviado' });
    }

    const xmlContent = fs.readFileSync(req.file.path, 'utf8');
    const margemGlobal = parseFloat(req.body.margemGlobal) || 0;
    const freteManual = req.body.freteManual ? parseFloat(req.body.freteManual) : null;

    // Parsear XML
    const nfe = parseXmlNFe(xmlContent);

    // Extrair informações
    const cabecalho = extrairInformacoesCabecalho(nfe);
    let freteTotal = extrairFreteTotal(nfe);
    let produtos = extrairProdutos(nfe);

    // Usar frete manual se fornecido
    if (freteManual !== null) {
      freteTotal = freteManual;
    }

    // Processar produtos completos com cálculos
    const { produtos: produtosProcessados, resumo } = processarProdutosCompleto(
      produtos.map((p) => ({ ...p, freteTotal })),
      margemGlobal,
      freteManual
    );

    // Limpar arquivo temporário
    fs.unlinkSync(req.file.path);

    res.json({
      sucesso: true,
      cabecalho,
      freteTotal,
      margemGlobal,
      produtos: produtosProcessados,
      resumo,
    });
  } catch (error) {
    console.error('Erro ao processar XML:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ erro: error.message || 'Erro ao processar XML' });
  }
}

export async function salvarImportacaoHandler(req, res) {
  try {
    const db = await getDatabase();
    const {
      xmlContent,
      cabecalho,
      produtos,
      resumo,
      margemGlobal,
      freteManual,
    } = req.body;

    const resultado = await salvarImportacao(
      db,
      xmlContent,
      cabecalho,
      produtos,
      resumo,
      margemGlobal,
      freteManual
    );

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao salvar importação:', error);
    res.status(500).json({ erro: error.message });
  }
}

export async function listarImportacoesHandler(req, res) {
  try {
    const db = await getDatabase();
    const importacoes = await listarImportacoes(db);

    res.json({ sucesso: true, importacoes });
  } catch (error) {
    console.error('Erro ao listar importações:', error);
    res.status(500).json({ erro: error.message });
  }
}

export async function obterDetalhesHandler(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const importacao = await obterDetalhesImportacao(db, id);

    res.json({ sucesso: true, importacao });
  } catch (error) {
    console.error('Erro ao obter detalhes:', error);
    res.status(500).json({ erro: error.message });
  }
}

export async function atualizarItemHandler(req, res) {
  try {
    const { itemId } = req.params;
    const dados = req.body;
    const db = await getDatabase();

    await atualizarItemImportacao(db, itemId, dados);

    res.json({ sucesso: true });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    res.status(500).json({ erro: error.message });
  }
}

export async function exportarCSVHandler(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const importacao = await obterDetalhesImportacao(db, id);

    const csv = exportarCSV(importacao);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="importacao-${id}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Erro ao exportar CSV:', error);
    res.status(500).json({ erro: error.message });
  }
}

export async function exportarXLSXHandler(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const importacao = await obterDetalhesImportacao(db, id);

    const buffer = await exportarXLSX(importacao);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="importacao-${id}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error('Erro ao exportar XLSX:', error);
    res.status(500).json({ erro: error.message });
  }
}
