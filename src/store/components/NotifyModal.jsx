import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { CloseIcon, CheckIcon } from './StoreIcons.jsx'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function NotifyModal({ open, productId, productName, onClose }) {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()

    if (!EMAIL_REGEX.test(email)) {
      setError('Digite um e-mail valido.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await addDoc(collection(db, 'notificacoes_estoque'), {
        produtoId: productId,
        email: email.trim().toLowerCase(),
        data: serverTimestamp(),
      })
      setSuccess(true)
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setEmail('')
    setSuccess(false)
    setError('')
    onClose()
  }

  return (
    <div className="store-modal-overlay" onClick={handleClose}>
      <div className="store-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="store-modal-close" onClick={handleClose} aria-label="Fechar">
          <CloseIcon />
        </button>

        {success ? (
          <div className="store-modal-success">
            <div className="store-modal-success-icon">
              <CheckIcon />
            </div>
            <h3>Pronto!</h3>
            <p>Avisaremos quando <strong>{productName}</strong> estiver disponivel.</p>
            <button type="button" className="store-btn store-btn-primary" onClick={handleClose}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <h3 className="store-modal-title">Avise-me quando chegar</h3>
            <p className="store-modal-desc">
              <strong>{productName}</strong> esta esgotado. Deixe seu e-mail para ser avisado quando voltar ao estoque.
            </p>
            <form onSubmit={handleSubmit} className="store-modal-form">
              <input
                type="email"
                className="store-input"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && <p className="store-modal-error">{error}</p>}
              <button type="submit" className="store-btn store-btn-primary" disabled={saving}>
                {saving ? 'Enviando...' : 'Me avise'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
