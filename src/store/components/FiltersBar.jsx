import { memo, useEffect, useState } from 'react'
import { CloseIcon, FilterIcon } from './StoreIcons.jsx'

function FiltersBar({
  categories,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  onClear,
  open,
  onOpenChange,
  activeCount,
}) {
  const [draftCategory, setDraftCategory] = useState(category)
  const [draftSort, setDraftSort] = useState(sort)

  useEffect(() => {
    setDraftCategory(category)
    setDraftSort(sort)
  }, [category, sort, open])

  useEffect(() => {
    if (!open) return undefined

    function handleResize() {
      if (window.innerWidth >= 768) {
        onOpenChange(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [open, onOpenChange])

  function handleApply() {
    onCategoryChange(draftCategory)
    onSortChange(draftSort)
    onOpenChange(false)
  }

  function handleReset() {
    setDraftCategory('all')
    setDraftSort('default')
  }

  return (
    <>
      <div className="store-filters-mobile">
        <button
          type="button"
          className="store-filters-trigger"
          onClick={() => onOpenChange(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className="store-filters-trigger-copy">
            <FilterIcon className="store-filters-trigger-icon" />
            Filtros e ordenacao
          </span>
          {activeCount > 0 && <span className="store-filters-trigger-count">{activeCount}</span>}
        </button>

        {activeCount > 0 && (
          <button type="button" className="store-filters-link" onClick={onClear}>
            Limpar
          </button>
        )}
      </div>

      <div className="store-filters store-filters-desktop">
        <div className="store-filters-group">
          <label className="store-filter-label" htmlFor="store-category">Categoria</label>
          <select
            id="store-category"
            className="store-select"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="all">Todas</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="store-filters-group">
          <label className="store-filter-label" htmlFor="store-sort">Ordenar</label>
          <select
            id="store-sort"
            className="store-select"
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
          >
            <option value="default">Relevancia</option>
            <option value="price-asc">Menor preco</option>
            <option value="price-desc">Maior preco</option>
            <option value="recent">Mais recentes</option>
          </select>
        </div>

        {activeCount > 0 && (
          <button type="button" className="store-filters-link" onClick={onClear}>
            Limpar filtros
          </button>
        )}
      </div>

      <div
        className={`store-sheet-backdrop ${open ? 'is-visible' : ''}`}
        onClick={() => onOpenChange(false)}
        aria-hidden={!open}
      />

      <section
        className={`store-filters-sheet ${open ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Filtros e ordenacao"
      >
        <div className="store-filters-sheet-handle" />

        <div className="store-filters-sheet-header">
          <div>
            <p className="store-filters-sheet-eyebrow">Navegacao da vitrine</p>
            <h3 className="store-filters-sheet-title">Filtros e ordenacao</h3>
          </div>

          <button
            type="button"
            className="store-filters-sheet-close"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar filtros"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="store-filters-sheet-body">
          <div className="store-filters-group store-filters-group-stack">
            <label className="store-filter-label" htmlFor="store-category-mobile">Categoria</label>
            <select
              id="store-category-mobile"
              className="store-select"
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
            >
              <option value="all">Todas</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="store-filters-group store-filters-group-stack">
            <label className="store-filter-label" htmlFor="store-sort-mobile">Ordenar</label>
            <select
              id="store-sort-mobile"
              className="store-select"
              value={draftSort}
              onChange={(e) => setDraftSort(e.target.value)}
            >
              <option value="default">Relevancia</option>
              <option value="price-asc">Menor preco</option>
              <option value="price-desc">Maior preco</option>
              <option value="recent">Mais recentes</option>
            </select>
          </div>
        </div>

        <div className="store-filters-sheet-footer">
          <button type="button" className="store-btn store-btn-secondary store-btn-block" onClick={handleReset}>
            Limpar selecao
          </button>
          <button type="button" className="store-btn store-btn-primary store-btn-block" onClick={handleApply}>
            Aplicar filtros
          </button>
        </div>
      </section>
    </>
  )
}

export default memo(FiltersBar)
