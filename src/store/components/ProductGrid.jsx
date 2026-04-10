import { memo } from 'react'
import ProductCard from './ProductCard.jsx'

function ProductGrid({ products, onProductClick, emptyMessage }) {
  if (!products.length) {
    return (
      <div className="store-empty">
        <p>{emptyMessage || 'Nenhum produto encontrado.'}</p>
      </div>
    )
  }

  return (
    <div className="store-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onProductClick={onProductClick} />
      ))}
    </div>
  )
}

export default memo(ProductGrid)
