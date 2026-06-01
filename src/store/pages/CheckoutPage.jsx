import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../hooks/useCart.js'
import { useOrders } from '../hooks/useOrders.js'
import { formatCurrency } from '../../shared/formatters.js'
import { quoteFreight } from '../../shared/freightApi.js'
import {
  consultMercadoPagoCheckoutPayment,
  createMercadoPagoPayment,
  getMercadoPagoPublicConfig,
} from '../../shared/paymentApi.js'
import { notifyNewOrder } from '../../shared/orderNotificationApi.js'
import { ArrowLeftIcon, CheckIcon, TruckIcon, MapPinIcon } from '../components/StoreIcons.jsx'
import '../store.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FREIGHT_INITIAL_NOTICE = 'Informe o CEP para calcular o frete.'
const CONTACT_FREIGHT_CODES_BLOCKLIST = new Set(['cep_invalido', 'carrinho_vazio', 'carrinho_invalido'])
const MERCADO_PAGO_SDK_URL = 'https://sdk.mercadopago.com/js/v2'
const PIX_POLLING_INTERVAL_MS = 60 * 1000
const PIX_FALLBACK_POLLING_WINDOW_MS = 30 * 60 * 1000
const PIX_FINAL_STATUSES = new Set(['approved', 'rejected', 'cancelled', 'refunded', 'charged_back'])
const PAYMENT_METHOD_LABELS = {
  pix: 'Pix',
  credit_card: 'Cartao de credito',
  debit_card: 'Cartao de debito',
}
const CUSTOMER_FREIGHT_ERROR_MESSAGES = {
  api_indisponivel: 'Entrega automatica indisponivel no momento.',
  api_melhor_envio: 'Entrega automatica indisponivel no momento.',
  api_melhor_envio_validacao: 'Nao encontramos uma entrega automatica para este carrinho e CEP.',
  cep_origem_nao_configurado: 'Entrega automatica indisponivel no momento.',
  endpoint_melhor_envio: 'Entrega automatica indisponivel no momento.',
  melhor_envio_nao_conectado: 'Entrega automatica indisponivel no momento.',
  oauth_ambiente_incorreto: 'Entrega automatica indisponivel no momento.',
  oauth_client_nao_configurado: 'Entrega automatica indisponivel no momento.',
  oauth_credenciais_invalidas: 'Entrega automatica indisponivel no momento.',
  oauth_refresh_ausente: 'Entrega automatica indisponivel no momento.',
  oauth_resposta_invalida: 'Entrega automatica indisponivel no momento.',
  oauth_token_erro: 'Entrega automatica indisponivel no momento.',
  reconexao_necessaria: 'Entrega automatica indisponivel no momento.',
  timeout_melhor_envio: 'A consulta de frete demorou demais. Tente novamente.',
  token_invalido: 'Entrega automatica indisponivel no momento.',
  token_invalido_ambiente: 'Entrega automatica indisponivel no momento.',
  token_nao_configurado: 'Entrega automatica indisponivel no momento.',
  token_sem_permissao: 'Entrega automatica indisponivel no momento.',
}
const CHECKOUT_ERROR_TARGETS = {
  nome: '#ck-nome',
  email: '#ck-email',
  telefone: '#ck-tel',
  documento: '#ck-documento',
  cep: '#ck-cep',
  rua: '#ck-rua',
  numero: '#ck-num',
  bairro: '#ck-bairro',
  cidade: '#ck-cidade',
  estado: '#ck-estado',
  frete: '.store-frete-options',
  pagamento: '.store-payment-fieldset',
  cartao: '#mp-cardholder-name',
}
const CHECKOUT_ERROR_ORDER = [
  'nome',
  'email',
  'telefone',
  'documento',
  'cep',
  'rua',
  'numero',
  'bairro',
  'cidade',
  'estado',
  'frete',
  'pagamento',
  'cartao',
]
const CHECKOUT_DATA_ERROR_FIELDS = CHECKOUT_ERROR_ORDER.filter(
  (field) => !['frete', 'pagamento', 'cartao'].includes(field)
)

const emptyForm = {
  nome: '',
  email: '',
  telefone: '',
  documento: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
}

const emptyCardForm = {
  cardholderName: '',
  issuerId: '',
  installments: '',
  paymentMethodId: '',
  paymentTypeId: '',
  issuerOptions: [],
  installmentOptions: [],
  installmentsLoading: false,
  installmentError: '',
  loading: false,
  ready: false,
  error: '',
}

function getDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function createOrderNotificationToken() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }

  const randomPart = Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${randomPart}`
}

function triggerOrderNotification(pedidoId, notificationToken) {
  notifyNewOrder({ pedidoId, notificationToken }).catch((error) => {
    console.warn('[pedido] notificacao de novo pedido falhou', {
      pedidoId,
      message: error.message,
    })
  })
}

function formatCpfCnpj(value) {
  const digits = getDigits(value).slice(0, 14)

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

function getDocumentType(value) {
  const digits = getDigits(value)

  if (digits.length === 11) {
    return 'cpf'
  }

  if (digits.length === 14) {
    return 'cnpj'
  }

  return ''
}

function isValidCpfCnpj(value) {
  return Boolean(getDocumentType(value))
}

function formatCep(value) {
  const digits = getDigits(value).slice(0, 8)

  if (digits.length <= 5) {
    return digits
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

async function fetchAddressByCep(cep, signal) {
  try {
    const data = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`, { signal })

    if (data?.erro) {
      const error = new Error('CEP nao encontrado.')
      error.code = 'cep_nao_encontrado'
      throw error
    }

    return {
      rua: data.logradouro || '',
      bairro: data.bairro || '',
      cidade: data.localidade || '',
      estado: data.uf || '',
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error
    }

    try {
      const data = await fetchJson(`https://brasilapi.com.br/api/cep/v1/${cep}`, { signal })

      return {
        rua: data.street || '',
        bairro: data.neighborhood || '',
        cidade: data.city || '',
        estado: data.state || '',
      }
    } catch (fallbackError) {
      if (fallbackError.name === 'AbortError') {
        throw fallbackError
      }

      const nextError = new Error(
        error.code === 'cep_nao_encontrado'
          ? 'CEP nao encontrado.'
          : 'Nao foi possivel buscar o CEP agora.',
      )
      nextError.code = error.code === 'cep_nao_encontrado' ? 'cep_nao_encontrado' : 'cep_api_indisponivel'
      throw nextError
    }
  }
}

function loadMercadoPagoSdk() {
  if (window.MercadoPago) {
    return Promise.resolve(window.MercadoPago)
  }

  const existingScript = document.querySelector(`script[src="${MERCADO_PAGO_SDK_URL}"]`)

  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(window.MercadoPago), { once: true })
      existingScript.addEventListener('error', reject, { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = MERCADO_PAGO_SDK_URL
    script.async = true
    script.onload = () => resolve(window.MercadoPago)
    script.onerror = () => reject(new Error('Nao foi possivel carregar o Mercado Pago.'))
    document.head.appendChild(script)
  })
}

function getPaymentMethods(config) {
  const methods = config?.metodos || {}
  const result = []

  if (methods.pix) result.push('pix')
  if (methods.credito) result.push('credit_card')
  if (methods.debito) result.push('debit_card')

  return result
}

function isMercadoPagoActive(config) {
  return Boolean(config?.ativo && config?.publicKey && getPaymentMethods(config).length)
}

function getMercadoPagoPaymentType(method) {
  if (method === 'credit_card') return 'credit_card'
  if (method === 'debit_card') return 'debit_card'
  return ''
}

