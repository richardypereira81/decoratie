import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('default')
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'produtos'), (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.ativo !== false)
      setProducts(items)
      setLoading(false)
    })

    const unsubCategories = onSnapshot(collection(db, 'categorias'), (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })

    return () => {
      unsubProducts()
      unsubCategories()
    }
  }, [])

  const uniqueCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories.map((c) => c.nome || c.id).filter(Boolean)
    }
    const fromProducts = [...new Set(products.map((p) => p.categoria).filter(Boolean))]
    return fromProducts.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [categories, products])

  const filteredProducts = useMemo(() => {
    let result = [...products]

    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase()
      result = result.filter((p) =>
        [p.nome, p.descricao, p.categoria].join(' ').toLowerCase().includes(q)
      )
    }

    if (category !== 'all') {
      result = result.filter((p) => p.categoria === category)
    }

    switch (sort) {
      case 'price-asc':
        result.sort((a, b) => (a.precoVenda ?? a.preco) - (b.precoVenda ?? b.preco))
        break
      case 'price-desc':
        result.sort((a, b) => (b.precoVenda ?? b.preco) - (a.precoVenda ?? a.preco))
        break
      case 'recent':
        result.sort((a, b) => {
          const da = a.createdAt?.toDate?.()?.getTime?.() || 0
          const db_ = b.createdAt?.toDate?.()?.getTime?.() || 0
          return db_ - da
        })
        break
      default:
        result.sort((a, b) => {
          if (a.destaque !== b.destaque) return Number(b.destaque) - Number(a.destaque)
          return (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
        })
    }

    return result
  }, [products, deferredSearch, category, sort])

  return {
    products,
    filteredProducts,
    categories: uniqueCategories,
    loading,
    search,
    setSearch,
    category,
    setCategory,
    sort,
    setSort,
  }
}
