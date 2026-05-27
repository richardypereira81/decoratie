import { useDeferredValue, useMemo, useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { formatCurrency, formatDateTime, getDateValue } from '../../shared/formatters.js'
import { consultMercadoPagoPayment } from '../../shared/paymentApi.js'
import { useCollectionData } from '../hooks/useFirestoreData.js'
import { useAuthSession } from '../AuthContext.jsx'
import { useAdminUI } from '../components/AdminLayout.jsx'
import SearchInput from '../components/SearchInput.jsx'
import Toolbar from '../components/Toolbar.jsx'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import { EyeIcon } from '../components/AdminIcons.jsx'

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

function getFreteLabel(frete) {
  if (!frete) {
    return 'Sem frete'
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
    return digits
      .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }

  if (digits.length === 14) {
    return digits
      .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
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

function getPagamentoParcelasLabel(pagamento) {
  const installments = Number(pagamento?.installments || 1)
  const installmentAmount = Number(pagamento?.installmentAmount || 0)

  if (installments > 1 && installmentAmount > 0) {
    return `${installments}x de ${formatCurrency(installmentAmount)}`
  }

  return `${installments}x`
}

export default function OrdersPage() {
  const { data: orders, loading } = useCollectionData('pedidos')
  const { notify } = useAdminUI()
  const { user } = useAuthSession()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailOrder, setDetailOrder] = useState(null)
  const [consultingPayment, setConsultingPayment] = useState(false)
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
            getFreteLabel(order.frete),
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
      key: 'frete',
      header: 'Frete',
      cell: (order) => (
        <div className="admin-table-stack">
          <strong>{getFreteLabel(order.frete)}</strong>
          <span>{getFretePrazo(order.frete)}</span>
        </div>
      ),
    },
    {
      key: 'pagamento',
      header: 'Pagamento',
      cell: (order) => (
        <div className="admin-table-stack">
          <strong>{getPagamentoMetodoLabel(order.pagamento)}</strong>
          <span>{getPagamentoStatusLabel(order.pagamento)}</span>
        </div>
      ),
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
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--admin-muted)' }}>
                {detailOrder.cliente?.tipoDocumento === 'cnpj' ? 'CNPJ' : 'CPF/CNPJ'}: {formatDocumentoCliente(detailOrder.cliente)}
              </p>
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
                <span>Frete ({getFreteLabel(detailOrder.frete)})</span>
                <span>{detailOrder.frete?.valor === 0 ? 'Gratis' : formatCurrency(detailOrder.frete?.valor)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Prazo</span>
                <span>{getFretePrazo(detailOrder.frete)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>CEP destino</span>
                <span>{detailOrder.frete?.cepDestino || detailOrder.cliente?.endereco?.cep || '--'}</span>
              </div>
              {detailOrder.frete?.provider === 'melhor_envio' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Servico</span>
                    <span>{detailOrder.frete.servicoId || '--'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Valor original</span>
                    <span>{formatCurrency(detailOrder.frete.valorOriginal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Prazo transportadora</span>
                    <span>{getFretePrazoOriginal(detailOrder.frete)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Separacao/embalagem</span>
                    <span>{detailOrder.frete.diasExtrasPreparacao || 0} dias</span>
                  </div>
                  <div className="admin-inline-notice">
                    Estrutura pronta para futura geracao de etiqueta do Melhor Envio.
                  </div>
                </>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px', paddingTop: '8px', borderTop: '2px solid var(--admin-border-strong)' }}>
                <span>Total</span>
                <span>{formatCurrency(detailOrder.total)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--admin-muted)' }}>Pagamento</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Metodo</span>
                <span>{getPagamentoMetodoLabel(detailOrder.pagamento)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Status</span>
                <span>{getPagamentoStatusLabel(detailOrder.pagamento)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Payment ID</span>
                <span>{detailOrder.pagamento?.paymentId || '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Valor</span>
                <span>{formatCurrency(detailOrder.pagamento?.valor || 0)}</span>
              </div>
              {detailOrder.pagamento?.metodo === 'credit_card' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Parcelas</span>
                    <span>{getPagamentoParcelasLabel(detailOrder.pagamento)}</span>
                  </div>
                  {detailOrder.pagamento.totalPaidAmount ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total pago</span>
                      <span>{formatCurrency(detailOrder.pagamento.totalPaidAmount)}</span>
                    </div>
                  ) : null}
                  {detailOrder.pagamento.installmentAmount ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Valor da parcela</span>
                      <span>{formatCurrency(detailOrder.pagamento.installmentAmount)}</span>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Metodo MP</span>
                    <span>{detailOrder.pagamento.paymentMethodId || '--'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cartao</span>
                    <span>
                      {[detailOrder.pagamento.cardBrand, detailOrder.pagamento.lastFourDigits && `final ${detailOrder.pagamento.lastFourDigits}`]
                        .filter(Boolean)
                        .join(' ') || '--'}
                    </span>
                  </div>
                </>
              ) : null}
              {detailOrder.pagamento?.metodo === 'debit_card' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cartao</span>
                  <span>
                    {[detailOrder.pagamento.cardBrand, detailOrder.pagamento.lastFourDigits && `final ${detailOrder.pagamento.lastFourDigits}`]
                      .filter(Boolean)
                      .join(' ') || '--'}
                  </span>
                </div>
              ) : null}
              {detailOrder.pagamento?.metodo === 'pix' && detailOrder.pagamento?.copiaECola ? (
                <div className="admin-inline-notice">
                  Pix pendente com codigo copia e cola salvo no pedido.
                </div>
              ) : null}
              {detailOrder.pagamento?.eventos?.length ? (
                <div className="admin-inline-notice">
                  Historico: {detailOrder.pagamento.eventos.length} evento(s) registrado(s).
                </div>
              ) : null}
              {detailOrder.pagamento?.provider === 'mercado_pago' ? (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => handleConsultPayment(detailOrder.id)}
                  disabled={consultingPayment || !detailOrder.pagamento?.paymentId}
                >
                  {consultingPayment ? 'Consultando...' : 'Consultar status no Mercado Pago'}
                </button>
              ) : null}
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