function getCheckoutValidationMessage(nextErrors) {
  if (CHECKOUT_DATA_ERROR_FIELDS.some((field) => nextErrors[field])) {
    return 'Preencha os dados obrigatorios para finalizar o pedido.'
  }

  if (nextErrors.frete) {
    return nextErrors.frete
  }

  if (nextErrors.pagamento) {
    return nextErrors.pagamento
  }

  if (nextErrors.cartao) {
    return nextErrors.cartao
  }

  return 'Preencha os dados obrigatorios para finalizar o pedido.'
}

function scrollToFirstCheckoutError(nextErrors) {
  const firstField = CHECKOUT_ERROR_ORDER.find((field) => nextErrors[field])
  const selector = CHECKOUT_ERROR_TARGETS[firstField]

  if (!selector) {
    return
  }

  window.requestAnimationFrame(() => {
    const target = document.querySelector(selector)

    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })

    if (typeof target.focus === 'function' && target.matches('input, select, textarea, button')) {
      target.focus({ preventScroll: true })
    }
  })
}

function createSelectOption(value, label, extra = {}) {
  return {
    value: String(value || ''),
    label: String(label || value || ''),
    ...extra,
  }
}

function formatInstallmentOptionLabel(option) {
  const recommendedMessage = String(option?.recommended_message || '').trim()

  if (recommendedMessage) {
    return recommendedMessage
  }

  const count = Number(option?.installments || 0)
  const installmentAmount = Number(option?.installment_amount || 0)
  const totalAmount = Number(option?.total_amount || installmentAmount * count)
  const hasInterest = Number(option?.installment_rate || 0) > 0
  const totalLabel = hasInterest ? ` - total ${formatCurrency(totalAmount)}` : ''
  const interestLabel = hasInterest ? 'com juros' : 'sem juros'

  return `${count}x de ${formatCurrency(installmentAmount)} ${interestLabel}${totalLabel}`
}

function buildMercadoPagoInstallmentOptions(payerCosts = [], paymentConfig = {}) {
  const maxInstallments = Number(paymentConfig.maxParcelasCredito || 12)
  const minInstallmentAmount = Number(paymentConfig.valorMinimoParcela || 0)

  return payerCosts
    .filter((option) => {
      const count = Number(option?.installments || 0)
      const installmentAmount = Number(option?.installment_amount || 0)

      return Number.isInteger(count) &&
        count >= 1 &&
        count <= maxInstallments &&
        installmentAmount > 0 &&
        (!minInstallmentAmount || installmentAmount >= minInstallmentAmount)
    })
    .map((option) => createSelectOption(
      option.installments,
      formatInstallmentOptionLabel(option),
      {
        installmentAmount: Number(option.installment_amount || 0),
        totalPaidAmount: Number(option.total_amount || 0),
        installmentRate: Number(option.installment_rate || 0),
      },
    ))
}

function normalizePaymentResult(value) {
  if (!value) {
    return null
  }

  return typeof value === 'string' ? { id: value } : value
}

function getPaymentStatus(payment) {
  return String(payment?.statusMercadoPago || payment?.status || '').trim()
}

function isPendingPixPayment(payment) {
  return payment?.metodo === 'pix' && !PIX_FINAL_STATUSES.has(getPaymentStatus(payment))
}

function getPixPollingDeadline(payment) {
  const expiresAt = Date.parse(payment?.expiresAt || '')

  if (Number.isFinite(expiresAt)) {
    return expiresAt
  }

  const createdAt = Date.parse(payment?.createdAt || '')

  if (Number.isFinite(createdAt)) {
    return createdAt + PIX_FALLBACK_POLLING_WINDOW_MS
  }

  return Date.now() + PIX_FALLBACK_POLLING_WINDOW_MS
}

function getFreightLabel(option) {
  if (!option) {
    return 'Nao selecionado'
  }

  return option.label || [option.transportadora, option.modalidade].filter(Boolean).join(' ') || 'Frete'
}

function buildPickupFreightOption(config) {
  if (!config?.ativo) {
    return null
  }

  const label = String(config.titulo || 'Retirada no local').trim() || 'Retirada no local'
  const prazoTexto = String(config.prazoTexto || 'Agende a retirada').trim() || 'Agende a retirada'

  return {
    id: 'retirada-local',
    provider: 'retirada_local',
    tipo: 'retirada',
    label,
    transportadora: 'Decoratie',
    modalidade: label,
    valor: 0,
    valorOriginal: 0,
    valorFinal: 0,
    prazoTexto,
  }
}

function shouldOfferContactFreight(errorOrResult) {
  return !CONTACT_FREIGHT_CODES_BLOCKLIST.has(errorOrResult?.code)
}

function buildContactFreightOption() {
  return {
    id: 'frete-a-combinar',
    provider: 'a_combinar',
    tipo: 'a_combinar',
    label: 'Combinar entrega',
    transportadora: 'Decoratie',
    modalidade: 'Entrega a combinar',
    valor: 0,
    valorOriginal: null,
    valorFinal: null,
    valorPendente: true,
    prazoTexto: 'A loja confirma o frete pelo WhatsApp',
  }
}

function getFreightAmount(option) {
  if (!option || option.valorPendente) {
    return null
  }

  const rawValue = option.valorFinal ?? option.valor
  const amount = Number(rawValue)

  return Number.isFinite(amount) ? amount : null
}

function isValidTransportFreightOption(option) {
  if (!option) {
    return false
  }

  if (option.provider !== 'melhor_envio') {
    return true
  }

  return getFreightAmount(option) !== null
}

function shouldShowFreeFreight(option) {
  if (!option) {
    return false
  }

  if (option.provider === 'retirada_local') {
    return true
  }

  if (option.provider !== 'melhor_envio') {
    return false
  }

  return Boolean(option.freteGratisAplicado) && getFreightAmount(option) === 0
}

function sanitizeFreightOptionForDebug(option) {
  if (!option) {
    return null
  }

  return {
    id: option.id,
    provider: option.provider,
    servicoId: option.servicoId,
    transportadora: option.transportadora,
    modalidade: option.modalidade,
    valor: option.valor,
    valorOriginal: option.valorOriginal,
    valorFinal: option.valorFinal,
    freteGratisAplicado: Boolean(option.freteGratisAplicado),
    prazoTexto: option.prazoTexto,
  }
}

function sanitizeFreightResultForDebug(result) {
  return {
    provider: result?.provider,
    ativo: result?.ativo,
    opcoes: Array.isArray(result?.opcoes)
      ? result.opcoes.map(sanitizeFreightOptionForDebug)
      : [],
    retiradaLocal: result?.retiradaLocal ? { ativo: Boolean(result.retiradaLocal.ativo) } : null,
    mensagem: result?.mensagem || '',
  }
}

function getFreightPriceLabel(option) {
  if (!option) {
    return '-'
  }

  if (option.valorPendente) {
    return 'A combinar'
  }

  if (shouldShowFreeFreight(option)) {
    return 'Gratis'
  }

  const price = getFreightAmount(option)

  if (option.provider === 'melhor_envio' && price === null) {
    return 'Indisponivel'
  }

  return price === null ? '-' : formatCurrency(price)
}

function getCustomerFreightErrorMessage(error) {
  if (error?.code && CUSTOMER_FREIGHT_ERROR_MESSAGES[error.code]) {
    return CUSTOMER_FREIGHT_ERROR_MESSAGES[error.code]
  }

  return error?.message || 'Nao foi possivel calcular o frete agora.'
}

