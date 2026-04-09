import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyC1slI4C0WY7nlpqK5JCiUaCZP3TaCT4no',
  authDomain: 'decoratie-38ba6.firebaseapp.com',
  projectId: 'decoratie-38ba6',
  storageBucket: 'decoratie-38ba6.firebasestorage.app',
  messagingSenderId: '594995445590',
  appId: '1:594995445590:web:dc8711e051715e6c6660f7',
  measurementId: 'G-T2BETS4HM1',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
