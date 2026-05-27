import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
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

export default function StorePage() {
  const { items, addItem, removeItem, updateQuantity, totalItems, totalPrice } = useCart()
  const { data: storeSettings } = useStoreSettings()
  const {
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

  const activeFilterCount = Number(category !== 'all') + Number(sort !== 'default')
  const whatsappUrl = useMemo(
    () => getWhatsAppUrlFromSettings(storeSettings),
    [storeSettings]
  )
  const pageStyle = useMemo(
    () => ({ '--store-header-offset': `${headerHeight}px` }),
    [headerHeight]
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

  const handleOpenCart = useCallback(() => {
    setNavOpen(false)
    setCartOpen(true)
  }, [])

  const handleOpenProduct = useCallback((product) => {
    setCartOpen(false)
    setSelectedQuantity(1)
    setActiveProduct(product)
  }, [])

  const handleHeaderHeightChange = useCallback((value) => {
    setHeaderHeight((current) => (current === value ? current : value))
  }, [])

  const handleAddToCart = useCallback((product, quantity = 1) => {
    addItem(product, quantity)
    setAddedItemName(product.nome || 'Produto')
    setActiveProduct(null)
    setSelectedQuantity(1)
  }, [addItem])

  const handleCloseProductModal = useCallback(() => {
    setActiveProduct(null)
    setSelectedQuantity(1)
  }, [])

  const handleNotifyRequest = useCallback((product) => {
    setActiveProduct(null)
    setNotifyProduct(product)
    setSelectedQuantity(1)
  }, [])

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
            <section className="store-section" id="produtos">
              <div className="store-section-header">
                <div>
                  <h2 className="store-section-title">{catalogTitle}</h2>
                  <p className="store-section-description">{sectionDescription}</p>
                </div>
                <span className="store-section-count">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
                </span>
              </div>

              <ProductGrid
                products={filteredProducts}
                onProductClick={handleOpenProduct}
                onAddToCart={handleAddToCart}
                emptyMessage="Nenhum produto encontrado."
              />
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
      />

      <ProductModal
        open={Boolean(activeProduct)}
        product={activeProduct}
        quantity={selectedQuantity}
        onQuantityChange={setSelectedQuantity}
        onClose={handleCloseProductModal}
        onAddToCart={handleAddToCart}
        onNotifyRequest={handleNotifyRequest}
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
