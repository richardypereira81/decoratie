import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'

export const AGENDA_TYPES = [
  { value: 'retirada', label: 'Retirada no local' },
  { value: 'entrega', label: 'Entrega agendada' },
  { value: 'atendimento', label: 'Atendimento interno' },
  { value: 'outro', label: 'Outro' },
]

export const AGENDA_STATUS_OPTIONS = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'concluido', label: 'Concluido' },
  { value: 'cancelado', label: 'Cancelado' },
]

export const AGENDA_STATUS_CLASSES = {
  agendado: 'is-warning',
  confirmado: 'is-info',
  concluido: 'is-live',
  cancelado: 'is-muted',
}

function toStringValue(value) {
  return String(value || '').trim()
}

export function getAgendaTypeLabel(type) {
  return AGENDA_TYPES.find((option) => option.value === type)?.label || type || '--'
}

export function getAgendaStatusLabel(status) {
  return AGENDA_STATUS_OPTIONS.find((option) => option.value === status)?.label || status || '--'
}

export function getAgendaStatusClass(status) {
  return AGENDA_STATUS_CLASSES[status] || 'is-muted'
}

export function isPickupOrder(order) {
  return order?.frete?.provider === 'retirada_local' || order?.frete?.tipo === 'retirada'
}

export function isOrderPaymentApproved(order) {
  const paymentStatus = String(
    order?.pagamento?.statusMercadoPago ||
    order?.pagamento?.status ||
    '',
  ).trim().toLowerCase()
  const orderStatus = String(order?.status || '').trim().toLowerCase()
  const approvedPaymentStatuses = ['approved', 'authorized', 'pago', 'aprovado', 'autorizado']
  const approvedOrderStatuses = ['pago', 'enviado', 'entregue']

  return approvedPaymentStatuses.includes(paymentStatus) || approvedOrderStatuses.includes(orderStatus)
}

export function canSchedulePickupOrder(order) {
  return isPickupOrder(order) && isOrderPaymentApproved(order)
}

export function getOrderPickupSchedule(order) {
  const frete = order?.frete || {}
  const schedule = frete.agendamentoRetirada || frete.retiradaAgendada || {}

  return {
    data: toStringValue(schedule.data || schedule.date || frete.dataRetirada),
    hora: toStringValue(schedule.hora || schedule.time || frete.horaRetirada),
    observacoes: toStringValue(schedule.observacoes || schedule.obs || schedule.note),
    texto: toStringValue(schedule.texto || schedule.label),
  }
}

export function getOrderCode(order) {
  const orderNumber = Number(order?.orderNumber ?? order?.numero ?? order?.numeroPedido)
  return Number.isFinite(orderNumber) && orderNumber > 0 ? String(orderNumber) : String(order?.id || '')
}

export function getOrderLabel(order) {
  const code = getOrderCode(order)
  return code ? `Pedido ${code}` : 'Pedido'
}

export function formatDateInputLabel(value) {
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

export function buildPickupScheduleLabel(data, hora) {
  const dateLabel = formatDateInputLabel(data)

  if (dateLabel && hora) {
    return `Retirada agendada: ${dateLabel} as ${hora}`
  }

  if (dateLabel) {
    return `Retirada agendada: ${dateLabel}`
  }

  return ''
}

export function createLocalDateTime(dateValue, timeValue = '00:00') {
  const [year, month, day] = String(dateValue || '').split('-').map((part) => Number(part))
  const [hour = 0, minute = 0] = String(timeValue || '00:00').split(':').map((part) => Number(part))

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day, hour || 0, minute || 0)
}

export function buildAgendaTimestamp(dateValue, timeValue) {
  const date = createLocalDateTime(dateValue, timeValue)
  return date ? Timestamp.fromDate(date) : null
}

export function getAgendaStartDate(agenda) {
  if (agenda?.dataHoraInicio?.toDate) {
    return agenda.dataHoraInicio.toDate()
  }

  return createLocalDateTime(agenda?.data, agenda?.horaInicio)
}

