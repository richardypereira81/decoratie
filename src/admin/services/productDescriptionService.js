function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function cleanLabel(value) {
  return String(value || '').trim()
}

function buildSearchText({ nome, categoria = '', setor = '' }) {
  return normalizeText([nome, categoria, setor].join(' '))
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripLeadingProductName(description, nome) {
  const currentDescription = cleanLabel(description)
  const productName = cleanLabel(nome)

  if (!currentDescription || !productName) {
    return currentDescription
  }

  const matcher = new RegExp(`^${escapeRegExp(productName)}(?:\\s*[-:,.|]\\s*|\\s+)(?:e\\s+)?`, 'i')
  const strippedDescription = currentDescription.replace(matcher, '').trim()

  return strippedDescription || currentDescription
}

function findFirstProfile(searchText) {
  const profiles = [
    {
      intro: 'Peca pensada para unir presenca visual e boa integracao com diferentes composicoes de interiores.',
      keywords: ['cadeira', 'chair', 'banqueta', 'banco alto'],
      usage: 'Funciona bem em salas de jantar, areas gourmet, recepcoes e ambientes que pedem apoio com leitura elegante.',
    },
    {
      intro: 'Peca desenvolvida para equilibrar apoio funcional e protagonismo decorativo no ambiente.',
      keywords: ['mesa', 'table'],
      usage: 'Pode compor propostas de jantar, apoio lateral ou destaque central, ajudando a organizar o espaco com mais fluidez.',
    },
    {
      intro: 'Peca criada para valorizar conforto visual e reforcar a identidade do ambiente.',
      keywords: ['poltrona', 'armchair'],
      usage: 'Se adapta bem a cantos de leitura, livings, recepcoes e composicoes que precisam de um ponto de destaque.',
    },
    {
      intro: 'Peca pensada para compor ambientes acolhedores com presenca e proporcionalidade.',
      keywords: ['sofa', 'sofa', 'chaise'],
      usage: 'Ajuda a estruturar a area social e conversa com layouts que priorizam conforto, permanencia e composicao refinada.',
    },
    {
      intro: 'Movel de apoio desenhado para organizar o ambiente sem perder leitura decorativa.',
      keywords: ['aparador', 'buffet', 'rack', 'balcao', 'balcao', 'console', 'comoda', 'comoda'],
      usage: 'Entrega praticidade para apoio e armazenamento, funcionando bem em salas, halls, jantar e ambientes de passagem.',
    },
    {
      intro: 'Peca pensada para exposicao, organizacao e composicao visual do ambiente.',
      keywords: ['estante', 'prateleira', 'nicho', 'livreiro'],
      usage: 'Contribui para ambientacoes que pedem apoio decorativo, organizacao e leitura mais autoral na composicao.',
    },
    {
      intro: 'Luminaria criada para reforcar atmosfera, destaque visual e funcionalidade no projeto.',
      keywords: ['luminaria', 'luminaria', 'abajur', 'pendente', 'arandela', 'lampada', 'luz'],
      usage: 'Ajuda a qualificar a iluminacao do ambiente e a construir cenas mais acolhedoras, equilibradas e sofisticadas.',
    },
    {
      intro: 'Peca pensada para delimitar o ambiente e trazer mais textura para a composicao.',
      keywords: ['tapete', 'carpete', 'passadeira'],
      usage: 'Funciona bem em salas, quartos e areas de convivio, ajudando a aquecer visualmente o espaco.',
    },
    {
      intro: 'Peca decorativa criada para agregar personalidade e acabamento ao ambiente.',
      keywords: ['vaso', 'cachepot', 'centro de mesa', 'bandeja', 'escultura', 'objeto', 'decorativo', 'decoracao', 'decoracao', 'quadro'],
      usage: 'Valoriza aparadores, mesas, estantes e composicoes de apoio com um ponto de interesse mais refinado.',
    },
    {
      intro: 'Peca pensada para ampliar a percepcao do ambiente e reforcar a composicao decorativa.',
      keywords: ['espelho', 'mirror'],
      usage: 'Pode ser usado em halls, lavabos, salas e quartos, contribuindo para luminosidade e profundidade visual.',
    },
    {
      intro: 'Peca desenvolvida para ambientes de descanso que pedem conforto visual e composicao equilibrada.',
      keywords: ['cama', 'cabec', 'cabeceira', 'criado', 'guarda-roupa', 'roupeiro', 'colchao', 'colchao'],
      usage: 'Se adapta bem a quartos com proposta contemporanea, classica ou acolhedora, ajudando a organizar a rotina com mais presenca.',
    },
    {
      intro: 'Conjunto pensado para compor o ambiente com unidade visual e praticidade no uso.',
      keywords: ['jogo', 'conjunto', 'kit'],
      usage: 'A proposta em conjunto facilita a composicao do espaco e ajuda a manter coerencia entre os elementos da ambientacao.',
    },
  ]

  return profiles.find((profile) => profile.keywords.some((keyword) => searchText.includes(normalizeText(keyword)))) || null
}

function buildMaterialSentence(searchText) {
  const materials = [
    {
      keywords: ['madeira', 'wood'],
      sentence: 'A referencia em madeira reforca uma leitura acolhedora e facilita combinacoes com acabamentos naturais e atemporais.',
    },
    {
      keywords: ['metal', 'aco', 'aco', 'ferro'],
      sentence: 'A presenca de metal contribui para um visual mais firme, contemporaneo e facil de integrar a diferentes propostas.',
    },
    {
      keywords: ['vidro', 'glass'],
      sentence: 'O destaque em vidro ajuda a manter leveza visual e valoriza composicoes mais elegantes e iluminadas.',
    },
    {
      keywords: ['ceramica', 'ceramica', 'porcelana'],
      sentence: 'A leitura ceramica reforca acabamento, personalidade e boa adaptacao a composicoes decorativas mais refinadas.',
    },
    {
      keywords: ['marmore', 'marmore', 'travertino', 'pedra'],
      sentence: 'A referencia em pedra ou marmore valoriza o produto com uma leitura sofisticada e de forte impacto visual.',
    },
    {
      keywords: ['linho', 'tecido', 'veludo', 'couro', 'boucle', 'boucle', 'suede'],
      sentence: 'A presenca de tecido contribui para uma composicao mais acolhedora e confortavel no uso diario.',
    },
    {
      keywords: ['rattan', 'fibra', 'palha'],
      sentence: 'A leitura em fibra natural aproxima o produto de ambientes leves, organicos e com atmosfera acolhedora.',
    },
  ]

  const material = materials.find((item) => item.keywords.some((keyword) => searchText.includes(normalizeText(keyword))))
  return material?.sentence || ''
}

function buildContextSentence({ categoria = '', setor = '' }) {
  const categoryLabel = cleanLabel(categoria)
  const sectorLabel = cleanLabel(setor)
  const parts = []

  if (sectorLabel) {
    parts.push(`ambientes voltados para ${sectorLabel.toLowerCase()}`)
  }

  if (categoryLabel) {
    parts.push(`linhas com foco em ${categoryLabel.toLowerCase()}`)
  }

  if (!parts.length) {
    return ''
  }

  if (parts.length === 1) {
    return `Se adapta bem a ${parts[0]}, mantendo versatilidade para diferentes estilos de ambientacao.`
  }

  return `Se adapta bem a ${parts[0]} e tambem conversa com ${parts[1]}, mantendo coerencia visual na composicao do espaco.`
}

export function isImportedXmlPlaceholderDescription(value) {
  return /^importado via xml da nota\b/i.test(String(value || '').trim())
}

export function generateSuggestedProductDescription({ nome, categoria = '', setor = '' }) {
  const productName = cleanLabel(nome)

  if (!productName) {
    return ''
  }

  const searchText = buildSearchText({ nome, categoria, setor })
  const profile = findFirstProfile(searchText)
  const intro = profile?.intro || 'Peca desenvolvida para agregar funcionalidade e presenca visual ao ambiente.'
  const usage = profile?.usage || 'Seu desenho favorece composicoes equilibradas e permite encaixe versatil em diferentes propostas de decoracao.'
  const contextSentence = buildContextSentence({ categoria, setor })
  const materialSentence = buildMaterialSentence(searchText)

  return stripLeadingProductName(
    [intro, usage, contextSentence || materialSentence || 'A proposta conversa bem com ambientes que pedem praticidade, leitura elegante e boa integracao decorativa.']
      .filter(Boolean)
      .join(' '),
    productName
  )
}

export function resolveProductDescription({ nome, categoria = '', setor = '', descricao = '' }) {
  const currentDescription = stripLeadingProductName(cleanLabel(descricao), nome)

  if (currentDescription && !isImportedXmlPlaceholderDescription(currentDescription)) {
    return currentDescription
  }

  return stripLeadingProductName(generateSuggestedProductDescription({ nome, categoria, setor }), nome) || currentDescription
}
