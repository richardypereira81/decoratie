import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchIcon, CartIcon } from './StoreIcons.jsx'

function StoreHeader({ search, onSearchChange, cartCount, onCartOpen, onHeightChange }) {
  const [isScrolled, setIsScrolled] = useState(false)
  const headerRef = useRef(null)

  useEffect(() => {
    function syncScrolledState() {
      setIsScrolled(window.scrollY > 8)
    }

    syncScrolledState()
    window.addEventListener('scroll', syncScrolledState, { passive: true })

    return () => window.removeEventListener('scroll', syncScrolledState)
  }, [])

  useLayoutEffect(() => {
    const headerNode = headerRef.current

    if (!headerNode || !onHeightChange) {
      return undefined
    }

    const syncHeight = () => {
      onHeightChange(Math.ceil(headerNode.getBoundingClientRect().height))
    }

    syncHeight()

    let resizeObserver = null

    if (typeof globalThis.ResizeObserver !== 'undefined') {
      resizeObserver = new globalThis.ResizeObserver(syncHeight)
      resizeObserver.observe(headerNode)
    }

    window.addEventListener('resize', syncHeight)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncHeight)
    }
  }, [onHeightChange])

  return (
    <header ref={headerRef} className={`store-header ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="container store-header-shell">
        <div className="store-header-inner">
          <Link to="/" className="store-logo" aria-label="Decoratie - Ir para a loja">
            <img
              src="/Logo - Decoratie-01.png"
              alt="Decoratie"
              className="store-logo-image"
            />
          </Link>

          <div className="store-search store-search-desktop">
            <SearchIcon className="store-search-icon" />
            <input
              type="search"
              placeholder="Buscar produtos, categorias e colecoes"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="store-search-input"
              aria-label="Buscar produtos"
            />
          </div>

          <button
            type="button"
            className="store-cart-btn"
            onClick={onCartOpen}
            aria-controls="store-cart-sidebar"
            aria-label={`Carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`}
          >
            <CartIcon className="store-cart-icon" />
            <span className="store-cart-text">Carrinho</span>
            {cartCount > 0 && <span className="store-cart-badge">{cartCount}</span>}
          </button>
        </div>

        <div className="store-search store-search-mobile">
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
      </div>
    </header>
  )
}

export default memo(StoreHeader)
