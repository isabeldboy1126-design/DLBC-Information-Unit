import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl } from '../../config'

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

/**
 * SessionHistoryList — High-end productivity workspace matching the linear/vercel design standard.
 */
export function SessionHistoryList({
  sessions = [],
  onOpenSession,
  onDeleteSession,
  onRefresh,
  onStartNewSession,
  isLoading,
  initialStatusFilter = 'all',
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.location.hash.includes('filter_open')
    } catch {
      return false
    }
  })
  const [selectedProgrammeFilter, setSelectedProgrammeFilter] = useState('all')
  const [selectedSessionFilter, setSelectedSessionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all')
  const [dateFilter, setDateFilter] = useState('all')
  const [configuredProgrammes, setConfiguredProgrammes] = useState([])

  const filterRef = useRef(null)

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter)
    }
  }, [initialStatusFilter])

  // Fetch real configured programmes from backend
  useEffect(() => {
    let isMounted = true
    async function fetchProgrammes() {
      try {
        const res = await fetch(getApiUrl('/api/programmes?include_archived=false'))
        if (res.ok && isMounted) {
          const data = await res.json()
          setConfiguredProgrammes(data)
        }
      } catch (e) {
        console.error('Failed to load programmes for filtering:', e)
      }
    }
    fetchProgrammes()
    return () => { isMounted = false }
  }, [])

  // Close filter popover on outside click or escape
  useEffect(() => {
    if (!isFilterOpen) return
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setIsFilterOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFilterOpen])

  // Active sessions belonging to currently selected programme filter
  const activeProgrammeObj = configuredProgrammes.find(
    (p) => p.name === selectedProgrammeFilter || p.id === selectedProgrammeFilter
  )
  const availableProgrammeSessions = activeProgrammeObj
    ? (activeProgrammeObj.sessions || []).filter((s) => !s.is_archived)
    : []

  const handleProgrammeFilterChange = (val) => {
    setSelectedProgrammeFilter(val)
    setSelectedSessionFilter('all')
  }

  const clearAllFilters = () => {
    setSelectedProgrammeFilter('all')
    setSelectedSessionFilter('all')
    setStatusFilter('all')
    setDateFilter('all')
    setSearchTerm('')
  }

  const activeFilterCount =
    (selectedProgrammeFilter !== 'all' ? 1 : 0) +
    (selectedSessionFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0)

  // Human-readable duration formatting (e.g. 25m, 1h 14m, 1h 30m, 45s)
  const formatHumanDuration = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '—'
    const secs = Math.round(totalSeconds)
    if (secs < 60) return `${secs}s`
    const hours = Math.floor(secs / 3600)
    const mins = Math.floor((secs % 3600) / 60)
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }
    return `${mins}m`
  }

  const formatCardDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return isoStr
    }
  }

  // Extract primary Session and secondary Programme, eliminating exact duplicates
  const getSessionDisplayNames = (s) => {
    let programmeName = ''
    let sessionName = ''

    if (s.metadata_json) {
      try {
        const meta = typeof s.metadata_json === 'string' ? JSON.parse(s.metadata_json) : s.metadata_json
        programmeName = meta.programme || meta.eventType || ''
        sessionName = meta.programmeSession || meta.session_name || ''
      } catch {}
    }

    if (!programmeName && s.programme) programmeName = s.programme
    if (!programmeName && s.programme_type) programmeName = s.programme_type

    const title = (s.title || '').trim()
    if (!sessionName && title.includes('—')) {
      const parts = title.split('—').map((p) => p.trim())
      if (parts.length >= 2) {
        if (!programmeName) programmeName = parts[0]
        sessionName = parts.slice(1).join(' — ')
      }
    } else if (!sessionName && title.includes(' - ')) {
      const parts = title.split(' - ').map((p) => p.trim())
      if (parts.length >= 2) {
        if (!programmeName) programmeName = parts[0]
        sessionName = parts.slice(1).join(' - ')
      }
    }

    if (!sessionName) {
      sessionName = title || 'Untitled Session'
    }

    // Dedup: if programme and session names are identical, omit secondary line
    const isDuplicate =
      programmeName && sessionName &&
      programmeName.toLowerCase().trim() === sessionName.toLowerCase().trim()

    return {
      programmeName: isDuplicate ? '' : programmeName,
      sessionName,
    }
  }

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    const query = searchTerm.toLowerCase().trim()
    const matchesSearch =
      !query ||
      (s.title || '').toLowerCase().includes(query) ||
      (s.session_id || '').toLowerCase().includes(query) ||
      (s.metadata_json || '').toLowerCase().includes(query)

    // Programme Filter
    let matchesProg = true
    if (selectedProgrammeFilter !== 'all') {
      const { programmeName } = getSessionDisplayNames(s)
      matchesProg =
        programmeName.toLowerCase().includes(selectedProgrammeFilter.toLowerCase()) ||
        (s.title || '').toLowerCase().includes(selectedProgrammeFilter.toLowerCase()) ||
        (s.metadata_json || '').toLowerCase().includes(selectedProgrammeFilter.toLowerCase())
    }

    // Session Filter
    let matchesSess = true
    if (selectedSessionFilter !== 'all') {
      const { sessionName } = getSessionDisplayNames(s)
      matchesSess =
        sessionName.toLowerCase().includes(selectedSessionFilter.toLowerCase()) ||
        (s.title || '').toLowerCase().includes(selectedSessionFilter.toLowerCase()) ||
        (s.metadata_json || '').toLowerCase().includes(selectedSessionFilter.toLowerCase())
    }

    // Stage detection
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

    // Status Filter
    let matchesStatus = true
    if (statusFilter !== 'all') {
      if (statusFilter === 'interrupted') matchesStatus = isInterrupted
      else if (statusFilter === 'needs_verification') matchesStatus = needsVerification
      else if (statusFilter === 'verified') matchesStatus = isVerified && !isReportsReady && !isEditingComplete && !isProofreadComplete && !isFinalComplete
      else if (statusFilter === 'editing') matchesStatus = isEditingComplete || isEditingDraft || isReportsReady
      else if (statusFilter === 'completed') matchesStatus = isFinalComplete
      else if (statusFilter === 'live') matchesStatus = isLive
    }

    // Date Filter
    let matchesDate = true
    if (dateFilter !== 'all' && s.date_created) {
      const now = new Date().getTime()
      const sessTime = new Date(s.date_created).getTime()
      const diffDays = (now - sessTime) / (1000 * 3600 * 24)
      if (dateFilter === '7days') matchesDate = diffDays <= 7
      else if (dateFilter === '30days') matchesDate = diffDays <= 30
      else if (dateFilter === '90days') matchesDate = diffDays <= 90
    }

    return matchesSearch && matchesProg && matchesSess && matchesStatus && matchesDate
  })

  const activeSessionsCount = sessions.filter((s) => s.final_report_status !== 'complete').length

  return (
    <div className="sessions-history-page-container">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & NEW SESSION ACTION                            */}
      {/* ------------------------------------------------------------- */}
      <div className="sessions-history-header">
        <div>
          <h1 className="sessions-history-title">Sessions History</h1>
          <p className="sessions-history-subtitle">
            Active sessions: {activeSessionsCount}
          </p>
        </div>

        <div className="sessions-header-actions">
          {onRefresh && (
            <button
              type="button"
              className="btn btn--outline btn--small sessions-refresh-btn"
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
              className="btn btn--primary sessions-new-session-cta"
              onClick={onStartNewSession}
              id="btn-history-new-session"
            >
              + New Session
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. FILTER & SEARCH TOOLBAR WITH ELEGANT POPOVER               */}
      {/* ------------------------------------------------------------- */}
      <div className="sessions-toolbar">
        <div className="sessions-search-box">
          <SearchIcon />
          <input
            type="text"
            className="sessions-search-input"
            placeholder="Search sessions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="input-sessions-search"
          />
        </div>

        {/* Filter Popover Trigger */}
        <div className="sessions-filter-anchor" ref={filterRef}>
          <button
            type="button"
            className={`sessions-filter-trigger-btn ${activeFilterCount > 0 ? 'sessions-filter-trigger-btn--active' : ''}`}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            aria-expanded={isFilterOpen}
            aria-label="Filter sessions"
            id="btn-sessions-filter"
          >
            <FilterIcon />
            <span>{activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}</span>
          </button>

          {/* Filter Popover Panel */}
          {isFilterOpen && (
            <div className="sessions-filter-popover" role="dialog" aria-label="Session filter options">
              <div className="filter-popover-header">
                <span className="filter-popover-title">Filter Sessions</span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    className="filter-popover-clear-btn"
                    onClick={clearAllFilters}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              <div className="filter-popover-body">
                {/* 1. Programme / Event Filter */}
                <div className="filter-popover-field">
                  <label className="filter-field-label" htmlFor="filter-select-event">
                    Event / Programme
                  </label>
                  <select
                    id="filter-select-event"
                    className="form-control form-select filter-popover-select"
                    value={selectedProgrammeFilter}
                    onChange={(e) => handleProgrammeFilterChange(e.target.value)}
                  >
                    <option value="all">All Events</option>
                    {configuredProgrammes.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Session / Section Filter (Cascading) */}
                <div className="filter-popover-field">
                  <label className="filter-field-label" htmlFor="filter-select-session">
                    Session / Section
                  </label>
                  <select
                    id="filter-select-session"
                    className="form-control form-select filter-popover-select"
                    value={selectedSessionFilter}
                    onChange={(e) => setSelectedSessionFilter(e.target.value)}
                    disabled={selectedProgrammeFilter === 'all' || availableProgrammeSessions.length === 0}
                  >
                    <option value="all">
                      {selectedProgrammeFilter === 'all'
                        ? 'Select an Event first'
                        : availableProgrammeSessions.length === 0
                        ? 'No specific sessions'
                        : 'All Sessions'}
                    </option>
                    {availableProgrammeSessions.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Status Filter */}
                <div className="filter-popover-field">
                  <label className="filter-field-label" htmlFor="filter-select-status">
                    Status
                  </label>
                  <select
                    id="filter-select-status"
                    className="form-control form-select filter-popover-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="needs_verification">Needs Verification</option>
                    <option value="verified">Verified</option>
                    <option value="editing">In Editing</option>
                    <option value="completed">Completed</option>
                    <option value="interrupted">Interrupted</option>
                    <option value="live">Live</option>
                  </select>
                </div>

                {/* 4. Timeframe Filter */}
                <div className="filter-popover-field">
                  <label className="filter-field-label" htmlFor="filter-select-date">
                    Time Period
                  </label>
                  <select
                    id="filter-select-date"
                    className="form-control form-select filter-popover-select"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  >
                    <option value="all">All Time</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                    <option value="90days">Last 90 Days</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. 3-COLUMN RESTRAINED SESSION CARDS GRID                     */}
      {/* ------------------------------------------------------------- */}
      {filteredSessions.length === 0 ? (
        <div className="sessions-empty-card">
          <h3>No Sessions Found</h3>
          <p>
            {sessions.length === 0
              ? 'No sessions have been recorded yet. Click "+ New Session" to start recording your first service.'
              : 'No sessions match your search or filter criteria.'}
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={clearAllFilters}
              style={{ marginTop: '12px' }}
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="sessions-cards-grid">
          {filteredSessions.map((s) => {
            const { programmeName, sessionName } = getSessionDisplayNames(s)

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

            // Status label and pill color scheme (normal states use neutral/brand; only warning/danger use semantic color)
            let statusLabel = 'In Progress'
            let statusPillClass = 'session-card-pill--neutral'
            let actionText = 'View →'

            if (isInterrupted) {
              statusLabel = 'Interrupted'
              statusPillClass = 'session-card-pill--danger'
              actionText = 'Review Log →'
            } else if (isLive) {
              statusLabel = 'Live'
              statusPillClass = 'session-card-pill--brand'
              actionText = 'Open Monitor →'
            } else if (isFinalComplete) {
              statusLabel = 'Completed'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Download Document →'
            } else if (isProofreadComplete) {
              statusLabel = 'Proofread'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Final Report →'
            } else if (isProofreadingReview) {
              statusLabel = 'Proofreading'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Continue →'
            } else if (isEditingComplete) {
              statusLabel = 'Editing Done'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Proofreading →'
            } else if (isEditingDraft) {
              statusLabel = 'Editing'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Continue →'
            } else if (isReportsReady) {
              statusLabel = 'Reports Ready'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Continue to Editing →'
            } else if (isVerified) {
              statusLabel = 'Verified'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Continue to Reporting →'
            } else if (needsVerification) {
              statusLabel = 'Needs Verification'
              statusPillClass = 'session-card-pill--warning'
              actionText = 'Review →'
            }

            const formattedDate = formatCardDate(s.date_created)
            const humanDuration = formatHumanDuration(s.duration_seconds || s.audio_duration_seconds)

            return (
              <div key={s.session_id} className="refined-session-card">
                {/* Top Row: Programme Name (Secondary) + Status Pill */}
                <div className="session-card-top-row">
                  {programmeName ? (
                    <span className="session-card-programme" title={programmeName}>
                      {programmeName}
                    </span>
                  ) : <span />}

                  <span className={`session-card-pill ${statusPillClass}`}>
                    <span className="pill-dot">●</span>
                    <span className="pill-label">{statusLabel}</span>
                  </span>
                </div>

                {/* Primary Dominant Session Title */}
                <div className="session-card-title-stack">
                  <h2 className="session-card-dominant-title" title={sessionName}>
                    {sessionName}
                  </h2>
                </div>

                {/* Clean Metadata Row: Date & Human Timeframe without labels */}
                <div className="session-card-meta-row">
                  <span className="session-card-meta-date">{formattedDate}</span>
                  <span className="session-card-meta-duration">{humanDuration}</span>
                </div>

                {/* Footer: Interactive Next Action (white at rest, blue on hover) & Quiet Delete */}
                <div className="session-card-footer">
                  <button
                    type="button"
                    className="session-card-action-btn"
                    onClick={() => onOpenSession(s.session_id)}
                  >
                    {actionText}
                  </button>

                  {onDeleteSession && (
                    <button
                      type="button"
                      className="session-card-delete-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`Delete session "${sessionName}"?`)) {
                          onDeleteSession(s.session_id)
                        }
                      }}
                      title="Delete session record"
                      aria-label="Delete session"
                    >
                      <TrashIcon />
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

