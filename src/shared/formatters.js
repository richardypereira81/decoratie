const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
})

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function cleanTextValue(value) {
  const normalized = String(value ?? '').trim()

  if (!normalized || /^(undefined|null|nan)$/i.test(normalized)) {
    return ''
  }

  return normalized
}

export function getDateValue(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate()
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatCurrency(value) {
  const numericValue = Number(value)
  return currencyFormatter.format(Number.isFinite(numericValue) ? numericValue : 0)
}

export function roundCurrencyValue(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? Math.round(numericValue) : 0
}

export function formatRoundedCurrency(value) {
  return formatCurrency(roundCurrencyValue(value))
}

export function formatDateTime(value, fallback = '--') {
  const date = getDateValue(value)
  return date ? shortDateFormatter.format(date) : fallback
}

export function formatDate(value, fallback = '--') {
  const date = getDateValue(value)
  return date ? dateFormatter.format(date) : fallback
}

export function formatNumber(value, fallback = '0,00') {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numberFormatter.format(numericValue) : fallback
}

export function sanitizeTextValue(value, fallback = '') {
  return cleanTextValue(value) || fallback
}

export function normalizeUppercaseText(value, fallback = '') {
  const normalized = sanitizeTextValue(value, fallback)
  return normalized ? normalized.toLocaleUpperCase('pt-BR') : ''
}

export function formatUppercaseText(value, fallback = '--') {
  return normalizeUppercaseText(value, fallback)
}

export function sanitizeFileName(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getInitials(label) {
  return String(label || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function normalizeMultilineText(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
}
