import { useEffect, useMemo, useState } from 'react'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRoundedCurrency,
  formatUppercaseText,
} from '../../../shared/formatters.js'
import {
  atualizarMargemProduto,
  processarProdutosImportados,
} from '../../services/custoService.js'
import { salvarImportacaoComProdutos } from '../../services/operacaoService.js'
import { parseXmlImportacao } from '../../services/xmlParser.js'
import { useAdminUI } from '../AdminLayout.jsx'
import DataTable from '../DataTable.jsx'
import Modal from '../Modal.jsx'
import { UploadIcon } from '../AdminIcons.jsx'

function applyMarginOverrides(importacao, overrides) {
  if (!importacao) {
    return null
  }

  const productsWithOverrides = importacao.produtos.map((produto) =>
    overrides[produto.id] !== undefined ? atualizarMargemProduto(produto, overrides[produto.id]) : produto
  )

  const recalculated = processarProdutosImportados(productsWithOverrides, {
    margemGlobal: importacao.margemGlobal,
    freteTotal: importacao.freteTotal,
  })

  return {
    ...importacao,
    produtos: recalculated.produtos,
    resumo: {
      ...recalculated.resumo,
      valorTotalNota: importacao.cabecalho.valorTotalNota || recalculated.resumo.valorTotalNota,
    },
  }
}

