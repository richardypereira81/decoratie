import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { deleteField, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { formatCurrency, formatDateTime, getDateValue } from '../../shared/formatters.js'
import { consultMercadoPagoPayment } from '../../shared/paymentApi.js'
import { fetchMelhorEnvioOrderLabel } from '../../shared/freightApi.js'
import {
  fetchOrderReportPdf,
  normalizeOrderNumbers,
  notifyOrderTrackingStatus,
  resendOrderNotification,
} from '../../shared/orderNotificationApi.js'
import { useCollectionData } from '../hooks/useFirestoreData.js'
import { useAuthSession } from '../AuthContext.jsx'
import { useAdminUI } from '../components/AdminLayout.jsx'
import SearchInput from '../components/SearchInput.jsx'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import { EyeIcon, MessageCircleIcon, MoreIcon, PrinterIcon, SendIcon } from '../components/AdminIcons.jsx'
import {
  cancelAgendaForPickupOrder,
  canSchedulePickupOrder,
  upsertAgendaForPickupOrder,
} from '../services/agendaService.js'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { value: 'pagamento_pendente', label: 'Pagamento pendente' },
  { value: 'pagamento_recusado', label: 'Pagamento recusado' },
  { value: 'pago', label: 'Pago' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
]

const STATUS_COLORS = {
  pendente: 'is-warning',
  aguardando_pagamento: 'is-warning',
  pagamento_pendente: 'is-warning',
  pagamento_recusado: 'is-muted',
  pago: 'is-accent',
  enviado: 'is-info',
  entregue: 'is-live',
  cancelado: 'is-muted',
}

const DATE_PRESET_OPTIONS = [
  { value: 'day', label: 'Dia' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Ano' },
  { value: 'custom', label: 'Personalizado' },
]

function getStatusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status || '--'
}

function getStatusClass(status) {
  return STATUS_COLORS[status] || 'is-muted'
}

function getFreteLabel(frete) {
  if (!frete) {
    return 'Sem frete'
  }

  if (frete.provider === 'retirada_local' || frete.tipo === 'retirada') {
    return frete.modalidade || frete.titulo || 'Retirada no local'
  }

  if (frete.provider === 'a_combinar' || frete.tipo === 'a_combinar') {
    return frete.modalidade || 'Entrega a combinar'
  }

  if (frete.provider === 'melhor_envio') {
    return [frete.transportadora, frete.modalidade].filter(Boolean).join(' ') || 'Melhor Envio'
  }

  return frete.modalidade || frete.tipo || 'Manual'
}

function getFretePrazo(frete) {
  if (!frete) {
    return '--'
  }

  const pickupScheduleLabel = getPickupScheduleLabel(frete)

  if (pickupScheduleLabel) {
    return pickupScheduleLabel
  }

  if (frete.prazoMinFinal && frete.prazoMaxFinal) {
    return frete.prazoTexto || (
      frete.prazoMinFinal === frete.prazoMaxFinal
        ? `${frete.prazoMinFinal} dias uteis`
        : `${frete.prazoMinFinal} a ${frete.prazoMaxFinal} dias uteis`
    )
  }

  if (frete.prazoFinalCliente) {
    return frete.prazoTexto || `${frete.prazoFinalCliente} dias uteis`
  }

  return frete.prazoTexto || (frete.prazo ? `${frete.prazo} dias uteis` : '--')
}

function getFretePrazoOriginal(frete) {
  if (!frete) {
    return '--'
  }

  if (frete.prazoMinOriginal && frete.prazoMaxOriginal) {
    return frete.prazoMinOriginal === frete.prazoMaxOriginal
      ? `${frete.prazoMinOriginal} dias uteis`
      : `${frete.prazoMinOriginal} a ${frete.prazoMaxOriginal} dias uteis`
  }

  return frete.prazoOriginalTransportadora
    ? `${frete.prazoOriginalTransportadora} dias uteis`
    : '--'
}

function formatDocumentoCliente(cliente = {}) {
  const digits = String(cliente.documentoLimpo || cliente.documento || '').replace(/\D/g, '')

  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }

  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }

  return cliente.documento || '--'
}

function getPagamentoMetodoLabel(pagamento) {
  if (!pagamento) {
    return 'Sem pagamento'
  }

  if (pagamento.provider !== 'mercado_pago') {
    return pagamento.metodo || pagamento.provider || 'Pagamento'
  }

  const labels = {
    pix: 'Pix',
    credit_card: 'Cartao de credito',
    debit_card: 'Cartao de debito',
  }

  return labels[pagamento.metodo] || 'Mercado Pago'
}

function getPagamentoStatusLabel(pagamento) {
  if (!pagamento) {
    return '--'
  }

  const status = pagamento.statusMercadoPago || pagamento.status
  const labels = {
    pending: 'Pendente',
    approved: 'Aprovado',
    authorized: 'Autorizado',
    in_process: 'Em analise',
    in_mediation: 'Em mediacao',
    rejected: 'Recusado',
    cancelled: 'Cancelado',
    refunded: 'Estornado',
    charged_back: 'Chargeback',
    creating: 'Criando pagamento',
  }

  return labels[status] || status || '--'
}

function getPagamentoStatusClass(pagamento) {
  const status = String(pagamento?.statusMercadoPago || pagamento?.status || '').toLowerCase()

  if (['approved', 'authorized', 'pago', 'aprovado', 'autorizado'].includes(status)) {
    return 'is-success'
  }

  if ([
    'pending',
    'creating',
    'in_process',
    'in_mediation',
    'pendente',
    'aguardando_pagamento',
    'pagamento_pendente',
  ].includes(status)) {
    return 'is-warning'
  }

  if ([
    'rejected',
    'cancelled',
    'canceled',
    'refunded',
    'charged_back',
    'pagamento_recusado',
    'recusado',
    'cancelado',
    'nao_aprovado',
    'not_approved',
    'failed',
    'failure',
    'denied',
  ].includes(status)) {
    return 'is-danger'
  }

  return 'is-muted'
}

function getPagamentoParcelasLabel(pagamento) {
  const installments = Number(pagamento?.installments || 1)
  const installmentAmount = Number(pagamento?.installmentAmount || 0)

  if (installments > 1 && installmentAmount > 0) {
    return `${installments}x de ${formatCurrency(installmentAmount)}`
  }

  return `${installments}x`
}

function getPaymentAuthorizationCode(pagamento) {
  return pagamento?.authorizationCode ||
    pagamento?.authorization_code ||
    pagamento?.codigoAutorizacao ||
    pagamento?.transactionAuthorizationCode ||
    ''
}

