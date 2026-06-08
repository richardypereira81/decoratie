import { useDeferredValue, useMemo, useState } from 'react'
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { formatCurrency, formatDate, getDateValue } from '../../shared/formatters.js'
import { isValidCouponCode, normalizeCouponCode } from '../../shared/couponApi.js'
import { useAuthSession } from '../AuthContext.jsx'
import { CheckIcon, CloseIcon, EditIcon, PlusIcon, TrashIcon } from '../components/AdminIcons.jsx'
import { useAdminUI } from '../components/AdminLayout.jsx'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import SearchInput from '../components/SearchInput.jsx'
import { useCollectionData } from '../hooks/useFirestoreData.js'

const emptyCouponForm = {
  codigo: '',
  descricao: '',
  tipo: 'porcentagem',
  percentual: '',
  dataInicio: '',
  dataValidade: '',
  ativo: true,
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
]

function toInputDate(value) {
  const date = getDateValue(value)

  if (!date) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseInputDate(value, endOfDay = false) {
  const [year, month, day] = String(value || '').split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )
}

function getCouponValidityState(coupon) {
  if (coupon.ativo !== true) {
    return { label: 'Inativo', className: 'is-muted' }
  }

  const now = new Date()
  const startDate = getDateValue(coupon.dataInicio)
  const endDate = getDateValue(coupon.dataValidade)

  if (startDate && now < startDate) {
    return { label: 'Agendado', className: 'is-warning' }
  }

  if (!endDate || now > endDate) {
    return { label: 'Expirado', className: 'is-danger' }
  }

  return { label: 'Ativo', className: 'is-live' }
}

function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function getCouponUsageCode(usage) {
  return normalizeCouponCode(
    usage.cupomId ||
    usage.codigoCupom ||
    usage.cupomCodigo ||
    usage.codigo ||
    usage.couponCode,
  )
}

function getCouponUsageTotal(usage) {
  const total = Number(
    usage.totalPedido ??
    usage.totalFinal ??
    usage.total ??
    usage.valorPedido ??
    0,
  )

  return Number.isFinite(total) ? total : 0
}

function buildCouponSalesStats(usages) {
  const statsByCode = new Map()
  const seenOrdersByCode = new Map()

  usages.forEach((usage) => {
    const code = getCouponUsageCode(usage)

    if (!code) {
      return
    }

    const orderKey = String(usage.pedidoId || usage.orderId || usage.id || '').trim()
    const seenOrders = seenOrdersByCode.get(code) || new Set()

    if (orderKey && seenOrders.has(orderKey)) {
      return
    }

    seenOrders.add(orderKey)
    seenOrdersByCode.set(code, seenOrders)

    const currentStats = statsByCode.get(code) || {
      salesCount: 0,
      salesTotal: 0,
    }

    statsByCode.set(code, {
      salesCount: currentStats.salesCount + 1,
      salesTotal: currentStats.salesTotal + getCouponUsageTotal(usage),
    })
  })

  return statsByCode
}

function buildCouponForm(coupon) {
  if (!coupon) {
    return {
      ...emptyCouponForm,
      dataInicio: toInputDate(new Date()),
    }
  }

  return {
    codigo: normalizeCouponCode(coupon.codigo || coupon.id),
    descricao: String(coupon.descricao || ''),
    tipo: 'porcentagem',
    percentual: coupon.percentual === undefined || coupon.percentual === null
      ? ''
      : String(coupon.percentual),
    dataInicio: toInputDate(coupon.dataInicio),
    dataValidade: toInputDate(coupon.dataValidade),
    ativo: coupon.ativo !== false,
  }
}

function validateCouponForm(form) {
  const codigo = normalizeCouponCode(form.codigo)
  const percentual = Number(form.percentual)
  const dataInicio = parseInputDate(form.dataInicio)
  const dataValidade = parseInputDate(form.dataValidade, true)
  const errors = {}

  if (!codigo) {
    errors.codigo = 'Codigo obrigatorio.'
  } else if (!isValidCouponCode(codigo)) {
    errors.codigo = 'Use apenas letras e numeros, sem espacos.'
  }

  if (!Number.isFinite(percentual) || percentual <= 0) {
    errors.percentual = 'Informe um percentual maior que zero.'
  } else if (percentual > 100) {
    errors.percentual = 'Percentual nao pode passar de 100.'
  }

  if (!dataInicio) {
    errors.dataInicio = 'Data de inicio obrigatoria.'
  }

  if (!dataValidade) {
    errors.dataValidade = 'Data de validade obrigatoria.'
  } else if (dataInicio && dataValidade < dataInicio) {
    errors.dataValidade = 'Validade nao pode ser anterior ao inicio.'
  }

  return {
    codigo,
    percentual,
    dataInicio,
    dataValidade,
    errors,
  }
}

