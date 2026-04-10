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
    }

    const existingItem = map.get(produtoId)

    if (existingItem) {
      map.set(produtoId, {
        ...existingItem,
        quantidade: existingItem.quantidade + normalizedItem.quantidade,
        nome: existingItem.nome === 'Produto' ? normalizedItem.nome : existingItem.nome,
        preco: existingItem.preco || normalizedItem.preco,
        imagem: existingItem.imagem || normalizedItem.imagem,
      })

      return map
    }

    map.set(produtoId, normalizedItem)
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
    const index = current.findIndex((i) => i.produtoId === produtoId)

    if (index >= 0) {
      const updated = [...current]
      updated[index] = {
        ...updated[index],
        quantidade: updated[index].quantidade + quantityToAdd,
      }
      writeCart(updated)
    } else {
      writeCart([...current, createCartItem(product, quantityToAdd)])
    }
  }, [])

  const removeItem = useCallback((produtoId) => {
    writeCart(readCart().filter((i) => i.produtoId !== produtoId))
  }, [])

  const updateQuantity = useCallback((produtoId, quantidade) => {
    const nextQuantity = Number.parseInt(quantidade, 10)

    if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
      writeCart(readCart().filter((i) => i.produtoId !== produtoId))
      return
    }

    const updated = readCart().map((i) =>
      i.produtoId === produtoId ? { ...i, quantidade: nextQuantity } : i
    )
    writeCart(updated)
  }, [])

  const clearCart = useCallback(() => {
    writeCart([])
  }, [])

  const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantidade, 0), [items])
  const totalPrice = useMemo(() => items.reduce((sum, i) => sum + i.preco * i.quantidade, 0), [items])

  return { items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice }
}
