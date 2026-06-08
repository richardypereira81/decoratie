import { memo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildCartStockMessage, isCartStockConflict, validateCartStock } from '../../shared/cartStockApi.js'
import { formatCurrency } from '../../shared/formatters.js'
import { CloseIcon, TrashIcon } from './StoreIcons.jsx'
import QuantitySelector from './QuantitySelector.jsx'

function getItemUnitKey(item) {
  return [
    item?.variacaoId,
    item?.skuId,
  ].map((value) => String(value || '').trim()).filter(Boolean).join('|')
}

function getItemKey(item) {
  return `${String(item?.produtoId || '').trim()}::${getItemUnitKey(item)}`
}

function buildCheckoutItemsPayload(items) {
  return items.map((item) => ({
    produtoId: item.produtoId,
    nome: item.nome,
    preco: item.preco,
    quantidade: item.quantidade,
    imagem: item.imagem,
    variacaoId: item.variacaoId,
    skuId: item.skuId,
    variacaoNome: item.variacaoNome,
    skuNome: item.skuNome,
  }))
}

function CartSidebar({
  open,
  items,
  totalItems,
  totalPrice,
  onClose,
  onUpdateQuantity,
  onRemove,
  onReplaceItems,
}) {
  const navigate = useNavigate()
  const [itemPendingRemoval, setItemPendingRemoval] = useState(null)
  const [checkoutValidating, setCheckoutValidating] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      setItemPendingRemoval(null)
      setCheckoutError('')
    }
  }, [open])

  useEffect(() => {
    if (!itemPendingRemoval) {
      return
    }

    const pendingKey = getItemKey(itemPendingRemoval)
    const stillExists = items.some((item) => getItemKey(item) === pendingKey)

    if (!stillExists) {
      setItemPendingRemoval(null)
    }
  }, [itemPendingRemoval, items])

  async function handleCheckout() {
    if (checkoutValidating) {
      return
    }

    setCheckoutError('')
    setCheckoutValidating(true)

    try {
      await validateCartStock({
        itens: buildCheckoutItemsPayload(items),
      })

      onClose()
      navigate('/checkout')
    } catch (error) {
      if (isCartStockConflict(error)) {
        const updatedCart = error?.details?.carrinhoAtualizado

        if (Array.isArray(updatedCart)) {
          onReplaceItems?.(updatedCart)
        }

        setCheckoutError(buildCartStockMessage(error))
        return
      }

      setCheckoutError(error.message || 'Nao foi possivel validar o estoque. Tente novamente.')
    } finally {
      setCheckoutValidating(false)
    }
  }

  function handleDecrease(item) {
    setCheckoutError('')

    if (item.quantidade <= 1) {
      setItemPendingRemoval(item)
      return
    }

    onUpdateQuantity(item.produtoId, item.quantidade - 1, getItemUnitKey(item))
  }

  function handleIncrease(item) {
    setCheckoutError('')
    onUpdateQuantity(item.produtoId, item.quantidade + 1, getItemUnitKey(item))
  }

  function handleAskRemove(item) {
    setCheckoutError('')
    setItemPendingRemoval(item)
  }

  function handleConfirmRemove() {
    if (!itemPendingRemoval) {
      return
    }

    onRemove(itemPendingRemoval.produtoId, getItemUnitKey(itemPendingRemoval))
    setCheckoutError('')
    setItemPendingRemoval(null)
  }

  return (
    <>
      <div
        className={`store-sidebar-backdrop ${open ? 'is-visible' : ''}`}
        onClick={onClose}
      />
      <aside
        id="store-cart-sidebar"
        className={`store-sidebar ${open ? 'is-open' : ''}`}
        aria-label="Carrinho"
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="store-sidebar-handle" />

        <div className="store-sidebar-header">
          <div>
            <p className="store-sidebar-eyebrow">Resumo da compra</p>
            <h2 className="store-sidebar-title">Carrinho</h2>
          </div>
          <button type="button" className="store-sidebar-close" onClick={onClose} aria-label="Fechar carrinho">
            <CloseIcon />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="store-sidebar-empty">
            {checkoutError && (
              <p className="store-sidebar-checkout-error" role="alert">
                {checkoutError}
              </p>
            )}
            <p>Seu carrinho esta vazio.</p>
            <button type="button" className="store-btn store-btn-secondary" onClick={onClose}>
              Continuar comprando
            </button>
          </div>
        ) : (
          <>
            <ul className="store-sidebar-items">
              {items.map((item) => (
                <li key={getItemKey(item)} className="store-sidebar-item">
                  <div className="store-sidebar-item-img">
                    {item.imagem ? (
                      <img src={item.imagem} alt={item.nome} loading="lazy" />
                    ) : (
                      <div className="store-sidebar-item-placeholder">{(item.nome || 'P').charAt(0)}</div>
                    )}
                  </div>
                  <div className="store-sidebar-item-info">
                    <span className="store-sidebar-item-name">{item.nome}</span>
                    <span className="store-sidebar-item-unit">{formatCurrency(item.preco)} cada</span>
                    <span className="store-sidebar-item-price">{formatCurrency(item.preco * item.quantidade)}</span>
                    <QuantitySelector
                      value={item.quantidade}
                      onDecrease={() => handleDecrease(item)}
                      onIncrease={() => handleIncrease(item)}
                      size="compact"
                      className="store-sidebar-item-qty"
                      ariaLabel={`Quantidade de ${item.nome}`}
                    />
                  </div>
                  <button
                    type="button"
                    className="store-sidebar-item-remove"
                    onClick={() => handleAskRemove(item)}
                    aria-label={`Remover ${item.nome}`}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>

            <div className="store-sidebar-footer">
              <div className="store-sidebar-meta">
                <span>{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
                <span>Pronto para finalizar</span>
              </div>
              <div className="store-sidebar-total">
                <span>Subtotal</span>
                <strong>{formatCurrency(totalPrice)}</strong>
              </div>
              {checkoutError && (
                <p className="store-sidebar-checkout-error" role="alert">
                  {checkoutError}
                </p>
              )}
              <div className="store-sidebar-actions">
                <button type="button" className="store-btn store-btn-secondary store-btn-block" onClick={onClose}>
                  Continuar comprando
                </button>
                <button
                  type="button"
                  className="store-btn store-btn-primary store-btn-block"
                  onClick={handleCheckout}
                  disabled={checkoutValidating}
                  aria-busy={checkoutValidating}
                >
                  {checkoutValidating ? 'Validando estoque...' : 'Ir para o checkout'}
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      {itemPendingRemoval && (
        <div className="store-modal-overlay store-confirm-modal-overlay" onClick={() => setItemPendingRemoval(null)}>
          <div
            className="store-modal store-confirm-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-remove-title"
          >
            <h3 id="store-remove-title" className="store-modal-title">TEM CERTEZA?</h3>
            <p className="store-modal-desc">
              Essa acao ira remover o produto do carrinho.
            </p>
            <div className="store-confirm-modal-actions">
              <button
                type="button"
                className="store-btn store-btn-secondary store-btn-block"
                onClick={() => setItemPendingRemoval(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="store-btn store-btn-primary store-btn-block"
                onClick={handleConfirmRemove}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default memo(CartSidebar)
