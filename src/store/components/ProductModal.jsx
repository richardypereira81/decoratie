import { memo, useEffect, useId, useState } from 'react'
import { formatCurrency } from '../../shared/formatters.js'
import { getInstallmentLabel } from '../../shared/pricing.js'
import { getPrimaryProductCategory } from '../../shared/productCategories.js'
import { BellIcon, CartIcon, CloseIcon, ShareIcon } from './StoreIcons.jsx'
import QuantitySelector from './QuantitySelector.jsx'

const ACRONYMS = new Set([
  'ABS',
  'BPA',
  'HDMI',
  'INMETRO',
  'LED',
  'MDF',
  'PET',
  'PP',
  'PVC',
  'USB',
])

const CONNECTOR_WORDS = new Set([
  'a',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'o',
  'os',
  'para',
  'por',
  'sem',
])

const LOWERCASE_PRODUCT_WORDS = new Set([
  ...CONNECTOR_WORDS,
  'aco',
  'alca',
  'alcas',
  'alça',
  'alças',
  'azul',
  'bandeja',
  'bege',
  'branca',
  'branco',
  'bowl',
  'cachepot',
  'castical',
  'castiçal',
  'ceramica',
  'cerâmica',
  'cinza',
  'cobre',
  'colher',
  'conjunto',
  'copo',
  'cristal',
  'decorativa',
  'decorativo',
  'dourada',
  'dourado',
  'dupla',
  'ferro',
  'fosca',
  'fosco',
  'garfo',
  'guardanapo',
  'inox',
  'jarra',
  'jogo',
  'lisa',
  'liso',
  'madeira',
  'metal',
  'natural',
  'off',
  'pequena',
  'pequeno',
  'peca',
  'peça',
  'pecas',
  'peças',
  'porcelana',
  'porta',
  'prata',
  'preta',
  'preto',
  'prato',
  'raso',
  'redonda',
  'redondo',
  'sousplat',
  'suporte',
  'talher',
  'talheres',
  'taca',
  'taça',
  'tacas',
  'taças',
  'travessa',
  'unidade',
  'vaso',
  'verde',
  'vidro',
  'xicara',
  'xícara',
  'xicaras',
  'xícaras',
])

const SAFE_WORD_REPLACEMENTS = new Map([
  ['aco', 'aço'],
  ['alca', 'alça'],
  ['alcas', 'alças'],
  ['acucareiro', 'açucareiro'],
  ['acucar', 'açúcar'],
  ['cafe', 'café'],
  ['ceramica', 'cerâmica'],
  ['cha', 'chá'],
  ['decoracao', 'decoração'],
  ['lencol', 'lençol'],
  ['lencos', 'lenços'],
  ['limao', 'limão'],
  ['pao', 'pão'],
  ['peca', 'peça'],
  ['pecas', 'peças'],
  ['taca', 'taça'],
  ['tacas', 'taças'],
  ['xicara', 'xícara'],
  ['xicaras', 'xícaras'],
])

function hasLetter(value) {
  return /\p{L}/u.test(value)
}

function isUppercaseText(value) {
  const letters = Array.from(String(value || '')).filter((char) => /\p{L}/u.test(char)).join('')

  return letters.length > 1 &&
    letters === letters.toLocaleUpperCase('pt-BR') &&
    letters !== letters.toLocaleLowerCase('pt-BR')
}

function capitalizeFirstLetter(value) {
  return String(value || '').replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('pt-BR'))
}

function capitalizeSentenceStarts(value) {
  return String(value || '').replace(/(^|[.!?]\s+)(\p{L})/gu, (match, prefix, letter) => (
    `${prefix}${letter.toLocaleUpperCase('pt-BR')}`
  ))
}

function splitToken(token) {
  return String(token || '').match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}./-]+)([^\p{L}\p{N}]*)$/u)
}

function normalizeCoreText(core) {
  const rawCore = String(core || '')

  if (ACRONYMS.has(rawCore.toLocaleUpperCase('pt-BR'))) {
    return rawCore.toLocaleUpperCase('pt-BR')
  }

  const normalized = rawCore
    .toLocaleLowerCase('pt-BR')
    .replace(/(\d+(?:[,.]\d+)?)(ml|l|cm|mm|m|kg|g|un)$/giu, (_, amount, unit) => (
      `${amount}${unit.toLocaleLowerCase('pt-BR')}`
    ))

  return normalized
    .split(/([./-])/)
    .map((part) => SAFE_WORD_REPLACEMENTS.get(part) || part)
    .join('')
}

