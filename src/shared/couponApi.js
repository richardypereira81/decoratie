import { calculateCouponDiscount } from './pricing.js'

const COUPON_ERROR_MESSAGES = {
  cupom_codigo_invalido: 'Informe um cupom valido.',
  cupom_nao_encontrado: 'Cupom nao encontrado.',
  cupom_indisponivel: 'Este cupom nao esta disponivel.',
  cupom_expirado: 'Este cupom expirou.',
  cupom_nao_iniciado: 'Este cupom ainda nao esta disponivel.',
  cupom_percentual_invalido: 'Este cupom esta com configuracao invalida.',
  cupom_subtotal_invalido: 'Este cupom nao pode ser aplicado neste carrinho.',
  cupom_cliente_obrigatorio: 'Informe CPF ou e-mail para aplicar o cupom.',
  cupom_ja_utilizado: 'Este cupom ja foi utilizado por este CPF ou e-mail.',
}

export function normalizeCouponCode(value) {
  return String(value || '').trim().toLocaleUpperCase('pt-BR')
}

export function isValidCouponCode(value) {
  return /^[A-Z0-9]+$/.test(normalizeCouponCode(value))
}

export function buildLocalCouponApplication(coupon, subtotal) {
  if (!coupon?.codigo) {
    return null
  }

  const percentual = Number(coupon.percentual || 0)

  return {
    ...coupon,
    codigo: normalizeCouponCode(coupon.codigo),
    tipo: coupon.tipo || 'porcentagem',
    percentual,
    valorDesconto: calculateCouponDiscount(subtotal, percentual),
  }
}

function createCouponApiError(message, data = {}) {
  const error = new Error(message)
  error.code = data?.code || null
  error.details = data?.details || null
  return error
}

async function parseCouponResponse(response) {
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
    const message = data?.code && COUPON_ERROR_MESSAGES[data.code]
      ? COUPON_ERROR_MESSAGES[data.code]
      : data?.erro || 'Nao foi possivel validar o cupom.'
    throw createCouponApiError(message, data)
  }

  if (!data?.cupom?.codigo) {
    throw createCouponApiError('Resposta invalida ao validar o cupom.', data)
  }

  return data.cupom
}

export async function validateCoupon({ codigo, subtotal, email = '', cpf = '' }) {
  let response

  try {
    response = await fetch('/api/cupons/validar', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        codigo: normalizeCouponCode(codigo),
        subtotal,
        email,
        cpf,
      }),
    })
  } catch (error) {
    throw createCouponApiError(error.message || 'Nao foi possivel acessar a API de cupons.')
  }

  return parseCouponResponse(response)
}
