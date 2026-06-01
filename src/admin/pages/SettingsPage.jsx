import { useEffect, useMemo, useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { defaultSettings } from '../../data/siteDefaults.js'
import {
  disconnectMelhorEnvioOAuth,
  fetchFreightAdminServices,
  getFreightAdminConfig,
  saveFreightAdminConfig,
  startMelhorEnvioOAuth,
  testFreightAdminConnection,
} from '../../shared/freightApi.js'
import {
  getMercadoPagoAdminConfig,
  saveMercadoPagoAdminConfig,
  testMercadoPagoConnection,
} from '../../shared/paymentApi.js'
import {
  getOrderNotificationAdminConfig,
  saveOrderNotificationAdminConfig,
} from '../../shared/orderNotificationApi.js'
import {
  DEFAULT_WHATSAPP_MESSAGE,
  buildWhatsAppUrl,
  getDigits,
  getWhatsAppInputNumber,
  normalizeWhatsAppNumber,
} from '../../shared/whatsapp.js'
import { useAuthSession } from '../AuthContext.jsx'
import { useAdminUI } from '../components/AdminLayout.jsx'
import { useDocumentData } from '../hooks/useFirestoreData.js'

const defaultFreightForm = {
  ativo: false,
  ambiente: 'sandbox',
  oauthClientId: '',
  oauthClientSecret: '',
  oauthClientConfigured: false,
  conexao: {
    status: 'not_connected',
    clientConfigured: false,
    clientIdHint: '',
    scopes: [],
    conta: null,
    expiresAt: null,
    refreshTokenExpiresAt: null,
    connectedAt: null,
    lastRefreshAt: null,
    reconnectReason: '',
  },
  cepOrigem: '',
  taxaManuseio: '0',
  diasExtrasPreparacao: '0',
  freteGratisAtivo: false,
  freteGratisAcimaDe: '',
  cepDestinoTeste: '01001000',
  pacoteTeste: {
    peso: '',
    altura: '',
    largura: '',
    comprimento: '',
    valorDeclarado: '',
  },
  remetente: {
    nome: '',
    email: '',
    telefone: '',
  },
  dimensoesPadrao: {
    peso: '0.3',
    altura: '10',
    largura: '15',
    comprimento: '20',
  },
  retiradaLocal: {
    ativo: false,
    titulo: 'Retirada no local',
    prazoTexto: 'Agende a retirada',
  },
  servicos: [],
  servicosAuditoria: null,
}

const defaultPaymentForm = {
  ativo: false,
  ambiente: 'sandbox',
  publicKey: '',
  accessToken: '',
  webhookSecret: '',
  accessTokenConfigured: false,
  webhookSecretConfigured: false,
  metodos: {
    pix: true,
    credito: true,
    debito: false,
  },
  maxParcelasCredito: '6',
  valorMinimoParcela: '5',
  pixExpiraEmMinutos: '30',
  capturaAutomatica: true,
  status: 'not_configured',
  conta: null,
  lastTestAt: null,
  lastError: '',
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const defaultNotificationForm = {
  email: {
    ativo: false,
    destino: '',
  },
  whatsapp: {
    ativo: false,
    destino: '',
  },
  status: null,
}

function serviceKey(service) {
  return `${service.companyId || ''}:${service.serviceId || ''}`
}

function toStringValue(value) {
  return value === null || value === undefined ? '' : String(value)
}

function normalizeService(service = {}, index = 0) {
  return {
    serviceId: toStringValue(service.serviceId || service.servicoId || service.id),
    companyId: toStringValue(service.companyId || service.transportadoraId),
    transportadora: toStringValue(service.transportadora),
    modalidade: toStringValue(service.modalidade),
    serviceName: toStringValue(service.serviceName || service.nomeServico),
    companyName: toStringValue(service.companyName || service.nomeTransportadora),
    nomeExibicao: toStringValue(service.nomeExibicao),
    ativo: service.ativo !== false,
    ordem: Number.isFinite(Number(service.ordem)) ? Number(service.ordem) : index,
    ambiente: toStringValue(service.ambiente),
    ultimaAtualizacao: toStringValue(service.ultimaAtualizacao),
    cepOrigemTeste: toStringValue(service.cepOrigemTeste),
    cepDestinoTeste: toStringValue(service.cepDestinoTeste),
    pacoteTeste: service.pacoteTeste || null,
  }
}

function configToForm(config = {}) {
  return {
    ...defaultFreightForm,
    ...config,
    oauthClientId: '',
    oauthClientSecret: '',
    oauthClientConfigured: Boolean(config.oauthClientConfigured || config.conexao?.clientConfigured),
    conexao: {
      ...defaultFreightForm.conexao,
      ...(config.conexao || {}),
      scopes: Array.isArray(config.conexao?.scopes) ? config.conexao.scopes : [],
    },
    taxaManuseio: toStringValue(config.taxaManuseio ?? '0'),
    diasExtrasPreparacao: toStringValue(config.diasExtrasPreparacao ?? '0'),
    freteGratisAtivo: Boolean(config.freteGratisAtivo),
    freteGratisAcimaDe: toStringValue(config.freteGratisAcimaDe),
    remetente: {
      ...defaultFreightForm.remetente,
      ...(config.remetente || {}),
    },
    dimensoesPadrao: {
      peso: toStringValue(config.dimensoesPadrao?.peso ?? defaultFreightForm.dimensoesPadrao.peso),
      altura: toStringValue(config.dimensoesPadrao?.altura ?? defaultFreightForm.dimensoesPadrao.altura),
      largura: toStringValue(config.dimensoesPadrao?.largura ?? defaultFreightForm.dimensoesPadrao.largura),
      comprimento: toStringValue(
        config.dimensoesPadrao?.comprimento ?? defaultFreightForm.dimensoesPadrao.comprimento,
      ),
    },
    retiradaLocal: {
      ...defaultFreightForm.retiradaLocal,
      ...(config.retiradaLocal || {}),
      ativo: Boolean(config.retiradaLocal?.ativo),
      titulo: toStringValue(config.retiradaLocal?.titulo || defaultFreightForm.retiradaLocal.titulo),
      prazoTexto: toStringValue(
        config.retiradaLocal?.prazoTexto || defaultFreightForm.retiradaLocal.prazoTexto,
      ),
    },
    servicos: Array.isArray(config.servicos)
      ? config.servicos.map(normalizeService).filter((service) => service.serviceId)
      : [],
    servicosAuditoria: config.servicosAuditoria || null,
    pacoteTeste: {
      ...defaultFreightForm.pacoteTeste,
      ...(config.pacoteTeste || {}),
    },
  }
}

function parseNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formToPayload(form) {
  return {
    ativo: Boolean(form.ativo),
    ambiente: form.ambiente === 'producao' ? 'producao' : 'sandbox',
    oauthClientId: form.oauthClientId.trim(),
    oauthClientSecret: form.oauthClientSecret.trim(),
    cepOrigem: form.cepOrigem,
    taxaManuseio: parseNumber(form.taxaManuseio, 0),
    diasExtrasPreparacao: Math.max(0, Math.floor(parseNumber(form.diasExtrasPreparacao, 0))),
    freteGratisAtivo: Boolean(form.freteGratisAtivo),
    freteGratisAcimaDe:
      form.freteGratisAcimaDe === '' ? null : parseNumber(form.freteGratisAcimaDe, null),
    cepDestinoTeste: form.cepDestinoTeste,
    pacoteTeste: {
      peso: parseNumber(form.pacoteTeste?.peso, null),
      altura: parseNumber(form.pacoteTeste?.altura, null),
      largura: parseNumber(form.pacoteTeste?.largura, null),
      comprimento: parseNumber(form.pacoteTeste?.comprimento, null),
      valorDeclarado: parseNumber(form.pacoteTeste?.valorDeclarado, null),
    },
    remetente: {
      nome: form.remetente.nome.trim(),
      email: form.remetente.email.trim(),
      telefone: form.remetente.telefone.trim(),
    },
    dimensoesPadrao: {
      peso: parseNumber(form.dimensoesPadrao.peso, 0.3),
      altura: parseNumber(form.dimensoesPadrao.altura, 10),
      largura: parseNumber(form.dimensoesPadrao.largura, 15),
      comprimento: parseNumber(form.dimensoesPadrao.comprimento, 20),
    },
    retiradaLocal: {
      ativo: Boolean(form.retiradaLocal.ativo),
      titulo: form.retiradaLocal.titulo.trim() || 'Retirada no local',
      prazoTexto: form.retiradaLocal.prazoTexto.trim() || 'Agende a retirada',
    },
    servicos: form.servicos.map((service, index) => ({
      ...normalizeService(service, index),
      ordem: Number.isFinite(Number(service.ordem)) ? Number(service.ordem) : index,
    })),
    servicosAuditoria: form.servicosAuditoria || null,
  }
}

function paymentConfigToForm(config = {}) {
  const mercadoPago = config.mercadoPago || config || {}

  return {
    ...defaultPaymentForm,
    ...mercadoPago,
    accessToken: '',
    webhookSecret: '',
    accessTokenConfigured: Boolean(mercadoPago.accessTokenConfigured),
    webhookSecretConfigured: Boolean(mercadoPago.webhookSecretConfigured),
    metodos: {
      ...defaultPaymentForm.metodos,
      ...(mercadoPago.metodos || {}),
      pix: mercadoPago.metodos?.pix !== false,
      credito: mercadoPago.metodos?.credito !== false,
      debito: Boolean(mercadoPago.metodos?.debito),
    },
    maxParcelasCredito: toStringValue(mercadoPago.maxParcelasCredito ?? '6'),
    valorMinimoParcela: toStringValue(mercadoPago.valorMinimoParcela ?? '5'),
    pixExpiraEmMinutos: toStringValue(mercadoPago.pixExpiraEmMinutos ?? '30'),
    capturaAutomatica: mercadoPago.capturaAutomatica !== false,
    conta: mercadoPago.conta || null,
    lastTestAt: mercadoPago.lastTestAt || null,
    lastError: mercadoPago.lastError || '',
  }
}

function paymentFormToPayload(form) {
  return {
    mercadoPago: {
      ativo: Boolean(form.ativo),
      ambiente: form.ambiente === 'producao' ? 'producao' : 'sandbox',
      publicKey: form.publicKey.trim(),
      accessToken: form.accessToken.trim(),
      webhookSecret: form.webhookSecret.trim(),
      metodos: {
        pix: Boolean(form.metodos.pix),
        credito: Boolean(form.metodos.credito),
        debito: Boolean(form.metodos.debito),
      },
      maxParcelasCredito: Math.max(1, Math.floor(parseNumber(form.maxParcelasCredito, 1))),
      valorMinimoParcela: parseNumber(form.valorMinimoParcela, 5),
      pixExpiraEmMinutos: Math.max(30, Math.floor(parseNumber(form.pixExpiraEmMinutos, 30))),
      capturaAutomatica: Boolean(form.capturaAutomatica),
    },
  }
}

function notificationConfigToForm(config = {}) {
  return {
    ...defaultNotificationForm,
    ...config,
    email: {
      ...defaultNotificationForm.email,
      ...(config.email || {}),
      ativo: Boolean(config.email?.ativo),
      destino: toStringValue(config.email?.destino),
    },
    whatsapp: {
      ...defaultNotificationForm.whatsapp,
      ...(config.whatsapp || {}),
      ativo: Boolean(config.whatsapp?.ativo),
      destino: toStringValue(config.whatsapp?.destino),
    },
    status: config.status || null,
  }
}

function notificationFormToPayload(form) {
  return {
    email: {
      ativo: Boolean(form.email?.ativo),
      destino: toStringValue(form.email?.destino).trim(),
    },
    whatsapp: {
      ativo: Boolean(form.whatsapp?.ativo),
      destino: toStringValue(form.whatsapp?.destino).trim(),
    },
  }
}

function settingsToForm(settings = {}) {
  const rawWhatsAppNumber = getWhatsAppInputNumber(settings)
  const whatsappNumber = normalizeWhatsAppNumber(rawWhatsAppNumber) ? rawWhatsAppNumber : ''

  return {
    ...defaultSettings,
    ...settings,
    whatsapp: {
      ...defaultSettings.whatsapp,
      ...(settings.whatsapp || {}),
      numero: whatsappNumber,
      mensagemPadrao: settings.whatsapp?.mensagemPadrao || DEFAULT_WHATSAPP_MESSAGE,
      ativo: Boolean(settings.whatsapp?.ativo && normalizeWhatsAppNumber(whatsappNumber)),
    },
  }
}

function mergeServices(currentServices, fetchedServices) {
  const currentMap = new Map(currentServices.map((service) => [serviceKey(service), service]))

  return fetchedServices.map((service, index) => {
    const normalized = normalizeService(service, index)
    const current = currentMap.get(serviceKey(normalized))

    return {
      ...normalized,
      ativo: current?.ativo ?? true,
      nomeExibicao: current?.nomeExibicao ?? normalized.nomeExibicao,
      ordem: current?.ordem ?? index,
    }
  })
}

const connectionStatusLabels = {
  not_connected: 'Nao conectado',
  connected: 'Conectado',
  token_expired: 'Token expirado',
  reconnect_required: 'Reconexao necessaria',
  permission_error: 'Erro de permissao',
}

function getConnectionStatusLabel(status) {
  return connectionStatusLabels[status] || 'Nao conectado'
}

function getConnectionBadgeClass(status) {
  if (status === 'connected') {
    return 'is-live'
  }

  if (status === 'token_expired') {
    return 'is-accent'
  }

  return 'is-muted'
}

function formatDateTime(value) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function formatCep(value) {
  const digits = String(value || '').replace(/\D/g, '')

  if (digits.length !== 8) {
    return value || '--'
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function formatPackageAudit(value) {
  if (!value) {
    return '--'
  }

  const parts = []

  if (value.weight) {
    parts.push(`${value.weight} kg`)
  }

  if (value.height && value.width && value.length) {
    parts.push(`${value.height} x ${value.width} x ${value.length} cm`)
  }

  if (value.quantity) {
    parts.push(`${value.quantity} un.`)
  }

  return parts.length ? parts.join(' | ') : '--'
}

function getUnavailableServicesFromAudit(audit) {
  if (!Array.isArray(audit?.retornoBrutoResumo)) {
    return []
  }

  return audit.retornoBrutoResumo
    .filter((service) => service?.error)
    .map((service) => ({
      serviceId: toStringValue(service.serviceId),
      companyId: toStringValue(service.companyId),
      modalidade: toStringValue(service.serviceName || service.modalidade || service.nome || 'Servico'),
      transportadora: toStringValue(service.companyName || service.transportadora || 'Transportadora'),
      mensagem: toStringValue(service.error),
    }))
}

export default function SettingsPage() {
  const { data: remoteSettings, loading } = useDocumentData('configuracoes', 'geral', defaultSettings)
  const { user } = useAuthSession()
  const { notify } = useAdminUI()
  const [form, setForm] = useState(defaultSettings)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [freightForm, setFreightForm] = useState(defaultFreightForm)
  const [freightDirty, setFreightDirty] = useState(false)
  const [freightLoading, setFreightLoading] = useState(false)
  const [freightSaving, setFreightSaving] = useState(false)
  const [freightTesting, setFreightTesting] = useState(false)
  const [freightFetching, setFreightFetching] = useState(false)
  const [freightError, setFreightError] = useState('')
  const [paymentForm, setPaymentForm] = useState(defaultPaymentForm)
  const [paymentDirty, setPaymentDirty] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentTesting, setPaymentTesting] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [notificationForm, setNotificationForm] = useState(defaultNotificationForm)
  const [notificationDirty, setNotificationDirty] = useState(false)
  const [notificationLoading, setNotificationLoading] = useState(false)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationError, setNotificationError] = useState('')

  const freightConfigIssues = useMemo(() => {
    const issues = []
    const connected = ['connected', 'token_expired'].includes(freightForm.conexao?.status)
    const clientConfigured =
      freightForm.oauthClientConfigured ||
      freightForm.conexao?.clientConfigured ||
      (freightForm.oauthClientId.trim() && freightForm.oauthClientSecret.trim())
    const originCep = String(freightForm.cepOrigem || '').replace(/\D/g, '')
    const dimensions = freightForm.dimensoesPadrao || {}
    const testPackage = freightForm.pacoteTeste || {}
    const preparationDays = Number(freightForm.diasExtrasPreparacao)
    const invalidDimension = ['peso', 'altura', 'largura', 'comprimento'].some((field) => {
      const value = Number(dimensions[field])
      return !Number.isFinite(value) || value <= 0
    })
    const invalidTestPackage = ['peso', 'altura', 'largura', 'comprimento', 'valorDeclarado'].some((field) => {
      const rawValue = testPackage[field]

      if (rawValue === '' || rawValue === null || rawValue === undefined) {
        return false
      }

      const value = Number(rawValue)
      return !Number.isFinite(value) || value <= 0
    })

    if (!freightForm.ativo && !freightForm.retiradaLocal.ativo) {
      issues.push('Nenhuma entrega automatica ativa. O checkout oferecera frete a combinar.')
    }

    if (freightForm.ativo && !clientConfigured) {
      issues.push('Configure Client ID e Secret do aplicativo Melhor Envio.')
    }

    if (freightForm.ativo && clientConfigured && !connected) {
      issues.push('Conecte o Melhor Envio para habilitar cotacao automatica.')
    }

    if (freightForm.ativo && originCep.length !== 8) {
      issues.push('CEP de origem precisa ter 8 digitos.')
    }

    if (freightForm.ativo && invalidDimension) {
      issues.push('Padrao logistico precisa ter peso e dimensoes maiores que zero.')
    }

    if (freightForm.ativo && invalidTestPackage) {
      issues.push('Pacote de teste das modalidades deve ter apenas valores maiores que zero.')
    }

    if (!Number.isFinite(preparationDays) || preparationDays < 0 || !Number.isInteger(preparationDays)) {
      issues.push('Dias extras de preparacao precisa ser um numero inteiro maior ou igual a zero.')
    }

    if (freightForm.freteGratisAtivo) {
      const minimum = Number(freightForm.freteGratisAcimaDe)

      if (!Number.isFinite(minimum) || minimum <= 0) {
        issues.push('Frete gratis precisa de valor minimo maior que zero.')
      }
    }

    if (freightForm.ativo && freightForm.servicos.length === 0) {
      issues.push('Busque modalidades para controlar quais transportadoras aparecem no checkout.')
    }

    return issues
  }, [freightForm])

  const paymentConfigIssues = useMemo(() => {
    const issues = []

    if (!paymentForm.ativo) {
      issues.push('Mercado Pago desativado. O checkout nao oferecera pagamento online.')
    }

    if (paymentForm.ativo && !paymentForm.publicKey.trim()) {
      issues.push('Informe a Public Key do Mercado Pago.')
    }

    if (paymentForm.ativo && !paymentForm.accessTokenConfigured && !paymentForm.accessToken.trim()) {
      issues.push('Informe o Access Token privado para o backend.')
    }

    if (
      paymentForm.ativo &&
      !paymentForm.metodos.pix &&
      !paymentForm.metodos.credito &&
      !paymentForm.metodos.debito
    ) {
      issues.push('Ative pelo menos uma forma de pagamento.')
    }

    if (paymentForm.ativo) {
      const installments = Number(paymentForm.maxParcelasCredito)
      const pixExpiration = Number(paymentForm.pixExpiraEmMinutos)

      if (!Number.isFinite(installments) || installments < 1) {
        issues.push('Parcelas maximas precisam ser pelo menos 1.')
      }

      if (!Number.isFinite(pixExpiration) || pixExpiration < 30) {
        issues.push('Expiracao do Pix precisa ser de pelo menos 30 minutos.')
      }
    }

    return issues
  }, [paymentForm])

  const notificationConfigIssues = useMemo(() => {
    const issues = []
    const emailDestino = notificationForm.email?.destino?.trim()
    const whatsappDestino = getDigits(notificationForm.whatsapp?.destino)

    if (notificationForm.email?.ativo && !emailDestino) {
      issues.push('Informe o e-mail de destino ou desative notificacoes por e-mail.')
    }

    if (notificationForm.email?.ativo && emailDestino && !EMAIL_REGEX.test(emailDestino)) {
      issues.push('E-mail de destino invalido.')
    }

    if (notificationForm.whatsapp?.ativo && !whatsappDestino) {
      issues.push('Informe o WhatsApp de destino ou desative notificacoes por WhatsApp.')
    }

    if (
      notificationForm.whatsapp?.ativo &&
      whatsappDestino &&
      !normalizeWhatsAppNumber(notificationForm.whatsapp.destino)
    ) {
      issues.push('WhatsApp de destino precisa ter DDD, com 10 ou 11 digitos, ou codigo 55.')
    }

    return issues
  }, [notificationForm])

  useEffect(() => {
    if (!loading && !dirty) {
      setForm(settingsToForm(remoteSettings))
    }
  }, [dirty, loading, remoteSettings])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthResult = params.get('freteOAuth')

    if (!oauthResult) {
      return
    }

    if (oauthResult === 'connected') {
      notify({
        type: 'success',
        title: 'Melhor Envio conectado',
        description: 'A autorizacao foi salva e sera renovada automaticamente.',
      })
    } else {
      notify({
        type: 'error',
        title: 'Falha ao conectar Melhor Envio',
        description: 'Inicie a conexao novamente e confirme as permissoes.',
      })
    }

    params.delete('freteOAuth')
    params.delete('code')
    const nextSearch = params.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`,
    )
  }, [notify])

  useEffect(() => {
    if (!user || freightDirty) {
      return undefined
    }

    let active = true
    setFreightLoading(true)
    setFreightError('')

    getFreightAdminConfig(user)
      .then((result) => {
        if (!active) {
          return
        }

        setFreightForm(configToForm(result.config))
      })
      .catch((error) => {
        if (active) {
          setFreightError(error.message || 'Nao foi possivel carregar o frete.')
        }
      })
      .finally(() => {
        if (active) {
          setFreightLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [freightDirty, user])

  useEffect(() => {
    if (!user || paymentDirty) {
      return undefined
    }

    let active = true
    setPaymentLoading(true)
    setPaymentError('')

    getMercadoPagoAdminConfig(user)
      .then((result) => {
        if (!active) {
          return
        }

        setPaymentForm(paymentConfigToForm(result.config))
      })
      .catch((error) => {
        if (active) {
          setPaymentError(error.message || 'Nao foi possivel carregar pagamentos.')
        }
      })
      .finally(() => {
        if (active) {
          setPaymentLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [paymentDirty, user])

  useEffect(() => {
    if (!user || notificationDirty) {
      return undefined
    }

    let active = true
    setNotificationLoading(true)
    setNotificationError('')

    getOrderNotificationAdminConfig(user)
      .then((result) => {
        if (!active) {
          return
        }

        setNotificationForm(notificationConfigToForm(result.config))
      })
      .catch((error) => {
        if (active) {
          setNotificationError(error.message || 'Nao foi possivel carregar notificacoes.')
        }
      })
      .finally(() => {
        if (active) {
          setNotificationLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [notificationDirty, user])

  function updateField(field, value) {
    setDirty(true)
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateWhatsAppNumber(value) {
    setDirty(true)
    setForm((current) => ({
      ...current,
      whatsapp: {
        ...defaultSettings.whatsapp,
        ...(current.whatsapp || {}),
        numero: value,
        mensagemPadrao: current.whatsapp?.mensagemPadrao || DEFAULT_WHATSAPP_MESSAGE,
      },
    }))
  }

  function updateFreightField(field, value) {
    setFreightDirty(true)
    setFreightForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateFreightNested(group, field, value) {
    setFreightDirty(true)
    setFreightForm((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [field]: value,
      },
    }))
  }

  function updateService(index, patch) {
    setFreightDirty(true)
    setFreightForm((current) => ({
      ...current,
      servicos: current.servicos.map((service, serviceIndex) =>
        serviceIndex === index ? { ...service, ...patch } : service,
      ),
    }))
  }

  function updatePaymentField(field, value) {
    setPaymentDirty(true)
    setPaymentForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updatePaymentMethod(field, value) {
    setPaymentDirty(true)
    setPaymentForm((current) => ({
      ...current,
      metodos: {
        ...current.metodos,
        [field]: value,
      },
    }))
  }

  function updateNotificationNested(group, field, value) {
    setNotificationDirty(true)
    setNotificationForm((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [field]: value,
      },
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)

    try {
      const whatsappNumberInput = form.whatsapp?.numero || ''
      const whatsappDigits = getDigits(whatsappNumberInput)
      const normalizedWhatsApp = normalizeWhatsAppNumber(whatsappNumberInput)

      if (whatsappDigits && !normalizedWhatsApp) {
        notify({
          type: 'error',
          title: 'WhatsApp invalido',
          description: 'Informe um numero com DDD, com 10 ou 11 digitos, ou com codigo 55.',
        })
        setSaving(false)
        return
      }

      const whatsappMessage = form.whatsapp?.mensagemPadrao || DEFAULT_WHATSAPP_MESSAGE
      const whatsappLink = buildWhatsAppUrl(whatsappNumberInput, whatsappMessage)
      const settingsPayload = {
        ...form,
        whatsappLink,
        whatsapp: {
          numero: whatsappDigits,
          mensagemPadrao: whatsappMessage,
          ativo: Boolean(whatsappLink),
        },
      }

      await setDoc(
        doc(db, 'configuracoes', 'geral'),
        {
          ...settingsPayload,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      setDirty(false)

      notify({
        type: 'success',
        title: 'Configuracoes salvas',
        description: 'Links e preferencias basicas foram atualizados.',
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel salvar as configuracoes',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleFreightSubmit(event) {
    event.preventDefault()
    setFreightSaving(true)
    setFreightError('')

    try {
      const result = await saveFreightAdminConfig(user, formToPayload(freightForm))
      setFreightForm(configToForm(result.config))
      setFreightDirty(false)
      notify({
        type: 'success',
        title: 'Frete salvo',
        description: 'Configuracao do Melhor Envio atualizada.',
      })
    } catch (error) {
      setFreightError(error.message || 'Nao foi possivel salvar o frete.')
      notify({
        type: 'error',
        title: 'Nao foi possivel salvar o frete',
        description: error.message || 'Revise os dados e tente novamente.',
      })
    } finally {
      setFreightSaving(false)
    }
  }

  async function handleConnectMelhorEnvio() {
    setFreightSaving(true)
    setFreightError('')

    try {
      const saved = await saveFreightAdminConfig(user, formToPayload(freightForm))
      const savedForm = configToForm(saved.config)
      setFreightForm(savedForm)
      setFreightDirty(false)

      const result = await startMelhorEnvioOAuth(user, savedForm.ambiente)
      window.location.assign(result.url)
    } catch (error) {
      setFreightError(error.message || 'Nao foi possivel iniciar a conexao OAuth.')
      notify({
        type: 'error',
        title: 'Nao foi possivel conectar',
        description: error.message || 'Revise credenciais OAuth e ambiente.',
      })
      setFreightSaving(false)
    }
  }

  async function handleDisconnectMelhorEnvio() {
    setFreightSaving(true)
    setFreightError('')

    try {
      const result = await disconnectMelhorEnvioOAuth(user)
      setFreightForm(configToForm(result.config))
      setFreightDirty(false)
      notify({
        type: 'success',
        title: 'Melhor Envio desconectado',
        description: 'A conexao local foi removida.',
      })
    } catch (error) {
      setFreightError(error.message || 'Nao foi possivel desconectar o Melhor Envio.')
      notify({
        type: 'error',
        title: 'Falha ao desconectar',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setFreightSaving(false)
    }
  }

  async function handleTestConnection() {
    setFreightTesting(true)
    setFreightError('')

    try {
      const result = await testFreightAdminConnection(user, formToPayload(freightForm))
      notify({
        type: 'success',
        title: 'Conexao validada',
        description: result?.servicosEncontrados
          ? `${result.servicosEncontrados} modalidade(s) disponivel(is) de ${result.retornoBrutoTotal || 0} retorno(s) brutos.`
          : result?.mensagem || 'O Melhor Envio respondeu com sucesso.',
      })
    } catch (error) {
      setFreightError(error.message || 'Nao foi possivel testar a conexao.')
      notify({
        type: 'error',
        title: 'Falha no teste de frete',
        description: error.message || 'Revise token, ambiente e CEP de origem.',
      })
    } finally {
      setFreightTesting(false)
    }
  }

  async function handleFetchServices() {
    setFreightFetching(true)
    setFreightError('')

    try {
      const result = await fetchFreightAdminServices(user, formToPayload(freightForm))
      setFreightForm((current) => ({
        ...current,
        servicos: mergeServices(current.servicos, result.servicos || []),
        servicosAuditoria: result.auditoria || null,
      }))
      setFreightDirty(true)
      notify({
        type: 'success',
        title: 'Transportadoras carregadas',
        description:
          result.mensagem ||
          `${result.servicos?.length || 0} servico(s) encontrados.`,
      })
    } catch (error) {
      setFreightError(error.message || 'Nao foi possivel buscar transportadoras.')
    } finally {
      setFreightFetching(false)
    }
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault()
    setPaymentSaving(true)
    setPaymentError('')

    try {
      const result = await saveMercadoPagoAdminConfig(user, paymentFormToPayload(paymentForm))
      setPaymentForm(paymentConfigToForm(result.config))
      setPaymentDirty(false)
      notify({
        type: 'success',
        title: 'Mercado Pago salvo',
        description: 'Configuracao de pagamentos atualizada.',
      })
    } catch (error) {
      setPaymentError(error.message || 'Nao foi possivel salvar Mercado Pago.')
      notify({
        type: 'error',
        title: 'Nao foi possivel salvar pagamentos',
        description: error.message || 'Revise as credenciais e tente novamente.',
      })
    } finally {
      setPaymentSaving(false)
    }
  }

  async function handlePaymentTest() {
    setPaymentTesting(true)
    setPaymentError('')

    try {
      if (paymentDirty) {
        const saved = await saveMercadoPagoAdminConfig(user, paymentFormToPayload(paymentForm))
        setPaymentForm(paymentConfigToForm(saved.config))
        setPaymentDirty(false)
      }

      const result = await testMercadoPagoConnection(user)
      setPaymentForm(paymentConfigToForm(result.config))
      notify({
        type: 'success',
        title: 'Mercado Pago conectado',
        description: result?.conta?.email || result?.mensagem || 'Credenciais validadas.',
      })
    } catch (error) {
      setPaymentError(error.message || 'Nao foi possivel testar Mercado Pago.')
      notify({
        type: 'error',
        title: 'Falha no Mercado Pago',
        description: error.message || 'Confira Access Token e ambiente.',
      })
    } finally {
      setPaymentTesting(false)
    }
  }

  async function handleNotificationSubmit(event) {
    event.preventDefault()
    setNotificationSaving(true)
    setNotificationError('')

    if (notificationConfigIssues.length) {
      const message = notificationConfigIssues[0]
      setNotificationError(message)
      notify({
        type: 'error',
        title: 'Revise as notificacoes',
        description: message,
      })
      setNotificationSaving(false)
      return
    }

    try {
      const result = await saveOrderNotificationAdminConfig(
        user,
        notificationFormToPayload(notificationForm),
      )
      setNotificationForm(notificationConfigToForm(result.config))
      setNotificationDirty(false)
      notify({
        type: 'success',
        title: 'Notificacoes salvas',
        description: 'Preferencias de novo pedido atualizadas.',
      })
    } catch (error) {
      setNotificationError(error.message || 'Nao foi possivel salvar notificacoes.')
      notify({
        type: 'error',
        title: 'Nao foi possivel salvar notificacoes',
        description: error.message || 'Revise os dados e tente novamente.',
      })
    } finally {
      setNotificationSaving(false)
    }
  }

  const connection = freightForm.conexao || defaultFreightForm.conexao
  const connectionStatus = connection.status || 'not_connected'
  const connectionLabel = getConnectionStatusLabel(connectionStatus)
  const connectLabel = connectionStatus === 'connected' ? 'Reconectar Melhor Envio' : 'Conectar Melhor Envio'
  const unavailableServices = useMemo(
    () => getUnavailableServicesFromAudit(freightForm.servicosAuditoria),
    [freightForm.servicosAuditoria]
  )
  const whatsappPreviewUrl = useMemo(
    () => buildWhatsAppUrl(form.whatsapp?.numero, form.whatsapp?.mensagemPadrao || DEFAULT_WHATSAPP_MESSAGE),
    [form.whatsapp?.mensagemPadrao, form.whatsapp?.numero],
  )

  return (
    <section className="admin-page-section">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Configuracoes</span>
          <h1>Operacao da loja</h1>
          <p>Links, frete e dados essenciais do catalogo.</p>
        </div>
      </div>

      <form className="admin-surface admin-form" onSubmit={handleSubmit}>
        <div className="admin-surface-head">
          <div>
            <h2>Links e conteudo basico</h2>
            <p>Dados usados nas chamadas principais da loja.</p>
          </div>
        </div>

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>WhatsApp da loja</span>
            <input
              className="admin-input"
              value={form.whatsapp?.numero || ''}
              onChange={(event) => updateWhatsAppNumber(event.target.value)}
              placeholder="Ex.: 48999999999"
            />
            <small className="admin-field-hint">
              Cadastre o WhatsApp da loja para exibir o botao de contato no catalogo.
            </small>
            {whatsappPreviewUrl ? (
              <a className="admin-field-link" href={whatsappPreviewUrl} target="_blank" rel="noreferrer">
                Testar WhatsApp
              </a>
            ) : null}
          </label>

          <label className="admin-field">
            <span>Link do Instagram</span>
            <input
              className="admin-input"
              value={form.instagramLink}
              onChange={(event) => updateField('instagramLink', event.target.value)}
              placeholder="https://instagram.com/decoratie"
            />
          </label>

          <label className="admin-field">
            <span>Link do grupo VIP</span>
            <input
              className="admin-input"
              value={form.vipGroupLink}
              onChange={(event) => updateField('vipGroupLink', event.target.value)}
              placeholder="https://chat.whatsapp.com/..."
            />
          </label>

          <label className="admin-field">
            <span>Texto padrao do CTA</span>
            <input
              className="admin-input"
              value={form.ctaDefaultText}
              onChange={(event) => updateField('ctaDefaultText', event.target.value)}
              placeholder="Quero conhecer"
            />
          </label>

          <label className="admin-field">
            <span>Status do sistema</span>
            <select
              className="admin-select"
              value={form.systemStatus}
              onChange={(event) => updateField('systemStatus', event.target.value)}
            >
              <option value="online">Online</option>
              <option value="pausado">Pausado</option>
              <option value="manutencao">Manutencao</option>
            </select>
          </label>

          <label className="admin-field admin-field-full">
            <span>Tagline da marca</span>
            <textarea
              className="admin-textarea"
              rows="4"
              value={form.brandTagline}
              onChange={(event) => updateField('brandTagline', event.target.value)}
            />
          </label>
        </div>

        <div className="admin-form-actions">
          <button type="submit" className="admin-btn" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        </div>
      </form>

      <form className="admin-surface admin-form" onSubmit={handleNotificationSubmit}>
        <div className="admin-surface-head">
          <div>
            <h2>Notificacoes de novo pedido</h2>
            <p>Avise a Decoratie por e-mail e WhatsApp quando o checkout criar um pedido.</p>
          </div>
        </div>

        {notificationLoading ? (
          <div className="admin-inline-notice">Carregando notificacoes...</div>
        ) : null}

        {notificationError ? (
          <div className="admin-inline-notice is-danger">{notificationError}</div>
        ) : null}

        {notificationConfigIssues.length ? (
          <div className="admin-inline-notice">
            <strong>Pendencias das notificacoes</strong>
            <ul className="admin-freight-issue-list">
              {notificationConfigIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="admin-form-grid">
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={notificationForm.email?.ativo}
              onChange={(event) => updateNotificationNested('email', 'ativo', event.target.checked)}
            />
            <span>Ativar e-mail</span>
          </label>

          <label className="admin-field">
            <span>E-mail de destino</span>
            <input
              className="admin-input"
              type="email"
              value={notificationForm.email?.destino || ''}
              onChange={(event) => updateNotificationNested('email', 'destino', event.target.value)}
              placeholder="pedidos@decoratie.com.br"
              autoComplete="off"
            />
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={notificationForm.whatsapp?.ativo}
              onChange={(event) => updateNotificationNested('whatsapp', 'ativo', event.target.checked)}
            />
            <span>Ativar WhatsApp</span>
          </label>

          <label className="admin-field">
            <span>WhatsApp de destino</span>
            <input
              className="admin-input"
              value={notificationForm.whatsapp?.destino || ''}
              onChange={(event) => updateNotificationNested('whatsapp', 'destino', event.target.value)}
              placeholder="Ex.: 48999999999"
              autoComplete="off"
            />
            <small className="admin-field-hint">
              O envio real depende do provedor configurado nas variaveis de ambiente da Function.
            </small>
          </label>
        </div>

        <div className="admin-freight-audit">
          <strong>Status do backend</strong>
          <div className="admin-freight-audit-grid">
            <span>E-mail: {notificationForm.status?.emailProviderConfigured ? 'Provedor configurado' : 'Sem provedor'}</span>
            <span>WhatsApp: {notificationForm.status?.whatsappProviderConfigured ? 'Provedor configurado' : 'Sem provedor'}</span>
            <span>Ultima atualizacao: {formatDateTime(notificationForm.updatedAt)}</span>
          </div>
        </div>

        <div className="admin-form-actions">
          <button
            type="submit"
            className="admin-btn"
            disabled={notificationSaving || notificationLoading}
          >
            {notificationSaving ? 'Salvando notificacoes...' : 'Salvar notificacoes'}
          </button>
        </div>
      </form>

      <form className="admin-surface admin-form" onSubmit={handleFreightSubmit}>
        <div className="admin-surface-head">
          <div>
            <h2>Frete e Entregas</h2>
            <p>Integracao Melhor Envio para cotacao no checkout.</p>
          </div>
          <span className={`admin-badge ${getConnectionBadgeClass(connectionStatus)}`}>
            {connectionLabel}
          </span>
        </div>

        {freightLoading ? (
          <div className="admin-inline-notice">Carregando configuracao de frete...</div>
        ) : null}

        {freightError ? (
          <div className="admin-inline-notice is-danger">{freightError}</div>
        ) : null}

        {freightConfigIssues.length ? (
          <div className="admin-inline-notice">
            <strong>Pendencias do frete</strong>
            <ul className="admin-freight-issue-list">
              {freightConfigIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="admin-form-grid">
          <label className="admin-toggle admin-field-full">
            <input
              type="checkbox"
              checked={freightForm.ativo}
              onChange={(event) => updateFreightField('ativo', event.target.checked)}
            />
            <span>Ativar calculo pelo Melhor Envio</span>
          </label>

          <label className="admin-field">
            <span>Ambiente</span>
            <select
              className="admin-select"
              value={freightForm.ambiente}
              onChange={(event) => updateFreightField('ambiente', event.target.value)}
            >
              <option value="sandbox">Sandbox</option>
              <option value="producao">Producao</option>
            </select>
          </label>

          <div className="admin-freight-oauth admin-field-full">
            <div className="admin-product-logistics-head">
              <strong>Conexao Melhor Envio</strong>
              <small>OAuth com renovacao automatica. Tokens nao aparecem no navegador.</small>
            </div>

            <div className="admin-freight-oauth-status">
              <div>
                <span>Status</span>
                <strong>{connectionLabel}</strong>
              </div>
              <div>
                <span>Ambiente</span>
                <strong>{freightForm.ambiente === 'producao' ? 'Producao' : 'Sandbox'}</strong>
              </div>
              <div>
                <span>Conta conectada</span>
                <strong>{connection.conta?.email || connection.conta?.nome || '--'}</strong>
              </div>
              <div>
                <span>Access token expira</span>
                <strong>{formatDateTime(connection.expiresAt)}</strong>
              </div>
              <div>
                <span>Refresh token expira</span>
                <strong>{formatDateTime(connection.refreshTokenExpiresAt)}</strong>
              </div>
              <div>
                <span>Ultima renovacao</span>
                <strong>{formatDateTime(connection.lastRefreshAt)}</strong>
              </div>
            </div>

            <div className="admin-freight-scopes">
              <span>Scopes</span>
              <strong>{connection.scopes?.length ? connection.scopes.join(', ') : '--'}</strong>
            </div>

            {connection.reconnectReason ? (
              <div className="admin-inline-notice is-danger">
                Reconexao necessaria: {connection.reconnectReason}
              </div>
            ) : null}

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Client ID</span>
                <input
                  className="admin-input"
                  value={freightForm.oauthClientId}
                  onChange={(event) => updateFreightField('oauthClientId', event.target.value)}
                  placeholder={freightForm.oauthClientConfigured ? `Salvo ${connection.clientIdHint || ''}` : 'Client ID'}
                  autoComplete="off"
                />
              </label>

              <label className="admin-field">
                <span>Client Secret</span>
                <input
                  className="admin-input"
                  type="password"
                  value={freightForm.oauthClientSecret}
                  onChange={(event) => updateFreightField('oauthClientSecret', event.target.value)}
                  placeholder={freightForm.oauthClientConfigured ? 'Secret salvo. Preencha para trocar.' : 'Client Secret'}
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="admin-inline-actions">
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={handleConnectMelhorEnvio}
                disabled={freightSaving || freightLoading}
              >
                {freightSaving ? 'Preparando conexao...' : connectLabel}
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={handleDisconnectMelhorEnvio}
                disabled={freightSaving || freightLoading || connectionStatus === 'not_connected'}
              >
                Desconectar Melhor Envio
              </button>
            </div>
          </div>

          <label className="admin-field">
            <span>CEP de origem</span>
            <input
              className="admin-input"
              inputMode="numeric"
              value={freightForm.cepOrigem}
              onChange={(event) => updateFreightField('cepOrigem', event.target.value)}
              placeholder="00000-000"
            />
          </label>

          <label className="admin-toggle admin-field-full">
            <input
              type="checkbox"
              checked={freightForm.freteGratisAtivo}
              onChange={(event) => updateFreightField('freteGratisAtivo', event.target.checked)}
            />
            <span>Ativar frete gratis acima de valor minimo</span>
          </label>

          <label className="admin-field">
            <span>Valor minimo para frete gratis</span>
            <input
              className="admin-input"
              type="number"
              min="0.01"
              step="0.01"
              value={freightForm.freteGratisAcimaDe}
              onChange={(event) => updateFreightField('freteGratisAcimaDe', event.target.value)}
              placeholder="Ex: 399,00"
              disabled={!freightForm.freteGratisAtivo}
            />
          </label>

          <label className="admin-field">
            <span>Taxa de manuseio</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              value={freightForm.taxaManuseio}
              onChange={(event) => updateFreightField('taxaManuseio', event.target.value)}
              placeholder="0,00"
            />
          </label>

          <label className="admin-field">
            <span>Dias extras para separacao e embalagem</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="1"
              value={freightForm.diasExtrasPreparacao}
              onChange={(event) => updateFreightField('diasExtrasPreparacao', event.target.value)}
              placeholder="0"
            />
          </label>

          <label className="admin-field">
            <span>Nome remetente</span>
            <input
              className="admin-input"
              value={freightForm.remetente.nome}
              onChange={(event) => updateFreightNested('remetente', 'nome', event.target.value)}
              placeholder="Decoratie"
            />
          </label>

          <label className="admin-field">
            <span>E-mail remetente</span>
            <input
              className="admin-input"
              type="email"
              value={freightForm.remetente.email}
              onChange={(event) => updateFreightNested('remetente', 'email', event.target.value)}
              placeholder="contato@decoratie.com.br"
            />
          </label>

          <label className="admin-field">
            <span>Telefone remetente</span>
            <input
              className="admin-input"
              inputMode="tel"
              value={freightForm.remetente.telefone}
              onChange={(event) => updateFreightNested('remetente', 'telefone', event.target.value)}
              placeholder="(00) 00000-0000"
            />
          </label>

          <label className="admin-field">
            <span>CEP destino teste</span>
            <input
              className="admin-input"
              inputMode="numeric"
              value={freightForm.cepDestinoTeste}
              onChange={(event) => updateFreightField('cepDestinoTeste', event.target.value)}
              placeholder="00000-000"
            />
          </label>

          <div className="admin-product-logistics-grid admin-field-full">
            <div className="admin-product-logistics-head">
              <strong>Pacote de teste das modalidades</strong>
              <small>Usado somente ao buscar transportadoras. Campos vazios usam o padrao logistico.</small>
            </div>

            <label className="admin-field">
              <span>Peso teste (kg)</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.001"
                value={freightForm.pacoteTeste.peso}
                onChange={(event) => updateFreightNested('pacoteTeste', 'peso', event.target.value)}
                placeholder={freightForm.dimensoesPadrao.peso || '0.3'}
              />
            </label>

            <label className="admin-field">
              <span>Altura teste (cm)</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.1"
                value={freightForm.pacoteTeste.altura}
                onChange={(event) => updateFreightNested('pacoteTeste', 'altura', event.target.value)}
                placeholder={freightForm.dimensoesPadrao.altura || '10'}
              />
            </label>

            <label className="admin-field">
              <span>Largura teste (cm)</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.1"
                value={freightForm.pacoteTeste.largura}
                onChange={(event) => updateFreightNested('pacoteTeste', 'largura', event.target.value)}
                placeholder={freightForm.dimensoesPadrao.largura || '15'}
              />
            </label>

            <label className="admin-field">
              <span>Comprimento teste (cm)</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.1"
                value={freightForm.pacoteTeste.comprimento}
                onChange={(event) => updateFreightNested('pacoteTeste', 'comprimento', event.target.value)}
                placeholder={freightForm.dimensoesPadrao.comprimento || '20'}
              />
            </label>

            <label className="admin-field">
              <span>Valor declarado teste</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                value={freightForm.pacoteTeste.valorDeclarado}
                onChange={(event) => updateFreightNested('pacoteTeste', 'valorDeclarado', event.target.value)}
                placeholder="50"
              />
            </label>
          </div>

          <label className="admin-toggle admin-field-full">
            <input
              type="checkbox"
              checked={freightForm.retiradaLocal.ativo}
              onChange={(event) => updateFreightNested('retiradaLocal', 'ativo', event.target.checked)}
            />
            <span>Ativar retirada no local</span>
          </label>

          <label className="admin-field">
            <span>Nome da retirada</span>
            <input
              className="admin-input"
              value={freightForm.retiradaLocal.titulo}
              onChange={(event) => updateFreightNested('retiradaLocal', 'titulo', event.target.value)}
              placeholder="Retirada no local"
            />
          </label>

          <label className="admin-field">
            <span>Prazo da retirada</span>
            <input
              className="admin-input"
              value={freightForm.retiradaLocal.prazoTexto}
              onChange={(event) => updateFreightNested('retiradaLocal', 'prazoTexto', event.target.value)}
              placeholder="Agende a retirada"
            />
          </label>
        </div>

        <div className="admin-product-logistics-grid admin-field-full">
          <div className="admin-product-logistics-head">
            <strong>Padrao logistico</strong>
            <small>Usado quando um produto ainda nao tem peso ou dimensoes proprias.</small>
          </div>

          <label className="admin-field">
            <span>Peso (kg)</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.001"
              value={freightForm.dimensoesPadrao.peso}
              onChange={(event) => updateFreightNested('dimensoesPadrao', 'peso', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>Altura (cm)</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.1"
              value={freightForm.dimensoesPadrao.altura}
              onChange={(event) => updateFreightNested('dimensoesPadrao', 'altura', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>Largura (cm)</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.1"
              value={freightForm.dimensoesPadrao.largura}
              onChange={(event) => updateFreightNested('dimensoesPadrao', 'largura', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>Comprimento (cm)</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.1"
              value={freightForm.dimensoesPadrao.comprimento}
              onChange={(event) => updateFreightNested('dimensoesPadrao', 'comprimento', event.target.value)}
            />
          </label>
        </div>

        <div className="admin-inline-actions">
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={handleTestConnection}
            disabled={freightTesting || freightSaving || connectionStatus === 'not_connected'}
          >
            {freightTesting ? 'Testando...' : 'Testar conexao'}
          </button>
          <button
            type="button"
            className="admin-btn-ghost"
            onClick={handleFetchServices}
            disabled={freightFetching || freightSaving || connectionStatus === 'not_connected'}
          >
            {freightFetching ? 'Buscando...' : 'Buscar transportadoras'}
          </button>
        </div>

        <div className="admin-freight-services">
          <div className="admin-surface-head">
            <div>
              <h2>Transportadoras e modalidades</h2>
              <p>Ative apenas o que deve aparecer no checkout.</p>
            </div>
          </div>

          {freightForm.servicosAuditoria ? (
            <div className="admin-freight-audit">
              <strong>{freightForm.servicosAuditoria.mensagem || 'Auditoria da ultima busca'}</strong>
              <div className="admin-freight-audit-grid">
                <span>Ambiente: {freightForm.servicosAuditoria.ambiente || freightForm.ambiente}</span>
                <span>Atualizado: {formatDateTime(freightForm.servicosAuditoria.ultimaAtualizacao)}</span>
                <span>Origem: {formatCep(freightForm.servicosAuditoria.cepOrigem)}</span>
                <span>Destino teste: {formatCep(freightForm.servicosAuditoria.cepDestinoTeste)}</span>
                <span>Pacote: {formatPackageAudit(freightForm.servicosAuditoria.pacoteTeste)}</span>
                <span>Retorno bruto: {freightForm.servicosAuditoria.retornoBrutoTotal || 0}</span>
                <span>Disponiveis: {freightForm.servicosAuditoria.modalidadesDisponiveis || 0}</span>
                <span>Com erro: {freightForm.servicosAuditoria.modalidadesComErro || 0}</span>
              </div>
            </div>
          ) : null}

          {freightForm.servicos.length ? (
            <div className="admin-freight-service-group">
              <h3>Modalidades disponiveis</h3>
              <div className="admin-freight-service-list">
                {freightForm.servicos.map((service, index) => (
                  <div className="admin-freight-service-card" key={serviceKey(service) || index}>
                    <label className="admin-toggle">
                      <input
                        type="checkbox"
                        checked={service.ativo}
                        onChange={(event) => updateService(index, { ativo: event.target.checked })}
                      />
                      <span>
                        {service.transportadora || 'Transportadora'} {service.modalidade || ''}
                      </span>
                    </label>

                    <label className="admin-field">
                      <span>Nome exibido</span>
                      <input
                        className="admin-input"
                        value={service.nomeExibicao}
                        onChange={(event) => updateService(index, { nomeExibicao: event.target.value })}
                        placeholder={service.modalidade || 'Opcional'}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Ordem</span>
                      <input
                        className="admin-input"
                        type="number"
                        min="0"
                        step="1"
                        value={service.ordem}
                        onChange={(event) => updateService(index, { ordem: event.target.value })}
                      />
                    </label>

                    <div className="admin-freight-service-meta">
                      <small>Servico ID: {service.serviceId || '--'}</small>
                      <small>
                        Transportadora ID: {service.companyId || '--'}
                        {service.companyName || service.transportadora
                          ? ` | ${service.companyName || service.transportadora}`
                          : ''}
                      </small>
                      <small>Nome API: {service.serviceName || service.modalidade || '--'}</small>
                      <small>Ambiente: {service.ambiente || freightForm.ambiente}</small>
                      <small>Atualizado: {formatDateTime(service.ultimaAtualizacao)}</small>
                      <small>Origem teste: {formatCep(service.cepOrigemTeste)}</small>
                      <small>Destino teste: {formatCep(service.cepDestinoTeste)}</small>
                      <small>Pacote teste: {formatPackageAudit(service.pacoteTeste)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="admin-inline-notice">
              Busque transportadoras para escolher as modalidades exibidas no checkout.
            </div>
          )}

          {unavailableServices.length ? (
            <div className="admin-freight-service-group">
              <h3>Modalidades indisponiveis para este pacote/CEP</h3>
              <div className="admin-freight-unavailable-list">
                {unavailableServices.map((service) => (
                  <div
                    className="admin-freight-unavailable-card"
                    key={`${service.companyId}:${service.serviceId}:${service.mensagem}`}
                  >
                    <strong>{service.transportadora} {service.modalidade}</strong>
                    <small>
                      Servico ID: {service.serviceId || '--'}
                      {service.companyId ? ` | Transportadora ID: ${service.companyId}` : ''}
                    </small>
                    <span>{service.mensagem}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="admin-form-actions">
          <button type="submit" className="admin-btn" disabled={freightSaving || freightLoading}>
            {freightSaving ? 'Salvando frete...' : 'Salvar frete'}
          </button>
        </div>
      </form>

      <form className="admin-surface admin-form" onSubmit={handlePaymentSubmit}>
        <div className="admin-surface-head">
          <div>
            <h2>Pagamentos Mercado Pago</h2>
            <p>Pix, credito e debito com criacao segura pelo backend.</p>
          </div>
          <span className={`admin-badge ${
            paymentForm.status === 'connected' ? 'is-live' : 'is-muted'
          }`}>
            {paymentForm.status === 'connected' ? 'Conectado' : 'Nao configurado'}
          </span>
        </div>

        {paymentLoading ? (
          <div className="admin-inline-notice">Carregando configuracao de pagamento...</div>
        ) : null}

        {paymentError ? (
          <div className="admin-inline-notice is-danger">{paymentError}</div>
        ) : null}

        {paymentConfigIssues.length ? (
          <div className="admin-inline-notice">
            <strong>Pendencias do Mercado Pago</strong>
            <ul className="admin-freight-issue-list">
              {paymentConfigIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="admin-form-grid">
          <label className="admin-toggle admin-field-full">
            <input
              type="checkbox"
              checked={paymentForm.ativo}
              onChange={(event) => updatePaymentField('ativo', event.target.checked)}
            />
            <span>Ativar Mercado Pago no checkout</span>
          </label>

          <label className="admin-field">
            <span>Ambiente</span>
            <select
              className="admin-select"
              value={paymentForm.ambiente}
              onChange={(event) => updatePaymentField('ambiente', event.target.value)}
            >
              <option value="sandbox">Sandbox</option>
              <option value="producao">Producao</option>
            </select>
          </label>

          <label className="admin-field">
            <span>Public Key</span>
            <input
              className="admin-input"
              value={paymentForm.publicKey}
              onChange={(event) => updatePaymentField('publicKey', event.target.value)}
              placeholder="TEST-... ou APP_USR-..."
              autoComplete="off"
            />
          </label>

          <label className="admin-field">
            <span>Access Token</span>
            <input
              className="admin-input"
              type="password"
              value={paymentForm.accessToken}
              onChange={(event) => updatePaymentField('accessToken', event.target.value)}
              placeholder={
                paymentForm.accessTokenConfigured
                  ? 'Token salvo. Preencha para trocar.'
                  : 'Access Token privado'
              }
              autoComplete="off"
            />
          </label>

          <label className="admin-field">
            <span>Webhook Secret</span>
            <input
              className="admin-input"
              type="password"
              value={paymentForm.webhookSecret}
              onChange={(event) => updatePaymentField('webhookSecret', event.target.value)}
              placeholder={
                paymentForm.webhookSecretConfigured
                  ? 'Secret salvo. Preencha para trocar.'
                  : 'Secret do webhook'
              }
              autoComplete="off"
            />
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={paymentForm.metodos.pix}
              onChange={(event) => updatePaymentMethod('pix', event.target.checked)}
            />
            <span>Pix</span>
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={paymentForm.metodos.credito}
              onChange={(event) => updatePaymentMethod('credito', event.target.checked)}
            />
            <span>Cartao de credito</span>
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={paymentForm.metodos.debito}
              onChange={(event) => updatePaymentMethod('debito', event.target.checked)}
            />
            <span>Cartao de debito</span>
          </label>

          <label className="admin-field">
            <span>Maximo de parcelas credito</span>
            <input
              className="admin-input"
              type="number"
              min="1"
              max="12"
              step="1"
              value={paymentForm.maxParcelasCredito}
              onChange={(event) => updatePaymentField('maxParcelasCredito', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>Valor minimo da parcela</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              value={paymentForm.valorMinimoParcela}
              onChange={(event) => updatePaymentField('valorMinimoParcela', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>Pix expira em minutos</span>
            <input
              className="admin-input"
              type="number"
              min="30"
              step="1"
              value={paymentForm.pixExpiraEmMinutos}
              onChange={(event) => updatePaymentField('pixExpiraEmMinutos', event.target.value)}
            />
          </label>

          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={paymentForm.capturaAutomatica}
              onChange={(event) => updatePaymentField('capturaAutomatica', event.target.checked)}
            />
            <span>Captura automatica</span>
          </label>
        </div>

        <div className="admin-freight-audit">
          <strong>Status da conexao</strong>
          <div className="admin-freight-audit-grid">
            <span>Ambiente: {paymentForm.ambiente === 'producao' ? 'Producao' : 'Sandbox'}</span>
            <span>Token: {paymentForm.accessTokenConfigured ? 'Salvo' : 'Nao salvo'}</span>
            <span>Webhook: {paymentForm.webhookSecretConfigured ? 'Secret salvo' : 'Sem secret'}</span>
            <span>Conta: {paymentForm.conta?.email || paymentForm.conta?.nickname || '--'}</span>
            <span>Ultimo teste: {formatDateTime(paymentForm.lastTestAt)}</span>
            <span>Status: {paymentForm.status || 'not_configured'}</span>
          </div>
          {paymentForm.lastError ? (
            <div className="admin-inline-notice is-danger">{paymentForm.lastError}</div>
          ) : null}
        </div>

        <div className="admin-inline-actions">
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={handlePaymentTest}
            disabled={paymentTesting || paymentSaving || paymentLoading}
          >
            {paymentTesting ? 'Testando...' : 'Testar conexao'}
          </button>
        </div>

        <div className="admin-form-actions">
          <button type="submit" className="admin-btn" disabled={paymentSaving || paymentLoading}>
            {paymentSaving ? 'Salvando pagamentos...' : 'Salvar pagamentos'}
          </button>
        </div>
      </form>
    </section>
  )
}
