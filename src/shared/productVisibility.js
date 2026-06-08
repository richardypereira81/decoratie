import { normalizeProductCategories } from './productCategories.js'

export function hasProductCategory(product) {
  return normalizeProductCategories(product).length > 0
}

export function hasProductImage(product) {
  return Boolean(String(product?.imagem || '').trim())
}

export function isProductStoreVisible(product) {
  return product?.ativo !== false && hasProductCategory(product) && hasProductImage(product)
}
