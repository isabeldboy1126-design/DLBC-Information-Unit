import React, { useRef } from 'react'
import { getSessionHierarchy } from '../sessions/SessionDetailView'

/* =========================================================================
   SVG Icons (Clean, crisp vectors matching reference design)
   ========================================================================= */

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function YouTubeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.582 6.186a2.806 2.806 0 0 0-1.974-1.99C17.868 3.75 12 3.75 12 3.75s-5.868 0-7.608.446a2.806 2.806 0 0 0-1.974 1.99C2 7.94 2 12 2 12s0 4.06.418 5.814a2.806 2.806 0 0 0 1.974 1.99c1.74.446 7.608.446 7.608.446s5.868 0 7.608-.446a2.806 2.806 0 0 0 1.974-1.99C22 16.06 22 12 22 12s0-4.06-.418-5.814ZM10 15.5v-7l6 3.5-6 3.5Z" />
    </svg>
  )
}

function UploadTrayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function DocumentItemIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function ClockHeaderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b1329" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

/**
 * Determines whether a session qualifies for operator attention.
 * A session counts once if it has any actionable incomplete state.
 */
export function isActionableAttentionSession(s) {
  if (!s) return false
  if (s.is_interrupted) return true
  if (s.final_report_status === 'complete' || s.report_processing_status === 'completed') return false

  const isVerified = s.verification_status === 'completed' || !!s.verified_text || !!s.verified_at
  const needsVerification = !isVerified && (s.flag_count > 0 || s.verification_status === 'in_progress')
  const needsProcessing = isVerified && s.final_report_status !== 'complete' && s.report_processing_status !== 'completed'

  return needsVerification || needsProcessing
}

/**
 * Calculates the total number of sessions that require attention (not the flag sum).
 */
export function calculateTotalAttentionSessions(sessionsList) {
  if (!Array.isArray(sessionsList)) return 0
  return sessionsList.filter(isActionableAttentionSession).length
}

// Retain alias for any existing imports
export const calculateTotalAttentionItems = calculateTotalAttentionSessions

/**
 * DashboardView — Polished production dashboard matching the authoritative reference.
 */
