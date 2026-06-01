const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const Busboy = require("busboy");
const {XMLParser} = require("fast-xml-parser");
const {stringify} = require("csv-stringify/sync");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
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

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeMelhorEnvioToken(value) {
  const rawToken = String(value || "").trim();
  const placeholder = "token salvo. preencha para trocar.";

  if (!rawToken || rawToken.toLowerCase() === placeholder) {
    return "";
  }

  return rawToken
      .replace(/^Bearer\s+/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();
}

function createHttpError(statusCode, code, message, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeFileName(value) {
  return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
}

function parseRemoteUrl(value) {
  try {
    const url = new URL(String(value || "").trim());

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return url;
  } catch (error) {
    return null;
  }
}

function getImageExtension(contentType, pathname) {
  const normalizedType = String(contentType || "").toLowerCase().split(";")[0].trim();
  const byContentType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "image/avif": "avif",
  };

  if (byContentType[normalizedType]) {
    return byContentType[normalizedType];
  }

  const match = String(pathname || "").toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (match) {
    return match[1];
  }

  return "jpg";
}

function buildFirebaseDownloadUrl(bucketName, filePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
}

const DEFAULT_FRETE_CONFIG = {
  provider: "melhor_envio",
  ativo: false,
  ambiente: "sandbox",
  cepOrigem: "",
  taxaManuseio: 0,
  diasExtrasPreparacao: 0,
  freteGratisAtivo: false,
  freteGratisAcimaDe: null,
  remetente: {
    nome: "",
    email: "",
    telefone: "",
  },
  dimensoesPadrao: {
    peso: 0.3,
    altura: 10,
    largura: 15,
    comprimento: 20,
  },
  retiradaLocal: {
    ativo: false,
    titulo: "Retirada no local",
    prazoTexto: "Agende a retirada",
  },
  servicos: [],
};

const DEFAULT_PAGAMENTOS_CONFIG = {
  mercadoPago: {
    ativo: false,
    ambiente: "sandbox",
    publicKey: "",
    metodos: {
      pix: true,
      credito: true,
      debito: false,
    },
    maxParcelasCredito: 6,
    valorMinimoParcela: 5,
    pixExpiraEmMinutos: 30,
    capturaAutomatica: true,
    status: "not_configured",
    updatedAt: null,
    updatedBy: null,
  },
};

const DEFAULT_ORDER_NOTIFICATIONS_CONFIG = {
  email: {
    ativo: false,
    destino: "",
  },
  whatsapp: {
    ativo: false,
    destino: "",
  },
};

const ORDER_NOTIFICATION_LOCK_TTL_MS = 2 * 60 * 1000;

const MELHOR_ENVIO_OAUTH_SCOPES = [
  "shipping-calculate",
  "users-read",
];
const MELHOR_ENVIO_ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MELHOR_ENVIO_REFRESH_TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000;
const MELHOR_ENVIO_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const MELHOR_ENVIO_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function normalizeAmbiente(value) {
  return value === "producao" ? "producao" : "sandbox";
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoString(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function isExpiredOrExpiring(value, marginMs = 0) {
  const date = toDate(value);

  if (!date) {
    return true;
  }

  return date.getTime() <= Date.now() + marginMs;
}

function timestampFromDate(date) {
  return admin.firestore.Timestamp.fromDate(date);
}

function normalizePositiveNumber(value, fallback = null) {
  const parsed = parseOptionalNumber(value);

  if (parsed === null || parsed < 0) {
    return fallback;
  }

  return round2(parsed);
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeFreteGratisConfig(data = {}) {
  const minimum = normalizePositiveNumber(data.freteGratisAcimaDe, null);
  const hasValidMinimum = Number.isFinite(minimum) && minimum > 0;
  const explicitFlag = typeof data.freteGratisAtivo === "boolean" ?
    data.freteGratisAtivo :
    null;

  return {
    freteGratisAtivo: explicitFlag === null ? hasValidMinimum : Boolean(explicitFlag),
    freteGratisAcimaDe: hasValidMinimum ? minimum : null,
  };
}

function normalizeDimensions(value = {}, fallback = DEFAULT_FRETE_CONFIG.dimensoesPadrao) {
  return {
    peso: normalizePositiveNumber(value.peso, fallback.peso),
    altura: normalizePositiveNumber(value.altura, fallback.altura),
    largura: normalizePositiveNumber(value.largura, fallback.largura),
    comprimento: normalizePositiveNumber(value.comprimento, fallback.comprimento),
  };
}

function normalizeFreteServico(value = {}, index = 0) {
  const serviceId = String(value.serviceId || value.servicoId || value.id || "").trim();
  const companyId = String(value.companyId || value.transportadoraId || "").trim();

  if (!serviceId) {
    return null;
  }

  return {
    serviceId,
    companyId,
    transportadora: String(value.transportadora || "").trim(),
    modalidade: String(value.modalidade || value.nome || "").trim(),
    serviceName: String(value.serviceName || value.nomeServico || "").trim(),
    companyName: String(value.companyName || value.nomeTransportadora || "").trim(),
    nomeExibicao: String(value.nomeExibicao || "").trim(),
    ativo: value.ativo !== false,
    ordem: Number.isFinite(Number(value.ordem)) ? Number(value.ordem) : index,
    ambiente: value.ambiente ? normalizeAmbiente(value.ambiente) : "",
    ultimaAtualizacao: toIsoString(value.ultimaAtualizacao) ||
      String(value.ultimaAtualizacao || "").trim(),
    cepOrigemTeste: onlyDigits(value.cepOrigemTeste).slice(0, 8),
    cepDestinoTeste: onlyDigits(value.cepDestinoTeste).slice(0, 8),
    pacoteTeste: isPlainObject(value.pacoteTeste) ? {
      width: normalizePositiveNumber(value.pacoteTeste.width, null),
      height: normalizePositiveNumber(value.pacoteTeste.height, null),
      length: normalizePositiveNumber(value.pacoteTeste.length, null),
      weight: normalizePositiveNumber(value.pacoteTeste.weight, null),
      insurance_value: normalizePositiveNumber(
          value.pacoteTeste.insurance_value,
          null,
      ),
      quantity: value.pacoteTeste.quantity === undefined ?
        1 :
        normalizeNonNegativeInteger(value.pacoteTeste.quantity, 1),
    } : null,
  };
}

function normalizeFreteServicesAudit(value = null) {
  if (!isPlainObject(value) || Object.keys(value).length === 0) {
    return null;
  }

  const updatedAt = toIsoString(value.ultimaAtualizacao) ||
    String(value.ultimaAtualizacao || "").trim();
  const retornoBrutoResumo = Array.isArray(value.retornoBrutoResumo) ?
    value.retornoBrutoResumo.slice(0, 50).map((item) => ({
      serviceId: String(item?.serviceId || "").trim(),
      serviceName: String(item?.serviceName || "").trim(),
      companyId: String(item?.companyId || "").trim(),
      companyName: String(item?.companyName || "").trim(),
      price: item?.price ?? null,
      custom_price: item?.custom_price ?? null,
      delivery_time: item?.delivery_time ?? null,
      custom_delivery_time: item?.custom_delivery_time ?? null,
      error: item?.error ? String(item.error).slice(0, 300) : null,
    })) :
    [];

  return {
    ambiente: normalizeAmbiente(value.ambiente),
    ultimaAtualizacao: updatedAt,
    cepOrigem: onlyDigits(value.cepOrigem).slice(0, 8),
    cepDestinoTeste: onlyDigits(value.cepDestinoTeste).slice(0, 8),
    pacoteTeste: isPlainObject(value.pacoteTeste) ? value.pacoteTeste : null,
    retornoBrutoTotal: normalizeNonNegativeInteger(value.retornoBrutoTotal, 0),
    modalidadesDisponiveis: normalizeNonNegativeInteger(
        value.modalidadesDisponiveis,
        0,
    ),
    modalidadesComErro: normalizeNonNegativeInteger(value.modalidadesComErro, 0),
    modalidadesSemServiceId: normalizeNonNegativeInteger(
        value.modalidadesSemServiceId,
        0,
    ),
    modalidadesIgnoradas: normalizeNonNegativeInteger(
        value.modalidadesIgnoradas,
        0,
    ),
    mensagem: String(value.mensagem || "").trim(),
    retornoBrutoResumo,
  };
}

function normalizeRetiradaLocalConfig(value = {}) {
  const merged = {
    ...DEFAULT_FRETE_CONFIG.retiradaLocal,
    ...(isPlainObject(value) ? value : {}),
  };

  return {
    ativo: Boolean(merged.ativo),
    titulo: String(merged.titulo || "Retirada no local").trim() || "Retirada no local",
    prazoTexto: String(merged.prazoTexto || "Agende a retirada").trim() || "Agende a retirada",
  };
}

function normalizeFreteConfig(data = {}) {
  const merged = {
    ...DEFAULT_FRETE_CONFIG,
    ...data,
    remetente: {
      ...DEFAULT_FRETE_CONFIG.remetente,
      ...(isPlainObject(data.remetente) ? data.remetente : {}),
    },
    retiradaLocal: {
      ...DEFAULT_FRETE_CONFIG.retiradaLocal,
      ...(isPlainObject(data.retiradaLocal) ? data.retiradaLocal : {}),
    },
  };

  const dimensoesPadrao = normalizeDimensions(
      isPlainObject(data.dimensoesPadrao) ? data.dimensoesPadrao : {},
  );
  const servicos = Array.isArray(data.servicos) ?
    data.servicos.map(normalizeFreteServico).filter(Boolean) :
    [];
  const freteGratis = normalizeFreteGratisConfig(merged);

  return {
    provider: "melhor_envio",
    ativo: Boolean(merged.ativo),
    ambiente: normalizeAmbiente(merged.ambiente),
    cepOrigem: onlyDigits(merged.cepOrigem).slice(0, 8),
    taxaManuseio: normalizePositiveNumber(merged.taxaManuseio, 0),
    diasExtrasPreparacao: normalizeNonNegativeInteger(merged.diasExtrasPreparacao, 0),
    freteGratisAtivo: freteGratis.freteGratisAtivo,
    freteGratisAcimaDe: freteGratis.freteGratisAcimaDe,
    remetente: {
      nome: String(merged.remetente.nome || "").trim(),
      email: String(merged.remetente.email || "").trim(),
      telefone: String(merged.remetente.telefone || "").trim(),
    },
    dimensoesPadrao,
    retiradaLocal: normalizeRetiradaLocalConfig(merged.retiradaLocal),
    servicos,
    servicosAuditoria: normalizeFreteServicesAudit(merged.servicosAuditoria),
    transportadorasAtivas: servicos
        .filter((servico) => servico.ativo)
        .map((servico) => ({
          serviceId: servico.serviceId,
          companyId: servico.companyId,
        })),
  };
}

function getRetiradaLocalConfig(config) {
  return config?.retiradaLocal?.ativo ? config.retiradaLocal : null;
}

async function loadFreteConfig() {
  const snapshot = await db.collection("configuracoes").doc("frete").get();

  if (!snapshot.exists) {
    return normalizeFreteConfig();
  }

  return normalizeFreteConfig(snapshot.data());
}

async function loadMelhorEnvioSecret() {
  const snapshot = await db.collection("segredos").doc("melhor_envio").get();
  return snapshot.exists ? snapshot.data() || {} : {};
}

function normalizeMercadoPagoMethods(value = {}) {
  const defaults = DEFAULT_PAGAMENTOS_CONFIG.mercadoPago.metodos;
  const methods = isPlainObject(value) ? value : {};

  return {
    pix: methods.pix !== undefined ? Boolean(methods.pix) : defaults.pix,
    credito: methods.credito !== undefined ?
      Boolean(methods.credito) :
      defaults.credito,
    debito: methods.debito !== undefined ? Boolean(methods.debito) : defaults.debito,
  };
}

function normalizeMercadoPagoConfig(data = {}) {
  const source = isPlainObject(data.mercadoPago) ? data.mercadoPago : data;
  const merged = {
    ...DEFAULT_PAGAMENTOS_CONFIG.mercadoPago,
    ...(isPlainObject(source) ? source : {}),
  };
  const maxParcelasCredito = normalizeNonNegativeInteger(
      merged.maxParcelasCredito,
      DEFAULT_PAGAMENTOS_CONFIG.mercadoPago.maxParcelasCredito,
  );
  const pixExpiraEmMinutos = normalizeNonNegativeInteger(
      merged.pixExpiraEmMinutos,
      DEFAULT_PAGAMENTOS_CONFIG.mercadoPago.pixExpiraEmMinutos,
  );

  return {
    mercadoPago: {
      ativo: Boolean(merged.ativo),
      ambiente: normalizeAmbiente(merged.ambiente),
      publicKey: String(merged.publicKey || "").trim(),
      metodos: normalizeMercadoPagoMethods(merged.metodos),
      maxParcelasCredito: Math.max(1, Math.min(12, maxParcelasCredito || 1)),
      valorMinimoParcela: normalizePositiveNumber(merged.valorMinimoParcela, 5),
      pixExpiraEmMinutos: Math.max(30, Math.min(43200, pixExpiraEmMinutos || 30)),
      capturaAutomatica: merged.capturaAutomatica !== false,
      status: String(merged.status || "not_configured").trim() || "not_configured",
      updatedAt: toIsoString(merged.updatedAt) || null,
      updatedBy: String(merged.updatedBy || "").trim() || null,
    },
  };
}

async function loadPagamentosConfig() {
  const snapshot = await db.collection("configuracoes").doc("pagamentos").get();

  if (!snapshot.exists) {
    return normalizeMercadoPagoConfig();
  }

  return normalizeMercadoPagoConfig(snapshot.data());
}

async function loadMercadoPagoSecret() {
  const snapshot = await db.collection("segredos").doc("mercado_pago").get();
  return snapshot.exists ? snapshot.data() || {} : {};
}

function resolveMercadoPagoStatus(config, secret = {}) {
  const mercadoPago = config.mercadoPago;

  if (!mercadoPago.ativo || !mercadoPago.publicKey) {
    return "not_configured";
  }

  if (!secret.accessToken) {
    return "not_configured";
  }

  if (secret.status === "credential_error") {
    return "credential_error";
  }

  if (secret.status === "connected") {
    return "connected";
  }

  return "configured";
}

function sanitizePagamentosConfigForAdmin(config, secret = {}) {
  const status = resolveMercadoPagoStatus(config, secret);

  return {
    mercadoPago: {
      ...config.mercadoPago,
      status,
      accessToken: "",
      webhookSecret: "",
      accessTokenConfigured: Boolean(secret.accessToken),
      webhookSecretConfigured: Boolean(secret.webhookSecret),
      conta: secret.conta || null,
      lastTestAt: toIsoString(secret.lastTestAt),
      lastError: secret.lastError || "",
    },
  };
}

function sanitizePagamentosConfigForPublic(config, secret = {}) {
  const mercadoPago = config.mercadoPago;
  const tokenConfigured = Boolean(secret.accessToken);
  const enabled = Boolean(
      mercadoPago.ativo &&
      mercadoPago.publicKey &&
      tokenConfigured,
  );

  return {
    mercadoPago: {
      ativo: enabled,
      ambiente: mercadoPago.ambiente,
      publicKey: enabled ? mercadoPago.publicKey : "",
      metodos: mercadoPago.metodos,
      maxParcelasCredito: mercadoPago.maxParcelasCredito,
      valorMinimoParcela: mercadoPago.valorMinimoParcela,
      pixExpiraEmMinutos: mercadoPago.pixExpiraEmMinutos,
      status: enabled ? resolveMercadoPagoStatus(config, secret) : "not_configured",
    },
  };
}

function getFunctionsConfig(path) {
  try {
    const config = functions.config();
    return path.split(".").reduce((acc, key) => acc?.[key], config);
  } catch (error) {
    return undefined;
  }
}

function getEnvValue(name, configPath = "") {
  return String(
      process.env[name] ||
      (configPath ? getFunctionsConfig(configPath) : "") ||
      "",
  ).trim();
}

function normalizeNotificationEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeNotificationPhone(value) {
  const digits = onlyDigits(value);

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  return digits;
}

function isNotificationPhoneReady(value) {
  const phone = normalizeNotificationPhone(value);
  return phone.length === 12 || phone.length === 13;
}

function normalizeOrderNotificationConfig(data = {}) {
  const source = isPlainObject(data.notificacoesPedido) ?
    data.notificacoesPedido :
    data;
  const email = isPlainObject(source.email) ? source.email : {};
  const whatsapp = isPlainObject(source.whatsapp) ? source.whatsapp : {};

  return {
    email: {
      ativo: Boolean(email.ativo),
      destino: normalizeNotificationEmail(email.destino),
    },
    whatsapp: {
      ativo: Boolean(whatsapp.ativo),
      destino: normalizeNotificationPhone(whatsapp.destino),
    },
    updatedAt: toIsoString(source.updatedAt) || null,
    updatedBy: String(source.updatedBy || "").trim() || null,
  };
}

function getEmailNotificationProviderConfig() {
  const resendApiKey = getEnvValue(
      "ORDER_NOTIFICATION_RESEND_API_KEY",
      "notificacoes_pedido.resend_api_key",
  ) || getEnvValue("RESEND_API_KEY", "resend.api_key");
  const from = getEnvValue(
      "ORDER_NOTIFICATION_EMAIL_FROM",
      "notificacoes_pedido.email_from",
  );
  const webhookUrl = getEnvValue(
      "ORDER_NOTIFICATION_EMAIL_WEBHOOK_URL",
      "notificacoes_pedido.email_webhook_url",
  );

  return {
    resendApiKey,
    from,
    webhookUrl,
    configured: Boolean(webhookUrl || (resendApiKey && from)),
  };
}

function getWhatsappNotificationProviderConfig() {
  const webhookUrl = getEnvValue(
      "ORDER_NOTIFICATION_WHATSAPP_WEBHOOK_URL",
      "notificacoes_pedido.whatsapp_webhook_url",
  );
  const accessToken = getEnvValue(
      "ORDER_NOTIFICATION_WHATSAPP_ACCESS_TOKEN",
      "notificacoes_pedido.whatsapp_access_token",
  ) || getEnvValue("WHATSAPP_CLOUD_ACCESS_TOKEN", "whatsapp.access_token");
  const phoneNumberId = getEnvValue(
      "ORDER_NOTIFICATION_WHATSAPP_PHONE_NUMBER_ID",
      "notificacoes_pedido.whatsapp_phone_number_id",
  ) || getEnvValue("WHATSAPP_CLOUD_PHONE_NUMBER_ID", "whatsapp.phone_number_id");
  const apiVersion = getEnvValue(
      "ORDER_NOTIFICATION_WHATSAPP_API_VERSION",
      "notificacoes_pedido.whatsapp_api_version",
  ) || "v20.0";

  return {
    webhookUrl,
    accessToken,
    phoneNumberId,
    apiVersion,
    configured: Boolean(webhookUrl || (accessToken && phoneNumberId)),
  };
}

function sanitizeOrderNotificationConfigForAdmin(config) {
  return {
    ...config,
    status: {
      emailProviderConfigured: getEmailNotificationProviderConfig().configured,
      whatsappProviderConfigured: getWhatsappNotificationProviderConfig().configured,
    },
  };
}

async function loadOrderNotificationConfig() {
  const snapshot = await db.collection("segredos")
      .doc("notificacoes_pedido")
      .get();

  if (!snapshot.exists) {
    return normalizeOrderNotificationConfig(DEFAULT_ORDER_NOTIFICATIONS_CONFIG);
  }

  return normalizeOrderNotificationConfig(snapshot.data());
}

function validateOrderNotificationConfig(config) {
  if (
    config.email.ativo &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email.destino)
  ) {
    throw createHttpError(
        422,
        "notificacao_email_invalido",
        "Informe um e-mail de destino valido.",
    );
  }

  if (
    config.whatsapp.ativo &&
    !(config.whatsapp.destino.length === 12 || config.whatsapp.destino.length === 13)
  ) {
    throw createHttpError(
        422,
        "notificacao_whatsapp_invalido",
        "Informe um WhatsApp de destino valido.",
    );
  }
}

function getMelhorEnvioOAuthClient(secret = {}, config = null) {
  const envClientId = String(
      process.env.MELHOR_ENVIO_CLIENT_ID ||
      getFunctionsConfig("melhorenvio.client_id") ||
      "",
  ).trim();
  const envClientSecret = String(
      process.env.MELHOR_ENVIO_CLIENT_SECRET ||
      getFunctionsConfig("melhorenvio.client_secret") ||
      "",
  ).trim();
  const clientId = envClientId || String(secret.clientId || "").trim();
  const clientSecret = envClientSecret || String(secret.clientSecret || "").trim();
  const clientAmbiente = envClientId && envClientSecret ?
    config?.ambiente || secret.clientAmbiente || "" :
    normalizeAmbiente(secret.clientAmbiente || config?.ambiente);

  return {
    clientId,
    clientSecret,
    clientAmbiente,
    configured: Boolean(clientId && clientSecret),
    source: envClientId && envClientSecret ? "env" : "firestore",
  };
}

function getMelhorEnvioTokenTimestamps(data, now = new Date()) {
  const expiresInSeconds = Number(data.expires_in);
  const refreshExpiresInSeconds = Number(data.refresh_token_expires_in);
  const expiresAt = new Date(
      now.getTime() +
      (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ?
        expiresInSeconds * 1000 :
        MELHOR_ENVIO_ACCESS_TOKEN_TTL_MS),
  );
  const refreshTokenExpiresAt = new Date(
      now.getTime() +
      (Number.isFinite(refreshExpiresInSeconds) && refreshExpiresInSeconds > 0 ?
        refreshExpiresInSeconds * 1000 :
        MELHOR_ENVIO_REFRESH_TOKEN_TTL_MS),
  );

  return {expiresAt, refreshTokenExpiresAt};
}

function normalizeMelhorEnvioScopes(value) {
  if (Array.isArray(value)) {
    return value.map((scope) => String(scope).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
  }

  return [...MELHOR_ENVIO_OAUTH_SCOPES];
}

function buildMelhorEnvioAccountSummary(data) {
  if (!isPlainObject(data)) {
    return null;
  }

  const fullName = [
    data.firstname,
    data.lastname,
  ].filter(Boolean).join(" ").trim();

  return {
    id: data.id || null,
    nome: data.name || fullName || null,
    email: data.email || null,
    documento: data.document || data.cpf || data.cnpj || null,
  };
}

function resolveMelhorEnvioConnectionStatus(secret = {}, config = null) {
  const client = getMelhorEnvioOAuthClient(secret, config);

  if (!client.configured) {
    return "not_connected";
  }

  if (secret.status === "reconnect_required") {
    return "reconnect_required";
  }

  if (secret.ambiente && config?.ambiente && secret.ambiente !== config.ambiente) {
    return "reconnect_required";
  }

  if (!secret.accessToken || !secret.refreshToken) {
    return "not_connected";
  }

  if (isExpiredOrExpiring(secret.refreshTokenExpiresAt)) {
    return "reconnect_required";
  }

  if (isExpiredOrExpiring(secret.expiresAt)) {
    return "token_expired";
  }

  return "connected";
}

function sanitizeMelhorEnvioConnectionForAdmin(secret = {}, config = null) {
  const client = getMelhorEnvioOAuthClient(secret, config);

  return {
    provider: "melhor_envio",
    ambiente: secret.ambiente || config?.ambiente || "sandbox",
    status: resolveMelhorEnvioConnectionStatus(secret, config),
    clientConfigured: client.configured,
    clientSource: client.source,
    clientAmbiente: client.clientAmbiente || null,
    clientIdHint: client.clientId ? `...${client.clientId.slice(-4)}` : "",
    scopes: normalizeMelhorEnvioScopes(secret.scopes),
    conta: secret.conta || null,
    connectedAt: toIsoString(secret.connectedAt),
    updatedAt: toIsoString(secret.updatedAt),
    expiresAt: toIsoString(secret.expiresAt),
    refreshTokenExpiresAt: toIsoString(secret.refreshTokenExpiresAt),
    lastRefreshAt: toIsoString(secret.lastRefreshAt),
    reconnectReason: secret.reconnectReason || "",
  };
}

function sanitizeFreteConfigForAdmin(config, secret = {}) {
  const connection = sanitizeMelhorEnvioConnectionForAdmin(secret, config);

  return {
    ...config,
    token: "",
    tokenConfigured: connection.status === "connected",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthClientConfigured: connection.clientConfigured,
    conexao: connection,
  };
}

function getMelhorEnvioBaseUrl(config) {
  return config.ambiente === "producao" ?
    "https://www.melhorenvio.com.br" :
    "https://sandbox.melhorenvio.com.br";
}

function getMelhorEnvioUserAgent(config) {
  const email = config.remetente.email || "contato@decoratie.com.br";
  return `Decoratie Store (${email})`;
}

function getMelhorEnvioAmbienteLabel(config) {
  return config.ambiente === "producao" ? "producao" : "sandbox";
}

function getMelhorEnvioOAuthAuthorizeUrl(config) {
  return `${getMelhorEnvioBaseUrl(config)}/oauth/authorize`;
}

function getMelhorEnvioOAuthTokenUrl(config) {
  return `${getMelhorEnvioBaseUrl(config)}/oauth/token`;
}

function getPublicBaseUrl(req) {
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers.host || "").trim();
  const proto = forwardedProto || req.protocol || "https";

  if (!host) {
    throw createHttpError(
        500,
        "callback_url_indisponivel",
        "Nao foi possivel montar a URL publica de callback.",
    );
  }

  return `${proto}://${host}`;
}

function getMelhorEnvioRedirectUri(req) {
  return `${getPublicBaseUrl(req)}/api/admin/frete/melhor-envio/oauth/callback`;
}

function buildAdminFreteRedirect(req, params = {}) {
  const search = new URLSearchParams(params);
  const query = search.toString();
  return `${getPublicBaseUrl(req)}/admin/configuracoes${query ? `?${query}` : ""}`;
}

async function melhorEnvioOAuthTokenRequest({config, body}) {
  const response = await fetch(getMelhorEnvioOAuthTokenUrl(config), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": getMelhorEnvioUserAgent(config),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = {raw: text};
    }
  }

  if (!response.ok) {
    const details = sanitizeMelhorEnvioErrorDetails(data, {
      status: response.status,
      ambiente: config.ambiente,
      endpoint: "/oauth/token",
    });
    const invalidCredentials = [400, 401, 403].includes(response.status);

    throw createHttpError(
        invalidCredentials ? 401 : 502,
        invalidCredentials ? "oauth_credenciais_invalidas" : "oauth_token_erro",
        invalidCredentials ?
          "Credenciais OAuth invalidas ou autorizacao expirada. Reconecte o Melhor Envio." :
          "Nao foi possivel obter token OAuth do Melhor Envio.",
        details,
    );
  }

  if (!data?.access_token) {
    throw createHttpError(
        502,
        "oauth_resposta_invalida",
        "O Melhor Envio nao retornou um access_token valido.",
        sanitizeMelhorEnvioErrorDetails(data),
    );
  }

  return data;
}

async function saveMelhorEnvioOAuthTokens({
  config,
  tokenData,
  client,
  previousSecret = {},
  conta = null,
  updatedBy = "system",
  connectedAt = null,
}) {
  const now = new Date();
  const {expiresAt, refreshTokenExpiresAt} = getMelhorEnvioTokenTimestamps(tokenData, now);
  const refreshToken = normalizeMelhorEnvioToken(
      tokenData.refresh_token || previousSecret.refreshToken || "",
  );

  if (!refreshToken) {
    throw createHttpError(
        502,
        "oauth_refresh_ausente",
        "O Melhor Envio nao retornou refresh_token para manter a conexao.",
    );
  }

  const payload = {
    provider: "melhor_envio",
    ambiente: config.ambiente,
    accessToken: normalizeMelhorEnvioToken(tokenData.access_token),
    refreshToken,
    tokenType: tokenData.token_type || "Bearer",
    expiresAt: timestampFromDate(expiresAt),
    refreshTokenExpiresAt: timestampFromDate(refreshTokenExpiresAt),
    scopes: normalizeMelhorEnvioScopes(tokenData.scope || previousSecret.scopes),
    status: "connected",
    reconnectReason: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy,
    token: admin.firestore.FieldValue.delete(),
  };

  if (client?.clientId) {
    payload.clientId = client.clientId;
  }

  if (client?.clientSecret) {
    payload.clientSecret = client.clientSecret;
  }

  if (client?.clientAmbiente || config.ambiente) {
    payload.clientAmbiente = client.clientAmbiente || config.ambiente;
  }

  if (conta) {
    payload.conta = conta;
  }

  if (connectedAt) {
    payload.connectedAt = connectedAt;
  } else if (!previousSecret.connectedAt) {
    payload.connectedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (previousSecret.accessToken && previousSecret.refreshToken) {
    payload.lastRefreshAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await db.collection("segredos").doc("melhor_envio").set(payload, {merge: true});

  return {
    ...previousSecret,
    ...payload,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt,
    refreshTokenExpiresAt,
    status: "connected",
    conta: conta || previousSecret.conta || null,
  };
}

async function markMelhorEnvioReconnectRequired(reason, details = null) {
  await db.collection("segredos").doc("melhor_envio").set({
    status: "reconnect_required",
    reconnectReason: reason,
    reconnectDetails: details,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
}

function sanitizeMelhorEnvioErrorDetails(data, extra = {}) {
  if (!data || typeof data !== "object") {
    return {
      ...extra,
      retorno: data || null,
    };
  }

  const safeData = {...data};
  delete safeData.token;
  delete safeData.access_token;
  delete safeData.refresh_token;

  return {
    ...extra,
    retorno: safeData,
  };
}

function createMelhorEnvioResponseError(response, data, config, path) {
  const ambiente = getMelhorEnvioAmbienteLabel(config);
  const details = sanitizeMelhorEnvioErrorDetails(data, {
    status: response.status,
    ambiente,
    endpoint: path,
  });

  if (response.status === 401) {
    return createHttpError(
        401,
        "token_invalido_ambiente",
        `Token invalido para o ambiente ${ambiente}. Confirme se ele foi gerado nesse ambiente e nao esta expirado.`,
        details,
    );
  }

  if (response.status === 403) {
    return createHttpError(
        403,
        "token_sem_permissao",
        "Token sem permissao para consultar cotacoes do Melhor Envio.",
        details,
    );
  }

  if (response.status === 404) {
    return createHttpError(
        502,
        "endpoint_melhor_envio",
        "Endpoint do Melhor Envio nao encontrado para a configuracao atual.",
        details,
    );
  }

  if (response.status === 422) {
    return createHttpError(
        422,
        "api_melhor_envio_validacao",
        "O Melhor Envio recusou os dados enviados para cotacao. Revise CEP, peso, dimensoes e servicos.",
        details,
    );
  }

  return createHttpError(
      response.status >= 500 ? 502 : response.status,
      "api_melhor_envio",
      "Nao foi possivel consultar o Melhor Envio agora.",
      details,
  );
}

async function melhorEnvioRequest({config, token, path, method = "GET", body = null}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const cleanToken = normalizeMelhorEnvioToken(token);

  if (!cleanToken) {
    throw createHttpError(
        409,
        "token_nao_configurado",
        "Token do Melhor Envio nao configurado.",
    );
  }

  try {
    const response = await fetch(`${getMelhorEnvioBaseUrl(config)}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
        "User-Agent": getMelhorEnvioUserAgent(config),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = {raw: text};
      }
    }

    if (!response.ok) {
      throw createMelhorEnvioResponseError(response, data, config, path);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw createHttpError(
          504,
          "timeout_melhor_envio",
          "A consulta ao Melhor Envio excedeu o tempo limite.",
      );
    }

    if (error.statusCode) {
      throw error;
    }

    throw createHttpError(
        502,
        "api_indisponivel",
        "Melhor Envio indisponivel no momento.",
        error.message,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function melhorEnvioFileRequest({
  config,
  token,
  path,
  method = "GET",
  body = null,
  accept = "application/pdf",
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const cleanToken = normalizeMelhorEnvioToken(token);

  if (!cleanToken) {
    throw createHttpError(
        409,
        "token_nao_configurado",
        "Token do Melhor Envio nao configurado.",
    );
  }

  try {
    const response = await fetch(`${getMelhorEnvioBaseUrl(config)}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Accept": accept,
        "Authorization": `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
        "User-Agent": getMelhorEnvioUserAgent(config),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const contentType = response.headers.get("content-type") || accept;
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      const text = buffer.toString("utf8");
      let data = text;

      if (contentType.includes("application/json") && text) {
        try {
          data = JSON.parse(text);
        } catch (error) {
          data = {raw: text};
        }
      }

      throw createMelhorEnvioResponseError(response, data, config, path);
    }

    return {
      buffer,
      contentType,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw createHttpError(
          504,
          "timeout_melhor_envio",
          "A consulta ao Melhor Envio excedeu o tempo limite.",
      );
    }

    if (error.statusCode) {
      throw error;
    }

    throw createHttpError(
        502,
        "api_indisponivel",
        "Melhor Envio indisponivel no momento.",
        error.message,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function isMelhorEnvioAuthError(error) {
  return [
    "token_invalido",
    "token_invalido_ambiente",
    "token_sem_permissao",
  ].includes(error?.code) || error?.statusCode === 401;
}

async function refreshMelhorEnvioAccessToken(config, reason = "expired") {
  const secret = await loadMelhorEnvioSecret();
  const client = getMelhorEnvioOAuthClient(secret, config);

  if (!client.configured) {
    throw createHttpError(
        409,
        "oauth_client_nao_configurado",
        "Configure Client ID e Secret do aplicativo Melhor Envio no painel admin.",
    );
  }

  if (client.clientAmbiente && client.clientAmbiente !== config.ambiente) {
    throw createHttpError(
        409,
        "oauth_ambiente_incorreto",
        "As credenciais OAuth salvas pertencem a outro ambiente.",
    );
  }

  if (!secret.refreshToken) {
    await markMelhorEnvioReconnectRequired("refresh_token_ausente");
    throw createHttpError(
        409,
        "reconexao_necessaria",
        "Reconexao necessaria: autorize o Melhor Envio novamente.",
    );
  }

  if (isExpiredOrExpiring(secret.refreshTokenExpiresAt)) {
    await markMelhorEnvioReconnectRequired("refresh_token_expirado");
    throw createHttpError(
        409,
        "reconexao_necessaria",
        "Reconexao necessaria: sua autorizacao expirou ou foi revogada.",
    );
  }

  try {
    const tokenData = await melhorEnvioOAuthTokenRequest({
      config,
      body: {
        grant_type: "refresh_token",
        refresh_token: secret.refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
      },
    });
    const nextSecret = await saveMelhorEnvioOAuthTokens({
      config,
      tokenData,
      client,
      previousSecret: secret,
      updatedBy: "oauth-refresh",
    });

    console.info("[frete] token Melhor Envio renovado", {
      ambiente: config.ambiente,
      reason,
      expiresAt: toIsoString(nextSecret.expiresAt),
    });

    return nextSecret.accessToken;
  } catch (error) {
    await markMelhorEnvioReconnectRequired(
        error.code || "refresh_token_falhou",
        error.details || error.message || null,
    );

    if (error.statusCode) {
      throw error;
    }

    throw createHttpError(
        409,
        "reconexao_necessaria",
        "Reconexao necessaria: nao foi possivel renovar a autorizacao do Melhor Envio.",
        error.message,
    );
  }
}

async function getValidMelhorEnvioAccessToken(config) {
  const secret = await loadMelhorEnvioSecret();
  const client = getMelhorEnvioOAuthClient(secret, config);

  if (!client.configured) {
    throw createHttpError(
        409,
        "oauth_client_nao_configurado",
        "Configure Client ID e Secret do aplicativo Melhor Envio no painel admin.",
    );
  }

  if (client.clientAmbiente && client.clientAmbiente !== config.ambiente) {
    throw createHttpError(
        409,
        "oauth_ambiente_incorreto",
        "Token invalido para o ambiente selecionado. Reconecte usando o ambiente correto.",
    );
  }

  if (!secret.accessToken || !secret.refreshToken) {
    throw createHttpError(
        409,
        "melhor_envio_nao_conectado",
        "Melhor Envio nao conectado. Conecte pelo painel admin.",
    );
  }

  if (secret.status === "reconnect_required" ||
      isExpiredOrExpiring(secret.refreshTokenExpiresAt)) {
    throw createHttpError(
        409,
        "reconexao_necessaria",
        "Reconexao necessaria: sua autorizacao expirou ou foi revogada.",
    );
  }

  if (isExpiredOrExpiring(secret.expiresAt, MELHOR_ENVIO_REFRESH_WINDOW_MS)) {
    return refreshMelhorEnvioAccessToken(config, "expiring");
  }

  return secret.accessToken;
}

async function melhorEnvioAuthenticatedRequest({
  config,
  path,
  method = "GET",
  body = null,
}) {
  const token = await getValidMelhorEnvioAccessToken(config);

  try {
    return await melhorEnvioRequest({config, token, path, method, body});
  } catch (error) {
    if (!isMelhorEnvioAuthError(error)) {
      throw error;
    }

    const refreshedToken = await refreshMelhorEnvioAccessToken(config, "api_401");
    return melhorEnvioRequest({
      config,
      token: refreshedToken,
      path,
      method,
      body,
    });
  }
}

async function melhorEnvioAuthenticatedFileRequest({
  config,
  path,
  method = "GET",
  body = null,
  accept = "application/pdf",
}) {
  const token = await getValidMelhorEnvioAccessToken(config);

  try {
    return await melhorEnvioFileRequest({config, token, path, method, body, accept});
  } catch (error) {
    if (!isMelhorEnvioAuthError(error)) {
      throw error;
    }

    const refreshedToken = await refreshMelhorEnvioAccessToken(config, "api_401");
    return melhorEnvioFileRequest({
      config,
      token: refreshedToken,
      path,
      method,
      body,
      accept,
    });
  }
}

function assertCep(value, fieldName = "CEP") {
  const cep = onlyDigits(value);

  if (cep.length !== 8) {
    throw createHttpError(
        400,
        "cep_invalido",
        `${fieldName} deve ter 8 digitos.`,
    );
  }

  return cep;
}

function buildServiceKey(companyId, serviceId) {
  return `${String(companyId || "").trim()}:${String(serviceId || "").trim()}`;
}

function getConfiguredServiceMap(config) {
  const enabled = config.servicos.filter((servico) => servico.ativo !== false);
  const map = new Map();

  enabled.forEach((servico) => {
    map.set(buildServiceKey(servico.companyId, servico.serviceId), servico);
    map.set(String(servico.serviceId), servico);
  });

  return map;
}

function resolveProductLogistics(product, config) {
  const defaults = config.dimensoesPadrao;
  const resolved = {
    peso: normalizePositiveNumber(product.peso, defaults.peso),
    altura: normalizePositiveNumber(product.altura, defaults.altura),
    largura: normalizePositiveNumber(product.largura, defaults.largura),
    comprimento: normalizePositiveNumber(product.comprimento, defaults.comprimento),
  };

  const invalid = Object.entries(resolved)
      .filter(([, value]) => !Number.isFinite(value) || value <= 0)
      .map(([key]) => key);

  return {resolved, invalid};
}

async function buildQuoteProducts(itens = [], config) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw createHttpError(
        400,
        "carrinho_vazio",
        "Informe os itens do carrinho para calcular o frete.",
    );
  }

  const grouped = new Map();

  itens.forEach((item) => {
    const produtoId = String(item?.produtoId || item?.id || "").trim();
    const quantidade = Math.max(1, Number.parseInt(item?.quantidade, 10) || 1);

    if (!produtoId) {
      return;
    }

    grouped.set(produtoId, (grouped.get(produtoId) || 0) + quantidade);
  });

  if (!grouped.size) {
    throw createHttpError(
        400,
        "carrinho_invalido",
        "Os itens do carrinho nao sao validos.",
    );
  }

  const docs = await Promise.all(
      Array.from(grouped.keys()).map((produtoId) =>
        db.collection("produtos").doc(produtoId).get(),
      ),
  );

  const missing = [];
  const invalid = [];
  let subtotal = 0;

  const products = docs.map((snapshot) => {
    if (!snapshot.exists) {
      missing.push(snapshot.id);
      return null;
    }

    const product = snapshot.data();
    const quantidade = grouped.get(snapshot.id);
    const price = round2(product.precoVenda ?? product.preco);
    const {resolved, invalid: invalidFields} = resolveProductLogistics(product, config);

    if (invalidFields.length) {
      invalid.push({
        produtoId: snapshot.id,
        nome: product.nome || snapshot.id,
        campos: invalidFields,
      });
      return null;
    }

    subtotal += price * quantidade;

    return {
      id: snapshot.id,
      width: resolved.largura,
      height: resolved.altura,
      length: resolved.comprimento,
      weight: resolved.peso,
      insurance_value: Math.max(0.01, price),
      quantity: quantidade,
    };
  }).filter(Boolean);

  if (missing.length) {
    throw createHttpError(
        404,
        "produto_nao_encontrado",
        "Um ou mais produtos do carrinho nao foram encontrados.",
        {produtos: missing},
    );
  }

  if (invalid.length) {
    throw createHttpError(
        422,
        "produto_sem_dimensoes",
        "Revise peso e dimensoes dos produtos antes de calcular o frete.",
        {produtos: invalid},
    );
  }

  return {
    products,
    subtotal: round2(subtotal),
  };
}

function buildMelhorEnvioPayload({config, cepDestino, products, services}) {
  const payload = {
    from: {
      postal_code: assertCep(config.cepOrigem, "CEP de origem"),
    },
    to: {
      postal_code: cepDestino,
    },
    products,
    options: {
      receipt: false,
      own_hand: false,
      collect: false,
    },
  };

  if (services.length) {
    payload.services = services.join(",");
  }

  return payload;
}

function normalizeMelhorEnvioOption(item, config, serviceMap, subtotal) {
  if (!item || item.error) {
    return null;
  }

  const serviceId = String(item.id || item.service_id || "").trim();
  const company = item.company || {};
  const companyId = String(company.id || item.company_id || "").trim();

  if (!serviceId) {
    return null;
  }

  const hasConfiguredServices = config.servicos.length > 0;
  const configured =
    serviceMap.get(buildServiceKey(companyId, serviceId)) ||
    serviceMap.get(serviceId) ||
    null;

  if (hasConfiguredServices && !configured) {
    return null;
  }

  const valorOriginal = round2(item.custom_price ?? item.price);
  const taxaManuseio = round2(config.taxaManuseio);
  const valorComTaxa = round2(valorOriginal + taxaManuseio);
  const freteGratisAplicado = Boolean(
      config.freteGratisAtivo &&
      Number.isFinite(config.freteGratisAcimaDe) &&
      config.freteGratisAcimaDe > 0 &&
      subtotal >= config.freteGratisAcimaDe,
  );
  const valorFinal = freteGratisAplicado ? 0 : valorComTaxa;
  const prazoCliente = buildPrazoClienteFromQuoteItem(
      item,
      config.diasExtrasPreparacao,
  );
  const prazo = prazoCliente.prazoOriginalTransportadora;
  const transportadora = configured?.transportadora ||
    company.name ||
    "Transportadora";
  const modalidade = configured?.nomeExibicao ||
    configured?.modalidade ||
    item.custom_name ||
    item.name ||
    "Servico";

  return {
    id: buildServiceKey(companyId, serviceId),
    provider: "melhor_envio",
    servicoId: serviceId,
    companyId,
    transportadora,
    modalidade,
    label: `${transportadora} ${modalidade}`.trim(),
    prazo,
    prazoOriginalTransportadora: prazoCliente.prazoOriginalTransportadora,
    diasExtrasPreparacao: prazoCliente.diasExtrasPreparacao,
    prazoFinalCliente: prazoCliente.prazoFinalCliente,
    prazoMinOriginal: prazoCliente.prazoMinOriginal,
    prazoMaxOriginal: prazoCliente.prazoMaxOriginal,
    prazoMinFinal: prazoCliente.prazoMinFinal,
    prazoMaxFinal: prazoCliente.prazoMaxFinal,
    prazoTexto: prazoCliente.prazoTexto,
    valor: valorFinal,
    valorOriginal,
    valorFinal,
    taxaManuseio,
    freteGratis: freteGratisAplicado,
    freteGratisAplicado,
    regraFreteGratis: freteGratisAplicado ? {
      valorMinimo: config.freteGratisAcimaDe,
    } : null,
    ordem: configured?.ordem ?? 999,
    cotacaoResumo: {
      id: serviceId,
      name: item.name || "",
      price: item.price ?? null,
      custom_price: item.custom_price ?? null,
      delivery_time: item.delivery_time ?? null,
      custom_delivery_time: item.custom_delivery_time ?? null,
      delivery_range: item.delivery_range ?? null,
      custom_delivery_range: item.custom_delivery_range ?? null,
      company: {
        id: companyId,
        name: company.name || "",
      },
    },
  };
}

function normalizeQuoteResponse(data, config, subtotal) {
  const list = Array.isArray(data) ? data : [];
  const serviceMap = getConfiguredServiceMap(config);

  return list
      .map((item) => normalizeMelhorEnvioOption(item, config, serviceMap, subtotal))
      .filter(Boolean)
      .sort((first, second) => {
        if (first.ordem !== second.ordem) {
          return first.ordem - second.ordem;
        }

        return first.valor - second.valor;
      });
}

function normalizeDeliveryDay(value) {
  const parsed = Number(String(value || "").replace(",", "."));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.ceil(parsed);
}

function firstValidDeliveryDay(...values) {
  for (const value of values) {
    const day = normalizeDeliveryDay(value);

    if (day !== null) {
      return day;
    }
  }

  return null;
}

function parseDeliveryRange(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    const day = normalizeDeliveryDay(value);
    return day === null ? null : {min: day, max: day};
  }

  if (Array.isArray(value)) {
    const min = firstValidDeliveryDay(value[0], value.min, value.minimum);
    const max = firstValidDeliveryDay(
        value[value.length - 1],
        value.max,
        value.maximum,
    );

    if (min === null && max === null) {
      return null;
    }

    const fallback = min ?? max;
    return {
      min: min ?? fallback,
      max: max ?? fallback,
    };
  }

  if (isPlainObject(value)) {
    const min = firstValidDeliveryDay(
        value.min,
        value.minimum,
        value.from,
        value.start,
        value.initial,
      );
    const max = firstValidDeliveryDay(
        value.max,
        value.maximum,
        value.to,
        value.end,
        value.final,
      );

    if (min === null && max === null) {
      return null;
    }

    const fallback = min ?? max;
    return {
      min: min ?? fallback,
      max: max ?? fallback,
    };
  }

  const matches = String(value).match(/\d+(?:[,.]\d+)?/g) || [];
  const days = matches.map(normalizeDeliveryDay).filter((day) => day !== null);

  if (!days.length) {
    return null;
  }

  return {
    min: days[0],
    max: days[days.length - 1],
  };
}

function normalizeDeliveryRange(range) {
  if (!range) {
    return null;
  }

  const min = normalizeDeliveryDay(range.min);
  const max = normalizeDeliveryDay(range.max);

  if (min === null && max === null) {
    return null;
  }

  const fallback = min ?? max;
  const normalizedMin = min ?? fallback;
  const normalizedMax = max ?? fallback;

  return {
    min: Math.min(normalizedMin, normalizedMax),
    max: Math.max(normalizedMin, normalizedMax),
  };
}

function formatPrazoTexto(min, max) {
  if (!Number.isFinite(min) || min <= 0) {
    return "Prazo sob consulta";
  }

  if (!Number.isFinite(max) || max <= 0 || min === max) {
    return min > 1 ? `${min} dias uteis` : "1 dia util";
  }

  return `${min} a ${max} dias uteis`;
}

function getRawDeliveryText(item = {}) {
  const candidates = [
    item.custom_delivery_time,
    item.delivery_time,
    item.custom_delivery_range,
    item.delivery_range,
  ];
  const value = candidates.find((candidate) =>
    typeof candidate === "string" || typeof candidate === "number",
  );

  return String(value || "").trim();
}

function buildPrazoClienteFromQuoteItem(item = {}, diasExtras) {
  const extras = normalizeNonNegativeInteger(diasExtras, 0);
  const range = normalizeDeliveryRange(
      parseDeliveryRange(item.custom_delivery_range) ||
      parseDeliveryRange(item.delivery_range) ||
      parseDeliveryRange(item.custom_delivery_time) ||
      parseDeliveryRange(item.delivery_time),
  );
  const originalText = getRawDeliveryText(item);

  if (!range) {
    return {
      prazoOriginalTransportadora: originalText || null,
      diasExtrasPreparacao: extras,
      prazoFinalCliente: originalText || null,
      prazoMinOriginal: null,
      prazoMaxOriginal: null,
      prazoMinFinal: null,
      prazoMaxFinal: null,
      prazoTexto: originalText || "Prazo sob consulta",
    };
  }

  const prazoMinFinal = range.min + extras;
  const prazoMaxFinal = range.max + extras;

  return {
    prazoOriginalTransportadora: range.max,
    diasExtrasPreparacao: extras,
    prazoFinalCliente: prazoMaxFinal,
    prazoMinOriginal: range.min,
    prazoMaxOriginal: range.max,
    prazoMinFinal,
    prazoMaxFinal,
    prazoTexto: formatPrazoTexto(prazoMinFinal, prazoMaxFinal),
  };
}

function getMelhorEnvioErrorText(error) {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (Array.isArray(error)) {
    return error.map(getMelhorEnvioErrorText).filter(Boolean).join("; ");
  }

  if (typeof error === "object") {
    return String(
        error.message ||
        error.error ||
        error.name ||
        JSON.stringify(error),
    ).slice(0, 300);
  }

  return String(error).slice(0, 300);
}

function summarizeMelhorEnvioRawItem(item = {}, index = 0) {
  const company = isPlainObject(item.company) ? item.company : {};
  const serviceId = String(item.id || item.service_id || "").trim();
  const companyId = String(company.id || item.company_id || "").trim();
  const error = getMelhorEnvioErrorText(item.error);

  return {
    index,
    serviceId,
    serviceName: String(item.name || item.custom_name || "").trim(),
    companyId,
    companyName: String(company.name || "").trim(),
    price: item.price ?? null,
    custom_price: item.custom_price ?? null,
    delivery_time: item.delivery_time ?? null,
    custom_delivery_time: item.custom_delivery_time ?? null,
    error: error || null,
  };
}

function buildMelhorEnvioUnavailableServices(rawItems = []) {
  return rawItems
      .map(summarizeMelhorEnvioRawItem)
      .filter((item) => item.error)
      .map((item) => ({
        serviceId: item.serviceId,
        companyId: item.companyId,
        nome: item.serviceName || "Servico",
        modalidade: item.serviceName || "Servico",
        transportadora: item.companyName || "Transportadora",
        mensagem: item.error,
      }));
}

function buildMelhorEnvioSampleAudit({
  config,
  cepDestino,
  products,
  payload,
  data,
  opcoes,
  updatedAt,
}) {
  const rawList = Array.isArray(data) ? data : [];
  const retornoBrutoResumo = rawList.map(summarizeMelhorEnvioRawItem);
  const modalidadesComErro = retornoBrutoResumo.filter((item) => item.error).length;
  const modalidadesSemServiceId = retornoBrutoResumo
      .filter((item) => !item.serviceId)
      .length;
  const modalidadesIgnoradas = Math.max(0, rawList.length - opcoes.length);
  const pacoteTeste = products[0] || null;
  const mensagem = opcoes.length ?
    `A API retornou ${opcoes.length} modalidade(s) disponivel(is) ` +
      `para o CEP e pacote de teste informados.` :
    "A API nao retornou modalidades disponiveis para o CEP e pacote de teste informados.";

  return {
    ambiente: config.ambiente,
    ultimaAtualizacao: updatedAt,
    cepOrigem: payload.from.postal_code,
    cepDestinoTeste: cepDestino,
    pacoteTeste,
    payloadTeste: {
      from: payload.from,
      to: payload.to,
      products,
      options: payload.options,
      services: payload.services || null,
    },
    retornoBrutoTotal: rawList.length,
    modalidadesDisponiveis: opcoes.length,
    modalidadesComErro,
    modalidadesSemServiceId,
    modalidadesIgnoradas,
    retornoBrutoResumo,
    mensagem,
  };
}

function logMelhorEnvioSampleAudit({config, auditoria, data}) {
  console.info("[frete] retorno bruto modalidades Melhor Envio", {
    ambiente: config.ambiente,
    cepOrigem: auditoria.cepOrigem,
    cepDestinoTeste: auditoria.cepDestinoTeste,
    pacoteTeste: auditoria.pacoteTeste,
    retornoBrutoTotal: auditoria.retornoBrutoTotal,
    modalidadesDisponiveis: auditoria.modalidadesDisponiveis,
    modalidadesComErro: auditoria.modalidadesComErro,
    modalidadesSemServiceId: auditoria.modalidadesSemServiceId,
    retornoBruto: data,
  });
}

function normalizeSamplePackage(config, pacoteTeste = null) {
  const rawPackage = isPlainObject(pacoteTeste) ? pacoteTeste : {};
  const dimensions = normalizeDimensions({
    peso: rawPackage.peso ?? rawPackage.weight,
    altura: rawPackage.altura ?? rawPackage.height,
    largura: rawPackage.largura ?? rawPackage.width,
    comprimento: rawPackage.comprimento ?? rawPackage.length,
  }, config.dimensoesPadrao);
  const valorDeclarado = normalizePositiveNumber(
      rawPackage.valorDeclarado ?? rawPackage.insurance_value,
      50,
  );

  return {
    id: "teste",
    width: dimensions.largura,
    height: dimensions.altura,
    length: dimensions.comprimento,
    weight: dimensions.peso,
    insurance_value: Math.max(0.01, valorDeclarado || 50),
    quantity: 1,
  };
}

async function quoteMelhorEnvio({config, cepDestino, itens}) {
  const enabledServices = config.servicos
      .filter((servico) => servico.ativo !== false)
      .map((servico) => servico.serviceId)
      .filter(Boolean);
  const {products, subtotal} = await buildQuoteProducts(itens, config);
  const payload = buildMelhorEnvioPayload({
    config,
    cepDestino,
    products,
    services: [...new Set(enabledServices)],
  });
  const data = await melhorEnvioAuthenticatedRequest({
    config,
    path: "/api/v2/me/shipment/calculate",
    method: "POST",
    body: payload,
  });
  const opcoes = normalizeQuoteResponse(data, config, subtotal);

  if (!opcoes.length) {
    throw createHttpError(
        404,
        "sem_transportadora",
        "Nenhuma transportadora disponivel para este carrinho e CEP.",
        data,
    );
  }

  return {
    provider: "melhor_envio",
    ativo: true,
    cepDestino,
    subtotal,
    opcoes,
    retiradaLocal: getRetiradaLocalConfig(config),
  };
}

function buildSampleQuoteProducts(config, pacoteTeste = null) {
  const product = normalizeSamplePackage(config, pacoteTeste);
  const invalid = Object.entries({
    peso: product.weight,
    altura: product.height,
    largura: product.width,
    comprimento: product.length,
    valorDeclarado: product.insurance_value,
  })
      .filter(([, value]) => !Number.isFinite(value) || value <= 0)
      .map(([key]) => key);

  if (invalid.length) {
    throw createHttpError(
        422,
        "dimensoes_padrao_invalidas",
        "Configure peso e dimensoes padrao validos.",
        {campos: invalid},
    );
  }

  return [product];
}

async function quoteMelhorEnvioSample({config, cepDestino, pacoteTeste = null}) {
  const products = buildSampleQuoteProducts(config, pacoteTeste);
  const payload = buildMelhorEnvioPayload({
    config,
    cepDestino,
    products,
    services: [],
  });
  const data = await melhorEnvioAuthenticatedRequest({
    config,
    path: "/api/v2/me/shipment/calculate",
    method: "POST",
    body: payload,
  });
  const opcoes = normalizeQuoteResponse(data, {...config, servicos: []}, 50);
  const indisponiveis = buildMelhorEnvioUnavailableServices(data);
  const auditoria = buildMelhorEnvioSampleAudit({
    config,
    cepDestino,
    products,
    payload,
    data,
    opcoes,
    updatedAt: new Date().toISOString(),
  });

  logMelhorEnvioSampleAudit({config, auditoria, data});

  return {
    opcoes,
    indisponiveis,
    auditoria,
  };
}

async function fetchMelhorEnvioAccount(config, accessToken) {
  try {
    const data = accessToken ?
      await melhorEnvioRequest({
        config,
        token: accessToken,
        path: "/api/v2/me",
      }) :
      await melhorEnvioAuthenticatedRequest({
        config,
        path: "/api/v2/me",
      });

    return buildMelhorEnvioAccountSummary(data);
  } catch (error) {
    console.warn("[frete] nao foi possivel carregar conta Melhor Envio", {
      code: error.code || "conta_indisponivel",
      message: error.message,
    });
    return null;
  }
}

async function verifyAdminRequest(req, res, next) {
  try {
    const authorization = String(req.headers.authorization || "");
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        erro: "Autenticacao obrigatoria.",
        code: "auth_obrigatoria",
      });
    }

    req.adminUser = await admin.auth().verifyIdToken(match[1]);
    return next();
  } catch (error) {
    return res.status(401).json({
      erro: "Sessao administrativa invalida.",
      code: "auth_invalida",
    });
  }
}

function getOrderNotificationBaseUrl(req) {
  const configuredUrl = getEnvValue(
      "APP_PUBLIC_URL",
      "app.public_url",
  ) || getEnvValue(
      "ORDER_NOTIFICATION_PUBLIC_URL",
      "notificacoes_pedido.public_url",
  );

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/g, "");
  }

  const origin = String(req.get("origin") || "").trim();
  if (origin) {
    return origin.replace(/\/+$/g, "");
  }

  const proto = String(req.get("x-forwarded-proto") || req.protocol || "https")
      .split(",")[0]
      .trim();
  const host = String(req.get("x-forwarded-host") || req.get("host") || "")
      .split(",")[0]
      .trim();

  return host ? `${proto}://${host}` : "";
}

function buildOrderAdminUrl(req, pedidoId) {
  const baseUrl = getOrderNotificationBaseUrl(req);

  if (!baseUrl) {
    return "";
  }

  const url = new URL("/admin/pedidos", baseUrl);
  url.searchParams.set("pedido", pedidoId);
  return url.toString();
}

function formatNotificationCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(toNumber(value));
}

function getOrderEntregaRetiradaLabel(frete = null) {
  if (!frete) {
    return "Não informado";
  }

  if (frete.provider === "retirada_local" || frete.tipo === "retirada") {
    return frete.modalidade || frete.titulo || "Retirada";
  }

  if (frete.provider === "a_combinar" || frete.tipo === "a_combinar") {
    return frete.modalidade || "Entrega a combinar";
  }

  return [frete.transportadora, frete.modalidade]
      .filter(Boolean)
      .join(" ") || "Entrega";
}

function getOrderPaymentLabel(pagamento = null) {
  if (!pagamento) {
    return "Não informado";
  }

  const labels = {
    pix: "Pix",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
  };

  return labels[pagamento.metodo] ||
    pagamento.metodo ||
    pagamento.provider ||
    "Não informado";
}

function normalizeOrderStatusForCreate(value) {
  const status = String(value || "").trim();
  const allowed = new Set([
    "pendente",
    "aguardando_pagamento",
    "pagamento_pendente",
    "pagamento_recusado",
    "pago",
    "enviado",
    "entregue",
    "cancelado",
  ]);

  return allowed.has(status) ? status : "pendente";
}

function normalizeOrderCustomerForCreate(value = {}) {
  if (!isPlainObject(value)) {
    throw createHttpError(
        422,
        "pedido_cliente_invalido",
        "Informe os dados do cliente para criar o pedido.",
    );
  }

  const endereco = isPlainObject(value.endereco) ? value.endereco : {};

  return {
    nome: String(value.nome || "").trim(),
    email: String(value.email || "").trim().toLowerCase(),
    telefone: String(value.telefone || "").trim(),
    documento: String(value.documento || "").trim(),
    documentoLimpo: onlyDigits(value.documentoLimpo || value.documento),
    tipoDocumento: String(value.tipoDocumento || "").trim(),
    endereco: {
      cep: String(endereco.cep || "").trim(),
      rua: String(endereco.rua || "").trim(),
      numero: String(endereco.numero || "").trim(),
      complemento: String(endereco.complemento || "").trim(),
      bairro: String(endereco.bairro || "").trim(),
      cidade: String(endereco.cidade || "").trim(),
      estado: String(endereco.estado || "").trim(),
    },
  };
}

function normalizeOrderItemsForCreate(value = []) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createHttpError(
        422,
        "pedido_sem_itens",
        "Inclua ao menos um produto no pedido.",
    );
  }

  return value.map((item) => {
    const quantity = Math.max(1, Number.parseInt(item?.quantidade, 10) || 1);
    const price = round2(item?.preco);

    if (!Number.isFinite(price) || price < 0) {
      throw createHttpError(
          422,
          "pedido_item_invalido",
          "Um produto do pedido possui preco invalido.",
          {produtoId: item?.produtoId || null},
      );
    }

    return {
      produtoId: String(item?.produtoId || "").trim(),
      nome: String(item?.nome || "Produto").trim(),
      preco: price,
      quantidade: quantity,
      imagem: String(item?.imagem || "").trim(),
    };
  });
}

function normalizeOrderPayloadForCreate(data = {}) {
  const subtotal = round2(data.subtotal);
  const total = round2(data.total);

  if (!Number.isFinite(total) || total < 0) {
    throw createHttpError(
        422,
        "pedido_total_invalido",
        "O total do pedido e invalido.",
    );
  }

  return {
    cliente: normalizeOrderCustomerForCreate(data.cliente),
    itens: normalizeOrderItemsForCreate(data.itens),
    frete: isPlainObject(data.frete) ? data.frete : null,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
    total,
    status: normalizeOrderStatusForCreate(data.status),
    pagamento: isPlainObject(data.pagamento) ? data.pagamento : null,
    notificationToken: String(data.notificationToken || "").trim(),
    notificationEmailSent: false,
    notificationWhatsappSent: false,
    notificationError: "",
    notificationSentAt: null,
  };
}

async function createOrderWithSequence(orderPayload) {
  const counterRef = db.collection("counters").doc("orders");
  const orderRef = db.collection("pedidos").doc();
  const initialCounterValue = await getInitialOrderCounterValue();
  let orderNumber = 0;

  await db.runTransaction(async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const lastNumber = Number(
        counterSnapshot.exists ?
          counterSnapshot.data()?.lastNumber || 0 :
          initialCounterValue,
    );

    orderNumber = Number.isFinite(lastNumber) && lastNumber > 0 ?
      Math.floor(lastNumber) + 1 :
      1;

    transaction.set(counterRef, {
      lastNumber: orderNumber,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    transaction.set(orderRef, {
      ...orderPayload,
      orderNumber,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return {
    id: orderRef.id,
    orderNumber,
  };
}

function getMelhorEnvioOrderIdFromOrder(order = {}) {
  const frete = isPlainObject(order.frete) ? order.frete : {};
  const melhorEnvio = isPlainObject(order.melhorEnvio) ? order.melhorEnvio : {};
  const etiqueta = isPlainObject(frete.etiqueta) ? frete.etiqueta : {};
  const candidates = [
    frete.melhorEnvioOrderId,
    frete.melhorEnvioId,
    frete.orderId,
    frete.order_id,
    frete.etiquetaId,
    frete.codigoEtiqueta,
    frete.shipmentOrderId,
    etiqueta.id,
    etiqueta.orderId,
    melhorEnvio.orderId,
    melhorEnvio.id,
    order.melhorEnvioOrderId,
    order.etiquetaMelhorEnvioId,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function getValidOrderNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

async function getInitialOrderCounterValue() {
  const snapshot = await db.collection("pedidos").select("orderNumber").get();
  let totalOrders = 0;
  let maxOrderNumber = 0;

  snapshot.forEach((docSnapshot) => {
    totalOrders += 1;
    maxOrderNumber = Math.max(
        maxOrderNumber,
        getValidOrderNumber(docSnapshot.data()?.orderNumber) || 0,
    );
  });

  return Math.max(totalOrders, maxOrderNumber);
}

async function normalizeExistingOrderNumbers() {
  const snapshot = await db.collection("pedidos").get();
  const orders = snapshot.docs
      .map((docSnapshot) => ({
        ref: docSnapshot.ref,
        id: docSnapshot.id,
        data: docSnapshot.data() || {},
      }))
      .sort((a, b) => {
        const dateA = toDate(a.data.createdAt)?.getTime() || 0;
        const dateB = toDate(b.data.createdAt)?.getTime() || 0;

        if (dateA !== dateB) {
          return dateA - dateB;
        }

        return a.id.localeCompare(b.id);
      });
  const usedNumbers = new Set();
  let nextNumber = 1;
  let updated = 0;
  let batch = db.batch();
  let operations = 0;

  orders.forEach((order) => {
    const existingNumber = getValidOrderNumber(order.data.orderNumber);

    if (existingNumber) {
      usedNumbers.add(existingNumber);
    }
  });

  for (const order of orders) {
    if (getValidOrderNumber(order.data.orderNumber)) {
      continue;
    }

    while (usedNumbers.has(nextNumber)) {
      nextNumber += 1;
    }

    usedNumbers.add(nextNumber);
    batch.set(order.ref, {
      orderNumber: nextNumber,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
    updated += 1;
    operations += 1;
    nextNumber += 1;

    if (operations >= 450) {
      await batch.commit();
      batch = db.batch();
      operations = 0;
    }
  }

  const lastNumber = Math.max(...Array.from(usedNumbers), orders.length, 0);
  batch.set(db.collection("counters").doc("orders"), {
    lastNumber,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  operations += 1;

  if (operations > 0) {
    await batch.commit();
  }

  return {
    total: orders.length,
    updated,
    lastNumber,
  };
}

function formatOrderAddress(endereco = null) {
  if (!isPlainObject(endereco)) {
    return "";
  }

  const line1 = [
    endereco.rua,
    endereco.numero,
    endereco.complemento,
  ].filter(Boolean).join(", ");
  const line2 = [
    endereco.bairro,
    endereco.cidade && endereco.estado ?
      `${endereco.cidade}/${endereco.estado}` :
      endereco.cidade || endereco.estado,
  ].filter(Boolean).join(" - ");
  const cep = endereco.cep ? `CEP: ${endereco.cep}` : "";

  return [line1, line2, cep].filter(Boolean).join(" | ");
}

function formatOrderReportDate(value) {
  let date = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else if (Number.isFinite(value?.seconds)) {
    date = new Date(value.seconds * 1000);
  } else if (Number.isFinite(value?._seconds)) {
    date = new Date(value._seconds * 1000);
  } else if (value) {
    const parsed = new Date(value);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (!date) {
    return "--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatOrderReportDateInput(value) {
  const [year, month, day] = String(value || "")
      .split("-")
      .map((part) => Number(part));

  if (!year || !month || !day) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function getOrderReportPickupSchedule(frete = {}) {
  const schedule = isPlainObject(frete.agendamentoRetirada) ?
    frete.agendamentoRetirada :
    isPlainObject(frete.retiradaAgendada) ? frete.retiradaAgendada : {};

  return {
    data: String(schedule.data || schedule.date || frete.dataRetirada || "").trim(),
    hora: String(schedule.hora || schedule.time || frete.horaRetirada || "").trim(),
    texto: String(schedule.texto || schedule.label || "").trim(),
  };
}

function getOrderReportDeadlineLabel(frete = {}) {
  const isPickup = frete.provider === "retirada_local" || frete.tipo === "retirada";

  if (isPickup) {
    const schedule = getOrderReportPickupSchedule(frete);
    const dateLabel = formatOrderReportDateInput(schedule.data);

    if (dateLabel && schedule.hora) {
      return `${dateLabel} as ${schedule.hora}`;
    }

    if (dateLabel) {
      return dateLabel;
    }

    const text = schedule.texto || frete.prazoTexto || frete.prazo || "";
    return String(text).replace(/^retirada\s+agendada:\s*/i, "").trim() || "--";
  }

  return frete.prazoTexto || frete.prazoFinalCliente || frete.prazo || "--";
}

function getOrderReportStatusLabel(status) {
  const labels = {
    pendente: "Pendente",
    aguardando_pagamento: "Aguardando pagamento",
    pagamento_pendente: "Pagamento pendente",
    pagamento_recusado: "Pagamento recusado",
    pago: "Pago",
    enviado: "Enviado",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };

  return labels[status] || status || "--";
}

function getOrderReportPaymentStatusLabel(pagamento = null) {
  if (!pagamento) {
    return "--";
  }

  const status = pagamento.statusMercadoPago || pagamento.status;
  const labels = {
    pending: "Pendente",
    approved: "Aprovado",
    authorized: "Autorizado",
    in_process: "Em analise",
    in_mediation: "Em mediacao",
    rejected: "Recusado",
    cancelled: "Cancelado",
    refunded: "Estornado",
    charged_back: "Chargeback",
    creating: "Criando pagamento",
  };

  return labels[status] || status || "--";
}

function getOrderReportPaymentAuthorizationCode(pagamento = null) {
  return String(
      pagamento?.authorizationCode ||
      pagamento?.authorization_code ||
      pagamento?.codigoAutorizacao ||
      pagamento?.transactionAuthorizationCode ||
      "",
  ).trim();
}

function getOrderReportPaymentLabel(pagamento = null) {
  if (!pagamento) {
    return "--";
  }

  const labels = {
    pix: "Pix",
    credit_card: "Cartao de credito",
    debit_card: "Cartao de debito",
  };

  return labels[pagamento.metodo] ||
    pagamento.metodo ||
    pagamento.provider ||
    "--";
}

function getOrderReportCode({pedidoId, order}) {
  const orderNumber = getValidOrderNumber(order?.orderNumber);
  return orderNumber ? String(orderNumber) : String(pedidoId || "");
}

function getOrderReportItems(order = {}) {
  return Array.isArray(order.itens) ? order.itens : [];
}

function buildOrderReportPdfBuffer({pedidoId, order}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 32,
      info: {
        Title: `Decoratie - Pedido ${getOrderReportCode({pedidoId, order})}`,
        Author: "Decoratie",
        Subject: "Relatorio de pedido",
      },
    });
    const cliente = isPlainObject(order.cliente) ? order.cliente : {};
    const frete = isPlainObject(order.frete) ? order.frete : {};
    const pagamento = isPlainObject(order.pagamento) ? order.pagamento : {};
    const itens = getOrderReportItems(order);
    const code = getOrderReportCode({pedidoId, order});
    const status = getOrderReportStatusLabel(order.status);
    const paymentLabel = getOrderReportPaymentLabel(pagamento);
    const paymentStatus = getOrderReportPaymentStatusLabel(pagamento);
    const authorizationCode = getOrderReportPaymentAuthorizationCode(pagamento);
    const trackingCode = String(
        order?.rastreio?.codigo ||
        order?.codigoRastreio ||
        order?.trackingCode ||
        order?.envio?.codigoRastreio ||
        "",
    ).trim();
    const deliveryValue = frete.valorPendente ?
      "A combinar" :
      formatNotificationCurrency(frete.valorFinal ?? frete.valor);
    const endereco = isPlainObject(cliente.endereco) ? cliente.endereco : {};
    const enderecoLines = formatOrderAddress(endereco).split(" | ").filter(Boolean);
    const addressText = enderecoLines.join(" - ");
    const subtotal = typeof order.subtotal === "number" ?
      order.subtotal :
      itens.reduce((sum, item) => {
        return sum + (toNumber(item?.preco) * toNumber(item?.quantidade));
      }, 0);
    const page = {
      left: doc.page.margins.left,
      right: doc.page.width - doc.page.margins.right,
      top: doc.page.margins.top,
      bottom: doc.page.height - doc.page.margins.bottom,
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    };
    const colors = {
      ink: "#1f1d1b",
      muted: "#6d7b76",
      soft: "#f8f5f1",
      card: "#fffdf9",
      line: "#ded8cf",
      accent: "#cd805d",
      sage: "#55756f",
      sageSoft: "#edf2ef",
      accentSoft: "#f7e8df",
    };

    function safe(value, fallback = "--") {
      const text = String(value ?? "").trim();
      return text || fallback;
    }

    function fit(value, limit = 80) {
      const text = safe(value);
      return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
    }

    function labelValue(label, value, x, y, width, options = {}) {
      const textOptions = {
        width,
        lineGap: 1,
      };

      if (options.height) {
        textOptions.height = options.height;
      }

      if (options.ellipsis) {
        textOptions.ellipsis = true;
      }

      doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .fillColor(colors.muted)
          .text(String(label || "").toUpperCase(), x, y, {
            width,
            characterSpacing: 0.4,
          });
      doc
          .font(options.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(options.size || 9.2)
          .fillColor(options.color || colors.ink)
          .text(fit(value, options.limit || 92), x, y + 11, textOptions);
    }

    function card(x, y, width, height, title) {
      doc
          .roundedRect(x, y, width, height, 10)
          .fillAndStroke(colors.card, colors.line);
      doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor(colors.sage)
          .text(String(title || "").toUpperCase(), x + 12, y + 11, {
            width: width - 24,
            characterSpacing: 0.6,
          });
    }

    function drawStatusTag(text, x, y, color, fill) {
      const width = Math.min(130, Math.max(74, doc.widthOfString(safe(text)) + 20));

      doc
          .roundedRect(x, y, width, 20, 10)
          .fill(fill);
      doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .fillColor(color)
          .text(safe(text).toUpperCase(), x, y + 6, {
            width,
            align: "center",
          });
      return width;
    }

    function drawProductsTable() {
      const tableX = page.left;
      const tableWidth = page.width;
      const startY = 360;
      const headerHeight = 24;
      const rowHeight = 25;
      const maxRows = 10;
      const visibleItems = itens.slice(0, maxRows);
      const cols = {
        product: tableX + 12,
        qty: tableX + tableWidth - 164,
        unit: tableX + tableWidth - 115,
        total: tableX + tableWidth - 56,
      };

      doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(colors.sage)
          .text("PRODUTOS", tableX, startY - 18, {
            width: tableWidth,
            characterSpacing: 0.6,
          });
      doc
          .roundedRect(tableX, startY, tableWidth, headerHeight, 8)
          .fill(colors.sage);
      doc
          .font("Helvetica-Bold")
          .fontSize(8.2)
          .fillColor("#ffffff")
          .text("Produto", cols.product, startY + 8, {width: 285})
          .text("Qtd", cols.qty, startY + 8, {width: 36, align: "right"})
          .text("Unit.", cols.unit, startY + 8, {width: 50, align: "right"})
          .text("Total", cols.total, startY + 8, {width: 56, align: "right"});

      if (!itens.length) {
        doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(colors.muted)
            .text("Nenhum produto informado.", tableX + 12, startY + 38);
      }

      visibleItems.forEach((item, index) => {
        const rowY = startY + headerHeight + 5 + index * rowHeight;
        const fill = index % 2 === 0 ? colors.card : "#fbfaf7";
        const quantidade = toNumber(item?.quantidade);
        const preco = toNumber(item?.preco);
        const total = preco * quantidade;

        doc
            .roundedRect(tableX, rowY, tableWidth, rowHeight - 2, 6)
            .fill(fill);
        doc
            .font("Helvetica")
            .fontSize(8.2)
            .fillColor(colors.ink)
            .text(safe(item?.nome, "Produto"), cols.product, rowY + 7, {
              width: 285,
              ellipsis: true,
            })
            .text(String(quantidade), cols.qty, rowY + 7, {
              width: 36,
              align: "right",
            })
            .text(formatNotificationCurrency(preco), cols.unit, rowY + 7, {
              width: 50,
              align: "right",
            })
            .font("Helvetica-Bold")
            .text(formatNotificationCurrency(total), cols.total, rowY + 7, {
              width: 56,
              align: "right",
            });
      });

      if (itens.length > visibleItems.length) {
        doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor(colors.muted)
            .text(
                `+ ${itens.length - visibleItems.length} item(ns) adicionais no pedido.`,
                tableX + 12,
                startY + headerHeight + 8 + visibleItems.length * rowHeight,
                {width: tableWidth - 24},
            );
      }
    }

    function drawTotals() {
      const width = 236;
      const x = page.right - width;
      const y = 676;

      doc
          .roundedRect(x, y, width, 92, 10)
          .fillAndStroke(colors.card, colors.line);

      [
        ["Subtotal", formatNotificationCurrency(subtotal)],
        ["Entrega/retirada", deliveryValue],
      ].forEach(([label, value], index) => {
        const rowY = y + 14 + index * 20;
        doc
            .font("Helvetica")
            .fontSize(8.5)
            .fillColor(colors.muted)
            .text(label, x + 14, rowY, {width: 108})
            .font("Helvetica-Bold")
            .fillColor(colors.ink)
            .text(value, x + 114, rowY, {width: 108, align: "right"});
      });

      doc
          .moveTo(x + 14, y + 56)
          .lineTo(x + width - 14, y + 56)
          .lineWidth(0.6)
          .strokeColor(colors.line)
          .stroke();
      doc
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .fillColor(colors.ink)
          .text("Total", x + 14, y + 70, {width: 70})
          .fontSize(14)
          .fillColor(colors.accent)
          .text(formatNotificationCurrency(order.total), x + 88, y + 67, {
            width: 134,
            align: "right",
          });
    }

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#ffffff");
    doc
        .rect(0, 0, doc.page.width, 8)
        .fill(colors.accent);
    doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(colors.sage)
        .text("DECORATIE", page.left, 30, {
          width: 200,
          characterSpacing: 1.6,
        });
    doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor(colors.ink)
        .text(`Pedido ${code}`, page.left, 48, {
          width: 260,
        });
    doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(colors.muted)
        .text("Relatorio administrativo do pedido", page.left, 76, {
          width: 260,
        });

    doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor(colors.accent)
        .text(formatNotificationCurrency(order.total), page.right - 180, 45, {
          width: 180,
          align: "right",
        });
    drawStatusTag(status, page.right - 180, 74, colors.sage, colors.sageSoft);
    drawStatusTag(paymentStatus, page.right - 90, 74, colors.accent, colors.accentSoft);

    const topY = 112;
    const gap = 10;
    const cardWidth = (page.width - gap) / 2;
    const leftX = page.left;
    const rightX = page.left + cardWidth + gap;

    card(leftX, topY, cardWidth, 118, "Cliente");
    labelValue("Nome", cliente.nome, leftX + 12, topY + 32, cardWidth - 24);
    labelValue("E-mail", cliente.email, leftX + 12, topY + 62, cardWidth - 24);
    labelValue("Telefone", cliente.telefone, leftX + 12, topY + 92, cardWidth - 24);

    card(rightX, topY, cardWidth, 118, "Resumo");
    labelValue("Data", formatOrderReportDate(order.createdAt), rightX + 12, topY + 32, cardWidth / 2 - 18);
    labelValue("Pagamento", paymentLabel, rightX + cardWidth / 2, topY + 32, cardWidth / 2 - 12);
    labelValue("Status", status, rightX + 12, topY + 68, cardWidth / 2 - 18);
    labelValue("Autorizacao", authorizationCode, rightX + cardWidth / 2, topY + 68, cardWidth / 2 - 12);
    if (trackingCode) {
      labelValue("Rastreio", trackingCode, rightX + 12, topY + 94, cardWidth - 24, {
        limit: 56,
      });
    }

    card(page.left, 244, page.width, 82, "Entrega ou retirada");
    labelValue("Tipo", getOrderEntregaRetiradaLabel(frete), page.left + 12, 276, 150, {
      height: 40,
      ellipsis: true,
    });
    labelValue(
        "Prazo",
        getOrderReportDeadlineLabel(frete),
        page.left + 184,
        276,
        114,
        {
          height: 40,
          ellipsis: true,
        },
    );
    labelValue("Valor", deliveryValue, page.left + 316, 276, 64, {
      height: 40,
      ellipsis: true,
    });
    labelValue("Endereco", addressText, page.left + 396, 276, page.width - 408, {
      limit: 88,
      size: 8.4,
      height: 40,
      ellipsis: true,
    });

    drawProductsTable();
    drawTotals();

    doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(colors.muted)
        .text(
            `Gerado em ${formatOrderReportDate(new Date())}`,
            page.left,
            786,
            {width: page.width, align: "right"},
        );

    doc.end();
  });
}

function buildOrderNotificationSummary({pedidoId, order, adminUrl}) {
  const cliente = isPlainObject(order.cliente) ? order.cliente : {};
  const itens = Array.isArray(order.itens) ? order.itens : [];
  const orderNumber = Number(order.orderNumber || 0);
  const pedidoCodigo = Number.isFinite(orderNumber) && orderNumber > 0 ?
    String(Math.floor(orderNumber)) :
    pedidoId;

  return {
    loja: "Decoratie",
    pedidoId,
    pedidoCodigo,
    orderNumber: Number.isFinite(orderNumber) && orderNumber > 0 ?
      Math.floor(orderNumber) :
      null,
    clienteNome: String(cliente.nome || "").trim(),
    clienteTelefone: String(cliente.telefone || "").trim(),
    enderecoEntrega: formatOrderAddress(cliente.endereco),
    tipoEntrega: getOrderEntregaRetiradaLabel(order.frete),
    produtos: itens.map((item) => ({
      nome: String(item?.nome || "Produto").trim(),
      quantidade: toNumber(item?.quantidade),
      valor: toNumber(item?.preco) * toNumber(item?.quantidade),
    })),
    total: toNumber(order.total),
    totalFormatado: formatNotificationCurrency(order.total),
    formaPagamento: getOrderPaymentLabel(order.pagamento),
    adminUrl,
  };
}

function buildOrderNotificationText(summary) {
  const lines = [
    "Novo pedido recebido na Decoratie",
    "",
    `Pedido: ${summary.pedidoCodigo}`,
    `Cliente: ${summary.clienteNome || "Não informado"}`,
    `Telefone: ${summary.clienteTelefone || "Não informado"}`,
  ];

  if (summary.enderecoEntrega) {
    lines.push(`Endereço de entrega: ${summary.enderecoEntrega}`);
  }

  lines.push(
      `Entrega/retirada: ${summary.tipoEntrega || "Não informado"}`,
      `Pagamento: ${summary.formaPagamento || "Não informado"}`,
      "",
      "Produtos:",
  );

  summary.produtos.forEach((item) => {
    lines.push(
        `- ${item.quantidade}x ${item.nome} (${formatNotificationCurrency(item.valor)})`,
    );
  });

  lines.push("", `Total: ${summary.totalFormatado}`);

  if (summary.adminUrl) {
    lines.push(`Painel administrativo: ${summary.adminUrl}`);
  }

  return lines.join("\n");
}

async function postNotificationJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ""}`);
  }

  return response.json().catch(() => ({}));
}

async function sendOrderEmailNotification({config, summary, text, to = "", subject = ""}) {
  const provider = getEmailNotificationProviderConfig();
  const recipient = normalizeNotificationEmail(to || config.email.destino);
  const resolvedSubject = subject || `Decoratie - novo pedido ${summary.pedidoCodigo}`;

  if (!provider.configured) {
    console.warn("[notificacoes] provedor de e-mail nao configurado", {
      pedidoId: summary.pedidoId,
      env: [
        "ORDER_NOTIFICATION_EMAIL_WEBHOOK_URL",
        "ORDER_NOTIFICATION_RESEND_API_KEY",
        "ORDER_NOTIFICATION_EMAIL_FROM",
      ],
    });
    return {sent: false, reason: "email_provider_not_configured"};
  }

  if (!recipient) {
    return {sent: false, reason: "email_recipient_not_configured"};
  }

  if (provider.webhookUrl) {
    await postNotificationJson(provider.webhookUrl, {
      channel: "email",
      to: recipient,
      subject: resolvedSubject,
      text,
      summary,
    });
    return {sent: true};
  }

  await postNotificationJson(
      "https://api.resend.com/emails",
      {
        from: provider.from,
        to: [recipient],
        subject: resolvedSubject,
        text,
      },
      {
        "Authorization": `Bearer ${provider.resendApiKey}`,
      },
  );

  return {sent: true};
}

async function sendOrderWhatsappNotification({config, summary, text, to = ""}) {
  const provider = getWhatsappNotificationProviderConfig();
  const recipient = normalizeNotificationPhone(to || config.whatsapp.destino);

  if (!provider.configured) {
    console.warn("[notificacoes] provedor de WhatsApp nao configurado", {
      pedidoId: summary.pedidoId,
      env: [
        "ORDER_NOTIFICATION_WHATSAPP_WEBHOOK_URL",
        "ORDER_NOTIFICATION_WHATSAPP_ACCESS_TOKEN",
        "ORDER_NOTIFICATION_WHATSAPP_PHONE_NUMBER_ID",
      ],
    });
    return {sent: false, reason: "whatsapp_provider_not_configured"};
  }

  if (!recipient || !isNotificationPhoneReady(recipient)) {
    return {sent: false, reason: "whatsapp_recipient_not_configured"};
  }

  if (provider.webhookUrl) {
    await postNotificationJson(provider.webhookUrl, {
      channel: "whatsapp",
      to: recipient,
      text,
      summary,
    });
    return {sent: true};
  }

  await postNotificationJson(
      `https://graph.facebook.com/${provider.apiVersion}/${provider.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: {
          preview_url: false,
          body: text,
        },
      },
      {
        "Authorization": `Bearer ${provider.accessToken}`,
      },
  );

  return {sent: true};
}

async function notifyStoreAboutOrder({
  pedidoId,
  notificationToken,
  req,
  force = false,
  requireNotificationToken = true,
  triggeredBy = "",
}) {
  const config = await loadOrderNotificationConfig();
  const orderRef = db.collection("pedidos").doc(pedidoId);
  const lockId = crypto.randomUUID();
  let pending = {email: false, whatsapp: false};
  let order = null;
  let skipped = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);

    if (!snapshot.exists) {
      throw createHttpError(
          404,
          "pedido_nao_encontrado",
          "Pedido nao encontrado para notificacao.",
      );
    }

    const currentOrder = snapshot.data() || {};
    const storedToken = String(currentOrder.notificationToken || "");

    if (
      requireNotificationToken &&
      (!storedToken || storedToken !== String(notificationToken || ""))
    ) {
      throw createHttpError(
          403,
          "notificacao_token_invalido",
          "Token de notificacao invalido para este pedido.",
      );
    }

    const processingAt = toDate(currentOrder.notificationProcessingAt);
    const locked = currentOrder.notificationProcessingId &&
      processingAt &&
      processingAt.getTime() > Date.now() - ORDER_NOTIFICATION_LOCK_TTL_MS;

    if (locked) {
      skipped = "notification_in_progress";
      return;
    }

    pending = {
      email: Boolean(
          config.email.ativo &&
          config.email.destino &&
          (force || currentOrder.notificationEmailSent !== true),
      ),
      whatsapp: Boolean(
          config.whatsapp.ativo &&
          config.whatsapp.destino &&
          (force || currentOrder.notificationWhatsappSent !== true),
      ),
    };

    if (!pending.email && !pending.whatsapp) {
      skipped = "no_pending_channels";
      return;
    }

    order = currentOrder;
    transaction.set(orderRef, {
      notificationProcessingId: lockId,
      notificationProcessingAt: admin.firestore.FieldValue.serverTimestamp(),
      notificationError: admin.firestore.FieldValue.delete(),
    }, {merge: true});
  });

  if (skipped) {
    return {
      sucesso: true,
      skipped,
      notificationEmailSent: false,
      notificationWhatsappSent: false,
    };
  }

  const summary = buildOrderNotificationSummary({
    pedidoId,
    order,
    adminUrl: buildOrderAdminUrl(req, pedidoId),
  });
  const text = buildOrderNotificationText(summary);
  const errors = [];
  let emailSent = false;
  let whatsappSent = false;

  if (pending.email) {
    try {
      const result = await sendOrderEmailNotification({config, summary, text});
      emailSent = Boolean(result.sent);
      if (!result.sent) {
        errors.push(`E-mail: ${result.reason || "nao enviado"}`);
      }
    } catch (error) {
      errors.push(`E-mail: ${error.message || "erro ao enviar"}`);
    }
  }

  if (pending.whatsapp) {
    try {
      const result = await sendOrderWhatsappNotification({config, summary, text});
      whatsappSent = Boolean(result.sent);
      if (!result.sent) {
        errors.push(`WhatsApp: ${result.reason || "nao enviado"}`);
      }
    } catch (error) {
      errors.push(`WhatsApp: ${error.message || "erro ao enviar"}`);
    }
  }

  const updatePayload = {
    notificationProcessingId: admin.firestore.FieldValue.delete(),
    notificationProcessingAt: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (pending.email) {
    updatePayload.notificationEmailSent = emailSent;
  }

  if (pending.whatsapp) {
    updatePayload.notificationWhatsappSent = whatsappSent;
  }

  if (emailSent || whatsappSent) {
    updatePayload.notificationSentAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (force) {
    updatePayload.notificationResentAt = admin.firestore.FieldValue.serverTimestamp();
    updatePayload.notificationResentBy = String(triggeredBy || "admin").slice(0, 200);
  }

  if (errors.length) {
    updatePayload.notificationError = errors.join(" | ").slice(0, 1500);
  } else {
    updatePayload.notificationError = admin.firestore.FieldValue.delete();
  }

  await orderRef.set(updatePayload, {merge: true});

  return {
    sucesso: true,
    notificationEmailSent: emailSent,
    notificationWhatsappSent: whatsappSent,
    notificationError: errors.join(" | "),
    resent: Boolean(force),
  };
}

function getOrderTrackingCode(order = {}) {
  return String(
      order?.rastreio?.codigo ||
      order?.codigoRastreio ||
      order?.trackingCode ||
      order?.envio?.codigoRastreio ||
      "",
  ).trim();
}

function buildOrderTrackingStatusSummary({pedidoId, order, trackingCode}) {
  const cliente = isPlainObject(order.cliente) ? order.cliente : {};
  const orderNumber = Number(order.orderNumber || 0);
  const pedidoCodigo = Number.isFinite(orderNumber) && orderNumber > 0 ?
    String(Math.floor(orderNumber)) :
    pedidoId;

  return {
    loja: "Decoratie",
    pedidoId,
    pedidoCodigo,
    clienteNome: String(cliente.nome || "").trim(),
    clienteEmail: normalizeNotificationEmail(cliente.email),
    clienteTelefone: normalizeNotificationPhone(cliente.telefone),
    status: getOrderReportStatusLabel(order.status || "enviado"),
    codigoRastreio: trackingCode,
    tipoEntrega: getOrderEntregaRetiradaLabel(order.frete),
  };
}

function buildOrderTrackingStatusText(summary) {
  const firstName = String(summary.clienteNome || "").trim().split(/\s+/)[0];
  const lines = [
    firstName ? `Ola, ${firstName}.` : "Ola.",
    "",
    "A Decoratie atualizou o status do seu pedido.",
    "",
    `Pedido: ${summary.pedidoCodigo}`,
    `Status: ${summary.status}`,
    `Codigo de rastreio: ${summary.codigoRastreio}`,
  ];

  if (summary.tipoEntrega) {
    lines.push(`Entrega/retirada: ${summary.tipoEntrega}`);
  }

  lines.push(
      "",
      "Use o codigo de rastreio para acompanhar a entrega junto a transportadora.",
      "Obrigada por comprar na Decoratie.",
  );

  return lines.join("\n");
}

async function notifyCustomerAboutTrackingStatus({
  pedidoId,
  trackingCode = "",
  triggeredBy = "",
}) {
  const config = await loadOrderNotificationConfig();
  const emailProviderConfigured = getEmailNotificationProviderConfig().configured;
  const whatsappProviderConfigured = getWhatsappNotificationProviderConfig().configured;
  const orderRef = db.collection("pedidos").doc(pedidoId);
  const lockId = crypto.randomUUID();
  let pending = {email: false, whatsapp: false};
  let order = null;
  let resolvedTrackingCode = String(trackingCode || "").trim();
  let skipped = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);

    if (!snapshot.exists) {
      throw createHttpError(
          404,
          "pedido_nao_encontrado",
          "Pedido nao encontrado para notificacao.",
      );
    }

    const currentOrder = snapshot.data() || {};
    resolvedTrackingCode = resolvedTrackingCode || getOrderTrackingCode(currentOrder);

    if (!resolvedTrackingCode) {
      throw createHttpError(
          422,
          "codigo_rastreio_obrigatorio",
          "Informe o codigo de rastreio para notificar o cliente.",
      );
    }

    const processingAt = toDate(currentOrder.trackingNotificationProcessingAt);
    const locked = currentOrder.trackingNotificationProcessingId &&
      processingAt &&
      processingAt.getTime() > Date.now() - ORDER_NOTIFICATION_LOCK_TTL_MS;

    if (locked) {
      skipped = "tracking_notification_in_progress";
      return;
    }

    const cliente = isPlainObject(currentOrder.cliente) ? currentOrder.cliente : {};
    const clienteEmail = normalizeNotificationEmail(cliente.email);
    const clienteWhatsapp = normalizeNotificationPhone(cliente.telefone);
    const sameCode = currentOrder.trackingNotificationCode === resolvedTrackingCode;

    pending = {
      email: Boolean(
          config.email.ativo &&
          emailProviderConfigured &&
          clienteEmail &&
          !(sameCode && currentOrder.trackingNotificationEmailSent === true),
      ),
      whatsapp: Boolean(
          config.whatsapp.ativo &&
          whatsappProviderConfigured &&
          clienteWhatsapp &&
          isNotificationPhoneReady(clienteWhatsapp) &&
          !(sameCode && currentOrder.trackingNotificationWhatsappSent === true),
      ),
    };

    if (!pending.email && !pending.whatsapp) {
      skipped = sameCode &&
        (currentOrder.trackingNotificationEmailSent === true ||
          currentOrder.trackingNotificationWhatsappSent === true) ?
        "tracking_notification_already_sent" :
        "tracking_notification_no_channels";
      return;
    }

    order = currentOrder;
    transaction.set(orderRef, {
      trackingNotificationProcessingId: lockId,
      trackingNotificationProcessingAt: admin.firestore.FieldValue.serverTimestamp(),
      trackingNotificationError: admin.firestore.FieldValue.delete(),
    }, {merge: true});
  });

  if (skipped) {
    return {
      sucesso: true,
      skipped,
      trackingNotificationEmailSent: false,
      trackingNotificationWhatsappSent: false,
      trackingNotificationCode: resolvedTrackingCode,
    };
  }

  const summary = buildOrderTrackingStatusSummary({
    pedidoId,
    order,
    trackingCode: resolvedTrackingCode,
  });
  const text = buildOrderTrackingStatusText(summary);
  const subject = `Decoratie - pedido ${summary.pedidoCodigo} enviado`;
  const errors = [];
  let emailSent = false;
  let whatsappSent = false;

  if (pending.email) {
    try {
      const result = await sendOrderEmailNotification({
        config,
        summary,
        text,
        to: summary.clienteEmail,
        subject,
      });
      emailSent = Boolean(result.sent);
      if (!result.sent) {
        errors.push(`E-mail: ${result.reason || "nao enviado"}`);
      }
    } catch (error) {
      errors.push(`E-mail: ${error.message || "erro ao enviar"}`);
    }
  }

  if (pending.whatsapp) {
    try {
      const result = await sendOrderWhatsappNotification({
        config,
        summary,
        text,
        to: summary.clienteTelefone,
      });
      whatsappSent = Boolean(result.sent);
      if (!result.sent) {
        errors.push(`WhatsApp: ${result.reason || "nao enviado"}`);
      }
    } catch (error) {
      errors.push(`WhatsApp: ${error.message || "erro ao enviar"}`);
    }
  }

  const updatePayload = {
    trackingNotificationProcessingId: admin.firestore.FieldValue.delete(),
    trackingNotificationProcessingAt: admin.firestore.FieldValue.delete(),
    trackingNotificationCode: resolvedTrackingCode,
    trackingNotificationStatus: order.status || "enviado",
    trackingNotificationRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    trackingNotificationRequestedBy: String(triggeredBy || "admin").slice(0, 200),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const sameCodeBeforeSend = order.trackingNotificationCode === resolvedTrackingCode;
  updatePayload.trackingNotificationEmailSent = pending.email ?
    emailSent :
    Boolean(sameCodeBeforeSend && order.trackingNotificationEmailSent === true);
  updatePayload.trackingNotificationWhatsappSent = pending.whatsapp ?
    whatsappSent :
    Boolean(sameCodeBeforeSend && order.trackingNotificationWhatsappSent === true);

  if (emailSent || whatsappSent) {
    updatePayload.trackingNotificationSentAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (errors.length) {
    updatePayload.trackingNotificationError = errors.join(" | ").slice(0, 1500);
  } else {
    updatePayload.trackingNotificationError = admin.firestore.FieldValue.delete();
  }

  await orderRef.set(updatePayload, {merge: true});

  return {
    sucesso: true,
    trackingNotificationEmailSent: updatePayload.trackingNotificationEmailSent,
    trackingNotificationWhatsappSent: updatePayload.trackingNotificationWhatsappSent,
    trackingNotificationError: errors.join(" | "),
    trackingNotificationCode: resolvedTrackingCode,
  };
}

function sendOrderNotificationError(res, error, fallbackMessage = "Nao foi possivel notificar a loja.") {
  console.error("[notificacoes] erro", {
    code: error.code || "notificacao_pedido_erro",
    statusCode: error.statusCode || 500,
    message: error.message,
    details: error.details || null,
  });

  return res.status(error.statusCode || 500).json({
    erro: error.message || fallbackMessage,
    code: error.code || "notificacao_pedido_erro",
    details: error.details || null,
  });
}

function sendOrderCreateError(res, error) {
  console.error("[pedidos] erro ao criar pedido", {
    code: error.code || "pedido_criacao_erro",
    statusCode: error.statusCode || 500,
    message: error.message,
    details: error.details || null,
  });

  return res.status(error.statusCode || 500).json({
    erro: error.message || "Nao foi possivel criar o pedido.",
    code: error.code || "pedido_criacao_erro",
    details: error.details || null,
  });
}

function sendFreteError(res, error, config = null) {
  console.error("[frete] erro", {
    code: error.code || "frete_erro",
    statusCode: error.statusCode || 500,
    message: error.message,
    details: error.details || null,
  });

  return res.status(error.statusCode || 500).json({
    erro: error.message || "Nao foi possivel calcular o frete.",
    code: error.code || "frete_erro",
    details: error.details || null,
    retiradaLocal: getRetiradaLocalConfig(config),
  });
}

function normalizeMercadoPagoToken(value) {
  const rawToken = String(value || "").trim();
  const placeholder = "token salvo. preencha para trocar.";

  if (!rawToken || rawToken.toLowerCase() === placeholder) {
    return "";
  }

  return rawToken
      .replace(/^Bearer\s+/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();
}

function normalizeMercadoPagoMethod(value) {
  const method = String(value || "").trim();

  if (["pix", "credit_card", "debit_card"].includes(method)) {
    return method;
  }

  if (method === "credito") {
    return "credit_card";
  }

  if (method === "debito") {
    return "debit_card";
  }

  return "";
}

function getMercadoPagoMethodFlag(method) {
  if (method === "credit_card") {
    return "credito";
  }

  if (method === "debit_card") {
    return "debito";
  }

  return method;
}

function getMercadoPagoBaseUrl(path) {
  if (path.startsWith("https://")) {
    return path;
  }

  if (path.startsWith("/users")) {
    return `https://api.mercadolibre.com${path}`;
  }

  return `https://api.mercadopago.com${path}`;
}

function sanitizeMercadoPagoErrorDetails(data, extra = {}) {
  if (!data || typeof data !== "object") {
    return {
      ...extra,
      retorno: data || null,
    };
  }

  const safeData = {...data};
  delete safeData.access_token;
  delete safeData.token;
  delete safeData.card_number;
  delete safeData.security_code;

  return {
    ...extra,
    retorno: safeData,
  };
}

function createMercadoPagoResponseError(response, data, path) {
  const details = sanitizeMercadoPagoErrorDetails(data, {
    status: response.status,
    endpoint: path,
  });

  if (response.status === 401) {
    return createHttpError(
        401,
        "mp_credenciais_invalidas",
        "Access Token do Mercado Pago invalido para o ambiente selecionado.",
        details,
    );
  }

  if (response.status === 403) {
    return createHttpError(
        403,
        "mp_sem_permissao",
        "Access Token do Mercado Pago sem permissao para criar pagamentos.",
        details,
    );
  }

  if (response.status === 400 || response.status === 422) {
    return createHttpError(
        422,
        "mp_validacao",
        "O Mercado Pago recusou os dados enviados para pagamento.",
        details,
    );
  }

  return createHttpError(
      response.status >= 500 ? 502 : response.status,
      "mp_api_erro",
      "Nao foi possivel conectar ao Mercado Pago agora.",
      details,
  );
}

async function mercadoPagoRequest({
  accessToken,
  path,
  method = "GET",
  body = null,
  idempotencyKey = "",
}) {
  const token = normalizeMercadoPagoToken(accessToken);

  if (!token) {
    throw createHttpError(
        409,
        "mp_token_nao_configurado",
        "Access Token do Mercado Pago nao configurado.",
    );
  }

  const headers = {
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (idempotencyKey) {
    headers["X-Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetch(getMercadoPagoBaseUrl(path), {
    method,
    headers,
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = {raw: text};
    }
  }

  if (!response.ok) {
    throw createMercadoPagoResponseError(response, data, path);
  }

  return data;
}

function getMercadoPagoWebhookUrl(req) {
  return `${getPublicBaseUrl(req)}/api/webhooks/mercado-pago`;
}

function buildMercadoPagoAccountSummary(data) {
  if (!isPlainObject(data)) {
    return null;
  }

  return {
    id: data.id || null,
    nickname: data.nickname || null,
    email: data.email || null,
    siteId: data.site_id || null,
    countryId: data.country_id || null,
  };
}

async function fetchMercadoPagoAccount(accessToken) {
  const data = await mercadoPagoRequest({
    accessToken,
    path: "/users/me",
  });

  return buildMercadoPagoAccountSummary(data);
}

function normalizeOrderFreightAmount(frete) {
  if (!frete) {
    return 0;
  }

  if (frete.valorPendente) {
    throw createHttpError(
        409,
        "pedido_frete_pendente",
        "O frete deste pedido ainda esta a combinar.",
    );
  }

  const value = frete.valorFinal ?? frete.valor ?? 0;
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw createHttpError(
        409,
        "pedido_frete_invalido",
        "O frete do pedido nao possui valor valido.",
    );
  }

  return round2(amount);
}

async function recalculateOrderTotals(order) {
  const items = Array.isArray(order.itens) ? order.itens : [];

  if (!items.length) {
    throw createHttpError(
        409,
        "pedido_sem_itens",
        "Pedido sem itens para pagamento.",
    );
  }

  const productSnapshots = await Promise.all(
      items.map((item) => db.collection("produtos")
          .doc(String(item.produtoId || ""))
          .get()),
  );
  let subtotal = 0;

  items.forEach((item, index) => {
    const quantity = Math.max(1, Number.parseInt(item.quantidade, 10) || 1);
    const product = productSnapshots[index].exists ?
      productSnapshots[index].data() :
      {};
    const unitPrice = round2(product.precoVenda ?? product.preco ?? item.preco);

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw createHttpError(
          409,
          "pedido_item_invalido",
          "Um item do pedido nao possui preco valido.",
          {produtoId: item.produtoId || null},
      );
    }

    subtotal += unitPrice * quantity;
  });

  const frete = normalizeOrderFreightAmount(order.frete);
  const total = round2(subtotal + frete);

  return {
    subtotal: round2(subtotal),
    frete,
    total,
  };
}

function assertMercadoPagoConfigured(config, secret, method = "") {
  const mercadoPago = config.mercadoPago;

  if (!mercadoPago.ativo) {
    throw createHttpError(
        409,
        "mp_desativado",
        "Mercado Pago desativado no painel admin.",
    );
  }

  if (!mercadoPago.publicKey) {
    throw createHttpError(
        409,
        "mp_public_key_nao_configurada",
        "Public Key do Mercado Pago nao configurada.",
    );
  }

  if (!secret.accessToken) {
    throw createHttpError(
        409,
        "mp_token_nao_configurado",
        "Access Token do Mercado Pago nao configurado.",
    );
  }

  if (method) {
    const flag = getMercadoPagoMethodFlag(method);

    if (!mercadoPago.metodos?.[flag]) {
      throw createHttpError(
          409,
          "mp_metodo_desativado",
          "Metodo de pagamento desativado no painel admin.",
          {metodo: method},
      );
    }
  }
}

function buildMercadoPagoPayer(order, bodyPayer = {}) {
  const cliente = order.cliente || {};
  const documentNumber = onlyDigits(
      cliente.documentoLimpo ||
      cliente.documento ||
      bodyPayer.identification?.number,
  );
  const documentType = cliente.tipoDocumento === "cnpj" ? "CNPJ" : "CPF";
  const phone = onlyDigits(cliente.telefone);
  const endereco = cliente.endereco || {};

  return {
    email: String(cliente.email || bodyPayer.email || "").trim(),
    first_name: String(cliente.nome || "").trim().split(/\s+/)[0] || undefined,
    last_name: String(cliente.nome || "").trim().split(/\s+/).slice(1).join(" ") || undefined,
    identification: {
      type: documentType,
      number: documentNumber,
    },
    phone: phone ? {
      area_code: phone.slice(0, 2),
      number: phone.slice(2),
    } : undefined,
    address: endereco.cep ? {
      zip_code: onlyDigits(endereco.cep),
      street_name: String(endereco.rua || "").trim(),
      street_number: String(endereco.numero || "").trim(),
    } : undefined,
  };
}

function buildPixExpiration(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function assertPaymentTotalMatches(receivedValue, calculatedTotal) {
  if (receivedValue === null || receivedValue === undefined || receivedValue === "") {
    return;
  }

  const received = round2(receivedValue);

  if (Math.abs(received - calculatedTotal) > 0.01) {
    throw createHttpError(
        409,
        "pedido_total_divergente",
        "Total enviado nao confere com o total recalculado no backend.",
        {totalRecebido: received, totalCalculado: calculatedTotal},
    );
  }
}

function getMercadoPagoCardParams(body = {}) {
  return {
    token: String(body.token || "").trim(),
    paymentMethodId: String(
        body.payment_method_id || body.paymentMethodId || "",
    ).trim(),
    issuerId: String(body.issuer_id || body.issuerId || "").trim(),
    cardBin: onlyDigits(body.card_bin || body.cardBin).slice(0, 6),
  };
}

function getRequestedInstallments(value) {
  const installments = Number.parseInt(value, 10);

  return Number.isInteger(installments) && installments >= 1 ?
    installments :
    null;
}

async function fetchMercadoPagoInstallments({
  accessToken,
  amount,
  paymentMethodId,
  issuerId = "",
  cardBin = "",
}) {
  const params = new URLSearchParams({
    amount: round2(amount).toFixed(2),
    payment_method_id: paymentMethodId,
  });

  if (cardBin) {
    params.set("bin", cardBin);
  }

  if (issuerId) {
    params.set("issuer.id", issuerId);
  }

  const data = await mercadoPagoRequest({
    accessToken,
    path: `/v1/payment_methods/installments?${params.toString()}`,
  });

  return Array.isArray(data) ? data : [];
}

async function resolveMercadoPagoInstallments({
  method,
  body,
  totals,
  config,
  secret,
}) {
  if (method === "debit_card") {
    return 1;
  }

  const requested = getRequestedInstallments(body.installments);
  const mercadoPago = config.mercadoPago;

  if (!requested) {
    throw createHttpError(
        400,
        "mp_parcela_invalida",
        "Selecione uma opcao de parcelamento valida.",
    );
  }

  if (requested > mercadoPago.maxParcelasCredito) {
    throw createHttpError(
        409,
        "mp_parcela_invalida",
        "Parcela acima do limite configurado no painel admin.",
        {
          selecionada: requested,
          maxParcelasCredito: mercadoPago.maxParcelasCredito,
        },
    );
  }

  const {paymentMethodId, issuerId, cardBin} = getMercadoPagoCardParams(body);

  if (!paymentMethodId) {
    throw createHttpError(
        400,
        "mp_cartao_token_invalido",
        "Forma do cartao e obrigatoria.",
    );
  }

  const installments = await fetchMercadoPagoInstallments({
    accessToken: secret.accessToken,
    amount: totals.total,
    paymentMethodId,
    issuerId,
    cardBin,
  });
  const payerCosts = installments.flatMap((item) =>
    Array.isArray(item?.payer_costs) ? item.payer_costs : [],
  );
  const selected = payerCosts.find((item) =>
    Number(item?.installments) === requested,
  );

  if (!selected) {
    throw createHttpError(
        409,
        "mp_parcela_invalida",
        "Parcela selecionada nao esta disponivel para este cartao.",
        {selecionada: requested},
    );
  }

  const minInstallmentAmount = Number(mercadoPago.valorMinimoParcela || 0);
  const installmentAmount = Number(selected.installment_amount || 0);

  if (minInstallmentAmount && installmentAmount < minInstallmentAmount) {
    throw createHttpError(
        409,
        "mp_parcela_minima",
        "Parcela abaixo do valor minimo configurado no painel admin.",
        {
          valorParcela: round2(installmentAmount),
          valorMinimoParcela: minInstallmentAmount,
        },
    );
  }

  return requested;
}

function buildMercadoPagoPaymentPayload({
  req,
  pedidoId,
  order,
  method,
  body,
  totals,
  config,
  installments,
}) {
  const mercadoPago = config.mercadoPago;
  const payer = buildMercadoPagoPayer(order, body.payer);
  const basePayload = {
    transaction_amount: totals.total,
    description: `Pedido Decoratie ${pedidoId}`,
    external_reference: pedidoId,
    notification_url: getMercadoPagoWebhookUrl(req),
    payer,
    metadata: {
      pedidoId,
      origem: "decoratie_checkout",
    },
  };

  if (method === "pix") {
    return {
      ...basePayload,
      payment_method_id: "pix",
      date_of_expiration: buildPixExpiration(mercadoPago.pixExpiraEmMinutos),
    };
  }

  const {token, paymentMethodId, issuerId} = getMercadoPagoCardParams(body);

  if (!token || !paymentMethodId) {
    throw createHttpError(
        400,
        "mp_cartao_token_invalido",
        "Token e forma do cartao sao obrigatorios.",
    );
  }

  return {
    ...basePayload,
    token,
    installments,
    payment_method_id: paymentMethodId,
    issuer_id: issuerId || undefined,
    capture: mercadoPago.capturaAutomatica,
  };
}

function mapMercadoPagoStatusToOrder(status) {
  if (status === "approved") {
    return "pago";
  }

  if (["pending", "in_process", "authorized"].includes(status)) {
    return "aguardando_pagamento";
  }

  if (status === "rejected") {
    return "pagamento_recusado";
  }

  if (status === "cancelled") {
    return "cancelado";
  }

  if (["refunded", "charged_back"].includes(status)) {
    return "cancelado";
  }

  return "pagamento_pendente";
}

function normalizeMercadoPagoPaymentRecord(payment, method) {
  const transactionData = payment?.point_of_interaction?.transaction_data || {};
  const card = payment?.card || {};
  const paymentMethod = payment?.payment_method || {};
  const transactionDetails = payment?.transaction_details || {};
  const status = String(payment?.status || "pending");
  const amount = round2(payment?.transaction_amount || 0);
  const installmentAmount = Number(transactionDetails.installment_amount);
  const totalPaidAmount = round2(transactionDetails.total_paid_amount || amount);

  return {
    provider: "mercado_pago",
    metodo: method,
    paymentId: payment?.id ? String(payment.id) : "",
    status,
    statusMercadoPago: status,
    statusDetail: payment?.status_detail || "",
    valor: amount,
    valorPago: totalPaidAmount,
    totalPaidAmount,
    installmentAmount: Number.isFinite(installmentAmount) ?
      round2(installmentAmount) :
      null,
    installments: payment?.installments || (method === "credit_card" ? 1 : null),
    paymentMethodId: payment?.payment_method_id || paymentMethod.id || "",
    paymentTypeId: paymentMethod.type || "",
    authorizationCode: payment?.authorization_code ||
      payment?.authorizationCode ||
      transactionDetails.authorization_code ||
      "",
    issuerId: payment?.issuer_id || payment?.issuer?.id || "",
    cardBrand: paymentMethod.id || "",
    lastFourDigits: card.last_four_digits || "",
    qrCode: transactionData.qr_code || "",
    qrCodeBase64: transactionData.qr_code_base64 || "",
    copiaECola: transactionData.qr_code || "",
    ticketUrl: transactionData.ticket_url || "",
    expiresAt: payment?.date_of_expiration || null,
    approvedAt: payment?.date_approved || null,
    createdAt: payment?.date_created || new Date().toISOString(),
    updatedAt: payment?.date_last_updated || new Date().toISOString(),
  };
}

function buildPaymentEvent(payment, source) {
  const status = String(payment?.status || "");
  const paymentId = payment?.id ? String(payment.id) : "";
  const updatedAt = payment?.date_last_updated || new Date().toISOString();

  return {
    eventKey: `${source}:${paymentId}:${status}:${updatedAt}`,
    source,
    paymentId,
    status,
    statusDetail: payment?.status_detail || "",
    receivedAt: new Date().toISOString(),
  };
}

async function updateOrderWithMercadoPagoPayment({
  pedidoId,
  payment,
  method,
  source,
}) {
  const orderRef = db.collection("pedidos").doc(pedidoId);
  let updatedOrder = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);

    if (!snapshot.exists) {
      throw createHttpError(
          404,
          "pedido_nao_encontrado",
          "Pedido nao encontrado para atualizar pagamento.",
      );
    }

    const order = snapshot.data() || {};
    const previousPayment = isPlainObject(order.pagamento) ? order.pagamento : {};
    const paymentRecord = normalizeMercadoPagoPaymentRecord(payment, method);
    const event = buildPaymentEvent(payment, source);
    const previousEvents = Array.isArray(previousPayment.eventos) ?
      previousPayment.eventos :
      [];
    const eventos = previousEvents.some((item) => item.eventKey === event.eventKey) ?
      previousEvents :
      [...previousEvents.slice(-19), event];
    const nextStatus = mapMercadoPagoStatusToOrder(paymentRecord.status);

    updatedOrder = {
      ...order,
      id: pedidoId,
      status: nextStatus,
      pagamento: {
        ...previousPayment,
        ...paymentRecord,
        eventos,
      },
      updatedAt: new Date().toISOString(),
    };

    transaction.set(orderRef, {
      status: nextStatus,
      pagamento: updatedOrder.pagamento,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  });

  return updatedOrder;
}

async function findOrderIdForMercadoPagoPayment(payment) {
  const externalReference = String(
      payment?.external_reference ||
      payment?.metadata?.pedidoId ||
      payment?.metadata?.pedido_id ||
      "",
  ).trim();

  if (externalReference) {
    const snapshot = await db.collection("pedidos").doc(externalReference).get();

    if (snapshot.exists) {
      return externalReference;
    }
  }

  const paymentId = payment?.id ? String(payment.id) : "";

  if (!paymentId) {
    return "";
  }

  const query = await db.collection("pedidos")
      .where("pagamento.paymentId", "==", paymentId)
      .limit(1)
      .get();

  return query.empty ? "" : query.docs[0].id;
}

function extractMercadoPagoWebhookPaymentId(req) {
  const body = isPlainObject(req.body) ? req.body : {};
  const resource = String(body.resource || body.topic || "").trim();
  const resourceId = resource.match(/\/payments\/(\d+)/)?.[1] || "";

  return String(
      req.query["data.id"] ||
      req.query.id ||
      body.data?.id ||
      body.id ||
      resourceId ||
      "",
  ).trim();
}

function parseMercadoPagoSignatureHeader(value) {
  const parts = String(value || "").split(",");
  const parsed = {};

  parts.forEach((part) => {
    const [key, val] = part.split("=");

    if (key && val) {
      parsed[key.trim()] = val.trim();
    }
  });

  return parsed;
}

function normalizeMercadoPagoSignatureDataId(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  return /^[a-z0-9]+$/i.test(rawValue) ? rawValue.toLowerCase() : rawValue;
}

function getMercadoPagoWebhookQueryValue(req, key) {
  const queryValue = req.query?.[key];

  if (queryValue !== undefined && queryValue !== null) {
    return Array.isArray(queryValue) ? queryValue[0] : queryValue;
  }

  try {
    const requestUrl = new URL(req.originalUrl || req.url || "", "https://decoratie.local");
    return requestUrl.searchParams.get(key) || "";
  } catch (error) {
    return "";
  }
}

function getMercadoPagoSignatureDataIdCandidates(req) {
  const body = isPlainObject(req.body) ? req.body : {};
  const queryData = isPlainObject(req.query?.data) ? req.query.data : {};
  const values = [
    getMercadoPagoWebhookQueryValue(req, "data.id"),
    getMercadoPagoWebhookQueryValue(req, "id"),
    getMercadoPagoWebhookQueryValue(req, "data_id"),
    queryData.id,
    body.data?.id,
    body.id,
  ];
  const candidates = [];

  values.forEach((value) => {
    const normalized = normalizeMercadoPagoSignatureDataId(value);

    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  });

  candidates.push("");

  return candidates;
}

function buildMercadoPagoSignatureManifest({dataId = "", requestId = "", ts = ""}) {
  let manifest = "";

  if (dataId) {
    manifest += `id:${dataId};`;
  }

  if (requestId) {
    manifest += `request-id:${requestId};`;
  }

  if (ts) {
    manifest += `ts:${ts};`;
  }

  return manifest;
}

function safeCompareHex(first, second) {
  const firstBuffer = Buffer.from(String(first || ""), "hex");
  const secondBuffer = Buffer.from(String(second || ""), "hex");

  if (firstBuffer.length !== secondBuffer.length || !firstBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function verifyMercadoPagoWebhookSignature(req, secret) {
  if (!secret) {
    return {verified: false, skipped: true};
  }

  const xSignature = String(req.headers["x-signature"] || "");
  const xRequestId = String(req.headers["x-request-id"] || "");
  const parsed = parseMercadoPagoSignatureHeader(xSignature);
  const ts = parsed.ts;
  const hash = parsed.v1;

  if (!ts || !hash) {
    throw createHttpError(
        401,
        "mp_webhook_assinatura_ausente",
        "Assinatura do webhook Mercado Pago ausente.",
    );
  }

  const dataIdCandidates = getMercadoPagoSignatureDataIdCandidates(req);
  const verified = dataIdCandidates.some((dataId) => {
    const manifest = buildMercadoPagoSignatureManifest({
      dataId,
      requestId: xRequestId,
      ts,
    });
    const expected = crypto
        .createHmac("sha256", secret)
        .update(manifest)
        .digest("hex");

    return safeCompareHex(expected, hash);
  });

  if (!verified) {
    throw createHttpError(
        401,
        "mp_webhook_assinatura_invalida",
        "Assinatura do webhook Mercado Pago invalida.",
        {
          candidateCount: dataIdCandidates.length,
          hasRequestId: Boolean(xRequestId),
          queryKeys: Object.keys(req.query || {}).slice(0, 12),
        },
    );
  }

  return {verified: true, skipped: false};
}

function sendMercadoPagoError(res, error) {
  console.error("[mercado_pago] erro", {
    code: error.code || "mp_erro",
    statusCode: error.statusCode || 500,
    message: error.message,
    details: error.details || null,
  });

  return res.status(error.statusCode || 500).json({
    erro: error.message || "Nao foi possivel processar o pagamento.",
    code: error.code || "mp_erro",
    details: error.details || null,
  });
}

async function fetchRemoteImage(sourceUrl) {
  const url = parseRemoteUrl(sourceUrl);

  if (!url) {
    throw new Error("A URL da imagem informada nao e valida.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DecoratieBot/1.0; +https://decoratie-38ba6.web.app)",
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`A origem retornou status ${response.status}.`);
    }

    const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim();
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error("A URL informada nao retornou uma imagem valida.");
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
      throw new Error("A imagem retornada pela origem esta vazia.");
    }

    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error("A imagem excede o limite de 10 MB para importacao.");
    }

    return {
      buffer,
      contentType,
      sourceUrl: url,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Tempo limite excedido ao baixar a imagem remota.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRemoteImageWithFallback(primaryUrl, fallbackUrl) {
  const primary = parseRemoteUrl(primaryUrl);
  const fallback = parseRemoteUrl(fallbackUrl);

  if (!primary && !fallback) {
    throw new Error("Nenhuma URL de imagem valida foi informada.");
  }

  const tried = new Set();

  if (primary) {
    tried.add(primary.toString());

    try {
      return await fetchRemoteImage(primary);
    } catch (error) {
      if (!fallback || tried.has(fallback.toString())) {
        throw error;
      }
    }
  }

  return fetchRemoteImage(fallback);
}

async function importarImagemProduto({imageUrl, fallbackUrl, productId, productName}) {
  const {buffer, contentType, sourceUrl} = await fetchRemoteImageWithFallback(
      imageUrl,
      fallbackUrl,
  );
  const baseName = sanitizeFileName(productName) || "produto";
  const extension = getImageExtension(contentType, sourceUrl.pathname);
  const folderName = sanitizeFileName(productId) || "manual";
  const filePath = `public/products/${folderName}/${Date.now()}-${baseName}.${extension}`;
  const token = crypto.randomUUID();
  const bucket = admin.storage().bucket();
  const file = bucket.file(filePath);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        firebaseStorageDownloadTokens: token,
        originalSourceUrl: sourceUrl.toString(),
      },
    },
  });

  return {
    path: filePath,
    url: buildFirebaseDownloadUrl(bucket.name, filePath, token),
    contentType,
    sourceUrl: sourceUrl.toString(),
  };
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

app.post("/api/frete/cotar", async (req, res) => {
  let config = null;

  try {
    const body = await obterBodyJson(req);
    const cepDestino = assertCep(body.cepDestino, "CEP de destino");
    config = await loadFreteConfig();

    if (!config.ativo) {
      return res.json({
        provider: "melhor_envio",
        ativo: false,
        opcoes: [],
        retiradaLocal: getRetiradaLocalConfig(config),
        mensagem: "O Melhor Envio esta desativado nas configuracoes de frete.",
      });
    }

    if (!config.cepOrigem) {
      throw createHttpError(
          409,
          "cep_origem_nao_configurado",
          "CEP de origem nao configurado para o Melhor Envio.",
      );
    }

    const result = await quoteMelhorEnvio({
      config,
      cepDestino,
      itens: body.itens,
    });

    return res.json(result);
  } catch (error) {
    return sendFreteError(res, error, config);
  }
});

app.get("/api/admin/frete/config", verifyAdminRequest, async (req, res) => {
  try {
    const config = await loadFreteConfig();
    const secret = await loadMelhorEnvioSecret();

    return res.json({
      config: sanitizeFreteConfigForAdmin(config, secret),
    });
  } catch (error) {
    return sendFreteError(res, error);
  }
});

app.post("/api/admin/frete/config", verifyAdminRequest, async (req, res) => {
  try {
    const body = await obterBodyJson(req);
    const config = normalizeFreteConfig(body);
    const oauthClientId = String(body.oauthClientId || "").trim();
    const oauthClientSecret = String(body.oauthClientSecret || "").trim();

    await db.collection("configuracoes").doc("frete").set({
      ...config,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.adminUser.uid,
    }, {merge: true});

    if (oauthClientId || oauthClientSecret) {
      const secretPayload = {
        clientAmbiente: config.ambiente,
        token: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: req.adminUser.uid,
      };

      if (oauthClientId) {
        secretPayload.clientId = oauthClientId;
      }

      if (oauthClientSecret) {
        secretPayload.clientSecret = oauthClientSecret;
      }

      await db.collection("segredos").doc("melhor_envio").set({
        ...secretPayload,
      }, {merge: true});
    }

    const secret = await loadMelhorEnvioSecret();

    return res.json({
      sucesso: true,
      config: sanitizeFreteConfigForAdmin(config, secret),
    });
  } catch (error) {
    return sendFreteError(res, error);
  }
});

app.get(
    "/api/admin/frete/melhor-envio/oauth/start",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const storedConfig = await loadFreteConfig();
        const config = normalizeFreteConfig({
          ...storedConfig,
          ambiente: req.query.ambiente || storedConfig.ambiente,
        });
        const secret = await loadMelhorEnvioSecret();
        const client = getMelhorEnvioOAuthClient(secret, config);
        const redirectUri = getMelhorEnvioRedirectUri(req);

        if (!client.configured) {
          throw createHttpError(
              409,
              "oauth_client_nao_configurado",
              "Configure Client ID e Secret do Melhor Envio antes de conectar.",
              {redirectUri},
          );
        }

        if (client.clientAmbiente && client.clientAmbiente !== config.ambiente) {
          throw createHttpError(
              409,
              "oauth_ambiente_incorreto",
              "As credenciais OAuth salvas pertencem a outro ambiente.",
              {ambienteCredencial: client.clientAmbiente, ambienteAtual: config.ambiente},
          );
        }

        const state = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + MELHOR_ENVIO_OAUTH_STATE_TTL_MS);

        await db.collection("oauth_states").doc(state).set({
          provider: "melhor_envio",
          ambiente: config.ambiente,
          redirectUri,
          returnTo: "/admin/configuracoes",
          uid: req.adminUser.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: timestampFromDate(expiresAt),
        });

        const params = new URLSearchParams({
          client_id: client.clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: MELHOR_ENVIO_OAUTH_SCOPES.join(" "),
          state,
        });

        return res.json({
          url: `${getMelhorEnvioOAuthAuthorizeUrl(config)}?${params.toString()}`,
          redirectUri,
          ambiente: config.ambiente,
          scopes: MELHOR_ENVIO_OAUTH_SCOPES,
        });
      } catch (error) {
        return sendFreteError(res, error);
      }
    },
);

app.get("/api/admin/frete/melhor-envio/oauth/callback", async (req, res) => {
  let redirectParams = {
    freteOAuth: "erro",
  };

  try {
    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();
    const errorParam = String(req.query.error || "").trim();

    if (errorParam) {
      throw createHttpError(
          400,
          "oauth_autorizacao_negada",
          "Autorizacao do Melhor Envio cancelada ou negada.",
          {error: errorParam},
      );
    }

    if (!code || !state) {
      throw createHttpError(
          400,
          "oauth_callback_invalido",
          "Callback OAuth invalido: code ou state ausente.",
      );
    }

    const stateRef = db.collection("oauth_states").doc(state);
    const stateSnapshot = await stateRef.get();

    if (!stateSnapshot.exists) {
      throw createHttpError(
          400,
          "oauth_state_invalido",
          "Sessao OAuth expirada. Inicie a conexao novamente.",
      );
    }

    const stateData = stateSnapshot.data() || {};

    if (isExpiredOrExpiring(stateData.expiresAt)) {
      await stateRef.delete();
      throw createHttpError(
          400,
          "oauth_state_expirado",
          "Sessao OAuth expirada. Inicie a conexao novamente.",
      );
    }

    const storedConfig = await loadFreteConfig();
    const config = normalizeFreteConfig({
      ...storedConfig,
      ambiente: stateData.ambiente,
    });
    const secret = await loadMelhorEnvioSecret();
    const client = getMelhorEnvioOAuthClient(secret, config);

    if (!client.configured) {
      throw createHttpError(
          409,
          "oauth_client_nao_configurado",
          "Credenciais OAuth do Melhor Envio nao configuradas.",
      );
    }

    const tokenData = await melhorEnvioOAuthTokenRequest({
      config,
      body: {
        grant_type: "authorization_code",
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: stateData.redirectUri,
        code,
      },
    });
    const accessToken = normalizeMelhorEnvioToken(tokenData.access_token);
    const conta = await fetchMelhorEnvioAccount(config, accessToken);

    await saveMelhorEnvioOAuthTokens({
      config,
      tokenData,
      client,
      previousSecret: secret,
      conta,
      updatedBy: stateData.uid || "oauth-callback",
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await stateRef.delete();

    redirectParams = {
      freteOAuth: "connected",
    };
  } catch (error) {
    console.error("[frete] callback OAuth Melhor Envio falhou", {
      code: error.code || "oauth_callback_erro",
      message: error.message,
      details: error.details || null,
    });
    redirectParams = {
      freteOAuth: "erro",
      code: error.code || "oauth_callback_erro",
    };
  }

  return res.redirect(302, buildAdminFreteRedirect(req, redirectParams));
});

app.post(
    "/api/admin/frete/melhor-envio/desconectar",
    verifyAdminRequest,
    async (req, res) => {
      try {
        await db.collection("segredos").doc("melhor_envio").set({
          accessToken: admin.firestore.FieldValue.delete(),
          refreshToken: admin.firestore.FieldValue.delete(),
          expiresAt: admin.firestore.FieldValue.delete(),
          refreshTokenExpiresAt: admin.firestore.FieldValue.delete(),
          tokenType: admin.firestore.FieldValue.delete(),
          conta: admin.firestore.FieldValue.delete(),
          connectedAt: admin.firestore.FieldValue.delete(),
          lastRefreshAt: admin.firestore.FieldValue.delete(),
          reconnectReason: admin.firestore.FieldValue.delete(),
          status: "not_connected",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: req.adminUser.uid,
        }, {merge: true});

        const config = await loadFreteConfig();
        const secret = await loadMelhorEnvioSecret();

        return res.json({
          sucesso: true,
          config: sanitizeFreteConfigForAdmin(config, secret),
        });
      } catch (error) {
        return sendFreteError(res, error);
      }
    },
);

app.post("/api/admin/frete/testar-conexao", verifyAdminRequest, async (req, res) => {
  try {
    const body = await obterBodyJson(req);
    const storedConfig = await loadFreteConfig();
    const config = normalizeFreteConfig({
      ...storedConfig,
      ...body,
    });

    if (!config.cepOrigem) {
      throw createHttpError(
          409,
          "cep_origem_nao_configurado",
          "Informe o CEP de origem antes de testar a conexao.",
      );
    }

    const cepDestino = assertCep(
        body.cepDestinoTeste || config.cepOrigem,
        "CEP de teste",
    );

    const quote = await quoteMelhorEnvioSample({
      config,
      cepDestino,
      pacoteTeste: body.pacoteTeste,
    });
    const conta = await fetchMelhorEnvioAccount(config);

    return res.json({
      sucesso: true,
      mensagem: "Conexao com Melhor Envio validada por cotacao real.",
      ambiente: config.ambiente,
      cepOrigem: config.cepOrigem,
      cepDestinoTeste: cepDestino,
      servicosEncontrados: quote.opcoes.length,
      retornoBrutoTotal: quote.auditoria.retornoBrutoTotal,
      auditoria: quote.auditoria,
      conta,
    });
  } catch (error) {
    return sendFreteError(res, error);
  }
});

app.post(
    [
      "/api/admin/frete/buscar-transportadoras",
      "/api/admin/frete/buscar-modalidades",
    ],
    verifyAdminRequest,
    async (req, res) => {
      try {
        const body = await obterBodyJson(req);
        const storedConfig = await loadFreteConfig();
        const config = normalizeFreteConfig({
          ...storedConfig,
          ...body,
        });

        if (!config.cepOrigem) {
          throw createHttpError(
              409,
              "cep_origem_nao_configurado",
              "Informe o CEP de origem antes de buscar transportadoras.",
          );
        }

        const cepDestino = assertCep(
            body.cepDestinoTeste || body.cepDestino || config.cepOrigem,
            "CEP de teste",
        );

        const quote = await quoteMelhorEnvioSample({
          config,
          cepDestino,
          pacoteTeste: body.pacoteTeste,
        });
        const servicos = quote.opcoes.map((opcao, index) => ({
          serviceId: opcao.servicoId,
          companyId: opcao.companyId,
          transportadora: opcao.transportadora,
          modalidade: opcao.modalidade,
          serviceName: opcao.cotacaoResumo?.name || opcao.modalidade,
          companyName: opcao.cotacaoResumo?.company?.name || opcao.transportadora,
          nomeExibicao: "",
          ativo: true,
          ordem: index,
          prazo: opcao.prazo,
          valor: opcao.valorOriginal,
          ambiente: config.ambiente,
          ultimaAtualizacao: quote.auditoria.ultimaAtualizacao,
          cepOrigemTeste: quote.auditoria.cepOrigem,
          cepDestinoTeste: quote.auditoria.cepDestinoTeste,
          pacoteTeste: quote.auditoria.pacoteTeste,
        }));

        return res.json({
          sucesso: true,
          servicos,
          disponiveis: servicos,
          indisponiveis: quote.indisponiveis,
          auditoria: quote.auditoria,
          mensagem: quote.auditoria.mensagem,
        });
      } catch (error) {
        return sendFreteError(res, error);
      }
    },
);

app.get(
    "/api/admin/notificacoes-pedido/config",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const config = await loadOrderNotificationConfig();

        return res.json({
          config: sanitizeOrderNotificationConfigForAdmin(config),
        });
      } catch (error) {
        return sendOrderNotificationError(res, error);
      }
    },
);

app.post(
    "/api/admin/notificacoes-pedido/config",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const body = await obterBodyJson(req);
        const config = normalizeOrderNotificationConfig(body);
        validateOrderNotificationConfig(config);

        await db.collection("segredos").doc("notificacoes_pedido").set({
          email: config.email,
          whatsapp: config.whatsapp,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: req.adminUser.uid,
        }, {merge: true});

        const savedConfig = await loadOrderNotificationConfig();

        return res.json({
          sucesso: true,
          config: sanitizeOrderNotificationConfigForAdmin(savedConfig),
        });
      } catch (error) {
        return sendOrderNotificationError(res, error);
      }
    },
);

app.post("/api/pedidos", async (req, res) => {
  try {
    const body = await obterBodyJson(req);
    const orderPayload = normalizeOrderPayloadForCreate(body);
    const result = await createOrderWithSequence(orderPayload);

    return res.status(201).json({
      sucesso: true,
      pedidoId: result.id,
      orderNumber: result.orderNumber,
    });
  } catch (error) {
    return sendOrderCreateError(res, error);
  }
});

app.post("/api/pedidos/:pedidoId/notificar-novo-pedido", async (req, res) => {
  try {
    const pedidoId = String(req.params.pedidoId || "").trim();
    const body = await obterBodyJson(req);
    const notificationToken = String(body.notificationToken || "").trim();

    if (!pedidoId) {
      throw createHttpError(
          400,
          "pedido_id_obrigatorio",
          "Pedido obrigatorio para notificacao.",
      );
    }

    const result = await notifyStoreAboutOrder({
      pedidoId,
      notificationToken,
      req,
    });

    return res.json(result);
  } catch (error) {
    return sendOrderNotificationError(res, error);
  }
});

app.post(
    "/api/admin/pedidos/:pedidoId/reenviar-notificacao",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const pedidoId = String(req.params.pedidoId || "").trim();

        if (!pedidoId) {
          throw createHttpError(
              400,
              "pedido_id_obrigatorio",
              "Pedido obrigatorio para reenviar notificacao.",
          );
        }

        const result = await notifyStoreAboutOrder({
          pedidoId,
          req,
          force: true,
          requireNotificationToken: false,
          triggeredBy: req.adminUser.uid,
        });

        return res.json({
          ...result,
          pedidoId,
        });
      } catch (error) {
        return sendOrderNotificationError(res, error);
      }
    },
);

app.post(
    "/api/admin/pedidos/:pedidoId/notificar-rastreio",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const pedidoId = String(req.params.pedidoId || "").trim();
        const body = await obterBodyJson(req);
        const trackingCode = String(body.trackingCode || "").trim();

        if (!pedidoId) {
          throw createHttpError(
              400,
              "pedido_id_obrigatorio",
              "Pedido obrigatorio para notificar o cliente.",
          );
        }

        const result = await notifyCustomerAboutTrackingStatus({
          pedidoId,
          trackingCode,
          triggeredBy: req.adminUser.uid,
        });

        return res.json({
          ...result,
          pedidoId,
        });
      } catch (error) {
        return sendOrderNotificationError(
            res,
            error,
            "Nao foi possivel notificar o cliente.",
        );
      }
    },
);