export default function CouponsPage() {
  const { user } = useAuthSession()
  const { notify } = useAdminUI()
  const { data: coupons, loading } = useCollectionData('cupons')
  const { data: couponUsages, loading: loadingCouponUsages } = useCollectionData('cupomUsos')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('validade_asc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState(null)
  const [form, setForm] = useState(emptyCouponForm)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const filteredCoupons = useMemo(() => {
    const term = normalizeSearchValue(deferredSearch)

    return [...coupons]
      .filter((coupon) => {
        const activeMatch =
          statusFilter === 'all' ||
          (statusFilter === 'active' && coupon.ativo === true) ||
          (statusFilter === 'inactive' && coupon.ativo !== true)
        const searchMatch = !term || normalizeSearchValue([
          coupon.codigo,
          coupon.id,
          coupon.descricao,
        ].filter(Boolean).join(' ')).includes(term)

        return activeMatch && searchMatch
      })
      .sort((first, second) => {
        if (sortBy === 'validade_desc') {
          return (getDateValue(second.dataValidade)?.getTime() || 0) -
            (getDateValue(first.dataValidade)?.getTime() || 0)
        }

        if (sortBy === 'codigo') {
          return String(first.codigo || first.id || '')
            .localeCompare(String(second.codigo || second.id || ''), 'pt-BR')
        }

        return (getDateValue(first.dataValidade)?.getTime() || Number.MAX_SAFE_INTEGER) -
          (getDateValue(second.dataValidade)?.getTime() || Number.MAX_SAFE_INTEGER)
      })
  }, [coupons, deferredSearch, sortBy, statusFilter])

  const couponSalesStats = useMemo(() => buildCouponSalesStats(couponUsages), [couponUsages])

  const filteredCouponSummary = useMemo(() => (
    filteredCoupons.reduce((summary, coupon) => {
      const codigo = normalizeCouponCode(coupon.codigo || coupon.id)
      const stats = couponSalesStats.get(codigo) || { salesCount: 0, salesTotal: 0 }

      return {
        salesCount: summary.salesCount + stats.salesCount,
        salesTotal: summary.salesTotal + stats.salesTotal,
      }
    }, { salesCount: 0, salesTotal: 0 })
  ), [couponSalesStats, filteredCoupons])

  function openCreateModal() {
    setEditingCoupon(null)
    setForm(buildCouponForm(null))
    setFormErrors({})
    setModalOpen(true)
  }

  function openEditModal(coupon) {
    setEditingCoupon(coupon)
    setForm(buildCouponForm(coupon))
    setFormErrors({})
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) {
      return
    }

    setModalOpen(false)
    setEditingCoupon(null)
    setFormErrors({})
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: field === 'codigo' ? normalizeCouponCode(value) : value,
    }))
    setFormErrors((current) => ({ ...current, [field]: '' }))
  }

  async function saveCoupon(event) {
    event.preventDefault()
    const validation = validateCouponForm(form)
    setFormErrors(validation.errors)

    if (Object.keys(validation.errors).length) {
      return
    }

    const nextCode = validation.codigo
    const previousCode = normalizeCouponCode(editingCoupon?.codigo || editingCoupon?.id)
    const couponRef = doc(db, 'cupons', nextCode)

    setSaving(true)

    try {
      if ((!editingCoupon || previousCode !== nextCode) && (await getDoc(couponRef)).exists()) {
        setFormErrors({ codigo: 'Ja existe um cupom com este codigo.' })
        return
      }

      const payload = {
        codigo: nextCode,
        descricao: form.descricao.trim(),
        tipo: 'porcentagem',
        percentual: validation.percentual,
        ativo: Boolean(form.ativo),
        dataInicio: validation.dataInicio,
        dataValidade: validation.dataValidade,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: user?.uid || null,
      }

      if (editingCoupon && previousCode && previousCode !== nextCode) {
        const batch = writeBatch(db)
        batch.set(couponRef, {
          ...payload,
          criadoEm: editingCoupon.criadoEm || serverTimestamp(),
          criadoPor: editingCoupon.criadoPor || user?.uid || null,
        })
        batch.delete(doc(db, 'cupons', previousCode))
        await batch.commit()
      } else {
        await setDoc(couponRef, editingCoupon ? payload : {
          ...payload,
          criadoEm: serverTimestamp(),
          criadoPor: user?.uid || null,
        }, { merge: Boolean(editingCoupon) })
      }

      notify({
        title: editingCoupon ? 'Cupom atualizado' : 'Cupom criado',
        description: `${nextCode} esta pronto para uso.`,
      })
      setModalOpen(false)
      setEditingCoupon(null)
      setFormErrors({})
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel salvar o cupom',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function toggleCoupon(coupon) {
    const codigo = normalizeCouponCode(coupon.codigo || coupon.id)
    setBusyId(codigo)

    try {
      await updateDoc(doc(db, 'cupons', codigo), {
        ativo: coupon.ativo !== true,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: user?.uid || null,
      })
      notify({
        title: coupon.ativo === true ? 'Cupom desativado' : 'Cupom ativado',
        description: codigo,
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel alterar o cupom',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setBusyId('')
    }
  }

  async function removeCoupon(coupon) {
    const codigo = normalizeCouponCode(coupon.codigo || coupon.id)

    if (!window.confirm(`Excluir o cupom ${codigo}?`)) {
      return
    }

    setBusyId(codigo)

    try {
      await deleteDoc(doc(db, 'cupons', codigo))
      notify({
        title: 'Cupom excluido',
        description: codigo,
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel excluir o cupom',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setBusyId('')
    }
  }

  const columns = [
    {
      key: 'codigo',
      header: 'Codigo',
      cell: (coupon) => {
        const status = getCouponValidityState(coupon)
        return (
          <div className="admin-table-copy">
            <strong className="admin-coupon-code">{coupon.codigo || coupon.id}</strong>
            <div className="admin-table-badges">
              <span className={`admin-badge ${status.className}`}>{status.label}</span>
            </div>
          </div>
        )
      },
    },
    {
      key: 'descricao',
      header: 'Descricao',
      cell: (coupon) => (
        <span className="admin-table-subtitle">
          {coupon.descricao || 'Sem descricao.'}
        </span>
      ),
    },
    {
      key: 'percentual',
      header: 'Percentual',
      cell: (coupon) => (
        <strong className="admin-table-price">{Number(coupon.percentual || 0)}%</strong>
      ),
    },
    {
      key: 'vendas',
      header: 'Vendas',
      cell: (coupon) => {
        const codigo = normalizeCouponCode(coupon.codigo || coupon.id)
        const stats = couponSalesStats.get(codigo) || { salesCount: 0, salesTotal: 0 }

        return (
          <div className="admin-table-stack">
            <strong>{stats.salesCount}</strong>
            <span>{stats.salesCount === 1 ? 'venda' : 'vendas'}</span>
          </div>
        )
      },
    },
    {
      key: 'totalVendas',
      header: 'Total vendas',
      cell: (coupon) => {
        const codigo = normalizeCouponCode(coupon.codigo || coupon.id)
        const stats = couponSalesStats.get(codigo) || { salesCount: 0, salesTotal: 0 }

        return (
          <div className="admin-table-stack">
            <strong className="admin-table-price">{formatCurrency(stats.salesTotal)}</strong>
            <span>usando cupom</span>
          </div>
        )
      },
    },
    {
      key: 'inicio',
      header: 'Inicio',
      cell: (coupon) => (
        <div className="admin-table-stack">
          <strong>{formatDate(coupon.dataInicio)}</strong>
        </div>
      ),
    },
    {
      key: 'validade',
      header: 'Validade',
      cell: (coupon) => (
        <div className="admin-table-stack">
          <strong>{formatDate(coupon.dataValidade)}</strong>
        </div>
      ),
    },
    {
      key: 'acoes',
      header: 'Acoes',
      cellClassName: 'is-actions',
      cell: (coupon) => {
        const codigo = normalizeCouponCode(coupon.codigo || coupon.id)
        const busy = busyId === codigo

        return (
          <div className="admin-table-actions">
            <button
              type="button"
              className="admin-icon-btn"
              onClick={() => openEditModal(coupon)}
              aria-label={`Editar cupom ${codigo}`}
              disabled={busy}
            >
              <EditIcon className="admin-inline-icon" />
            </button>
            <button
              type="button"
              className="admin-icon-btn"
              onClick={() => toggleCoupon(coupon)}
              aria-label={coupon.ativo === true ? `Desativar cupom ${codigo}` : `Ativar cupom ${codigo}`}
              disabled={busy}
            >
              {coupon.ativo === true ? (
                <CloseIcon className="admin-inline-icon" />
              ) : (
                <CheckIcon className="admin-inline-icon" />
              )}
            </button>
            <button
              type="button"
              className="admin-icon-btn is-danger"
              onClick={() => removeCoupon(coupon)}
              aria-label={`Excluir cupom ${codigo}`}
              disabled={busy}
            >
              <TrashIcon className="admin-inline-icon" />
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <section className="admin-page-section admin-list-page admin-coupons-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Cupons</span>
        </div>
      </div>

      <section className="admin-orders-filter-panel admin-coupons-filter-panel" aria-label="Filtros de cupons">
        <div className="admin-orders-filter-head">
          <div className="admin-orders-filter-search">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por codigo ou descricao..."
              ariaLabel="Buscar cupons"
            />
          </div>

          <section className="admin-orders-total-bar admin-coupons-total-bar" aria-label="Resumo dos cupons exibidos">
            <div>
              <span>Cupons exibidos</span>
              <strong>{filteredCoupons.length}</strong>
            </div>
            <div>
              <span>Vendas</span>
              <strong>{filteredCouponSummary.salesCount}</strong>
            </div>
            <div>
              <span>Total vendas</span>
              <strong>{formatCurrency(filteredCouponSummary.salesTotal)}</strong>
            </div>
          </section>
        </div>

        <div className="admin-orders-filter-body admin-coupons-filter-body">
          <div className="admin-orders-period-field admin-coupons-status-field">
            <span className="admin-filter-label">Status</span>
            <div className="admin-segmented-control" aria-label="Filtrar cupons por status">
              {STATUS_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`admin-segmented-btn ${statusFilter === option.value ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter(option.value)}
                  aria-pressed={statusFilter === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="admin-orders-status-field admin-coupon-sort">
            <span className="admin-filter-label">Ordenar</span>
            <select
              className="admin-select admin-select-sm"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="validade_asc">Validade proxima</option>
              <option value="validade_desc">Validade distante</option>
              <option value="codigo">Codigo</option>
            </select>
          </label>

          <button type="button" className="admin-btn admin-coupon-create-btn" onClick={openCreateModal}>
            <PlusIcon className="admin-inline-icon" />
            Novo cupom
          </button>
        </div>
      </section>

      <DataTable
        caption="Tabela de cupons"
        columns={columns}
        rows={filteredCoupons}
        loading={loading || loadingCouponUsages}
        loadingState="Carregando cupons..."
        emptyState="Nenhum cupom encontrado."
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingCoupon ? 'Editar cupom' : 'Novo cupom'}
        width="large"
      >
        <form className="admin-form admin-modal-body" onSubmit={saveCoupon}>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Codigo do cupom</span>
              <input
                className="admin-input"
                value={form.codigo}
                onChange={(event) => updateForm('codigo', event.target.value)}
                placeholder="VIP10"
                autoComplete="off"
              />
              {formErrors.codigo ? <small className="admin-field-error">{formErrors.codigo}</small> : null}
            </label>

            <label className="admin-field">
              <span>Tipo de desconto</span>
              <select className="admin-select" value="porcentagem" disabled>
                <option value="porcentagem">Porcentagem</option>
              </select>
            </label>

            <label className="admin-field">
              <span>Percentual de desconto</span>
              <input
                className="admin-input"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={form.percentual}
                onChange={(event) => updateForm('percentual', event.target.value)}
                placeholder="10"
              />
              {formErrors.percentual ? <small className="admin-field-error">{formErrors.percentual}</small> : null}
            </label>

            <label className="admin-field">
              <span>Status</span>
              <select
                className="admin-select"
                value={form.ativo ? 'ativo' : 'inativo'}
                onChange={(event) => updateForm('ativo', event.target.value === 'ativo')}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>

            <label className="admin-field">
              <span>Data de inicio</span>
              <input
                className="admin-input"
                type="date"
                value={form.dataInicio}
                onChange={(event) => updateForm('dataInicio', event.target.value)}
              />
              {formErrors.dataInicio ? <small className="admin-field-error">{formErrors.dataInicio}</small> : null}
            </label>

            <label className="admin-field">
              <span>Data de validade</span>
              <input
                className="admin-input"
                type="date"
                value={form.dataValidade}
                onChange={(event) => updateForm('dataValidade', event.target.value)}
              />
              {formErrors.dataValidade ? <small className="admin-field-error">{formErrors.dataValidade}</small> : null}
            </label>

            <label className="admin-field admin-field-full">
              <span>Descricao</span>
              <textarea
                className="admin-textarea"
                rows={3}
                value={form.descricao}
                onChange={(event) => updateForm('descricao', event.target.value)}
                placeholder="Cupom de 10% para clientes do grupo VIP"
              />
            </label>
          </div>

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn-secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="admin-btn" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar cupom'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
