import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCart } from '../hooks/useCart.js'
import { useProducts } from '../hooks/useProducts.js'
import { useStoreSettings } from '../hooks/useStoreSettings.js'
import { getWhatsAppUrlFromSettings } from '../../shared/whatsapp.js'
import StoreHeader from '../components/StoreHeader.jsx'
import FiltersBar from '../components/FiltersBar.jsx'
import ProductGrid from '../components/ProductGrid.jsx'
import CartSidebar from '../components/CartSidebar.jsx'
import StoreFooter from '../components/StoreFooter.jsx'
import NotifyModal from '../components/NotifyModal.jsx'
import ProductModal from '../components/ProductModal.jsx'
import '../store.css'

function buildProductShareUrl(productId) {
  const url = new URL(window.location.href)
  url.pathname = '/'
  url.searchParams.set('produto', productId)
  return url.toString()
}

const PRODUCTS_PER_PAGE = 8

function buildPaginationItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set([1, totalPages, currentPage])

  if (currentPage > 2) {
    pages.add(currentPage - 1)
  }

  if (currentPage < totalPages - 1) {
    pages.add(currentPage + 1)
  }

  const sortedPages = [...pages].sort((first, second) => first - second)
  const items = []

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1]

    if (previousPage && page - previousPage > 1) {
      items.push(`gap-${previousPage}-${page}`)
    }

    items.push(page)
  })

  return items
}

