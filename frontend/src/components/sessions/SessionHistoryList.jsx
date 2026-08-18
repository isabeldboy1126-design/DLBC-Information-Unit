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

    // Stage indicators
    const isInterrupted = !!s.is_interrupted
    const isLive = s.status === 'recording'
    const isFinalComplete = s.final_report_status === 'complete'
    const isProofreadComplete = s.proofreading_status === 'complete'
    const isProofreadingReview = s.proofreading_status === 'ready_for_review' || s.proofreading_status === 'generating'
    const isEditingComplete = s.editing_status === 'complete'
    const isEditingDraft = s.editing_status === 'draft_ready' || s.editing_status === 'in_review' || s.editing_status === 'generating'
    const isReportsReady = s.reporting_status === 'reports_ready'
    const isVerified = s.verification_status === 'completed' || !!s.verified_text || !!s.verified_at
    const needsVerification = !isVerified && (s.flag_count > 0 || s.verification_status === 'in_progress') && !isReportsReady && !isEditingComplete && !isEditingDraft && !isProofreadComplete && !isProofreadingReview && !isFinalComplete

    // 2. Tab Filter (All, In Progress, Completed, Needs Attention)
    let matchesTab = true
    if (activeTab === 'in_progress') {
      matchesTab = isLive || (!isFinalComplete && !isInterrupted)
    } else if (activeTab === 'completed') {
      matchesTab = isFinalComplete
    } else if (activeTab === 'needs_attention') {
      matchesTab = isInterrupted || needsVerification
    }

    // 3. Status Dropdown Filter
    let matchesStatus = true
    if (statusFilter !== 'all') {
      if (statusFilter === 'interrupted') {
        matchesStatus = isInterrupted
      } else if (statusFilter === 'needs_verification') {
        matchesStatus = needsVerification
      } else if (statusFilter === 'verified') {
        matchesStatus = isVerified && !isReportsReady && !isEditingComplete && !isProofreadComplete && !isFinalComplete
      } else if (statusFilter === 'editing') {
        matchesStatus = isEditingComplete || isEditingDraft || isReportsReady
      } else if (statusFilter === 'completed') {
        matchesStatus = isFinalComplete
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
            const isInterrupted = !!s.is_interrupted
            const isLive = s.status === 'recording'
            const isFinalComplete = s.final_report_status === 'complete'
            const isProofreadComplete = s.proofreading_status === 'complete'
            const isProofreadingReview = s.proofreading_status === 'ready_for_review' || s.proofreading_status === 'generating'
            const isEditingComplete = s.editing_status === 'complete'
            const isEditingDraft = s.editing_status === 'draft_ready' || s.editing_status === 'in_review' || s.editing_status === 'generating'
            const isReportsReady = s.reporting_status === 'reports_ready'
            const isVerified = s.verification_status === 'completed' || !!s.verified_text || !!s.verified_at
            const needsVerification = !isVerified && (s.flag_count > 0 || s.verification_status === 'in_progress') && !isReportsReady && !isEditingComplete && !isEditingDraft && !isProofreadComplete && !isProofreadingReview && !isFinalComplete

            // Determine card accent class, badge, and CTA action
            let accentClass = 'session-card-accent--default'
            let badgeComponent = <span className="status-badge badge--default">● In Progress</span>
            let actionBtnText = 'View Workspace'
            let actionBtnClass = 'btn--primary'

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
            } else if (isFinalComplete) {
              accentClass = 'session-card-accent--completed'
              badgeComponent = <span className="status-badge badge--completed">🏆 Complete</span>
              actionBtnText = 'Download Document'
              actionBtnClass = 'btn--primary'
            } else if (isProofreadComplete) {
              accentClass = 'session-card-accent--proofread'
              badgeComponent = <span className="status-badge badge--proofread">● Proofreading Complete</span>
              actionBtnText = 'Continue to Final Report'
              actionBtnClass = 'btn--primary'
            } else if (isProofreadingReview) {
              accentClass = 'session-card-accent--proofread'
              badgeComponent = <span className="status-badge badge--proofread">● Proofreading Review</span>
              actionBtnText = 'Continue to Proofreading'
              actionBtnClass = 'btn--primary'
            } else if (isEditingComplete) {
              accentClass = 'session-card-accent--editing'
              badgeComponent = <span className="status-badge badge--editing">● Editing Complete</span>
              actionBtnText = 'Continue to Proofreading'
              actionBtnClass = 'btn--primary'
            } else if (isEditingDraft) {
              accentClass = 'session-card-accent--editing'
              badgeComponent = <span className="status-badge badge--editing">● Editing Draft Ready</span>
              actionBtnText = 'Continue to Editing'
              actionBtnClass = 'btn--primary'
            } else if (isReportsReady) {
              accentClass = 'session-card-accent--reported'
              badgeComponent = <span className="status-badge badge--reported">● Reports Ready</span>
              actionBtnText = 'Continue to Editing'
              actionBtnClass = 'btn--primary'
            } else if (isVerified) {
              accentClass = 'session-card-accent--verified'
              badgeComponent = <span className="status-badge badge--verified">✓ Verified</span>
              actionBtnText = 'Continue to Reporting'
              actionBtnClass = 'btn--primary'
            } else if (needsVerification) {
              accentClass = 'session-card-accent--verification'
              badgeComponent = <span className="status-badge badge--verification">Needs Verification</span>
              actionBtnText = 'Continue Verification'
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
