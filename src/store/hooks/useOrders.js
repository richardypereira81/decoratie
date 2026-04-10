import { useCallback, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'

export function useOrders() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const createOrder = useCallback(async ({ cliente, itens, frete, total }) => {
    setSubmitting(true)
    setError(null)

    try {
      const docRef = await addDoc(collection(db, 'pedidos'), {
        cliente,
        itens,
        frete,
        total,
        status: 'pendente',
        createdAt: serverTimestamp(),
      })

      return docRef.id
    } catch (err) {
      setError(err.message || 'Erro ao criar pedido.')
      return null
    } finally {
      setSubmitting(false)
    }
  }, [])

  return { createOrder, submitting, error }
}
