import { sessionWorkflow, isApproved, hasReviewableReport } from './sessionWorkflow'
import { Icon } from '../common/Icon'
import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl, authFetch } from '../../config'
import { getSessionHierarchy } from './SessionDetailView'
import { ConfirmationModal } from '../common/ConfirmationModal'
import { SessionListStatus } from './SessionListStatus'

function ClockIcon() { return <Icon name="clock" /> }

function FilterIcon() { return <Icon name="filter" /> }

function SearchIcon() { return <Icon name="search" /> }

function TrashIcon() { return <Icon name="archive" /> }

/**
 * SessionHistoryList — High-end productivity workspace matching the linear/vercel design standard.
 */
export function SessionHistoryList({
  sessions = [],
  onOpenSession,
  onDeleteSession,
  onRestoreSession,
  onRefresh,
  onStartNewSession,
  isLoading,
  sessionsLoaded,
  sessionsError,
  initialStatusFilter = 'all',
}) {
  const [showArchived, setShowArchived] = useState(false)
  const [archiveError, setArchiveError] = useState(null)
  const [restoreBusy, setRestoreBusy] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.location.hash.includes('filter_open')
    } catch {
      return false
    }
  })
  const [isEventDropdownOpen, setIsEventDropdownOpen] = useState(false)
  const [selectedProgrammeFilter, setSelectedProgrammeFilter] = useState('all')
  const [selectedSessionFilter, setSelectedSessionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all')
  const [dateFilter, setDateFilter] = useState('all')
  const [configuredProgrammes, setConfiguredProgrammes] = useState([])
  const [sessionToDelete, setSessionToDelete] = useState(null)
  const [isDeletingSession, setIsDeletingSession] = useState(false)

  const filterRef = useRef(null)
  const eventDropdownRef = useRef(null)

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
        const res = await authFetch(getApiUrl('/api/programmes?include_archived=false'))
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

  // Close event selector dropdown on outside click or escape
  useEffect(() => {
    if (!isEventDropdownOpen) return
    const handleClickOutside = (e) => {
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target)) {
        setIsEventDropdownOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsEventDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEventDropdownOpen])

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

  // Extract primary Session and secondary Programme (never omit Programme)
  const getSessionDisplayNames = (s) => {
    const { programme, sessionTitle } = getSessionHierarchy(s)
    return {
      programmeName: programme || 'Sunday Worship Service',
      sessionName: sessionTitle || 'Sunday Morning Service',
    }
  }

  // Ensure newest sessions appear first by default
  const sortedSessions = [...sessions].sort((a, b) => {
    return new Date(b.date_created || 0) - new Date(a.date_created || 0)
  })

  // Filter sessions
  const filteredSessions = sortedSessions.filter((s) => {
    if (!!s.is_archived !== showArchived) return false
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
    const isFinalComplete = isApproved(s)
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
      if (statusFilter === 'attention') matchesStatus = sessionWorkflow(s).attention
      else if (statusFilter === 'interrupted') matchesStatus = isInterrupted
      else if (statusFilter === 'needs_verification') matchesStatus = needsVerification
      else if (statusFilter === 'verified') matchesStatus = isVerified && !isReportsReady && !isEditingComplete && !isProofreadComplete && !isFinalComplete
      else if (statusFilter === 'editing') matchesStatus = isEditingComplete || isEditingDraft || isReportsReady
      else if (statusFilter === 'needs_review') matchesStatus = hasReviewableReport(s) && !isApproved(s)
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

  const activeSessionsCount = sessions.filter((s) => !isApproved(s) && !s.is_archived).length

  return (
    <div className="sessions-history-page-container">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & NEW SESSION ACTION                            */}
      {/* ------------------------------------------------------------- */}
      <div className="sessions-history-header">
        <div>
          <h1 className="sessions-history-title">Sessions History</h1>
          <p className="sessions-history-subtitle">
            Active sessions: {sessionsLoaded ? activeSessionsCount : 'Unknown'}
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
              {isLoading ? 'Loading…' : sessionsError ? 'Retry' : '↻ Refresh'}
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

      <div className="archive-switch" aria-label="Session collection"><button type="button" aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>Active sessions</button><button type="button" aria-pressed={showArchived} onClick={() => setShowArchived(true)}>Archived sessions</button></div>
      {archiveError && <div className="error-banner" role="alert">{archiveError}</div>}
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

        {/* Event / Programme Visible Selector */}
        <div className="sessions-event-selector-anchor" ref={eventDropdownRef}>
          <button
            type="button"
            className={`sessions-event-selector-btn ${selectedProgrammeFilter !== 'all' ? 'sessions-event-selector-btn--active' : ''}`}
            onClick={() => setIsEventDropdownOpen(!isEventDropdownOpen)}
            aria-expanded={isEventDropdownOpen}
            aria-label="Filter by Event or Programme"
            id="btn-sessions-event-selector"
          >
            <span className="event-selector-label">Event:</span>
            <span className="event-selector-value">
              {selectedProgrammeFilter === 'all' ? 'All Events' : selectedProgrammeFilter}
            </span>
            <span className="event-selector-caret" aria-hidden="true">▾</span>
          </button>

          {isEventDropdownOpen && (
            <div className="sessions-event-dropdown-menu" role="menu">
              <button
                type="button"
                className={`event-dropdown-item ${selectedProgrammeFilter === 'all' ? 'event-dropdown-item--selected' : ''}`}
                onClick={() => {
                  handleProgrammeFilterChange('all')
                  setIsEventDropdownOpen(false)
                }}
              >
                All Events
              </button>
              {configuredProgrammes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`event-dropdown-item ${selectedProgrammeFilter === p.name ? 'event-dropdown-item--selected' : ''}`}
                  onClick={() => {
                    handleProgrammeFilterChange(p.name)
                    setIsEventDropdownOpen(false)
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
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
                {(activeFilterCount > 0 || selectedProgrammeFilter !== 'all') && (
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
                {/* 1. Session / Section Filter (Cascading) */}
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

                {/* 2. Status Filter */}
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
                    <option value="attention">Needs attention</option>
                    <option value="needs_review">Needs review</option>
                    <option value="completed">Approved</option>
                    <option value="interrupted">Interrupted</option>
                    <option value="live">Live</option>
                  </select>
                </div>

                {/* 3. Timeframe Filter */}
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
      <SessionListStatus isLoading={isLoading} hasLoaded={sessionsLoaded} error={sessionsError} />
      {!sessionsLoaded ? null : filteredSessions.length === 0 ? (
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
            const isFinalComplete = isApproved(s)
            const isProofreadComplete = s.proofreading_status === 'complete'
            const isProofreadingReview = s.proofreading_status === 'ready_for_review' || s.proofreading_status === 'generating'
            const isEditingComplete = s.editing_status === 'complete'
            const isEditingDraft = s.editing_status === 'draft_ready' || s.editing_status === 'in_review' || s.editing_status === 'generating'
            const isReportsReady = s.reporting_status === 'reports_ready'
            const isVerified = s.verification_status === 'completed' || !!s.verified_text || !!s.verified_at
            const needsVerification = !isVerified && (s.flag_count > 0 || s.verification_status === 'in_progress') && !isReportsReady && !isEditingComplete && !isEditingDraft && !isProofreadComplete && !isProofreadingReview && !isFinalComplete

            // Status label, pill color scheme, and target workflow stage
            let statusLabel = 'In Progress'
            let statusPillClass = 'session-card-pill--neutral'
            let actionText = 'View →'
            let targetWorkflowStage = 'overview'

            if (isInterrupted) {
              statusLabel = 'Interrupted'
              statusPillClass = 'session-card-pill--danger'
              actionText = 'Review Log →'
              targetWorkflowStage = 'overview'
            } else if (isLive) {
              statusLabel = 'Live'
              statusPillClass = 'session-card-pill--brand'
              actionText = 'Open Monitor →'
              targetWorkflowStage = 'overview'
            } else if (isFinalComplete) {
              statusLabel = 'Completed'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Download Document →'
              targetWorkflowStage = 'final_report'
            } else if (isProofreadComplete) {
              statusLabel = 'Proofread'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Final Report →'
              targetWorkflowStage = 'final_report'
            } else if (isProofreadingReview) {
              statusLabel = 'Proofreading'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Continue →'
              targetWorkflowStage = 'proofreading'
            } else if (isEditingComplete) {
              statusLabel = 'Editing Done'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Proofreading →'
              targetWorkflowStage = 'proofreading'
            } else if (isEditingDraft) {
              statusLabel = 'Editing'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Continue →'
              targetWorkflowStage = 'editing'
            } else if (isReportsReady) {
              statusLabel = 'Reports Ready'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Process with AI →'
              targetWorkflowStage = 'report_processing'
            } else if (isVerified) {
              statusLabel = 'Verified'
              statusPillClass = 'session-card-pill--neutral'
              actionText = 'Process with AI →'
              targetWorkflowStage = 'report_processing'
            } else if (needsVerification) {
              statusLabel = `${s.flag_count || 1} to verify`
              statusPillClass = 'session-card-pill--warning'
              actionText = 'Review →'
              targetWorkflowStage = 'verification'
            }

            const formattedDate = formatCardDate(s.date_created)
            const humanDuration = formatHumanDuration(s.duration_seconds || s.audio_duration_seconds)

            if (hasReviewableReport(s)) { const workflow = sessionWorkflow(s); statusLabel = workflow.label; actionText = workflow.action; targetWorkflowStage = workflow.stage }
            return (
              <div
                key={s.session_id}
                className="refined-session-card"
                onClick={() => onOpenSession && onOpenSession(s.session_id, 'overview')}
              >
                {/* Top Row: Status Pill */}
                <div className="session-card-top-row">
                  <span className={`session-card-pill ${statusPillClass}`}>
                    <span className="pill-dot">●</span>
                    <span className="pill-label">{statusLabel}</span>
                  </span>
                </div>

                {/* Primary Dominant Session Title (Session-focused) */}
                <div className="session-card-title-stack">
                  <h2 className="session-card-dominant-title" title={sessionName}>
                    {sessionName}
                  </h2>
                </div>

                {/* Clean Metadata Row: Date & Human Timeframe with clock icon */}
                <div className="session-card-meta-row">
                  <span className="session-card-meta-date">{formattedDate}</span>
                  <span className="session-card-meta-duration">
                    <ClockIcon />
                    <span>{humanDuration}</span>
                  </span>
                </div>

                {/* Footer: Interactive Next Action & Quiet Delete */}
                <div className="session-card-footer">
                  <button
                    type="button"
                    className="session-card-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onOpenSession) onOpenSession(s.session_id, targetWorkflowStage)
                    }}
                  >
                    {actionText}
                  </button>

                  {showArchived && onRestoreSession && <button type="button" className="btn btn--secondary" disabled={restoreBusy === s.session_id} onClick={async e => { e.stopPropagation(); setRestoreBusy(s.session_id); setArchiveError(null); const ok = await onRestoreSession(s.session_id); if (!ok) setArchiveError('Session could not be restored. Your archived source remains preserved. Try again.'); setRestoreBusy(null) }}>{restoreBusy === s.session_id ? 'Restoring…' : 'Restore session'}</button>}
                  {onDeleteSession && !showArchived && (
                    <button
                      type="button"
                      className="session-card-delete-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSessionToDelete({ id: s.session_id, name: sessionName })
                      }}
                      title="Archive session"
                      aria-label="Archive session"
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

      {/* Reusable Confirmation Modal for Session Deletion */}
      <ConfirmationModal
        isOpen={!!sessionToDelete}
        title="Archive session?"
        message={`Archive "${sessionToDelete?.name || 'this session'}" from active work?`}
        supportingText="Original audio, transcripts and revisions remain preserved. You can restore this session from Archived sessions."
        confirmLabel="Archive session"
        cancelLabel="Cancel"
        variant="primary"
        isLoading={isDeletingSession}
        onCancel={() => setSessionToDelete(null)}
        onConfirm={async () => {
          if (!sessionToDelete) return
          setArchiveError(null)
          setIsDeletingSession(true)
          try {
            const ok = await onDeleteSession(sessionToDelete.id)
            setSessionToDelete(null)
            if (!ok) setArchiveError('Session could not be archived. It remains in active work. Try again.')
          } catch (err) {
            console.error('Failed to delete session:', err)
          } finally {
            setIsDeletingSession(false)
          }
        }}
      />
    </div>
  )
}