export default function ImportXMLModal({ onImported, onClose, open }) {
  const { notify } = useAdminUI()
  const [xmlContent, setXmlContent] = useState('')
  const [xmlFileName, setXmlFileName] = useState('')
  const [dataEntrada, setDataEntrada] = useState(() => new Date().toISOString().slice(0, 10))
  const [margemGlobal, setMargemGlobal] = useState(12)
  const [freteManual, setFreteManual] = useState('')
  const [marginOverrides, setMarginOverrides] = useState({})
  const [parsedImportacao, setParsedImportacao] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setXmlContent('')
      setXmlFileName('')
      setDataEntrada(new Date().toISOString().slice(0, 10))
      setMargemGlobal(12)
      setFreteManual('')
      setMarginOverrides({})
      setParsedImportacao(null)
      setParsing(false)
      setSaving(false)
      setError('')
    }
  }, [open])

  useEffect(() => {
    if (!xmlContent.trim()) {
      setParsedImportacao(null)
      return
    }

    try {
      const parsed = parseXmlImportacao(xmlContent, {
        margemGlobal,
        freteManual,
      })

      setParsedImportacao(applyMarginOverrides(parsed, marginOverrides))
      setError('')
    } catch (parseError) {
      setParsedImportacao(null)
      setError(parseError.message || 'Nao foi possivel interpretar o XML.')
    }
  }, [freteManual, marginOverrides, margemGlobal, xmlContent])

  async function handleFileChange(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      setParsing(true)
      setError('')
      const nextXmlContent = await file.text()

      if (!nextXmlContent.trim()) {
        throw new Error('O arquivo XML selecionado esta vazio.')
      }

      setXmlFileName(file.name)
      setXmlContent(nextXmlContent)
      setMarginOverrides({})
    } catch (fileError) {
      setError(fileError.message || 'Nao foi possivel ler o arquivo XML.')
    } finally {
      setParsing(false)
      event.target.value = ''
    }
  }

  function handleMarginChange(productId, value) {
    setMarginOverrides((current) => ({
      ...current,
      [productId]: value === '' ? 0 : Number(value),
    }))
  }

  async function handleSalvarImportacao() {
    if (!parsedImportacao) {
      return
    }

    setSaving(true)
    setError('')

    try {
      const result = await salvarImportacaoComProdutos(parsedImportacao, {
        dataEntrada,
        margemGlobal,
        xmlFileName,
      })

      notify({
        type: 'success',
        title: 'Importacao concluida',
        description: `${result.updatedProducts} produto(s) atualizados e ${result.createdProducts} criado(s).`,
      })

      onImported?.(result.importacaoId)
      onClose?.()
    } catch (saveError) {
      const description = saveError.message || 'Nao foi possivel salvar a importacao.'
      setError(description)
      notify({
        type: 'error',
        title: 'Falha ao salvar a importacao',
        description,
      })
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'produto',
        header: 'Produto',
        mobileLabel: 'Produto',
        cell: (produto) => (
          <div className="admin-table-copy">
            <strong>{formatUppercaseText(produto.xProd, 'PRODUTO SEM DESCRICAO')}</strong>
            <span className="admin-table-subtitle">
              {`CODIGO ${formatUppercaseText(produto.cProd, '--')} | ${formatUppercaseText(produto.unidade, 'UN')}`}
            </span>
          </div>
        ),
      },
      {
        key: 'fiscal',
        header: 'Fiscal',
        cell: (produto) => (
          <div className="admin-table-stack">
            <strong>NCM {produto.ncm || '--'}</strong>
            <span>{`CEST ${formatUppercaseText(produto.cest, '--')} | CFOP ${formatUppercaseText(produto.cfop, '--')}`}</span>
          </div>
        ),
      },
      {
        key: 'quantidade',
        header: 'Quantidade',
        cell: (produto) => (
          <div className="admin-table-stack">
            <strong>{formatNumber(produto.quantidade)}</strong>
            <span>{`${formatCurrency(produto.valorUnitarioXml)} POR ${formatUppercaseText(produto.unidade, 'UN')}`}</span>
          </div>
        ),
      },
      {
        key: 'custos',
        header: 'Custo real',
        cell: (produto) => (
          <div className="admin-table-stack">
            <strong>{formatCurrency(produto.custoRealUnitario)}</strong>
            <span>{`BASE ${formatCurrency(produto.custoBaseUnitario)} | IPI ${formatCurrency(produto.ipiUnitario)} | FRETE ${formatCurrency(produto.freteUnitario)}`}</span>
          </div>
        ),
      },
      {
        key: 'margem',
        header: 'Margem (%)',
        cell: (produto) => (
          <label className="admin-operacao-inline-input">
            <span className="sr-only">{`Margem do produto ${produto.xProd}`}</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              value={marginOverrides[produto.id] ?? produto.margem}
              onChange={(event) => handleMarginChange(produto.id, event.target.value)}
            />
          </label>
        ),
      },
      {
        key: 'venda',
        header: 'Venda',
        cell: (produto) => (
          <div className="admin-table-stack">
            <strong>{formatRoundedCurrency(produto.valorVenda)}</strong>
            <span>{`${formatCurrency(produto.valorTotalItem)} NO ITEM`}</span>
          </div>
        ),
      },
    ],
    [marginOverrides]
  )

  const summaryCards = useMemo(
    () =>
      parsedImportacao
        ? [
            {
              label: 'Valor total da nota',
              value: formatCurrency(parsedImportacao.cabecalho.valorTotalNota),
            },
            {
              label: 'Total dos produtos',
              value: formatCurrency(parsedImportacao.resumo.valorProdutos),
            },
            {
              label: 'IPI total',
              value: formatCurrency(parsedImportacao.resumo.ipiTotal),
            },
            {
              label: 'Frete total',
              value: formatCurrency(parsedImportacao.resumo.freteTotal),
            },
            {
              label: 'Total investido',
              value: formatCurrency(parsedImportacao.resumo.custoTotal),
            },
            {
              label: 'Venda estimada',
              value: formatRoundedCurrency(parsedImportacao.resumo.vendaTotal),
            },
          ]
        : [],
    [parsedImportacao]
  )

  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title="Importar XML" width="xlarge">
      <div className="admin-form admin-modal-body">
        <div className="admin-upload-row">
          <label className="admin-upload-dropzone">
            <input type="file" accept=".xml,text/xml,application/xml" onChange={handleFileChange} />
            <UploadIcon className="admin-inline-icon" />
            <div className="admin-upload-copy">
              <strong>Upload de XML</strong>
              <p>
                {xmlFileName
                  ? formatUppercaseText(xmlFileName)
                  : 'SELECIONE UM XML DE NF-E PARA LEITURA AUTOMATICA.'}
              </p>
            </div>
          </label>

          <div className="admin-operacao-import-grid">
            <label className="admin-field">
              <span>Data de entrada</span>
              <input
                className="admin-input"
                type="date"
                value={dataEntrada}
                onChange={(event) => setDataEntrada(event.target.value)}
              />
            </label>

            <label className="admin-field">
              <span>Margem padrao (%)</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                value={margemGlobal}
                onChange={(event) => setMargemGlobal(Number(event.target.value))}
              />
            </label>

            <label className="admin-field admin-field-full">
              <span>Frete manual</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                value={freteManual}
                onChange={(event) => setFreteManual(event.target.value)}
                placeholder="Deixe vazio para usar o frete do XML"
              />
            </label>
          </div>
        </div>

        {parsing ? <div className="admin-inline-notice">Lendo XML e calculando custos reais...</div> : null}
        {error ? <div className="admin-inline-notice is-danger">{error}</div> : null}

        {parsedImportacao ? (
          <>
            <div className="admin-duo-grid">
              <article className="admin-surface admin-operacao-detail-card">
                <div className="admin-surface-head">
                  <div>
                    <span className="admin-kicker">Cabecalho</span>
                    <h2>Dados extraidos do XML</h2>
                  </div>
                </div>

                <div className="admin-summary-list">
                  <div>
                    <strong>{formatUppercaseText(parsedImportacao.cabecalho.fornecedor, 'FORNECEDOR NAO INFORMADO')}</strong>
                    <span>Fornecedor</span>
                  </div>
                  <div>
                    <strong>{parsedImportacao.cabecalho.numeroNota || '--'}</strong>
                    <span>Numero da nota</span>
                  </div>
                  <div>
                    <strong>{parsedImportacao.cabecalho.chaveNfe || '--'}</strong>
                    <span>Chave NF-e</span>
                  </div>
                  <div>
                    <strong>{formatDate(parsedImportacao.cabecalho.dataEmissao)}</strong>
                    <span>Data de emissao</span>
                  </div>
                  <div>
                    <strong>{formatDate(dataEntrada)}</strong>
                    <span>Data de entrada</span>
                  </div>
                </div>
              </article>

              <article className="admin-surface admin-operacao-detail-card">
                <div className="admin-surface-head">
                  <div>
                    <span className="admin-kicker">Custos</span>
                    <h2>Resumo financeiro</h2>
                  </div>
                </div>

                <div className="admin-summary-list">
                  {summaryCards.map((item) => (
                    <div key={item.label}>
                      <strong>{item.value}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="admin-operacao-summary-bar">
              <div>
                <strong>{parsedImportacao.resumo.totalItens}</strong>
                <span>ITENS IMPORTADOS</span>
              </div>
              <div>
                <strong>{formatNumber(parsedImportacao.resumo.quantidadeTotal)}</strong>
                <span>QUANTIDADE TOTAL</span>
              </div>
              <div>
                <strong>{formatCurrency(parsedImportacao.resumo.custoTotal)}</strong>
                <span>TOTAL INVESTIDO</span>
              </div>
              <div>
                <strong>{formatNumber(parsedImportacao.resumo.margemMedia)}%</strong>
                <span>MARGEM ESTIMADA</span>
              </div>
            </div>

            <DataTable
              caption="Produtos encontrados no XML"
              columns={columns}
              rows={parsedImportacao.produtos}
              emptyState="Nenhum produto encontrado no XML."
            />
          </>
        ) : null}

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={handleSalvarImportacao}
            disabled={!parsedImportacao || saving || parsing}
          >
            {saving ? 'Salvando...' : 'Salvar importacao'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
