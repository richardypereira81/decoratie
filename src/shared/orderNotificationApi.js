const ORDER_NOTIFICATION_ERROR_MESSAGES = {
  pedido_id_obrigatorio: 'Pedido obrigatorio para notificar a loja.',
  pedido_nao_encontrado: 'Pedido nao encontrado para notificacao.',
  notificacao_token_invalido: 'Nao foi possivel validar a notificacao deste pedido.',
  codigo_rastreio_obrigatorio: 'Informe o codigo de rastreio para notificar o cliente.',
  auth_invalida: 'Sessao administrativa invalida. Entre novamente no painel.',
  auth_obrigatoria: 'Sessao administrativa obrigatoria.',
}

function createOrderNotificationError(message, { code = 'notificacao_pedido_erro', details = null } = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function getStatusMessage(response, data) {
  if (data?.code && ORDER_NOTIFICATION_ERROR_MESSAGES[data.code]) {
    return ORDER_NOTIFICATION_ERROR_MESSAGES[data.code]
  }

  if (data?.erro) {
    return data.erro
  }

  if (response.status >= 500) {
    return 'API de notificacao indisponivel no momento.'
  }

  return 'Nao foi possivel notificar a loja sobre o pedido.'
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
    throw createOrderNotificationError(getStatusMessage(response, data), {
      code: data?.code || `http_${response.status}`,
      details: data?.details || data?.raw || null,
    })
  }

  if (data?.raw) {
    throw createOrderNotificationError('Resposta invalida da API de notificacao.', {
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
    throw createOrderNotificationError('Nao foi possivel acessar a API de notificacao.', {
      code: 'falha_rede_notificacao',
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

export async function notifyNewOrder({ pedidoId, notificationToken }) {
  return requestJson(`/api/pedidos/${pedidoId}/notificar-novo-pedido`, {
    method: 'POST',
    body: { notificationToken },
  })
}

export async function getOrderNotificationAdminConfig(user) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/notificacoes-pedido/config', { token })
}

export async function saveOrderNotificationAdminConfig(user, payload) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/notificacoes-pedido/config', {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function resendOrderNotification(user, pedidoId) {
  const token = await getAdminToken(user)
  return requestJson(`/api/admin/pedidos/${pedidoId}/reenviar-notificacao`, {
    method: 'POST',
    token,
  })
}

export async function notifyOrderTrackingStatus(user, pedidoId, trackingCode) {
  const token = await getAdminToken(user)
  return requestJson(`/api/admin/pedidos/${pedidoId}/notificar-rastreio`, {
    method: 'POST',
    token,
    body: { trackingCode },
  })
}

export async function normalizeOrderNumbers(user) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/pedidos/normalizar-numeros', {
    method: 'POST',
    token,
  })
}

export async function fetchOrderReportPdf(user, pedidoId) {
  const token = await getAdminToken(user)
  const response = await fetch(`/api/admin/pedidos/${pedidoId}/relatorio-pdf`, {
    headers: {
      Accept: 'application/pdf, application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    let data = null

    try {
      data = await response.json()
    } catch {
      data = null
    }

    if (!response.ok) {
      throw createOrderNotificationError(getStatusMessage(response, data), {
        code: data?.code || `http_${response.status}`,
        details: data?.details || null,
      })
    }
  }

  if (!response.ok) {
    throw createOrderNotificationError(getStatusMessage(response, null), {
      code: `http_${response.status}`,
    })
  }

  const contentDisposition = response.headers.get('content-disposition') || ''
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i)

  return {
    blob: await response.blob(),
    contentType,
    filename: filenameMatch?.[1] || `decoratie-pedido-${pedidoId}-relatorio.pdf`,
  }
}
