import { useEffect, useRef, useState } from 'react'
import { CheckIcon, DownloadIcon, SearchIcon } from './AdminIcons.jsx'
import Modal from './Modal.jsx'
import {
  buildRemoteImageDownloadUrl,
  ensureGoogleImageSearchLoaded,
  executeGoogleImageSearch,
  getGoogleImageSearchConfig,
  renderGoogleImageSearch,
  subscribeGoogleImageResults,
} from '../services/productImageService.js'

function normalizeGoogleImageResults(results) {
  const uniqueResults = new Map()

  ;(Array.isArray(results) ? results : []).forEach((result, index) => {
    const imageUrl = result?.image?.url || result?.url || ''
    const thumbnailUrl = result?.thumbnailImage?.url || result?.image?.url || result?.url || ''

    if (!imageUrl && !thumbnailUrl) {
      return
    }

    const key = imageUrl || thumbnailUrl || `${index}`

    if (!uniqueResults.has(key)) {
      uniqueResults.set(key, {
        id: key,
        contextUrl: result?.contextUrl || '',
        height: result?.image?.height || result?.thumbnailImage?.height || null,
        imageUrl,
        thumbnailUrl,
        title: result?.titleNoFormatting || result?.title || 'Imagem encontrada',
        visibleUrl: result?.visibleUrl || '',
        width: result?.image?.width || result?.thumbnailImage?.width || null,
      })
    }
  })

  return [...uniqueResults.values()]
}

function formatDimensions(result) {
  if (!result.width || !result.height) {
    return ''
  }

  return `${result.width} x ${result.height}`
}

export default function ProductImageSearchModal({ initialQuery = '', onClose, onSelectImage, open }) {
  const { cseId, enabled } = getGoogleImageSearchConfig()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchReady, setSearchReady] = useState(false)
  const renderHostRef = useRef(null)
  const gnameRef = useRef(`produto-imagem-${Math.random().toString(36).slice(2, 10)}`)
  const didAutoSearchRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setResults([])
      setLoading(false)
      setError('')
      setSearchReady(false)
      didAutoSearchRef.current = false
      return
    }

    setQuery(initialQuery)
  }, [initialQuery, open])

  useEffect(() => {
    if (!open || !enabled) {
      return undefined
    }

    let active = true
    let unsubscribe = () => {}
    setSearchReady(false)

    ensureGoogleImageSearchLoaded()
      .then(() => {
        if (!active) {
          return
        }

        unsubscribe = subscribeGoogleImageResults(gnameRef.current, ({ results: nextResults }) => {
          if (!active) {
            return
          }

          setResults(normalizeGoogleImageResults(nextResults))
          setLoading(false)
          setError('')
        })

        renderGoogleImageSearch(renderHostRef.current, gnameRef.current)
        setSearchReady(true)
      })
      .catch((loadError) => {
        if (!active) {
          return
        }

        setLoading(false)
        setError(loadError.message || 'Nao foi possivel carregar a busca do Google Imagens.')
      })

    return () => {
      active = false
      unsubscribe()
      setSearchReady(false)

      if (renderHostRef.current) {
        renderHostRef.current.innerHTML = ''
      }
    }
  }, [enabled, open])

  useEffect(() => {
    if (!open || !enabled || !searchReady || didAutoSearchRef.current) {
      return
    }

    const trimmedQuery = String(initialQuery || '').trim()

    if (!trimmedQuery) {
      return
    }

    didAutoSearchRef.current = true
    try {
      setLoading(true)
      setError('')
      executeGoogleImageSearch(gnameRef.current, trimmedQuery)
    } catch (searchError) {
      setLoading(false)
      setError(searchError.message || 'Nao foi possivel iniciar a busca.')
    }
  }, [enabled, initialQuery, open, searchReady])

  function handleSearchSubmit(event) {
    event.preventDefault()

    const trimmedQuery = String(query || '').trim()

    if (!trimmedQuery) {
      setError('Informe o nome do produto para buscar imagens.')
      return
    }

    try {
      setLoading(true)
      setError('')
      executeGoogleImageSearch(gnameRef.current, trimmedQuery)
    } catch (searchError) {
      setLoading(false)
      setError(searchError.message || 'Nao foi possivel iniciar a busca.')
    }
  }

  function handleDownloadImage(result) {
    const link = document.createElement('a')
    link.href = buildRemoteImageDownloadUrl({
      fallbackUrl: result.thumbnailUrl,
      imageUrl: result.imageUrl,
      productName: query || initialQuery || result.title,
    })
    link.rel = 'noopener'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <Modal open={open} onClose={onClose} title="Buscar imagem do produto" width="xlarge">
      <div className="admin-form admin-modal-body">
        <form className="admin-image-search-bar" onSubmit={handleSearchSubmit}>
          <label className="admin-search">
            <SearchIcon className="admin-inline-icon" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquise pelo nome do produto no Google Imagens"
            />
          </label>

          <button type="submit" className="admin-btn" disabled={!enabled || !searchReady || loading}>
            {loading ? 'Buscando...' : 'Buscar imagens'}
          </button>
        </form>

        {!enabled ? (
          <div className="admin-inline-notice is-danger">
            {`Configure VITE_GOOGLE_CSE_ID para ativar a busca integrada no Google Imagens. CSE atual: ${cseId || 'nao configurado'}.`}
          </div>
        ) : null}

        {error ? <div className="admin-inline-notice is-danger">{error}</div> : null}
        {!error && enabled && !searchReady ? <div className="admin-inline-notice">Preparando a busca do Google Imagens...</div> : null}
        {loading ? <div className="admin-inline-notice">Buscando imagens relacionadas ao produto...</div> : null}

        <div ref={renderHostRef} className="sr-only" aria-hidden="true" />

        {results.length ? (
          <div className="admin-image-search-grid">
            {results.map((result) => (
              <article key={result.id} className="admin-image-search-card">
                <div className="admin-image-search-thumb">
                  {result.thumbnailUrl || result.imageUrl ? (
                    <img
                      src={result.thumbnailUrl || result.imageUrl}
                      alt={result.title}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>Sem preview</span>
                  )}
                </div>

                <div className="admin-image-search-copy">
                  <strong>{result.title}</strong>
                  <span>{result.visibleUrl || 'Origem nao identificada'}</span>
                  {formatDimensions(result) ? <small>{formatDimensions(result)}</small> : null}
                </div>

                <div className="admin-image-search-actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    onClick={() => handleDownloadImage(result)}
                  >
                    <DownloadIcon className="admin-inline-icon" />
                    <span>Baixar</span>
                  </button>

                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => {
                      onSelectImage?.(result)
                      onClose?.()
                    }}
                  >
                    <CheckIcon className="admin-inline-icon" />
                    <span>Usar no cadastro</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!loading && enabled && !results.length && !error ? (
          <div className="admin-empty-state">
            <p>Busque pelo nome do produto para carregar opcoes de imagem e salvar no cadastro.</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
