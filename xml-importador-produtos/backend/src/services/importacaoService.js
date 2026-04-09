import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { allAsync, getAsync, runAsync } from '../database/db.js';

export async function salvarImportacao(
  db,
  xmlContent,
  cabecalho,
  produtos,
  resumo,
  margemGlobal,
  freteManual
) {
  const importacaoId = uuidv4();
  const agora = new Date().toISOString();

  try {
    // Salvar importação
    await runAsync(
      db,
      `
      INSERT INTO importacoes (
        id,
        chaveNota,
        numeroNota,
        emitente,
        dataEmissao,
        freteManual,
        margemGlobal,
        dataImportacao,
        totalItens,
        valorTotal,
        ipiTotal,
        freteTotal,
        custoTotal,
        vendaTotal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        importacaoId,
        cabecalho.chaveNota,
        cabecalho.numeroNota,
        cabecalho.emitente,
        cabecalho.dataEmissao,
        freteManual,
        margemGlobal,
        agora,
        resumo.totalItens,
        resumo.valorTotal,
        resumo.ipiTotal,
        resumo.freteTotal,
        resumo.custoTotal,
        resumo.vendaTotal,
      ]
    );

    // Salvar itens
    for (const produto of produtos) {
      const itemId = uuidv4();
      await runAsync(
        db,
        `
        INSERT INTO importacao_itens (
          id,
          importacaoId,
          cProd,
          xProd,
          ncm,
          cfop,
          unidade,
          quantidade,
          valorUnitarioXml,
          valorTotalItem,
          ipiTotal,
          freteRateado,
          custoBaseUnitario,
          ipiUnitario,
          freteUnitario,
          custoRealUnitario,
          margem,
          valorVenda,
          cest,
          ean
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          itemId,
          importacaoId,
          produto.cProd,
          produto.xProd,
          produto.ncm,
          produto.cfop,
          produto.unidade,
          produto.quantidade,
          produto.valorUnitarioXml,
          produto.valorTotalItem,
          produto.ipiTotal,
          produto.freteRateado,
          produto.custoBaseUnitario,
          produto.ipiUnitario,
          produto.freteUnitario,
          produto.custoRealUnitario,
          produto.margem,
          produto.valorVenda,
          produto.cest,
          produto.ean,
        ]
      );
    }

    // Salvar arquivo XML original
    const xmlDir = 'uploads';
    if (!fs.existsSync(xmlDir)) {
      fs.mkdirSync(xmlDir, { recursive: true });
    }
    const xmlPath = `${xmlDir}/${importacaoId}.xml`;
    fs.writeFileSync(xmlPath, xmlContent);

    return {
      sucesso: true,
      importacaoId,
      mensagem: 'Importação salva com sucesso',
    };
  } catch (error) {
    throw new Error(`Erro ao salvar importação: ${error.message}`);
  }
}

export async function listarImportacoes(db) {
  try {
    const importacoes = await allAsync(
      db,
      `
      SELECT
        id,
        chaveNota,
        numeroNota,
        emitente,
        dataEmissao,
        dataImportacao,
        totalItens,
        valorTotal,
        ipiTotal,
        freteTotal,
        custoTotal,
        vendaTotal,
        margemGlobal
      FROM importacoes
      ORDER BY dataImportacao DESC
      `
    );

    return importacoes;
  } catch (error) {
    throw new Error(`Erro ao listar importações: ${error.message}`);
  }
}

export async function obterDetalhesImportacao(db, importacaoId) {
  try {
    const importacao = await getAsync(
      db,
      'SELECT * FROM importacoes WHERE id = ?',
      [importacaoId]
    );

    if (!importacao) {
      throw new Error('Importação não encontrada');
    }

    const itens = await allAsync(
      db,
      'SELECT * FROM importacao_itens WHERE importacaoId = ? ORDER BY cProd',
      [importacaoId]
    );

    return {
      ...importacao,
      itens,
    };
  } catch (error) {
    throw new Error(`Erro ao obter detalhes: ${error.message}`);
  }
}

export async function atualizarItemImportacao(db, itemId, dados) {
  try {
    const campos = [];
    const valores = [];

    if (dados.margem !== undefined) {
      campos.push('margem = ?');
      valores.push(dados.margem);
    }

    if (dados.custoRealUnitario !== undefined) {
      campos.push('custoRealUnitario = ?');
      valores.push(dados.custoRealUnitario);
    }

    if (dados.valorVenda !== undefined) {
      campos.push('valorVenda = ?');
      valores.push(dados.valorVenda);
    }

    if (dados.editadoManualmente !== undefined) {
      campos.push('editadoManualmente = ?');
      valores.push(dados.editadoManualmente ? 1 : 0);
    }

    if (campos.length === 0) {
      return { sucesso: true };
    }

    valores.push(itemId);
    const sql = `UPDATE importacao_itens SET ${campos.join(', ')} WHERE id = ?`;

    await runAsync(db, sql, valores);

    return { sucesso: true };
  } catch (error) {
    throw new Error(`Erro ao atualizar item: ${error.message}`);
  }
}
