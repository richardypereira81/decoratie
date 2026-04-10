import { memo } from 'react'
import { formatCurrency } from '../../shared/formatters.js'
import { BellIcon, CartIcon } from './StoreIcons.jsx'

function ProductCard({ product, onProductClick }) {
  const price = product.precoVenda ?? product.preco
  const hasStock = product.estoque === null || product.estoque === undefined || product.estoque > 0
  const imageAlt = product.nome || 'Produto'
  const description = product.descricao?.trim()

  function handleOpenProduct() {
    onProductClick(product)
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
        {product.categoria && (
          <span className="store-card-category">{product.categoria}</span>
        )}
        <h3 className="store-card-name">{product.nome}</h3>
        {description && <p className="store-card-copy">{description}</p>}
        <p className="store-card-price">{formatCurrency(price)}</p>

        {hasStock ? (
          <button
            type="button"
            className="store-card-btn store-card-btn-primary"
            onClick={(event) => {
              event.stopPropagation()
              handleOpenProduct()
            }}
            aria-label={`Escolher quantidade de ${product.nome}`}
          >
            <CartIcon className="store-card-btn-icon" />
            Escolher quantidade
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
            Ver disponibilidade
          </button>
        )}
      </div>
    </article>
  )
}

export default memo(ProductCard)