export default function StorePage() {
  const [urlSearchParams, setUrlSearchParams] = useSearchParams()
  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    replaceItems,
    totalItems,
    totalPrice,
  } = useCart()
  const { data: storeSettings } = useStoreSettings()
  const {
    products,
    filteredProducts,
    categories,
    loading,
    search,
    setSearch,
    category,
    setCategory,
    sort,
    setSort,
  } = useProducts()

  const [cartOpen, setCartOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [addedItemName, setAddedItemName] = useState('')
  const [headerHeight, setHeaderHeight] = useState(92)
  const [activeProduct, setActiveProduct] = useState(null)
  const [notifyProduct, setNotifyProduct] = useState(null)
  const [selectedQuantity, setSelectedQuantity] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const productsSectionRef = useRef(null)
  const sharedProductId = urlSearchParams.get('produto')

  useEffect(() => {
    document.title = 'Decoratie - Loja'
  }, [])

  useEffect(() => {
    if (cartOpen || navOpen || activeProduct || notifyProduct) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }

    return () => document.body.classList.remove('modal-open')
  }, [activeProduct, cartOpen, navOpen, notifyProduct])

  useEffect(() => {
    if (!navOpen) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setNavOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navOpen])

  useEffect(() => {
    if (!addedItemName) return undefined

    const timerId = window.setTimeout(() => setAddedItemName(''), 1400)
    return () => window.clearTimeout(timerId)
  }, [addedItemName])

  useEffect(() => {
    if (loading || !sharedProductId) {
      return
    }

    const product = products.find((item) => String(item.id) === sharedProductId)

    if (product && activeProduct?.id !== product.id) {
      setCartOpen(false)
      setSelectedQuantity(1)
      setActiveProduct(product)
    }
  }, [activeProduct?.id, loading, products, sharedProductId])

  const activeFilterCount = Number(category !== 'all') + Number(sort !== 'default')
  const totalProducts = filteredProducts.length
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const pageStartIndex = totalProducts ? (safeCurrentPage - 1) * PRODUCTS_PER_PAGE : 0
  const paginatedProducts = useMemo(
    () => filteredProducts.slice(pageStartIndex, pageStartIndex + PRODUCTS_PER_PAGE),
    [filteredProducts, pageStartIndex],
  )
  const paginationItems = useMemo(
    () => buildPaginationItems(safeCurrentPage, totalPages),
    [safeCurrentPage, totalPages],
  )
  const whatsappUrl = useMemo(
    () => getWhatsAppUrlFromSettings(storeSettings),
    [storeSettings]
  )
  const pageStyle = useMemo(
    () => ({ '--store-header-offset': `${headerHeight}px` }),
    [headerHeight]
  )
  const activeProductShareUrl = useMemo(
    () => (activeProduct?.id ? buildProductShareUrl(activeProduct.id) : ''),
    [activeProduct?.id]
  )

  const catalogTitle = useMemo(() => {
    if (search.trim()) {
      return 'Resultados'
    }

    if (category !== 'all') {
      return category
    }

    return 'Mais vendidos'
  }, [category, search])

  useEffect(() => {
    setCurrentPage(1)
  }, [category, search, sort])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const sectionDescription = useMemo(() => {
    if (search.trim()) {
      return `Resultados para "${search.trim()}"`
    }

    if (category !== 'all') {
      return 'Produtos disponiveis nesta categoria.'
    }

    return 'Favoritos para comprar agora.'
  }, [category, search])

  const handleSearchChange = useCallback((value) => {
    startTransition(() => setSearch(value))
  }, [setSearch])

  const handleCategoryChange = useCallback((value) => {
    startTransition(() => setCategory(value))
  }, [setCategory])

  const handleSortChange = useCallback((value) => {
    startTransition(() => setSort(value))
  }, [setSort])

  const handleClearFilters = useCallback(() => {
    startTransition(() => {
      setCategory('all')
      setSort('default')
    })
  }, [setCategory, setSort])

  const handlePageChange = useCallback((nextPage) => {
    const safePage = Math.min(Math.max(1, nextPage), totalPages)

    setCurrentPage(safePage)
    window.requestAnimationFrame(() => {
      productsSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }, [totalPages])

  const handleOpenCart = useCallback(() => {
    setNavOpen(false)
    setCartOpen(true)
  }, [])

  const syncProductUrl = useCallback((productId, { replace = false } = {}) => {
    const nextParams = new URLSearchParams(window.location.search)

    if (productId) {
      nextParams.set('produto', productId)
    } else {
      nextParams.delete('produto')
    }

    setUrlSearchParams(nextParams, { replace })
  }, [setUrlSearchParams])

  const handleOpenProduct = useCallback((product) => {
    setCartOpen(false)
    setSelectedQuantity(1)
    setActiveProduct(product)
    syncProductUrl(product.id)
  }, [syncProductUrl])

  const handleHeaderHeightChange = useCallback((value) => {
    setHeaderHeight((current) => (current === value ? current : value))
  }, [])

  const handleAddToCart = useCallback((product, quantity = 1) => {
    addItem(product, quantity)
    setAddedItemName(product.nome || 'Produto')
    setActiveProduct(null)
    setSelectedQuantity(1)
    syncProductUrl(null, { replace: true })
  }, [addItem, syncProductUrl])

  const handleCloseProductModal = useCallback(() => {
    setActiveProduct(null)
    setSelectedQuantity(1)
    syncProductUrl(null, { replace: true })
  }, [syncProductUrl])

  const handleNotifyRequest = useCallback((product) => {
    setActiveProduct(null)
    setNotifyProduct(product)
    setSelectedQuantity(1)
    syncProductUrl(null, { replace: true })
  }, [syncProductUrl])

  if (loading) {
    return (
      <div className="store-page" style={pageStyle}>
        <StoreHeader
          search=""
          onSearchChange={() => {}}
          cartCount={0}
          onCartOpen={() => {}}
          onHeightChange={handleHeaderHeightChange}
          onMenuOpen={() => {}}
        />
        <main className="store-main container">
          <div className="store-loading">
            <div className="store-spinner" />
            <p>Carregando produtos...</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="store-page" style={pageStyle}>
      <StoreHeader
        search={search}
        onSearchChange={handleSearchChange}
        cartCount={totalItems}
        onCartOpen={handleOpenCart}
        onHeightChange={handleHeaderHeightChange}
        onMenuOpen={() => setNavOpen(true)}
      />

      <main className="store-main">
        <div className="container store-catalog-layout">
          <FiltersBar
            categories={categories}
            cartCount={totalItems}
            category={category}
            mobileOpen={navOpen}
            onCartOpen={handleOpenCart}
            onCategoryChange={handleCategoryChange}
            onMobileClose={() => setNavOpen(false)}
            sort={sort}
            onSortChange={handleSortChange}
            search={search}
            onSearchChange={handleSearchChange}
            onClear={handleClearFilters}
            activeCount={activeFilterCount}
            whatsappUrl={whatsappUrl}
          />

          <div className="store-catalog-main">
            <section className="store-section" id="produtos" ref={productsSectionRef}>
              <div className="store-section-header">
                <div>
                  <h2 className="store-section-title">{catalogTitle}</h2>
                  <p className="store-section-description">{sectionDescription}</p>
                </div>
              </div>

              <ProductGrid
                products={paginatedProducts}
                onProductClick={handleOpenProduct}
                onAddToCart={handleAddToCart}
                emptyMessage="Nenhum produto encontrado."
              />

              {totalPages > 1 ? (
                <nav className="store-pagination" aria-label="Paginacao de produtos">
                  <button
                    type="button"
                    className="store-pagination-btn"
                    onClick={() => handlePageChange(safeCurrentPage - 1)}
                    disabled={safeCurrentPage === 1}
                  >
                    Anterior
                  </button>

                  <div className="store-pagination-pages">
                    {paginationItems.map((item) => (
                      typeof item === 'number' ? (
                        <button
                          type="button"
                          key={item}
                          className={`store-pagination-page ${item === safeCurrentPage ? 'is-active' : ''}`}
                          onClick={() => handlePageChange(item)}
                          aria-current={item === safeCurrentPage ? 'page' : undefined}
                        >
                          {item}
                        </button>
                      ) : (
                        <span className="store-pagination-gap" key={item}>...</span>
                      )
                    ))}
                  </div>

                  <button
                    type="button"
                    className="store-pagination-btn"
                    onClick={() => handlePageChange(safeCurrentPage + 1)}
                    disabled={safeCurrentPage === totalPages}
                  >
                    Proxima
                  </button>
                </nav>
              ) : null}
            </section>
          </div>
        </div>
      </main>

      <StoreFooter />

      <CartSidebar
        open={cartOpen}
        items={items}
        totalItems={totalItems}
        totalPrice={totalPrice}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={updateQuantity}
        onRemove={removeItem}
        onReplaceItems={replaceItems}
      />

      <ProductModal
        open={Boolean(activeProduct)}
        product={activeProduct}
        quantity={selectedQuantity}
        onQuantityChange={setSelectedQuantity}
        onClose={handleCloseProductModal}
        onAddToCart={handleAddToCart}
        onNotifyRequest={handleNotifyRequest}
        productShareUrl={activeProductShareUrl}
      />

      <NotifyModal
        open={Boolean(notifyProduct)}
        productId={notifyProduct?.id}
        productName={notifyProduct?.nome}
        onClose={() => setNotifyProduct(null)}
      />

      {addedItemName && (
        <div className="store-toast" role="status" aria-live="polite">
          {addedItemName} adicionado ao carrinho
        </div>
      )}
    </div>
  )
}
