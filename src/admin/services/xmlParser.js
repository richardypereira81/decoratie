import { XMLParser } from 'fast-xml-parser'
import { normalizeUppercaseText, sanitizeTextValue } from '../../shared/formatters.js'
import { processarProdutosImportados, round2 } from './custoService.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
})

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function normalizeDate(value) {
  if (!value) {
    return ''
  }

  const rawValue = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
    return rawValue.slice(0, 10)
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawValue)) {
    const [day, month, year] = rawValue.split('/')
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(rawValue)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function stripNamespace(key) {
  return String(key || '').split(':').pop()
}

function findFirstNestedValue(node, matchers, visited = new WeakSet()) {
  if (!node || typeof node !== 'object') {
    return null
  }

  if (visited.has(node)) {
    return null
  }

  visited.add(node)

  if (Array.isArray(node)) {
    for (const item of node) {
      const nestedValue = findFirstNestedValue(item, matchers, visited)
      if (nestedValue !== null && nestedValue !== undefined && String(nestedValue).trim() !== '') {
        return nestedValue
      }
    }

    return null
  }

  for (const [key, value] of Object.entries(node)) {
    const normalizedKey = stripNamespace(key)
    if (matchers.includes(normalizedKey) && value !== null && value !== undefined && String(value).trim() !== '') {
      return value
    }

    const nestedValue = findFirstNestedValue(value, matchers, visited)
    if (nestedValue !== null && nestedValue !== undefined && String(nestedValue).trim() !== '') {
      return nestedValue
    }
  }

  return null
}

function extractNfeNode(parsed) {
  if (parsed.NFe) {
    return parsed.NFe
  }

  if (parsed.nfeProc) {
    return parsed.nfeProc.NFe || parsed.nfeProc
  }

  if (parsed.procNFe) {
    return parsed.procNFe.NFe || parsed.procNFe
  }

  if (parsed['soap:Envelope']?.['soap:Body']?.nfeResultMsg) {
    const nested = parser.parse(parsed['soap:Envelope']['soap:Body'].nfeResultMsg)
    return extractNfeNode(nested)
  }

  return null
}

function getInfNFe(nfe) {
  return nfe?.infNFe || nfe?.NFe?.infNFe || nfe?.[0]?.infNFe || null
}

function extractIcmsValues(icmsGroup) {
  if (!icmsGroup || typeof icmsGroup !== 'object') {
    return {}
  }

  const [firstEntry] = Object.values(icmsGroup).filter((value) => value && typeof value === 'object')

  if (!firstEntry) {
    return icmsGroup
  }

  return firstEntry
}

function extractIpiValue(ipiGroup) {
  if (!ipiGroup || typeof ipiGroup !== 'object') {
    return 0
  }

  const ipiNode =
    ipiGroup.IPITrib ||
    ipiGroup.IPINT ||
    ipiGroup.IPIOutro ||
    Object.values(ipiGroup).find((value) => value && typeof value === 'object') ||
    {}

  return round2(firstValue(ipiNode.vIPI, ipiGroup.vIPI, 0))
}

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function parseXmlImportacao(xmlContent, { margemGlobal = 0, freteManual = '' } = {}) {
  if (typeof xmlContent !== 'string' || !xmlContent.trim()) {
    throw new Error('O arquivo XML esta vazio.')
  }

  const parsed = parser.parse(xmlContent)
  const nfe = extractNfeNode(parsed)

  if (!nfe) {
    throw new Error('Nao foi encontrada uma NF-e valida no XML informado.')
  }

  const infNFe = getInfNFe(nfe)

  if (!infNFe) {
    throw new Error('O XML informado nao possui a estrutura esperada da NF-e.')
  }

  const ide = infNFe.ide || {}
  const emit = infNFe.emit || {}
  const total = infNFe.total?.ICMSTot || {}
  const transp = infNFe.transp || {}
  const detalhes = Array.isArray(infNFe.det) ? infNFe.det : infNFe.det ? [infNFe.det] : []

  const fornecedor = normalizeUppercaseText(firstValue(emit.xNome, emit.xFant, 'FORNECEDOR NAO IDENTIFICADO'))
  const chaveNfe = sanitizeTextValue(infNFe['@_Id'] ? String(infNFe['@_Id']).replace(/^NFe/, '') : '')
  const numeroNota = sanitizeTextValue(firstValue(ide.nNF, ''))
  const serieNota = sanitizeTextValue(firstValue(ide.serie, ''))
  const dataEmissao = normalizeDate(
    firstValue(
      ide.dhEmi,
      ide.dEmi,
      ide.dhSaiEnt,
      ide.dSaiEnt,
      findFirstNestedValue(ide, ['dhEmi', 'dEmi', 'dhSaiEnt', 'dSaiEnt']),
      findFirstNestedValue(infNFe, ['dhEmi', 'dEmi', 'dhSaiEnt', 'dSaiEnt'])
    )
  )
  const freteXml = round2(firstValue(total.vFrete, transp.vFrete, transp.transporta?.vFrete, 0))
  const valorTotalNota = round2(firstValue(total.vNF, 0))

  const produtos = detalhes.map((item, index) => {
    const produto = item.prod || {}
    const imposto = item.imposto || {}
    const icmsValues = extractIcmsValues(imposto.ICMS)
    const quantidade = toNumber(firstValue(produto.qCom, produto.qTrib))
    const valorUnitario = round2(firstValue(produto.vUnCom, produto.vUnTrib))
    const valorTotalItem = round2(firstValue(produto.vProd, quantidade * valorUnitario))

    return {
      id: `${index + 1}`,
      cProd: normalizeUppercaseText(firstValue(produto.cProd, produto.cEAN, '')),
      xProd: normalizeUppercaseText(firstValue(produto.xProd, 'PRODUTO SEM DESCRICAO')),
      ncm: sanitizeTextValue(firstValue(produto.NCM, '')),
      cest: sanitizeTextValue(firstValue(produto.CEST, '')),
      cfop: sanitizeTextValue(firstValue(produto.CFOP, '')),
      unidade: normalizeUppercaseText(firstValue(produto.uCom, produto.uTrib, 'UN'), 'UN'),
      quantidade,
      valorUnitarioXml: valorUnitario,
      valorTotalItem,
      ipiTotal: extractIpiValue(imposto.IPI),
      origemProduto: sanitizeTextValue(firstValue(icmsValues.orig, '')),
      ean: normalizeUppercaseText(firstValue(produto.cEAN, produto.EAN, produto.cEANTrib, '')),
      fornecedor,
      chaveNfe,
      numeroNota,
      dataEmissao,
    }
  })

  const freteTotal = freteManual === '' || freteManual === null || freteManual === undefined ? freteXml : round2(freteManual)
  const resultado = processarProdutosImportados(produtos, {
    margemGlobal,
    freteTotal,
  })

  return {
    xmlContent,
    cabecalho: {
      fornecedor,
      documentoFornecedor: sanitizeTextValue(firstValue(emit.CNPJ, emit.CPF, '')),
      chaveNfe,
      numeroNota,
      serieNota,
      dataEmissao,
      valorTotalNota: valorTotalNota || resultado.resumo.valorTotalNota,
      freteXml,
    },
    freteTotal,
    margemGlobal: round2(margemGlobal),
    produtos: resultado.produtos,
    resumo: {
      ...resultado.resumo,
      valorTotalNota: valorTotalNota || resultado.resumo.valorTotalNota,
    },
  }
}