app.post(
    "/api/admin/pedidos/normalizar-numeros",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const result = await normalizeExistingOrderNumbers();

        return res.json({
          sucesso: true,
          ...result,
        });
      } catch (error) {
        return sendOrderCreateError(res, error);
      }
    },
);

app.get(
    "/api/admin/pedidos/:pedidoId/relatorio-pdf",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const pedidoId = String(req.params.pedidoId || "").trim();

        if (!pedidoId) {
          throw createHttpError(
              400,
              "pedido_id_obrigatorio",
              "Pedido obrigatorio para gerar relatorio.",
          );
        }

        const orderSnapshot = await db.collection("pedidos").doc(pedidoId).get();

        if (!orderSnapshot.exists) {
          throw createHttpError(
              404,
              "pedido_nao_encontrado",
              "Pedido nao encontrado.",
          );
        }

        const order = orderSnapshot.data() || {};
        const pdf = await buildOrderReportPdfBuffer({pedidoId, order});
        const orderNumber = getValidOrderNumber(order.orderNumber);
        const filename = orderNumber ?
          `decoratie-pedido-${orderNumber}-relatorio.pdf` :
          `decoratie-pedido-relatorio.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-store");

        return res.send(pdf);
      } catch (error) {
        return sendOrderCreateError(res, error);
      }
    },
);

app.get(
    "/api/admin/pedidos/:pedidoId/etiqueta-melhor-envio",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const pedidoId = String(req.params.pedidoId || "").trim();

        if (!pedidoId) {
          throw createHttpError(
              400,
              "pedido_id_obrigatorio",
              "Pedido obrigatorio para imprimir etiqueta.",
          );
        }

        const orderSnapshot = await db.collection("pedidos").doc(pedidoId).get();

        if (!orderSnapshot.exists) {
          throw createHttpError(
              404,
              "pedido_nao_encontrado",
              "Pedido nao encontrado.",
          );
        }

        const order = orderSnapshot.data() || {};
        const melhorEnvioOrderId = getMelhorEnvioOrderIdFromOrder(order);

        if (!melhorEnvioOrderId) {
          throw createHttpError(
              409,
              "me_etiqueta_ausente",
              "Este pedido ainda nao possui etiqueta gerada no Melhor Envio.",
          );
        }

        const config = await loadFreteConfig();
        const file = await melhorEnvioAuthenticatedFileRequest({
          config,
          path: `/api/v2/me/imprimir/pdf/${encodeURIComponent(melhorEnvioOrderId)}`,
          accept: "application/pdf, application/json",
        });
        const orderNumber = getValidOrderNumber(order.orderNumber);
        const filename = orderNumber ?
          `decoratie-pedido-${orderNumber}-melhor-envio.pdf` :
          `decoratie-etiqueta-melhor-envio-${pedidoId}.pdf`;

        res.setHeader("Content-Type", file.contentType || "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-store");

        return res.send(file.buffer);
      } catch (error) {
        return sendFreteError(res, error);
      }
    },
);

app.get("/api/pagamentos/mercado-pago/config-publica", async (req, res) => {
  try {
    const config = await loadPagamentosConfig();
    const secret = await loadMercadoPagoSecret();

    return res.json(sanitizePagamentosConfigForPublic(config, secret));
  } catch (error) {
    return sendMercadoPagoError(res, error);
  }
});

app.get(
    "/api/admin/pagamentos/mercado-pago/config",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const config = await loadPagamentosConfig();
        const secret = await loadMercadoPagoSecret();

        return res.json({
          config: sanitizePagamentosConfigForAdmin(config, secret),
        });
      } catch (error) {
        return sendMercadoPagoError(res, error);
      }
    },
);

app.post(
    "/api/admin/pagamentos/mercado-pago/config",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const body = await obterBodyJson(req);
        const config = normalizeMercadoPagoConfig(body);
        const accessToken = normalizeMercadoPagoToken(
            body.accessToken || body.mercadoPago?.accessToken,
        );
        const webhookSecret = String(
            body.webhookSecret || body.mercadoPago?.webhookSecret || "",
        ).trim();

        await db.collection("configuracoes").doc("pagamentos").set({
          ...config,
          mercadoPago: {
            ...config.mercadoPago,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: req.adminUser.uid,
          },
        }, {merge: true});

        if (accessToken || webhookSecret) {
          const secretPayload = {
            provider: "mercado_pago",
            ambiente: config.mercadoPago.ambiente,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: req.adminUser.uid,
          };

          if (accessToken) {
            secretPayload.accessToken = accessToken;
            secretPayload.status = "configured";
            secretPayload.lastError = admin.firestore.FieldValue.delete();
          }

          if (webhookSecret) {
            secretPayload.webhookSecret = webhookSecret;
          }

          await db.collection("segredos").doc("mercado_pago")
              .set(secretPayload, {merge: true});
        }

        const secret = await loadMercadoPagoSecret();

        return res.json({
          sucesso: true,
          config: sanitizePagamentosConfigForAdmin(config, secret),
        });
      } catch (error) {
        return sendMercadoPagoError(res, error);
      }
    },
);

app.post(
    "/api/admin/pagamentos/mercado-pago/testar-conexao",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const config = await loadPagamentosConfig();
        const secret = await loadMercadoPagoSecret();

        assertMercadoPagoConfigured(config, secret);

        const conta = await fetchMercadoPagoAccount(secret.accessToken);

        await db.collection("segredos").doc("mercado_pago").set({
          status: "connected",
          conta,
          lastTestAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: req.adminUser.uid,
        }, {merge: true});

        await db.collection("configuracoes").doc("pagamentos").set({
          mercadoPago: {
            status: "connected",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: req.adminUser.uid,
          },
        }, {merge: true});

        return res.json({
          sucesso: true,
          mensagem: "Conexao Mercado Pago validada.",
          conta,
          config: sanitizePagamentosConfigForAdmin(
              await loadPagamentosConfig(),
              await loadMercadoPagoSecret(),
          ),
        });
      } catch (error) {
        await db.collection("segredos").doc("mercado_pago").set({
          status: "credential_error",
          lastError: error.message || "Erro ao testar Mercado Pago.",
          lastTestAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true}).catch(() => null);

        return sendMercadoPagoError(res, error);
      }
    },
);

app.post("/api/pagamentos/mercado-pago/criar-pagamento", async (req, res) => {
  try {
    const body = await obterBodyJson(req);
    const pedidoId = String(body.pedidoId || "").trim();
    const method = normalizeMercadoPagoMethod(body.metodo || body.method);

    if (!pedidoId) {
      throw createHttpError(
          400,
          "pedido_id_obrigatorio",
          "Pedido obrigatorio para criar pagamento.",
      );
    }

    if (!method) {
      throw createHttpError(
          400,
          "mp_metodo_invalido",
          "Metodo de pagamento invalido.",
      );
    }

    const config = await loadPagamentosConfig();
    const secret = await loadMercadoPagoSecret();

    assertMercadoPagoConfigured(config, secret, method);

    const orderRef = db.collection("pedidos").doc(pedidoId);
    const orderSnapshot = await orderRef.get();

    if (!orderSnapshot.exists) {
      throw createHttpError(
          404,
          "pedido_nao_encontrado",
          "Pedido nao encontrado para pagamento.",
      );
    }

    const order = orderSnapshot.data() || {};
    const existingPayment = order.pagamento || {};

    if (existingPayment.paymentId && existingPayment.status === "approved") {
      return res.json({
        sucesso: true,
        pedidoId,
        pedidoStatus: "pago",
        pagamento: existingPayment,
      });
    }

    const totals = await recalculateOrderTotals(order);
    assertPaymentTotalMatches(body.valor ?? body.total, totals.total);

    const installments = ["credit_card", "debit_card"].includes(method) ?
      await resolveMercadoPagoInstallments({
        method,
        body,
        totals,
        config,
        secret,
      }) :
      null;

    const paymentPayload = buildMercadoPagoPaymentPayload({
      req,
      pedidoId,
      order,
      method,
      body,
      totals,
      config,
      installments,
    });
    const payment = await mercadoPagoRequest({
      accessToken: secret.accessToken,
      path: "/v1/payments",
      method: "POST",
      body: paymentPayload,
      idempotencyKey: String(body.idempotencyKey || crypto.randomUUID()),
    });
    const updatedOrder = await updateOrderWithMercadoPagoPayment({
      pedidoId,
      payment,
      method,
      source: "checkout",
    });

    return res.json({
      sucesso: true,
      pedidoId,
      pedidoStatus: updatedOrder.status,
      pagamento: updatedOrder.pagamento,
    });
  } catch (error) {
    return sendMercadoPagoError(res, error);
  }
});

app.post("/api/pagamentos/mercado-pago/consultar-status", async (req, res) => {
  try {
    const body = await obterBodyJson(req);
    const pedidoId = String(body.pedidoId || "").trim();
    const paymentId = String(body.paymentId || "").trim();

    if (!pedidoId) {
      throw createHttpError(
          400,
          "pedido_id_obrigatorio",
          "Pedido obrigatorio para consultar pagamento.",
      );
    }

    if (!paymentId) {
      throw createHttpError(
          400,
          "mp_payment_id_ausente",
          "Payment ID obrigatorio para consultar pagamento.",
      );
    }

    const orderSnapshot = await db.collection("pedidos").doc(pedidoId).get();

    if (!orderSnapshot.exists) {
      throw createHttpError(
          404,
          "pedido_nao_encontrado",
          "Pedido nao encontrado.",
      );
    }

    const order = orderSnapshot.data() || {};
    const orderPaymentId = String(order.pagamento?.paymentId || "").trim();

    if (!orderPaymentId || orderPaymentId !== paymentId) {
      throw createHttpError(
          403,
          "mp_payment_id_invalido",
          "Pagamento nao pertence ao pedido informado.",
      );
    }

    const secret = await loadMercadoPagoSecret();
    const payment = await mercadoPagoRequest({
      accessToken: secret.accessToken,
      path: `/v1/payments/${paymentId}`,
    });
    const method = normalizeMercadoPagoMethod(order.pagamento?.metodo) ||
      normalizeMercadoPagoMethod(
          payment.payment_method?.type === "bank_transfer" ?
            "pix" :
            payment.payment_method?.type,
      ) ||
      normalizeMercadoPagoMethod(payment.payment_type_id) ||
      "pix";
    const updatedOrder = await updateOrderWithMercadoPagoPayment({
      pedidoId,
      payment,
      method,
      source: "checkout_polling",
    });

    return res.json({
      sucesso: true,
      pedidoId,
      pedidoStatus: updatedOrder.status,
      pagamento: updatedOrder.pagamento,
    });
  } catch (error) {
    return sendMercadoPagoError(res, error);
  }
});

app.post("/api/webhooks/mercado-pago", async (req, res) => {
  try {
    const paymentId = extractMercadoPagoWebhookPaymentId(req);

    if (!paymentId) {
      return res.status(200).json({
        sucesso: true,
        ignorado: true,
        motivo: "payment_id_ausente",
      });
    }

    const secret = await loadMercadoPagoSecret();

    verifyMercadoPagoWebhookSignature(req, secret.webhookSecret);

    const payment = await mercadoPagoRequest({
      accessToken: secret.accessToken,
      path: `/v1/payments/${paymentId}`,
    });
    const pedidoId = await findOrderIdForMercadoPagoPayment(payment);

    if (!pedidoId) {
      console.warn("[mercado_pago] webhook sem pedido", {
        paymentId,
        status: payment?.status,
      });

      return res.status(200).json({
        sucesso: true,
        ignorado: true,
        motivo: "pedido_nao_encontrado",
      });
    }

    const method = normalizeMercadoPagoMethod(
        payment.payment_method?.type === "bank_transfer" ?
          "pix" :
          payment.payment_method?.type,
    ) || normalizeMercadoPagoMethod(payment.payment_type_id) || "pix";
    const updatedOrder = await updateOrderWithMercadoPagoPayment({
      pedidoId,
      payment,
      method,
      source: "webhook",
    });

    return res.json({
      sucesso: true,
      pedidoId,
      status: updatedOrder.status,
    });
  } catch (error) {
    return sendMercadoPagoError(res, error);
  }
});

app.post(
    "/api/admin/pedidos/:pedidoId/consultar-pagamento",
    verifyAdminRequest,
    async (req, res) => {
      try {
        const pedidoId = String(req.params.pedidoId || "").trim();
        const orderRef = db.collection("pedidos").doc(pedidoId);
        const orderSnapshot = await orderRef.get();

        if (!orderSnapshot.exists) {
          throw createHttpError(
              404,
              "pedido_nao_encontrado",
              "Pedido nao encontrado.",
          );
        }

        const order = orderSnapshot.data() || {};
        const paymentId = order.pagamento?.paymentId;

        if (!paymentId) {
          throw createHttpError(
              409,
              "mp_payment_id_ausente",
              "Pedido sem paymentId Mercado Pago.",
          );
        }

        const secret = await loadMercadoPagoSecret();
        const payment = await mercadoPagoRequest({
          accessToken: secret.accessToken,
          path: `/v1/payments/${paymentId}`,
        });
        const method = normalizeMercadoPagoMethod(order.pagamento?.metodo) ||
          normalizeMercadoPagoMethod(payment.payment_method?.type) ||
          "pix";
        const updatedOrder = await updateOrderWithMercadoPagoPayment({
          pedidoId,
          payment,
          method,
          source: "admin",
        });

        return res.json({
          sucesso: true,
          pedido: updatedOrder,
          pagamento: updatedOrder.pagamento,
          pedidoStatus: updatedOrder.status,
        });
      } catch (error) {
        return sendMercadoPagoError(res, error);
      }
    },
);

app.get("/api/produtos/baixar-imagem", async (req, res) => {
  try {
    const imageUrl = String(req.query.url || "");
    const fallbackUrl = String(req.query.fallbackUrl || "");
    const productName = String(req.query.productName || "imagem-produto");
    const {buffer, contentType, sourceUrl} = await fetchRemoteImageWithFallback(
        imageUrl,
        fallbackUrl,
    );
    const extension = getImageExtension(contentType, sourceUrl.pathname);
    const filename = `${sanitizeFileName(productName) || "imagem-produto"}.${extension}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
    );
    return res.send(buffer);
  } catch (error) {
    return res.status(400).json({
      erro: error.message || "Nao foi possivel baixar a imagem.",
    });
  }
});

app.post("/api/produtos/importar-imagem", async (req, res) => {
  try {
    const body = await obterBodyJson(req);
    const imageUrl = String(body.imageUrl || "");
    const fallbackUrl = String(body.fallbackUrl || "");
    const productId = String(body.productId || "");
    const productName = String(body.productName || "produto");

    const importedImage = await importarImagemProduto({
      imageUrl,
      fallbackUrl,
      productId,
      productName,
    });

    return res.json({
      sucesso: true,
      ...importedImage,
    });
  } catch (error) {
    return res.status(400).json({
      erro: error.message || "Nao foi possivel importar a imagem do produto.",
    });
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
