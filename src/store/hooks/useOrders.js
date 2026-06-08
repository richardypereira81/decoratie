import { useCallback, useState } from 'react'

const ORDER_CREATE_ERROR_MESSAGES = {
  pedido_cliente_invalido: 'Informe os dados do cliente para criar o pedido.',
  pedido_item_invalido: 'Um produto do pedido possui preco invalido.',
  pedido_sem_itens: 'Inclua ao menos um produto no pedido.',
  pedido_estoque_indisponivel: 'Alguns itens do carrinho nao estao mais disponiveis.',
  pedido_total_invalido: 'O total do pedido esta invalido.',
  pedido_cupom_indisponivel: 'O cupom aplicado nao esta mais disponivel. Remova ou escolha outro cupom para continuar.',
  cupom_codigo_invalido: 'O cupom aplicado nao esta mais disponivel. Remova ou escolha outro cupom para continuar.',
  cupom_nao_encontrado: 'O cupom aplicado nao esta mais disponivel. Remova ou escolha outro cupom para continuar.',
  cupom_indisponivel: 'O cupom aplicado nao esta mais disponivel. Remova ou escolha outro cupom para continuar.',
  cupom_expirado: 'O cupom aplicado nao esta mais disponivel. Remova ou escolha outro cupom para continuar.',
  cupom_nao_iniciado: 'O cupom aplicado nao esta mais disponivel. Remova ou escolha outro cupom para continuar.',
  cupom_percentual_invalido: 'O cupom aplicado nao esta mais disponivel. Remova ou escolha outro cupom para continuar.',
  cupom_cliente_obrigatorio: 'Informe CPF ou e-mail para aplicar o cupom.',
  cupom_ja_utilizado: 'Este cupom ja foi utilizado por este CPF ou e-mail.',
}

async function parseOrderCreateResponse(response) {
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
    const message = data?.code && ORDER_CREATE_ERROR_MESSAGES[data.code]
      ? ORDER_CREATE_ERROR_MESSAGES[data.code]
      : data?.erro || 'Erro ao criar pedido.'
    const error = new Error(message)
    error.code = data?.code || null
    error.details = data?.details || null
    error.statusCode = response.status
    throw error
  }

  if (!data?.pedidoId) {
    throw new Error('Resposta invalida ao criar pedido.')
  }

  return data
}

async function createOrderRequest(payload) {
  let response

  try {
    response = await fetch('/api/pedidos', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    throw new Error(error.message || 'Nao foi possivel acessar a API de pedidos.')
  }

  return parseOrderCreateResponse(response)
}

export function useOrders() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const createOrder = useCallback(async ({
    cliente,
    frete,
    itens,
    subtotal,
    desconto = 0,
    descontoPercentual = 0,
    totalSemDesconto = null,
    cupomCodigo = '',
    total,
    status = 'pendente',
    pagamento = null,
    notificationToken = null,
  }) => {
    setSubmitting(true)
    setError(null)

    try {
      const result = await createOrderRequest({
        cliente,
        itens,
        frete,
        subtotal,
        desconto,
        descontoPercentual,
        totalSemDesconto,
        cupomCodigo,
        total,
        status,
        pagamento,
        notificationToken,
        notificationEmailSent: false,
        notificationWhatsappSent: false,
        notificationError: '',
        notificationSentAt: null,
      })

      return result.pedidoId
    } catch (err) {
      setError(err.message || 'Erro ao criar pedido.')
      throw err
    } finally {
      setSubmitting(false)
    }
  }, [])

  return { createOrder, submitting, error }
}
