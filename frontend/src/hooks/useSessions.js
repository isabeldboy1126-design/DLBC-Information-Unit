import { useState, useEffect, useCallback } from 'react'

const API_BASE = 'http://localhost:8000/api/sessions'

export function useSessions() {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch all saved sessions
  const fetchSessions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error(`Failed to load sessions: ${res.status}`)
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (err) {
      console.error('Error fetching sessions:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load a single session with full details, segments, and flags
  const loadSession = useCallback(async (sessionId) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}`)
      if (!res.ok) throw new Error(`Failed to load session details: ${res.status}`)
      const data = await res.json()
      setActiveSession(data.session)
      return data.session
    } catch (err) {
      console.error('Error loading session:', err)
      setError(err.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Update session title
  const updateSessionTitle = useCallback(async (sessionId, newTitle) => {
    if (!newTitle || !newTitle.strip?.() && !newTitle.trim()) return false
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      if (!res.ok) throw new Error(`Failed to rename session: ${res.status}`)
      const data = await res.json()
      // Update state
      setActiveSession((prev) => (prev && prev.session_id === sessionId ? { ...prev, title: data.session.title } : prev))
      setSessions((prev) =>
        prev.map((s) => (s.session_id === sessionId ? { ...s, title: data.session.title } : s))
      )
      return true
    } catch (err) {
      console.error('Error renaming session:', err)
      setError(err.message)
      return false
    }
  }, [])

  // Explicitly delete a session
  const deleteSession = useCallback(async (sessionId) => {
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId))
      setActiveSession((prev) => (prev && prev.session_id === sessionId ? null : prev))
      return true
    } catch (err) {
      console.error('Error deleting session:', err)
      setError(err.message)
      return false
    }
  }, [])

  const closeActiveSession = useCallback(() => {
    setActiveSession(null)
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  return {
    sessions,
    activeSession,
    isLoading,
    error,
    clearError: () => setError(null),
    fetchSessions,
    loadSession,
    updateSessionTitle,
    deleteSession,
    closeActiveSession,
  }
}
