/**
 * Application Configuration
 *
 * Reads environment variables from Vite (import.meta.env) with automatic fallbacks for local development:
 * - VITE_API_BASE_URL: Base HTTP(S) URL for backend API (default: 'http://localhost:8000')
 * - VITE_WS_BASE_URL: Base WS(S) URL for backend WebSockets (default: derived from API_BASE_URL or 'ws://localhost:8000')
 */

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '') || 'http://localhost:8000'

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
