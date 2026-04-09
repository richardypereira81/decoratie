import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../lib/firebaseClient.js'

const AuthContext = createContext(null)

const initialState = {
  initializing: true,
  user: null,
  error: null,
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(initialState)

  useEffect(() => {
    let active = true

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) {
        return
      }

      setSession({
        initializing: false,
        user,
        error: null,
      })
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  async function refreshSession() {
    setSession({
      initializing: false,
      user: auth.currentUser,
      error: null,
    })
  }

  async function signOutUser() {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{
        ...session,
        refreshSession,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthSession() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error('useAuthSession deve ser usado dentro de AuthProvider.')
  }

  return value
}
