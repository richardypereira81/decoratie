import { memo } from 'react'
import { Link } from 'react-router-dom'
import { CartIcon, CloseIcon, MessageCircleIcon, SearchIcon } from './StoreIcons.jsx'

function FiltersBar({
  categories,
  cartCount,
  category,
  mobileOpen,
  onCartOpen,
  onCategoryChange,
  onMobileClose,
  sort,
  onSortChange,
  search,
  onSearchChange,
  onClear,
  activeCount,
  whatsappUrl,
}) {
  const visibleCategories = categories.filter(Boolean)

  function handleCategorySelect(value) {
    onCategoryChange(value)
    onMobileClose?.()
  }

  function handleCartOpen() {
    onMobileClose?.()
    onCartOpen?.()
  }

  function handleSortSelect(value) {
    onSortChange(value)
    onMobileClose?.()
  }

  function handleWhatsAppClick() {
    onMobileClose?.()
  }

  return (
    <aside className="store-filter-sidebar" aria-label="Filtros da vitrine">
      {mobileOpen && (
        <button
          type="button"
          className="store-filter-backdrop"
          aria-label="Fechar menu"
          onClick={onMobileClose}
        />
      )}

      <div
        id="store-filter-panel"
        className={`store-filter-panel ${mobileOpen ? 'is-open' : ''}`}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? 'true' : undefined}
      >
        <div className="store-filter-panel-head">
          <Link to="/" className="store-filter-logo" aria-label="Decoratie - Ir para a loja">
            <img src="/Logo - Decoratie-01.png" alt="Decoratie" />
          </Link>
          <button
            type="button"
            className="store-filter-close"
            aria-label="Fechar menu"
            onClick={onMobileClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="store-filter-mobile-tools">
          <div className="store-search store-filter-search">
            <SearchIcon className="store-search-icon" />
            <input
              type="search"
              placeholder="Buscar produtos"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="store-search-input"
              aria-label="Buscar produtos"
            />
          </div>

          <button type="button" className="store-filter-cart-link" onClick={handleCartOpen}>
            <CartIcon className="store-cart-icon" />
            <span>Carrinho</span>
            {cartCount > 0 && <strong>{cartCount}</strong>}
          </button>
        </div>

        <div className="store-filter-group">
          <div className="store-filter-heading">
            <h2>Categorias</h2>
            {activeCount > 0 && (
              <button type="button" className="store-filters-link" onClick={onClear}>
                Limpar
              </button>
            )}
          </div>

          <div className="store-filter-category-list" aria-label="Categorias de produtos">
            <button
              type="button"
              className={`store-filter-category ${category === 'all' ? 'is-active' : ''}`}
              onClick={() => handleCategorySelect('all')}
            >
              Ver todos
            </button>

            {visibleCategories.map((cat) => (
              <button
                type="button"
                key={cat}
                className={`store-filter-category ${category === cat ? 'is-active' : ''}`}
                onClick={() => handleCategorySelect(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="store-filter-group">
          <label className="store-filter-label" htmlFor="store-sort">Ordenar</label>
          <select
            id="store-sort"
            className="store-select store-sort-select"
            value={sort}
            onChange={(e) => handleSortSelect(e.target.value)}
          >
            <option value="default">Relevancia</option>
            <option value="price-asc">Menor preco</option>
            <option value="price-desc">Maior preco</option>
            <option value="recent">Mais recentes</option>
          </select>
        </div>

        {whatsappUrl ? (
          <div className="store-filter-contact">
            <a
              className="store-filter-whatsapp"
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              onClick={handleWhatsAppClick}
            >
              <MessageCircleIcon />
              <span>Falar no WhatsApp</span>
            </a>
          </div>
        ) : null}
      </div>
    </aside>
  )
}

export default memo(FiltersBar)
