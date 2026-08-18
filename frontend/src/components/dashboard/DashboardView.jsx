import React, { useRef } from 'react'

/**
 * DashboardView — Main entry screen matching home-dashboard.png.
 * 
 * Features:
 * - Start Live Session Hero Card (Deep blue)
 * - Transcribe Recording Hero Card (Dropzone for audio/video files)
 * - "Needs Your Attention" active session review cards
 * - Recent Sessions summary table with status badges and direct session workspace links
 */
export function DashboardView({
  sessions = [],
  onStartLiveSession,
  onOpenSession,
  onViewAllSessions,
  onFileSelect,
}) {
  const fileInputRef = useRef(null)

  // Filter sessions needing immediate attention (interrupted or verification incomplete)
  const attentionSessions = sessions.filter((s) => {
    const isInterrupted = !!s.is_interrupted
    const isVerified = s.verification_status === 'completed' || !!s.verified_text || !!s.verified_at
    const needsVerification = !isVerified && (s.flag_count > 0 || s.verification_status === 'in_progress') && s.reporting_status === 'not_started' && s.editing_status === 'not_started' && s.proofreading_status === 'not_started' && s.final_report_status !== 'complete'
    return isInterrupted || needsVerification
  }).slice(0, 2)

  // Recent 5 sessions
  const recentSessions = [...sessions].sort((a, b) => {
    return new Date(b.date_created || 0) - new Date(a.date_created || 0)
  }).slice(0, 5)

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
      return d.toISOString().replace('T', ' ').slice(0, 16)
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
      {/* 1. TOP HERO ACTION CARDS                                      */}
      {/* ------------------------------------------------------------- */}
      <div className="dashboard-hero-grid">
        {/* Hero Card 1: Start Live Session */}
        <div
          className="dashboard-hero-card hero-card--live"
          onClick={onStartLiveSession}
          role="button"
          tabIndex={0}
          id="hero-card-start-live"
        >
          <div className="hero-card-header">
            <div className="hero-card-icon-box">
              <span className="hero-icon">🎙️</span>
            </div>
            <div className="hero-card-title-group">
              <h2 className="hero-card-title">Start Live Session</h2>
              <span className="hero-arrow">→</span>
            </div>
          </div>

          <p className="hero-card-desc">
            Record a live church service and transcribe it while it happens.
          </p>

          <div className="hero-card-footer">
            <span className="hero-status-dot">●</span>
            <span className="hero-status-text">Ready to record</span>
          </div>
        </div>

        {/* Hero Card 2: Transcribe Recording */}
        <div
          className="dashboard-hero-card hero-card--upload"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          id="hero-card-upload"
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

          <div className="hero-card-header">
            <div className="hero-card-icon-box hero-card-icon-box--light">
              <span className="hero-icon">📁</span>
            </div>
            <div className="hero-card-title-group">
              <h2 className="hero-card-title hero-card-title--dark">Transcribe Recording</h2>
              <span className="hero-arrow hero-arrow--dark">→</span>
            </div>
          </div>

          <p className="hero-card-desc hero-card-desc--dark">
            Use an existing audio or video recording to create a transcript and Session.
          </p>

          <div className="hero-dropzone-box">
            <div className="dropzone-cloud-icon">☁️</div>
            <div className="dropzone-title">Drag &amp; drop files here</div>
            <div className="dropzone-subtitle">Supported: WAV, MP3, MP4 (Max 5GB)</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. NEEDS YOUR ATTENTION SECTION                               */}
      {/* ------------------------------------------------------------- */}
      {attentionSessions.length > 0 && (
        <section className="dashboard-section">
          <div className="section-header-title">
            <span className="section-alert-icon">⚠️</span>
            <h3>Needs Your Attention</h3>
          </div>

          <div className="attention-cards-grid">
            {attentionSessions.map((sess) => {
              const needsVerify = sess.flag_count > 0 && (!sess.verification_status || sess.verification_status === 'in_progress')
              const readyEditing = sess.reporting_status === 'reports_ready' && sess.editing_status !== 'complete'
              const isInterrupted = sess.is_interrupted

              return (
                <div
                  key={sess.session_id}
                  className={`attention-card ${
                    needsVerify
                      ? 'attention-card--verify'
                      : readyEditing
                      ? 'attention-card--editing'
                      : 'attention-card--warning'
                  }`}
                >
                  <div className="attention-card-top">
                    <div className="attention-card-title-area">
                      <h4 className="attention-session-title">{sess.title || 'Untitled Session'}</h4>
                      <p className="attention-session-sub">
                        {isInterrupted
                          ? 'Interrupted during recording — review recovery'
                          : needsVerify
                          ? `${sess.flag_count} section${sess.flag_count !== 1 ? 's' : ''} need verification`
                          : 'Verification complete — ready for editing'}
                      </p>
                    </div>

                    <span
                      className={`badge ${
                        needsVerify ? 'badge--warning' : readyEditing ? 'badge--info' : 'badge--danger'
                      }`}
                    >
                      {needsVerify
                        ? '⚠ VERIFICATION'
                        : readyEditing
                        ? '📄 EDITING'
                        : '⚠ INTERRUPTED'}
                    </span>
                  </div>

                  <div className="attention-card-footer">
                    <div className="attention-status-info">
                      {needsVerify ? (
                        <>
                          <span className="dot-red">●</span>
                          <span>{sess.flag_count} sections flagged</span>
                        </>
                      ) : (
                        <>
                          <span className="icon-clock">🕒</span>
                          <span>Ready for compilation</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn btn--primary btn--small attention-action-btn"
                      onClick={() => onOpenSession(sess.session_id)}
                    >
                      {needsVerify ? 'Review Sections ›' : readyEditing ? 'Continue to Editing ›' : 'Review Log ›'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. RECENT SESSIONS TABLE                                      */}
      {/* ------------------------------------------------------------- */}
      <section className="dashboard-section">
        <div className="section-header-flex">
          <div className="section-header-title">
            <span className="section-clock-icon">🕒</span>
            <h3>Recent Sessions</h3>
          </div>

          <button
            type="button"
            className="view-all-link-btn"
            onClick={onViewAllSessions}
            id="btn-view-all-sessions"
          >
            View All Sessions →
          </button>
        </div>

        <div className="card recent-sessions-card">
          <table className="recent-sessions-table">
            <thead>
              <tr>
                <th>SESSION IDENTIFIER</th>
                <th>LOG DATE</th>
                <th>DURATION</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-sessions-td">
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

                  let statusBadge = <span className="status-pill status-pill--info">● IN PROGRESS</span>
                  if (isInterrupted) {
                    statusBadge = <span className="status-pill status-pill--interrupted">● INTERRUPTED</span>
                  } else if (isFinalComplete) {
                    statusBadge = <span className="status-pill status-pill--completed">● COMPLETE</span>
                  } else if (isProofreadComplete) {
                    statusBadge = <span className="status-pill status-pill--proofread">● PROOFREADING COMPLETE</span>
                  } else if (isEditingComplete) {
                    statusBadge = <span className="status-pill status-pill--edited">● EDITING COMPLETE</span>
                  } else if (isReportsReady) {
                    statusBadge = <span className="status-pill status-pill--reported">● REPORTS READY</span>
                  } else if (isVerified) {
                    statusBadge = <span className="status-pill status-pill--verified">● VERIFIED</span>
                  } else if (needsVerification) {
                    statusBadge = <span className="status-pill status-pill--warning">● NEEDS VERIFICATION</span>
                  }

                  return (
                    <tr
                      key={sess.session_id}
                      className="recent-session-row"
                      onClick={() => onOpenSession(sess.session_id)}
                      title="Open session workspace"
                    >
                      <td className="cell-title">
                        <strong>{sess.title || 'Untitled Session'}</strong>
                      </td>
                      <td className="cell-date">{formatDate(sess.date_created)}</td>
                      <td className="cell-duration">
                        {formatDuration(sess.duration_seconds || sess.audio_duration_seconds)}
                      </td>
                      <td className="cell-status">{statusBadge}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