function getOrderNumber(order) {
  const value = Number(order?.orderNumber)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function getOrderLabel(order) {
  const orderNumber = getOrderNumber(order)
  return orderNumber ? `Pedido ${orderNumber}` : 'Pedido sem numero'
}

function getOrderItems(order) {
  return Array.isArray(order?.itens) ? order.itens : []
}

function getDateFilterBoundary(value, endOfDay = false) {
  if (!value) {
    return null
  }

  const [year, month, day] = String(value).split('-').map((part) => Number(part))

  if (!year || !month || !day) {
    return null
  }

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    : new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
}

function formatDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getDatePresetRange(preset) {
  const today = new Date()
  const to = formatDateInputValue(today)

  if (preset === 'day') {
    return { from: to, to }
  }

  if (preset === 'month') {
    return { from: formatDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), to }
  }

  if (preset === 'year') {
    return { from: formatDateInputValue(new Date(today.getFullYear(), 0, 1)), to }
  }

  return { from: '', to: '' }
}

function getActiveDatePreset(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) {
    return ''
  }

  const matchedPreset = ['day', 'month', 'year'].find((preset) => {
    const range = getDatePresetRange(preset)
    return range.from === dateFrom && range.to === dateTo
  })

  return matchedPreset || 'custom'
}

function formatDateInputLabel(value) {
  if (!value) {
    return ''
  }

  const [year, month, day] = String(value).split('-').map((part) => Number(part))

  if (!year || !month || !day) {
    return ''
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function getPickupSchedule(frete) {
  const schedule = frete?.agendamentoRetirada || frete?.retiradaAgendada || {}
  const data = String(schedule.data || schedule.date || frete?.dataRetirada || '').trim()
  const hora = String(schedule.hora || schedule.time || frete?.horaRetirada || '').trim()
  const texto = String(schedule.texto || schedule.label || '').trim()
  const observacoes = String(schedule.observacoes || schedule.obs || schedule.note || '').trim()

  return { data, hora, observacoes, texto }
}

function buildPickupScheduleLabel(data, hora) {
  const dateLabel = formatDateInputLabel(data)

  if (dateLabel && hora) {
    return `Retirada agendada: ${dateLabel} as ${hora}`
  }

  if (dateLabel) {
    return `Retirada agendada: ${dateLabel}`
  }

  return ''
}

function getPickupScheduleLabel(frete) {
  if (!(frete?.provider === 'retirada_local' || frete?.tipo === 'retirada')) {
    return ''
  }

  const schedule = getPickupSchedule(frete)

  return schedule.texto || buildPickupScheduleLabel(schedule.data, schedule.hora)
}

function getTrackingCode(order) {
  return String(
    order?.rastreio?.codigo ||
    order?.codigoRastreio ||
    order?.trackingCode ||
    order?.envio?.codigoRastreio ||
    '',
  ).trim()
}

function getTrackingNotificationCode(order) {
  return String(order?.trackingNotificationCode || '').trim()
}

function wasTrackingNotificationSent(order) {
  const trackingCode = getTrackingCode(order)

  return Boolean(
    trackingCode &&
    getTrackingNotificationCode(order) === trackingCode &&
    (order?.trackingNotificationEmailSent || order?.trackingNotificationWhatsappSent),
  )
}

function getItemTotal(item) {
  return Number(item?.preco || 0) * Number(item?.quantidade || 0)
}

function getOrderSubtotal(order) {
  const savedSubtotal = Number(order?.subtotal)

  if (Number.isFinite(savedSubtotal) && savedSubtotal >= 0) {
    return savedSubtotal
  }

  return getOrderItems(order).reduce((sum, item) => sum + getItemTotal(item), 0)
}

function getOrderDiscount(order) {
  const discount = Number(order?.desconto ?? order?.discount ?? 0)
  return Number.isFinite(discount) && discount > 0 ? discount : 0
}

function getOrderCoupon(order) {
  return order?.cupom && typeof order.cupom === 'object' ? order.cupom : null
}

function getOrderCouponCode(order) {
  return String(getOrderCoupon(order)?.codigo || order?.cupomCodigo || '').trim()
}

function getOrderCouponPercent(order) {
  const percent = Number(
    getOrderCoupon(order)?.percentual ??
    order?.descontoCupomPercentual ??
    0
  )
  return Number.isFinite(percent) && percent > 0 ? percent : 0
}

function getOrderCouponDiscount(order) {
  const discount = Number(
    getOrderCoupon(order)?.valorDesconto ??
    order?.valorDescontoCupom ??
    0
  )
  return Number.isFinite(discount) && discount > 0 ? discount : 0
}

function getOrderFreightValue(order) {
  if (!order?.frete || order.frete.valorPendente) {
    return 0
  }

  const value = Number(order.frete.valorFinal ?? order.frete.valor ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function getOrderTotalBeforeDiscounts(order) {
  const savedTotal = Number(order?.totalSemDesconto ?? order?.totalAntesDescontos)

  if (Number.isFinite(savedTotal) && savedTotal >= 0) {
    return savedTotal
  }

  return getOrderSubtotal(order) + getOrderFreightValue(order)
}

function getFreteValueLabel(frete) {
  if (!frete || frete.valorPendente) {
    return frete?.valorPendente ? 'A combinar' : '--'
  }

  const value = Number(frete.valorFinal ?? frete.valor ?? 0)
  return value === 0 ? 'Gratis' : formatCurrency(value)
}

function isPickupOrder(order) {
  return order?.frete?.provider === 'retirada_local' || order?.frete?.tipo === 'retirada'
}

function normalizeWhatsappPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits
  }

  return ''
}

function buildCustomerWhatsappUrl(order) {
  const phone = normalizeWhatsappPhone(order?.cliente?.telefone)

  if (!phone) {
    return ''
  }

  const firstName = String(order?.cliente?.nome || '').trim().split(/\s+/)[0] || ''
  const greeting = firstName ? `Ola, ${firstName}!` : 'Ola!'
  const message = `${greeting} Aqui e da Decoratie. Estamos entrando em contato sobre o ${getOrderLabel(order)}.`

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

function formatAddressLines(endereco = {}) {
  if (!endereco) {
    return []
  }

  const firstLine = [
    endereco.rua,
    endereco.numero,
    endereco.complemento,
  ].filter(Boolean).join(', ')
  const secondLine = [
    endereco.bairro,
    endereco.cidade && endereco.estado ? `${endereco.cidade}/${endereco.estado}` : endereco.cidade || endereco.estado,
  ].filter(Boolean).join(' - ')
  const cep = endereco.cep ? `CEP: ${endereco.cep}` : ''

  return [firstLine, secondLine, cep].filter(Boolean)
}

function getCustomerLocationLabel(order) {
  const endereco = order?.cliente?.endereco || {}
  const bairro = String(endereco.bairro || '').trim()
  const municipio = String(endereco.municipio || endereco.cidade || '').trim()
  const estado = String(endereco.estado || '').trim()
  const municipioLabel = [municipio, estado].filter(Boolean).join('/')

  return [bairro, municipioLabel].filter(Boolean).join(' · ')
}

function getCardLabel(pagamento) {
  return [
    pagamento?.cardBrand,
    pagamento?.lastFourDigits && `final ${pagamento.lastFourDigits}`,
  ].filter(Boolean).join(' ') || '--'
}

function getTrackingNotificationSentChannels(result = {}) {
  return [
    result.trackingNotificationEmailSent && 'e-mail',
    result.trackingNotificationWhatsappSent && 'WhatsApp',
  ].filter(Boolean)
}

function getTrackingNotificationSkippedDescription(skipped) {
  const descriptions = {
    tracking_notification_in_progress: 'Ja existe uma notificacao de rastreio em andamento para este pedido.',
    tracking_notification_already_sent: 'Esse codigo de rastreio ja foi enviado ao cliente.',
    tracking_notification_no_channels: 'Ative e configure e-mail ou WhatsApp e confirme se o cliente tem contato cadastrado.',
  }

  return descriptions[skipped] || 'Confira os canais configurados e os dados de contato do cliente.'
}

function ReportRow({ label, value, children, emphasis = false }) {
  return (
    <div className={emphasis ? 'admin-order-report-row is-emphasis' : 'admin-order-report-row'}>
      <span>{label}</span>
      <strong>{children || value || '--'}</strong>
    </div>
  )
}

function ReportSection({ title, children }) {
  return (
    <section className="admin-order-report-section">
      <h3>{title}</h3>
      <div className="admin-order-report-list">
        {children}
      </div>
    </section>
  )
}

function OrderActionsMenu({
  order,
  onView,
  onPrint,
  onResendNotification,
  onOpenWhatsapp,
  openingReport,
  resendingNotification,
  printingLabel,
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = `order-actions-${order.id}`

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect()

      if (!rect) {
        return
      }

      const menuWidth = 230
      const menuHeight = 244
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const left = Math.min(Math.max(12, rect.right - menuWidth), viewportWidth - menuWidth - 12)
      const belowTop = rect.bottom + 8
      const top = belowTop + menuHeight > viewportHeight
        ? Math.max(12, rect.top - menuHeight - 8)
        : belowTop

      setPosition({ top, left })
    }

    function handlePointerDown(event) {
      const target = event.target

      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }

      setOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    updatePosition()
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        id={menuId}
        className="admin-row-actions-menu"
        style={{ top: position.top, left: position.left }}
        role="menu"
      >
        <button
          type="button"
          className="admin-row-actions-item"
          disabled={openingReport}
          onClick={() => {
            setOpen(false)
            onView(order)
          }}
          role="menuitem"
        >
          <span className="admin-actions-item-icon"><EyeIcon className="admin-inline-icon" /></span>
          <span>{openingReport ? 'Abrindo PDF...' : 'Visualizar pedido'}</span>
        </button>
        <button
          type="button"
          className="admin-row-actions-item"
          disabled={resendingNotification}
          onClick={() => {
            setOpen(false)
            onResendNotification(order)
          }}
          role="menuitem"
        >
          <span className="admin-actions-item-icon"><SendIcon className="admin-inline-icon" /></span>
          <span>{resendingNotification ? 'Reenviando...' : 'Reenviar notificacao'}</span>
        </button>
        <button
          type="button"
          className="admin-row-actions-item"
          onClick={() => {
            setOpen(false)
            onOpenWhatsapp(order)
          }}
          role="menuitem"
        >
          <span className="admin-actions-item-icon"><MessageCircleIcon className="admin-inline-icon" /></span>
          <span>Chamar no WhatsApp</span>
        </button>
        <button
          type="button"
          className="admin-row-actions-item"
          disabled={printingLabel}
          onClick={() => {
            setOpen(false)
            onPrint(order)
          }}
          role="menuitem"
        >
          <span className="admin-actions-item-icon"><PrinterIcon className="admin-inline-icon" /></span>
          <span>{printingLabel ? 'Abrindo etiqueta...' : 'Imprimir etiqueta'}</span>
        </button>
      </div>,
      document.body,
    )
    : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="admin-icon-btn admin-row-actions-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Abrir acoes de ${getOrderLabel(order)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <MoreIcon className="admin-inline-icon" />
      </button>
      {menu}
    </>
  )
}

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: orders, loading } = useCollectionData('pedidos')
  const { notify } = useAdminUI()
  const { user } = useAuthSession()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [datePresetMode, setDatePresetMode] = useState('')
  const [detailOrder, setDetailOrder] = useState(null)
  const [consultingPayment, setConsultingPayment] = useState(false)
  const [resendingNotificationId, setResendingNotificationId] = useState('')
  const [printingLabelId, setPrintingLabelId] = useState('')
  const [openingReportId, setOpeningReportId] = useState('')
  const [pickupScheduleOrder, setPickupScheduleOrder] = useState(null)
  const [pickupScheduleDate, setPickupScheduleDate] = useState('')
  const [pickupScheduleTime, setPickupScheduleTime] = useState('')
  const [pickupScheduleNotes, setPickupScheduleNotes] = useState('')
  const [savingPickupSchedule, setSavingPickupSchedule] = useState(false)
  const [trackingOrder, setTrackingOrder] = useState(null)
  const [trackingCode, setTrackingCode] = useState('')
  const [notifyTrackingCustomer, setNotifyTrackingCustomer] = useState(true)
  const [savingTrackingCode, setSavingTrackingCode] = useState(false)
  const [orderNumberNormalizationAttempted, setOrderNumberNormalizationAttempted] = useState(false)
  const normalizingOrderNumbersRef = useRef(false)
  const deferredSearch = useDeferredValue(search)
  const selectedOrderId = searchParams.get('pedido')

  useEffect(() => {
    if (loading || !selectedOrderId) {
      return
    }

    const order = orders.find((item) => item.id === selectedOrderId)

    if (order && detailOrder?.id !== order.id) {
      setDetailOrder(order)
    }
  }, [detailOrder?.id, loading, orders, selectedOrderId])

  useEffect(() => {
    if (
      loading ||
      !user ||
      orderNumberNormalizationAttempted ||
      normalizingOrderNumbersRef.current ||
      !orders.some((order) => !getOrderNumber(order))
    ) {
      return
    }

    normalizingOrderNumbersRef.current = true
    setOrderNumberNormalizationAttempted(true)

    normalizeOrderNumbers(user)
      .catch((error) => {
        notify({
          type: 'error',
          title: 'Numeracao dos pedidos',
          description: error.message || 'Nao foi possivel atualizar os codigos sequenciais.',
        })
      })
      .finally(() => {
        normalizingOrderNumbersRef.current = false
      })
  }, [loading, notify, orderNumberNormalizationAttempted, orders, user])

  const filteredOrders = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase()
    const fromTime = getDateFilterBoundary(dateFrom)
    const toTime = getDateFilterBoundary(dateTo, true)

    return [...orders]
      .sort((a, b) => {
        const da = getDateValue(a.createdAt)?.getTime() || 0
        const db_ = getDateValue(b.createdAt)?.getTime() || 0
        return db_ - da
      })
      .filter((order) => {
        if (statusFilter !== 'all' && order.status !== statusFilter) return false

        const orderTime = getDateValue(order.createdAt)?.getTime() || 0

        if (fromTime && orderTime < fromTime) return false
        if (toTime && orderTime > toTime) return false

        if (q) {
          const haystack = [
            order.cliente?.nome,
            order.cliente?.email,
            order.cliente?.telefone,
            order.cliente?.endereco?.bairro,
            order.cliente?.endereco?.municipio,
            order.cliente?.endereco?.cidade,
            order.cliente?.endereco?.estado,
            order.id,
            order.orderNumber,
            getOrderLabel(order),
            order.status,
            getFreteLabel(order.frete),
            getTrackingCode(order),
          ].join(' ').toLowerCase()
          if (!haystack.includes(q)) return false
        }

        return true
      })
  }, [orders, deferredSearch, statusFilter, dateFrom, dateTo])

  const filteredOrdersTotal = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      const total = Number(order.total)
      return sum + (Number.isFinite(total) ? total : 0)
    }, 0)
  }, [filteredOrders])

  const activeDatePreset = useMemo(() => {
    return getActiveDatePreset(dateFrom, dateTo) || datePresetMode
  }, [dateFrom, datePresetMode, dateTo])
  const hasDateFilter = Boolean(dateFrom || dateTo)

  function applyDatePreset(preset) {
    setDatePresetMode(preset)

    if (preset === 'custom') {
      return
    }

    const range = getDatePresetRange(preset)
    setDateFrom(range.from)
    setDateTo(range.to)
  }

  function clearDateFilter() {
    setDatePresetMode('')
    setDateFrom('')
    setDateTo('')
  }

  function handleDateFromChange(value) {
    setDatePresetMode('custom')
    setDateFrom(value)
  }

  function handleDateToChange(value) {
    setDatePresetMode('custom')
    setDateTo(value)
  }

  async function updateStatus(orderId, newStatus) {
    const currentOrder = orders.find((order) => order.id === orderId) ||
      (detailOrder?.id === orderId ? detailOrder : null)

    try {
      await updateDoc(doc(db, 'pedidos', orderId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      })
      notify({
        type: 'success',
        title: 'Status atualizado',
        description: `Pedido atualizado para "${newStatus}".`,
      })
      if (detailOrder?.id === orderId) {
        setDetailOrder((prev) => (prev ? { ...prev, status: newStatus } : null))
      }
      if (newStatus === 'enviado') {
        openTrackingCode(currentOrder ? { ...currentOrder, status: newStatus } : { id: orderId, status: newStatus })
      }
    } catch (error) {
      notify({
        type: 'error',
        title: 'Erro ao atualizar status',
        description: error.message || 'Tente novamente.',
      })
    }
  }

  async function handleConsultPayment(orderId) {
    setConsultingPayment(true)

    try {
      const result = await consultMercadoPagoPayment(user, orderId)
      notify({
        type: 'success',
        title: 'Pagamento consultado',
        description: `Status: ${getPagamentoStatusLabel(result.pagamento)}`,
      })
      if (result.pedido) {
        setDetailOrder(result.pedido)
      }
    } catch (error) {
      notify({
        type: 'error',
        title: 'Falha ao consultar pagamento',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setConsultingPayment(false)
    }
  }

  async function handleResendNotification(order) {
    setResendingNotificationId(order.id)

    try {
      const result = await resendOrderNotification(user, order.id)
      const sentChannels = [
        result.notificationEmailSent && 'e-mail',
        result.notificationWhatsappSent && 'WhatsApp',
      ].filter(Boolean)

      if (result.skipped === 'notification_in_progress') {
        notify({
          type: 'error',
          title: 'Notificacao em andamento',
          description: 'Ja existe um envio em andamento para este pedido. Tente novamente em instantes.',
        })
        return
      }

      if (result.skipped === 'no_pending_channels') {
        notify({
          type: 'error',
          title: 'Notificacao nao enviada',
          description: 'Ative e configure e-mail ou WhatsApp nas notificacoes de novo pedido.',
        })
        return
      }

      if (sentChannels.length) {
        notify({
          type: 'success',
          title: 'Notificacao reenviada',
          description: `Enviado por ${sentChannels.join(' e ')}.`,
        })
      } else {
        notify({
          type: 'error',
          title: 'Notificacao nao enviada',
          description: result.notificationError || 'Confira o provedor configurado no backend.',
        })
      }
    } catch (error) {
      notify({
        type: 'error',
        title: 'Falha ao reenviar notificacao',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setResendingNotificationId('')
    }
  }

  function handleOpenCustomerWhatsapp(order) {
    const url = buildCustomerWhatsappUrl(order)

    if (!url) {
      notify({
        type: 'error',
        title: 'WhatsApp indisponivel',
        description: 'O telefone do cliente nao parece ser um numero de WhatsApp valido.',
      })
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function openPickupSchedule(order) {
    const hasPickupSchedule = Boolean(getPickupScheduleLabel(order.frete))

    if (!canSchedulePickupOrder(order) && !hasPickupSchedule) {
      notify({
        type: 'error',
        title: 'Pagamento ainda nao aprovado',
        description: 'A retirada so pode ser agendada depois que o pagamento for aprovado.',
      })
      return
    }

    const schedule = getPickupSchedule(order.frete)

    setPickupScheduleOrder(order)
    setPickupScheduleDate(schedule.data)
    setPickupScheduleTime(schedule.hora)
    setPickupScheduleNotes(schedule.observacoes || '')
  }

  function closePickupSchedule(force = false) {
    if (savingPickupSchedule && !force) {
      return
    }

    setPickupScheduleOrder(null)
    setPickupScheduleDate('')
    setPickupScheduleTime('')
    setPickupScheduleNotes('')
  }

  async function savePickupSchedule(event) {
    event.preventDefault()

    if (!pickupScheduleOrder?.id) {
      return
    }

    if (!canSchedulePickupOrder(pickupScheduleOrder)) {
      notify({
        type: 'error',
        title: 'Pagamento ainda nao aprovado',
        description: 'A retirada so pode ser agendada depois que o pagamento for aprovado.',
      })
      return
    }

    if (!pickupScheduleDate || !pickupScheduleTime) {
      notify({
        type: 'error',
        title: 'Agendamento incompleto',
        description: 'Informe data e hora para agendar a retirada.',
      })
      return
    }

    const texto = buildPickupScheduleLabel(pickupScheduleDate, pickupScheduleTime)
    const previousText = pickupScheduleOrder.frete?.prazoTextoOriginal ||
      pickupScheduleOrder.frete?.prazoTexto ||
      'Agende a retirada'
    const payload = {
      'frete.agendamentoRetirada.data': pickupScheduleDate,
      'frete.agendamentoRetirada.hora': pickupScheduleTime,
      'frete.agendamentoRetirada.texto': texto,
      'frete.agendamentoRetirada.observacoes': pickupScheduleNotes.trim(),
      'frete.agendamentoRetirada.updatedAt': serverTimestamp(),
      'frete.agendamentoRetirada.updatedBy': user?.uid || '',
      'frete.prazoTexto': texto,
      updatedAt: serverTimestamp(),
    }

    if (!pickupScheduleOrder.frete?.prazoTextoOriginal) {
      payload['frete.prazoTextoOriginal'] = previousText
    }

    setSavingPickupSchedule(true)

    try {
      await updateDoc(doc(db, 'pedidos', pickupScheduleOrder.id), payload)
      await upsertAgendaForPickupOrder(pickupScheduleOrder, {
        data: pickupScheduleDate,
        hora: pickupScheduleTime,
        observacoes: pickupScheduleNotes,
        userId: user?.uid || '',
      })
      notify({
        type: 'success',
        title: 'Retirada agendada',
        description: `${getOrderLabel(pickupScheduleOrder)} atualizado para ${texto}.`,
      })
      closePickupSchedule(true)
    } catch (error) {
      notify({
        type: 'error',
        title: 'Falha ao agendar retirada',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setSavingPickupSchedule(false)
    }
  }

  async function clearPickupSchedule() {
    if (!pickupScheduleOrder?.id) {
      return
    }

    const fallbackText = pickupScheduleOrder.frete?.prazoTextoOriginal || 'Agende a retirada'

    setSavingPickupSchedule(true)

    try {
      await updateDoc(doc(db, 'pedidos', pickupScheduleOrder.id), {
        'frete.agendamentoRetirada': deleteField(),
        'frete.prazoTexto': fallbackText,
        updatedAt: serverTimestamp(),
      })
      await cancelAgendaForPickupOrder(pickupScheduleOrder, { userId: user?.uid || '' })
      notify({
        type: 'success',
        title: 'Agendamento removido',
        description: `${getOrderLabel(pickupScheduleOrder)} voltou para "${fallbackText}".`,
      })
      closePickupSchedule(true)
    } catch (error) {
      notify({
        type: 'error',
        title: 'Falha ao remover agendamento',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setSavingPickupSchedule(false)
    }
  }

  function openTrackingCode(order) {
    setTrackingOrder(order)
    setTrackingCode(getTrackingCode(order))
    setNotifyTrackingCustomer(!wasTrackingNotificationSent(order))
  }

  function closeTrackingCode(force = false) {
    if (savingTrackingCode && !force) {
      return
    }

    setTrackingOrder(null)
    setTrackingCode('')
    setNotifyTrackingCustomer(true)
  }

  async function saveTrackingCode(event) {
    event.preventDefault()

    if (!trackingOrder?.id) {
      return
    }

    const code = trackingCode.trim()

    if (!code) {
      notify({
        type: 'error',
        title: 'Codigo de rastreio obrigatorio',
        description: 'Informe o codigo de rastreio do pedido.',
      })
      return
    }

    setSavingTrackingCode(true)

    try {
      await updateDoc(doc(db, 'pedidos', trackingOrder.id), {
        'rastreio.codigo': code,
        'rastreio.updatedAt': serverTimestamp(),
        'rastreio.updatedBy': user?.uid || '',
        codigoRastreio: code,
        status: 'enviado',
        updatedAt: serverTimestamp(),
      })
      if (detailOrder?.id === trackingOrder.id) {
        setDetailOrder((prev) => (
          prev
            ? {
                ...prev,
                status: 'enviado',
                codigoRastreio: code,
                rastreio: { ...(prev.rastreio || {}), codigo: code },
              }
            : prev
        ))
      }

      notify({
        type: 'success',
        title: 'Codigo de rastreio salvo',
        description: `${getOrderLabel(trackingOrder)} atualizado com o rastreio ${code}.`,
      })

      if (notifyTrackingCustomer) {
        try {
          const result = await notifyOrderTrackingStatus(user, trackingOrder.id, code)
          const sentChannels = getTrackingNotificationSentChannels(result)

          if (sentChannels.length) {
            notify({
              type: 'success',
              title: 'Cliente notificado',
              description: `Aviso de envio e rastreio enviado por ${sentChannels.join(' e ')}.`,
            })
            if (result.trackingNotificationError) {
              notify({
                type: 'error',
                title: 'Notificacao parcial',
                description: result.trackingNotificationError,
              })
            }
            if (detailOrder?.id === trackingOrder.id) {
              setDetailOrder((prev) => (
                prev
                  ? {
                      ...prev,
                      trackingNotificationCode: code,
                      trackingNotificationEmailSent: result.trackingNotificationEmailSent,
                      trackingNotificationWhatsappSent: result.trackingNotificationWhatsappSent,
                      trackingNotificationError: result.trackingNotificationError || '',
                    }
                  : prev
              ))
            }
          } else {
            notify({
              type: 'error',
              title: 'Cliente nao notificado',
              description: result.skipped
                ? getTrackingNotificationSkippedDescription(result.skipped)
                : result.trackingNotificationError || 'Nenhum canal configurado enviou a notificacao.',
            })
          }
        } catch (error) {
          notify({
            type: 'error',
            title: 'Rastreio salvo, mas sem notificacao',
            description: error.message || 'Nao foi possivel notificar o cliente.',
          })
        }
      }
      closeTrackingCode(true)
    } catch (error) {
      notify({
        type: 'error',
        title: 'Falha ao salvar rastreio',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setSavingTrackingCode(false)
    }
  }

  async function clearTrackingCode() {
    if (!trackingOrder?.id) {
      return
    }

    setSavingTrackingCode(true)

    try {
      await updateDoc(doc(db, 'pedidos', trackingOrder.id), {
        rastreio: deleteField(),
        codigoRastreio: deleteField(),
        trackingCode: deleteField(),
        'envio.codigoRastreio': deleteField(),
        updatedAt: serverTimestamp(),
      })
      notify({
        type: 'success',
        title: 'Codigo de rastreio removido',
        description: `${getOrderLabel(trackingOrder)} ficou sem codigo de rastreio.`,
      })
      if (detailOrder?.id === trackingOrder.id) {
        setDetailOrder((prev) => (
          prev
            ? {
                ...prev,
                codigoRastreio: '',
                trackingCode: '',
                rastreio: { ...(prev.rastreio || {}), codigo: '' },
                envio: prev.envio ? { ...prev.envio, codigoRastreio: '' } : prev.envio,
              }
            : prev
        ))
      }
      closeTrackingCode(true)
    } catch (error) {
      notify({
        type: 'error',
        title: 'Falha ao remover rastreio',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setSavingTrackingCode(false)
    }
  }

  function closeOrderDetails() {
    const nextParams = new URLSearchParams(window.location.search)
    nextParams.delete('pedido')
    setSearchParams(nextParams, { replace: true })
    setDetailOrder(null)
  }

  function openPdfResult(result, fallbackFilename, placeholderWindow = null) {
    const url = URL.createObjectURL(result.blob)

    if (placeholderWindow) {
      placeholderWindow.location.href = url
    } else {
      const opened = window.open(url, '_blank', 'noopener,noreferrer')

      if (!opened) {
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename || fallbackFilename
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
  }

  async function openOrderReportPdf(order) {
    setOpeningReportId(order.id)

    const placeholderWindow = window.open('', '_blank')

    if (placeholderWindow) {
      placeholderWindow.document.title = 'Abrindo relatorio do pedido'
      placeholderWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px;">Abrindo relatorio do pedido...</p>'
    }

    try {
      const result = await fetchOrderReportPdf(user, order.id)
      openPdfResult(result, `decoratie-${getOrderLabel(order).toLowerCase().replace(/\s+/g, '-')}-relatorio.pdf`, placeholderWindow)
    } catch (error) {
      if (placeholderWindow) {
        placeholderWindow.close()
      }

      notify({
        type: 'error',
        title: 'Relatorio indisponivel',
        description: error.message || 'Nao foi possivel abrir o PDF do pedido.',
      })
    } finally {
      setOpeningReportId('')
    }
  }

  async function printOrderLabel(order) {
    setPrintingLabelId(order.id)

    try {
      const result = await fetchMelhorEnvioOrderLabel(user, order.id)
      const url = result.url || URL.createObjectURL(result.blob)
      const opened = window.open(url, '_blank', 'noopener,noreferrer')

      if (!opened && result.blob) {
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        document.body.appendChild(link)
        link.click()
        link.remove()
      }

      if (result.blob) {
        window.setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
      }
    } catch (error) {
      notify({
        type: 'error',
        title: 'Etiqueta Melhor Envio indisponivel',
        description: error.message || 'Gere a etiqueta no Melhor Envio antes de imprimir.',
      })
    } finally {
      setPrintingLabelId('')
    }
  }

  const columns = [
    {
      key: 'id',
      header: 'Pedido',
      mobileLabel: 'Pedido',
      cell: (order) => (
        <div className="admin-table-stack">
          <strong>{getOrderLabel(order)}</strong>
          <span>{formatDateTime(order.createdAt)}</span>
        </div>
      ),
    },
    {
      key: 'cliente',
      header: 'Cliente',
      cell: (order) => {
        const location = getCustomerLocationLabel(order)

        return (
          <div className="admin-table-stack">
            <strong>{order.cliente?.nome || '--'}</strong>
            <span>{order.cliente?.email || '--'}</span>
            {location ? <span className="admin-table-location">{location}</span> : null}
          </div>
        )
      },
    },
    {
      key: 'total',
      header: 'Total',
      cell: (order) => <strong className="admin-table-price">{formatCurrency(order.total)}</strong>,
    },
    {
      key: 'frete',
      header: 'Entrega/retirada',
      cell: (order) => {
        const paymentApproved = canSchedulePickupOrder(order)
        const hasPickupSchedule = Boolean(getPickupScheduleLabel(order.frete))
        const content = (
          <>
            <strong>{getFreteLabel(order.frete)}</strong>
            <span>
              {!paymentApproved && !hasPickupSchedule
                ? 'Aguardando pagamento para agendar'
                : getFretePrazo(order.frete)}
            </span>
          </>
        )

        if (isPickupOrder(order)) {
          return (
            <button
              type="button"
              className="admin-pickup-schedule-trigger"
              onClick={() => openPickupSchedule(order)}
              disabled={!paymentApproved && !hasPickupSchedule}
              title={!paymentApproved ? 'A retirada so pode ser agendada apos o pagamento aprovado.' : undefined}
              aria-label={`Agendar retirada de ${getOrderLabel(order)}`}
            >
              {content}
            </button>
          )
        }

        return (
          <div className="admin-table-stack">
            {content}
          </div>
        )
      },
    },
    {
      key: 'pagamento',
      header: 'Pagamento',
      cell: (order) => {
        const paymentStatusLabel = getPagamentoStatusLabel(order.pagamento)

        return (
          <div className="admin-table-stack">
            <strong>{getPagamentoMetodoLabel(order.pagamento)}</strong>
            {order.pagamento && paymentStatusLabel !== '--' ? (
              <span className={`admin-payment-tag ${getPagamentoStatusClass(order.pagamento)}`}>
                {paymentStatusLabel}
              </span>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (order) => {
        const tracking = getTrackingCode(order)

        return (
          <div className="admin-status-stack">
            <select
              className="admin-select admin-select-sm"
              value={order.status || 'pendente'}
              onChange={(e) => updateStatus(order.id, e.target.value)}
            >
              {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {order.status === 'enviado' ? (
              <button
                type="button"
                className={tracking ? 'admin-tracking-code-btn has-code' : 'admin-tracking-code-btn'}
                onClick={() => openTrackingCode(order)}
                aria-label={`${tracking ? 'Editar' : 'Adicionar'} codigo de rastreio de ${getOrderLabel(order)}`}
              >
                {tracking ? `Rastreio: ${tracking}` : 'Adicionar rastreio'}
              </button>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: 'Acoes',
      mobileLabel: 'Acoes',
      cellClassName: 'is-actions',
      cell: (order) => (
        <OrderActionsMenu
          order={order}
          onView={openOrderReportPdf}
          onPrint={printOrderLabel}
          onResendNotification={handleResendNotification}
          onOpenWhatsapp={handleOpenCustomerWhatsapp}
          openingReport={openingReportId === order.id}
          resendingNotification={resendingNotificationId === order.id}
          printingLabel={printingLabelId === order.id}
        />
      ),
    },
  ]

  const pickupSchedulePaymentApproved = pickupScheduleOrder ? canSchedulePickupOrder(pickupScheduleOrder) : false
  const pickupScheduleHasCurrent = pickupScheduleOrder
    ? Boolean(getPickupScheduleLabel(pickupScheduleOrder.frete))
    : false
  const detailAddressLines = formatAddressLines(detailOrder?.cliente?.endereco)
  const detailOrderItems = getOrderItems(detailOrder)

  return (
    <section className="admin-page-section admin-list-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Pedidos</span>
        </div>
      </div>

      <section className="admin-orders-filter-panel" aria-label="Filtros de pedidos">
        <div className="admin-orders-filter-head">
          <div className="admin-orders-filter-search">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, email, telefone ou numero..."
              ariaLabel="Buscar pedidos"
            />
          </div>

          <section className="admin-orders-total-bar" aria-label="Resumo dos pedidos exibidos">
            <div>
              <span>Pedidos exibidos</span>
              <strong>{filteredOrders.length}</strong>
            </div>
            <div>
              <span>Total exibido</span>
              <strong>{formatCurrency(filteredOrdersTotal)}</strong>
            </div>
          </section>
        </div>

        <div className="admin-orders-filter-body">
          <div className="admin-orders-period-field">
            <span className="admin-filter-label">Periodo</span>
            <div className="admin-segmented-control" aria-label="Periodo dos pedidos">
              {DATE_PRESET_OPTIONS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`admin-segmented-btn ${activeDatePreset === preset.value ? 'is-active' : ''}`}
                  onClick={() => applyDatePreset(preset.value)}
                  aria-pressed={activeDatePreset === preset.value}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-order-date-filters" aria-label="Filtrar pedidos por data">
            <label className="admin-date-field">
              <span>De</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => handleDateFromChange(event.target.value)}
              />
            </label>
            <label className="admin-date-field">
              <span>Ate</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => handleDateToChange(event.target.value)}
              />
            </label>
            {hasDateFilter ? (
              <button
                type="button"
                className="admin-date-clear"
                onClick={clearDateFilter}
              >
                Limpar
              </button>
            ) : null}
          </div>

          <label className="admin-orders-status-field">
            <span className="admin-filter-label">Status</span>
            <select
              className="admin-select admin-select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <DataTable
        caption="Tabela de pedidos"
        columns={columns}
        rows={filteredOrders}
        loading={loading}
        loadingState="Carregando pedidos..."
        emptyState="Nenhum pedido encontrado."
      />

      {pickupScheduleOrder && (
        <Modal
          open={Boolean(pickupScheduleOrder)}
          onClose={closePickupSchedule}
          title={`Agendar retirada - ${getOrderLabel(pickupScheduleOrder)}`}
          width="small"
        >
          <form className="admin-modal-body admin-pickup-schedule-form" onSubmit={savePickupSchedule}>
            <div className="admin-inline-notice">
              <strong>{pickupScheduleOrder.cliente?.nome || 'Cliente'}</strong>
              <span>{getFreteLabel(pickupScheduleOrder.frete)}</span>
              {!pickupSchedulePaymentApproved ? (
                <span>Pagamento ainda nao aprovado. Remova o agendamento atual ou aguarde a aprovacao.</span>
              ) : null}
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Data da retirada</span>
                <input
                  className="admin-input"
                  type="date"
                  value={pickupScheduleDate}
                  onChange={(event) => setPickupScheduleDate(event.target.value)}
                  disabled={!pickupSchedulePaymentApproved || savingPickupSchedule}
                  required
                />
              </label>

              <label className="admin-field">
                <span>Hora da retirada</span>
                <input
                  className="admin-input"
                  type="time"
                  value={pickupScheduleTime}
                  onChange={(event) => setPickupScheduleTime(event.target.value)}
                  disabled={!pickupSchedulePaymentApproved || savingPickupSchedule}
                  required
                />
              </label>

              <label className="admin-field admin-field-full">
                <span>Observacao opcional</span>
                <textarea
                  className="admin-textarea"
                  value={pickupScheduleNotes}
                  onChange={(event) => setPickupScheduleNotes(event.target.value)}
                  disabled={!pickupSchedulePaymentApproved || savingPickupSchedule}
                  rows="3"
                  placeholder="Ex.: cliente retira no balcao"
                />
              </label>
            </div>

            {pickupScheduleDate && pickupScheduleTime ? (
              <div className="admin-pickup-schedule-preview">
                {buildPickupScheduleLabel(pickupScheduleDate, pickupScheduleTime)}
              </div>
            ) : null}

            <div className="admin-modal-actions admin-pickup-schedule-actions">
              {pickupScheduleHasCurrent ? (
                <button
                  type="button"
                  className="admin-btn-danger"
                  onClick={clearPickupSchedule}
                  disabled={savingPickupSchedule}
                >
                  Remover agendamento
                </button>
              ) : null}
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => closePickupSchedule()}
                disabled={savingPickupSchedule}
              >
                Cancelar
              </button>
              <button type="submit" className="admin-btn" disabled={savingPickupSchedule || !pickupSchedulePaymentApproved}>
                {savingPickupSchedule ? 'Salvando...' : 'Salvar agendamento'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {trackingOrder && (
        <Modal
          open={Boolean(trackingOrder)}
          onClose={closeTrackingCode}
          title={`Codigo de rastreio - ${getOrderLabel(trackingOrder)}`}
          width="small"
        >
          <form className="admin-modal-body admin-tracking-code-form" onSubmit={saveTrackingCode}>
            <div className="admin-inline-notice">
              <strong>{trackingOrder.cliente?.nome || 'Cliente'}</strong>
              <span>Status: {getStatusLabel(trackingOrder.status || 'enviado')}</span>
            </div>

            <label className="admin-field">
              <span>Codigo de rastreio</span>
              <input
                className="admin-input"
                value={trackingCode}
                onChange={(event) => setTrackingCode(event.target.value)}
                placeholder="Ex.: BR123456789BR"
                autoFocus
              />
            </label>

            <label className="admin-toggle admin-tracking-notify-toggle">
              <input
                type="checkbox"
                checked={notifyTrackingCustomer}
                onChange={(event) => setNotifyTrackingCustomer(event.target.checked)}
              />
              <span>
                Notificar cliente sobre esse status
                <small>
                  Envia e-mail e WhatsApp quando o canal estiver configurado e o cliente tiver contato cadastrado.
                </small>
              </span>
            </label>

            {wasTrackingNotificationSent(trackingOrder) ? (
              <div className="admin-inline-notice">
                Este codigo de rastreio ja foi enviado ao cliente.
              </div>
            ) : null}

            <div className="admin-modal-actions admin-tracking-code-actions">
              {getTrackingCode(trackingOrder) ? (
                <button
                  type="button"
                  className="admin-btn-danger"
                  onClick={clearTrackingCode}
                  disabled={savingTrackingCode}
                >
                  Remover codigo
                </button>
              ) : null}
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => closeTrackingCode()}
                disabled={savingTrackingCode}
              >
                Cancelar
              </button>
              <button type="submit" className="admin-btn" disabled={savingTrackingCode}>
                {savingTrackingCode ? 'Salvando...' : 'Salvar rastreio'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detailOrder && (
        <Modal
          open={Boolean(detailOrder)}
          onClose={closeOrderDetails}
          title={`Relatorio do ${getOrderLabel(detailOrder)}`}
          width="xlarge"
        >
          <div className="admin-modal-body admin-order-detail">
            <article className="admin-order-report-sheet">
              <header className="admin-order-report-head">
                <div>
                  <span className="admin-order-report-brand">Decoratie</span>
                  <h2>{getOrderLabel(detailOrder)}</h2>
                </div>
                <div className="admin-order-report-status">
                  <span className={`admin-badge ${getStatusClass(detailOrder.status)}`}>
                    {getStatusLabel(detailOrder.status)}
                  </span>
                  <strong>{formatCurrency(detailOrder.total)}</strong>
                </div>
              </header>

              <div className="admin-order-report-grid">
                <ReportSection title="Resumo">
                  <ReportRow label="Numero do pedido" value={getOrderLabel(detailOrder)} />
                  <ReportRow label="Data" value={formatDateTime(detailOrder.createdAt)} />
                  <ReportRow label="Status" value={getStatusLabel(detailOrder.status)} />
                  {detailOrder.status === 'enviado' || getTrackingCode(detailOrder) ? (
                    <ReportRow label="Codigo de rastreio" value={getTrackingCode(detailOrder) || 'Nao informado'} />
                  ) : null}
                  <ReportRow label="Pagamento" value={getPagamentoMetodoLabel(detailOrder.pagamento)} />
                  <ReportRow label="Status do pagamento" value={getPagamentoStatusLabel(detailOrder.pagamento)} />
                  <ReportRow label="Codigo autorizacao" value={getPaymentAuthorizationCode(detailOrder.pagamento)} />
                  {detailOrder.pagamento?.metodo === 'credit_card' ? (
                    <ReportRow label="Parcelas" value={getPagamentoParcelasLabel(detailOrder.pagamento)} />
                  ) : null}
                  {getOrderCouponCode(detailOrder) ? (
                    <ReportRow
                      label="Cupom"
                      value={`${getOrderCouponCode(detailOrder)} (${getOrderCouponPercent(detailOrder)}%)`}
                    />
                  ) : null}
                  {getOrderCouponDiscount(detailOrder) > 0 ? (
                    <ReportRow label="Desconto do cupom" value={formatCurrency(getOrderCouponDiscount(detailOrder))} />
                  ) : null}
                  {(getOrderCouponDiscount(detailOrder) > 0 || getOrderDiscount(detailOrder) > 0) ? (
                    <ReportRow label="Total antes dos descontos" value={formatCurrency(getOrderTotalBeforeDiscounts(detailOrder))} />
                  ) : null}
                  <ReportRow label="Total" value={formatCurrency(detailOrder.total)} emphasis />
                </ReportSection>

                <ReportSection title="Cliente">
                  <ReportRow label="Nome" value={detailOrder.cliente?.nome} />
                  <ReportRow label="E-mail" value={detailOrder.cliente?.email} />
                  <ReportRow label="Telefone" value={detailOrder.cliente?.telefone} />
                  <ReportRow
                    label={detailOrder.cliente?.tipoDocumento === 'cnpj' ? 'CNPJ' : 'CPF/CNPJ'}
                    value={formatDocumentoCliente(detailOrder.cliente)}
                  />
                </ReportSection>

                <ReportSection title={isPickupOrder(detailOrder) ? 'Retirada' : 'Entrega'}>
                  <ReportRow label="Tipo" value={getFreteLabel(detailOrder.frete)} />
                  <ReportRow label="Prazo" value={getFretePrazo(detailOrder.frete)} />
                  <ReportRow label="Valor" value={getFreteValueLabel(detailOrder.frete)} />
                  <ReportRow label="CEP destino" value={detailOrder.frete?.cepDestino || detailOrder.cliente?.endereco?.cep} />
                  {detailAddressLines.length ? (
                    <ReportRow label="Endereco">
                      <span className="admin-order-address-lines">
                        {detailAddressLines.map((line) => <span key={line}>{line}</span>)}
                      </span>
                    </ReportRow>
                  ) : null}
                </ReportSection>
              </div>

              <section className="admin-order-report-section admin-order-report-products">
                <div className="admin-order-report-section-title">
                  <h3>Produtos</h3>
                  <span>{detailOrderItems.length} item(ns)</span>
                </div>
                <div className="admin-order-items-wrap">
                  <table className="admin-order-items-table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Qtd</th>
                        <th>Unitario</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailOrderItems.map((item, idx) => (
                        <tr key={`${item.produtoId || item.nome}-${idx}`}>
                          <td>{item.nome || 'Produto'}</td>
                          <td>{item.quantidade || 0}</td>
                          <td>{formatCurrency(item.preco)}</td>
                          <td>{formatCurrency(getItemTotal(item))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-order-report-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(getOrderSubtotal(detailOrder))}</strong>
                </div>
                {getOrderCouponDiscount(detailOrder) > 0 ? (
                  <div>
                    <span>Cupom {getOrderCouponCode(detailOrder)} ({getOrderCouponPercent(detailOrder)}%)</span>
                    <strong>-{formatCurrency(getOrderCouponDiscount(detailOrder))}</strong>
                  </div>
                ) : null}
                <div>
                  <span>{getFreteLabel(detailOrder.frete)}</span>
                  <strong>{getFreteValueLabel(detailOrder.frete)}</strong>
                </div>
                {getOrderDiscount(detailOrder) > 0 ? (
                  <div>
                    <span>Desconto Pix</span>
                    <strong>-{formatCurrency(getOrderDiscount(detailOrder))}</strong>
                  </div>
                ) : null}
                {detailOrder.frete?.provider === 'melhor_envio' ? (
                  <>
                    <div>
                      <span>Valor original</span>
                      <strong>{formatCurrency(detailOrder.frete.valorOriginal)}</strong>
                    </div>
                    <div>
                      <span>Prazo transportadora</span>
                      <strong>{getFretePrazoOriginal(detailOrder.frete)}</strong>
                    </div>
                    <div>
                      <span>Separacao/embalagem</span>
                      <strong>{detailOrder.frete.diasExtrasPreparacao || 0} dias</strong>
                    </div>
                  </>
                ) : null}
                <div className="admin-order-total-line">
                  <span>Total</span>
                  <strong>{formatCurrency(detailOrder.total)}</strong>
                </div>
              </section>

              {['credit_card', 'debit_card'].includes(detailOrder.pagamento?.metodo) ? (
                <div className="admin-inline-notice">
                  Cartao: {getCardLabel(detailOrder.pagamento)}
                </div>
              ) : null}

              {detailOrder.pagamento?.eventos?.length ? (
                <div className="admin-inline-notice">
                  Historico de pagamento: {detailOrder.pagamento.eventos.length} evento(s) registrado(s).
                </div>
              ) : null}
            </article>

            <section className="admin-order-footer">
              <label className="admin-order-status-field">
                <span>Status do pedido</span>
                <select
                  className="admin-select"
                  value={detailOrder.status || 'pendente'}
                  onChange={(e) => updateStatus(detailOrder.id, e.target.value)}
                >
                  {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              <div className="admin-order-footer-actions">
                {detailOrder.pagamento?.provider === 'mercado_pago' ? (
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    onClick={() => handleConsultPayment(detailOrder.id)}
                    disabled={consultingPayment || !detailOrder.pagamento?.paymentId}
                  >
                    {consultingPayment ? 'Consultando...' : 'Consultar pagamento'}
                  </button>
                ) : null}
                {detailOrder.status === 'enviado' ? (
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    onClick={() => openTrackingCode(detailOrder)}
                  >
                    {getTrackingCode(detailOrder) ? `Rastreio: ${getTrackingCode(detailOrder)}` : 'Adicionar rastreio'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => printOrderLabel(detailOrder)}
                  disabled={printingLabelId === detailOrder.id}
                >
                  <PrinterIcon className="admin-inline-icon" />
                  {printingLabelId === detailOrder.id ? 'Abrindo etiqueta...' : 'Imprimir etiqueta'}
                </button>
                <button type="button" className="admin-btn-secondary" onClick={closeOrderDetails}>
                  Fechar
                </button>
              </div>
            </section>
          </div>
        </Modal>
      )}
    </section>
  )
}
