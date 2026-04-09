import { Readable } from 'stream';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

export function exportarCSV(importacao) {
  const { itens, ...cabecalho } = importacao;

  const linhas = itens.map((item) => ({
    'Código': item.cProd,
    'Descrição': item.xProd,
    'NCM': item.ncm,
    'CFOP': item.cfop,
    'Unidade': item.unidade,
    'Quantidade': item.quantidade,
    'Valor Unitário XML': item.valorUnitarioXml?.toFixed(2),
    'Valor Total Item': item.valorTotalItem?.toFixed(2),
    'IPI Total': item.ipiTotal?.toFixed(2),
    'Frete Rateado': item.freteRateado?.toFixed(2),
    'Custo Base Unitário': item.custoBaseUnitario?.toFixed(2),
    'IPI Unitário': item.ipiUnitario?.toFixed(2),
    'Frete Unitário': item.freteUnitario?.toFixed(2),
    'Custo Real Unitário': item.custoRealUnitario?.toFixed(2),
    'Margem %': item.margem?.toFixed(2),
    'Valor Venda': item.valorVenda?.toFixed(2),
  }));

  const csv = stringify(linhas, { header: true });
  return csv;
}

export async function exportarXLSX(importacao) {
  const { itens, margemGlobal, freteTotal, valorTotal, ipiTotal, custoTotal, vendaTotal, ...cabecalho } =
    importacao;

  const workbook = new ExcelJS.Workbook();

  // Planilha de dados
  const worksheet = workbook.addWorksheet('Importação');

  // Adicionar informações do cabeçalho
  let linhaAtual = 1;

  if (cabecalho.numeroNota) {
    worksheet.addRow([`Número da Nota: ${cabecalho.numeroNota}`]);
    linhaAtual++;
  }

  if (cabecalho.chaveNota) {
    worksheet.addRow([`Chave da Nota: ${cabecalho.chaveNota}`]);
    linhaAtual++;
  }

  if (cabecalho.emitente) {
    worksheet.addRow([`Emitente: ${cabecalho.emitente}`]);
    linhaAtual++;
  }

  if (cabecalho.dataEmissao) {
    worksheet.addRow([`Data de Emissão: ${cabecalho.dataEmissao}`]);
    linhaAtual++;
  }

  // Adicionar linha em branco
  linhaAtual++;

  // Header da tabela
  const headerRow = worksheet.addRow([
    'Código',
    'Descrição',
    'NCM',
    'CFOP',
    'Unidade',
    'Quantidade',
    'Valor Unitário XML',
    'Valor Total Item',
    'IPI Total',
    'Frete Rateado',
    'Custo Base Unitário',
    'IPI Unitário',
    'Frete Unitário',
    'Custo Real Unitário',
    'Margem %',
    'Valor Venda',
  ]);

  linhaAtual++;

  // Formatar header
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };

  // Adicionar dados
  itens.forEach((item) => {
    worksheet.addRow([
      item.cProd,
      item.xProd,
      item.ncm,
      item.cfop,
      item.unidade,
      item.quantidade,
      item.valorUnitarioXml,
      item.valorTotalItem,
      item.ipiTotal,
      item.freteRateado,
      item.custoBaseUnitario,
      item.ipiUnitario,
      item.freteUnitario,
      item.custoRealUnitario,
      item.margem,
      item.valorVenda,
    ]);
  });

  // Adicionar linha em branco
  linhaAtual = worksheet.rowCount + 2;

  // Adicionar resumo
  worksheet.addRow(['RESUMO']);
  worksheet.addRow([
    'Margem Global',
    margemGlobal?.toFixed(2),
  ]);
  worksheet.addRow([
    'Frete Total',
    freteTotal?.toFixed(2),
  ]);
  worksheet.addRow([
    'Valor Total Produtos',
    valorTotal?.toFixed(2),
  ]);
  worksheet.addRow([
    'IPI Total',
    ipiTotal?.toFixed(2),
  ]);
  worksheet.addRow([
    'Custo Total',
    custoTotal?.toFixed(2),
  ]);
  worksheet.addRow([
    'Venda Total',
    vendaTotal?.toFixed(2),
  ]);

  // Ajustar largura das colunas
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      if (cellLength > maxLength) {
        maxLength = cellLength;
      }
    });
    column.width = Math.min(maxLength + 2, 50);
  });

  // Formatar números
  worksheet.columns.forEach((column, index) => {
    if (index >= 6) {
      // Colunas de números
      column.eachCell({ includeEmpty: true }, (cell, row) => {
        if (row > 1) {
          cell.numFmt = '#,##0.00';
        }
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
