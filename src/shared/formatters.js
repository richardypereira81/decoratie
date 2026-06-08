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

const DISPLAY_TEXT_ACRONYMS = new Set([
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

const DISPLAY_TEXT_LOWERCASE_WORDS = new Set([
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

const DISPLAY_TEXT_SAFE_REPLACEMENTS = new Map([
  ['aco', 'a\u00e7o'],
  ['alca', 'al\u00e7a'],
  ['alcas', 'al\u00e7as'],
  ['acucareiro', 'a\u00e7ucareiro'],
  ['acucar', 'a\u00e7\u00facar'],
  ['cafe', 'caf\u00e9'],
  ['ceramica', 'cer\u00e2mica'],
  ['cha', 'ch\u00e1'],
  ['catalogo', 'cat\u00e1logo'],
  ['composicao', 'composi\u00e7\u00e3o'],
  ['composicoes', 'composi\u00e7\u00f5es'],
  ['decoracao', 'decora\u00e7\u00e3o'],
  ['disponivel', 'dispon\u00edvel'],
  ['integracao', 'integra\u00e7\u00e3o'],
  ['lencol', 'len\u00e7ol'],
  ['lencos', 'len\u00e7os'],
  ['limao', 'lim\u00e3o'],
  ['pao', 'p\u00e3o'],
  ['peca', 'pe\u00e7a'],
  ['pecas', 'pe\u00e7as'],
  ['presenca', 'presen\u00e7a'],
  ['taca', 'ta\u00e7a'],
  ['tacas', 'ta\u00e7as'],
  ['versatil', 'vers\u00e1til'],
  ['xicara', 'x\u00edcara'],
  ['xicaras', 'x\u00edcaras'],
])

function hasTextLetter(value) {
  return /\p{L}/u.test(value)
}

function isUppercaseDisplayText(value) {
  const letters = Array.from(String(value || ''))
    .filter((char) => /\p{L}/u.test(char))
    .join('')

  return letters.length > 1 &&
    letters === letters.toLocaleUpperCase('pt-BR') &&
    letters !== letters.toLocaleLowerCase('pt-BR')
}

function capitalizeFirstDisplayLetter(value) {
  return String(value || '').replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('pt-BR'))
}

function capitalizeDisplaySentenceStarts(value) {
  return String(value || '').replace(/(^|[.!?]\s+)(\p{L})/gu, (match, prefix, letter) => (
    `${prefix}${letter.toLocaleUpperCase('pt-BR')}`
  ))
}

function splitDisplayToken(token) {
  return String(token || '').match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}./-]+)([^\p{L}\p{N}]*)$/u)
}

function normalizeDisplayCoreText(core) {
  const rawCore = String(core || '')

  if (DISPLAY_TEXT_ACRONYMS.has(rawCore.toLocaleUpperCase('pt-BR'))) {
    return rawCore.toLocaleUpperCase('pt-BR')
  }

  const normalized = rawCore
    .toLocaleLowerCase('pt-BR')
    .replace(/(\d+(?:[,.]\d+)?)(ml|l|cm|mm|m|kg|g|un)$/giu, (_, amount, unit) => (
      `${amount}${unit.toLocaleLowerCase('pt-BR')}`
    ))

  return normalized
    .split(/([./-])/)
    .map((part) => DISPLAY_TEXT_SAFE_REPLACEMENTS.get(part) || part)
    .join('')
}

function normalizeDisplayToken(token, index, mode) {
  const parts = splitDisplayToken(token)

  if (!parts) {
    return String(token || '').toLocaleLowerCase('pt-BR')
  }

  const [, prefix, core, suffix] = parts
  const normalizedCore = normalizeDisplayCoreText(core)
  const rawUpperCore = core.toLocaleUpperCase('pt-BR')

  if (DISPLAY_TEXT_ACRONYMS.has(rawUpperCore) || !hasTextLetter(normalizedCore)) {
    return `${prefix}${normalizedCore}${suffix}`
  }

  if (mode === 'title') {
    const comparable = normalizedCore.toLocaleLowerCase('pt-BR')
    const shouldCapitalize =
      index === 0 ||
      (!DISPLAY_TEXT_LOWERCASE_WORDS.has(comparable) && !comparable.includes('-'))

    return `${prefix}${shouldCapitalize ? capitalizeFirstDisplayLetter(normalizedCore) : normalizedCore}${suffix}`
  }

  return `${prefix}${normalizedCore}${suffix}`
}

export function formatDisplayText(value, mode = 'sentence') {
  const trimmed = sanitizeTextValue(value).replace(/\s+/g, ' ')

  if (!trimmed) {
    return ''
  }

  if (!isUppercaseDisplayText(trimmed)) {
    return mode === 'sentence' ? capitalizeDisplaySentenceStarts(trimmed) : trimmed
  }

  const normalized = trimmed
    .split(' ')
    .map((token, index) => normalizeDisplayToken(token, index, mode))
    .join(' ')

  return mode === 'title' ? normalized : capitalizeDisplaySentenceStarts(normalized)
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