export function getAgendaDateKey(agenda) {
  return toStringValue(agenda?.data)
}

function getTimestampMillis(value) {
  if (!value) {
    return 0
  }

  if (typeof value.toMillis === 'function') {
    return value.toMillis()
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getOrderAgendaDocId(pedidoId) {
  return `pedido_${encodeURIComponent(toStringValue(pedidoId))}`
}

function isPickupOrderAgenda(agenda) {
  return agenda?.origem === 'pedido' && agenda?.tipo === 'retirada' && Boolean(agenda?.pedidoId)
}

export function getPreferredPickupOrderAgenda(agendas, order = null) {
  if (!agendas?.length) {
    return null
  }

  const linkedAgendaId = toStringValue(order?.frete?.agendamentoRetirada?.agendaId)
  const deterministicId = order?.id ? getOrderAgendaDocId(order.id) : ''

  return [...agendas].sort((first, second) => {
    if (linkedAgendaId) {
      if (first.id === linkedAgendaId) return -1
      if (second.id === linkedAgendaId) return 1
    }

    if (deterministicId) {
      if (first.id === deterministicId) return -1
      if (second.id === deterministicId) return 1
    }

    if (first.status === 'cancelado' && second.status !== 'cancelado') return 1
    if (second.status === 'cancelado' && first.status !== 'cancelado') return -1

    const firstUpdated = getTimestampMillis(first.updatedAt || first.createdAt)
    const secondUpdated = getTimestampMillis(second.updatedAt || second.createdAt)
    return secondUpdated - firstUpdated
  })[0]
}

export function dedupePickupOrderAgendas(agendas, orders = []) {
  const ordersById = new Map(orders.map((order) => [order.id, order]))
  const groups = new Map()
  const visible = []
  const duplicates = []

  agendas.forEach((agenda) => {
    if (!isPickupOrderAgenda(agenda)) {
      visible.push(agenda)
      return
    }

    const group = groups.get(agenda.pedidoId) || []
    group.push(agenda)
    groups.set(agenda.pedidoId, group)
  })

  groups.forEach((group, pedidoId) => {
    const preferred = getPreferredPickupOrderAgenda(group, ordersById.get(pedidoId))

    if (preferred) {
      visible.push(preferred)
    }

    group.forEach((agenda) => {
      if (agenda.id !== preferred?.id) {
        duplicates.push(agenda)
      }
    })
  })

  return { visible, duplicates }
}

export function isAgendaToday(agenda) {
  const today = new Date()
  const date = getAgendaStartDate(agenda)

  return Boolean(
    date &&
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate(),
  )
}

export function normalizeAgendaPayload(input = {}) {
  const tipo = AGENDA_TYPES.some((option) => option.value === input.tipo) ? input.tipo : 'outro'
  const status = AGENDA_STATUS_OPTIONS.some((option) => option.value === input.status) ? input.status : 'agendado'
  const horaFim = toStringValue(input.horaFim)
  const enderecoTexto = toStringValue(input.enderecoTexto || input.endereco?.texto)

  return {
    tipo,
    titulo: toStringValue(input.titulo),
    clienteNome: toStringValue(input.clienteNome),
    clienteTelefone: toStringValue(input.clienteTelefone),
    clienteEmail: toStringValue(input.clienteEmail),
    pedidoId: toStringValue(input.pedidoId) || null,
    pedidoNumero: toStringValue(input.pedidoNumero) || null,
    origem: toStringValue(input.origem) || 'manual',
    data: toStringValue(input.data),
    horaInicio: toStringValue(input.horaInicio),
    horaFim: horaFim || null,
    dataHoraInicio: buildAgendaTimestamp(input.data, input.horaInicio),
    dataHoraFim: horaFim ? buildAgendaTimestamp(input.data, horaFim) : null,
    status,
    observacoes: toStringValue(input.observacoes),
    endereco: enderecoTexto ? { texto: enderecoTexto } : null,
  }
}

export function validateAgendaPayload(payload) {
  if (!payload.tipo) {
    throw new Error('Informe o tipo do agendamento.')
  }

  if (!payload.titulo) {
    throw new Error('Informe o titulo do agendamento.')
  }

  if (!payload.data) {
    throw new Error('Informe a data do agendamento.')
  }

  if (!payload.horaInicio) {
    throw new Error('Informe a hora do agendamento.')
  }
}

function buildOrderAgendaPayload(order, { data, hora, observacoes = '', status = 'agendado', userId = '' } = {}) {
  const schedule = getOrderPickupSchedule(order)
  const nextData = toStringValue(data || schedule.data)
  const nextHora = toStringValue(hora || schedule.hora)
  const orderCode = getOrderCode(order)
  const titleCode = orderCode ? `#${orderCode}` : ''

  return normalizeAgendaPayload({
    tipo: 'retirada',
    titulo: `Retirada - Pedido ${titleCode}`.trim(),
    clienteNome: order?.cliente?.nome,
    clienteTelefone: order?.cliente?.telefone,
    clienteEmail: order?.cliente?.email,
    pedidoId: order?.id,
    pedidoNumero: orderCode,
    origem: 'pedido',
    data: nextData,
    horaInicio: nextHora,
    status,
    observacoes: observacoes || schedule.observacoes,
    updatedBy: userId,
  })
}

async function findAgendasByPedidoId(pedidoId) {
  if (!pedidoId) {
    return []
  }

  const snapshot = await getDocs(
    query(collection(db, 'agendamentos'), where('pedidoId', '==', pedidoId)),
  )

  if (snapshot.empty) {
    return []
  }

  return snapshot.docs
    .map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data(),
    }))
    .filter(isPickupOrderAgenda)
}

