import { useId } from 'react'
import { ChevronDownIcon, FilterIcon } from '../AdminIcons.jsx'
import ToolbarDropdown from '../ToolbarDropdown.jsx'

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function FiltrosOperacao({
  activeCount = 0,
  filters,
  fornecedores = [],
  onChange,
  onClear,
}) {
  const suppliersId = useId()

  function updateField(field, value) {
    onChange?.({
      ...filters,
      [field]: value,
    })
  }

  return (
    <ToolbarDropdown
      className="admin-toolbar-control"
      panelClassName="admin-filter-popover admin-operacao-filter-popover"
      renderButton={({ open, panelId, toggle }) => (
        <button
          type="button"
          className={joinClassNames('admin-toolbar-trigger', open ? 'is-active' : '')}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="dialog"
        >
          <FilterIcon className="admin-inline-icon" />
          <span>Filtros</span>
          {activeCount ? <span className="admin-toolbar-count">{activeCount}</span> : null}
          <ChevronDownIcon className="admin-inline-icon admin-toolbar-chevron" />
        </button>
      )}
    >
      <div className="admin-filter-panel">
        <div className="admin-filter-section">
          <div className="admin-filter-section-head">
            <strong>Data de entrada</strong>
            <span>Periodo de recebimento</span>
          </div>

          <div className="admin-operacao-filter-grid">
            <label className="admin-field">
              <span>De</span>
              <input
                className="admin-input"
                type="date"
                value={filters.dataEntradaDe}
                onChange={(event) => updateField('dataEntradaDe', event.target.value)}
              />
            </label>

            <label className="admin-field">
              <span>Ate</span>
              <input
                className="admin-input"
                type="date"
                value={filters.dataEntradaAte}
                onChange={(event) => updateField('dataEntradaAte', event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="admin-filter-section">
          <div className="admin-filter-section-head">
            <strong>Data de emissao</strong>
            <span>Periodo fiscal</span>
          </div>

          <div className="admin-operacao-filter-grid">
            <label className="admin-field">
              <span>De</span>
              <input
                className="admin-input"
                type="date"
                value={filters.dataEmissaoDe}
                onChange={(event) => updateField('dataEmissaoDe', event.target.value)}
              />
            </label>

            <label className="admin-field">
              <span>Ate</span>
              <input
                className="admin-input"
                type="date"
                value={filters.dataEmissaoAte}
                onChange={(event) => updateField('dataEmissaoAte', event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="admin-filter-section">
          <div className="admin-filter-section-head">
            <strong>Fornecedor</strong>
            <span>Select ou autocomplete</span>
          </div>

          <label className="admin-field">
            <span>Fornecedor</span>
            <input
              className="admin-input"
              list={suppliersId}
              value={filters.fornecedor}
              onChange={(event) => updateField('fornecedor', event.target.value)}
              placeholder="Digite para localizar um fornecedor"
            />
            <datalist id={suppliersId}>
              {fornecedores.map((fornecedor) => (
                <option key={fornecedor} value={fornecedor} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="admin-filter-section">
          <div className="admin-filter-section-head">
            <strong>Documento</strong>
            <span>Campos da NF-e</span>
          </div>

          <div className="admin-operacao-filter-grid">
            <label className="admin-field">
              <span>Numero da nota</span>
              <input
                className="admin-input"
                value={filters.numeroNota}
                onChange={(event) => updateField('numeroNota', event.target.value)}
                placeholder="Ex.: 24581"
              />
            </label>

            <label className="admin-field">
              <span>Chave NF-e</span>
              <input
                className="admin-input"
                value={filters.chaveNfe}
                onChange={(event) => updateField('chaveNfe', event.target.value)}
                placeholder="44 digitos"
              />
            </label>
          </div>
        </div>

        {activeCount ? (
          <div className="admin-filter-footer">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={onClear}>
              Limpar filtros
            </button>
          </div>
        ) : null}
      </div>
    </ToolbarDropdown>
  )
}
