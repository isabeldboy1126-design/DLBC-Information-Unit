import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl, API_BASE_URL, authFetch } from '../../config'

export function ProgrammesSettingsSection() {
  const [programmes, setProgrammes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Filter archived toggle
  const [showArchived, setShowArchived] = useState(false)

  // Expanded programme IDs for viewing/editing sessions
  const [expandedProgIds, setExpandedProgIds] = useState({})

  // Add Programme State
  const [isAddingProg, setIsAddingProg] = useState(false)
  const [newProgName, setNewProgName] = useState('')

  // Edit Programme Name State
  const [editingProgId, setEditingProgId] = useState(null)
  const [editingProgName, setEditingProgName] = useState('')

  // Add Session under Programme State
  const [addingSessionForProgId, setAddingSessionForProgId] = useState(null)
  const [newSessionName, setNewSessionName] = useState('')

  // Edit Session Name State
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editingSessionName, setEditingSessionName] = useState('')

  const fetchProgrammes = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await authFetch(getApiUrl('/api/programmes?include_archived=true'))
      if (res.ok) {
        const data = await res.json()
        setProgrammes(data)
      } else {
        setError('Programmes could not be loaded.')
      }
    } catch (err) {
      console.error('Error fetching programmes:', err)
      setError('Programmes could not be loaded. Please check your connection.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProgrammes()
  }, [fetchProgrammes])

  const showNotification = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  // Toggle programme expansion
  const toggleExpand = (progId) => {
    setExpandedProgIds((prev) => ({
      ...prev,
      [progId]: !prev[progId],
    }))
  }

  // Handle Add Programme
  const handleAddProgramme = async (e) => {
    e.preventDefault()
    if (!newProgName.trim()) return
    try {
      setError(null)
      const res = await authFetch(getApiUrl('/api/programmes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProgName.trim() }),
      })
      if (res.ok) {
        const newProg = await res.json()
        setNewProgName('')
        setIsAddingProg(false)
        showNotification(`✓ Programme "${newProg.name}" created successfully.`)
        // Auto-expand newly created programme
        setExpandedProgIds((prev) => ({ ...prev, [newProg.id]: true }))
        await fetchProgrammes()
      } else {
        const errData = await res.json()
        setError(errData.detail || 'Failed to create programme.')
      }
    } catch (err) {
      console.error('Error creating programme:', err)
      setError('Could not create programme. Please check your connection.')
    }
  }

  // Handle Rename Programme
  const handleSaveProgName = async (progId) => {
    if (!editingProgName.trim()) return
    try {
      setError(null)
      const res = await authFetch(getApiUrl(`/api/programmes/${progId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingProgName.trim() }),
      })
      if (res.ok) {
        setEditingProgId(null)
        showNotification('✓ Programme updated.')
        await fetchProgrammes()
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.detail || 'Failed to update programme.')
      }
    } catch (err) {
      console.error('Error updating programme:', err)
      setError('Could not update programme. Please check your connection.')
    }
  }

  // Handle Archive / Unarchive Programme
  const handleToggleArchiveProgramme = async (prog) => {
    const actionName = prog.is_archived ? 'unarchive' : 'archive'
    try {
      setError(null)
      const res = await authFetch(getApiUrl(`/api/programmes/${prog.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: !prog.is_archived }),
      })
      if (res.ok) {
        showNotification(`✓ Programme "${prog.name}" ${prog.is_archived ? 'restored' : 'archived'}.`)
        await fetchProgrammes()
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.detail || `Failed to ${actionName} programme.`)
      }
    } catch (err) {
      console.error(`Error toggling archive for programme:`, err)
      setError('Could not update programme status. Please check your connection.')
    }
  }

  // Handle Add Session/Section
  const handleAddSession = async (progId) => {
    if (!newSessionName.trim()) return
    try {
      setError(null)
      const res = await authFetch(getApiUrl(`/api/programmes/${progId}/sessions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSessionName.trim() }),
      })
      if (res.ok) {
        setNewSessionName('')
        setAddingSessionForProgId(null)
        showNotification('✓ Session / section added.')
        await fetchProgrammes()
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.detail || 'Failed to add session.')
      }
    } catch (err) {
      console.error('Error adding session:', err)
      setError('Could not add session. Please check your connection.')
    }
  }

  // Handle Rename Session
  const handleSaveSessionName = async (progId, sessionId) => {
    if (!editingSessionName.trim()) return
    try {
      setError(null)
      const res = await authFetch(getApiUrl(`/api/programmes/${progId}/sessions/${sessionId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingSessionName.trim() }),
      })
      if (res.ok) {
        setEditingSessionId(null)
        showNotification('✓ Session / section updated.')
        await fetchProgrammes()
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.detail || 'Failed to update session.')
      }
    } catch (err) {
      console.error('Error updating session:', err)
      setError('Could not update session. Please check your connection.')
    }
  }

  // Handle Archive / Remove Session
  const handleArchiveSession = async (progId, sessionId) => {
    try {
      setError(null)
      const res = await authFetch(getApiUrl(`/api/programmes/${progId}/sessions/${sessionId}`), {
        method: 'DELETE',
      })
      if (res.ok) {
        showNotification('✓ Session / section archived.')
        await fetchProgrammes()
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.detail || 'Failed to archive session.')
      }
    } catch (err) {
      console.error('Error archiving session:', err)
      setError('Could not archive session. Please check your connection.')
    }
  }

  // Handle Reorder Sessions (Move Up or Down)
  const handleMoveSession = async (prog, sessIndex, direction) => {
    const activeSessions = (prog.sessions || []).filter((s) => !s.is_archived)
    const targetIndex = sessIndex + direction
    if (targetIndex < 0 || targetIndex >= activeSessions.length) return

    const newOrder = [...activeSessions]
    const [moved] = newOrder.splice(sessIndex, 1)
    newOrder.splice(targetIndex, 0, moved)

    const sessionIds = newOrder.map((s) => s.id)

    try {
      const res = await authFetch(getApiUrl(`/api/programmes/${prog.id}/sessions/reorder`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_ids: sessionIds }),
      })
      if (res.ok) {
        await fetchProgrammes()
      }
    } catch (err) {
      console.error('Error reordering sessions:', err)
    }
  }

  const visibleProgrammes = programmes.filter((p) => showArchived || !p.is_archived)
  const archivedCount = programmes.filter((p) => p.is_archived).length

  return (
    <div className="card settings-card">
      <div className="card-header settings-card-header">
        <div className="settings-card-header-title">
          <span className="settings-icon"></span>
          <h3>Programmes &amp; Sessions</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {archivedCount > 0 && (
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => setShowArchived(!showArchived)}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
            >
              {showArchived ? 'Hide Archived' : `Show Archived (${archivedCount})`}
            </button>
          )}
        </div>
      </div>

      <div className="card-body">
        {error && (
          <div className="settings-alert settings-alert--error" style={{ margin: '0.75rem 0' }} role="alert">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '1rem' }}>
              <span>{error}</span>
              <button
                type="button"
                className="btn btn--small btn--outline btn-retry-load"
                onClick={fetchProgrammes}
                disabled={isLoading}
              >
                {isLoading ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="settings-alert settings-alert--success" style={{ margin: '0.75rem 0' }}>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Action Header: Add Programme Button / Form */}
        <div style={{ marginBottom: '1.25rem', marginTop: '0.5rem' }}>
          {!isAddingProg ? (
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => {
                setIsAddingProg(true)
                setNewProgName('')
              }}
              id="btn-add-programme"
            >
              + Add Programme
            </button>
          ) : (
            <form onSubmit={handleAddProgramme} className="programme-add-form" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.85rem', borderRadius: '8px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 2026 Women Conference, Youth Success Camp"
                value={newProgName}
                onChange={(e) => setNewProgName(e.target.value)}
                autoFocus
                style={{ flex: 1 }}
                id="input-new-programme-name"
              />
              <button type="submit" className="btn btn--primary btn--small" id="btn-save-new-programme">
                Save Programme
              </button>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => setIsAddingProg(false)}
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {/* Programmes List */}
        {isLoading && programmes.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading programmes &amp; sessions...
          </div>
        ) : visibleProgrammes.length === 0 ? (
          <div className="programmes-empty-placeholder">
            No programmes configured yet. Click <strong>+ Add Programme</strong> above to create your first programme.
          </div>
        ) : (
          <div className="programmes-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {visibleProgrammes.map((prog) => {
              const isExpanded = !!expandedProgIds[prog.id]
              const activeSessions = (prog.sessions || []).filter((s) => !s.is_archived)
              const isEditing = editingProgId === prog.id

              return (
                <div
                  key={prog.id}
                  className={`programme-item-card ${prog.is_archived ? 'programme-item-card--archived' : ''}`}
                  style={{
                    opacity: prog.is_archived ? 0.75 : 1,
                    overflow: 'hidden',
                  }}
                >
                  {/* Programme Header Bar */}
                  <div
                    className="programme-item-header"
                    style={{
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: isExpanded ? '1px solid var(--border-default, #e2e8f0)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1 }}>
                      <span style={{ fontSize: '1.15rem' }}>⛪</span>

                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flex: 1, maxWidth: '400px' }}>
                          <input
                            type="text"
                            className="form-control form-control--small"
                            value={editingProgName}
                            onChange={(e) => setEditingProgName(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveProgName(prog.id)
                              if (e.key === 'Escape') setEditingProgId(null)
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn--primary btn--small"
                            onClick={() => handleSaveProgName(prog.id)}
                            style={{ padding: '0.2rem 0.55rem' }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn--outline btn--small"
                            onClick={() => setEditingProgId(null)}
                            style={{ padding: '0.2rem 0.55rem' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong className="programme-name">{prog.name}</strong>
                          {prog.is_archived ? (
                            <span className="badge badge--warning" style={{ fontSize: '0.68rem' }}>Archived</span>
                          ) : (
                            <span className="badge badge--info" style={{ fontSize: '0.68rem' }}>
                              {activeSessions.length} {activeSessions.length === 1 ? 'Session' : 'Sessions'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Programme Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {!isEditing && (
                        <button
                          type="button"
                          className="btn btn--outline btn--small btn-prog-action"
                          onClick={() => {
                            setEditingProgId(prog.id)
                            setEditingProgName(prog.name)
                          }}
                          title="Rename programme"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                        >
                          ✏ Rename
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn--outline btn--small btn-prog-action"
                        onClick={() => handleToggleArchiveProgramme(prog)}
                        title={prog.is_archived ? 'Restore programme' : 'Archive programme'}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                      >
                        {prog.is_archived ? '♻ Restore' : ' Archive'}
                      </button>

                      <button
                        type="button"
                        className="btn btn-toggle-sessions btn--small"
                        onClick={() => toggleExpand(prog.id)}
                        id={`btn-toggle-prog-${prog.id}`}
                      >
                        {isExpanded ? '▲ Close Sessions' : `▼ Sessions (${activeSessions.length})`}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Sessions Management Body */}
                  {isExpanded && (
                    <div className="programme-sessions-container" style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span className="programme-sessions-heading">
                          CONFIGURED SESSIONS / SECTIONS UNDER &ldquo;{prog.name.toUpperCase()}&rdquo;
                        </span>

                        {addingSessionForProgId !== prog.id && (
                          <button
                            type="button"
                            className="btn btn--outline btn--small"
                            onClick={() => {
                              setAddingSessionForProgId(prog.id)
                              setNewSessionName('')
                            }}
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
                            id={`btn-add-session-${prog.id}`}
                          >
                            + Add Session / Section
                          </button>
                        )}
                      </div>

                      {/* Add Session Inline Form */}
                      {addingSessionForProgId === prog.id && (
                        <div className="programme-add-session-row" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem', padding: '0.65rem' }}>
                          <input
                            type="text"
                            className="form-control form-control--small"
                            placeholder="e.g. Faith Clinic, Morning Message, Bible Teaching"
                            value={newSessionName}
                            onChange={(e) => setNewSessionName(e.target.value)}
                            autoFocus
                            style={{ flex: 1 }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddSession(prog.id)
                              if (e.key === 'Escape') setAddingSessionForProgId(null)
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn--primary btn--small"
                            onClick={() => handleAddSession(prog.id)}
                            style={{ padding: '0.25rem 0.65rem' }}
                          >
                            Save Section
                          </button>
                          <button
                            type="button"
                            className="btn btn--outline btn--small"
                            onClick={() => setAddingSessionForProgId(null)}
                            style={{ padding: '0.25rem 0.65rem' }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Sessions List */}
                      {activeSessions.length === 0 && addingSessionForProgId !== prog.id ? (
                        <div className="programme-no-sessions" style={{ padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', textAlign: 'center' }}>
                          No sessions configured for this programme yet. Click <strong>+ Add Session / Section</strong> to add sections (e.g. Faith Clinic, Morning Message).
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                          {activeSessions.map((sess, sIdx) => {
                            const isEditingSess = editingSessionId === sess.id

                            return (
                              <div
                                key={sess.id}
                                className="programme-session-item-row"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0.45rem 0.75rem',
                                  borderRadius: '6px',
                                }}
                              >
                                {/* Left: Reorder buttons & Name */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                  {/* Up / Down Reorder */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveSession(prog, sIdx, -1)}
                                      disabled={sIdx === 0}
                                      style={{
                                        border: 'none',
                                        background: 'none',
                                        cursor: sIdx === 0 ? 'default' : 'pointer',
                                        fontSize: '0.65rem',
                                        color: sIdx === 0 ? '#cbd5e1' : '#64748b',
                                        lineHeight: 1,
                                        padding: '1px',
                                      }}
                                      title="Move up"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveSession(prog, sIdx, 1)}
                                      disabled={sIdx === activeSessions.length - 1}
                                      style={{
                                        border: 'none',
                                        background: 'none',
                                        cursor: sIdx === activeSessions.length - 1 ? 'default' : 'pointer',
                                        fontSize: '0.65rem',
                                        color: sIdx === activeSessions.length - 1 ? '#cbd5e1' : '#64748b',
                                        lineHeight: 1,
                                        padding: '1px',
                                      }}
                                      title="Move down"
                                    >
                                      ▼
                                    </button>
                                  </div>

                                  <span style={{ fontSize: '0.85rem', color: '#94a3b8', width: '20px' }}>
                                    #{sIdx + 1}
                                  </span>

                                  {isEditingSess ? (
                                    <div style={{ display: 'flex', gap: '0.35rem', flex: 1, maxWidth: '350px' }}>
                                      <input
                                        type="text"
                                        className="form-control form-control--small"
                                        value={editingSessionName}
                                        onChange={(e) => setEditingSessionName(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleSaveSessionName(prog.id, sess.id)
                                          if (e.key === 'Escape') setEditingSessionId(null)
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="btn btn--primary btn--small"
                                        onClick={() => handleSaveSessionName(prog.id, sess.id)}
                                        style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem' }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn--outline btn--small"
                                        onClick={() => setEditingSessionId(null)}
                                        style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem' }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="programme-session-name">
                                      {sess.name}
                                    </span>
                                  )}
                                </div>

                                {/* Right: Session Actions */}
                                {!isEditingSess && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <button
                                      type="button"
                                      className="btn-link-small"
                                      onClick={() => {
                                        setEditingSessionId(sess.id)
                                        setEditingSessionName(sess.name)
                                      }}
                                      title="Rename section"
                                      style={{ fontSize: '0.75rem' }}
                                    >
                                      Rename
                                    </button>
                                    <span style={{ color: '#cbd5e1' }}>&bull;</span>
                                    <button
                                      type="button"
                                      className="btn-link-small"
                                      onClick={() => handleArchiveSession(prog.id, sess.id)}
                                      title="Archive section"
                                      style={{ fontSize: '0.75rem', color: '#e11d48' }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
