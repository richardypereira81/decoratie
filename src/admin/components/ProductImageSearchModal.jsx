import { useEffect, useRef, useState } from 'react'
import { defaultSettings } from '../../data/siteDefaults.js'
import { CheckIcon, DownloadIcon, SearchIcon } from './AdminIcons.jsx'
import Modal from './Modal.jsx'
import {
  buildGoogleImagesSearchUrl,
  buildRemoteImageDownloadUrl,
  ensureGoogleImageSearchLoaded,
  executeGoogleImageSearch,
  getGoogleImageSearchConfig,
  renderGoogleImageSearch,
  subscribeGoogleImageResults,
} from '../services/productImageService.js'
import { useDocumentData } from '../hooks/useFirestoreData.js'

function normalizeGoogleImageResults(results) {
  const uniqueResults = new Map()

  ;(Array.isArray(results) ? results : []).forEach((result, index) => {
    const richSnippet = result?.richSnippet || result?.richsnippet || {}
    const pageMap = result?.pagemap || {}
    const pageMapImage = Array.isArray(pageMap.cse_image) ? pageMap.cse_image[0] : null
    const pageMapThumbnail = Array.isArray(pageMap.cse_thumbnail) ? pageMap.cse_thumbnail[0] : null
    const imageUrl =
      result?.image?.url ||
      result?.image?.src ||
      result?.image?.thumbnailLink ||
      result?.url ||
      result?.unescapedUrl ||
      result?.originalUrl ||
      result?.contentUrl ||
      result?.mediaUrl ||
      richSnippet?.cseImage?.src ||
      richSnippet?.cse_image?.src ||
      pageMapImage?.src ||
      ''
    const thumbnailUrl =
      result?.thumbnailImage?.url ||
      result?.thumbnailUrl ||
      result?.thumbnail ||
      result?.tbUrl ||
      result?.image?.thumbnailLink ||
      richSnippet?.cseThumbnail?.src ||
      richSnippet?.cse_thumbnail?.src ||
      pageMapThumbnail?.src ||
      imageUrl

    if (!imageUrl && !thumbnailUrl) {
      return
    }

    const key = imageUrl || thumbnailUrl || `${index}`

    if (!uniqueResults.has(key)) {
      uniqueResults.set(key, {
        id: key,
        contextUrl: result?.contextUrl || '',
        height: result?.image?.height || result?.thumbnailImage?.height || result?.height || pageMapThumbnail?.height || null,
        imageUrl,
        thumbnailUrl,
        title: result?.titleNoFormatting || result?.title || 'Imagem encontrada',
        visibleUrl: result?.visibleUrl || result?.displayLink || '',
        width: result?.image?.width || result?.thumbnailImage?.width || result?.width || pageMapThumbnail?.width || null,
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

function openGoogleImagesSearch(query) {
  window.open(buildGoogleImagesSearchUrl(query), '_blank', 'noopener,noreferrer')
}

export default function ProductImageSearchModal({ initialQuery = '', onClose, onSelectImage, open }) {
  const { data: settings } = useDocumentData('configuracoes', 'geral', defaultSettings)
  const { cseId, enabled } = getGoogleImageSearchConfig(settings.googleCseId)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchReady, setSearchReady] = useState(false)
  const renderHostRef = useRef(null)
  const gnameRef = useRef(`produto-imagem-${Math.random().toString(36).slice(2, 10)}`)
  const didAutoSearchRef = useRef(false)
  const searchTimeoutRef = useRef(null)

  function clearSearchTimeout() {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
  }

  function startSearch(trimmedQuery) {
    clearSearchTimeout()
    setLoading(true)
    setError('')
    executeGoogleImageSearch(gnameRef.current, trimmedQuery)
    searchTimeoutRef.current = window.setTimeout(() => {
      setLoading(false)
      setError('A busca integrada demorou para retornar. Tente abrir a busca direta no Google Imagens.')
    }, 8000)
  }

  useEffect(() => {
    if (!open) {
      setResults([])
      setLoading(false)
      setError('')
      setSearchReady(false)
      didAutoSearchRef.current = false
      clearSearchTimeout()
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

    ensureGoogleImageSearchLoaded(cseId)
      .then(() => {
        if (!active) {
          return
        }

        unsubscribe = subscribeGoogleImageResults(gnameRef.current, ({ results: nextResults }) => {
          if (!active) {
            return false
          }

          clearSearchTimeout()
          const nextNormalizedResults = normalizeGoogleImageResults(nextResults)
          setResults(nextNormalizedResults)
          setLoading(false)
          setError(
            nextNormalizedResults.length
              ? ''
              : 'Nao consegui montar os cards dessa busca. Veja os resultados do Google abaixo ou abra a busca direta.',
          )

          return nextNormalizedResults.length > 0
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
      clearSearchTimeout()
      unsubscribe()
      setSearchReady(false)

      if (renderHostRef.current) {
        renderHostRef.current.innerHTML = ''
      }
    }
  }, [cseId, enabled, open])

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
      startSearch(trimmedQuery)
    } catch (searchError) {
      clearSearchTimeout()
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

    if (!enabled) {
      setError('')
      openGoogleImagesSearch(trimmedQuery)
      return
    }

    try {
      startSearch(trimmedQuery)
    } catch (searchError) {
      clearSearchTimeout()
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

          <button type="submit" className="admin-btn" disabled={(enabled && !searchReady) || loading}>
            {loading ? 'Buscando...' : enabled ? 'Buscar imagens' : 'Abrir Google Imagens'}
          </button>
        </form>

        {!enabled ? (
          <div className="admin-inline-notice">
            {`Busca integrada nao configurada. Defina o Google CSE ID em Configuracoes ou VITE_GOOGLE_CSE_ID para ver resultados aqui; CSE atual: ${cseId || 'nao configurado'}.`}
          </div>
        ) : null}

        {error ? <div className="admin-inline-notice is-danger">{error}</div> : null}
        {!error && enabled && !searchReady ? <div className="admin-inline-notice">Preparando a busca do Google Imagens...</div> : null}
        {loading ? <div className="admin-inline-notice">Buscando imagens relacionadas ao produto...</div> : null}

        {enabled && String(query || initialQuery || '').trim() ? (
          <div className="admin-inline-actions">
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => openGoogleImagesSearch(String(query || initialQuery).trim())}
            >
              Abrir busca direta no Google Imagens
            </button>
          </div>
        ) : null}

        <div ref={renderHostRef} className="admin-google-cse-host" />

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
