import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebaseClient.js'
import { defaultLandingContent, defaultProducts, defaultSettings } from './siteDefaults.js'

function mapDocument(snapshot) {
  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data(),
  }))
}

function sortProducts(products) {
  return [...products].sort((first, second) => {
    if (first.destaque !== second.destaque) {
      return Number(second.destaque) - Number(first.destaque)
    }

    return String(first.nome || '').localeCompare(String(second.nome || ''), 'pt-BR')
  })
}

export async function fetchPublicSiteData() {
  const [contentSnapshot, settingsSnapshot, productsSnapshot] = await Promise.all([
    getDoc(doc(db, 'conteudo', 'landing')),
    getDoc(doc(db, 'configuracoes', 'geral')),
    getDocs(collection(db, 'produtos')),
  ])

  const content = {
    ...defaultLandingContent,
    ...(contentSnapshot.exists() ? contentSnapshot.data() : {}),
  }

  const settings = {
    ...defaultSettings,
    ...(settingsSnapshot.exists() ? settingsSnapshot.data() : {}),
  }

  const activeProducts = mapDocument(productsSnapshot).filter((product) => product.ativo !== false)

  return {
    content,
    settings,
    products: activeProducts.length ? sortProducts(activeProducts) : defaultProducts,
  }
}