export function DashboardView({
  sessions = [],
  onStartLiveSession,
  onStartYouTubeSession,
  onOpenSession,
  onViewAllSessions,
  onViewNeedsVerification,
  onFileSelect,
}) {
  const fileInputRef = useRef(null)

  // Filter sessions needing immediate operator action:
  // 1. Interrupted sessions requiring intervention
  // 2. Unverified sessions with flagged items or in-progress review
  // 3. Reports ready, pending editorial synthesis
  // 4. Editing complete, pending proofreading review
  const allAttentionSessions = sessions.filter(isActionableAttentionSession)
  const attentionSessions = allAttentionSessions.slice(0, 3)
  const totalAttentionCount = allAttentionSessions.length

  // Recent 6 sessions
  const recentSessions = [...sessions].sort((a, b) => {
    return new Date(b.date_created || 0) - new Date(a.date_created || 0)
  }).slice(0, 6)

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00:00'
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }

  const formatAttentionDuration = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return ''
    const secs = Math.round(totalSeconds)
    const hours = Math.floor(secs / 3600)
    const mins = Math.floor((secs % 3600) / 60)
    const remSecs = secs % 60
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }
    if (mins > 0) {
      return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`
    }
    return `${remSecs}s`
  }

  const formatAttentionDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return isoStr
    }
  }

  const formatRecentDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      const month = d.toLocaleDateString('en-US', { month: 'short' })
      const day = d.getDate()
      const year = d.getFullYear()
      const hours = String(d.getHours()).padStart(2, '0')
      const mins = String(d.getMinutes()).padStart(2, '0')
      return `${month} ${day}, ${year} ${hours}:${mins}`
    } catch {
      return isoStr
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0] && onFileSelect) {
      onFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  return (
    <div className="dashboard-view-container">
      {/* ------------------------------------------------------------- */}
      {/* 1. SESSION CREATION AREA (Order: Start Live, YouTube, Upload)   */}
      {/* ------------------------------------------------------------- */}
      <section className="dashboard-creation-area" aria-label="Session Creation Actions">
        {/* Top Row: Start Live Session (dominant) & YouTube Session */}
        <div className="creation-cards-grid">
          {/* Card 1: Start Live Session (Dominant Hero Card) */}
          <div
            className="creation-card creation-card--live"
            onClick={onStartLiveSession}
            role="button"
            tabIndex={0}
            id="hero-card-start-live"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartLiveSession(); } }}
          >
            <div className="creation-card-body">
              <div className="creation-card-icon-box creation-card-icon-box--gradient">
                <MicIcon />
              </div>

              <div className="creation-card-text">
                <h2 className="creation-card-title">Start Live Session</h2>
                <p className="creation-card-desc">
                  Record and transcribe live audio via microphone or USB input.
                </p>
              </div>

              <div className="creation-card-status">
                <span className="creation-status-dot" />
                <span className="creation-status-label">Mic / USB Ready</span>
              </div>
            </div>

            <div className="creation-card-action-slot">
              <div className="action-circle-btn action-circle-btn--primary" aria-hidden="true">
                <ArrowRightIcon />
              </div>
            </div>
          </div>

          {/* Card 2: YouTube Session (Secondary) */}
          <div
            className="creation-card creation-card--youtube"
            onClick={onStartYouTubeSession}
            role="button"
            tabIndex={0}
            id="hero-card-youtube"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartYouTubeSession(); } }}
          >
            <div className="creation-card-body">
              <div className="creation-card-icon-box creation-card-icon-box--ice-blue">
                <YouTubeIcon />
              </div>

              <div className="creation-card-text">
                <h2 className="creation-card-title">YouTube Session</h2>
                <p className="creation-card-desc">
                  Paste the URL of a YouTube live broadcast or recorded sermon message to transcribe.
                </p>
              </div>
            </div>

            <div className="creation-card-action-slot">
              <div className="action-circle-btn action-circle-btn--ice" aria-hidden="true">
                <ArrowRightIcon />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Simple Upload Recording Text Link */}
        <div className="dashboard-upload-link-row">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="audio/*,video/*,.wav,.mp3,.mp4,.m4a"
            onChange={(e) => {
              if (e.target.files && e.target.files[0] && onFileSelect) {
                onFileSelect(e.target.files[0])
              }
            }}
          />
          <button
            type="button"
            className="dashboard-upload-text-link"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            id="hero-link-upload"
          >
            Upload recording →
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 2. NEEDS YOUR ATTENTION SECTION (ALWAYS BELOW UPLOAD)         */}
      {/* ------------------------------------------------------------- */}
      {allAttentionSessions.length > 0 && (
        <section className="dashboard-section dashboard-attention-section" aria-label="Actionable Sessions">
          <div className="dashboard-section-header">
            <div className="section-title-wrapper">
              <h2 className="dashboard-section-title">Needs Your Attention</h2>
              <span className="attention-counter-badge">{totalAttentionCount}</span>
            </div>

            <button
              type="button"
              className="dashboard-view-all-btn"
              onClick={onViewNeedsVerification || onViewAllSessions}
              id="btn-attention-view-more"
            >
              View all <span aria-hidden="true">→</span>
            </button>
          </div>

          {/* ONE premium floating parent surface for all attention sessions */}
          <div className="attention-parent-surface">
            {attentionSessions.map((sess) => {
              const isInterrupted = !!sess.is_interrupted
              const isVerified = sess.verification_status === 'completed' || !!sess.verified_text || !!sess.verified_at
              const needsVerify = !isVerified && (sess.flag_count > 0 || sess.verification_status === 'in_progress')
              const needsProcessing = isVerified && sess.final_report_status !== 'complete' && sess.report_processing_status !== 'completed'

              let stageLabel = `${sess.flag_count || 1} to verify`
              let stagePillClass = 'stage-pill--verification'
              let actionBtnText = 'Review'
              let targetStage = 'verification'

              if (isInterrupted) {
                stageLabel = 'Interrupted'
                stagePillClass = 'stage-pill--interrupted'
                actionBtnText = 'Review'
                targetStage = 'overview'
              } else if (needsProcessing) {
                stageLabel = null
                stagePillClass = ''
                actionBtnText = 'Process with AI →'
                targetStage = 'report_processing'
              }

              const { sessionTitle } = getSessionHierarchy(sess)
              const sessionDate = formatAttentionDate(sess.date_created)
              const sessionDuration = formatAttentionDuration(sess.duration_seconds || sess.audio_duration_seconds)

              return (
                <div
                  key={sess.session_id}
                  className="attention-list-row"
                  onClick={() => onOpenSession(sess.session_id, 'overview')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenSession(sess.session_id, 'overview')
                    }
                  }}
                >
                  <div className="attention-row-left">
                    <div className="attention-doc-box">
                      <DocumentItemIcon />
                    </div>
                    <div className="attention-info-stack">
                      <h3 className="attention-session-title">{sessionTitle}</h3>
                      <div className="attention-meta-row">
                        {sessionDate && (
                          <span className="attention-meta-chip">
                            <span>{sessionDate}</span>
                          </span>
                        )}
                        {sessionDuration && (
                          <>
                            <span className="attention-meta-separator" aria-hidden="true">·</span>
                            <span className="attention-meta-chip attention-meta-chip--duration">
                              <span>{sessionDuration}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="attention-row-right">
                    {stageLabel && (
                      <span className={`attention-stage-pill ${stagePillClass}`}>
                        <span className="pill-dot">●</span>
                        <span className="pill-label">{stageLabel}</span>
                      </span>
                    )}

                    <button
                      type="button"
                      className="attention-action-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenSession(sess.session_id, targetStage)
                      }}
                    >
                      {actionBtnText}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. RECENT SESSIONS TABLE & COMPACT MOBILE LIST                */}
      {/* ------------------------------------------------------------- */}
      <section className="dashboard-section dashboard-recent-section" aria-label="Recent Sessions">
        <div className="dashboard-section-header">
          <div className="section-title-wrapper">
            <span className="recent-clock-badge"><ClockHeaderIcon /></span>
            <h2 className="dashboard-section-title">Recent Sessions</h2>
          </div>

          <button
            type="button"
            className="dashboard-view-all-btn"
            onClick={onViewAllSessions}
            id="btn-view-all-sessions"
          >
            View all <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="recent-sessions-card-surface">
          {/* Desktop Table */}
          <table className="recent-sessions-data-table">
            <thead>
              <tr>
                <th scope="col">SESSION</th>
                <th scope="col">DATE</th>
                <th scope="col">DURATION</th>
                <th scope="col">STATUS</th>
                <th scope="col">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-sessions-cell">
                    No recorded sessions found. Click <strong>Start Live Session</strong> above to begin your first service recording.
                  </td>
                </tr>
              ) : (
                  recentSessions.map((sess) => {
                  const isInterrupted = !!sess.is_interrupted
                  const isFinalComplete = sess.final_report_status === 'complete' || sess.report_processing_status === 'completed'
                  const isVerified = sess.verification_status === 'completed' || !!sess.verified_text || !!sess.verified_at
                  const needsVerification = !isVerified && (sess.flag_count > 0 || sess.verification_status === 'in_progress')

                  const { programme: progName, sessionTitle: sessName } = getSessionHierarchy(sess)

                  let statusText = 'IN PROGRESS'
                  let statusClass = 'status-pill--progress'

                  if (isInterrupted) {
                    statusText = 'INTERRUPTED'
                    statusClass = 'status-pill--interrupted'
                  } else if (isFinalComplete) {
                    statusText = 'COMPLETED'
                    statusClass = 'status-pill--completed'
                  } else if (isVerified) {
                    statusText = 'VERIFIED'
                    statusClass = 'status-pill--verified'
                  } else if (needsVerification) {
                    statusText = 'NEEDS VERIFICATION'
                    statusClass = 'status-pill--warning'
                  }

                  let actionBtnText = 'View →'
                  let targetStage = 'overview'

                  if (isInterrupted) {
                    actionBtnText = 'Review →'
                    targetStage = 'overview'
                  } else if (needsVerification) {
                    actionBtnText = 'Review →'
                    targetStage = 'verification'
                  } else if (isFinalComplete) {
                    actionBtnText = 'View Report →'
                    targetStage = 'final_report'
                  } else if (isVerified) {
                    actionBtnText = 'Process with AI →'
                    targetStage = 'report_processing'
                  }

                  return (
                    <tr
                      key={sess.session_id}
                      className="recent-table-row"
                      onClick={() => onOpenSession(sess.session_id, 'overview')}
                      title="Open session workspace"
                    >
                      <td className="cell-session-name">
                        <div className="session-name-flex">
                          <div className="table-doc-icon">
                            <DocumentItemIcon />
                          </div>
                          <div className="session-hierarchy-stack">
                            {progName && (
                              <span className="session-event-eyebrow">{progName}</span>
                            )}
                            <span className="session-dominant-name">
                              {sessName || sess.title || 'Untitled Session'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="cell-session-date">
                        {formatRecentDate(sess.date_created)}
                      </td>

                      <td className="cell-session-duration">
                        {formatDuration(sess.duration_seconds || sess.audio_duration_seconds)}
                      </td>

                      <td className="cell-session-status">
                        <span className={`recent-status-pill ${statusClass}`}>
                          <span className="status-dot">●</span>
                          <span className="status-label">{statusText}</span>
                        </span>
                      </td>

                      <td className="cell-session-actions">
                        <div className="table-actions-cluster">
                          <button
                            type="button"
                            className="table-view-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenSession(sess.session_id, targetStage)
                            }}
                          >
                            {actionBtnText}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {/* Mobile Clean Compact Cards (Displayed only under 768px to prevent horizontal blowout) */}
          <div className="recent-sessions-mobile-list" aria-hidden="true">
            {recentSessions.map((sess) => {
              const isInterrupted = !!sess.is_interrupted
              const isFinalComplete = sess.final_report_status === 'complete'
              const isVerified = sess.verification_status === 'completed' || !!sess.verified_text || !!sess.verified_at
              const needsVerification = !isVerified && (sess.flag_count > 0 || sess.verification_status === 'in_progress')

              const { programme: progName, sessionTitle: sessName } = getSessionHierarchy(sess)

              let statusText = 'IN PROGRESS'
              let statusClass = 'status-pill--progress'

              if (isInterrupted) {
                statusText = 'INTERRUPTED'
                statusClass = 'status-pill--interrupted'
              } else if (isFinalComplete) {
                statusText = 'COMPLETED'
                statusClass = 'status-pill--completed'
              } else if (isVerified) {
                statusText = 'VERIFIED'
                statusClass = 'status-pill--verified'
              } else if (needsVerification) {
                statusText = 'NEEDS VERIFICATION'
                statusClass = 'status-pill--warning'
              }

              let mobileActionBtnText = 'View →'
              let mobileTargetStage = 'overview'

              if (isInterrupted) {
                mobileActionBtnText = 'Review →'
                mobileTargetStage = 'overview'
              } else if (needsVerification) {
                mobileActionBtnText = 'Review →'
                mobileTargetStage = 'verification'
              } else if (isFinalComplete) {
                mobileActionBtnText = 'View Report →'
                mobileTargetStage = 'final_report'
              }

              return (
                <div
                  key={sess.session_id}
                  className="recent-mobile-item"
                  onClick={() => onOpenSession(sess.session_id, 'overview')}
                >
                  <div className="mobile-item-top">
                    <div className="mobile-item-title-flex">
                      <div className="table-doc-icon">
                        <DocumentItemIcon />
                      </div>
                      <div className="session-hierarchy-stack">
                        {progName && (
                          <span className="session-event-eyebrow">{progName}</span>
                        )}
                        <span className="session-dominant-name">
                          {sessName || sess.title || 'Untitled Session'}
                        </span>
                      </div>
                    </div>

                    <span className={`recent-status-pill ${statusClass}`}>
                      <span className="status-dot">●</span>
                      <span className="status-label">{statusText}</span>
                    </span>
                  </div>

                  <div className="mobile-item-bottom">
                    <div className="mobile-item-meta">
                      <span>{formatRecentDate(sess.date_created)}</span>
                      <span>•</span>
                      <span>{formatDuration(sess.duration_seconds || sess.audio_duration_seconds)}</span>
                    </div>

                    <button
                      type="button"
                      className="table-view-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenSession(sess.session_id, mobileTargetStage)
                      }}
                    >
                      {mobileActionBtnText}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

