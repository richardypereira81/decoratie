import { useCallback, useMemo, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'decoratie_cart'

let listeners = []
let cachedItems = null

function getStorage() {
  return globalThis.localStorage
}

function toCurrencyValue(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function toQuantityValue(value) {
  const quantity = Number.parseInt(value, 10)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

function toOptionalText(value) {
  return String(value ?? '').trim()
}

function getCartItemUnitKey(item) {
  return [
    item?.variacaoId,
    item?.skuId,
  ].map(toOptionalText).filter(Boolean).join('|')
}

function buildCartItemKey(produtoId, unitKey = '') {
  return `${String(produtoId || '').trim()}::${String(unitKey || '').trim()}`
}

function getCartItemKey(item) {
  return buildCartItemKey(item?.produtoId ?? item?.id, getCartItemUnitKey(item))
}

function normalizeCartItems(items) {
  if (!Array.isArray(items)) {
    return []
  }

  const groupedItems = items.reduce((map, item) => {
    const produtoId = String(item?.produtoId ?? item?.id ?? '').trim()

    if (!produtoId) {
      return map
    }

    const normalizedItem = {
      produtoId,
      nome: String(item?.nome ?? 'Produto').trim() || 'Produto',
      preco: toCurrencyValue(item?.precoVenda ?? item?.preco),
      quantidade: toQuantityValue(item?.quantidade),
      imagem: typeof item?.imagem === 'string' ? item.imagem : '',
      variacaoId: toOptionalText(item?.variacaoId ?? item?.variationId),
      skuId: toOptionalText(item?.skuId ?? item?.sku),
      variacaoNome: toOptionalText(item?.variacaoNome ?? item?.variationName),
      skuNome: toOptionalText(item?.skuNome ?? item?.skuName),
    }
    const itemKey = getCartItemKey(normalizedItem)

    const existingItem = map.get(itemKey)

    if (existingItem) {
      map.set(itemKey, {
        ...existingItem,
        quantidade: existingItem.quantidade + normalizedItem.quantidade,
        nome: existingItem.nome === 'Produto' ? normalizedItem.nome : existingItem.nome,
        preco: existingItem.preco || normalizedItem.preco,
        imagem: existingItem.imagem || normalizedItem.imagem,
      })

      return map
    }

    map.set(itemKey, normalizedItem)
    return map
  }, new Map())

  return Array.from(groupedItems.values())
}

function getProductId(product) {
  return String(product?.id ?? product?.produtoId ?? '').trim()
}

function createCartItem(product, quantity) {
  return {
    produtoId: getProductId(product),
    nome: String(product?.nome ?? 'Produto').trim() || 'Produto',
    preco: toCurrencyValue(product?.precoVenda ?? product?.preco),
    quantidade: toQuantityValue(quantity),
    imagem: typeof product?.imagem === 'string' ? product.imagem : '',
    variacaoId: toOptionalText(product?.variacaoId ?? product?.variationId),
    skuId: toOptionalText(product?.skuId ?? product?.sku),
    variacaoNome: toOptionalText(product?.variacaoNome ?? product?.variationName),
    skuNome: toOptionalText(product?.skuNome ?? product?.skuName),
  }
}

function readCart() {
  if (cachedItems) return cachedItems
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY)
    cachedItems = normalizeCartItems(raw ? JSON.parse(raw) : [])
  } catch {
    cachedItems = []
  }
  return cachedItems
}

function writeCart(items) {
  cachedItems = normalizeCartItems(items)
  getStorage()?.setItem(STORAGE_KEY, JSON.stringify(cachedItems))
  listeners.forEach((fn) => fn())
}

function subscribe(callback) {
  listeners.push(callback)
  return () => {
    listeners = listeners.filter((fn) => fn !== callback)
  }
}

function getSnapshot() {
  return readCart()
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot)

  const addItem = useCallback((product, quantity = 1) => {
    const produtoId = getProductId(product)

    if (!produtoId) {
      return
    }

    const quantityToAdd = toQuantityValue(quantity)
    const current = readCart()
    const productItem = createCartItem(product, quantityToAdd)
    const itemKey = getCartItemKey(productItem)
    const index = current.findIndex((i) => getCartItemKey(i) === itemKey)

    if (index >= 0) {
      const updated = [...current]
      updated[index] = {
        ...updated[index],
        quantidade: updated[index].quantidade + quantityToAdd,
      }
      writeCart(updated)
    } else {
      writeCart([...current, productItem])
    }
  }, [])

  const removeItem = useCallback((produtoId, unitKey = '') => {
    const itemKey = buildCartItemKey(produtoId, unitKey)
    writeCart(readCart().filter((i) => getCartItemKey(i) !== itemKey))
  }, [])

  const updateQuantity = useCallback((produtoId, quantidade, unitKey = '') => {
    const nextQuantity = Number.parseInt(quantidade, 10)
    const itemKey = buildCartItemKey(produtoId, unitKey)

    if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
      writeCart(readCart().filter((i) => getCartItemKey(i) !== itemKey))
      return
    }

    const updated = readCart().map((i) =>
      getCartItemKey(i) === itemKey ? { ...i, quantidade: nextQuantity } : i
    )
    writeCart(updated)
  }, [])

  const replaceItems = useCallback((nextItems = []) => {
    writeCart(nextItems)
  }, [])

  const clearCart = useCallback(() => {
    writeCart([])
  }, [])

  const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantidade, 0), [items])
  const totalPrice = useMemo(() => items.reduce((sum, i) => sum + i.preco * i.quantidade, 0), [items])

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    replaceItems,
    clearCart,
    totalItems,
    totalPrice,
  }
}
