import { roundCurrencyValue } from '../../shared/formatters.js'

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function round2(value) {
  return Math.round(toNumber(value) * 100) / 100
}

export function calcularPrecoVenda(custoRealUnitario, margemPercentual = 0) {
  const custoReal = toNumber(custoRealUnitario)
  const margem = Math.max(0, toNumber(margemPercentual))
  return roundCurrencyValue(custoReal + (custoReal * margem) / 100)
}

export function calcularCustosUnitarios(produto) {
  const quantidade = toNumber(produto.quantidade)

  if (quantidade <= 0) {
    return {
      custoBaseUnitario: 0,
      ipiUnitario: 0,
      freteUnitario: 0,
      custoRealUnitario: 0,
    }
  }

  const custoBaseUnitario = round2(toNumber(produto.valorTotalItem) / quantidade)
  const ipiUnitario = round2(toNumber(produto.ipiTotal) / quantidade)
  const freteUnitario = round2(toNumber(produto.freteRateado) / quantidade)

  return {
    custoBaseUnitario,
    ipiUnitario,
    freteUnitario,
    custoRealUnitario: round2(custoBaseUnitario + ipiUnitario + freteUnitario),
  }
}

export function distribuirFreteRateado(produtos, freteTotal = 0) {
  const lista = Array.isArray(produtos) ? produtos : []
  const frete = round2(freteTotal)
  const somaItens = lista.reduce((total, produto) => total + toNumber(produto.valorTotalItem), 0)

  return lista.map((produto) => ({
    ...produto,
    freteRateado: somaItens > 0 ? round2((toNumber(produto.valorTotalItem) / somaItens) * frete) : 0,
  }))
}

export function processarProdutosImportados(produtos, { margemGlobal = 0, freteTotal = 0 } = {}) {
  const produtosComFrete = distribuirFreteRateado(produtos, freteTotal)

  const produtosProcessados = produtosComFrete.map((produto) => {
    const custos = calcularCustosUnitarios(produto)
    const margem = round2(produto.margem ?? margemGlobal)

    return {
      ...produto,
      ...custos,
      margem,
      valorVenda: calcularPrecoVenda(custos.custoRealUnitario, margem),
    }
  })

  const quantidadeTotal = round2(
    produtosProcessados.reduce((total, produto) => total + toNumber(produto.quantidade), 0)
  )
  const valorProdutos = round2(
    produtosProcessados.reduce((total, produto) => total + toNumber(produto.valorTotalItem), 0)
  )
  const ipiTotal = round2(
    produtosProcessados.reduce((total, produto) => total + toNumber(produto.ipiTotal), 0)
  )
  const custoTotal = round2(
    produtosProcessados.reduce(
      (total, produto) => total + toNumber(produto.custoRealUnitario) * toNumber(produto.quantidade),
      0
    )
  )
  const vendaTotal = round2(
    produtosProcessados.reduce(
      (total, produto) => total + toNumber(produto.valorVenda) * toNumber(produto.quantidade),
      0
    )
  )
  const margemMedia = custoTotal > 0 ? round2(((vendaTotal - custoTotal) / custoTotal) * 100) : 0

  return {
    produtos: produtosProcessados,
    resumo: {
      totalItens: produtosProcessados.length,
      quantidadeTotal,
      valorProdutos,
      ipiTotal,
      freteTotal: round2(freteTotal),
      custoTotal,
      vendaTotal,
      margemMedia,
      valorTotalNota: round2(valorProdutos + ipiTotal + toNumber(freteTotal)),
    },
  }
}

export function atualizarMargemProduto(produto, margem) {
  const proximaMargem = round2(margem)
  return {
    ...produto,
    margem: proximaMargem,
    valorVenda: calcularPrecoVenda(produto.custoRealUnitario, proximaMargem),
  }
}

export function atualizarCustoRealProduto(produto, custoRealUnitario) {
  const custoReal = round2(custoRealUnitario)
  return {
    ...produto,
    custoRealUnitario: custoReal,
    valorVenda: calcularPrecoVenda(custoReal, produto.margem),
  }
}

export function construirResumoOperacao(importacoes) {
  const lista = Array.isArray(importacoes) ? importacoes : []

  const resumo = {
    totalNotas: lista.length,
    totalItens: 0,
    quantidadeTotal: 0,
    totalInvestido: 0,
    vendaEstimada: 0,
    valorNotas: 0,
    custoMedio: 0,
    margemEstimada: 0,
  }

  for (const importacao of lista) {
    resumo.totalItens += toNumber(importacao.totalItens)
    resumo.quantidadeTotal += toNumber(importacao.quantidadeTotal)
    resumo.totalInvestido += toNumber(importacao.custoTotal)
    resumo.vendaEstimada += toNumber(importacao.vendaTotal)
    resumo.valorNotas += toNumber(importacao.valorTotal)
  }

  resumo.quantidadeTotal = round2(resumo.quantidadeTotal)
  resumo.totalInvestido = round2(resumo.totalInvestido)
  resumo.vendaEstimada = round2(resumo.vendaEstimada)
  resumo.valorNotas = round2(resumo.valorNotas)
  resumo.custoMedio = resumo.quantidadeTotal > 0 ? round2(resumo.totalInvestido / resumo.quantidadeTotal) : 0
  resumo.margemEstimada =
    resumo.totalInvestido > 0 ? round2(((resumo.vendaEstimada - resumo.totalInvestido) / resumo.totalInvestido) * 100) : 0

  return resumo
}

export function construirComprasPorPeriodo(importacoes) {
  const lista = Array.isArray(importacoes) ? importacoes : []
  const mapa = new Map()

  for (const importacao of lista) {
    const dataBase = String(importacao.dataEntrada || importacao.dataEmissao || '').slice(0, 7)
    const periodo = dataBase || 'Sem periodo'
    const acumulado = mapa.get(periodo) || {
      periodo,
      totalNotas: 0,
      totalInvestido: 0,
      valorNotas: 0,
    }

    acumulado.totalNotas += 1
    acumulado.totalInvestido = round2(acumulado.totalInvestido + toNumber(importacao.custoTotal))
    acumulado.valorNotas = round2(acumulado.valorNotas + toNumber(importacao.valorTotal))

    mapa.set(periodo, acumulado)
  }

  return [...mapa.values()].sort((first, second) => second.periodo.localeCompare(first.periodo))
}

export function formatarPeriodo(valor) {
  if (!valor || valor === 'Sem periodo') {
    return 'Sem periodo'
  }

  const [ano, mes] = String(valor).split('-')
  if (!ano || !mes) {
    return valor
  }

  return `${mes}/${ano}`
}
