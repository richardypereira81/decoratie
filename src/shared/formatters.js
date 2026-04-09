const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

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

export function formatDateTime(value, fallback = '--') {
  const date = getDateValue(value)
  return date ? shortDateFormatter.format(date) : fallback
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
