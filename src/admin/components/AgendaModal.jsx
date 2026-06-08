import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import {
  AGENDA_STATUS_OPTIONS,
  AGENDA_TYPES,
  getOrderCode,
  getOrderLabel,
} from '../services/agendaService.js'

const emptyForm = {
  tipo: 'retirada',
  titulo: '',
  clienteNome: '',
  clienteTelefone: '',
  clienteEmail: '',
  pedidoId: '',
  pedidoNumero: '',
  data: '',
  horaInicio: '',
  horaFim: '',
  observacoes: '',
  enderecoTexto: '',
  status: 'agendado',
}

function getOrderCustomer(order) {
  return {
    clienteNome: order?.cliente?.nome || '',
    clienteTelefone: order?.cliente?.telefone || '',
    clienteEmail: order?.cliente?.email || '',
  }
}

export default function AgendaModal({
  agenda,
  mode = 'edit',
  onClose,
  onSave,
  open,
  orders = [],
  saving = false,
}) {
  const readOnly = mode === 'view'
  const editing = Boolean(agenda?.id)
  const linkedFromOrder = agenda?.origem === 'pedido'
  const [form, setForm] = useState(emptyForm)

  const orderOptions = useMemo(
    () => [...orders]
      .filter((order) => order?.id)
      .sort((first, second) => Number(second.orderNumber || 0) - Number(first.orderNumber || 0)),
    [orders],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    setForm({
      ...emptyForm,
      ...agenda,
      pedidoId: agenda?.pedidoId || '',
      pedidoNumero: agenda?.pedidoNumero || '',
      horaFim: agenda?.horaFim || '',
      enderecoTexto: agenda?.endereco?.texto || agenda?.enderecoTexto || '',
      status: agenda?.status || 'agendado',
    })
  }, [agenda, open])

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateOrder(value) {
    const selectedOrder = orderOptions.find((order) => order.id === value)

    setForm((current) => ({
      ...current,
      pedidoId: value,
      pedidoNumero: selectedOrder ? getOrderCode(selectedOrder) : '',
      ...getOrderCustomer(selectedOrder),
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSave?.(form)
  }

  const title = readOnly
    ? 'Detalhes do agendamento'
    : editing
      ? 'Editar agendamento'
      : 'Novo agendamento'

  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title={title} width="large">
      <form className="admin-form admin-modal-body admin-agenda-modal-form" onSubmit={handleSubmit}>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Tipo do agendamento</span>
            <select
              className="admin-select"
              value={form.tipo}
              onChange={(event) => updateField('tipo', event.target.value)}
              disabled={readOnly || linkedFromOrder}
              required
            >
              {AGENDA_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>Status</span>
            <select
              className="admin-select"
              value={form.status}
              onChange={(event) => updateField('status', event.target.value)}
              disabled={readOnly}
              required
            >
              {AGENDA_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field admin-field-full">
            <span>Titulo</span>
            <input
              className="admin-input"
              value={form.titulo}
              onChange={(event) => updateField('titulo', event.target.value)}
              placeholder="Ex.: Retirada - Pedido #123"
              disabled={readOnly}
              required
            />
          </label>

          <label className="admin-field">
            <span>Cliente/nome</span>
            <input
              className="admin-input"
              value={form.clienteNome}
              onChange={(event) => updateField('clienteNome', event.target.value)}
              disabled={readOnly}
            />
          </label>

          <label className="admin-field">
            <span>Telefone</span>
            <input
              className="admin-input"
              value={form.clienteTelefone}
              onChange={(event) => updateField('clienteTelefone', event.target.value)}
              disabled={readOnly}
            />
          </label>

          <label className="admin-field admin-field-full">
            <span>E-mail</span>
            <input
              className="admin-input"
              type="email"
              value={form.clienteEmail}
              onChange={(event) => updateField('clienteEmail', event.target.value)}
              disabled={readOnly}
            />
          </label>

          <label className="admin-field">
            <span>Data</span>
            <input
              className="admin-input"
              type="date"
              value={form.data}
              onChange={(event) => updateField('data', event.target.value)}
              disabled={readOnly}
              required
            />
          </label>

          <label className="admin-field">
            <span>Hora inicial</span>
            <input
              className="admin-input"
              type="time"
              value={form.horaInicio}
              onChange={(event) => updateField('horaInicio', event.target.value)}
              disabled={readOnly}
              required
            />
          </label>

          <label className="admin-field">
            <span>Hora final</span>
            <input
              className="admin-input"
              type="time"
              value={form.horaFim}
              onChange={(event) => updateField('horaFim', event.target.value)}
              disabled={readOnly}
            />
          </label>

          <label className="admin-field">
            <span>Pedido vinculado</span>
            <select
              className="admin-select"
              value={form.pedidoId}
              onChange={(event) => updateOrder(event.target.value)}
              disabled={readOnly || linkedFromOrder}
            >
              <option value="">Sem pedido vinculado</option>
              {orderOptions.map((order) => (
                <option key={order.id} value={order.id}>
                  {getOrderLabel(order)} - {order.cliente?.nome || 'Cliente'}
                </option>
              ))}
            </select>
          </label>

          {form.tipo === 'entrega' ? (
            <label className="admin-field admin-field-full">
              <span>Endereco</span>
              <input
                className="admin-input"
                value={form.enderecoTexto}
                onChange={(event) => updateField('enderecoTexto', event.target.value)}
                disabled={readOnly}
              />
            </label>
          ) : null}

          <label className="admin-field admin-field-full">
            <span>Observacoes</span>
            <textarea
              className="admin-textarea"
              value={form.observacoes}
              onChange={(event) => updateField('observacoes', event.target.value)}
              rows="4"
              disabled={readOnly}
            />
          </label>
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={saving}>
            {readOnly ? 'Fechar' : 'Cancelar'}
          </button>
          {!readOnly ? (
            <button type="submit" className="admin-btn" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar agendamento'}
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  )
}
