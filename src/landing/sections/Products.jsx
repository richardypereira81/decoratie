import Reveal from '../components/Reveal.jsx'
import { formatCurrency, getInitials } from '../../shared/formatters.js'

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

export default function Products({ products, settings }) {
  return (
    <section id="colecao" className="products">
      <div className="container">
        <Reveal as="div" className="products-head">
          <span className="eyebrow">A coleção</span>
          <h2 className="h-section">
            Peças que contam uma <em>história</em> antes mesmo do primeiro brinde.
          </h2>
        </Reveal>

        <Reveal stagger className="products-grid">
          {products.map((product) => (
            <article key={product.id || product.nome} className="product-card">
              <div className="product-image">
                <span className="product-tag">{product.categoria || 'Coleção Decoratie'}</span>
                {product.imagem ? (
                  <img
                    src={product.imagem}
                    alt={product.nome}
                    className="product-image-photo"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="product-image-inner">{getInitials(product.nome)}</div>
                )}
              </div>
              <div className="product-info">
                <h3 className="product-name">{product.nome}</h3>
                <p className="product-desc">{product.descricao}</p>
                <div className="product-bottom">
                  <span className="product-price">{formatCurrency(product.preco)}</span>
                  <a className="product-cta" href={settings.whatsappLink} target="_blank" rel="noreferrer">
                    Quero esta <Arrow />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
