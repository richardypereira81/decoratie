import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { defaultSettings } from '../../data/siteDefaults.js'
import { db } from '../../lib/firebaseClient.js'

export function useStoreSettings() {
  const [state, setState] = useState({
    data: defaultSettings,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'configuracoes', 'geral'),
      (snapshot) => {
        setState({
          data: snapshot.exists()
            ? {
                ...defaultSettings,
                ...snapshot.data(),
              }
            : defaultSettings,
          loading: false,
          error: null,
        })
      },
      (error) => {
        setState({
          data: defaultSettings,
          loading: false,
          error,
        })
      },
    )

    return unsubscribe
  }, [])

  return state
}
