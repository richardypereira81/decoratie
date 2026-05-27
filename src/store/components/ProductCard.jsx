import { memo } from 'react'
import { formatCurrency } from '../../shared/formatters.js'
import { getPrimaryProductCategory } from '../../shared/productCategories.js'
import { BellIcon, CartIcon } from './StoreIcons.jsx'

function ProductCard({ product, onProductClick, onAddToCart }) {
  const price = Number(product.precoVenda ?? product.preco) || 0
  const originalPrice = Number(product.preco)
  const hasDiscount = Number.isFinite(originalPrice) && originalPrice > price
  const hasStock = product.estoque === null || product.estoque === undefined || product.estoque > 0
  const imageAlt = product.nome || 'Produto'
  const category = getPrimaryProductCategory(product)

  function handleOpenProduct() {
    onProductClick(product)
  }

  function handleAddToCart(event) {
    event.stopPropagation()

    if (!hasStock || !onAddToCart) {
      handleOpenProduct()
      return
    }

    onAddToCart(product)
  }

  return (
    <article
      className={`store-card ${hasStock ? '' : 'is-unavailable'}`}
      onClick={handleOpenProduct}
    >
      <div className="store-card-media">
        <div className="store-card-img">
          {product.imagem ? (
            <img
              src={product.imagem}
              alt={imageAlt}
              loading="lazy"
              decoding="async"
              sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 280px"
            />
          ) : (
            <div className="store-card-placeholder">{(product.nome || 'P').charAt(0)}</div>
          )}
          {product.destaque && <span className="store-card-badge">Destaque</span>}
        </div>
      </div>

      <div className="store-card-body">
        {category && (
          <span className="store-card-category">{category}</span>
        )}
        <h3 className="store-card-name">{product.nome}</h3>
        <div className="store-card-pricing">
          {hasDiscount && <span className="store-card-old-price">{formatCurrency(originalPrice)}</span>}
          <p className="store-card-price">{formatCurrency(price)}</p>
          {hasStock && <span className="store-card-pix">5% off no Pix</span>}
        </div>

        {hasStock ? (
          <button
            type="button"
            className="store-card-btn store-card-btn-primary"
            onClick={handleAddToCart}
            aria-label={`Adicionar ${product.nome} ao carrinho`}
          >
            <CartIcon className="store-card-btn-icon" />
            Adicionar
          </button>
        ) : (
          <button
            type="button"
            className="store-card-btn store-card-btn-notify"
            onClick={(event) => {
              event.stopPropagation()
              handleOpenProduct()
            }}
            aria-label={`Ver disponibilidade de ${product.nome}`}
          >
            <BellIcon className="store-card-btn-icon" />
            Avise-me
          </button>
        )}
      </div>
    </article>
  )
}

export default memo(ProductCard)
