import { ChevronDownIcon, FilterIcon } from './AdminIcons.jsx'
import ToolbarDropdown from './ToolbarDropdown.jsx'

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function FiltrosProdutos({
  activeCount = 0,
  categories = [],
  filters,
  onChange,
  onClear,
  sectors = [],
}) {
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
        <section className="admin-filter-section">
          <div className="admin-filter-section-head">
            <strong>Status</strong>
            <span>Catalogo</span>
          </div>

          <div className="admin-filter-options">
            <button
              type="button"
              className={joinClassNames('admin-filter-chip', filters.status === 'all' ? 'is-selected' : '')}
              onClick={() => updateField('status', 'all')}
            >
              <span>Todos</span>
            </button>
            <button
              type="button"
              className={joinClassNames('admin-filter-chip', filters.status === 'active' ? 'is-selected' : '')}
              onClick={() => updateField('status', 'active')}
            >
              <span>Ativos</span>
            </button>
            <button
              type="button"
              className={joinClassNames('admin-filter-chip', filters.status === 'inactive' ? 'is-selected' : '')}
              onClick={() => updateField('status', 'inactive')}
            >
              <span>Inativos</span>
            </button>
          </div>
        </section>

        <section className="admin-filter-section">
          <div className="admin-filter-section-head">
            <strong>Destaque</strong>
            <span>Exibicao</span>
          </div>

          <div className="admin-filter-options">
            <button
              type="button"
              className={joinClassNames('admin-filter-chip', filters.featured === 'all' ? 'is-selected' : '')}
              onClick={() => updateField('featured', 'all')}
            >
              <span>Todos</span>
            </button>
            <button
              type="button"
              className={joinClassNames('admin-filter-chip', filters.featured === 'featured' ? 'is-selected' : '')}
              onClick={() => updateField('featured', 'featured')}
            >
              <span>Em destaque</span>
            </button>
            <button
              type="button"
              className={joinClassNames('admin-filter-chip', filters.featured === 'regular' ? 'is-selected' : '')}
              onClick={() => updateField('featured', 'regular')}
            >
              <span>Regulares</span>
            </button>
          </div>
        </section>

        {categories.length ? (
          <section className="admin-filter-section">
            <div className="admin-filter-section-head">
              <strong>Categoria</strong>
              <span>Classificacao</span>
            </div>

            <div className="admin-filter-options">
              <button
                type="button"
                className={joinClassNames('admin-filter-chip', filters.category === 'all' ? 'is-selected' : '')}
                onClick={() => updateField('category', 'all')}
              >
                <span>Todas</span>
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={joinClassNames('admin-filter-chip', filters.category === category ? 'is-selected' : '')}
                  onClick={() => updateField('category', category)}
                >
                  <span>{category}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {sectors.length ? (
          <section className="admin-filter-section">
            <div className="admin-filter-section-head">
              <strong>Setor</strong>
              <span>Segmento</span>
            </div>

            <div className="admin-filter-options">
              <button
                type="button"
                className={joinClassNames('admin-filter-chip', filters.sector === 'all' ? 'is-selected' : '')}
                onClick={() => updateField('sector', 'all')}
              >
                <span>Todos</span>
              </button>
              {sectors.map((sector) => (
                <button
                  key={sector}
                  type="button"
                  className={joinClassNames('admin-filter-chip', filters.sector === sector ? 'is-selected' : '')}
                  onClick={() => updateField('sector', sector)}
                >
                  <span>{sector}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="admin-filter-section">
          <div className="admin-filter-section-head">
            <strong>Compra</strong>
            <span>Ultima entrada</span>
          </div>

          <div className="admin-operacao-filter-grid">
            <label className="admin-field admin-field-full">
              <span>Numero da nota</span>
              <input
                className="admin-input"
                value={filters.numeroNota}
                onChange={(event) => updateField('numeroNota', event.target.value)}
                placeholder="Ex.: 290914"
              />
            </label>

            <label className="admin-field">
              <span>Data de entrada de</span>
              <input
                className="admin-input"
                type="date"
                value={filters.dataEntradaDe}
                onChange={(event) => updateField('dataEntradaDe', event.target.value)}
              />
            </label>

            <label className="admin-field">
              <span>Data de entrada ate</span>
              <input
                className="admin-input"
                type="date"
                value={filters.dataEntradaAte}
                onChange={(event) => updateField('dataEntradaAte', event.target.value)}
              />
            </label>
          </div>
        </section>

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
