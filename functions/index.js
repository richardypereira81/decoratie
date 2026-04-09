const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const Busboy = require("busboy");
const {XMLParser} = require("fast-xml-parser");
const {stringify} = require("csv-stringify/sync");
const ExcelJS = require("exceljs");
const functions = require("firebase-functions/v1");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const app = express();

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
  parseTagValue: true,
});

app.use(cors({origin: true}));
app.use(express.json({limit: "50mb"}));
app.use(express.urlencoded({extended: true, limit: "50mb"}));

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function lerBufferRequisicao(req) {
  if (req.rawBody && req.rawBody.length) {
    return Promise.resolve(Buffer.from(req.rawBody));
  }

  if (Buffer.isBuffer(req.body) && req.body.length) {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string" && req.body.trim()) {
    return Promise.resolve(Buffer.from(req.body, "utf8"));
  }

  if (isPlainObject(req.body) && Object.keys(req.body).length > 0) {
    return Promise.resolve(Buffer.from(JSON.stringify(req.body), "utf8"));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

async function obterBodyJson(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (!contentType.includes("application/json")) {
    return {};
  }

  if (isPlainObject(req.body) && Object.keys(req.body).length > 0) {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }

  const bodyBuffer = await lerBufferRequisicao(req);
  const rawText = bodyBuffer.toString("utf8").trim();
  if (!rawText) {
    return {};
  }

  return JSON.parse(rawText);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function parseXmlNFe(xmlContent) {
  try {
    const parsed = xmlParser.parse(xmlContent);
    let nfe = null;

    if (parsed.NFe) {
      nfe = parsed.NFe;
    } else if (parsed.nfeProc) {
      nfe = parsed.nfeProc.NFe || parsed.nfeProc;
    } else if (parsed["soap:Envelope"]) {
      const envelope = parsed["soap:Envelope"];
      if (envelope["soap:Body"] && envelope["soap:Body"].nfeResultMsg) {
        const innerNfe = xmlParser.parse(envelope["soap:Body"].nfeResultMsg);
        nfe = innerNfe.NFe || innerNfe.nfeProc;
      }
    }

    if (!nfe) {
      throw new Error("Nao foi encontrada uma NF-e valida no XML");
    }

    return nfe;
  } catch (error) {
    throw new Error(`Erro ao parsear XML: ${error.message}`);
  }
}

function extrairInformacoesCabecalho(nfe) {
  try {
    const infNFe = nfe.infNFe || nfe[0]?.infNFe || nfe.NFe?.infNFe;
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
    const chave = infNFe["@_Id"] ? String(infNFe["@_Id"]).substring(3, 47) : null;

    return {
      chaveNota: chave || null,
      numeroNota: ide.nNF ? String(ide.nNF) : null,
      emitente: emit.xNome ? String(emit.xNome) : null,
      dataEmissao: ide.dEmi ? String(ide.dEmi) : null,
    };
  } catch (error) {
    return {
      chaveNota: null,
      numeroNota: null,
      emitente: null,
      dataEmissao: null,
    };
  }
}

function extrairFreteTotal(nfe) {
  try {
    const infNFe = nfe.infNFe || nfe[0]?.infNFe || nfe.NFe?.infNFe;
    if (!infNFe) {
      return 0;
    }

    const transp = infNFe.transp || {};
    const transporta = transp.transporta || {};

    if (transporta.vFrete !== undefined) {
      return round2(transporta.vFrete);
    }

    if (transp.vFrete !== undefined) {
      return round2(transp.vFrete);
    }

    return 0;
  } catch (error) {
    return 0;
  }
}

function extrairProdutos(nfe) {
  try {
    const infNFe = nfe.infNFe || nfe[0]?.infNFe || nfe.NFe?.infNFe;
    if (!infNFe) {
      return [];
    }

    const detalhes = infNFe.det || [];
    const itens = Array.isArray(detalhes) ? detalhes : [detalhes];

    return itens.map((item) => {
      const prod = item.prod || {};
      const imposto = item.imposto || {};
      const ipi = imposto.IPI || {};
      const ipiTrib = ipi.IPITRIB || {};
      const quantidade = toNumber(prod.qCom);
      const valorUnitarioXml = toNumber(prod.vUnCom);

      return {
        cProd: String(prod.cProd || ""),
        xProd: String(prod.xProd || ""),
        ncm: String(prod.NCM || ""),
        cfop: String(prod.CFOP || ""),
        unidade: String(prod.uCom || ""),
        quantidade,
        valorUnitarioXml,
        valorTotalItem: round2(quantidade * valorUnitarioXml),
        ipiTotal: round2(prod.vIPI || ipiTrib.vIPI),
        cest: String(prod.CEST || ""),
        ean: String(prod.EAN || ""),
      };
    });
  } catch (error) {
    throw new Error(`Erro ao extrair produtos do XML: ${error.message}`);
  }
}

function calcularCustoReal(produto) {
  const quantidade = toNumber(produto.quantidade);
  if (quantidade === 0) {
    return {
      custoBaseUnitario: 0,
      ipiUnitario: 0,
      freteUnitario: 0,
      custoRealUnitario: 0,
    };
  }

  const custoBaseUnitario = round2(toNumber(produto.valorTotalItem) / quantidade);
  const ipiUnitario = round2(toNumber(produto.ipiTotal) / quantidade);
  const freteUnitario = round2(toNumber(produto.freteRateado) / quantidade);

  return {
    custoBaseUnitario,
    ipiUnitario,
    freteUnitario,
    custoRealUnitario: round2(custoBaseUnitario + ipiUnitario + freteUnitario),
  };
}

function calcularPrecoVenda(custoRealUnitario, margemPercent) {
  const margem = margemPercent < 0 ? 0 : toNumber(margemPercent);
  return round2(custoRealUnitario + (custoRealUnitario * margem) / 100);
}

function processarProdutosCompleto(produtos, margemGlobal, freteManual = null) {
  const somaTotalItens = produtos.reduce((sum, item) => sum + toNumber(item.valorTotalItem), 0);
  const somaTotalIPI = produtos.reduce((sum, item) => sum + toNumber(item.ipiTotal), 0);
  const freteTotal = freteManual !== null && freteManual !== undefined ?
    toNumber(freteManual) :
    toNumber(produtos[0]?.freteTotal);

  const produtosComFrete = produtos.map((produto) => {
    const freteRateado = somaTotalItens > 0 ?
      round2((toNumber(produto.valorTotalItem) / somaTotalItens) * freteTotal) :
      0;

    return {
      ...produto,
      freteRateado,
    };
  });

  const produtosFinais = produtosComFrete.map((produto) => {
    const custoReal = calcularCustoReal(produto);
    const margem = produto.margemIndividual !== undefined ?
      toNumber(produto.margemIndividual) :
      toNumber(margemGlobal);

    return {
      ...produto,
      ...custoReal,
      margem,
      valorVenda: calcularPrecoVenda(custoReal.custoRealUnitario, margem),
      editadoManualmente: produto.editadoManualmente ? 1 : 0,
    };
  });

  return {
    produtos: produtosFinais,
    resumo: {
      totalItens: produtosFinais.length,
      quantidade: round2(produtosFinais.reduce((sum, item) => sum + toNumber(item.quantidade), 0)),
      valorTotal: round2(somaTotalItens),
      ipiTotal: round2(somaTotalIPI),
      freteTotal: round2(freteTotal),
      custoTotal: round2(produtosFinais.reduce(
          (sum, item) => sum + (toNumber(item.custoRealUnitario) * toNumber(item.quantidade)),
          0,
      )),
      vendaTotal: round2(produtosFinais.reduce(
          (sum, item) => sum + (toNumber(item.valorVenda) * toNumber(item.quantidade)),
          0,
      )),
    },
  };
}

function normalizeProduto(produto, itemId, ordem) {
  return {
    id: itemId,
    ordem,
    cProd: String(produto.cProd || ""),
    xProd: String(produto.xProd || ""),
    ncm: String(produto.ncm || ""),
    cfop: String(produto.cfop || ""),
    unidade: String(produto.unidade || ""),
    quantidade: toNumber(produto.quantidade),
    valorUnitarioXml: toNumber(produto.valorUnitarioXml),
    valorTotalItem: toNumber(produto.valorTotalItem),
    ipiTotal: toNumber(produto.ipiTotal),
    freteRateado: toNumber(produto.freteRateado),
    custoBaseUnitario: toNumber(produto.custoBaseUnitario),
    ipiUnitario: toNumber(produto.ipiUnitario),
    freteUnitario: toNumber(produto.freteUnitario),
    custoRealUnitario: toNumber(produto.custoRealUnitario),
    margem: toNumber(produto.margem),
    valorVenda: toNumber(produto.valorVenda),
    cest: String(produto.cest || ""),
    ean: String(produto.ean || ""),
    editadoManualmente: produto.editadoManualmente ? 1 : 0,
  };
}

async function commitInChunks(writes) {
  let batch = db.batch();
  let operations = 0;

  for (const write of writes) {
    batch.set(write.ref, write.data, write.options);
    operations += 1;

    if (operations === 450) {
      await batch.commit();
      batch = db.batch();
      operations = 0;
    }
  }

  if (operations > 0) {
    await batch.commit();
  }
}

async function salvarImportacao(dados) {
  const importacaoRef = db.collection("importacoes").doc();
  const importacaoId = importacaoRef.id;
  const agora = new Date().toISOString();
  const createdAt = admin.firestore.Timestamp.now();
  const cabecalho = dados.cabecalho || {};
  const resumo = dados.resumo || {};
  const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
  const freteManual = dados.freteManual === null ||
    dados.freteManual === undefined ||
    dados.freteManual === "" ? null : toNumber(dados.freteManual);

  const writes = [
    {
      ref: importacaoRef,
      data: {
        id: importacaoId,
        chaveNota: cabecalho.chaveNota || null,
        numeroNota: cabecalho.numeroNota || null,
        emitente: cabecalho.emitente || null,
        dataEmissao: cabecalho.dataEmissao || null,
        freteTotal: toNumber(resumo.freteTotal),
        freteManual,
        margemGlobal: toNumber(dados.margemGlobal),
        dataImportacao: agora,
        createdAt,
        totalItens: toNumber(resumo.totalItens) || produtos.length,
        valorTotal: toNumber(resumo.valorTotal),
        ipiTotal: toNumber(resumo.ipiTotal),
        custoTotal: toNumber(resumo.custoTotal),
        vendaTotal: toNumber(resumo.vendaTotal),
      },
    },
  ];

  if (typeof dados.xmlContent === "string" && dados.xmlContent.trim()) {
    writes.push({
      ref: importacaoRef.collection("arquivos").doc("xml"),
      data: {
        xmlContent: dados.xmlContent,
        updatedAt: createdAt,
      },
    });
  }

  produtos.forEach((produto, index) => {
    const itemRef = importacaoRef.collection("itens").doc();
    writes.push({
      ref: itemRef,
      data: normalizeProduto(produto, itemRef.id, index),
    });
  });

  await commitInChunks(writes);

  return {
    sucesso: true,
    importacaoId,
    mensagem: "Importacao salva com sucesso",
  };
}

async function obterDetalhesImportacao(importacaoId) {
  const importacaoRef = db.collection("importacoes").doc(importacaoId);
  const [importacaoSnap, itensSnap] = await Promise.all([
    importacaoRef.get(),
    importacaoRef.collection("itens").orderBy("ordem").get(),
  ]);

  if (!importacaoSnap.exists) {
    const error = new Error("Importacao nao encontrada");
    error.statusCode = 404;
    throw error;
  }

  const importacaoData = importacaoSnap.data();
  const itens = itensSnap.docs.map((doc) => {
    const data = doc.data();
    delete data.ordem;
    return data;
  });

  delete importacaoData.createdAt;

  return {
    ...importacaoData,
    itens,
  };
}

function exportarCSV(importacao) {
  const linhas = importacao.itens.map((item) => ({
    Codigo: item.cProd,
    Descricao: item.xProd,
    NCM: item.ncm,
    CFOP: item.cfop,
    Unidade: item.unidade,
    Quantidade: item.quantidade,
    ValorUnitarioXML: item.valorUnitarioXml?.toFixed(2),
    ValorTotalItem: item.valorTotalItem?.toFixed(2),
    IPITotal: item.ipiTotal?.toFixed(2),
    FreteRateado: item.freteRateado?.toFixed(2),
    CustoBaseUnitario: item.custoBaseUnitario?.toFixed(2),
    IPIUnitario: item.ipiUnitario?.toFixed(2),
    FreteUnitario: item.freteUnitario?.toFixed(2),
    CustoRealUnitario: item.custoRealUnitario?.toFixed(2),
    MargemPercentual: item.margem?.toFixed(2),
    ValorVenda: item.valorVenda?.toFixed(2),
  }));

  return stringify(linhas, {header: true});
}

async function exportarXLSX(importacao) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Importacao");

  if (importacao.numeroNota) {
    worksheet.addRow([`Numero da Nota: ${importacao.numeroNota}`]);
  }
  if (importacao.chaveNota) {
    worksheet.addRow([`Chave da Nota: ${importacao.chaveNota}`]);
  }
  if (importacao.emitente) {
    worksheet.addRow([`Emitente: ${importacao.emitente}`]);
  }
  if (importacao.dataEmissao) {
    worksheet.addRow([`Data de Emissao: ${importacao.dataEmissao}`]);
  }

  worksheet.addRow([]);

  const headerRow = worksheet.addRow([
    "Codigo",
    "Descricao",
    "NCM",
    "CFOP",
    "Unidade",
    "Quantidade",
    "Valor Unitario XML",
    "Valor Total Item",
    "IPI Total",
    "Frete Rateado",
    "Custo Base Unitario",
    "IPI Unitario",
    "Frete Unitario",
    "Custo Real Unitario",
    "Margem %",
    "Valor Venda",
  ]);

  headerRow.font = {bold: true, color: {argb: "FFFFFFFF"}};
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FF4472C4"},
  };

  importacao.itens.forEach((item) => {
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

  worksheet.addRow([]);
  worksheet.addRow(["RESUMO"]);
  worksheet.addRow(["Margem Global", importacao.margemGlobal?.toFixed(2)]);
  worksheet.addRow(["Frete Total", importacao.freteTotal?.toFixed(2)]);
  worksheet.addRow(["Valor Total Produtos", importacao.valorTotal?.toFixed(2)]);
  worksheet.addRow(["IPI Total", importacao.ipiTotal?.toFixed(2)]);
  worksheet.addRow(["Custo Total", importacao.custoTotal?.toFixed(2)]);
  worksheet.addRow(["Venda Total", importacao.vendaTotal?.toFixed(2)]);

  worksheet.columns.forEach((column, index) => {
    let maxLength = 0;
    column.eachCell({includeEmpty: true}, (cell) => {
      const length = cell.value ? String(cell.value).length : 0;
      if (length > maxLength) {
        maxLength = length;
      }
    });
    column.width = Math.min(maxLength + 2, 50);

    if (index >= 5) {
      column.eachCell({includeEmpty: true}, (cell, rowNumber) => {
        if (rowNumber > 1 && typeof cell.value === "number") {
          cell.numFmt = "#,##0.00";
        }
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function lerMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      reject(new Error("Requisicao precisa ser multipart/form-data"));
      return;
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    });

    const fields = {};
    let arquivo = null;
    let arquivoRecebido = false;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (fieldName, fileStream, info) => {
      const chunks = [];
      const fileName = info && info.filename ? info.filename : "arquivo.xml";
      const mimeType = info && info.mimeType ? info.mimeType : "application/octet-stream";
      arquivoRecebido = true;

      fileStream.on("data", (chunk) => {
        chunks.push(chunk);
      });

      fileStream.on("limit", () => {
        reject(new Error("Arquivo excede o limite de 10 MB"));
      });

      fileStream.on("end", () => {
        arquivo = {
          fieldName,
          originalname: fileName,
          mimetype: mimeType,
          buffer: Buffer.concat(chunks),
        };
      });
    });

    busboy.on("error", (error) => {
      reject(error);
    });

    busboy.on("finish", () => {
      if (!arquivoRecebido || !arquivo || !arquivo.buffer || arquivo.buffer.length === 0) {
        reject(new Error("Arquivo XML nao foi enviado"));
        return;
      }

      resolve({fields, arquivo});
    });

    lerBufferRequisicao(req)
        .then((bodyBuffer) => {
          busboy.end(bodyBuffer);
        })
        .catch(reject);
  });
}

app.get("/api/health", (req, res) => {
  res.json({status: "ok", message: "API online"});
});

app.post("/api/importacoes/processar-xml", async (req, res) => {
  try {
    let xmlContent = "";
    let margemGlobal = 0;
    let freteManual = null;
    const contentType = String(req.headers["content-type"] || "").toLowerCase();

    if (contentType.includes("application/json")) {
      const body = await obterBodyJson(req);

      xmlContent = typeof body.xmlContent === "string" ? body.xmlContent : "";
      margemGlobal = toNumber(body.margemGlobal);
      freteManual = body.freteManual === undefined ||
        body.freteManual === null ||
        body.freteManual === "" ?
        null :
        toNumber(body.freteManual);
    } else {
      const {fields, arquivo} = await lerMultipart(req);
      xmlContent = arquivo.buffer.toString("utf8");
      margemGlobal = toNumber(fields.margemGlobal);
      freteManual = fields.freteManual === undefined || fields.freteManual === "" ?
        null :
        toNumber(fields.freteManual);
    }

    if (typeof xmlContent !== "string") {
      return res.status(400).json({erro: "Arquivo XML nao foi enviado"});
    }

    if (!xmlContent.trim()) {
      return res.status(400).json({erro: "O arquivo XML esta vazio"});
    }

    const nfe = parseXmlNFe(xmlContent);
    const cabecalho = extrairInformacoesCabecalho(nfe);
    let freteTotal = extrairFreteTotal(nfe);
    const produtos = extrairProdutos(nfe);

    if (freteManual !== null) {
      freteTotal = freteManual;
    }

    const resultado = processarProdutosCompleto(
        produtos.map((produto) => ({...produto, freteTotal})),
        margemGlobal,
        freteManual,
    );

    return res.json({
      sucesso: true,
      cabecalho,
      freteTotal: round2(freteTotal),
      margemGlobal,
      produtos: resultado.produtos,
      resumo: resultado.resumo,
    });
  } catch (error) {
    return res.status(400).json({erro: error.message || "Erro ao processar XML"});
  }
});

app.post("/api/importacoes/salvar-importacao", async (req, res) => {
  try {
    const body = await obterBodyJson(req);
    const resultado = await salvarImportacao(body);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({erro: error.message || "Erro ao salvar importacao"});
  }
});

app.get("/api/importacoes/listar-importacoes", async (req, res) => {
  try {
    const snapshot = await db.collection("importacoes")
        .orderBy("createdAt", "desc")
        .get();

    const importacoes = snapshot.docs.map((doc) => {
      const data = doc.data();
      delete data.createdAt;
      return data;
    });

    res.json({sucesso: true, importacoes});
  } catch (error) {
    res.status(500).json({erro: error.message || "Erro ao listar importacoes"});
  }
});

app.get("/api/importacoes/detalhes/:id", async (req, res) => {
  try {
    const importacao = await obterDetalhesImportacao(req.params.id);
    res.json({sucesso: true, importacao});
  } catch (error) {
    res.status(error.statusCode || 500).json({erro: error.message});
  }
});

app.put("/api/importacoes/atualizar-item/:itemId", async (req, res) => {
  try {
    const body = await obterBodyJson(req);
    const itemQuery = await db.collectionGroup("itens")
        .where("id", "==", req.params.itemId)
        .limit(1)
        .get();

    if (itemQuery.empty) {
      return res.status(404).json({erro: "Item nao encontrado"});
    }

    const dados = {};
    if (body.margem !== undefined) {
      dados.margem = toNumber(body.margem);
    }
    if (body.custoRealUnitario !== undefined) {
      dados.custoRealUnitario = toNumber(body.custoRealUnitario);
    }
    if (body.valorVenda !== undefined) {
      dados.valorVenda = toNumber(body.valorVenda);
    }
    if (body.editadoManualmente !== undefined) {
      dados.editadoManualmente = body.editadoManualmente ? 1 : 0;
    }

    await itemQuery.docs[0].ref.set(dados, {merge: true});
    return res.json({sucesso: true});
  } catch (error) {
    return res.status(500).json({erro: error.message || "Erro ao atualizar item"});
  }
});

app.get("/api/importacoes/exportar-csv/:id", async (req, res) => {
  try {
    const importacao = await obterDetalhesImportacao(req.params.id);
    const csv = exportarCSV(importacao);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="importacao-${req.params.id}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    res.status(error.statusCode || 500).json({erro: error.message || "Erro ao exportar CSV"});
  }
});

app.get("/api/importacoes/exportar-xlsx/:id", async (req, res) => {
  try {
    const importacao = await obterDetalhesImportacao(req.params.id);
    const buffer = await exportarXLSX(importacao);

    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="importacao-${req.params.id}.xlsx"`,
    );
    res.send(buffer);
  } catch (error) {
    res.status(error.statusCode || 500).json({erro: error.message || "Erro ao exportar XLSX"});
  }
});

app.use((error, req, res, next) => {
  if (error) {
    return res.status(500).json({erro: error.message || "Erro interno"});
  }

  return next();
});

exports.api = functions
    .region("us-central1")
    .runWith({
      timeoutSeconds: 120,
      memory: "1GB",
      maxInstances: 10,
    })
    .https.onRequest(app);
