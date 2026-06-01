const FREIGHT_ERROR_MESSAGES = {
  api_indisponivel: 'Melhor Envio indisponivel no momento. Tente novamente em instantes.',
  api_melhor_envio: 'Nao foi possivel consultar o Melhor Envio agora.',
  auth_invalida: 'Sessao administrativa invalida. Entre novamente no painel.',
  auth_obrigatoria: 'Sessao administrativa obrigatoria.',
  carrinho_invalido: 'Os itens do carrinho nao sao validos para cotacao.',
  carrinho_vazio: 'Adicione produtos ao carrinho para calcular o frete.',
  cep_invalido: 'Informe um CEP valido para calcular o frete.',
  cep_origem_nao_configurado: 'Configure o CEP de origem no painel admin.',
  dimensoes_padrao_invalidas: 'Configure valores padrao validos de peso e dimensoes no painel admin.',
  produto_nao_encontrado: 'Um dos produtos do carrinho nao foi encontrado.',
  produto_sem_dimensoes: 'Produtos sem dados de peso ou dimensoes. Revise a area de Logistica no admin.',
  sem_transportadora: 'Nenhuma opcao de entrega disponivel para este CEP.',
  timeout_melhor_envio: 'A consulta ao Melhor Envio demorou demais. Tente novamente.',
  token_invalido: 'Token do Melhor Envio invalido ou sem permissao.',
  token_invalido_ambiente: 'Token invalido para o ambiente selecionado. Confira se ele e de sandbox ou producao.',
  token_sem_permissao: 'Token sem permissao para consultar modalidades do Melhor Envio.',
  token_nao_configurado: 'Integracao de frete nao configurada. Informe o token do Melhor Envio no admin.',
  api_melhor_envio_validacao: 'O Melhor Envio recusou os dados enviados. Revise CEP, peso, dimensoes e modalidades.',
  endpoint_melhor_envio: 'Endpoint do Melhor Envio nao encontrado para a configuracao atual.',
  melhor_envio_nao_conectado: 'Melhor Envio nao conectado. Conecte pelo painel admin.',
  me_etiqueta_ausente: 'Este pedido ainda nao possui etiqueta gerada no Melhor Envio.',
  oauth_ambiente_incorreto: 'Token invalido para o ambiente selecionado. Reconecte usando o ambiente correto.',
  oauth_autorizacao_negada: 'Autorizacao do Melhor Envio cancelada ou negada.',
  oauth_callback_invalido: 'Retorno do Melhor Envio invalido. Inicie a conexao novamente.',
  oauth_client_nao_configurado: 'Configure Client ID e Secret do aplicativo Melhor Envio no painel admin.',
  oauth_credenciais_invalidas: 'Credenciais OAuth invalidas ou autorizacao expirada. Reconecte o Melhor Envio.',
  oauth_refresh_ausente: 'Reconexao necessaria: o Melhor Envio nao retornou refresh token.',
  oauth_resposta_invalida: 'Resposta OAuth invalida do Melhor Envio.',
  oauth_state_expirado: 'Sessao OAuth expirada. Inicie a conexao novamente.',
  oauth_state_invalido: 'Sessao OAuth invalida. Inicie a conexao novamente.',
  oauth_token_erro: 'Nao foi possivel obter token OAuth do Melhor Envio.',
  reconexao_necessaria: 'Reconexao necessaria: sua autorizacao expirou ou foi revogada.',
}

function createFreightError(message, { code = 'frete_erro', details = null, retiradaLocal = null } = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  error.retiradaLocal = retiradaLocal
  return error
}

function getStatusMessage(response, data) {
  if (data?.code && FREIGHT_ERROR_MESSAGES[data.code]) {
    return FREIGHT_ERROR_MESSAGES[data.code]
  }

  if (data?.erro) {
    return data.erro
  }

  if (response.status === 404) {
    return 'Endpoint de frete nao encontrado. Verifique se a API/Cloud Function foi publicada.'
  }

  if (response.status === 401 || response.status === 403) {
    return 'Integracao de frete sem permissao. Verifique o token ou a sessao administrativa.'
  }

  if (response.status === 409) {
    return 'Integracao de frete nao configurada no painel admin.'
  }

  if (response.status === 422) {
    return 'Produtos sem dados logisticos validos para cotacao.'
  }

  if (response.status >= 500) {
    return 'API de frete indisponivel no momento. Tente novamente em instantes.'
  }

  return 'Nao foi possivel calcular o frete com a configuracao atual.'
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
    throw createFreightError(getStatusMessage(response, data), {
      code: data?.code || `http_${response.status}`,
      details: data?.details || data?.raw || null,
      retiradaLocal: data?.retiradaLocal || null,
    })
  }

  if (data?.raw) {
    throw createFreightError('Resposta invalida da API de frete. Verifique a rota interna e o deploy da Function.', {
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
    throw createFreightError(
      'Nao foi possivel acessar a API de frete. Verifique conexao, CORS ou a publicacao da Cloud Function.',
      {
        code: 'falha_rede_frete',
        details: error.message || null,
      },
    )
  }

  return parseResponse(response)
}

async function getAdminToken(user) {
  if (!user?.getIdToken) {
    throw new Error('Sessao administrativa obrigatoria.')
  }

  return user.getIdToken()
}

export async function quoteFreight(payload) {
  return requestJson('/api/frete/cotar', {
    method: 'POST',
    body: payload,
  })
}

export async function getFreightAdminConfig(user) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/frete/config', { token })
}

export async function saveFreightAdminConfig(user, payload) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/frete/config', {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function testFreightAdminConnection(user, payload) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/frete/testar-conexao', {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function fetchFreightAdminServices(user, payload) {
  const token = await getAdminToken(user)
  return requestJson('/api/admin/frete/buscar-transportadoras', {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function startMelhorEnvioOAuth(user, ambiente) {
  const token = await getAdminToken(user)
  const params = new URLSearchParams({ ambiente: ambiente || 'sandbox' })

  return requestJson(`/api/admin/frete/melhor-envio/oauth/start?${params.toString()}`, {
    token,
  })
}

export async function disconnectMelhorEnvioOAuth(user) {
  const token = await getAdminToken(user)

  return requestJson('/api/admin/frete/melhor-envio/desconectar', {
    method: 'POST',
    token,
  })
}

export async function fetchMelhorEnvioOrderLabel(user, pedidoId) {
  const token = await getAdminToken(user)
  const response = await fetch(`/api/admin/pedidos/${pedidoId}/etiqueta-melhor-envio`, {
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

    if (response.ok) {
      const url = data?.url || data?.link || data?.file || data?.downloadUrl

      if (url) {
        return {
          url,
          contentType,
          filename: `etiqueta-melhor-envio-${pedidoId}.pdf`,
        }
      }
    }

    throw createFreightError(getStatusMessage(response, data), {
      code: data?.code || `http_${response.status}`,
      details: data?.details || null,
    })
  }

  if (!response.ok) {
    throw createFreightError(getStatusMessage(response, null), {
      code: `http_${response.status}`,
    })
  }

  const contentDisposition = response.headers.get('content-disposition') || ''
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i)

  return {
    blob: await response.blob(),
    contentType,
    filename: filenameMatch?.[1] || `etiqueta-melhor-envio-${pedidoId}.pdf`,
  }
}