export async function removeDuplicatePickupOrderAgendas(agendas) {
  const uniqueIds = [...new Set(
    agendas
      .map((agenda) => agenda?.id)
      .filter(Boolean),
  )]

  if (!uniqueIds.length) {
    return
  }

  const batch = writeBatch(db)
  uniqueIds.forEach((agendaId) => {
    batch.delete(doc(db, 'agendamentos', agendaId))
  })
  await batch.commit()
}

export function shouldSyncPickupOrderAgenda(order, agenda) {
  if (!canSchedulePickupOrder(order)) {
    return false
  }

  const schedule = getOrderPickupSchedule(order)

  if (!schedule.data || !schedule.hora) {
    return false
  }

  if (!agenda) {
    return true
  }

  return (
    agenda.data !== schedule.data ||
    agenda.horaInicio !== schedule.hora ||
    agenda.status === 'cancelado' ||
    agenda.origem !== 'pedido'
  )
}

export async function createAgenda(input) {
  const payload = normalizeAgendaPayload(input)
  validateAgendaPayload(payload)

  const ref = doc(collection(db, 'agendamentos'))
  await setDoc(ref, {
    ...payload,
    id: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return ref.id
}

export async function updateAgenda(agendaId, input) {
  const payload = normalizeAgendaPayload(input)
  validateAgendaPayload(payload)

  await updateDoc(doc(db, 'agendamentos', agendaId), {
    ...payload,
    updatedAt: serverTimestamp(),
  })
}

export async function updateAgendaStatus(agenda, status) {
  await updateDoc(doc(db, 'agendamentos', agenda.id), {
    status,
    updatedAt: serverTimestamp(),
  })
}

export async function removeAgenda(agenda) {
  await deleteDoc(doc(db, 'agendamentos', agenda.id))
}

export async function upsertAgendaForPickupOrder(order, options = {}) {
  if (!order?.id || !isPickupOrder(order)) {
    return null
  }

  if (!isOrderPaymentApproved(order)) {
    throw new Error('A retirada so pode ser agendada apos o pagamento aprovado.')
  }

  const payload = buildOrderAgendaPayload(order, options)
  validateAgendaPayload(payload)

  const existingAgendas = await findAgendasByPedidoId(order.id)
  const existingAgenda = getPreferredPickupOrderAgenda(existingAgendas, order)
  const ref = doc(db, 'agendamentos', getOrderAgendaDocId(order.id))

  const nextPayload = {
    ...payload,
    id: ref.id,
    updatedAt: serverTimestamp(),
  }

  if (existingAgenda?.createdAt) {
    nextPayload.createdAt = existingAgenda.createdAt
  } else if (!existingAgenda) {
    nextPayload.createdAt = serverTimestamp()
  }

  await setDoc(ref, nextPayload, { merge: true })

  if (order.frete?.agendamentoRetirada?.agendaId !== ref.id) {
    await updateDoc(doc(db, 'pedidos', order.id), {
      'frete.agendamentoRetirada.agendaId': ref.id,
    })
  }

  await removeDuplicatePickupOrderAgendas(existingAgendas.filter((agenda) => agenda.id !== ref.id))

  return ref.id
}

export async function syncPickupOrderFromAgenda(agenda, input, { userId = '' } = {}) {
  const pedidoId = toStringValue(agenda?.pedidoId || input?.pedidoId)

  if (!pedidoId || agenda?.tipo !== 'retirada') {
    return
  }

  const orderRef = doc(db, 'pedidos', pedidoId)
  const orderSnapshot = await getDoc(orderRef)
  const order = orderSnapshot.exists()
    ? {
        id: orderSnapshot.id,
        ...orderSnapshot.data(),
      }
    : null

  if (!order || !isPickupOrder(order)) {
    return
  }

  if (!isOrderPaymentApproved(order)) {
    throw new Error('A retirada so pode ser agendada apos o pagamento aprovado.')
  }

  const payload = buildPickupOrderUpdate(order, input, { agendaId: agenda.id, userId })
  await updateDoc(orderRef, payload)
}

export function buildPickupOrderUpdate(
  order,
  { data, horaInicio, hora, observacoes = '' } = {},
  { agendaId = '', userId = '' } = {},
) {
  const pickupDate = toStringValue(data)
  const pickupTime = toStringValue(horaInicio || hora)
  const texto = buildPickupScheduleLabel(pickupDate, pickupTime)
  const previousText = order?.frete?.prazoTextoOriginal ||
    order?.frete?.prazoTexto ||
    'Agende a retirada'
  const payload = {
    'frete.agendamentoRetirada.data': pickupDate,
    'frete.agendamentoRetirada.hora': pickupTime,
    'frete.agendamentoRetirada.texto': texto,
    'frete.agendamentoRetirada.observacoes': toStringValue(observacoes),
    'frete.agendamentoRetirada.agendaId': toStringValue(agendaId),
    'frete.agendamentoRetirada.updatedAt': serverTimestamp(),
    'frete.agendamentoRetirada.updatedBy': userId,
    'frete.prazoTexto': texto,
    updatedAt: serverTimestamp(),
  }

  if (!order?.frete?.prazoTextoOriginal) {
    payload['frete.prazoTextoOriginal'] = previousText
  }

  return payload
}

export async function clearPickupOrderSchedule(order) {
  if (!order?.id) {
    return
  }

  const fallbackText = order.frete?.prazoTextoOriginal || 'Agende a retirada'

  await updateDoc(doc(db, 'pedidos', order.id), {
    'frete.agendamentoRetirada': deleteField(),
    'frete.prazoTexto': fallbackText,
    updatedAt: serverTimestamp(),
  })
}

export async function cancelAgendaForPickupOrder(order, { userId = '' } = {}) {
  if (!order?.id) {
    return
  }

  const existingAgendas = await findAgendasByPedidoId(order.id)
  const existingAgenda = getPreferredPickupOrderAgenda(existingAgendas, order)

  if (!existingAgenda) {
    return
  }

  await updateDoc(doc(db, 'agendamentos', existingAgenda.id), {
    status: 'cancelado',
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })
}
