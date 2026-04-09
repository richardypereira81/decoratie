const GOOGLE_CSE_ID = import.meta.env.VITE_GOOGLE_CSE_ID || ''
const API_BASE = '/api/produtos'
const GCSE_SCRIPT_ID = 'decoratie-google-cse-script'
const GOOGLE_IMAGE_LISTENERS_KEY = '__decoratieGoogleImageListeners'
const GOOGLE_IMAGE_READY_KEY = '__decoratieGoogleImageReadyCallback'
const GOOGLE_WEB_READY_KEY = '__decoratieGoogleWebReadyCallback'
const GOOGLE_INIT_PROMISE_KEY = '__decoratieGoogleCseInitPromise'

function getListenersRegistry() {
  if (!window[GOOGLE_IMAGE_LISTENERS_KEY]) {
    window[GOOGLE_IMAGE_LISTENERS_KEY] = new Map()
  }

  return window[GOOGLE_IMAGE_LISTENERS_KEY]
}

function ensureGoogleCallbacks() {
  const listeners = getListenersRegistry()

  if (!window[GOOGLE_IMAGE_READY_KEY]) {
    window[GOOGLE_IMAGE_READY_KEY] = (gname, query, promos, results, div) => {
      const gnameListeners = listeners.get(gname)

      if (gnameListeners) {
        gnameListeners.forEach((listener) => {
          listener({ div, promos, query, results })
        })
      }

      if (div) {
        div.innerHTML = ''
      }

      return true
    }
  }

  if (!window[GOOGLE_WEB_READY_KEY]) {
    window[GOOGLE_WEB_READY_KEY] = (gname, query, promos, results, div) => {
      const gnameListeners = listeners.get(`web:${gname}`)

      if (gnameListeners) {
        gnameListeners.forEach((listener) => {
          listener({ div, promos, query, results })
        })
      }

      if (div) {
        div.innerHTML = ''
      }

      return true
    }
  }
}

function configureGcseWindow(resolve) {
  ensureGoogleCallbacks()

  const previousConfig = window.__gcse || {}
  const previousSearchCallbacks = previousConfig.searchCallbacks || {}
  const previousImageCallbacks = previousSearchCallbacks.image || {}
  const previousWebCallbacks = previousSearchCallbacks.web || {}
  const previousInit = previousConfig.initializationCallback

  window.__gcse = {
    ...previousConfig,
    parsetags: 'explicit',
    initializationCallback: () => {
      if (typeof previousInit === 'function') {
        previousInit()
      }

      resolve(window.google?.search?.cse?.element || null)
    },
    searchCallbacks: {
      ...previousSearchCallbacks,
      image: {
        ...previousImageCallbacks,
        ready: window[GOOGLE_IMAGE_READY_KEY],
      },
      web: {
        ...previousWebCallbacks,
        ready: window[GOOGLE_WEB_READY_KEY],
      },
    },
  }
}

export function hasGoogleImageSearchConfig() {
  return Boolean(GOOGLE_CSE_ID)
}

export function getGoogleImageSearchConfig() {
  return {
    cseId: GOOGLE_CSE_ID,
    enabled: hasGoogleImageSearchConfig(),
  }
}

export async function ensureGoogleImageSearchLoaded() {
  if (!GOOGLE_CSE_ID) {
    throw new Error('Configure VITE_GOOGLE_CSE_ID para ativar a busca no Google Imagens.')
  }

  if (window.google?.search?.cse?.element) {
    return window.google.search.cse.element
  }

  if (window[GOOGLE_INIT_PROMISE_KEY]) {
    return window[GOOGLE_INIT_PROMISE_KEY]
  }

  window[GOOGLE_INIT_PROMISE_KEY] = new Promise((resolve, reject) => {
    configureGcseWindow(resolve)

    const existingScript = document.getElementById(GCSE_SCRIPT_ID)
    if (existingScript) {
      existingScript.addEventListener('error', () => reject(new Error('Nao foi possivel carregar o Google Search.')), { once: true })
      existingScript.addEventListener('load', () => {
        if (window.google?.search?.cse?.element) {
          resolve(window.google.search.cse.element)
        }
      }, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = GCSE_SCRIPT_ID
    script.async = true
    script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(GOOGLE_CSE_ID)}`
    script.onerror = () => reject(new Error('Nao foi possivel carregar o Google Search.'))
    document.head.appendChild(script)
  })

  return window[GOOGLE_INIT_PROMISE_KEY]
}

export function subscribeGoogleImageResults(gname, listener) {
  const listeners = getListenersRegistry()
  const current = listeners.get(gname) || new Set()
  current.add(listener)
  listeners.set(gname, current)

  return () => {
    const gnameListeners = listeners.get(gname)
    if (!gnameListeners) {
      return
    }

    gnameListeners.delete(listener)
    if (!gnameListeners.size) {
      listeners.delete(gname)
    }
  }
}

export function renderGoogleImageSearch(container, gname) {
  const elementApi = window.google?.search?.cse?.element

  if (!elementApi || !container) {
    return null
  }

  container.innerHTML = ''

  elementApi.render({
    attributes: {
      defaultToImageSearch: true,
      disableWebSearch: true,
      enableImageSearch: true,
      imageSearchLayout: 'classic',
      imageSearchResultSetSize: '8',
    },
    div: container,
    gname,
    tag: 'searchresults-only',
  })

  return elementApi.getElement(gname)
}

export function executeGoogleImageSearch(gname, query) {
  const element = window.google?.search?.cse?.element?.getElement(gname)

  if (!element) {
    throw new Error('A busca de imagens ainda nao esta pronta.')
  }

  element.execute(query)
}

function buildApiError(message) {
  return new Error(message || 'Nao foi possivel concluir a solicitacao da imagem.')
}

async function readApiResponse(response) {
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw buildApiError(payload.erro || payload.message)
  }

  return payload
}

export function buildRemoteImageDownloadUrl({ fallbackUrl = '', imageUrl, productName = '' }) {
  const params = new window.URLSearchParams()
  params.set('url', imageUrl)

  if (fallbackUrl) {
    params.set('fallbackUrl', fallbackUrl)
  }

  if (productName) {
    params.set('productName', productName)
  }

  return `${API_BASE}/baixar-imagem?${params.toString()}`
}

export async function importRemoteProductImage({ fallbackUrl = '', imageUrl, productId = '', productName = '' }) {
  const response = await fetch(`${API_BASE}/importar-imagem`, {
    body: JSON.stringify({
      fallbackUrl,
      imageUrl,
      productId,
      productName,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  return readApiResponse(response)
}
