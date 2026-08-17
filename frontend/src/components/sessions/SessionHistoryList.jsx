import React, { useState } from 'react'

export function SessionHistoryList({
  sessions,
  onOpenSession,
  onDeleteSession,
  onRefresh,
  isLoading,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const formatSeconds = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00'
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const remMins = mins % 60
      return `${hours}h ${remMins}m`
    }
    return `${pad(mins)}:${pad(secs)}`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return 'Unknown Date'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoStr
    }
  }

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      !searchTerm ||
      (s.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.session_id || '').toLowerCase().includes(searchTerm.toLowerCase())

    let matchesStatus = statusFilter === 'all'
    if (!matchesStatus) {
      if (statusFilter === 'verified') {
        matchesStatus = s.verification_status === 'complete'
      } else if (statusFilter === 'interrupted') {
        matchesStatus = !!s.is_interrupted
      } else {
        matchesStatus = s.status === statusFilter
      }
    }

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (s) => {
    if (s.is_interrupted || s.status === 'interrupted') {
      return <span className="badge badge--warning">⚠ Interrupted</span>
    }
    if (s.status === 'recording') {
      return <span className="badge badge--danger pulse-dot">● Recording</span>
    }
    if (s.status === 'audio_only') {
      return <span className="badge badge--info">🎙️ Audio Only</span>
    }
    if (s.status === 'partial_transcript') {
      return <span className="badge badge--warning">📄 Partial Transcript</span>
    }
    return <span className="badge badge--success">✓ Completed</span>
  }

  return (
    <div className="card session-history-card">
      <div className="card-header">
        <div className="history-header-title">
          <h3>Church Service Sessions History</h3>
          <span className="history-count">
            {sessions.length} {sessions.length === 1 ? 'Session' : 'Sessions'} Total
          </span>
        </div>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh Session List"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="card-body">
        {/* Filters & Search */}
        <div className="session-filters-row">
          <input
            type="text"
            className="form-control session-search-input"
            placeholder="Search by sermon title or session ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <div className="status-filter-group">
            <label htmlFor="status-filter-select">Status:</label>
            <select
              id="status-filter-select"
              className="form-control status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="interrupted">Interrupted</option>
              <option value="audio_only">Audio Only</option>
              <option value="partial_transcript">Partial Transcript</option>
              <option value="verified">Verified</option>
            </select>
          </div>
        </div>

        {/* Sessions List */}
        {filteredSessions.length === 0 ? (
          <div className="empty-state">
            <p>
              {sessions.length === 0
                ? 'No sessions recorded yet. Start a live recording or upload a sermon to create your first session.'
                : 'No sessions match your search criteria.'}
            </p>
          </div>
        ) : (
          <div className="sessions-list-grid">
            {filteredSessions.map((s) => (
              <div key={s.session_id} className={`session-card-item ${s.is_interrupted ? 'session-item--interrupted' : ''}`}>
                <div className="session-card-top">
                  <div className="session-title-block">
                    <h4 className="session-title">{s.title || 'Untitled Session'}</h4>
                    <span className="session-date-sub">{formatDate(s.date_created)}</span>
                  </div>
                  <div className="session-badges-block">
                    {getStatusBadge(s)}
                    {s.verification_status === 'complete' && (
                      <span className="badge badge--verified">✅ Verified</span>
                    )}
                    {s.verification_status === 'in_progress' && (
                      <span className="badge badge--warning">🔄 Verifying</span>
                    )}
                    {s.reporting_status === 'reports_ready' && (
                      <span className="badge badge--primary">⚡ Reports Ready</span>
                    )}
                    {s.reporting_status === 'partial' && (
                      <span className="badge badge--warning">⚡ Report Draft</span>
                    )}
                    {s.editing_status === 'complete' && (
                      <span className="badge badge--success">✓ Editing Complete</span>
                    )}
                    {(s.editing_status === 'draft_ready' || s.editing_status === 'in_review') && (
                      <span className="badge badge--primary">📝 In Editing</span>
                    )}
                  </div>
                </div>

                <div className="session-card-details">
                  <div className="session-stat">
                    <span className="stat-label">Duration:</span>
                    <span className="stat-value">{formatSeconds(s.duration_seconds || s.audio_duration_seconds)}</span>
                  </div>

                  <div className="session-stat">
                    <span className="stat-label">Artifacts:</span>
                    <span className="session-artifacts">
                      {(s.audio_filename || s.audio_file_size > 0) && (
                        <span className="artifact-tag tag--audio">✓ Audio</span>
                      )}
                      {(s.transcript_id || s.segment_count > 0) && (
                        <span className="artifact-tag tag--transcript">✓ Raw Transcript</span>
                      )}
                      {s.verification_status === 'complete' && (
                        <span className="artifact-tag tag--verified">✓ Verified</span>
                      )}
                      {s.reporting_status === 'reports_ready' && (
                        <span className="artifact-tag tag--reported">✓ Reports (A & B)</span>
                      )}
                      {(s.editing_status === 'complete' || s.editing_status === 'draft_ready' || s.editing_status === 'in_review') && (
                        <span className="artifact-tag tag--edited">✓ Edited Report</span>
                      )}
                      {s.flag_count > 0 && s.verification_status !== 'complete' && (
                        <span className="artifact-tag tag--flag" title={`${s.flag_count} items flagged for verification`}>
                          ⚠️ {s.flag_count} {s.flag_count === 1 ? 'Flag' : 'Flags'}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {s.recovery_notes && (
                  <div className="session-recovery-note">
                    <small>ℹ️ {s.recovery_notes}</small>
                  </div>
                )}

                <div className="session-card-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    onClick={() => onOpenSession(s.session_id)}
                  >
                    {s.editing_status === 'complete'
                      ? 'Ready for Proofreading →'
                      : s.editing_status === 'draft_ready' || s.editing_status === 'in_review'
                      ? 'Continue Editing →'
                      : s.reporting_status === 'reports_ready'
                      ? 'Continue to Editing →'
                      : s.verification_status === 'complete'
                      ? 'Continue to Reporting →'
                      : 'Open Session →'}
                  </button>

                  <button
                    type="button"
                    className="btn btn--danger-outline btn--small"
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete session "${s.title}"?`)) {
                        onDeleteSession(s.session_id)
                      }
                    }}
                    title="Delete session record"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