function buildFreightPayload(option, cepDestino) {
  if (!option) {
    return null
  }

  if (option.provider === 'melhor_envio') {
    return {
      provider: 'melhor_envio',
      cepDestino,
      transportadora: option.transportadora,
      modalidade: option.modalidade,
      servicoId: option.servicoId,
      companyId: option.companyId,
      prazo: option.prazo,
      prazoTexto: option.prazoTexto,
      prazoOriginalTransportadora: option.prazoOriginalTransportadora ?? option.prazo,
      diasExtrasPreparacao: option.diasExtrasPreparacao ?? 0,
      prazoFinalCliente: option.prazoFinalCliente ?? option.prazo,
      prazoMinOriginal: option.prazoMinOriginal ?? null,
      prazoMaxOriginal: option.prazoMaxOriginal ?? null,
      prazoMinFinal: option.prazoMinFinal ?? null,
      prazoMaxFinal: option.prazoMaxFinal ?? null,
      valor: option.valorFinal ?? option.valor,
      valorOriginal: option.valorOriginal,
      valorFinal: option.valorFinal ?? option.valor,
      taxaManuseio: option.taxaManuseio,
      freteGratisAplicado: Boolean(option.freteGratisAplicado || option.freteGratis),
      regraFreteGratis: option.regraFreteGratis || null,
      selecionadoEm: new Date().toISOString(),
      cotacaoResumo: option.cotacaoResumo || null,
    }
  }

  if (option.provider === 'retirada_local') {
    return {
      provider: 'retirada_local',
      cepDestino,
      tipo: 'retirada',
      transportadora: option.transportadora,
      modalidade: option.modalidade,
      prazoTexto: option.prazoTexto,
      prazoOriginalTransportadora: null,
      diasExtrasPreparacao: 0,
      prazoFinalCliente: null,
      prazoMinOriginal: null,
      prazoMaxOriginal: null,
      prazoMinFinal: null,
      prazoMaxFinal: null,
      valor: 0,
      valorOriginal: 0,
      valorFinal: 0,
      selecionadoEm: new Date().toISOString(),
    }
  }

  if (option.provider === 'a_combinar') {
    return {
      provider: 'a_combinar',
      cepDestino,
      tipo: 'a_combinar',
      transportadora: option.transportadora,
      modalidade: option.modalidade,
      prazoTexto: option.prazoTexto,
      prazoOriginalTransportadora: null,
      diasExtrasPreparacao: 0,
      prazoFinalCliente: null,
      prazoMinOriginal: null,
      prazoMaxOriginal: null,
      prazoMinFinal: null,
      prazoMaxFinal: null,
      valor: null,
      valorPendente: true,
      selecionadoEm: new Date().toISOString(),
      observacao: 'Frete pendente de confirmacao manual com o cliente.',
    }
  }

  return null
}

