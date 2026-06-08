import { normalizeUppercaseText } from './formatters.js'

export const UNCATEGORIZED_CATEGORY_FILTER = '__uncategorized'

function getCategoryName(value) {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    return value.nome || value.name || value.id || ''
  }

  return ''
}

export function normalizeProductCategories(productOrCategories, fallbackCategory = '') {
  const source = Array.isArray(productOrCategories)
    ? productOrCategories
    : productOrCategories?.categorias
  const fallback = Array.isArray(productOrCategories)
    ? fallbackCategory
    : productOrCategories?.categoria || fallbackCategory
  const values = Array.isArray(source) ? [...source] : []

  if (fallback) {
    values.push(fallback)
  }

  const seen = new Set()

  return values.reduce((acc, value) => {
    const category = normalizeUppercaseText(getCategoryName(value))

    if (!category || seen.has(category)) {
      return acc
    }

    seen.add(category)
    acc.push(category)
    return acc
  }, [])
}

export function getPrimaryProductCategory(productOrCategories, fallbackCategory = '') {
  return normalizeProductCategories(productOrCategories, fallbackCategory)[0] || ''
}

export function productMatchesCategory(product, category) {
  if (!category || category === 'all') {
    return true
  }

  if (category === UNCATEGORIZED_CATEGORY_FILTER) {
    return normalizeProductCategories(product).length === 0
  }

  return normalizeProductCategories(product).includes(normalizeUppercaseText(category))
}
