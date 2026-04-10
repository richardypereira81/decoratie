import { memo } from 'react'
import { MinusIcon, PlusIcon } from './StoreIcons.jsx'

function QuantitySelector({
  value,
  onDecrease,
  onIncrease,
  min = 1,
  className = '',
  size = 'default',
  ariaLabel = 'Selecionar quantidade',
  disableDecreaseAtMin = false,
  decreaseAriaLabel,
  increaseAriaLabel = 'Aumentar quantidade',
}) {
  const classes = ['store-quantity']
  const decreaseDisabled = disableDecreaseAtMin && value <= min
  const resolvedDecreaseLabel = decreaseAriaLabel
    || (decreaseDisabled
      ? 'Quantidade minima atingida'
      : value <= min
        ? 'Remover item'
        : 'Diminuir quantidade')

  if (size === 'compact') {
    classes.push('is-compact')
  }

  if (className) {
    classes.push(className)
  }

  return (
    <div className={classes.join(' ')} role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="store-quantity-btn"
        onClick={onDecrease}
        aria-label={resolvedDecreaseLabel}
        disabled={decreaseDisabled}
      >
        <MinusIcon />
      </button>
      <span className="store-quantity-value" aria-live="polite" aria-atomic="true">
        {value}
      </span>
      <button
        type="button"
        className="store-quantity-btn"
        onClick={onIncrease}
        aria-label={increaseAriaLabel}
      >
        <PlusIcon />
      </button>
    </div>
  )

  const sizes = {
  sm: {
    height: "28px",
    fontSize: "12px",
    buttonSize: "24px"
  },
  md: {
    height: "36px",
    fontSize: "14px",
    buttonSize: "32px"
  },
  lg: {
    height: "44px",
    fontSize: "16px",
    buttonSize: "40px"
  }
}

const s = sizes[size || "md"]
}

export default memo(QuantitySelector)
