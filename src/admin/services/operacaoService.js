import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import {
  normalizeUppercaseText,
  roundCurrencyValue,
  sanitizeFileName,
  sanitizeTextValue,
} from '../../shared/formatters.js'
import { db } from '../../lib/firebaseClient.js'
import { downloadCsv } from '../utils/exportCsv.js'
import {
  construirComprasPorPeriodo,
  construirResumoOperacao,
  round2,
} from './custoService.js'
import { resolveProductDescription } from './productDescriptionService.js'
import { normalizeSearchText } from './xmlParser.js'

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeKey(value) {
  return normalizeSearchText(value).replace(/\s+/g, ' ')
}

function createBatchOperation(ref, data, options) {
  return { type: 'set', ref, data, options }
}

function createDeleteOperation(ref) {
  return { type: 'delete', ref }
}

async function commitInChunks(operations) {
  let batch = writeBatch(db)
  let operationCount = 0

  for (const operation of operations) {
    if (operation.type === 'delete') {
      batch.delete(operation.ref)
    } else {
      batch.set(operation.ref, operation.data, operation.options)
    }

    operationCount += 1

    if (operationCount >= 450) {
      await batch.commit()
      batch = writeBatch(db)
      operationCount = 0
    }
  }

  if (operationCount > 0) {
    await batch.commit()
  }
}

function buildProductIndexes(products) {
  const byCodigo = new Map()
  const byEan = new Map()
  const byNome = new Map()

  for (const product of products) {
    const codigo = normalizeKey(product.codigoProduto || product.cProd)
    const ean = normalizeKey(product.ean)
    const nome = normalizeKey(product.nome)

    if (codigo) {
      byCodigo.set(codigo, product)
    }

    if (ean && ean !== 'sem gtin') {
      byEan.set(ean, product)
    }

    if (nome) {
      byNome.set(nome, product)
    }
  }

  return { byCodigo, byEan, byNome }
}

function matchExistingProduct(item, indexes) {
  const codigo = normalizeKey(item.cProd)
  const ean = normalizeKey(item.ean)
  const nome = normalizeKey(item.xProd)

  if (codigo && indexes.byCodigo.has(codigo)) {
    return indexes.byCodigo.get(codigo)
  }

  if (ean && ean !== 'sem gtin' && indexes.byEan.has(ean)) {
    return indexes.byEan.get(ean)
  }

  if (nome && indexes.byNome.has(nome)) {
    return indexes.byNome.get(nome)
  }

  return null
}

function buildSearchIndex(importacao, produtos) {
  const produtosBusca = produtos
    .map((produto) => `${produto.cProd} ${produto.xProd}`)
    .join(' ')

  return normalizeSearchText(
    [
      importacao.fornecedor,
      importacao.numeroNota,
      importacao.chaveNfe,
      produtosBusca,
    ].join(' ')
  )
}

function buildNotaRows(importacoes) {
  return importacoes.map((importacao) => ({
    'Numero da nota': importacao.numeroNota || '',
    Fornecedor: importacao.fornecedor || '',
    'Data de emissao': importacao.dataEmissao || '',
    'Data de entrada': importacao.dataEntrada || '',
    'Valor total': round2(importacao.valorTotal),
    'Quantidade de itens': toNumber(importacao.totalItens),
    'Quantidade total': round2(importacao.quantidadeTotal),
    'Custo total': round2(importacao.custoTotal),
    'Venda estimada': round2(importacao.vendaTotal),
    'Chave NF-e': importacao.chaveNfe || '',
  }))
}

function buildItensRows(itens) {
  return itens.map((item) => ({
    Codigo: item.cProd || '',
    Descricao: item.xProd || '',
    NCM: item.ncm || '',
    CEST: item.cest || '',
    CFOP: item.cfop || '',
    Quantidade: round2(item.quantidade),
    'Valor unitario': round2(item.valorUnitarioXml),
    'Valor total': round2(item.valorTotalItem),
    'IPI total': round2(item.ipiTotal),
    'Frete rateado': round2(item.freteRateado),
    'Custo base': round2(item.custoBaseUnitario),
    'IPI unitario': round2(item.ipiUnitario),
    'Frete unitario': round2(item.freteUnitario),
    'Custo real': round2(item.custoRealUnitario),
    'Margem %': round2(item.margem),
    'Preco de venda': roundCurrencyValue(item.valorVenda),
    Origem: item.origemProduto || '',
  }))
}

