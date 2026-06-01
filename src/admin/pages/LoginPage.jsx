import { useEffect, useState } from 'react'
import { browserLocalPersistence, setPersistence, signInWithEmailAndPassword } from 'firebase/auth'
import { Navigate, useSearchParams } from 'react-router-dom'
import { auth } from '../../lib/firebaseClient.js'
import { useAuthSession } from '../AuthContext.jsx'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const { initializing, user } = useAuthSession()
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const nextPath = searchParams.get('next') || '/admin'

  useEffect(() => {
    document.body.classList.add('admin-mode')
    return () => {
      document.body.classList.remove('admin-mode')
    }
  }, [])

  if (!initializing && user) {
    return <Navigate replace to={nextPath} />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await setPersistence(auth, browserLocalPersistence)
      await signInWithEmailAndPassword(auth, form.email, form.password)
    } catch (loginError) {
      const messageByCode = {
        'auth/invalid-credential': 'E-mail ou senha inválidos.',
        'auth/user-not-found': 'Nenhum usuário encontrado com este e-mail.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      }

      setError(messageByCode[loginError.code] || 'Não foi possível entrar. Revise suas credenciais.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card auth-form" onSubmit={handleSubmit}>
        <label className="admin-field">
          <span>E-mail</span>
          <input
            className="admin-input"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="contato@decoratie.com"
            required
          />
        </label>

        <label className="admin-field">
          <span>Senha</span>
          <input
            className="admin-input"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Sua senha"
            required
          />
        </label>

        {error ? <p className="admin-helper-error">{error}</p> : null}

        <button type="submit" className="admin-btn auth-submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar no painel'}
        </button>
      </form>
    </div>
  )
}
