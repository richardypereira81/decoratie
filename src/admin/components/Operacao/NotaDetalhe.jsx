import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRoundedCurrency,
  formatUppercaseText,
} from '../../../shared/formatters.js'
import { db } from '../../../lib/firebaseClient.js'
import {
  buildOperacaoFileName,
  exportarDetalheNotaCsv,
  exportarDetalheNotaXlsx,
} from '../../services/operacaoService.js'
import { DownloadIcon } from '../AdminIcons.jsx'
import DataTable from '../DataTable.jsx'
import Modal from '../Modal.jsx'

export default function NotaDetalhe({ nota, onClose, open }) {
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !nota?.id) {
      setItens([])
      setLoading(false)
      setError('')
      return undefined
    }

    setLoading(true)
    setError('')

    const itensQuery = query(collection(db, 'importacoes', nota.id, 'itens'), orderBy('ordem', 'asc'))

    const unsubscribe = onSnapshot(
      itensQuery,
      (snapshot) => {
        setItens(
          snapshot.docs.map((documentSnapshot) => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          }))
        )
        setLoading(false)
      },
      (snapshotError) => {
        setError(snapshotError.message || 'Nao foi possivel carregar os itens da nota.')
        setLoading(false)
      }
    )

    return unsubscribe
  }, [nota?.id, open])

  const columns = useMemo(
    () => [
      {
        key: 'produto',
        header: 'Produto',
        mobileLabel: 'Produto',
        cell: (item) => (
          <div className="admin-table-copy">
            <strong>{formatUppercaseText(item.xProd, 'PRODUTO SEM DESCRICAO')}</strong>
            <span className="admin-table-subtitle">{`CODIGO ${formatUppercaseText(item.cProd, '--')}`}</span>
          </div>
        ),
      },
      {
        key: 'classificacao',
        header: 'Fiscal',
        cell: (item) => (
          <div className="admin-table-stack">
            <strong>NCM {item.ncm || '--'}</strong>
            <span>{`CEST ${formatUppercaseText(item.cest, '--')} | CFOP ${formatUppercaseText(item.cfop, '--')}`}</span>
          </div>
        ),
      },
      {
        key: 'quantidade',
        header: 'Quantidade',
        cell: (item) => (
          <div className="admin-table-stack">
            <strong>{formatNumber(item.quantidade)}</strong>
            <span>{formatUppercaseText(item.unidade, 'UN')}</span>
          </div>
        ),
      },
      {
        key: 'custos',
        header: 'Custos',
        cell: (item) => (
          <div className="admin-table-stack">
            <strong>{formatCurrency(item.custoRealUnitario)}</strong>
            <span>{`BASE ${formatCurrency(item.custoBaseUnitario)} | IPI ${formatCurrency(item.ipiUnitario)} | FRETE ${formatCurrency(item.freteUnitario)}`}</span>
          </div>
        ),
      },
      {
        key: 'valorVenda',
        header: 'Venda',
        cell: (item) => (
          <div className="admin-table-stack">
            <strong>{formatRoundedCurrency(item.valorVenda)}</strong>
            <span>{`${formatNumber(item.margem)}% DE MARGEM`}</span>
          </div>
        ),
      },
    ],
    []
  )

  if (!nota) {
    return null
  }

  const filePrefix = buildOperacaoFileName(`nota-${nota.numeroNota || nota.id}`)

  return (
    <Modal open={open} onClose={onClose} title={`Nota ${nota.numeroNota || '--'}`} width="large">
      <div className="admin-form admin-modal-body">
        <div className="admin-duo-grid">
          <article className="admin-surface admin-operacao-detail-card">
            <div className="admin-surface-head">
              <div>
                <span className="admin-kicker">Documento</span>
                <h2>Cabecalho da nota</h2>
              </div>
            </div>

            <div className="admin-summary-list">
              <div>
                <strong>{formatUppercaseText(nota.fornecedor, 'FORNECEDOR NAO INFORMADO')}</strong>
                <span>Fornecedor</span>
              </div>
              <div>
                <strong>{nota.numeroNota || '--'}</strong>
                <span>Numero da nota</span>
              </div>
              <div>
                <strong>{nota.chaveNfe || '--'}</strong>
                <span>Chave NF-e</span>
              </div>
              <div>
                <strong>{formatDate(nota.dataEmissao)}</strong>
                <span>Data de emissao</span>
              </div>
              <div>
                <strong>{formatDate(nota.dataEntrada)}</strong>
                <span>Data de entrada</span>
              </div>
            </div>
          </article>

          <article className="admin-surface admin-operacao-detail-card">
            <div className="admin-surface-head">
              <div>
                <span className="admin-kicker">Financeiro</span>
                <h2>Resumo da importacao</h2>
              </div>
            </div>

            <div className="admin-summary-list">
              <div>
                <strong>{formatCurrency(nota.valorTotal)}</strong>
                <span>Valor total da nota</span>
              </div>
              <div>
                <strong>{formatCurrency(nota.custoTotal)}</strong>
                <span>Total investido</span>
              </div>
              <div>
                <strong>{formatRoundedCurrency(nota.vendaTotal)}</strong>
                <span>Venda estimada</span>
              </div>
              <div>
                <strong>{formatCurrency(nota.freteTotal)}</strong>
                <span>Frete total</span>
              </div>
              <div>
                <strong>{formatCurrency(nota.ipiTotal)}</strong>
                <span>IPI total</span>
              </div>
              <div>
                <strong>{formatNumber(nota.margemMedia)}%</strong>
                <span>Margem estimada</span>
              </div>
            </div>
          </article>
        </div>

        {error ? <div className="admin-inline-notice is-danger">{error}</div> : null}

        <div className="admin-inline-actions">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => exportarDetalheNotaCsv(nota, itens, `${filePrefix}.csv`)}
            disabled={loading || !itens.length}
          >
            <DownloadIcon className="admin-inline-icon" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => exportarDetalheNotaXlsx(nota, itens, `${filePrefix}.xlsx`)}
            disabled={loading || !itens.length}
          >
            <DownloadIcon className="admin-inline-icon" />
            <span>Exportar XLSX</span>
          </button>
        </div>

        <DataTable
          caption="Itens da nota"
          columns={columns}
          rows={itens}
          loading={loading}
          loadingState="Carregando itens da nota..."
          emptyState="Nenhum item encontrado para esta nota."
        />
      </div>
    </Modal>
  )
}
