import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
  parseTagValue: true,
});

export function parseXmlNFe(xmlContent) {
  try {
    const parsed = xmlParser.parse(xmlContent);
    
    // Encontrar a NF-e dentro da estrutura XML
    let nfe = null;
    
    // Procurar em diferentes possíveis localizações
    if (parsed.NFe) {
      nfe = parsed.NFe;
    } else if (parsed['soap:Envelope']) {
      // Pode estar dentro de um envelope SOAP
      const envelope = parsed['soap:Envelope'];
      if (envelope['soap:Body'] && envelope['soap:Body'].nfeResultMsg) {
        const xmlResult = envelope['soap:Body'].nfeResultMsg;
        const innerNfe = xmlParser.parse(xmlResult);
        nfe = innerNfe.NFe || innerNfe.nfeProc;
      }
    }

    if (!nfe) {
      throw new Error('Não foi encontrada uma NF-e válida no XML');
    }

    return nfe;
  } catch (error) {
    throw new Error(`Erro ao parsear XML: ${error.message}`);
  }
}

export function extrairInformacoesCabecalho(nfe) {
  try {
    const infNFe = nfe.infNFe || nfe[0]?.infNFe;
    if (!infNFe) {
      return {
        chaveNota: null,
        numeroNota: null,
        emitente: null,
        dataEmissao: null,
      };
    }

    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const details = infNFe['@_Id'] ? infNFe['@_Id'].substring(3, 47) : 'N/A';

    return {
      chaveNota: details !== 'N/A' ? details : null,
      numeroNota: ide.nNF ? String(ide.nNF) : null,
      emitente: emit.xNome ? String(emit.xNome) : null,
      dataEmissao: ide.dEmi ? String(ide.dEmi) : null,
    };
  } catch (error) {
    console.error('Erro ao extrair informações do cabeçalho:', error);
    return {
      chaveNota: null,
      numeroNota: null,
      emitente: null,
      dataEmissao: null,
    };
  }
}

export function extrairFreteTotal(nfe) {
  try {
    const infNFe = nfe.infNFe || nfe[0]?.infNFe;
    if (!infNFe) return 0;

    const transp = infNFe.transp || {};
    const transporta = transp.transporta || {};
    
    // Tentar extrair vFrete
    if (transporta.vFrete) {
      return parseFloat(transporta.vFrete) || 0;
    }
    
    // Tentar extrair de outras localizações possíveis
    if (transp.vFrete) {
      return parseFloat(transp.vFrete) || 0;
    }

    return 0;
  } catch (error) {
    console.error('Erro ao extrair frete total:', error);
    return 0;
  }
}

export function extrairProdutos(nfe) {
  try {
    const infNFe = nfe.infNFe || nfe[0]?.infNFe;
    if (!infNFe) return [];

    const detalhes = infNFe.det || [];
    
    // Se houver apenas um item, converter para array
    const itens = Array.isArray(detalhes) ? detalhes : [detalhes];

    return itens.map((item) => {
      const prod = item.prod || {};
      const imposto = item.imposto || {};
      const icmsTax = imposto.ICMS || {};
      const ipi = imposto.IPI || {};
      const ipiTrib = ipi.IPITRIB || {};

      // Calcular valor total do item
      const qCom = parseFloat(prod.qCom) || 0;
      const vUnCom = parseFloat(prod.vUnCom) || 0;
      const valorTotalItem = qCom * vUnCom;

      // IPI
      const vIPI = parseFloat(prod.vIPI || ipiTrib.vIPI) || 0;

      return {
        cProd: String(prod.cProd || ''),
        xProd: String(prod.xProd || ''),
        ncm: String(prod.NCM || ''),
        cfop: String(prod.CFOP || ''),
        unidade: String(prod.uCom || ''),
        quantidade: qCom,
        valorUnitarioXml: vUnCom,
        valorTotalItem: valorTotalItem,
        ipiTotal: vIPI,
        cest: String(prod.CEST || ''),
        ean: String(prod.EAN || ''),
      };
    });
  } catch (error) {
    console.error('Erro ao extrair produtos:', error);
    throw new Error(`Erro ao extrair produtos do XML: ${error.message}`);
  }
}

export function ratearFrete(produtos, freteTotal) {
  if (freteTotal === 0 || produtos.length === 0) {
    return produtos.map((p) => ({
      ...p,
      freteRateado: 0,
    }));
  }

  const somaTotalItens = produtos.reduce((sum, p) => sum + p.valorTotalItem, 0);

  if (somaTotalItens === 0) {
    return produtos.map((p) => ({
      ...p,
      freteRateado: 0,
    }));
  }

  return produtos.map((produto) => {
    const freteRateado = (produto.valorTotalItem / somaTotalItens) * freteTotal;
    return {
      ...produto,
      freteRateado: Math.round(freteRateado * 100) / 100,
    };
  });
}
