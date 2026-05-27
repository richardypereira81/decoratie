export const DEFAULT_WHATSAPP_MESSAGE = 'Olá, vim pela loja Decoratie e gostaria de atendimento.'

export function getDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function normalizeWhatsAppNumber(value) {
  const digits = getDigits(value)

  if (!digits || /^0+$/.test(digits)) {
    return ''
  }

  if (digits.startsWith('55')) {
    const nationalNumber = digits.slice(2)
    return nationalNumber.length >= 10 && nationalNumber.length <= 11 && !/^0+$/.test(nationalNumber)
      ? digits
      : ''
  }

  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`
  }

  return ''
}

export function getWhatsAppInputNumber(settings = {}) {
  const configuredNumber = settings.whatsapp?.numero || settings.whatsappNumero

  if (configuredNumber) {
    return getDigits(configuredNumber)
  }

  return getDigits(settings.whatsappLink)
}

export function buildWhatsAppUrl(number, message = DEFAULT_WHATSAPP_MESSAGE) {
  const normalizedNumber = normalizeWhatsAppNumber(number)

  if (!normalizedNumber) {
    return ''
  }

  const cleanMessage = String(message || DEFAULT_WHATSAPP_MESSAGE).trim() || DEFAULT_WHATSAPP_MESSAGE
  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(cleanMessage)}`
}

export function getWhatsAppUrlFromSettings(settings = {}) {
  if (settings.whatsapp?.ativo === false && getDigits(settings.whatsapp?.numero)) {
    return ''
  }

  const number = getWhatsAppInputNumber(settings)
  const message = settings.whatsapp?.mensagemPadrao || DEFAULT_WHATSAPP_MESSAGE
  return buildWhatsAppUrl(number, message)
}
