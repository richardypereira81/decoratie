import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../hooks/useCart.js'
import { useOrders } from '../hooks/useOrders.js'
import { formatCurrency } from '../../shared/formatters.js'
import { ArrowLeftIcon, CheckIcon, TruckIcon, MapPinIcon } from '../components/StoreIcons.jsx'
import '../store.css'

const FRETE_OPTIONS = [
  { tipo: 'pac', label: 'PAC', valor: 20, prazo: '8-12 dias uteis' },
  { tipo: 'sedex', label: 'SEDEX', valor: 35, prazo: '3-5 dias uteis' },
  { tipo: 'retirada', label: 'Retirada no local', valor: 0, prazo: 'Agende a retirada' },
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emptyForm = {
  nome: '',
  email: '',
  telefone: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
}

function getDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

export default function CheckoutPage() {
  const { items, clearCart } = useCart()
  const { createOrder, submitting, error: submitError } = useOrders()
  const [form, setForm] = useState(emptyForm)
  const [freteTipo, setFreteTipo] = useState(FRETE_OPTIONS[0].tipo)
  const [errors, setErrors] = useState({})
  const [orderComplete, setOrderComplete] = useState(null)
  const [headerHeight, setHeaderHeight] = useState(76)
  const headerRef = useRef(null)

  useEffect(() => {
    document.title = 'Checkout | Decoratie'
  }, [])

  useLayoutEffect(() => {
    const headerNode = headerRef.current

    if (!headerNode) {
      return undefined
    }

    const syncHeaderHeight = () => {
      const nextHeight = Math.ceil(headerNode.getBoundingClientRect().height)
      setHeaderHeight((current) => (current === nextHeight ? current : nextHeight))
    }

    syncHeaderHeight()

    let resizeObserver = null

    if (typeof globalThis.ResizeObserver !== 'undefined') {
      resizeObserver = new globalThis.ResizeObserver(syncHeaderHeight)
      resizeObserver.observe(headerNode)
    }

    window.addEventListener('resize', syncHeaderHeight)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncHeaderHeight)
    }
  }, [])

  const cartItems = useMemo(
    () => Array.from(
      items.reduce((map, item) => {
        const produtoId = String(item?.produtoId || '').trim()

        if (!produtoId) {
          return map
        }

        const normalizedItem = {
          produtoId,
          nome: String(item?.nome || 'Produto').trim() || 'Produto',
          preco: Number(item?.preco) || 0,
          quantidade: Math.max(1, Number.parseInt(item?.quantidade, 10) || 1),
          imagem: typeof item?.imagem === 'string' ? item.imagem : '',
        }

        const existingItem = map.get(produtoId)

        if (existingItem) {
          map.set(produtoId, {
            ...existingItem,
            quantidade: existingItem.quantidade + normalizedItem.quantidade,
          })

          return map
        }

        map.set(produtoId, normalizedItem)
        return map
      }, new Map()).values()
    ),
    [items]
  )

  const selectedFrete = useMemo(
    () => FRETE_OPTIONS.find((option) => option.tipo === freteTipo) ?? FRETE_OPTIONS[0],
    [freteTipo]
  )

  const totalItems = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.quantidade, 0),
    [cartItems]
  )

  const subtotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.preco * item.quantidade, 0),
    [cartItems]
  )

  const total = useMemo(
    () => subtotal + selectedFrete.valor,
    [subtotal, selectedFrete.valor]
  )

  const checkoutStyle = useMemo(
    () => ({ '--store-checkout-header-offset': `${headerHeight}px` }),
    [headerHeight]
  )

  function update(field, value) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))

    if (errors[field]) {
      setErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
    }
  }

  function validate() {
    const nextErrors = {}
    const phoneDigits = getDigits(form.telefone)

    if (!form.nome.trim()) nextErrors.nome = 'Nome obrigatorio'
    if (!EMAIL_REGEX.test(form.email)) nextErrors.email = 'E-mail invalido'
    if (phoneDigits.length < 10 || phoneDigits.length > 11) nextErrors.telefone = 'Telefone invalido'
    if (!form.cep.trim()) nextErrors.cep = 'CEP obrigatorio'
    if (!form.rua.trim()) nextErrors.rua = 'Rua obrigatoria'
    if (!form.numero.trim()) nextErrors.numero = 'Numero obrigatorio'
    if (!form.bairro.trim()) nextErrors.bairro = 'Bairro obrigatorio'
    if (!form.cidade.trim()) nextErrors.cidade = 'Cidade obrigatoria'
    if (!form.estado.trim()) nextErrors.estado = 'Estado obrigatorio'

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!validate() || cartItems.length === 0) {
      return
    }

    const orderId = await createOrder({
      cliente: {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        telefone: form.telefone.trim(),
        endereco: {
          cep: form.cep.trim(),
          rua: form.rua.trim(),
          numero: form.numero.trim(),
          complemento: form.complemento.trim(),
          bairro: form.bairro.trim(),
          cidade: form.cidade.trim(),
          estado: form.estado.trim(),
        },
      },
      itens: cartItems.map((item) => ({
        produtoId: item.produtoId,
        nome: item.nome,
        preco: item.preco,
        quantidade: item.quantidade,
        imagem: item.imagem,
      })),
      frete: {
        tipo: selectedFrete.tipo,
        valor: selectedFrete.valor,
      },
      total,
    })

    if (orderId) {
      clearCart()
      setOrderComplete(orderId)
    }
  }

  if (orderComplete) {
    return (
      <div className="store-page">
        <div className="store-confirmation container">
          <div className="store-confirmation-icon">
            <CheckIcon />
          </div>
          <h1>Pedido confirmado!</h1>
          <p className="store-confirmation-id">Codigo: <strong>{orderComplete}</strong></p>
          <p>Voce recebera atualizacoes sobre o status do pedido.</p>
          <Link to="/" className="store-btn store-btn-primary">Voltar para a loja</Link>
        </div>
      </div>
    )
  }

  if (cartItems.length === 0) {
    return (
      <div className="store-page">
        <div className="store-confirmation container">
          <h1>Carrinho vazio</h1>
          <p>Adicione produtos antes de finalizar a compra.</p>
          <Link to="/" className="store-btn store-btn-primary">Ver produtos</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="store-page" style={checkoutStyle}>
      <header ref={headerRef} className="store-checkout-header">
        <div className="container store-checkout-header-inner">
          <Link to="/" className="store-back-link">
            <ArrowLeftIcon className="store-back-icon" />
            Voltar
          </Link>
          <span className="store-checkout-header-spacer" aria-hidden="true" />
          <Link to="/" className="store-logo-checkout" aria-label="Decoratie - Ir para a loja">
            <img src="/Logo - Decoratie-01.png" alt="Decoratie" />
          </Link>
        </div>
      </header>

      <main className="store-checkout container">
        <h1 className="store-checkout-title">Checkout</h1>

        <div className="store-checkout-grid">
          <form className="store-checkout-form" onSubmit={handleSubmit} noValidate>
            <fieldset className="store-fieldset">
              <div className="store-field">
                <h3>Dados pessoais</h3>
                <label htmlFor="ck-nome">Nome completo</label>
                <input
                  id="ck-nome"
                  className="store-input"
                  autoComplete="name"
                  aria-invalid={Boolean(errors.nome)}
                  value={form.nome}
                  onChange={(event) => update('nome', event.target.value)}
                />
                {errors.nome && <span className="store-field-error">{errors.nome}</span>}
              </div>

              <div className="store-field-row">
                <div className="store-field">
                  <label htmlFor="ck-email">E-mail</label>
                  <input
                    id="ck-email"
                    type="email"
                    className="store-input"
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={Boolean(errors.email)}
                    value={form.email}
                    onChange={(event) => update('email', event.target.value)}
                  />
                  {errors.email && <span className="store-field-error">{errors.email}</span>}
                </div>

                <div className="store-field">
                  <label htmlFor="ck-tel">Telefone</label>
                  <input
                    id="ck-tel"
                    type="tel"
                    className="store-input"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    aria-invalid={Boolean(errors.telefone)}
                    value={form.telefone}
                    onChange={(event) => update('telefone', event.target.value)}
                  />
                  {errors.telefone && <span className="store-field-error">{errors.telefone}</span>}
                </div>
              </div>
            </fieldset>

            <fieldset className="store-fieldset">
              <div className="store-field">
                <h3>Endereco</h3>
                  <label htmlFor="ck-cep">CEP</label>
                  <input
                    id="ck-cep"
                    className="store-input"
                    autoComplete="postal-code"
                    inputMode="numeric"
                    aria-invalid={Boolean(errors.cep)}
                    value={form.cep}
                    onChange={(event) => update('cep', event.target.value)}
                  />
                  {errors.cep && <span className="store-field-error">{errors.cep}</span>}
                </div>

                <div className="store-field">
                  <label htmlFor="ck-rua">Rua</label>
                  <input
                    id="ck-rua"
                    className="store-input"
                    autoComplete="address-line1"
                    aria-invalid={Boolean(errors.rua)}
                    value={form.rua}
                    onChange={(event) => update('rua', event.target.value)}
                  />
                  {errors.rua && <span className="store-field-error">{errors.rua}</span>}
                </div>

              <div className="store-field-row">
                <div className="store-field store-field-number">
                  <label htmlFor="ck-num">Numero</label>
                  <input
                    id="ck-num"
                    className="store-input"
                    autoComplete="address-line2"
                    inputMode="numeric"
                    aria-invalid={Boolean(errors.numero)}
                    value={form.numero}
                    onChange={(event) => update('numero', event.target.value)}
                  />
                  {errors.numero && <span className="store-field-error">{errors.numero}</span>}
                </div>

                <div className="store-field">
                  <label htmlFor="ck-comp">Complemento</label>
                  <input
                    id="ck-comp"
                    className="store-input"
                    placeholder="Opcional"
                    value={form.complemento}
                    onChange={(event) => update('complemento', event.target.value)}
                  />
                </div>
              </div>

              <div className="store-field">
                <label htmlFor="ck-bairro">Bairro</label>
                <input
                  id="ck-bairro"
                  className="store-input"
                  autoComplete="address-level3"
                  aria-invalid={Boolean(errors.bairro)}
                  value={form.bairro}
                  onChange={(event) => update('bairro', event.target.value)}
                />
                {errors.bairro && <span className="store-field-error">{errors.bairro}</span>}
              </div>

              <div className="store-field-row">
                <div className="store-field">
                  <label htmlFor="ck-cidade">Cidade</label>
                  <input
                    id="ck-cidade"
                    className="store-input"
                    autoComplete="address-level2"
                    aria-invalid={Boolean(errors.cidade)}
                    value={form.cidade}
                    onChange={(event) => update('cidade', event.target.value)}
                  />
                  {errors.cidade && <span className="store-field-error">{errors.cidade}</span>}
                </div>

                <div className="store-field store-field-state">
                  <label htmlFor="ck-estado">Estado</label>
                  <input
                    id="ck-estado"
                    className="store-input"
                    maxLength={2}
                    autoComplete="address-level1"
                    placeholder="UF"
                    aria-invalid={Boolean(errors.estado)}
                    value={form.estado}
                    onChange={(event) => update('estado', event.target.value.toUpperCase())}
                  />
                  {errors.estado && <span className="store-field-error">{errors.estado}</span>}
                </div>
              </div>
            </fieldset>

            <fieldset className="store-fieldset">
              <div className="store-frete-options">
                <h3>Frete</h3>
                {FRETE_OPTIONS.map((option) => (
                  <label
                    key={option.tipo}
                    className={`store-frete-option ${selectedFrete.tipo === option.tipo ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="frete"
                      value={option.tipo}
                      checked={selectedFrete.tipo === option.tipo}
                      onChange={() => setFreteTipo(option.tipo)}
                      className="sr-only"
                    />
                    <span className="store-frete-icon">
                      {option.tipo === 'retirada' ? <MapPinIcon /> : <TruckIcon />}
                    </span>
                    <span className="store-frete-info">
                      <strong>{option.label}</strong>
                      <small>{option.prazo}</small>
                    </span>
                    <span className="store-frete-price">
                      {option.valor === 0 ? 'Gratis' : formatCurrency(option.valor)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="store-checkout-actions">
              <div className="store-checkout-actions-total" aria-live="polite">
                <span>Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
              {submitError && <p className="store-checkout-submit-error">{submitError}</p>}
              <button
                type="submit"
                className="store-btn store-btn-primary store-btn-block store-btn-lg store-checkout-submit"
                disabled={submitting || cartItems.length === 0}
                aria-busy={submitting}
              >
                {submitting ? 'Processando pedido...' : `Finalizar pedido - ${formatCurrency(total)}`}
              </button>
            </div>
          </form>

          <aside className="store-checkout-summary">
            <h2>Resumo do pedido</h2>
            <p className="store-checkout-summary-meta">
              {totalItems} {totalItems === 1 ? 'item selecionado' : 'itens selecionados'}
            </p>

            <ul className="store-summary-items">
              {cartItems.map((item) => (
                <li key={item.produtoId} className="store-summary-item">
                  <div className="store-summary-item-img">
                    {item.imagem ? (
                      <img src={item.imagem} alt={item.nome} loading="lazy" />
                    ) : (
                      <div className="store-summary-item-placeholder">{(item.nome || 'P').charAt(0)}</div>
                    )}
                    <span className="store-summary-item-qty">{item.quantidade}</span>
                  </div>

                  <div className="store-summary-item-info">
                    <div className="store-summary-item-top">
                      <span className="store-summary-item-name">{item.nome}</span>
                      <strong className="store-summary-item-total">{formatCurrency(item.preco * item.quantidade)}</strong>
                    </div>
                    <span className="store-summary-item-meta">
                      {item.quantidade} x {formatCurrency(item.preco)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="store-summary-lines">
              <div className="store-summary-line">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="store-summary-line">
                <span>Frete ({selectedFrete.label})</span>
                <span>{selectedFrete.valor === 0 ? 'Gratis' : formatCurrency(selectedFrete.valor)}</span>
              </div>
              <div className="store-summary-line store-summary-total">
                <span>Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
