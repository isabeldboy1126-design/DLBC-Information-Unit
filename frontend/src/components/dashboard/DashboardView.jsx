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

function UserIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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

function DotsMenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

/**
 * Calculates the total sum of actionable verification items and pending session actions
 * across all attention sessions, rather than merely counting the session records.
 */
export function calculateTotalAttentionItems(sessionsList) {
  if (!Array.isArray(sessionsList)) return 0
  return sessionsList.reduce((total, s) => {
    const isInterrupted = !!s.is_interrupted
    const isFinalComplete = s.final_report_status === 'complete'
    if (isFinalComplete) return total

    const isVerified = s.verification_status === 'completed' || !!s.verified_text || !!s.verified_at
    const needsVerification = !isVerified && (s.flag_count > 0 || s.verification_status === 'in_progress')
    const readyEditing = isVerified && s.reporting_status === 'reports_ready' && s.editing_status !== 'complete'
    const readyProofreading = s.editing_status === 'complete' && s.proofreading_status !== 'complete'

    if (!isInterrupted && !needsVerification && !readyEditing && !readyProofreading) {
      return total
    }

    if (needsVerification) {
      const count = Number(s.flag_count) || Number(s.verification_items_total) || 1
      return total + count
    }
    return total + 1
  }, 0)
}

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
  const allAttentionSessions = sessions.filter((s) => {
    const isInterrupted = !!s.is_interrupted
    const isFinalComplete = s.final_report_status === 'complete'
    if (isFinalComplete) return false

    const isVerified = s.verification_status === 'completed' || !!s.verified_text || !!s.verified_at
    const needsVerification = !isVerified && (s.flag_count > 0 || s.verification_status === 'in_progress')
    const readyEditing = isVerified && s.reporting_status === 'reports_ready' && s.editing_status !== 'complete'
    const readyProofreading = s.editing_status === 'complete' && s.proofreading_status !== 'complete'

    return isInterrupted || needsVerification || readyEditing || readyProofreading
  })

  const attentionSessions = allAttentionSessions.slice(0, 3)
  const totalAttentionCount = calculateTotalAttentionItems(allAttentionSessions)

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

  const getSpeakerName = (sess) => {
    if (sess.minister) return sess.minister
    try {
      if (sess.metadata_json) {
        const parsed = typeof sess.metadata_json === 'string' ? JSON.parse(sess.metadata_json) : sess.metadata_json
        if (parsed.minister) return parsed.minister
        if (parsed.preacher_name) return parsed.preacher_name
        if (parsed.speaker) return parsed.speaker
      }
    } catch {}
    return 'Pst. W.F. Kumuyi'
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
          {/* Card 1: Start Live Session (Dominant) */}
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

            {/* Right Action Circle Button & Integrated Microphone Image */}
            <div className="creation-card-visual">
              <div className="action-circle-btn action-circle-btn--primary" aria-hidden="true">
                <ArrowRightIcon />
              </div>
              <img
                src="/mic-illustration.png"
                alt=""
                className="creation-mic-illustration"
                loading="eager"
              />
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

        {/* Bottom Row: Upload Recording (Compact horizontal floating surface) */}
        <div
          className="creation-card creation-card--upload"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          role="button"
          tabIndex={0}
          id="hero-card-upload"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
        >
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

          <div className="upload-card-left">
            <div className="creation-card-icon-box creation-card-icon-box--ice-sm">
              <UploadTrayIcon />
            </div>

            <div className="upload-card-content">
              <h3 className="upload-card-title">Upload Recording</h3>
            </div>
          </div>

          <div className="creation-card-action-slot">
            <div className="action-circle-btn action-circle-btn--ice" aria-hidden="true">
              <ArrowRightIcon />
            </div>
          </div>
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

          {/* Each attention item is its OWN independent floating row */}
          <div className="attention-items-container">
            {attentionSessions.map((sess) => {
              const isInterrupted = !!sess.is_interrupted
              const isVerified = sess.verification_status === 'completed' || !!sess.verified_text || !!sess.verified_at
              const needsVerify = !isVerified && (sess.flag_count > 0 || sess.verification_status === 'in_progress')
              const readyEditing = isVerified && sess.reporting_status === 'reports_ready' && sess.editing_status !== 'complete'
              const readyProofreading = sess.editing_status === 'complete' && sess.proofreading_status !== 'complete'

              let stageLabel = `Verification · ${sess.flag_count || 1}`
              let stagePillClass = 'stage-pill--verification'
              let actionBtnText = 'Review'

              if (isInterrupted) {
                stageLabel = 'Interrupted'
                stagePillClass = 'stage-pill--interrupted'
                actionBtnText = 'Review'
              } else if (readyProofreading) {
                stageLabel = 'Proofreading'
                stagePillClass = 'stage-pill--proofreading'
                actionBtnText = 'Continue'
              } else if (readyEditing) {
                stageLabel = 'Editing'
                stagePillClass = 'stage-pill--editing'
                actionBtnText = 'Continue'
              }

              const { programme, sessionTitle } = getSessionHierarchy(sess)
              const sessionDate = formatAttentionDate(sess.date_created)

              return (
                <div
                  key={sess.session_id}
                  className="attention-floating-card"
                  onClick={() => onOpenSession(sess.session_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSession(sess.session_id); } }}
                >
                  <div className="attention-card-left">
                    <div className="attention-doc-box">
                      <DocumentItemIcon />
                    </div>
                    <div className="attention-info-stack">
                      {programme && <span className="attention-programme-label">{programme}</span>}
                      <h3 className="attention-session-title">{sessionTitle}</h3>
                      <div className="attention-meta-row">
                        {sessionDate && (
                          <span className="attention-meta-chip">
                            <CalendarIcon />
                            <span>{sessionDate}</span>
                          </span>
                        )}
                        <span className="attention-meta-chip">
                          <UserIcon />
                          <span>{getSpeakerName(sess)}</span>
                        </span>
                        {sess.duration_seconds > 0 && (
                          <span className="attention-meta-chip attention-meta-chip--duration">
                            <ClockIcon />
                            <span>{formatDuration(sess.duration_seconds)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="attention-card-right">
                    <span className={`attention-stage-pill ${stagePillClass}`}>
                      <span className="pill-dot">●</span>
                      <span className="pill-label">{stageLabel}</span>
                    </span>

                    <button
                      type="button"
                      className="attention-action-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenSession(sess.session_id)
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
                  const isFinalComplete = sess.final_report_status === 'complete'
                  const isProofreadComplete = sess.proofreading_status === 'complete'
                  const isEditingComplete = sess.editing_status === 'complete'
                  const isReportsReady = sess.reporting_status === 'reports_ready'
                  const isVerified = sess.verification_status === 'completed' || !!sess.verified_text || !!sess.verified_at
                  const needsVerification = !isVerified && (sess.flag_count > 0 || sess.verification_status === 'in_progress')

                  let statusText = 'IN PROGRESS'
                  let statusClass = 'status-pill--progress'

                  if (isInterrupted) {
                    statusText = 'INTERRUPTED'
                    statusClass = 'status-pill--interrupted'
                  } else if (isFinalComplete) {
                    statusText = 'COMPLETED'
                    statusClass = 'status-pill--completed'
                  } else if (isProofreadComplete) {
                    statusText = 'PROOFREAD'
                    statusClass = 'status-pill--completed'
                  } else if (isEditingComplete) {
                    statusText = 'EDITED'
                    statusClass = 'status-pill--completed'
                  } else if (isReportsReady) {
                    statusText = 'REPORTS READY'
                    statusClass = 'status-pill--verified'
                  } else if (isVerified) {
                    statusText = 'VERIFIED'
                    statusClass = 'status-pill--verified'
                  } else if (needsVerification) {
                    statusText = 'NEEDS VERIFICATION'
                    statusClass = 'status-pill--warning'
                  }

                  return (
                    <tr
                      key={sess.session_id}
                      className="recent-table-row"
                      onClick={() => onOpenSession(sess.session_id)}
                      title="Open session workspace"
                    >
                      <td className="cell-session-name">
                        <div className="session-name-flex">
                          <div className="table-doc-icon">
                            <DocumentItemIcon />
                          </div>
                          <span className="session-name-text">{sess.title || 'Untitled Session'}</span>
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
                              onOpenSession(sess.session_id)
                            }}
                          >
                            View <span aria-hidden="true">→</span>
                          </button>

                          <button
                            type="button"
                            className="table-dots-btn"
                            title="Session options"
                            aria-label="Session options"
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenSession(sess.session_id)
                            }}
                          >
                            <DotsMenuIcon />
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

              return (
                <div
                  key={sess.session_id}
                  className="recent-mobile-item"
                  onClick={() => onOpenSession(sess.session_id)}
                >
                  <div className="mobile-item-top">
                    <div className="mobile-item-title-flex">
                      <div className="table-doc-icon">
                        <DocumentItemIcon />
                      </div>
                      <span className="mobile-item-title">{sess.title || 'Untitled Session'}</span>
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
                        onOpenSession(sess.session_id)
                      }}
                    >
                      View <span aria-hidden="true">→</span>
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