function normalizeToken(token, index, mode) {
  const parts = splitToken(token)

  if (!parts) {
    return String(token || '').toLocaleLowerCase('pt-BR')
  }

  const [, prefix, core, suffix] = parts
  const normalizedCore = normalizeCoreText(core)
  const rawUpperCore = core.toLocaleUpperCase('pt-BR')

  if (ACRONYMS.has(rawUpperCore) || !hasLetter(normalizedCore)) {
    return `${prefix}${normalizedCore}${suffix}`
  }

  if (mode === 'title') {
    const comparable = normalizedCore.toLocaleLowerCase('pt-BR')
    const shouldCapitalize =
      index === 0 ||
      (!LOWERCASE_PRODUCT_WORDS.has(comparable) && !comparable.includes('-'))

    return `${prefix}${shouldCapitalize ? capitalizeFirstLetter(normalizedCore) : normalizedCore}${suffix}`
  }

  return `${prefix}${normalizedCore}${suffix}`
}

function formatDisplayText(value, mode = 'sentence') {
  const trimmed = String(value || '').trim().replace(/\s+/g, ' ')

  if (!trimmed) {
    return ''
  }

  if (!isUppercaseText(trimmed)) {
    return trimmed
  }

  const normalized = trimmed
    .split(' ')
    .map((token, index) => normalizeToken(token, index, mode))
    .join(' ')

  if (mode === 'title') {
    return normalized
  }

  return capitalizeSentenceStarts(normalized)
}

function ProductModal({
  open,
  product,
  quantity,
  onQuantityChange,
  onClose,
  onAddToCart,
  onNotifyRequest,
  productShareUrl,
}) {
  const titleId = useId()
  const descriptionId = useId()
  const [shareFeedback, setShareFeedback] = useState('')

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

  useEffect(() => {
    setShareFeedback('')
  }, [open, product?.id])

  if (!open || !product) {
    return null
  }

  const price = Number(product.precoVenda ?? product.preco) || 0
  const hasStock = product.estoque === null || product.estoque === undefined || product.estoque > 0
  const description = product.descricao?.trim()
  const displayName = formatDisplayText(product.nome, 'title')
  const displayDescription = formatDisplayText(
    description || 'Produto disponível para compra no catálogo Decoratie.',
  )
  const displayCategory = formatDisplayText(getPrimaryProductCategory(product))
  const totalPrice = price * quantity
  const imageAlt = displayName || 'Produto'
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

  async function copyProductLink(url) {
    if (window.navigator.clipboard?.writeText && window.isSecureContext) {
      await window.navigator.clipboard.writeText(url)
      return
    }

    const textArea = document.createElement('textarea')
    textArea.value = url
    textArea.setAttribute('readonly', '')
    textArea.style.position = 'fixed'
    textArea.style.top = '-1000px'
    document.body.appendChild(textArea)
    textArea.select()

    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(textArea)
    }
  }

  async function handleShareProduct() {
    const url = productShareUrl || window.location.href
    const shareData = {
      title: displayName || 'Produto Decoratie',
      text: displayName ? `Confira este produto: ${displayName}` : 'Confira este produto Decoratie.',
      url,
    }

    try {
      if (window.navigator.share) {
        await window.navigator.share(shareData)
        setShareFeedback('Produto compartilhado!')
        return
      }

      await copyProductLink(url)
      setShareFeedback('Link do produto copiado!')
    } catch (error) {
      if (error.name === 'AbortError') {
        return
      }

      try {
        await copyProductLink(url)
        setShareFeedback('Link do produto copiado!')
      } catch {
        setShareFeedback('Não foi possível copiar o link.')
      }
    }
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
                {displayCategory && (
                  <span className="store-card-category">{displayCategory}</span>
                )}

                <h3 id={titleId} className="store-product-modal-title">
                  {displayName}
                </h3>

                <div className="store-product-modal-share-row">
                  <button
                    type="button"
                    className="store-product-share-btn"
                    onClick={handleShareProduct}
                  >
                    <ShareIcon className="store-product-share-icon" />
                    Compartilhar
                  </button>
                  {shareFeedback && (
                    <span className="store-product-share-feedback" role="status" aria-live="polite">
                      {shareFeedback}
                    </span>
                  )}
                </div>

                <p id={descriptionId} className="store-product-modal-description">
                  {displayDescription}
                </p>
              </div>

              <div className="store-product-modal-bottom">
                {hasStock ? (
                  <div className="store-product-modal-pricing">
                    <div className="store-product-modal-total">
                      <strong>{totalPriceLabel}</strong>
                      <small>{getInstallmentLabel(totalPrice)}</small>
                    </div>

                    <QuantitySelector
                      value={quantity}
                      onDecrease={handleDecrease}
                      onIncrease={handleIncrease}
                      ariaLabel={`Quantidade de ${displayName || product.nome || 'produto'}`}
                      disableDecreaseAtMin
                      size="compact"
                    />
                  </div>
                ) : (
                  <div className="store-product-modal-stock">
                    <div className="store-product-modal-stock-pill">Indisponível</div>
                    <strong>Produto indisponível no momento.</strong>
                    <span>Deixe seu e-mail e avisaremos quando ele voltar ao estoque.</span>
                  </div>
                )}
              </div>

              <div className="store-product-modal-footer">
                <button
                  type="button"
                  className="store-btn store-btn-secondary store-btn-block store-btn-lg store-product-modal-cancel"
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
