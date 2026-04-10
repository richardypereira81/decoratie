import { memo, useEffect, useId } from 'react'
import { formatCurrency } from '../../shared/formatters.js'
import { BellIcon, CartIcon, CloseIcon } from './StoreIcons.jsx'
import QuantitySelector from './QuantitySelector.jsx'

function ProductModal({
  open,
  product,
  quantity,
  onQuantityChange,
  onClose,
  onAddToCart,
  onNotifyRequest,
}) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !product) {
    return null
  }

  const price = Number(product.precoVenda ?? product.preco) || 0
  const hasStock = product.estoque === null || product.estoque === undefined || product.estoque > 0
  const description = product.descricao?.trim()
  const totalPrice = price * quantity
  const imageAlt = product.nome || 'Produto'
  const priceLabel = formatCurrency(price)
  const totalPriceLabel = formatCurrency(totalPrice)

  function handleDecrease() {
    onQuantityChange(Math.max(1, quantity - 1))
  }

  function handleIncrease() {
    onQuantityChange(quantity + 1)
  }

  function handlePrimaryAction() {
    if (hasStock) {
      onAddToCart(product, quantity)
      return
    }

    onNotifyRequest(product)
  }

  return (
    <div className="store-modal-overlay store-product-modal-overlay" onClick={onClose}>
      <div
        className="store-modal store-product-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button type="button" className="store-modal-close" onClick={onClose} aria-label="Fechar">
          <CloseIcon />
        </button>

        <div className="store-product-modal-scroll">
          <div className="store-product-modal-layout">
            <div className="store-product-modal-media-panel">
              {product.imagem ? (
                <img src={product.imagem} alt={imageAlt} loading="eager" decoding="async" />
              ) : (
                <div className="store-product-modal-placeholder">{imageAlt.charAt(0)}</div>
              )}
              {product.destaque && <span className="store-card-badge">Destaque</span>}
            </div>

            <div className="store-product-modal-body">
              <div className="store-product-modal-copy">
                {product.categoria && (
                  <span className="store-card-category">{product.categoria}</span>
                )}

                <h3 id={titleId} className="store-product-modal-title">
                  {product.nome}
                </h3>

                <p id={descriptionId} className="store-product-modal-description">
                  {description || 'Peca selecionada para compor sua mesa com acabamento elegante e compra fluida.'}
                </p>
              </div>

              <div className="store-product-modal-bottom">
                {hasStock ? (
                  <div className="store-product-modal-pricing">
                    <div className="store-product-modal-total">
                      <strong>{totalPriceLabel}</strong>
                    </div>

                    <QuantitySelector
                      value={quantity}
                      onDecrease={handleDecrease}
                      onIncrease={handleIncrease}
                      ariaLabel={`Quantidade de ${product.nome}`}
                      disableDecreaseAtMin
                      size="compact"
                    />
                  </div>
                ) : (
                  <div className="store-product-modal-stock">
                    <div className="store-product-modal-stock-pill">Indisponivel</div>
                    <strong>Produto indisponivel no momento.</strong>
                    <span>Deixe seu e-mail e avisaremos quando ele voltar ao estoque.</span>
                  </div>
                )}
              </div>

              <div className="store-product-modal-footer">
                <button
                  type="button"
                  className="store-btn store-btn-secondary store-btn-block store-btn-lg"
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="store-btn store-btn-primary store-btn-block store-btn-lg store-product-modal-submit"
                  onClick={handlePrimaryAction}
                >
                  {hasStock ? (
                    <>
                      <CartIcon className="store-card-btn-icon" />
                      Adicionar ao carrinho
                    </>
                  ) : (
                    <>
                      <BellIcon className="store-card-btn-icon" />
                      Avise-me quando chegar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(ProductModal)
