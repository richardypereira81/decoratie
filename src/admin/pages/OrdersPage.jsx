import { useDeferredValue, useMemo, useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { formatCurrency, formatDateTime, getDateValue } from '../../shared/formatters.js'
import { useCollectionData } from '../hooks/useFirestoreData.js'
import { useAdminUI } from '../components/AdminLayout.jsx'
import SearchInput from '../components/SearchInput.jsx'
import Toolbar from '../components/Toolbar.jsx'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import { EyeIcon } from '../components/AdminIcons.jsx'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'pago', label: 'Pago' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
]

const STATUS_COLORS = {
  pendente: 'is-warning',
  pago: 'is-accent',
  enviado: 'is-info',
  entregue: 'is-live',
  cancelado: 'is-muted',
}

export default function OrdersPage() {
  const { data: orders, loading } = useCollectionData('pedidos')
  const { notify } = useAdminUI()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailOrder, setDetailOrder] = useState(null)
  const deferredSearch = useDeferredValue(search)

  const filteredOrders = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase()

    return [...orders]
      .sort((a, b) => {
        const da = getDateValue(a.createdAt)?.getTime() || 0
        const db_ = getDateValue(b.createdAt)?.getTime() || 0
        return db_ - da
      })
      .filter((order) => {
        if (statusFilter !== 'all' && order.status !== statusFilter) return false

        if (q) {
          const haystack = [
            order.cliente?.nome,
            order.cliente?.email,
            order.id,
            order.status,
          ].join(' ').toLowerCase()
          if (!haystack.includes(q)) return false
        }

        return true
      })
  }, [orders, deferredSearch, statusFilter])

  async function updateStatus(orderId, newStatus) {
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
    } catch (error) {
      notify({
        type: 'error',
        title: 'Erro ao atualizar status',
        description: error.message || 'Tente novamente.',
      })
    }
  }

  const columns = [
    {
      key: 'id',
      header: 'Pedido',
      mobileLabel: 'Pedido',
      cell: (order) => (
        <div className="admin-table-stack">
          <strong title={order.id}>{order.id.slice(0, 8)}...</strong>
          <span>{formatDateTime(order.createdAt)}</span>
        </div>
      ),
    },
    {
      key: 'cliente',
      header: 'Cliente',
      cell: (order) => (
        <div className="admin-table-stack">
          <strong>{order.cliente?.nome || '--'}</strong>
          <span>{order.cliente?.email || '--'}</span>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      cell: (order) => <strong className="admin-table-price">{formatCurrency(order.total)}</strong>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (order) => (
        <select
          className="admin-select admin-select-sm"
          value={order.status || 'pendente'}
          onChange={(e) => updateStatus(order.id, e.target.value)}
        >
          {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ),
    },
    {
      key: 'actions',
      header: 'Acoes',
      mobileLabel: 'Acoes',
      cellClassName: 'is-actions',
      cell: (order) => (
        <button
          type="button"
          className="admin-icon-btn"
          onClick={() => setDetailOrder(order)}
          aria-label="Ver detalhes"
        >
          <EyeIcon className="admin-inline-icon" />
        </button>
      ),
    },
  ]

  return (
    <section className="admin-page-section admin-list-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Pedidos</span>
        </div>
      </div>

      <Toolbar
        search={
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, email ou ID..."
            ariaLabel="Buscar pedidos"
          />
        }
        filters={
          <div className="admin-toolbar-filters">
            <select
              className="admin-select admin-select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        }
      />

      <DataTable
        caption="Tabela de pedidos"
        columns={columns}
        rows={filteredOrders}
        loading={loading}
        loadingState="Carregando pedidos..."
        emptyState="Nenhum pedido encontrado."
      />

      {detailOrder && (
        <Modal
          open={Boolean(detailOrder)}
          onClose={() => setDetailOrder(null)}
          title={`Pedido ${detailOrder.id.slice(0, 8)}...`}
          width="large"
        >
          <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--admin-muted)' }}>Cliente</h4>
              <p style={{ margin: 0 }}><strong>{detailOrder.cliente?.nome}</strong></p>
              <p style={{ margin: 0 }}>{detailOrder.cliente?.email} &middot; {detailOrder.cliente?.telefone}</p>
              {detailOrder.cliente?.endereco && (
                <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--admin-muted)' }}>
                  {detailOrder.cliente.endereco.rua}, {detailOrder.cliente.endereco.numero}
                  {detailOrder.cliente.endereco.complemento ? ` — ${detailOrder.cliente.endereco.complemento}` : ''}
                  <br />
                  {detailOrder.cliente.endereco.bairro}, {detailOrder.cliente.endereco.cidade}/{detailOrder.cliente.endereco.estado}
                  <br />
                  CEP: {detailOrder.cliente.endereco.cep}
                </p>
              )}
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--admin-muted)' }}>Itens</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--admin-border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 600 }}>Produto</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Qtd</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600 }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailOrder.itens || []).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                      <td style={{ padding: '8px 0' }}>{item.nome}</td>
                      <td style={{ textAlign: 'center', padding: '8px' }}>{item.quantidade}</td>
                      <td style={{ textAlign: 'right', padding: '8px 0' }}>{formatCurrency(item.preco * item.quantidade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Frete ({detailOrder.frete?.tipo})</span>
                <span>{detailOrder.frete?.valor === 0 ? 'Gratis' : formatCurrency(detailOrder.frete?.valor)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px', paddingTop: '8px', borderTop: '2px solid var(--admin-border-strong)' }}>
                <span>Total</span>
                <span>{formatCurrency(detailOrder.total)}</span>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--admin-muted)' }}>Status</h4>
              <select
                className="admin-select"
                value={detailOrder.status || 'pendente'}
                onChange={(e) => updateStatus(detailOrder.id, e.target.value)}
              >
                {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setDetailOrder(null)}>
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
