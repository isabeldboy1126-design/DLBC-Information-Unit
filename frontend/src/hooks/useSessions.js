import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getApiUrl, authFetch, isDemoModeActive, getAuthToken } from '../config'

const API_BASE = getApiUrl('/api/sessions')

export function useSessions() {
  const { user, account, isOnboarded } = useAuth()
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedInitially, setHasLoadedInitially] = useState(false)
  const [error, setError] = useState(null)
  const [isListLoading, setIsListLoading] = useState(true)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [listError, setListError] = useState(null)
  const listRequest = useRef(0)
  const identityEpoch = useRef(0)
  const detailRequest = useRef(0)

  // Phase 5: Verification state
  const [verificationState, setVerificationState] = useState(null)

  // Fetch all saved sessions
  const fetchSessions = useCallback(async () => {
    const operationEpoch = identityEpoch.current
    const request = ++listRequest.current
    setIsListLoading(true)
    setListError(null)
    try {
      const res = await authFetch(`${API_BASE}?include_archived=true`)
      if (operationEpoch !== identityEpoch.current) return null
      if (!res.ok) throw new Error(`Failed to load sessions: ${res.status}`)
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      if (!Array.isArray(data.sessions)) throw new Error('Invalid session list response')
      if (request !== listRequest.current) return
      setSessions(data.sessions)
      setSessionsLoaded(true)
      setHasLoadedInitially(true)
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      if (request !== listRequest.current) return
      console.error('Error fetching sessions:', err)
      setListError(err.message)
    } finally {
      if (request === listRequest.current) setIsListLoading(false)
    }
  }, [])

  // Load a single session with full details, segments, and flags
  const loadSession = useCallback(async (sessionId) => {
    const operationEpoch = identityEpoch.current
    const request = ++detailRequest.current
    const identity = identityEpoch.current
    setIsLoading(true)
    setError(null)
    try {
      const res = await authFetch(`${API_BASE}/${encodeURIComponent(sessionId)}`)
      if (operationEpoch !== identityEpoch.current) return null
      if (!res.ok) throw new Error(`Failed to load session details: ${res.status}`)
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      if (identity !== identityEpoch.current || request !== detailRequest.current) return null
      setActiveSession(data.session)
      return data.session
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      if (identity !== identityEpoch.current || request !== detailRequest.current) return null
      console.error('Error loading session:', err)
      setError(err.message)
      return null
    } finally {
      if (operationEpoch === identityEpoch.current) setIsLoading(false)
    }
  }, [])

  // Update session title
  const updateSessionTitle = useCallback(async (sessionId, newTitle) => {
    const operationEpoch = identityEpoch.current
    if (!newTitle || !newTitle.strip?.() && !newTitle.trim()) return false
    setError(null)
    try {
      const res = await authFetch(`${API_BASE}/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      if (operationEpoch !== identityEpoch.current) return null
      if (!res.ok) throw new Error(`Failed to rename session: ${res.status}`)
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      // Update state
      setActiveSession((prev) => (prev && prev.session_id === sessionId ? { ...prev, title: data.session.title } : prev))
      setSessions((prev) =>
        prev.map((s) => (s.session_id === sessionId ? { ...s, title: data.session.title } : s))
      )
      return true
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error renaming session:', err)
      setError(err.message)
      return false
    }
  }, [])

  // Update full session details (programme, session title, minister)
  const updateSessionDetails = useCallback(async (sessionId, { programme, sessionTitle, minister }) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(`${API_BASE}/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programme: programme !== undefined ? programme.trim() : undefined,
          session_title: sessionTitle !== undefined ? sessionTitle.trim() : undefined,
          minister: minister !== undefined ? minister.trim() : undefined,
        }),
      })
      if (operationEpoch !== identityEpoch.current) return null
      if (!res.ok) throw new Error(`Failed to update session details: ${res.status}`)
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      if (data.session) {
        setActiveSession(data.session)
        setSessions((prev) =>
          prev.map((s) => (s.session_id === sessionId ? data.session : s))
        )
      }
      return data.session || true
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error updating session details:', err)
      setError(err.message)
      return false
    }
  }, [])

  // Archive preserves protected source files and revisions.
  const deleteSession = useCallback(async (sessionId) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(`${API_BASE}/${encodeURIComponent(sessionId)}/archive`, {
        method: 'POST',
      })
      if (operationEpoch !== identityEpoch.current) return null
      if (!res.ok) throw new Error(`Failed to archive session: ${res.status}`)
      setSessions((prev) => prev.map(s => s.session_id === sessionId ? { ...s, is_archived: true } : s))
      setActiveSession((prev) => (prev && prev.session_id === sessionId ? null : prev))
      return true
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error archiving session:', err)
      setError(err.message)
      return false
    }
  }, [])

  const restoreSession = useCallback(async (sessionId) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(`${API_BASE}/${encodeURIComponent(sessionId)}/restore`, { method: 'POST' })
      if (operationEpoch !== identityEpoch.current) return null
      if (!res.ok) throw new Error(`Failed to restore session: ${res.status}`)
      setSessions(prev => prev.map(s => s.session_id === sessionId ? { ...s, is_archived: false } : s))
      return true
    } catch (err) { setError(err.message); return false }
  }, [])

  const closeActiveSession = useCallback(() => {
    setActiveSession(null)
    setVerificationState(null)
    // Refresh the Sessions list from the backend immediately so the card
    // reflects the latest workflow stage without requiring a manual refresh.
    // A fetch failure here must not break navigation back.
    fetchSessions().catch((err) => {
      console.warn('Sessions list refresh after closing workspace failed:', err)
    })
  }, [fetchSessions])

  // =========================================================================
  // Phase 5: Verification methods
  // =========================================================================

  // Start verification — gathers flagged items
  const startVerification = useCallback(async (sessionId) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(`${API_BASE}/${encodeURIComponent(sessionId)}/verification/start`, {
        method: 'POST',
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to start verification: ${res.status}`)
      }
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      setVerificationState(data)
      // Update active session verification_status
      setActiveSession((prev) =>
        prev && prev.session_id === sessionId
          ? { ...prev, verification_status: data.verification_status }
          : prev
      )
      return data
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error starting verification:', err)
      setError(err.message)
      return null
    }
  }, [])

  // Load current verification state
  const loadVerificationState = useCallback(async (sessionId) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(`${API_BASE}/${encodeURIComponent(sessionId)}/verification`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to load verification: ${res.status}`)
      }
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      setVerificationState(data)
      return data
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error loading verification state:', err)
      setError(err.message)
      return null
    }
  }, [])

  // Resolve a single verification item (confirm or correct)
  const resolveVerificationItem = useCallback(async (sessionId, segmentIndex, payload) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(
        `${API_BASE}/${encodeURIComponent(sessionId)}/verification/${segmentIndex}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to resolve item: ${res.status}`)
      }
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      setVerificationState(data)
      return data
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error resolving verification item:', err)
      setError(err.message)
      return null
    }
  }, [])

  // Add a manual verification item for an unflagged segment
  const addVerificationItem = useCallback(async (sessionId, segmentIndex) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(
        `${API_BASE}/${encodeURIComponent(sessionId)}/verification/add-item`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segment_index: segmentIndex }),
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to add verification item: ${res.status}`)
      }
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      setVerificationState(data)
      return data
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error adding verification item:', err)
      setError(err.message)
      return null
    }
  }, [])

  // Finalise verification — creates the Verified Transcript
  const finaliseVerification = useCallback(async (sessionId) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(
        `${API_BASE}/${encodeURIComponent(sessionId)}/verification/finalise`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to finalise verification: ${res.status}`)
      }
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      setVerificationState((prev) => ({
        ...prev,
        verification_status: 'complete',
        verified_at: data.verified_at,
      }))
      // Update active session
      setActiveSession((prev) =>
        prev && prev.session_id === sessionId
          ? {
              ...prev,
              verification_status: 'complete',
              verified_text: data.verified_text,
              verified_at: data.verified_at,
            }
          : prev
      )
      return data
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error finalising verification:', err)
      setError(err.message)
      return null
    }
  }, [])

  // Bulk-confirm all remaining unresolved verification items
  const confirmAllRemaining = useCallback(async (sessionId) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(
        `${API_BASE}/${encodeURIComponent(sessionId)}/verification/confirm-all-remaining`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to confirm remaining items: ${res.status}`)
      }
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      setVerificationState(data)
      // Update session verification counts in activeSession if loaded
      setActiveSession((prev) =>
        prev && prev.session_id === sessionId
          ? {
              ...prev,
              verification_items_resolved: data.items_resolved,
            }
          : prev
      )
      return data
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error confirming all remaining items:', err)
      setError(err.message)
      return null
    }
  }, [])

  // Confirm raw transcript as verified (zero-flag shortcut)
  const confirmRawAsVerified = useCallback(async (sessionId) => {
    const operationEpoch = identityEpoch.current
    setError(null)
    try {
      const res = await authFetch(
        `${API_BASE}/${encodeURIComponent(sessionId)}/verification/confirm-raw`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to confirm raw as verified: ${res.status}`)
      }
      const data = await res.json()
      if (operationEpoch !== identityEpoch.current) return null
      setVerificationState({
        verification_status: 'complete',
        items_total: 0,
        items_resolved: 0,
        verified_at: data.verified_at,
        items: [],
      })
      setActiveSession((prev) =>
        prev && prev.session_id === sessionId
          ? {
              ...prev,
              verification_status: 'complete',
              verified_text: data.verified_text,
              verified_at: data.verified_at,
            }
          : prev
      )
      return data
    } catch (err) {
      if (operationEpoch !== identityEpoch.current) return null
      console.error('Error confirming raw as verified:', err)
      setError(err.message)
      return null
    }
  }, [])

  useEffect(() => {
    ++listRequest.current
    ++identityEpoch.current
    ++detailRequest.current
    setSessions([])
    setActiveSession(null)
    setVerificationState(null)
    setSessionsLoaded(false)
    setHasLoadedInitially(false)
    setError(null)
    setIsLoading(false)
    setListError(null)
    setIsListLoading(false)
    if (user && isOnboarded && (isDemoModeActive() || getAuthToken())) fetchSessions()
  }, [user?.id, account?.id, isOnboarded, fetchSessions])

  return {
    sessions,
    activeSession,
    isLoading,
    hasLoadedInitially,
    error,
    isListLoading,
    sessionsLoaded,
    listError,
    clearError: () => setError(null),
    fetchSessions,
    loadSession,
    updateSessionTitle,
    updateSessionDetails,
    deleteSession,
    restoreSession,
    closeActiveSession,
    // Phase 5: Verification
    verificationState,
    startVerification,
    loadVerificationState,
    resolveVerificationItem,
    addVerificationItem,
    confirmAllRemaining,
    finaliseVerification,
    confirmRawAsVerified,
  }
}
