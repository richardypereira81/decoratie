const ORIGEM_PRODUTO_OPTIONS = [
  {
    value: '0',
    title: 'Nacional',
    description: 'Produzido no Brasil, sem materias-primas importadas.',
  },
  {
    value: '1',
    title: 'Estrangeira',
    description: 'Importacao direta.',
  },
  {
    value: '2',
    title: 'Estrangeira',
    description: 'Adquirida no mercado interno.',
  },
  {
    value: '3',
    title: 'Nacional (40% < Imp < 70%)',
    description: 'Conteudo de importacao entre 40% e 70%.',
  },
  {
    value: '4',
    title: 'Nacional (PPB)',
    description: 'Produzido conforme Processos Produtivos Basicos.',
  },
  {
    value: '5',
    title: 'Nacional (Imp <= 40%)',
    description: 'Conteudo de importacao igual ou inferior a 40%.',
  },
  {
    value: '6',
    title: 'Estrangeira (sem similar)',
    description: 'Importacao direta, sem similar nacional, listada na Camex.',
  },
  {
    value: '7',
    title: 'Estrangeira (sem similar)',
    description: 'Adquirida no mercado interno, sem similar nacional, listada na Camex.',
  },
  {
    value: '8',
    title: 'Nacional (> 70%)',
    description: 'Conteudo de importacao superior a 70%.',
  },
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function buildOptionAliases(option) {
  const shortLabel = `${option.value} - ${option.title}`
  const fullLabel = `${shortLabel}: ${option.description}`

  return [
    option.value,
    shortLabel,
    fullLabel,
    option.title,
    option.description,
  ].map(normalizeText)
}

const ORIGEM_PRODUTO_LOOKUP = new Map(
  ORIGEM_PRODUTO_OPTIONS.map((option) => [option.value, option])
)

const ORIGEM_PRODUTO_ALIASES = new Map(
  ORIGEM_PRODUTO_OPTIONS.flatMap((option) =>
    buildOptionAliases(option).map((alias) => [alias, option.value])
  )
)

export { ORIGEM_PRODUTO_OPTIONS }

export function isKnownOrigemProdutoValue(value) {
  return ORIGEM_PRODUTO_LOOKUP.has(String(value || '').trim())
}

export function normalizeOrigemProdutoValue(value) {
  const rawValue = String(value || '').trim()

  if (!rawValue) {
    return ''
  }

  if (ORIGEM_PRODUTO_LOOKUP.has(rawValue)) {
    return rawValue
  }

  const normalizedValue = normalizeText(rawValue)

  if (ORIGEM_PRODUTO_ALIASES.has(normalizedValue)) {
    return ORIGEM_PRODUTO_ALIASES.get(normalizedValue)
  }

  const codeMatch = rawValue.match(/^([0-8])(?:\s*[-:)]|\b)/)
  return codeMatch ? codeMatch[1] : ''
}

export function getOrigemProdutoOption(value) {
  return ORIGEM_PRODUTO_LOOKUP.get(normalizeOrigemProdutoValue(value)) || null
}

export function formatOrigemProduto(value, fallback = '') {
  const option = getOrigemProdutoOption(value)
  return option ? `${option.value} - ${option.title}` : String(value || fallback)
}

export function formatOrigemProdutoDetailed(value, fallback = '') {
  const option = getOrigemProdutoOption(value)
  return option ? `${option.value} - ${option.title}: ${option.description}` : String(value || fallback)
}
