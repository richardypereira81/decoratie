import {
  formatDateInputLabel,
  getAgendaStatusClass,
  getAgendaStatusLabel,
  getAgendaTypeLabel,
  isAgendaToday,
} from '../services/agendaService.js'

export default function AgendaCard({
  agenda,
  onCancel,
  onComplete,
  onConfirm,
  onDelete,
  onEdit,
  onView,
}) {
  const canDelete = agenda.origem !== 'pedido'
  const isDone = agenda.status === 'concluido'
  const isCanceled = agenda.status === 'cancelado'

  return (
    <article className={`admin-agenda-card ${isAgendaToday(agenda) ? 'is-today' : ''}`}>
      <div className="admin-agenda-card-head">
        <div>
          <span className="admin-kicker">{getAgendaTypeLabel(agenda.tipo)}</span>
          <h2>{agenda.titulo || 'Agendamento sem titulo'}</h2>
        </div>

        <span className={`admin-payment-tag ${getAgendaStatusClass(agenda.status)}`}>
          {getAgendaStatusLabel(agenda.status)}
        </span>
      </div>

      <div className="admin-agenda-card-grid">
        <div>
          <span>Data</span>
          <strong>{formatDateInputLabel(agenda.data) || '--'}</strong>
        </div>
        <div>
          <span>Horario</span>
          <strong>{[agenda.horaInicio, agenda.horaFim].filter(Boolean).join(' - ') || '--'}</strong>
        </div>
        <div>
          <span>Cliente</span>
          <strong>{agenda.clienteNome || '--'}</strong>
        </div>
        <div>
          <span>Pedido</span>
          <strong>{agenda.pedidoNumero ? `Pedido ${agenda.pedidoNumero}` : '--'}</strong>
        </div>
      </div>

      {agenda.observacoes ? (
        <p className="admin-agenda-card-note">{agenda.observacoes}</p>
      ) : null}

      <div className="admin-agenda-card-actions">
        <button type="button" className="admin-btn-secondary" onClick={() => onView(agenda)}>
          Detalhes
        </button>
        <button type="button" className="admin-btn-secondary" onClick={() => onEdit(agenda)} disabled={isDone}>
          Editar
        </button>
        {!isCanceled && agenda.status === 'agendado' ? (
          <button type="button" className="admin-btn-secondary" onClick={() => onConfirm(agenda)}>
            Confirmar
          </button>
        ) : null}
        {!isCanceled && !isDone ? (
          <button type="button" className="admin-btn-secondary" onClick={() => onComplete(agenda)}>
            Concluir
          </button>
        ) : null}
        {!isCanceled && !isDone ? (
          <button type="button" className="admin-btn-danger" onClick={() => onCancel(agenda)}>
            Cancelar
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" className="admin-btn-danger" onClick={() => onDelete(agenda)}>
            Excluir
          </button>
        ) : null}
      </div>
    </article>
  )
}