function buildResumoRows(importacoes) {
  const resumo = construirResumoOperacao(importacoes)
  const comprasPorPeriodo = construirComprasPorPeriodo(importacoes)

  return {
    resumo: [
      { indicador: 'Total de notas', valor: resumo.totalNotas },
      { indicador: 'Total de itens', valor: resumo.totalItens },
      { indicador: 'Quantidade total', valor: resumo.quantidadeTotal },
      { indicador: 'Total investido', valor: resumo.totalInvestido },
      { indicador: 'Valor das notas', valor: resumo.valorNotas },
      { indicador: 'Custo medio', valor: resumo.custoMedio },
      { indicador: 'Margem estimada (%)', valor: resumo.margemEstimada },
      { indicador: 'Venda estimada', valor: resumo.vendaEstimada },
    ],
    comprasPorPeriodo: comprasPorPeriodo.map((item) => ({
      periodo: item.periodo,
      totalNotas: item.totalNotas,
      totalInvestido: item.totalInvestido,
      valorNotas: item.valorNotas,
    })),
  }
}

function exportWorkbook(sheets, filename) {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  }

  XLSX.writeFile(workbook, filename)
}

export async function salvarImportacaoComProdutos(importacao, { dataEntrada, margemGlobal, xmlFileName = '' } = {}) {
  const produtosSnapshot = await getDocs(collection(db, 'produtos'))
  const produtosExistentes = produtosSnapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data(),
  }))
  const indexes = buildProductIndexes(produtosExistentes)

  const importacaoRef = doc(collection(db, 'importacoes'))
  const dataEntradaNormalizada = dataEntrada || new Date().toISOString().slice(0, 10)
  const produtos = Array.isArray(importacao.produtos) ? importacao.produtos : []
  const valorTotalNota = round2(importacao.cabecalho?.valorTotalNota || importacao.resumo?.valorTotalNota)

  const notaPayload = {
    id: importacaoRef.id,
    fornecedor: normalizeUppercaseText(importacao.cabecalho?.fornecedor || ''),
    documentoFornecedor: sanitizeTextValue(importacao.cabecalho?.documentoFornecedor || ''),
    numeroNota: sanitizeTextValue(importacao.cabecalho?.numeroNota || ''),
    serieNota: sanitizeTextValue(importacao.cabecalho?.serieNota || ''),
    chaveNfe: sanitizeTextValue(importacao.cabecalho?.chaveNfe || ''),
    dataEmissao: importacao.cabecalho?.dataEmissao || '',
    dataEntrada: dataEntradaNormalizada,
    valorTotal: valorTotalNota,
    valorProdutos: round2(importacao.resumo?.valorProdutos),
    freteTotal: round2(importacao.freteTotal),
    ipiTotal: round2(importacao.resumo?.ipiTotal),
    custoTotal: round2(importacao.resumo?.custoTotal),
    vendaTotal: round2(importacao.resumo?.vendaTotal),
    margemGlobal: round2(margemGlobal ?? importacao.margemGlobal),
    margemMedia: round2(importacao.resumo?.margemMedia),
    totalItens: produtos.length,
    quantidadeTotal: round2(importacao.resumo?.quantidadeTotal),
    produtosResumo: produtos.slice(0, 3).map((produto) => normalizeUppercaseText(produto.xProd || '')),
    xmlFileName: xmlFileName || '',
    searchIndex: buildSearchIndex(
      {
        fornecedor: importacao.cabecalho?.fornecedor,
        numeroNota: importacao.cabecalho?.numeroNota,
        chaveNfe: importacao.cabecalho?.chaveNfe,
      },
      produtos
    ),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }

  const operations = [createBatchOperation(importacaoRef, notaPayload)]
  let createdProducts = 0
  let updatedProducts = 0

  produtos.forEach((item, index) => {
    const itemRef = doc(collection(db, 'importacoes', importacaoRef.id, 'itens'))

    operations.push(
      createBatchOperation(itemRef, {
        id: itemRef.id,
        ordem: index,
        ...item,
        dataEntrada: dataEntradaNormalizada,
        fornecedor: normalizeUppercaseText(importacao.cabecalho?.fornecedor || ''),
        numeroNota: sanitizeTextValue(importacao.cabecalho?.numeroNota || ''),
        chaveNfe: sanitizeTextValue(importacao.cabecalho?.chaveNfe || ''),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
    )

    const existingProduct = matchExistingProduct(item, indexes)
    const productRef = existingProduct ? doc(db, 'produtos', existingProduct.id) : doc(collection(db, 'produtos'))
    const estoqueAtual = existingProduct?.estoque === null || existingProduct?.estoque === undefined
      ? 0
      : toNumber(existingProduct.estoque)
    const proximoEstoque = round2(estoqueAtual + toNumber(item.quantidade))
    const margemPadrao = round2(item.margem)
    const precoVenda = roundCurrencyValue(item.valorVenda)

    if (existingProduct) {
      updatedProducts += 1
    } else {
      createdProducts += 1
    }

    const productPayload = {
      nome: normalizeUppercaseText(existingProduct?.nome || item.xProd, 'PRODUTO SEM DESCRICAO'),
      descricao: normalizeUppercaseText(resolveProductDescription({
        nome: existingProduct?.nome || item.xProd,
        categoria: existingProduct?.categoria || '',
        setor: existingProduct?.setor || '',
        descricao: existingProduct?.descricao || '',
      })),
      categoria: normalizeUppercaseText(existingProduct?.categoria || ''),
      setor: normalizeUppercaseText(existingProduct?.setor || ''),
      imagem: existingProduct?.imagem || '',
      imagemPath: existingProduct?.imagemPath || '',
      ativo: existingProduct?.ativo !== false,
      destaque: Boolean(existingProduct?.destaque),
      estoque: proximoEstoque,
      codigoProduto: normalizeUppercaseText(item.cProd || ''),
      ean: normalizeUppercaseText(item.ean || existingProduct?.ean || ''),
      ncm: sanitizeTextValue(item.ncm || existingProduct?.ncm || ''),
      cest: sanitizeTextValue(item.cest || existingProduct?.cest || ''),
      cfop: sanitizeTextValue(item.cfop || existingProduct?.cfop || ''),
      origemProduto: sanitizeTextValue(item.origemProduto || existingProduct?.origemProduto || ''),
      custoBase: round2(item.custoBaseUnitario),
      ipiCompra: round2(item.ipiUnitario),
      freteCompra: round2(item.freteUnitario),
      custoReal: round2(item.custoRealUnitario),
      margemPadrao,
      precoVenda,
      preco: precoVenda,
      ultimaNotaCompra: sanitizeTextValue(importacao.cabecalho?.numeroNota || ''),
      ultimaChaveNfe: sanitizeTextValue(importacao.cabecalho?.chaveNfe || ''),
      ultimoFornecedor: normalizeUppercaseText(importacao.cabecalho?.fornecedor || ''),
      ultimaDataEntrada: dataEntradaNormalizada,
      ultimaDataEmissao: importacao.cabecalho?.dataEmissao || '',
      ultimaImportacaoId: importacaoRef.id,
      origemCadastro: existingProduct?.origemCadastro || 'xml',
      updatedAt: serverTimestamp(),
    }

    if (!existingProduct) {
      productPayload.createdAt = serverTimestamp()
    }

    operations.push(createBatchOperation(productRef, productPayload, { merge: true }))

    const indexedProduct = {
      id: productRef.id,
      ...existingProduct,
      ...productPayload,
    }
    const codigoKey = normalizeKey(item.cProd)
    const eanKey = normalizeKey(item.ean)
    const nomeKey = normalizeKey(productPayload.nome)

    if (codigoKey) {
      indexes.byCodigo.set(codigoKey, indexedProduct)
    }

    if (eanKey && eanKey !== 'sem gtin') {
      indexes.byEan.set(eanKey, indexedProduct)
    }

    if (nomeKey) {
      indexes.byNome.set(nomeKey, indexedProduct)
    }
  })

  await commitInChunks(operations)

  return {
    importacaoId: importacaoRef.id,
    createdProducts,
    updatedProducts,
  }
}

export async function excluirImportacao(importacaoId) {
  if (!String(importacaoId || '').trim()) {
    throw new Error('A importacao informada nao possui identificador valido.')
  }

  const operations = []
  const itensSnapshot = await getDocs(collection(db, 'importacoes', importacaoId, 'itens'))
  const arquivosSnapshot = await getDocs(collection(db, 'importacoes', importacaoId, 'arquivos'))

  itensSnapshot.forEach((documentSnapshot) => {
    operations.push(createDeleteOperation(documentSnapshot.ref))
  })

  arquivosSnapshot.forEach((documentSnapshot) => {
    operations.push(createDeleteOperation(documentSnapshot.ref))
  })

  operations.push(createDeleteOperation(doc(db, 'importacoes', importacaoId)))

  await commitInChunks(operations)
}

export function exportarNotasCsv(importacoes, filename) {
  downloadCsv({
    filename,
    columns: [
      { label: 'Numero da nota', value: (importacao) => importacao.numeroNota || '' },
      { label: 'Fornecedor', value: (importacao) => importacao.fornecedor || '' },
      { label: 'Data de emissao', value: (importacao) => importacao.dataEmissao || '' },
      { label: 'Data de entrada', value: (importacao) => importacao.dataEntrada || '' },
      { label: 'Valor total', value: (importacao) => round2(importacao.valorTotal) },
      { label: 'Quantidade de itens', value: (importacao) => toNumber(importacao.totalItens) },
      { label: 'Custo total', value: (importacao) => round2(importacao.custoTotal) },
      { label: 'Venda estimada', value: (importacao) => round2(importacao.vendaTotal) },
      { label: 'Chave NF-e', value: (importacao) => importacao.chaveNfe || '' },
    ],
    rows: importacoes,
  })
}

export function exportarNotasXlsx(importacoes, filename) {
  exportWorkbook(
    [
      {
        name: 'Notas',
        rows: buildNotaRows(importacoes),
      },
    ],
    filename
  )
}

export function exportarDetalheNotaCsv(importacao, itens, filename) {
  const linhas = buildItensRows(itens).map((linha) => ({
    ...linha,
    Fornecedor: importacao.fornecedor || '',
    'Numero da nota': importacao.numeroNota || '',
    'Chave NF-e': importacao.chaveNfe || '',
    'Data de emissao': importacao.dataEmissao || '',
    'Data de entrada': importacao.dataEntrada || '',
  }))

  downloadCsv({
    filename,
    columns: Object.keys(linhas[0] || {}).map((label) => ({
      label,
      value: (row) => row[label],
    })),
    rows: linhas,
  })
}

export function exportarDetalheNotaXlsx(importacao, itens, filename) {
  exportWorkbook(
    [
      {
        name: 'Resumo',
        rows: [
          { indicador: 'Fornecedor', valor: importacao.fornecedor || '' },
          { indicador: 'Numero da nota', valor: importacao.numeroNota || '' },
          { indicador: 'Chave NF-e', valor: importacao.chaveNfe || '' },
          { indicador: 'Data de emissao', valor: importacao.dataEmissao || '' },
          { indicador: 'Data de entrada', valor: importacao.dataEntrada || '' },
          { indicador: 'Valor total', valor: round2(importacao.valorTotal) },
          { indicador: 'Custo total', valor: round2(importacao.custoTotal) },
          { indicador: 'Venda estimada', valor: round2(importacao.vendaTotal) },
        ],
      },
      {
        name: 'Itens',
        rows: buildItensRows(itens),
      },
    ],
    filename
  )
}

export function exportarRelatorioCsv(importacoes, filename) {
  const relatorio = buildResumoRows(importacoes)

  downloadCsv({
    filename,
    columns: [
      { label: 'Indicador', value: (row) => row.indicador },
      { label: 'Valor', value: (row) => row.valor },
    ],
    rows: relatorio.resumo,
  })
}

export function exportarRelatorioXlsx(importacoes, filename) {
  const relatorio = buildResumoRows(importacoes)

  exportWorkbook(
    [
      {
        name: 'Resumo',
        rows: relatorio.resumo,
      },
      {
        name: 'Compras por periodo',
        rows: relatorio.comprasPorPeriodo,
      },
      {
        name: 'Notas',
        rows: buildNotaRows(importacoes),
      },
    ],
    filename
  )
}

export function buildOperacaoFileName(prefix) {
  const stamp = new Date().toISOString().slice(0, 10)
  return sanitizeFileName(`${prefix}-${stamp}`)
}
