export function normalizeCustomerEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function createCustomerApiError(message, data = {}) {
  const error = new Error(message)
  error.code = data?.code || null
  error.details = data?.details || null
  return error
}

async function parseCustomerResponse(response) {
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
    throw createCustomerApiError(data?.erro || 'Nao foi possivel buscar o cliente.', data)
  }

  if (!data?.sucesso) {
    throw createCustomerApiError('Resposta invalida ao buscar o cliente.', data)
  }

  return data
}

export async function fetchCustomerByEmail(email) {
  const normalizedEmail = normalizeCustomerEmail(email)
  let response

  try {
    response = await fetch('/api/clientes/buscar-por-email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail }),
    })
  } catch (error) {
    throw createCustomerApiError(error.message || 'Nao foi possivel acessar a API de clientes.')
  }

  const data = await parseCustomerResponse(response)
  return data?.cliente || null
}
