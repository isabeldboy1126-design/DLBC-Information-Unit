import React, { useState } from 'react'

/**
 * SessionHistoryList — Sessions history matching sessions-history.png.
 * 
 * Features:
 * - Top header: Title, Subtitle, and "+ New Session" CTA button.
 * - Search bar and Quick Filter status tab pills:
 *   [ All Sessions | In Progress | Completed | ⚠ Needs Attention ]
 * - Secondary filter row with Status dropdown and Date Range dropdown.
 * - 3-Column Card Grid with top accent borders:
 *   - Red top accent: Interrupted sessions
 *   - Blue top accent: Live / In-Recording sessions
 *   - Amber top accent: Needs Verification sessions
 *   - Green top accent: Verified / In-Reporting sessions
 *   - Navy top accent: Completed / Final Report Ready sessions
 * - Retains delete session with confirmation and refresh capabilities.
 */
export function SessionHistoryList({
  sessions = [],
  onOpenSession,
  onDeleteSession,
  onRefresh,
  onStartNewSession,
  isLoading,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'in_progress' | 'completed' | 'needs_attention'
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00:00'
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return isoStr
    }
  }

  const formatTime = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  // Filter logic
  const filteredSessions = sessions.filter((s) => {
    // 1. Search Query Filter
    const query = searchTerm.toLowerCase().trim()
    const matchesSearch =
      !query ||
      (s.title || '').toLowerCase().includes(query) ||
      (s.session_id || '').toLowerCase().includes(query) ||
      (s.metadata_json || '').toLowerCase().includes(query)

    // 2. Tab Filter (All, In Progress, Completed, Needs Attention)
    let matchesTab = true
    if (activeTab === 'in_progress') {
      matchesTab = s.status === 'recording' || (s.final_report_status !== 'complete' && !s.is_interrupted)
    } else if (activeTab === 'completed') {
      matchesTab = s.final_report_status === 'complete' || s.status === 'completed'
    } else if (activeTab === 'needs_attention') {
      matchesTab = !!s.is_interrupted || (s.flag_count > 0 && s.verification_status !== 'completed')
    }

    // 3. Status Dropdown Filter
    let matchesStatus = true
    if (statusFilter !== 'all') {
      if (statusFilter === 'interrupted') {
        matchesStatus = !!s.is_interrupted
      } else if (statusFilter === 'needs_verification') {
        matchesStatus = s.flag_count > 0 && s.verification_status !== 'completed'
      } else if (statusFilter === 'verified') {
        matchesStatus = s.verification_status === 'completed'
      } else if (statusFilter === 'editing') {
        matchesStatus = s.editing_status === 'complete' || s.editing_status === 'draft_ready'
      } else if (statusFilter === 'completed') {
        matchesStatus = s.final_report_status === 'complete' || s.status === 'completed'
      }
    }

    // 4. Date Dropdown Filter
    let matchesDate = true
    if (dateFilter !== 'all' && s.date_created) {
      const now = new Date().getTime()
      const sessTime = new Date(s.date_created).getTime()
      const diffDays = (now - sessTime) / (1000 * 3600 * 24)
      if (dateFilter === '7days') {
        matchesDate = diffDays <= 7
      } else if (dateFilter === '30days') {
        matchesDate = diffDays <= 30
      }
    }

    return matchesSearch && matchesTab && matchesStatus && matchesDate
  })

  return (
    <div className="sessions-history-page-container">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & NEW SESSION ACTION                            */}
      {/* ------------------------------------------------------------- */}
      <div className="sessions-history-header">
        <div>
          <h1 className="sessions-history-title">Sessions History</h1>
          <p className="sessions-history-subtitle">
            Showing all recorded and active sessions{' '}
            <span className="sessions-count-pill">{sessions.length}</span>
          </p>
        </div>

        <div className="sessions-header-actions">
          {onRefresh && (
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh session list from database"
            >
              ↻ Refresh
            </button>
          )}

          {onStartNewSession && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={onStartNewSession}
              id="btn-history-new-session"
            >
              + New Session
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. FILTER & SEARCH CONTROLS                                   */}
      {/* ------------------------------------------------------------- */}
      <div className="sessions-filter-panel">
        {/* Top Filter Row: Search + Status Tabs */}
        <div className="filter-top-row">
          <div className="filter-search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="filter-search-input"
              placeholder="Search service, title, minister..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-tabs-group">
            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'all' ? 'filter-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Sessions
            </button>

            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'in_progress' ? 'filter-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('in_progress')}
            >
              In Progress
            </button>

            <button
              type="button"
              className={`filter-tab-btn ${activeTab === 'completed' ? 'filter-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              Completed
            </button>

            <button
              type="button"
              className={`filter-tab-btn filter-tab-btn--attention ${
                activeTab === 'needs_attention' ? 'filter-tab-btn--active-attention' : ''
              }`}
              onClick={() => setActiveTab('needs_attention')}
            >
              ⚠️ Needs Attention
            </button>
          </div>
        </div>

        {/* Secondary Filter Row: Dropdowns & Reset */}
        <div className="filter-sub-row">
          <div className="filter-dropdowns">
            <select
              className="form-control filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="needs_verification">Needs Verification</option>
              <option value="verified">Verified</option>
              <option value="editing">In Editing</option>
              <option value="completed">Completed</option>
              <option value="interrupted">Interrupted</option>
            </select>

            <select
              className="form-control filter-select"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
          </div>

          {(searchTerm || activeTab !== 'all' || statusFilter !== 'all' || dateFilter !== 'all') && (
            <button
              type="button"
              className="btn-clear-filters"
              onClick={() => {
                setSearchTerm('')
                setActiveTab('all')
                setStatusFilter('all')
                setDateFilter('all')
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. 3-COLUMN SESSION CARDS GRID                                */}
      {/* ------------------------------------------------------------- */}
      {filteredSessions.length === 0 ? (
        <div className="sessions-empty-card">
          <div className="empty-icon">📋</div>
          <h3>No Sessions Found</h3>
          <p>
            {sessions.length === 0
              ? 'No sessions have been recorded yet. Click "+ New Session" to start recording your first service.'
              : 'No sessions match your search or filter criteria.'}
          </p>
        </div>
      ) : (
        <div className="sessions-cards-grid-3col">
          {filteredSessions.map((s) => {
            const isInterrupted = s.is_interrupted
            const isLive = s.status === 'recording'
            const isVerified = s.verification_status === 'completed' || !!s.verified_text
            const needsVerification = s.flag_count > 0 && !isVerified
            const isFinalReady = s.final_report_status === 'complete'

            // Determine card accent class and badge
            let accentClass = 'session-card-accent--default'
            let badgeComponent = <span className="status-badge badge--default">Completed</span>
            let actionBtnText = 'View Record'
            let actionBtnClass = 'btn--outline'

            if (isInterrupted) {
              accentClass = 'session-card-accent--interrupted'
              badgeComponent = <span className="status-badge badge--interrupted">⚠️ Interrupted</span>
              actionBtnText = 'Review Log'
              actionBtnClass = 'btn--danger'
            } else if (isLive) {
              accentClass = 'session-card-accent--live'
              badgeComponent = <span className="status-badge badge--live">● Live</span>
              actionBtnText = 'Open Monitor'
              actionBtnClass = 'btn--primary'
            } else if (needsVerification) {
              accentClass = 'session-card-accent--verification'
              badgeComponent = <span className="status-badge badge--verification">Needs Verification</span>
              actionBtnText = 'Continue Verification'
              actionBtnClass = 'btn--primary'
            } else if (isVerified && s.reporting_status === 'reports_ready') {
              accentClass = 'session-card-accent--editing'
              badgeComponent = <span className="status-badge badge--editing">📄 Ready for Editing</span>
              actionBtnText = 'Continue Editing'
              actionBtnClass = 'btn--primary'
            } else if (isVerified) {
              accentClass = 'session-card-accent--verified'
              badgeComponent = <span className="status-badge badge--verified">✓ Verified</span>
              actionBtnText = 'View Record'
              actionBtnClass = 'btn--outline'
            } else if (isFinalReady) {
              accentClass = 'session-card-accent--completed'
              badgeComponent = <span className="status-badge badge--completed">🏆 Final Report</span>
              actionBtnText = 'Download Report'
              actionBtnClass = 'btn--primary'
            }

            return (
              <div key={s.session_id} className={`session-card-stitch ${accentClass}`}>
                {/* Card Top: Status Badge + Date */}
                <div className="card-stitch-top">
                  {badgeComponent}
                  <span className="card-stitch-date">{formatDate(s.date_created)}</span>
                </div>

                {/* Card Body: Title + Speaker */}
                <div className="card-stitch-body">
                  <h3 className="card-stitch-title" title={s.title || 'Untitled Session'}>
                    {s.title || 'Untitled Session'}
                  </h3>

                  <div className="card-stitch-speaker">
                    <span className="speaker-icon">👤</span>
                    <span className="speaker-name">
                      {s.minister || (s.metadata_json ? JSON.parse(s.metadata_json || '{}').minister : '') || 'Pastor / Minister'}
                    </span>
                  </div>
                </div>

                {/* Card Meta: Time & Duration */}
                <div className="card-stitch-meta-row">
                  <div className="meta-col">
                    <span className="meta-col-label">Time</span>
                    <span className="meta-col-val">{formatTime(s.date_created)}</span>
                  </div>

                  <div className="meta-col">
                    <span className="meta-col-label">Duration</span>
                    <span className="meta-col-val">
                      {formatDuration(s.duration_seconds || s.audio_duration_seconds)}
                    </span>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="card-stitch-footer">
                  <button
                    type="button"
                    className={`btn btn--small btn--full-width ${actionBtnClass}`}
                    onClick={() => onOpenSession(s.session_id)}
                  >
                    {actionBtnText}
                  </button>

                  {onDeleteSession && (
                    <button
                      type="button"
                      className="btn-delete-stitch"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`Delete session "${s.title || s.session_id}"?`)) {
                          onDeleteSession(s.session_id)
                        }
                      }}
                      title="Delete session record"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
