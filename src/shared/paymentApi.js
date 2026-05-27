const PAYMENT_ERROR_MESSAGES = {
  auth_invalida: 'Sessao administrativa invalida. Entre novamente no painel.',
  auth_obrigatoria: 'Sessao administrativa obrigatoria.',
  mp_api_erro: 'Mercado Pago indisponivel no momento. Tente novamente em instantes.',
  mp_cartao_token_invalido: 'Nao foi possivel validar os dados do cartao.',
  mp_credenciais_invalidas: 'Access Token do Mercado Pago invalido para o ambiente selecionado.',
  mp_desativado: 'Mercado Pago desativado no painel admin.',
  mp_metodo_desativado: 'Forma de pagamento desativada no painel admin.',
  mp_metodo_invalido: 'Forma de pagamento invalida.',
  mp_parcela_invalida: 'Selecione uma opcao de parcelamento valida.',
  mp_parcela_minima: 'A parcela selecionada esta abaixo do minimo permitido.',
  mp_public_key_nao_configurada: 'Public Key do Mercado Pago nao configurada.',
  mp_sem_permissao: 'Access Token sem permissao para pagamentos Mercado Pago.',
  mp_token_nao_configurado: 'Access Token do Mercado Pago nao configurado.',
  mp_validacao: 'O Mercado Pago recusou os dados do pagamento.',
  mp_payment_id_ausente: 'Pagamento ainda nao foi iniciado para este pedido.',
  mp_payment_id_invalido: 'Nao foi possivel validar o pagamento deste pedido.',
  pedido_frete_pendente: 'O frete deste pedido ainda esta a combinar.',
  pedido_id_obrigatorio: 'Pedido obrigatorio para pagamento.',
  pedido_item_invalido: 'Um item do pedido nao possui preco valido.',
  pedido_nao_encontrado: 'Pedido nao encontrado.',
  pedido_sem_itens: 'Pedido sem itens para pagamento.',
  pedido_total_divergente: 'O total do pedido foi atualizado. Revise antes de pagar.',
}

function createPaymentError(message, { code = 'pagamento_erro', details = null } = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function getStatusMessage(response, data) {
  if (data?.code && PAYMENT_ERROR_MESSAGES[data.code]) {
    return PAYMENT_ERROR_MESSAGES[data.code]
  }

  if (data?.erro) {
    return data.erro
  }

  if (response.status === 401 || response.status === 403) {
    return 'Sem permissao para acessar a integracao Mercado Pago.'
  }

  if (response.status === 409) {
    return 'Pagamento Mercado Pago nao configurado corretamente.'
  }

  if (response.status >= 500) {
    return 'API de pagamento indisponivel no momento.'
  }

  return 'Nao foi possivel processar o pagamento.'
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
    throw createPaymentError(getStatusMessage(response, data), {
      code: data?.code || `http_${response.status}`,
      details: data?.details || data?.raw || null,
    })
  }

  if (data?.raw) {
    throw createPaymentError('Resposta invalida da API de pagamento.', {
      code: 'resposta_invalida',
      details: data.raw,
    })
  }

  return data
}

async function requestJson(path, { body, method = 'GET', token } = {}) {
  const headers = {
    Accept: 'application/json',
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response

  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw createPaymentError('Nao foi possivel acessar a API de pagamento.', {
      code: 'falha_rede_pagamento',
      details: error.message || null,
    })
  }

  return parseResponse(response)
}

async function getAdminToken(user) {
  if (!user?.getIdToken) {
    throw new Error('Sessao administrativa obrigatoria.')
  }

  return user.getIdToken()
}

export async function getMercadoPagoPublicConfig() {
  return requestJson('/api/pagamentos/mercado-pago/config-publica')
}

export async function createMercadoPagoPayment(payload) {
  return requestJson('/api/pagamentos/mercado-pago/criar-pagamento', {
    method: 'POST',
    body: payload,
  })
}

export async function consultMercadoPagoCheckoutPayment(payload) {
  return requestJson('/api/pagamentos/mercado-pago/consultar-status', {
    method: 'POST',
    body: payload,
  })
}

export async function getMercadoPagoAdminConfig(user) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/pagamentos/mercado-pago/config', { token })
}

export async function saveMercadoPagoAdminConfig(user, payload) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/pagamentos/mercado-pago/config', {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function testMercadoPagoConnection(user) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/pagamentos/mercado-pago/testar-conexao', {
    method: 'POST',
    token,
  })
}

export async function consultMercadoPagoPayment(user, pedidoId) {
  const token = await getAdminToken(user)
  return requestJson(`/api/admin/pedidos/${pedidoId}/consultar-pagamento`, {
    method: 'POST',
    token,
  })
}
