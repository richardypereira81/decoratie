import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { useCart } from '../hooks/useCart.js'
import { useProducts } from '../hooks/useProducts.js'
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addedItemName, setAddedItemName] = useState('')
  const [headerHeight, setHeaderHeight] = useState(92)
  const [activeProduct, setActiveProduct] = useState(null)
  const [notifyProduct, setNotifyProduct] = useState(null)
  const [selectedQuantity, setSelectedQuantity] = useState(1)

  useEffect(() => {
    document.title = 'Decoratie - Loja'
  }, [])

  useEffect(() => {
    if (cartOpen || filtersOpen || activeProduct || notifyProduct) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }

    return () => document.body.classList.remove('modal-open')
  }, [activeProduct, cartOpen, filtersOpen, notifyProduct])

  useEffect(() => {
    if (!addedItemName) return undefined

    const timerId = window.setTimeout(() => setAddedItemName(''), 1400)
    return () => window.clearTimeout(timerId)
  }, [addedItemName])

  const activeFilterCount = Number(category !== 'all') + Number(sort !== 'default')
  const pageStyle = useMemo(
    () => ({ '--store-header-offset': `${headerHeight}px` }),
    [headerHeight]
  )

  const sectionDescription = useMemo(() => {
    if (search.trim()) {
      return `Resultados para "${search.trim()}"`
    }

    return 'Escolha com calma e finalize sua compra em poucos toques.'
  }, [search])

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
    setFiltersOpen(false)
    setCartOpen(true)
  }, [])

  const handleOpenProduct = useCallback((product) => {
    setCartOpen(false)
    setFiltersOpen(false)
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
      />

      <main className="store-main">
        <section className="store-banner">
          <div className="container store-banner-inner">
            <div className="store-banner-copy">
              <span className="store-banner-eyebrow">Decoratie</span>
              <h1 className="store-banner-title">
                Sua mesa nunca mais sera <em>comum.</em>
              </h1>
              <p className="store-banner-subtitle">
                Pecas exclusivas para montar composicoes elegantes, com compra simples e fluida no celular.
              </p>

              <div className="store-banner-actions">
                <a href="#produtos" className="store-btn store-btn-primary">
                  Explorar colecao
                </a>
                <button type="button" className="store-btn store-btn-secondary" onClick={handleOpenCart}>
                  Ver carrinho {totalItems > 0 ? `(${totalItems})` : ''}
                </button>
              </div>
            </div>

            <div className="store-banner-panel" aria-label="Destaques da loja">
              <div className="store-banner-note">
                <strong>{products.length} produtos disponiveis</strong>
                <span>Catalogo atualizado em tempo real para voce comprar sem friccao.</span>
              </div>

              <ul className="store-banner-points">
                <li>Busca rapida sempre visivel</li>
                <li>Carrinho acessivel em qualquer etapa</li>
                <li>Curadoria pensada para mesas autorais</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="store-section container" id="produtos">
          <div className="store-catalog-shell">
            <div className="store-section-header">
              <div>
                <h2 className="store-section-title">Produtos</h2>
                <p className="store-section-description">{sectionDescription}</p>
              </div>
              <span className="store-section-count">
                {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
              </span>
            </div>

            <FiltersBar
              categories={categories}
              category={category}
              onCategoryChange={handleCategoryChange}
              sort={sort}
              onSortChange={handleSortChange}
              onClear={handleClearFilters}
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              activeCount={activeFilterCount}
            />

            <ProductGrid
              products={filteredProducts}
              onProductClick={handleOpenProduct}
              emptyMessage="Nenhum produto encontrado com esses filtros."
            />
          </div>
        </section>
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
