import { formatCurrency, formatDate, formatUppercaseText } from '../../../shared/formatters.js'
import { EyeIcon, TrashIcon } from '../AdminIcons.jsx'
import DataTable from '../DataTable.jsx'

function NotaIdentityCell({ nota, onOpen }) {
  return (
    <button type="button" className="admin-note-link" onClick={() => onOpen?.(nota)}>
      <div className="admin-table-copy">
        <strong>Nota {nota.numeroNota || '--'}</strong>
        <span className="admin-table-subtitle">{formatUppercaseText(nota.chaveNfe, 'CHAVE NF-E NAO INFORMADA.')}</span>

        <div className="admin-table-badges">
          <span className="admin-badge is-live">{nota.totalItens || 0} item(ns)</span>
          {nota.produtosResumo?.[0] ? <span className="admin-badge is-accent">{formatUppercaseText(nota.produtosResumo[0])}</span> : null}
        </div>
      </div>
    </button>
  )
}

export default function NotaList({ deletingNoteId = '', loading, notas, onDeleteNote, onOpenNote }) {
  const columns = [
    {
      key: 'numeroNota',
      header: 'Nota',
      mobileLabel: 'Nota',
      cell: (nota) => <NotaIdentityCell nota={nota} onOpen={onOpenNote} />,
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      cell: (nota) => (
        <div className="admin-table-stack">
          <strong>{formatUppercaseText(nota.fornecedor, 'FORNECEDOR NAO INFORMADO')}</strong>
          <span>{formatUppercaseText(nota.documentoFornecedor, 'DOCUMENTO INDISPONIVEL')}</span>
        </div>
      ),
    },
    {
      key: 'dataEmissao',
      header: 'Emissao',
      cell: (nota) => (
        <div className="admin-table-stack">
          <strong>{formatDate(nota.dataEmissao)}</strong>
          <span>Data fiscal</span>
        </div>
      ),
    },
    {
      key: 'dataEntrada',
      header: 'Entrada',
      cell: (nota) => (
        <div className="admin-table-stack">
          <strong>{formatDate(nota.dataEntrada)}</strong>
          <span>Recebimento</span>
        </div>
      ),
    },
    {
      key: 'valorTotal',
      header: 'Valor total',
      cell: (nota) => <strong className="admin-table-price">{formatCurrency(nota.valorTotal)}</strong>,
    },
    {
      key: 'totalItens',
      header: 'Itens',
      cell: (nota) => (
        <div className="admin-table-stack">
          <strong>{nota.totalItens || 0}</strong>
          <span>{nota.quantidadeTotal || 0} unid.</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Acoes',
      mobileLabel: 'Acoes',
      cellClassName: 'is-actions',
      cell: (nota) => (
        <div className="admin-table-actions">
          <button
            type="button"
            className="admin-icon-btn"
            onClick={() => onOpenNote?.(nota)}
            aria-label={`Abrir detalhe da nota ${nota.numeroNota || ''}`}
            disabled={deletingNoteId === nota.id}
          >
            <EyeIcon className="admin-inline-icon" />
          </button>
          <button
            type="button"
            className="admin-icon-btn is-danger"
            onClick={() => onDeleteNote?.(nota)}
            aria-label={`Excluir entrada da nota ${nota.numeroNota || ''}`}
            disabled={deletingNoteId === nota.id}
          >
            <TrashIcon className="admin-inline-icon" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <DataTable
      caption="Tabela de notas de entrada"
      columns={columns}
      rows={notas}
      loading={loading}
      loadingState="Carregando notas de entrada..."
      emptyState="Nenhuma nota encontrada com os filtros atuais."
    />
  )
}
