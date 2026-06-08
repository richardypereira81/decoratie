import { formatCurrency } from './formatters.js'

export const CARD_INSTALLMENTS_COUNT = 3
export const PIX_DISCOUNT_PERCENT = 5

export function roundMoneyValue(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue)
    ? Math.round((numericValue + Number.EPSILON) * 100) / 100
    : 0
}

export function getInstallmentAmount(value, count = CARD_INSTALLMENTS_COUNT) {
  const installments = Math.max(1, Number.parseInt(count, 10) || CARD_INSTALLMENTS_COUNT)
  return roundMoneyValue(Number(value || 0) / installments)
}

export function getInstallmentLabel(value, count = CARD_INSTALLMENTS_COUNT) {
  const installments = Math.max(1, Number.parseInt(count, 10) || CARD_INSTALLMENTS_COUNT)
  return `ate ${installments}x de ${formatCurrency(getInstallmentAmount(value, installments))}`
}

export function calculatePixDiscount(value) {
  return roundMoneyValue(Number(value || 0) * (PIX_DISCOUNT_PERCENT / 100))
}

export function calculateCouponDiscount(subtotal = 0, percent = 0) {
  const subtotalValue = Math.max(0, roundMoneyValue(subtotal))
  const percentValue = Number(percent)

  if (!Number.isFinite(percentValue) || percentValue <= 0) {
    return 0
  }

  return Math.min(
    subtotalValue,
    roundMoneyValue(subtotalValue * (Math.min(percentValue, 100) / 100)),
  )
}

export function calculatePaymentTotals({
  subtotal = 0,
  freight = 0,
  method = '',
  couponDiscount = 0,
} = {}) {
  const subtotalValue = Math.max(0, roundMoneyValue(subtotal))
  const freightValue = Math.max(0, roundMoneyValue(freight))
  const normalizedCouponDiscount = Math.min(
    subtotalValue,
    Math.max(0, roundMoneyValue(couponDiscount)),
  )
  const baseTotal = roundMoneyValue(subtotalValue + freightValue)
  const totalBeforePaymentDiscount = roundMoneyValue(
    subtotalValue - normalizedCouponDiscount + freightValue,
  )
  const discount = method === 'pix' ? calculatePixDiscount(totalBeforePaymentDiscount) : 0

  return {
    baseTotal,
    couponDiscount: normalizedCouponDiscount,
    totalBeforePaymentDiscount,
    discount,
    discountPercent: discount > 0 ? PIX_DISCOUNT_PERCENT : 0,
    total: roundMoneyValue(totalBeforePaymentDiscount - discount),
  }
}
