import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl, authFetch } from '../../config'
import { getSessionHierarchy, deriveSessionDisplayStatus } from './SessionDetailView'
import { ConfirmationModal } from '../common/ConfirmationModal'

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
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
  error,
  onRetry,
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
  const [isEventDropdownOpen, setIsEventDropdownOpen] = useState(false)
  const [selectedProgrammeFilter, setSelectedProgrammeFilter] = useState('all')
  const [selectedSessionFilter, setSelectedSessionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all')
  const [dateFilter, setDateFilter] = useState('all')
  const [configuredProgrammes, setConfiguredProgrammes] = useState([])
  const [sessionToDelete, setSessionToDelete] = useState(null)
  const [isDeletingSession, setIsDeletingSession] = useState(false)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('dlbc_sessions_view_mode') || 'list'
    } catch {
      return 'list'
    }
  })

  const handleToggleViewMode = (mode) => {
    setViewMode(mode)
    try {
      localStorage.setItem('dlbc_sessions_view_mode', mode)
    } catch (e) {
      console.warn('Failed to persist sessions view mode:', e)
    }
  }

  const filterRef = useRef(null)
  const eventDropdownRef = useRef(null)

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter)
    }
  }, [initialStatusFilter])

  // Fetch real configured programmes from backend using authFetch
  useEffect(() => {
    let isMounted = true
    async function fetchProgrammes() {
      try {
        const res = await authFetch('/api/programmes?include_archived=false')
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
    const { statusKey } = deriveSessionDisplayStatus(s)

    // Status Filter
    let matchesStatus = true
    if (statusFilter !== 'all') {
      if (statusFilter === 'interrupted') matchesStatus = statusKey === 'interrupted'
      else if (statusFilter === 'needs_verification') matchesStatus = statusKey === 'needs_verification'
      else if (statusFilter === 'verified') matchesStatus = statusKey === 'verified'
      else if (statusFilter === 'editing') matchesStatus = statusKey === 'in_progress'
      else if (statusFilter === 'completed') matchesStatus = statusKey === 'completed'
      else if (statusFilter === 'live') matchesStatus = statusKey === 'live'
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
                    <option value="completed">Completed</option>
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

        {/* Desktop List / Grid Toggle */}
        <div className="sessions-view-toggle-group" role="radiogroup" aria-label="Sessions view style">
          <button
            type="button"
            className={`btn-view-toggle ${viewMode === 'list' ? 'btn-view-toggle--active' : ''}`}
            onClick={() => handleToggleViewMode('list')}
            title="Dense List View"
            aria-checked={viewMode === 'list'}
            role="radio"
            id="btn-sessions-view-list"
          >
            <ListIcon />
            <span className="btn-view-toggle-label">List</span>
          </button>
          <button
            type="button"
            className={`btn-view-toggle ${viewMode === 'grid' ? 'btn-view-toggle--active' : ''}`}
            onClick={() => handleToggleViewMode('grid')}
            title="Card Grid View"
            aria-checked={viewMode === 'grid'}
            role="radio"
            id="btn-sessions-view-grid"
          >
            <GridIcon />
            <span className="btn-view-toggle-label">Grid</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. DENSE LIST OR 3-COLUMN RESTRAINED SESSION CARDS GRID       */}
      {/* ------------------------------------------------------------- */}
      {isLoading && (!sessions || sessions.length === 0) ? (
        <div className="sessions-state-box">
          <div className="sessions-state-spinner" aria-hidden="true" />
          <p className="sessions-state-text">Loading recorded sessions...</p>
        </div>
      ) : error && (!sessions || sessions.length === 0) ? (
        <div className="sessions-state-box sessions-state-box--error" role="alert">
          <div className="sessions-state-icon">⚠️</div>
          <h3 className="sessions-state-title">Unable to Load Sessions</h3>
          <p className="sessions-state-text">
            {error || 'We could not connect to the server to load your recorded sessions.'}
          </p>
          {onRetry && (
            <button
              type="button"
              className="btn btn--outline btn--small btn-retry-load"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </div>
      ) : filteredSessions.length === 0 ? (
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
      ) : viewMode === 'list' ? (
        /* ---------------- DENSE TABLE LIST VIEW ---------------- */
        <div className="sessions-dense-table-container">
          <table className="sessions-dense-table">
            <thead>
              <tr>
                <th className="th-session">Session</th>
                <th className="th-programme">Event / Programme</th>
                <th className="th-date">Date</th>
                <th className="th-duration">Duration</th>
                <th className="th-status">Status</th>
                <th className="th-actions text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((s) => {
                const { programmeName, sessionName } = getSessionDisplayNames(s)
                const { statusLabel, cardPillClass, actionText, targetStage } = deriveSessionDisplayStatus(s)
                const dayNum = s.day_number || s.metadata?.day_number
                const formattedDate = formatCardDate(s.date_created)
                const humanDuration = formatHumanDuration(s.duration_seconds || s.audio_duration_seconds)

                return (
                  <tr
                    key={s.session_id}
                    className="sessions-table-row"
                    onClick={() => onOpenSession && onOpenSession(s.session_id, 'overview')}
                  >
                    <td className="td-session">
                      <span className="table-session-title">
                        {sessionName}
                        {dayNum && (
                          <span className="session-day-badge" title={`Day ${dayNum}`}>
                            {dayNum}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="td-programme">
                      <span className="table-programme-name">{programmeName}</span>
                    </td>
                    <td className="td-date">
                      <span className="table-meta-text">{formattedDate}</span>
                    </td>
                    <td className="td-duration">
                      <span className="table-meta-text">{humanDuration}</span>
                    </td>
                    <td className="td-status">
                      <span className={`session-card-pill ${cardPillClass}`}>
                        <span className="pill-dot">●</span>
                        <span className="pill-label">{statusLabel}</span>
                      </span>
                    </td>
                    <td className="td-actions text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="table-actions-cell">
                        <button
                          type="button"
                          className="btn btn--small btn--outline"
                          onClick={() => onOpenSession && onOpenSession(s.session_id, targetStage)}
                        >
                          {actionText}
                        </button>
                        {onDeleteSession && (
                          <button
                            type="button"
                            className="session-card-delete-icon-btn"
                            onClick={() => setSessionToDelete({ id: s.session_id, name: sessionName })}
                            title="Delete session record"
                            aria-label="Delete session"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ---------------- CLEAN CARD GRID VIEW ---------------- */
        <div className="sessions-cards-grid">
          {filteredSessions.map((s) => {
            const { sessionName } = getSessionDisplayNames(s)
            const {
              statusLabel,
              cardPillClass,
              actionText,
              targetStage,
            } = deriveSessionDisplayStatus(s)
            const dayNum = s.day_number || s.metadata?.day_number
            const formattedDate = formatCardDate(s.date_created)
            const humanDuration = formatHumanDuration(s.duration_seconds || s.audio_duration_seconds)

            return (
              <div
                key={s.session_id}
                className="refined-session-card"
                onClick={() => onOpenSession && onOpenSession(s.session_id, 'overview')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (onOpenSession) onOpenSession(s.session_id, 'overview')
                  }
                }}
              >
                {/* Top Row: Status Pill */}
                <div className="session-card-top-row">
                  <span className={`session-card-pill ${cardPillClass}`}>
                    <span className="pill-dot">●</span>
                    <span className="pill-label">{statusLabel}</span>
                  </span>
                </div>

                {/* Primary Dominant Session Title (Session-focused) */}
                <div className="session-card-title-stack">
                  <h2 className="session-card-dominant-title" title={sessionName}>
                    {sessionName}
                    {dayNum && (
                      <span className="session-day-badge" title={`Day ${dayNum}`}>
                        {dayNum}
                      </span>
                    )}
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
                      if (onOpenSession) onOpenSession(s.session_id, targetStage)
                    }}
                  >
                    {actionText}
                  </button>

                  {onDeleteSession && (
                    <button
                      type="button"
                      className="session-card-delete-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSessionToDelete({ id: s.session_id, name: sessionName })
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

      {/* Reusable Confirmation Modal for Session Deletion */}
      <ConfirmationModal
        isOpen={!!sessionToDelete}
        title="Delete session?"
        message={`Permanently delete "${sessionToDelete?.name || 'this session'}"?`}
        supportingText="This action cannot be undone."
        confirmLabel="Delete Session"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeletingSession}
        onCancel={() => setSessionToDelete(null)}
        onConfirm={async () => {
          if (!sessionToDelete) return
          setIsDeletingSession(true)
          try {
            await onDeleteSession(sessionToDelete.id)
            setSessionToDelete(null)
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

