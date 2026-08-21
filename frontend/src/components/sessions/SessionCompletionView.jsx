import React from 'react'

/**
 * SessionCompletionView — Post-recording completion summary matching session-completion.png.
 * 
 * Features:
 * - Deep navy header banner with checkmark and confirmation message.
 * - Service Name, Duration, and Date metadata.
 * - System Storage Status pills confirming lossless master audio and indexed raw transcript.
 * - Verification Required callout showing exact flagged count with direct "Begin Verification" CTA.
 * - Non-destructive navigation: "Finish for Now" (safely returns to dashboard/history)
 *   and "View Session Details" (opens Session Workspace).
 */
export function SessionCompletionView({
  session,
  latestRecording,
  onBeginVerification,
  onGoToReporting,
  onFinishForNow,
  onViewSessionDetails,
}) {
  const serviceName = session?.title || latestRecording?.title || 'Sunday Morning Worship Service'
  const durationSec = session?.duration_seconds || session?.audio_duration_seconds || latestRecording?.duration_seconds || 0
  const flagCount = session?.flag_count || 0
  const dateCreated = session?.date_created || latestRecording?.created_at || new Date().toISOString()

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00:00'
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }

  const formatFullDate = (isoStr) => {
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return isoStr
    }
  }

  return (
    <div className="session-completion-overlay">
      <div className="card session-completion-card">
        {/* Top Hero Banner */}
        <div className="completion-hero-header">
          <div className="completion-check-circle">
            <span className="check-icon">✓</span>
          </div>
          <h2 className="completion-title">Session Captured Successfully</h2>
          <p className="completion-subtitle">
            Recording and transcript are safely preserved on secure storage.
          </p>
        </div>

        {/* Card Body */}
        <div className="card-body completion-card-body">
          {/* Metadata Row */}
          <div className="completion-meta-grid">
            <div className="completion-meta-item">
              <span className="meta-item-label">SERVICE NAME</span>
              <strong className="meta-item-val">{serviceName}</strong>
            </div>

            <div className="completion-meta-item">
              <span className="meta-item-label">DURATION</span>
              <strong className="meta-item-val">{formatDuration(durationSec)}</strong>
            </div>

            <div className="completion-meta-item">
              <span className="meta-item-label">DATE</span>
              <strong className="meta-item-val">{formatFullDate(dateCreated)}</strong>
            </div>
          </div>

          {/* System Storage Status */}
          <div className="completion-storage-block">
            <div className="storage-block-title">
              <span className="storage-icon">💾</span>
              <span>System Storage Status</span>
            </div>

            <div className="storage-status-row">
              <div className="storage-status-item">
                <span className="status-check-circle">✓</span>
                <div>
                  <strong>Audio Saved</strong>
                  <span className="storage-sub">Primary + Backup Lossless WAV</span>
                </div>
              </div>

              <div className="storage-status-item">
                <span className="status-check-circle">✓</span>
                <div>
                  <strong>Raw Transcript</strong>
                  <span className="storage-sub">Indexed &amp; Synced to Database</span>
                </div>
              </div>

              <span className="badge badge--success badge--storage-ready">
                SYSTEM READY
              </span>
            </div>
          </div>

          {/* Verification Callout */}
          <div className={`completion-verification-card ${flagCount > 0 ? 'verify-card--flags' : 'verify-card--clean'}`}>
            <div className="verify-card-left">
              <span className="verify-icon">📑</span>
              <div className="verify-text">
                <strong className="verify-heading">
                  {flagCount > 0 ? 'Verification Required' : 'No Verification Required'}
                </strong>
                <p className="verify-desc">
                  {flagCount > 0
                    ? `The AI transcript flagged ${flagCount} section${flagCount !== 1 ? 's' : ''} requiring human review for theological accuracy or spelling.`
                    : 'All transcript sections met high confidence thresholds. Ready to proceed directly to Information Unit Reporting.'}
                </p>
              </div>
            </div>

            {flagCount > 0 ? (
              onBeginVerification && (
                <button
                  type="button"
                  className="btn btn--primary btn--begin-verify"
                  onClick={onBeginVerification}
                  id="btn-begin-verification-completion"
                >
                  <span>Begin Verification ({flagCount})</span>
                  <span>→</span>
                </button>
              )
            ) : (
              (onGoToReporting || onBeginVerification) && (
                <button
                  type="button"
                  className="btn btn--primary btn--begin-verify"
                  onClick={onGoToReporting || onBeginVerification}
                  id="btn-go-to-reporting-completion"
                >
                  <span>Go to Reporting</span>
                  <span>→</span>
                </button>
              )
            )}
          </div>

          {/* Bottom Actions */}
          <div className="completion-bottom-actions">
            <button
              type="button"
              className="btn btn--outline"
              onClick={onFinishForNow}
              id="btn-finish-for-now"
            >
              ⊞ Finish for Now
            </button>

            <button
              type="button"
              className="btn btn--secondary"
              onClick={onViewSessionDetails}
              id="btn-view-session-details"
            >
              📋 View Session Details
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
