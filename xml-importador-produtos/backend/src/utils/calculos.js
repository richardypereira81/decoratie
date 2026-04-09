export function calcularCustoReal(produto) {
  const {
    valorTotalItem,
    quantidade,
    ipiTotal,
    freteRateado,
  } = produto;

  if (quantidade === 0) {
    return {
      custoBaseUnitario: 0,
      ipiUnitario: 0,
      freteUnitario: 0,
      custoRealUnitario: 0,
    };
  }

  const custoBaseUnitario = Math.round((valorTotalItem / quantidade) * 100) / 100;
  const ipiUnitario = Math.round((ipiTotal / quantidade) * 100) / 100;
  const freteUnitario = Math.round((freteRateado / quantidade) * 100) / 100;
  const custoRealUnitario = Math.round(
    (custoBaseUnitario + ipiUnitario + freteUnitario) * 100
  ) / 100;

  return {
    custoBaseUnitario,
    ipiUnitario,
    freteUnitario,
    custoRealUnitario,
  };
}

export function calcularPrecoVenda(custoRealUnitario, margemPercent) {
  if (!margemPercent || margemPercent < 0) {
    margemPercent = 0;
  }

  const valorVenda = Math.round(
    (custoRealUnitario + (custoRealUnitario * margemPercent) / 100) * 100
  ) / 100;

  return valorVenda;
}

export function processarProdutosCompleto(produtos, margemGlobal, freteManual = null) {
  // Calcular valores totais para IPI antes de ratear frete
  const somaTotalItens = produtos.reduce((sum, p) => sum + p.valorTotalItem, 0);
  const somaTotalIPI = produtos.reduce((sum, p) => sum + p.ipiTotal, 0);

  // Usar frete manual se fornecido, senão usar o do XML
  const freteTotal = freteManual !== null && freteManual !== undefined
    ? parseFloat(freteManual) || 0
    : (produtos[0]?.freteTotal || 0);

  // Ratear frete
  const produtosComFrete = produtos.map((produto) => {
    const freteRateado = somaTotalItens > 0
      ? Math.round((produto.valorTotalItem / somaTotalItens) * freteTotal * 100) / 100
      : 0;
    return { ...produto, freteRateado };
  });

  // Calcular custo real e preço de venda
  const produtosFinais = produtosComFrete.map((produto) => {
    const custoReal = calcularCustoReal(produto);
    const margem = produto.margemIndividual !== undefined
      ? produto.margemIndividual
      : margemGlobal;

    return {
      ...produto,
      ...custoReal,
      margem,
      valorVenda: calcularPrecoVenda(custoReal.custoRealUnitario, margem),
    };
  });

  // Calcular resumos
  const resumo = {
    totalItens: produtosFinais.length,
    quantidade: produtosFinais.reduce((sum, p) => sum + p.quantidade, 0),
    valorTotal: Math.round(somaTotalItens * 100) / 100,
    ipiTotal: Math.round(somaTotalIPI * 100) / 100,
    freteTotal: Math.round(freteTotal * 100) / 100,
    custoTotal: Math.round(
      produtosFinais.reduce((sum, p) => sum + (p.custoRealUnitario * p.quantidade), 0) * 100
    ) / 100,
    vendaTotal: Math.round(
      produtosFinais.reduce((sum, p) => sum + (p.valorVenda * p.quantidade), 0) * 100
    ) / 100,
  };

  return { produtos: produtosFinais, resumo };
}