export default function CheckoutPage() {
  const { items, clearCart } = useCart()
  const { createOrder, submitting, error: submitError } = useOrders()
  const [form, setForm] = useState(emptyForm)
  const [shippingOptions, setShippingOptions] = useState([])
  const [selectedShippingId, setSelectedShippingId] = useState('')
  const [shippingLoading, setShippingLoading] = useState(false)
  const [shippingError, setShippingError] = useState('')
  const [shippingNotice, setShippingNotice] = useState(FREIGHT_INITIAL_NOTICE)
  const [errors, setErrors] = useState({})
  const [orderComplete, setOrderComplete] = useState(null)
  const [cepLookup, setCepLookup] = useState({ loading: false, error: '', success: '' })
  const [paymentConfig, setPaymentConfig] = useState(null)
  const [paymentConfigLoading, setPaymentConfigLoading] = useState(false)
  const [paymentConfigError, setPaymentConfigError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentProcessing, setPaymentProcessing] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [checkoutSubmitError, setCheckoutSubmitError] = useState('')
  const [pixPollingChecking, setPixPollingChecking] = useState(false)
  const [pixPollingMessage, setPixPollingMessage] = useState('')
  const [pixPollingError, setPixPollingError] = useState('')
  const [cardForm, setCardForm] = useState(emptyCardForm)
  const [headerHeight, setHeaderHeight] = useState(76)
  const headerRef = useRef(null)
  const numeroRef = useRef(null)
  const mpInstanceRef = useRef(null)
  const mpFieldsRef = useRef([])
  const currentBinRef = useRef('')

  useEffect(() => {
    document.title = 'Checkout | Decoratie'
  }, [])

  useEffect(() => {
    let active = true

    setPaymentConfigLoading(true)
    setPaymentConfigError('')

    getMercadoPagoPublicConfig()
      .then((result) => {
        if (!active) {
          return
        }

        const config = result?.mercadoPago || null
        const methods = getPaymentMethods(config)
        setPaymentConfig(config)
        setPaymentMethod(methods[0] || '')
      })
      .catch((error) => {
        if (active) {
          setPaymentConfig(null)
          setPaymentConfigError(error.message || 'Pagamento online indisponivel.')
        }
      })
      .finally(() => {
        if (active) {
          setPaymentConfigLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useLayoutEffect(() => {
    const headerNode = headerRef.current

    if (!headerNode) {
      return undefined
    }

    const syncHeaderHeight = () => {
      const nextHeight = Math.ceil(headerNode.getBoundingClientRect().height)
      setHeaderHeight((current) => (current === nextHeight ? current : nextHeight))
    }

    syncHeaderHeight()

    let resizeObserver = null

    if (typeof globalThis.ResizeObserver !== 'undefined') {
      resizeObserver = new globalThis.ResizeObserver(syncHeaderHeight)
      resizeObserver.observe(headerNode)
    }

    window.addEventListener('resize', syncHeaderHeight)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncHeaderHeight)
    }
  }, [])

  const cartItems = useMemo(
    () => Array.from(
      items.reduce((map, item) => {
        const produtoId = String(item?.produtoId || '').trim()

        if (!produtoId) {
          return map
        }

        const normalizedItem = {
          produtoId,
          nome: String(item?.nome || 'Produto').trim() || 'Produto',
          preco: Number(item?.preco) || 0,
          quantidade: Math.max(1, Number.parseInt(item?.quantidade, 10) || 1),
          imagem: typeof item?.imagem === 'string' ? item.imagem : '',
        }

        const existingItem = map.get(produtoId)

        if (existingItem) {
          map.set(produtoId, {
            ...existingItem,
            quantidade: existingItem.quantidade + normalizedItem.quantidade,
          })

          return map
        }

        map.set(produtoId, normalizedItem)
        return map
      }, new Map()).values()
    ),
    [items]
  )

  const selectedShipping = useMemo(
    () => shippingOptions.find((option) => option.id === selectedShippingId) ?? null,
    [selectedShippingId, shippingOptions]
  )

  const paymentMethods = useMemo(() => getPaymentMethods(paymentConfig), [paymentConfig])
  const mercadoPagoActive = useMemo(() => isMercadoPagoActive(paymentConfig), [paymentConfig])

  useEffect(() => {
    if (!paymentMethods.length) {
      setPaymentMethod('')
      return
    }

    if (!paymentMethods.includes(paymentMethod)) {
      setPaymentMethod(paymentMethods[0])
    }
  }, [paymentMethod, paymentMethods])

  const totalItems = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.quantidade, 0),
    [cartItems]
  )

  const subtotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.preco * item.quantidade, 0),
    [cartItems]
  )

  const total = useMemo(
    () => subtotal + (getFreightAmount(selectedShipping) ?? 0),
    [subtotal, selectedShipping]
  )

  const quoteItemsKey = useMemo(
    () => cartItems.map((item) => `${item.produtoId}:${item.quantidade}`).join('|'),
    [cartItems]
  )

  const checkoutStyle = useMemo(
    () => ({ '--store-checkout-header-offset': `${headerHeight}px` }),
    [headerHeight]
  )

  useEffect(() => {
    const cepDestino = getDigits(form.cep)

    if (cepDestino.length !== 8 || cartItems.length === 0) {
      setShippingLoading(false)
      setShippingError('')
      setShippingNotice(FREIGHT_INITIAL_NOTICE)
      setShippingOptions([])
      setSelectedShippingId('')
      return undefined
    }

    setShippingLoading(true)
    setShippingError('')
    setShippingNotice('')
    setShippingOptions([])
    setSelectedShippingId('')

    let cancelled = false
    const timeout = window.setTimeout(async () => {
      try {
        const result = await quoteFreight({
          cepDestino,
          itens: cartItems.map((item) => ({
            produtoId: item.produtoId,
            quantidade: item.quantidade,
          })),
        })

        if (cancelled) {
          return
        }

        if (import.meta.env.DEV) {
          console.debug('[frete] payload recebido', sanitizeFreightResultForDebug(result))
        }

        const apiOptions = result?.ativo && Array.isArray(result.opcoes) ? result.opcoes : []
        const melhorEnvioOptions = apiOptions.filter(isValidTransportFreightOption)

        if (import.meta.env.DEV && apiOptions.length !== melhorEnvioOptions.length) {
          console.warn('[frete] opcoes ignoradas por valor invalido', {
            recebidas: apiOptions.map(sanitizeFreightOptionForDebug),
            validas: melhorEnvioOptions.map(sanitizeFreightOptionForDebug),
          })
        }

        const pickupOption = buildPickupFreightOption(result?.retiradaLocal)
        const contactOption = !melhorEnvioOptions.length && !pickupOption && shouldOfferContactFreight(result)
          ? buildContactFreightOption()
          : null
        const nextOptions = [...melhorEnvioOptions, pickupOption, contactOption].filter(Boolean)

        setShippingOptions(nextOptions)
        setSelectedShippingId(nextOptions[0]?.id || '')

        if (!nextOptions.length) {
          setShippingNotice(
            result?.mensagem ||
              (result?.ativo === false
                ? 'O frete pelo Melhor Envio ainda nao esta ativo para este checkout.'
                : 'Nenhuma opcao de frete disponivel para este CEP.'),
          )
          return
        }

        if (contactOption) {
          setShippingNotice(
            `${result?.mensagem || 'Nao ha entrega automatica disponivel para este CEP.'} Voce pode finalizar com frete a combinar.`,
          )
          return
        }

        if (!melhorEnvioOptions.length && result?.mensagem) {
          setShippingNotice(result.mensagem)
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        console.warn('[frete] cotacao indisponivel', {
          code: error.code || 'frete_erro',
          message: error.message,
          details: error.details || null,
        })

        const pickupOption = buildPickupFreightOption(error.retiradaLocal)
        const contactOption = !pickupOption && shouldOfferContactFreight(error)
          ? buildContactFreightOption()
          : null
        const nextOptions = [pickupOption, contactOption].filter(Boolean)

        setShippingOptions(nextOptions)
        setSelectedShippingId(nextOptions[0]?.id || '')
        setShippingError(
          `${getCustomerFreightErrorMessage(error)}${
            contactOption ? ' Voce pode finalizar com frete a combinar.' : ''
          }`,
        )
      } finally {
        if (!cancelled) {
          setShippingLoading(false)
        }
      }
    }, 450)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [cartItems, quoteItemsKey, form.cep])

  useEffect(() => {
    if (import.meta.env.DEV && shippingOptions.length) {
      console.debug('[frete] opcoes renderizadas', shippingOptions.map(sanitizeFreightOptionForDebug))
    }
  }, [shippingOptions])

  useEffect(() => {
    const isCardMethod = paymentMethod === 'credit_card' || paymentMethod === 'debit_card'

    if (!mercadoPagoActive || !isCardMethod || !paymentConfig?.publicKey) {
      mpFieldsRef.current.forEach((field) => field?.unmount?.())
      mpFieldsRef.current = []
      mpInstanceRef.current = null
      currentBinRef.current = ''
      setCardForm(emptyCardForm)
      return undefined
    }

    let cancelled = false

    async function setupCardFields() {
      try {
        setCardForm((current) => ({ ...current, loading: true, error: '', ready: false }))
        const MercadoPago = await loadMercadoPagoSdk()

        if (cancelled) {
          return
        }

        const mp = new MercadoPago(paymentConfig.publicKey, { locale: 'pt-BR' })
        const cardNumber = mp.fields.create('cardNumber', {
          placeholder: '0000 0000 0000 0000',
        }).mount('mp-card-number')
        const expirationDate = mp.fields.create('expirationDate', {
          placeholder: 'MM/AA',
        }).mount('mp-expiration-date')
        const securityCode = mp.fields.create('securityCode', {
          placeholder: 'CVV',
        }).mount('mp-security-code')

        mpInstanceRef.current = mp
        mpFieldsRef.current = [cardNumber, expirationDate, securityCode]

        cardNumber.on('binChange', async ({ bin }) => {
          if (cancelled) {
            return
          }

          if (!bin) {
            currentBinRef.current = ''
            setCardForm((current) => ({
              ...current,
              paymentMethodId: '',
              paymentTypeId: '',
              issuerId: '',
              issuerOptions: [],
              installmentOptions: [],
              installments: paymentMethod === 'debit_card' ? '1' : '',
              installmentsLoading: false,
              installmentError: '',
            }))
            return
          }

          if (bin === currentBinRef.current) {
            return
          }

          currentBinRef.current = bin
          setCardForm((current) => ({
            ...current,
            loading: true,
            installmentsLoading: paymentMethod === 'credit_card',
            installmentError: '',
            error: '',
          }))

          try {
            const paymentTypeId = getMercadoPagoPaymentType(paymentMethod)
            const { results = [] } = await mp.getPaymentMethods({ bin })
            const paymentMethodData =
              results.find((item) => item.payment_type_id === paymentTypeId) ||
              results[0]

            if (!paymentMethodData) {
              throw new Error('Bandeira nao disponivel para esta forma de pagamento.')
            }

            cardNumber.update?.({
              settings: paymentMethodData.settings?.[0]?.card_number,
            })
            securityCode.update?.({
              settings: paymentMethodData.settings?.[0]?.security_code,
            })

            let issuerOptions = []

            if (paymentMethodData.issuer) {
              issuerOptions = [paymentMethodData.issuer]
            }

            if (paymentMethodData.additional_info_needed?.includes('issuer_id')) {
              issuerOptions = await mp.getIssuers({
                paymentMethodId: paymentMethodData.id,
                bin,
              })
            }

            let installmentOptions = []
            let installmentError = ''

            if (paymentMethod === 'credit_card') {
              try {
                const installments = await mp.getInstallments({
                  amount: total.toFixed(2),
                  bin,
                  paymentTypeId: 'credit_card',
                  paymentMethodId: paymentMethodData.id,
                  issuerId: issuerOptions[0]?.id ? String(issuerOptions[0].id) : undefined,
                })
                installmentOptions = buildMercadoPagoInstallmentOptions(
                  installments?.[0]?.payer_costs || [],
                  paymentConfig,
                )

                if (!installmentOptions.length) {
                  installmentError = 'Nenhuma opcao de parcelamento disponivel para este cartao.'
                }
              } catch (error) {
                installmentError = error.message || 'Nao foi possivel carregar as parcelas. Tente novamente.'
              }
            }

            setCardForm((current) => ({
              ...current,
              loading: false,
              ready: true,
              paymentMethodId: paymentMethodData.id,
              paymentTypeId: paymentMethodData.payment_type_id,
              issuerId: issuerOptions[0]?.id ? String(issuerOptions[0].id) : '',
              issuerOptions: issuerOptions.map((issuer) => createSelectOption(issuer.id, issuer.name)),
              installmentOptions,
              installments: paymentMethod === 'credit_card'
                ? installmentOptions[0]?.value || ''
                : '1',
              installmentsLoading: false,
              installmentError,
              error: '',
            }))
          } catch (error) {
            setCardForm((current) => ({
              ...current,
              loading: false,
              installmentsLoading: false,
              ready: false,
              error: error.message || 'Nao foi possivel identificar o cartao.',
            }))
          }
        })

        setCardForm((current) => ({ ...current, loading: false, ready: true, error: '' }))
      } catch (error) {
        if (!cancelled) {
          setCardForm((current) => ({
            ...current,
            loading: false,
            installmentsLoading: false,
            ready: false,
            error: error.message || 'Nao foi possivel carregar pagamento por cartao.',
          }))
        }
      }
    }

    setupCardFields()

    return () => {
      cancelled = true
      mpFieldsRef.current.forEach((field) => field?.unmount?.())
      mpFieldsRef.current = []
      mpInstanceRef.current = null
      currentBinRef.current = ''
    }
  }, [mercadoPagoActive, paymentConfig, paymentMethod, total])

  useEffect(() => {
    const cep = getDigits(form.cep)

    if (cep.length !== 8) {
      setCepLookup({ loading: false, error: '', success: '' })
      return undefined
    }

    const controller = typeof window.AbortController === 'function'
      ? new window.AbortController()
      : null
    let cancelled = false

    setCepLookup({ loading: true, error: '', success: '' })

    fetchAddressByCep(cep, controller?.signal)
      .then((address) => {
        if (cancelled) {
          return
        }

        setForm((currentForm) => ({
          ...currentForm,
          rua: address.rua || '',
          bairro: address.bairro || '',
          cidade: address.cidade || '',
          estado: address.estado || '',
        }))
        setErrors((currentErrors) => ({
          ...currentErrors,
          cep: '',
          rua: '',
          bairro: '',
          cidade: '',
          estado: '',
        }))
        setCepLookup({ loading: false, error: '', success: 'Endereco preenchido pelo CEP.' })

        window.setTimeout(() => {
          numeroRef.current?.focus()
        }, 50)
      })
      .catch((error) => {
        if (cancelled || error.name === 'AbortError') {
          return
        }

        setCepLookup({
          loading: false,
          error: error.code === 'cep_nao_encontrado'
            ? 'CEP nao encontrado. Confira o numero ou preencha o endereco manualmente.'
            : 'Nao foi possivel buscar o CEP agora. Preencha o endereco manualmente.',
          success: '',
        })
      })

    return () => {
      cancelled = true
      controller?.abort()
    }
  }, [form.cep])

  function update(field, value) {
    const nextValue = field === 'documento'
      ? formatCpfCnpj(value)
      : field === 'cep'
        ? formatCep(value)
        : value

    setForm((currentForm) => ({ ...currentForm, [field]: nextValue }))
    setCheckoutSubmitError('')

    if (errors[field]) {
      setErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
    }
  }

  function updateCardField(field, value) {
    setCardForm((current) => ({
      ...current,
      [field]: value,
    }))
    setCheckoutSubmitError('')

    if (errors.cartao || errors.pagamento) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        cartao: '',
        pagamento: '',
      }))
    }

    if (field === 'issuerId' && paymentMethod === 'credit_card') {
      refreshCardInstallments(value)
    }
  }

  async function refreshCardInstallments(issuerId = cardForm.issuerId) {
    const mp = mpInstanceRef.current
    const bin = currentBinRef.current

    if (!mp || !bin || paymentMethod !== 'credit_card' || !cardForm.paymentMethodId) {
      return
    }

    setCardForm((current) => ({
      ...current,
      installments: '',
      installmentOptions: [],
      installmentsLoading: true,
      installmentError: '',
    }))

    try {
      const installments = await mp.getInstallments({
        amount: total.toFixed(2),
        bin,
        paymentTypeId: 'credit_card',
        paymentMethodId: cardForm.paymentMethodId,
        issuerId: issuerId || undefined,
      })
      const installmentOptions = buildMercadoPagoInstallmentOptions(
        installments?.[0]?.payer_costs || [],
        paymentConfig,
      )

      setCardForm((current) => ({
        ...current,
        installmentOptions,
        installments: installmentOptions[0]?.value || '',
        installmentsLoading: false,
        installmentError: installmentOptions.length
          ? ''
          : 'Nenhuma opcao de parcelamento disponivel para este cartao.',
      }))
    } catch (error) {
      setCardForm((current) => ({
        ...current,
        installmentOptions: [],
        installments: '',
        installmentsLoading: false,
        installmentError: error.message || 'Nao foi possivel carregar as parcelas. Tente novamente.',
      }))
    }
  }

  function selectPaymentMethod(method) {
    setPaymentMethod(method)
    setPaymentError('')
    setCheckoutSubmitError('')
    setErrors((currentErrors) => ({
      ...currentErrors,
      pagamento: '',
      cartao: '',
    }))
  }

  function validate() {
    const nextErrors = {}
    const phoneDigits = getDigits(form.telefone)
    const documentDigits = getDigits(form.documento)

    if (!form.nome.trim()) nextErrors.nome = 'Nome obrigatorio'
    if (!EMAIL_REGEX.test(form.email)) nextErrors.email = 'E-mail invalido'
    if (phoneDigits.length < 10 || phoneDigits.length > 11) nextErrors.telefone = 'Telefone invalido'
    if (!documentDigits || !isValidCpfCnpj(form.documento)) {
      nextErrors.documento = 'Informe um CPF ou CNPJ valido para continuar.'
    }
    if (!form.cep.trim()) nextErrors.cep = 'CEP obrigatorio'
    else if (getDigits(form.cep).length !== 8) nextErrors.cep = 'CEP invalido'
    if (!form.rua.trim()) nextErrors.rua = 'Rua obrigatoria'
    if (!form.numero.trim()) nextErrors.numero = 'Numero obrigatorio'
    if (!form.bairro.trim()) nextErrors.bairro = 'Bairro obrigatorio'
    if (!form.cidade.trim()) nextErrors.cidade = 'Cidade obrigatoria'
    if (!form.estado.trim()) nextErrors.estado = 'Estado obrigatorio'
    if (shippingLoading) nextErrors.frete = 'Aguarde o calculo do frete'
    else if (!selectedShipping) nextErrors.frete = 'Selecione uma opcao de frete'
    if (paymentConfigLoading) nextErrors.pagamento = 'Aguarde carregar as formas de pagamento'
    if (mercadoPagoActive && !paymentMethod) {
      nextErrors.pagamento = 'Selecione uma forma de pagamento'
    }
    if (mercadoPagoActive && (paymentMethod === 'credit_card' || paymentMethod === 'debit_card')) {
      if (!cardForm.cardholderName.trim()) {
        nextErrors.cartao = 'Informe o nome impresso no cartao'
      } else if (!cardForm.paymentMethodId) {
        nextErrors.cartao = 'Preencha um cartao valido para continuar'
      } else if (paymentMethod === 'credit_card' && cardForm.installmentsLoading) {
        nextErrors.cartao = 'Aguarde carregar as parcelas do cartao'
      } else if (paymentMethod === 'credit_card' && cardForm.installmentError) {
        nextErrors.cartao = cardForm.installmentError
      } else if (
        paymentMethod === 'credit_card' &&
        !cardForm.installmentOptions.some((option) => option.value === cardForm.installments)
      ) {
        nextErrors.cartao = 'Selecione uma opcao de parcelamento valida'
      } else if (cardForm.error) {
        nextErrors.cartao = cardForm.error
      }
    }

    setErrors(nextErrors)
    const isValid = Object.keys(nextErrors).length === 0

    if (!isValid) {
      setCheckoutSubmitError(getCheckoutValidationMessage(nextErrors))
      scrollToFirstCheckoutError(nextErrors)
    }

    return isValid
  }

  async function tokenizeCard() {
    const mp = mpInstanceRef.current

    if (!mp?.fields?.createCardToken) {
      throw new Error('Pagamento por cartao ainda nao foi carregado.')
    }

    const documentType = getDocumentType(form.documento) === 'cnpj' ? 'CNPJ' : 'CPF'
    const token = await mp.fields.createCardToken({
      cardholderName: cardForm.cardholderName.trim(),
      identificationType: documentType,
      identificationNumber: getDigits(form.documento),
    })

    if (!token?.id) {
      throw new Error('Nao foi possivel tokenizar o cartao.')
    }

    const selectedInstallment = cardForm.installmentOptions.find(
      (option) => option.value === cardForm.installments,
    )

    if (paymentMethod === 'credit_card' && !selectedInstallment) {
      throw new Error('Selecione uma opcao de parcelamento valida.')
    }

    return {
      token: token.id,
      payment_method_id: cardForm.paymentMethodId,
      issuer_id: cardForm.issuerId || undefined,
      installments: paymentMethod === 'debit_card' ? 1 : Number(cardForm.installments || 1),
      card_bin: currentBinRef.current || undefined,
      installment_amount: selectedInstallment?.installmentAmount,
      total_paid_amount: selectedInstallment?.totalPaidAmount,
    }
  }

  async function handleFinalizeOrder(event) {
    event?.preventDefault?.()
    setPaymentError('')

    if (cartItems.length === 0) {
      setCheckoutSubmitError('Seu carrinho esta vazio. Adicione produtos antes de finalizar.')
      return
    }

    if (!validate()) {
      return
    }

    setCheckoutSubmitError('')
    setPaymentProcessing(true)

    try {
      let cardPayload = null

      if (mercadoPagoActive && (paymentMethod === 'credit_card' || paymentMethod === 'debit_card')) {
        cardPayload = await tokenizeCard()
      }

      const frete = buildFreightPayload(selectedShipping, getDigits(form.cep))
      const documentoLimpo = getDigits(form.documento)
      const notificationToken = createOrderNotificationToken()
      const orderId = await createOrder({
        cliente: {
          nome: form.nome.trim(),
          email: form.email.trim().toLowerCase(),
          telefone: form.telefone.trim(),
          documento: formatCpfCnpj(documentoLimpo),
          documentoLimpo,
          tipoDocumento: getDocumentType(documentoLimpo),
          endereco: {
            cep: form.cep.trim(),
            rua: form.rua.trim(),
            numero: form.numero.trim(),
            complemento: form.complemento.trim(),
            bairro: form.bairro.trim(),
            cidade: form.cidade.trim(),
            estado: form.estado.trim(),
          },
        },
        itens: cartItems.map((item) => ({
          produtoId: item.produtoId,
          nome: item.nome,
          preco: item.preco,
          quantidade: item.quantidade,
          imagem: item.imagem,
        })),
        frete,
        subtotal,
        total,
        status: mercadoPagoActive ? 'aguardando_pagamento' : 'pendente',
        pagamento: mercadoPagoActive ? {
          provider: 'mercado_pago',
          metodo: paymentMethod,
          status: 'creating',
          valor: total,
          createdAt: new Date().toISOString(),
        } : null,
        notificationToken,
      })

      if (!orderId) {
        setCheckoutSubmitError('Nao foi possivel criar o pedido. Verifique os dados e tente novamente.')
        return
      }

      if (!mercadoPagoActive) {
        triggerOrderNotification(orderId, notificationToken)
        clearCart()
        setOrderComplete({ id: orderId, status: 'pendente', pagamento: null })
        return
      }

      const paymentResult = await createMercadoPagoPayment({
        pedidoId: orderId,
        metodo: paymentMethod,
        valor: total,
        ...cardPayload,
      })

      if (paymentResult.pagamento?.status === 'rejected') {
        const message = 'Pagamento recusado. Verifique os dados ou tente outra forma de pagamento.'
        setPaymentError(message)
        setCheckoutSubmitError(message)
        return
      }

      clearCart()
      triggerOrderNotification(orderId, notificationToken)
      setOrderComplete({
        id: orderId,
        status: paymentResult.pedidoStatus,
        pagamento: paymentResult.pagamento,
      })
    } catch (error) {
      const message = error.message || 'Nao foi possivel processar o pagamento.'
      setPaymentError(message)
      setCheckoutSubmitError(message)
    } finally {
      setPaymentProcessing(false)
    }
  }

  useEffect(() => {
    const completedOrder = normalizePaymentResult(orderComplete)
    const payment = completedOrder?.pagamento || null

    if (!completedOrder?.id || !payment?.paymentId || payment?.metodo !== 'pix') {
      setPixPollingChecking(false)
      setPixPollingMessage('')
      setPixPollingError('')
      return undefined
    }

    if (!isPendingPixPayment(payment)) {
      setPixPollingChecking(false)
      setPixPollingError('')
      setPixPollingMessage(getPaymentStatus(payment) === 'approved' ? 'Pagamento confirmado.' : '')
      return undefined
    }

    const deadline = getPixPollingDeadline(payment)

    if (Date.now() >= deadline) {
      setPixPollingChecking(false)
      setPixPollingError('')
      setPixPollingMessage('Prazo do Pix expirado. Fale com a loja para gerar uma nova cobranca.')
      return undefined
    }

    let cancelled = false
    setPixPollingMessage('Verificacao automatica ativa: a cada 1 minuto ate o Pix expirar.')
    setPixPollingError('')

    async function checkPaymentStatus() {
      if (cancelled) {
        return
      }

      if (Date.now() >= deadline) {
        setPixPollingChecking(false)
        setPixPollingError('')
        setPixPollingMessage('Prazo do Pix expirado. Fale com a loja para gerar uma nova cobranca.')
        return
      }

      setPixPollingChecking(true)

      try {
        const result = await consultMercadoPagoCheckoutPayment({
          pedidoId: completedOrder.id,
          paymentId: payment.paymentId,
        })

        if (cancelled) {
          return
        }

        if (result?.pagamento) {
          const nextStatus = getPaymentStatus(result.pagamento)

          setOrderComplete({
            id: result.pedidoId || completedOrder.id,
            status: result.pedidoStatus,
            pagamento: result.pagamento,
          })

          setPixPollingError('')
          setPixPollingMessage(
            nextStatus === 'approved'
              ? 'Pagamento confirmado.'
              : 'Pagamento ainda pendente. Vamos verificar novamente em 1 minuto.',
          )
        }
      } catch (error) {
        if (!cancelled) {
          setPixPollingError(
            `${error.message || 'Nao foi possivel verificar o pagamento agora.'} Tentaremos novamente em 1 minuto.`,
          )
        }
      } finally {
        if (!cancelled) {
          setPixPollingChecking(false)
        }
      }
    }

    const intervalId = window.setInterval(checkPaymentStatus, PIX_POLLING_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [orderComplete])

  if (orderComplete) {
    const completedOrder = normalizePaymentResult(orderComplete)
    const payment = completedOrder?.pagamento || null
    const isPixPending = payment?.metodo === 'pix' && payment?.status !== 'approved'
    const isCardApproved = ['credit_card', 'debit_card'].includes(payment?.metodo) && payment?.status === 'approved'

    return (
      <div className="store-page">
        <div className="store-confirmation container">
          <div className="store-confirmation-icon">
            <CheckIcon />
          </div>
          <h1>{isCardApproved ? 'Pagamento aprovado!' : 'Pedido recebido!'}</h1>
          <p className="store-confirmation-id">Codigo: <strong>{completedOrder.id}</strong></p>
          {isPixPending ? (
            <div className="store-pix-result">
              <p>Finalize o pagamento pelo Pix. A confirmacao pode levar alguns instantes.</p>
              {payment.qrCodeBase64 ? (
                <img
                  src={`data:image/png;base64,${payment.qrCodeBase64}`}
                  alt="QR Code Pix"
                  className="store-pix-qr"
                />
              ) : null}
              {payment.copiaECola ? (
                <>
                  <label htmlFor="pix-code">Codigo copia e cola</label>
                  <textarea
                    id="pix-code"
                    className="store-textarea store-pix-code"
                    readOnly
                    value={payment.copiaECola}
                  />
                  <button
                    type="button"
                    className="store-btn store-btn-secondary"
                    onClick={() => window.navigator?.clipboard?.writeText(payment.copiaECola)}
                  >
                    Copiar codigo Pix
                  </button>
                </>
              ) : null}
              <strong>{formatCurrency(payment.valor)}</strong>
              {pixPollingMessage ? (
                <span className="store-field-hint">
                  {pixPollingChecking ? 'Verificando pagamento...' : pixPollingMessage}
                </span>
              ) : null}
              {pixPollingError ? (
                <span className="store-field-error">{pixPollingError}</span>
              ) : null}
            </div>
          ) : (
            <p>Voce recebera atualizacoes sobre o status do pedido.</p>
          )}
          <Link to="/" className="store-btn store-btn-primary">Voltar para a loja</Link>
        </div>
      </div>
    )
  }

  if (cartItems.length === 0) {
    return (
      <div className="store-page">
        <div className="store-confirmation container">
          <h1>Carrinho vazio</h1>
          <p>Adicione produtos antes de finalizar a compra.</p>
          <Link to="/" className="store-btn store-btn-primary">Ver produtos</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="store-page" style={checkoutStyle}>
      <header ref={headerRef} className="store-checkout-header">
        <div className="container store-checkout-header-inner">
          <Link to="/" className="store-back-link">
            <ArrowLeftIcon className="store-back-icon" />
            Voltar
          </Link>
          <Link to="/" className="store-logo-checkout" aria-label="Decoratie - Ir para a loja">
            <img src="/Logo - Decoratie-01.png" alt="Decoratie" />
          </Link>
        </div>
      </header>

      <main className="store-checkout container">
        <h1 className="store-checkout-title">Checkout</h1>

        <div className="store-checkout-grid">
          <form id="store-checkout-form" className="store-checkout-form" onSubmit={handleFinalizeOrder} noValidate>
            <fieldset className="store-fieldset">
              <div className="store-field">
                <h3>Dados pessoais</h3>
                <label htmlFor="ck-nome">Nome completo</label>
                <input
                  id="ck-nome"
                  className="store-input"
                  autoComplete="name"
                  aria-invalid={Boolean(errors.nome)}
                  value={form.nome}
                  onChange={(event) => update('nome', event.target.value)}
                />
                {errors.nome && <span className="store-field-error">{errors.nome}</span>}
              </div>

              <div className="store-field-row">
                <div className="store-field">
                  <label htmlFor="ck-email">E-mail</label>
                  <input
                    id="ck-email"
                    type="email"
                    className="store-input"
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={Boolean(errors.email)}
                    value={form.email}
                    onChange={(event) => update('email', event.target.value)}
                  />
                  {errors.email && <span className="store-field-error">{errors.email}</span>}
                </div>

                <div className="store-field">
                  <label htmlFor="ck-tel">Telefone</label>
                  <input
                    id="ck-tel"
                    type="tel"
                    className="store-input"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    aria-invalid={Boolean(errors.telefone)}
                    value={form.telefone}
                    onChange={(event) => update('telefone', event.target.value)}
                  />
                  {errors.telefone && <span className="store-field-error">{errors.telefone}</span>}
                </div>
              </div>

              <div className="store-field">
                <label htmlFor="ck-documento">CPF ou CNPJ</label>
                <input
                  id="ck-documento"
                  className="store-input"
                  autoComplete="off"
                  inputMode="numeric"
                  placeholder="Digite seu CPF ou CNPJ"
                  aria-invalid={Boolean(errors.documento)}
                  value={form.documento}
                  onChange={(event) => update('documento', event.target.value)}
                />
                {errors.documento && <span className="store-field-error">{errors.documento}</span>}
              </div>
            </fieldset>

            <fieldset className="store-fieldset">
              <div className="store-field">
                <h3>Endereco</h3>
                  <label htmlFor="ck-cep">CEP</label>
                  <input
                    id="ck-cep"
                    className="store-input"
                    autoComplete="postal-code"
                    inputMode="numeric"
                    aria-invalid={Boolean(errors.cep)}
                    value={form.cep}
                    onChange={(event) => update('cep', event.target.value)}
                  />
                  {cepLookup.loading && (
                    <span className="store-field-hint">Buscando endereco pelo CEP...</span>
                  )}
                  {!cepLookup.loading && cepLookup.success && (
                    <span className="store-field-hint">{cepLookup.success}</span>
                  )}
                  {!cepLookup.loading && cepLookup.error && (
                    <span className="store-field-error">{cepLookup.error}</span>
                  )}
                  {errors.cep && <span className="store-field-error">{errors.cep}</span>}
                </div>

                <div className="store-field">
                  <label htmlFor="ck-rua">Rua</label>
                  <input
                    id="ck-rua"
                    className="store-input"
                    autoComplete="address-line1"
                    aria-invalid={Boolean(errors.rua)}
                    value={form.rua}
                    onChange={(event) => update('rua', event.target.value)}
                  />
                  {errors.rua && <span className="store-field-error">{errors.rua}</span>}
                </div>

              <div className="store-field-row">
                <div className="store-field store-field-number">
                  <label htmlFor="ck-num">Numero</label>
                  <input
                    ref={numeroRef}
                    id="ck-num"
                    className="store-input"
                    autoComplete="address-line2"
                    inputMode="numeric"
                    aria-invalid={Boolean(errors.numero)}
                    value={form.numero}
                    onChange={(event) => update('numero', event.target.value)}
                  />
                  {errors.numero && <span className="store-field-error">{errors.numero}</span>}
                </div>

                <div className="store-field">
                  <label htmlFor="ck-comp">Complemento</label>
                  <input
                    id="ck-comp"
                    className="store-input"
                    placeholder="Opcional"
                    value={form.complemento}
                    onChange={(event) => update('complemento', event.target.value)}
                  />
                </div>
              </div>

              <div className="store-field">
                <label htmlFor="ck-bairro">Bairro</label>
                <input
                  id="ck-bairro"
                  className="store-input"
                  autoComplete="address-level3"
                  aria-invalid={Boolean(errors.bairro)}
                  value={form.bairro}
                  onChange={(event) => update('bairro', event.target.value)}
                />
                {errors.bairro && <span className="store-field-error">{errors.bairro}</span>}
              </div>

              <div className="store-field-row">
                <div className="store-field">
                  <label htmlFor="ck-cidade">Cidade</label>
                  <input
                    id="ck-cidade"
                    className="store-input"
                    autoComplete="address-level2"
                    aria-invalid={Boolean(errors.cidade)}
                    value={form.cidade}
                    onChange={(event) => update('cidade', event.target.value)}
                  />
                  {errors.cidade && <span className="store-field-error">{errors.cidade}</span>}
                </div>

                <div className="store-field store-field-state">
                  <label htmlFor="ck-estado">Estado</label>
                  <input
                    id="ck-estado"
                    className="store-input"
                    maxLength={2}
                    autoComplete="address-level1"
                    placeholder="UF"
                    aria-invalid={Boolean(errors.estado)}
                    value={form.estado}
                    onChange={(event) => update('estado', event.target.value.toUpperCase())}
                  />
                  {errors.estado && <span className="store-field-error">{errors.estado}</span>}
                </div>
              </div>
            </fieldset>

            <fieldset className="store-fieldset">
              <div className="store-frete-options">
                <h3>Frete</h3>
                {shippingLoading && (
                  <p className="store-frete-status">Calculando frete para o CEP informado...</p>
                )}
                {shippingError && (
                  <p className="store-frete-status is-error">
                    {shippingError}
                  </p>
                )}
                {!shippingLoading && !shippingError && shippingNotice && (
                  <p className="store-frete-status">
                    {shippingNotice}
                  </p>
                )}
                {errors.frete && <span className="store-field-error">{errors.frete}</span>}
                {shippingOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`store-frete-option ${selectedShipping?.id === option.id ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="frete"
                      value={option.id}
                      checked={selectedShipping?.id === option.id}
                      onChange={() => {
                        setSelectedShippingId(option.id)
                        setCheckoutSubmitError('')
                        setErrors((currentErrors) => ({ ...currentErrors, frete: '' }))
                      }}
                      className="sr-only"
                    />
                    <span className="store-frete-icon">
                      {option.provider === 'retirada_local' ? <MapPinIcon /> : <TruckIcon />}
                    </span>
                    <span className="store-frete-info">
                      <strong>{getFreightLabel(option)}</strong>
                      <small>{option.prazoTexto}</small>
                      {option.provider === 'melhor_envio' && shouldShowFreeFreight(option) ? (
                        <small>Frete gratis aplicado</small>
                      ) : null}
                    </span>
                    <span className="store-frete-price">
                      {getFreightPriceLabel(option)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="store-fieldset store-payment-fieldset">
              <div className="store-payment-options">
                <h3>Pagamento</h3>

                {paymentConfigLoading ? (
                  <p className="store-frete-status">Carregando formas de pagamento...</p>
                ) : null}

                {paymentConfigError ? (
                  <p className="store-frete-status is-error">{paymentConfigError}</p>
                ) : null}

                {!paymentConfigLoading && !mercadoPagoActive ? (
                  <p className="store-frete-status">
                    Pagamento online ainda nao configurado. O pedido sera enviado como pendente.
                  </p>
                ) : null}

                {errors.pagamento && <span className="store-field-error">{errors.pagamento}</span>}
                {paymentError && <span className="store-field-error">{paymentError}</span>}

                {mercadoPagoActive ? (
                  <div className="store-payment-methods">
                    {paymentMethods.map((method) => (
                      <label
                        key={method}
                        className={`store-payment-method ${paymentMethod === method ? 'is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="pagamento"
                          className="sr-only"
                          value={method}
                          checked={paymentMethod === method}
                          onChange={() => selectPaymentMethod(method)}
                        />
                        <strong>{PAYMENT_METHOD_LABELS[method]}</strong>
                      </label>
                    ))}
                  </div>
                ) : null}

                {mercadoPagoActive && paymentMethod === 'pix' ? (
                  <div className="store-payment-hint">
                    O QR Code e o codigo Pix aparecem apos finalizar o pedido.
                  </div>
                ) : null}

                {mercadoPagoActive && (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') ? (
                  <div className="store-card-payment">
                    <div className="store-field">
                      <label htmlFor="mp-cardholder-name">Nome impresso no cartao</label>
                      <input
                        id="mp-cardholder-name"
                        className="store-input"
                        autoComplete="cc-name"
                        value={cardForm.cardholderName}
                        onChange={(event) => updateCardField('cardholderName', event.target.value)}
                      />
                    </div>

                    <div className="store-field">
                      <label>Numero do cartao</label>
                      <div id="mp-card-number" className="store-mp-field" />
                    </div>

                    <div className="store-field-row">
                      <div className="store-field">
                        <label>Validade</label>
                        <div id="mp-expiration-date" className="store-mp-field" />
                      </div>
                      <div className="store-field">
                        <label>CVV</label>
                        <div id="mp-security-code" className="store-mp-field" />
                      </div>
                    </div>

                    {cardForm.issuerOptions.length ? (
                      <label className="store-field" htmlFor="mp-issuer">
                        <span>Banco emissor</span>
                        <select
                          id="mp-issuer"
                          className="store-select"
                          value={cardForm.issuerId}
                          onChange={(event) => updateCardField('issuerId', event.target.value)}
                        >
                          {cardForm.issuerOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {paymentMethod === 'credit_card' ? (
                      <label className="store-field" htmlFor="mp-installments">
                        <span>Parcelas</span>
                        <select
                          id="mp-installments"
                          className="store-select"
                          value={cardForm.installments || ''}
                          disabled={cardForm.installmentsLoading || !cardForm.installmentOptions.length}
                          onChange={(event) => updateCardField('installments', event.target.value)}
                        >
                          {cardForm.installmentsLoading ? (
                            <option value="">Carregando parcelas...</option>
                          ) : cardForm.installmentOptions.length ? (
                            cardForm.installmentOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))
                          ) : (
                            <option value="">
                              {cardForm.paymentMethodId
                                ? 'Nenhuma opcao de parcelamento disponivel para este cartao'
                                : 'Informe os dados do cartao para ver as parcelas'}
                            </option>
                          )}
                        </select>
                        {cardForm.installmentError ? (
                          <span className="store-field-error">{cardForm.installmentError}</span>
                        ) : null}
                      </label>
                    ) : null}

                    {cardForm.loading ? (
                      <span className="store-field-hint">Validando dados do cartao...</span>
                    ) : null}
                    {cardForm.error || errors.cartao ? (
                      <span className="store-field-error">{errors.cartao || cardForm.error}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </fieldset>

          </form>

          <aside className="store-checkout-summary">
            <h2>Resumo do pedido</h2>
            <p className="store-checkout-summary-meta">
              {totalItems} {totalItems === 1 ? 'item selecionado' : 'itens selecionados'}
            </p>

            <ul className="store-summary-items">
              {cartItems.map((item) => (
                <li key={item.produtoId} className="store-summary-item">
                  <div className="store-summary-item-img">
                    {item.imagem ? (
                      <img src={item.imagem} alt={item.nome} loading="lazy" />
                    ) : (
                      <div className="store-summary-item-placeholder">{(item.nome || 'P').charAt(0)}</div>
                    )}
                    <span className="store-summary-item-qty">{item.quantidade}</span>
                  </div>

                  <div className="store-summary-item-info">
                    <div className="store-summary-item-top">
                      <span className="store-summary-item-name">{item.nome}</span>
                      <strong className="store-summary-item-total">{formatCurrency(item.preco * item.quantidade)}</strong>
                    </div>
                    <span className="store-summary-item-meta">
                      {item.quantidade} x {formatCurrency(item.preco)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="store-summary-lines">
              <div className="store-summary-line">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="store-summary-line">
                <span>Frete ({getFreightLabel(selectedShipping)})</span>
                <span>
                  {getFreightPriceLabel(selectedShipping)}
                </span>
              </div>
              <div className="store-summary-line store-summary-total">
                <span>Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
            </div>

            <div className="store-checkout-actions">
              {(checkoutSubmitError || submitError) && (
                <p className="store-checkout-submit-error">{checkoutSubmitError || submitError}</p>
              )}
              <button
                type="button"
                className="store-btn store-btn-primary store-btn-block store-btn-lg store-checkout-submit"
                disabled={
                  submitting ||
                  paymentProcessing ||
                  cartItems.length === 0
                }
                onClick={handleFinalizeOrder}
                aria-busy={submitting || paymentProcessing}
              >
                {submitting || paymentProcessing ? 'Processando pagamento...' : `Finalizar pedido - ${formatCurrency(total)}`}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
