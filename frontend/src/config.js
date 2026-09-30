/**
 * Application Configuration
 *
 * Reads environment variables from Vite (import.meta.env) with automatic fallbacks for local development:
 * - VITE_API_BASE_URL: Base HTTP(S) URL for backend API (default: 'http://localhost:8000')
 * - VITE_WS_BASE_URL: Base WS(S) URL for backend WebSockets (default: derived from API_BASE_URL or 'ws://localhost:8000')
 */

const PRODUCTION_API_URL = 'https://dlbc-information-unit-api.icycliff-cc807421.southafricanorth.azurecontainerapps.io'

const resolveApiBaseUrl = () => {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (envUrl) {
    return envUrl.replace(/\/+$/, '')
  }

  // Automatic production fallback for client-side environments not on localhost
  if (typeof window !== 'undefined' && window.location) {
    const hostname = (window.location.hostname || '').toLowerCase()
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1'
    if (!isLocal && hostname) {
      return PRODUCTION_API_URL
    }
  }

  return 'http://localhost:8000'
}

export const API_BASE_URL = resolveApiBaseUrl()

// Derive default WebSocket base URL from API_BASE_URL if not explicitly specified
const deriveWsUrl = (apiUrl) => {
  if (!apiUrl) return 'ws://localhost:8000'
  if (apiUrl.startsWith('https://')) {
    return apiUrl.replace(/^https:\/\//, 'wss://')
  }
  if (apiUrl.startsWith('http://')) {
    return apiUrl.replace(/^http:\/\//, 'ws://')
  }
  return apiUrl
}

const rawWsUrl = (import.meta.env.VITE_WS_BASE_URL || '').trim()
export const WS_BASE_URL = rawWsUrl.replace(/\/+$/, '') || deriveWsUrl(API_BASE_URL)

/**
 * Returns a fully qualified API endpoint URL.
 * @param {string} path - Endpoint path, e.g. '/api/sessions'
 */
export function getApiUrl(path = '') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${cleanPath}`
}

/**
 * Returns a fully qualified WebSocket endpoint URL.
 * @param {string} path - WebSocket path, e.g. '/api/audio/stream'
 */
export function getWsUrl(path = '') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${WS_BASE_URL}${cleanPath}`
}

let _cachedToken = null

export function setAuthToken(token) {
  _cachedToken = token || null
}

export function getAuthToken() {
  if (_cachedToken) return _cachedToken
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const item = JSON.parse(localStorage.getItem(key))
          if (item && item.access_token) {
            _cachedToken = item.access_token
            return item.access_token
          }
        }
      }
    }
  } catch (e) {
    // Ignore JSON parse errors in localStorage
  }
  return null
}

export function isLocalDemoAllowed() {
  if (typeof window === 'undefined') return false
  const isDev = Boolean(import.meta.env.DEV)
  const envFlag = (import.meta.env.VITE_ENABLE_LOCAL_DEMO || '').toLowerCase()
  const flagEnabled = envFlag === 'true' || envFlag === '1'
  const hostname = (window.location.hostname || '').toLowerCase()
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  return isDev && flagEnabled && isLocalHost
}

let _isDemoActive = false

export function setDemoMode(active) {
  _isDemoActive = Boolean(active)
  if (typeof sessionStorage !== 'undefined') {
    if (_isDemoActive) {
      sessionStorage.setItem('dlbc_demo_mode', '1')
    } else {
      sessionStorage.removeItem('dlbc_demo_mode')
    }
  }
}

export function isDemoModeActive() {
  if (!isLocalDemoAllowed()) return false
  if (_isDemoActive) return true
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem('dlbc_demo_mode') === '1'
  }
  return false
}

export function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders }
  if (isDemoModeActive()) {
    headers['X-DLBC-Demo'] = '1'
    return headers
  }
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export async function authFetch(url, options = {}) {
  const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : getApiUrl(url)
  const headers = getAuthHeaders(options.headers || {})
  return fetch(fullUrl, {
    ...options,
    headers,
  })
}
