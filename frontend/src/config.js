/**
 * Application Configuration
 *
 * Reads environment variables from Vite (import.meta.env) with automatic fallbacks for local development:
 * - VITE_API_BASE_URL: Base HTTP(S) URL for backend API (default: 'http://localhost:8000')
 * - VITE_WS_BASE_URL: Base WS(S) URL for backend WebSockets (default: derived from API_BASE_URL or 'ws://localhost:8000')
 */

import { getSupabaseClient } from './services/supabase'

const PRODUCTION_API_URL = 'https://dlbc-information-unit-api.icycliff-cc807421.southafricanorth.azurecontainerapps.io'

const resolveApiBaseUrl = () => {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (envUrl) {
    return envUrl.replace(/\/+$/, '')
  }

  // In production builds or inside Tauri desktop app, always target the production Azure API
  const isTauriEnv = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)
  if (import.meta.env.PROD || isTauriEnv) {
    return PRODUCTION_API_URL
  }

  // Automatic production fallback for client-side environments not on localhost
  if (typeof window !== 'undefined' && window.location) {
    const hostname = (window.location.hostname || '').toLowerCase()
    // Android emulator host loopback
    if (hostname === '10.0.2.2' || (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && (hostname === 'localhost' || window.location.protocol === 'capacitor:'))) {
      return 'http://10.0.2.2:8000'
    }

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
  if (token) {
    _isDemoActive = false
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('dlbc_demo_mode')
    }
  }
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
  // Public Demo mode is available in both local development and production
  return true
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
  // A logged-in account always supersedes demo mode
  if (getAuthToken()) {
    return false
  }
  if (!isLocalDemoAllowed()) return false
  if (_isDemoActive) return true
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem('dlbc_demo_mode') === '1'
  }
  return false
}

export function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders }
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    delete headers['X-DLBC-Demo']
    return headers
  }
  if (isDemoModeActive()) {
    headers['X-DLBC-Demo'] = '1'
    return headers
  }
  return headers
}

let _refreshPromise = null

export async function refreshAuthToken() {
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    try {
      const client = getSupabaseClient()
      if (!client) return null
      const { data, error } = await client.auth.refreshSession()
      if (error || !data?.session?.access_token) {
        const { data: sData } = await client.auth.getSession()
        if (sData?.session?.access_token) {
          setAuthToken(sData.session.access_token)
          return sData.session.access_token
        }
        return null
      }
      const newToken = data.session.access_token
      setAuthToken(newToken)
      return newToken
    } catch (e) {
      console.warn('Failed to refresh auth token:', e)
      return null
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

export async function authFetch(url, options = {}, retryCount = 0) {
  const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : getApiUrl(url)
  const headers = getAuthHeaders(options.headers || {})
  const response = await fetch(fullUrl, {
    ...options,
    headers,
  })

  // Safe single retry on 401 using refreshed Supabase session
  if (response.status === 401 && retryCount === 0 && !isDemoModeActive()) {
    const refreshedToken = await refreshAuthToken()
    if (refreshedToken) {
      const retryHeaders = getAuthHeaders(options.headers || {})
      return fetch(fullUrl, {
        ...options,
        headers: retryHeaders,
      })
    }
  }

  return response
}
