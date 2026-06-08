const CART_STOCK_ERROR_MESSAGES = {
  carrinho_estoque_indisponivel: 'Alguns itens do carrinho nao estao mais disponiveis.',
  pedido_estoque_indisponivel: 'Alguns itens do carrinho nao estao mais disponiveis.',
  pedido_item_invalido: 'Um item do carrinho possui dados invalidos.',
  pedido_sem_itens: 'Adicione produtos ao carrinho antes de continuar.',
}

function createCartStockError(message, { code = 'carrinho_validacao_erro', details = null } = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function getStatusMessage(response, data) {
  if (data?.code && CART_STOCK_ERROR_MESSAGES[data.code]) {
    return CART_STOCK_ERROR_MESSAGES[data.code]
  }

  if (data?.erro) {
    return data.erro
  }

  if (response.status === 409) {
    return 'Alguns itens do carrinho foram atualizados.'
  }

  if (response.status >= 500) {
    return 'Nao foi possivel validar o estoque agora. Tente novamente.'
  }

  return 'Nao foi possivel validar o carrinho.'
}

async function parseResponse(response) {
  const text = await response.text()
  let data = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }

  if (!response.ok) {
    throw createCartStockError(getStatusMessage(response, data), {
      code: data?.code || `http_${response.status}`,
      details: data?.details || data?.raw || null,
    })
  }

  if (data?.raw) {
    throw createCartStockError('Resposta invalida da API de estoque.', {
      code: 'resposta_invalida',
      details: data.raw,
    })
  }

  return data
}

async function requestJson(path, { body, method = 'GET' } = {}) {
  const headers = {
    Accept: 'application/json',
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response

  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw createCartStockError('Nao foi possivel acessar a API de estoque.', {
      code: 'falha_rede_estoque',
      details: error.message || null,
    })
  }

  return parseResponse(response)
}

export function isCartStockConflict(error) {
  return error?.code === 'carrinho_estoque_indisponivel' ||
    error?.code === 'pedido_estoque_indisponivel' ||
    Array.isArray(error?.details?.itens)
}

function formatStockIssue(issue) {
  if (issue?.mensagem) {
    return issue.mensagem
  }

  const name = String(issue?.nome || 'Produto').trim() || 'Produto'
  const available = Number(issue?.disponivel)

  if (Number.isFinite(available) && available > 0) {
    return `${name}: disponivel apenas ${Math.floor(available)} unidade(s).`
  }

  return `${name}: estoque esgotou enquanto voce finalizava o carrinho.`
}

export function buildCartStockMessage(error) {
  const issues = Array.isArray(error?.details?.itens) ? error.details.itens : []
  const details = issues.slice(0, 4).map(formatStockIssue).join(' ')
  const suffix = issues.length > 4 ? ' Confira o carrinho atualizado.' : ''

  return [
    'O estoque de alguns itens mudou enquanto voce finalizava o carrinho.',
    'Atualizamos seu carrinho com o estoque atual e mantivemos os demais itens.',
    details,
    suffix,
  ].filter(Boolean).join(' ')
}

export async function validateCartStock(payload) {
  return requestJson('/api/carrinho/validar-estoque', {
    method: 'POST',
    body: payload,
  })
}
