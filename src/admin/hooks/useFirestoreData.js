import { collection, doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../../lib/firebaseClient.js'

export function useCollectionData(collectionName) {
  const [state, setState] = useState({
    data: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        setState({
          data: snapshot.docs.map((documentSnapshot) => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          })),
          loading: false,
          error: null,
        })
      },
      (error) => {
        setState({
          data: [],
          loading: false,
          error,
        })
      }
    )

    return unsubscribe
  }, [collectionName])

  return state
}

export function useDocumentData(collectionName, documentId, fallbackData) {
  const [state, setState] = useState({
    data: {
      id: documentId,
      ...fallbackData,
    },
    loading: true,
    error: null,
  })

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, collectionName, documentId),
      (snapshot) => {
        setState({
          data: snapshot.exists()
            ? {
                id: snapshot.id,
                ...fallbackData,
                ...snapshot.data(),
              }
            : {
                id: documentId,
                ...fallbackData,
              },
          loading: false,
          error: null,
        })
      },
      (error) => {
        setState({
          data: {
            id: documentId,
            ...fallbackData,
          },
          loading: false,
          error,
        })
      }
    )

    return unsubscribe
  }, [collectionName, documentId, fallbackData])

  return state
}
