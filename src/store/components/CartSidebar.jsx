import { memo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../../shared/formatters.js'
import { CloseIcon, TrashIcon } from './StoreIcons.jsx'
import QuantitySelector from './QuantitySelector.jsx'

function CartSidebar({ open, items, totalItems, totalPrice, onClose, onUpdateQuantity, onRemove }) {
  const navigate = useNavigate()
  const [itemPendingRemoval, setItemPendingRemoval] = useState(null)

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
    }
  }, [open])

  useEffect(() => {
    if (!itemPendingRemoval) {
      return
    }

    const stillExists = items.some((item) => item.produtoId === itemPendingRemoval.produtoId)

    if (!stillExists) {
      setItemPendingRemoval(null)
    }
  }, [itemPendingRemoval, items])

  function handleCheckout() {
    onClose()
    navigate('/checkout')
  }

  function handleDecrease(item) {
    if (item.quantidade <= 1) {
      setItemPendingRemoval(item)
      return
    }

    onUpdateQuantity(item.produtoId, item.quantidade - 1)
  }

  function handleIncrease(item) {
    onUpdateQuantity(item.produtoId, item.quantidade + 1)
  }

  function handleAskRemove(item) {
    setItemPendingRemoval(item)
  }

  function handleConfirmRemove() {
    if (!itemPendingRemoval) {
      return
    }

    onRemove(itemPendingRemoval.produtoId)
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
            <p>Seu carrinho esta vazio.</p>
            <button type="button" className="store-btn store-btn-secondary" onClick={onClose}>
              Continuar comprando
            </button>
          </div>
        ) : (
          <>
            <ul className="store-sidebar-items">
              {items.map((item) => (
                <li key={item.produtoId} className="store-sidebar-item">
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
              <div className="store-sidebar-actions">
                <button type="button" className="store-btn store-btn-secondary store-btn-block" onClick={onClose}>
                  Continuar comprando
                </button>
                <button type="button" className="store-btn store-btn-primary store-btn-block" onClick={handleCheckout}>
                  Ir para o checkout
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
