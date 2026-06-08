import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthSession } from '../AuthContext.jsx'
import { useAdminUI } from '../components/AdminLayout.jsx'
import AgendaCard from '../components/AgendaCard.jsx'
import AgendaModal from '../components/AgendaModal.jsx'
import SearchInput from '../components/SearchInput.jsx'
import {
  AGENDA_STATUS_OPTIONS,
  AGENDA_TYPES,
  clearPickupOrderSchedule,
  createAgenda,
  dedupePickupOrderAgendas,
  getAgendaDateKey,
  getAgendaStartDate,
  getOrderPickupSchedule,
  isPickupOrder,
  normalizeAgendaPayload,
  removeDuplicatePickupOrderAgendas,
  removeAgenda,
  shouldSyncPickupOrderAgenda,
  syncPickupOrderFromAgenda,
  updateAgenda,
  updateAgendaStatus,
  upsertAgendaForPickupOrder,
} from '../services/agendaService.js'
import { useCollectionData } from '../hooks/useFirestoreData.js'

const QUICK_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'today', label: 'Hoje' },
  { value: 'tomorrow', label: 'Amanha' },
  { value: 'week', label: 'Esta semana' },
]

const initialFilters = {
  search: '',
  type: 'all',
  status: 'all',
  date: '',
  quick: 'all',
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isInCurrentWeek(date) {
  if (!date) {
    return false
  }

  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(now.getDate() - now.getDay())

  const end = new Date(start)
  end.setDate(start.getDate() + 7)

  return date >= start && date < end
}

function matchesQuickFilter(agenda, quick) {
  if (quick === 'all') {
    return true
  }

  const date = getAgendaStartDate(agenda)

  if (!date) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (quick === 'today') {
    return formatDateKey(date) === formatDateKey(today)
  }

  if (quick === 'tomorrow') {
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    return formatDateKey(date) === formatDateKey(tomorrow)
  }

  if (quick === 'week') {
    return isInCurrentWeek(date)
  }

  return true
}

function sortBySchedule(first, second) {
  const firstDate = getAgendaStartDate(first)?.getTime() || Number.MAX_SAFE_INTEGER
  const secondDate = getAgendaStartDate(second)?.getTime() || Number.MAX_SAFE_INTEGER

  if (firstDate !== secondDate) {
    return firstDate - secondDate
  }

  return String(first.titulo || '').localeCompare(String(second.titulo || ''), 'pt-BR')
}

export default function AgendaPage() {
  const { user } = useAuthSession()
  const { notify } = useAdminUI()
  const { data: agendas, loading: loadingAgendas } = useCollectionData('agendamentos')
  const { data: orders, loading: loadingOrders } = useCollectionData('pedidos')
  const [filters, setFilters] = useState(initialFilters)
  const [modalMode, setModalMode] = useState('closed')
  const [selectedAgenda, setSelectedAgenda] = useState(null)
  const [saving, setSaving] = useState(false)
  const syncKeysRef = useRef(new Set())
  const cleanupKeysRef = useRef(new Set())

  const { visible: visibleAgendas, duplicates: duplicateAgendas } = useMemo(
    () => dedupePickupOrderAgendas(agendas, orders),
    [agendas, orders],
  )

  const agendaByPedidoId = useMemo(() => {
    const map = new Map()
    visibleAgendas.forEach((agenda) => {
      if (agenda.origem === 'pedido' && agenda.tipo === 'retirada' && agenda.pedidoId) {
        map.set(agenda.pedidoId, agenda)
      }
    })
    return map
  }, [visibleAgendas])

  useEffect(() => {
    if (loadingAgendas || !duplicateAgendas.length) {
      return
    }

    const cleanupKey = duplicateAgendas
      .map((agenda) => agenda.id)
      .sort()
      .join('|')

    if (cleanupKeysRef.current.has(cleanupKey)) {
      return
    }

    cleanupKeysRef.current.add(cleanupKey)
    removeDuplicatePickupOrderAgendas(duplicateAgendas).catch((error) => {
      console.warn('[agenda] falha ao remover duplicados', error)
    })
  }, [duplicateAgendas, loadingAgendas])

  useEffect(() => {
    if (loadingAgendas || loadingOrders) {
      return
    }

    orders
      .filter((order) => isPickupOrder(order))
      .forEach((order) => {
        const agenda = agendaByPedidoId.get(order.id)
        const schedule = getOrderPickupSchedule(order)

        if (!shouldSyncPickupOrderAgenda(order, agenda)) {
          return
        }

        const syncKey = `${order.id}:${schedule.data}:${schedule.hora}:${agenda?.status || 'novo'}`

        if (syncKeysRef.current.has(syncKey)) {
          return
        }

        syncKeysRef.current.add(syncKey)
        upsertAgendaForPickupOrder(order, {
          data: schedule.data,
          hora: schedule.hora,
          observacoes: schedule.observacoes,
          userId: user?.uid || '',
        }).catch((error) => {
          console.warn('[agenda] falha ao sincronizar pedido', order.id, error)
        })
      })
  }, [agendaByPedidoId, loadingAgendas, loadingOrders, orders, user?.uid])

  const filteredAgendas = useMemo(() => {
    const normalizedSearch = filters.search.trim().toLowerCase()

    return [...visibleAgendas]
      .filter((agenda) => {
        if (filters.type !== 'all' && agenda.tipo !== filters.type) {
          return false
        }

        if (filters.status !== 'all' && agenda.status !== filters.status) {
          return false
        }

        if (filters.date && getAgendaDateKey(agenda) !== filters.date) {
          return false
        }

        if (!matchesQuickFilter(agenda, filters.quick)) {
          return false
        }

        if (normalizedSearch) {
          const haystack = [
            agenda.titulo,
            agenda.clienteNome,
            agenda.clienteTelefone,
            agenda.clienteEmail,
            agenda.pedidoNumero,
            agenda.pedidoId,
            agenda.observacoes,
          ].join(' ').toLowerCase()

          if (!haystack.includes(normalizedSearch)) {
            return false
          }
        }

        return true
      })
      .sort(sortBySchedule)
  }, [filters, visibleAgendas])

  const todayCount = useMemo(
    () => visibleAgendas.filter((agenda) => matchesQuickFilter(agenda, 'today')).length,
    [visibleAgendas],
  )

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== initialFilters[key] && Boolean(value),
  ).length

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === 'quick' ? { date: '' } : {}),
    }))
  }

  function clearFilters() {
    setFilters(initialFilters)
  }

  function openNewAgenda() {
    setSelectedAgenda(null)
    setModalMode('edit')
  }

  function openEditAgenda(agenda) {
    setSelectedAgenda(agenda)
    setModalMode('edit')
  }

  function openViewAgenda(agenda) {
    setSelectedAgenda(agenda)
    setModalMode('view')
  }

  function closeModal() {
    if (saving) {
      return
    }

    setSelectedAgenda(null)
    setModalMode('closed')
  }

  async function handleSaveAgenda(form) {
    const editingAgenda = selectedAgenda?.id ? selectedAgenda : null
    const payload = normalizeAgendaPayload({
      ...form,
      origem: editingAgenda?.origem || form.origem || 'manual',
      pedidoId: editingAgenda?.pedidoId || form.pedidoId,
      pedidoNumero: editingAgenda?.pedidoNumero || form.pedidoNumero,
    })

    setSaving(true)

    try {
      if (editingAgenda) {
        await updateAgenda(editingAgenda.id, payload)

        if (editingAgenda.origem === 'pedido' && editingAgenda.tipo === 'retirada') {
          const linkedOrder = orders.find((order) => order.id === editingAgenda.pedidoId)

          if (payload.status === 'cancelado') {
            if (linkedOrder) {
              await clearPickupOrderSchedule(linkedOrder)
            }
          } else {
            await syncPickupOrderFromAgenda(editingAgenda, payload, { userId: user?.uid || '' })
          }
        }
      } else {
        await createAgenda(payload)
      }

      notify({
        type: 'success',
        title: editingAgenda ? 'Agendamento atualizado' : 'Agendamento criado',
        description: payload.titulo,
      })
      closeModal()
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel salvar o agendamento',
        description: error.message || 'Revise os dados e tente novamente.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function changeAgendaStatus(agenda, status) {
    try {
      await updateAgendaStatus(agenda, status)

      if (status === 'cancelado' && agenda.origem === 'pedido') {
        const linkedOrder = orders.find((order) => order.id === agenda.pedidoId)

        if (linkedOrder) {
          await clearPickupOrderSchedule(linkedOrder)
        }
      }

      notify({
        type: 'success',
        title: 'Agenda atualizada',
        description: `${agenda.titulo} ficou como ${status}.`,
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel atualizar a agenda',
        description: error.message || 'Tente novamente.',
      })
    }
  }

  async function handleDeleteAgenda(agenda) {
    if (agenda.origem === 'pedido') {
      notify({
        type: 'error',
        title: 'Agendamento vinculado ao pedido',
        description: 'Cancele o agendamento para manter o historico do pedido.',
      })
      return
    }

    const confirmed = window.confirm(`Excluir "${agenda.titulo}" da agenda?`)

    if (!confirmed) {
      return
    }

    try {
      await removeAgenda(agenda)
      notify({
        type: 'success',
        title: 'Agendamento excluido',
        description: agenda.titulo,
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel excluir o agendamento',
        description: error.message || 'Tente novamente.',
      })
    }
  }

  const modalOpen = modalMode !== 'closed'

  return (
    <section className="admin-page-section admin-list-page admin-agenda-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Agenda</span>
          <h1>Compromissos da loja em um so lugar.</h1>
          <p>Organize retiradas, entregas agendadas, atendimentos e tarefas internas.</p>
        </div>
        <button type="button" className="admin-btn" onClick={openNewAgenda}>
          Novo agendamento
        </button>
      </div>

      <section className="admin-agenda-summary" aria-label="Resumo da agenda">
        <div>
          <span>Agendamentos exibidos</span>
          <strong>{filteredAgendas.length}</strong>
        </div>
        <div>
          <span>Hoje</span>
          <strong>{todayCount}</strong>
        </div>
        <div>
          <span>Filtros ativos</span>
          <strong>{activeFilterCount}</strong>
        </div>
      </section>

      <section className="admin-agenda-filters" aria-label="Filtros da agenda">
        <SearchInput
          value={filters.search}
          onChange={(event) => updateFilter('search', event.target.value)}
          placeholder="Buscar por cliente, pedido, titulo ou observacao..."
          ariaLabel="Buscar agenda"
        />

        <div className="admin-agenda-quick-filters" aria-label="Filtros rapidos">
          {QUICK_FILTERS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`admin-segmented-btn ${filters.quick === option.value ? 'is-active' : ''}`}
              onClick={() => updateFilter('quick', option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="admin-agenda-filter-grid">
          <label className="admin-field">
            <span>Data</span>
            <input
              className="admin-input"
              type="date"
              value={filters.date}
              onChange={(event) => setFilters((current) => ({
                ...current,
                date: event.target.value,
                quick: 'all',
              }))}
            />
          </label>

          <label className="admin-field">
            <span>Status</span>
            <select
              className="admin-select"
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
            >
              <option value="all">Todos</option>
              {AGENDA_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>Tipo</span>
            <select
              className="admin-select"
              value={filters.type}
              onChange={(event) => updateFilter('type', event.target.value)}
            >
              <option value="all">Todos</option>
              {AGENDA_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <button type="button" className="admin-btn-secondary" onClick={clearFilters}>
            Limpar filtros
          </button>
        </div>
      </section>

      {loadingAgendas ? (
        <div className="admin-empty-state">Carregando agenda...</div>
      ) : filteredAgendas.length ? (
        <div className="admin-agenda-list">
          {filteredAgendas.map((agenda) => (
            <AgendaCard
              key={agenda.id}
              agenda={agenda}
              onCancel={(item) => changeAgendaStatus(item, 'cancelado')}
              onComplete={(item) => changeAgendaStatus(item, 'concluido')}
              onConfirm={(item) => changeAgendaStatus(item, 'confirmado')}
              onDelete={handleDeleteAgenda}
              onEdit={openEditAgenda}
              onView={openViewAgenda}
            />
          ))}
        </div>
      ) : (
        <div className="admin-empty-state">Nenhum agendamento encontrado.</div>
      )}

      <AgendaModal
        agenda={selectedAgenda}
        mode={modalMode}
        onClose={closeModal}
        onSave={handleSaveAgenda}
        open={modalOpen}
        orders={orders}
        saving={saving}
      />
    </section>
  )
}
