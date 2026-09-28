import React, { useState, useEffect } from 'react'
import { getApiUrl } from '../../config'

/**
 * SessionCompletionView — Post-recording completion and autonomous verification view.
 * 
 * Supports Stage 6 Checkpoint H:
 * 1. Compiling screen:
 *    - Step 1: Recording saved ✓
 *    - Step 2: Finalizing transcript ● / ✓
 *    - Step 3: Preparing verification ● / ○
 *    - Two small horizontal progress bars
 * 2. Verifying screen:
 *    - Truthful progress count and cross-referencing status
 * 3. Result screens:
 *    - Needs Review (verified/corrected breakdown + CTA to review remaining)
 *    - Success / 0 to review (all verified + direct CTA to reporting)
 *    - AI Unavailable (graceful fallback + CTA for manual review)
 */
export function SessionCompletionView({
  session,
  latestRecording,
  onBeginVerification,
  onGoToReporting,
  onFinishForNow,
  onViewSessionDetails,
  onRetryVerification,
  skipCompiling = false,
}) {
  const sessionId = session?.session_id || latestRecording?.session_id
  const serviceName = session?.title || latestRecording?.title || 'Sunday Morning Worship Service'
  const durationSec = session?.duration_seconds || session?.audio_duration_seconds || latestRecording?.duration_seconds || 0
  const dateCreated = session?.date_created || latestRecording?.created_at || new Date().toISOString()
  const rawFlagCount = session?.flag_count || 0

  const [aiStatus, setAiStatus] = useState(skipCompiling ? 'verifying' : (session?.ai_verification_status || 'compiling'))
  const [summary, setSummary] = useState(session?.ai_verification_summary || null)
  const [itemsTotal, setItemsTotal] = useState(session?.verification_items_total || rawFlagCount)
  const [itemsPending, setItemsPending] = useState(rawFlagCount)
  const [itemsResolved, setItemsResolved] = useState(session?.verification_items_resolved || 0)
  const [compilingStep, setCompilingStep] = useState(skipCompiling ? 2 : 1)

  // Poll verification status while compiling or verifying
  useEffect(() => {
    if (!sessionId) return
    let isMounted = true
    let pollInterval = null

    const stepTimer = setTimeout(() => {
      if (isMounted) setCompilingStep(2)
    }, 2000)

    const checkStatus = async () => {
      try {
        const res = await fetch(getApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/verification/ai-status`))
        if (!res.ok) return
        const data = await res.json()
        if (isMounted && data) {
          const status = data.ai_verification_status || 'idle'
          setAiStatus(status)
          if (data.summary && Object.keys(data.summary).length > 0) {
            setSummary(data.summary)
          }
          if (data.items_total !== undefined) setItemsTotal(data.items_total)
          if (data.items_pending !== undefined) setItemsPending(data.items_pending)
          if (data.items_resolved !== undefined) setItemsResolved(data.items_resolved)

          if (['completed_verified', 'completed_needs_review', 'ai_unavailable', 'failed'].includes(status)) {
            if (pollInterval) clearInterval(pollInterval)
          }
        }
      } catch (err) {
        console.error('Error fetching AI verification status:', err)
      }
    }

    checkStatus()
    pollInterval = setInterval(checkStatus, 1500)

    return () => {
      isMounted = false
      clearTimeout(stepTimer)
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [sessionId])

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

  const isCompiling = !skipCompiling && aiStatus === 'compiling'
  const isVerifying =
    (skipCompiling && (aiStatus === 'compiling' || aiStatus === 'verifying')) ||
    (!skipCompiling && aiStatus === 'verifying')
  const isVerifiedSuccess =
    aiStatus === 'completed_verified' || (aiStatus === 'idle' && itemsPending === 0 && rawFlagCount === 0)
  const isNeedsReview =
    aiStatus === 'completed_needs_review' || (aiStatus === 'idle' && itemsPending > 0)
  const isAiUnavailable = aiStatus === 'ai_unavailable' || aiStatus === 'failed'

  const remainingToReview = summary?.unresolved_count !== undefined ? summary.unresolved_count : itemsPending
  const verifiedCount = summary?.verified_count !== undefined ? summary.verified_count : (itemsTotal - remainingToReview)
  const resolvedCount = itemsResolved !== undefined && itemsResolved > 0 ? itemsResolved : (itemsTotal - itemsPending)

  return (
    <div className="session-completion-overlay">
      <div className="card session-completion-card">
        {/* Top Hero Banner */}
        <div className={`completion-hero-header ${isCompiling || isVerifying ? 'completion-hero-header--processing' : ''}`}>
          <div className="completion-check-circle">
            {isCompiling ? (
              <span className="processing-spinner" aria-hidden="true" />
            ) : isVerifying ? (
              <span className="check-icon sparkle-pulse" aria-hidden="true">✦</span>
            ) : isAiUnavailable ? (
              <span className="check-icon" aria-hidden="true">ℹ</span>
            ) : (
              <span className="check-icon" aria-hidden="true">✓</span>
            )}
          </div>
          <h2 className="completion-title">
            {isCompiling
              ? 'Finalizing Transcript & Preparing Verification'
              : isVerifying
              ? 'Verifying Transcript'
              : isVerifiedSuccess
              ? 'Verification complete'
              : isAiUnavailable
              ? 'Verification unavailable'
              : 'Verification complete'}
          </h2>
          <p className="completion-subtitle">
            {isCompiling
              ? 'Recording is safely preserved. Indexing speech text and preparing verification.'
              : isVerifying
              ? (itemsTotal > 0
                  ? `${resolvedCount} of ${itemsTotal} sections checked`
                  : 'Checking sermon transcript accuracy...')
              : isVerifiedSuccess
              ? `${itemsTotal} verified • 0 need review`
              : isAiUnavailable
              ? 'Your recording and transcript are safe. Automated verification could not be completed right now.'
              : `${verifiedCount} verified • ${remainingToReview} need review`}
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
          {!skipCompiling && (
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
          )}

          {/* 1. Compiling Screen Component */}
          {isCompiling && (
            <div className="completion-processing-box compiling-box">
              <div className="processing-header">
                <span className="processing-tag">STAGE 1: COMPILING</span>
                <span className="processing-subtext">Preparing audio and sermon context</span>
              </div>

              <div className="compiling-steps-row">
                <div className="compiling-step-item compiling-step-item--done">
                  <span className="step-icon">✓</span>
                  <span className="step-label">Recording saved</span>
                </div>
                <div className={`compiling-step-item ${compilingStep >= 1 ? 'compiling-step-item--active' : ''}`}>
                  <span className="step-icon">{compilingStep > 1 ? '✓' : '●'}</span>
                  <span className="step-label">Finalizing transcript</span>
                </div>
                <div className={`compiling-step-item ${compilingStep >= 2 ? 'compiling-step-item--active' : ''}`}>
                  <span className="step-icon">{compilingStep >= 2 ? '●' : '○'}</span>
                  <span className="step-label">Preparing verification</span>
                </div>
              </div>

              {/* Two small horizontal bars */}
              <div className="compiling-bars-container">
                <div className="compiling-bar compiling-bar--1" />
                <div className={`compiling-bar compiling-bar--2 ${compilingStep >= 2 ? 'compiling-bar--active' : ''}`} />
              </div>
            </div>
          )}

          {/* 2. Verifying Screen Component */}
          {isVerifying && (
            <div className="completion-processing-box verifying-box">
              <div className="processing-header">
                <span className="processing-tag">VERIFYING</span>
                <span className="processing-subtext">Checking transcript sections</span>
              </div>

              <div className="verifying-content-row">
                <div className="verifying-sparkle-indicator">
                  <span className="sparkle-pulse">✦</span>
                </div>
                <div className="verifying-details">
                  <strong className="verifying-title">
                    Verifying Transcript
                  </strong>
                  <p className="verifying-desc">
                    {itemsTotal > 0
                      ? `${resolvedCount} of ${itemsTotal} sections checked`
                      : 'Checking sermon transcript accuracy...'}
                  </p>
                </div>
              </div>

              <div className="verifying-progress-track">
                <div
                  className="verifying-progress-fill"
                  style={{
                    width: `${itemsTotal > 0 ? Math.max(8, Math.min(100, Math.round((resolvedCount / itemsTotal) * 100))) : 35}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* 3. Result Screen: Success / 0 to Review */}
          {!isCompiling && !isVerifying && isVerifiedSuccess && (
            <div className="completion-verification-card verify-card--clean">
              <div className="verify-card-left">
                <span className="verify-icon">✓</span>
                <div className="verify-text">
                  <strong className="verify-heading">Verification complete</strong>
                  <div className="completion-stats-chips">
                    <span className="stat-chip stat-chip--verified">
                      ✓ {itemsTotal} verified
                    </span>
                    <span className="stat-chip stat-chip--pending">
                      ● 0 need review
                    </span>
                  </div>
                  <p className="verify-desc">
                    All transcript sections have been verified. Ready to proceed to Reporting.
                  </p>
                </div>
              </div>

              {(onGoToReporting || onBeginVerification) && (
                <button
                  type="button"
                  className="btn btn--primary btn--begin-verify"
                  onClick={onGoToReporting || onBeginVerification}
                  id="btn-go-to-reporting-completion"
                >
                  <span>Continue to Reporting</span>
                  <span>→</span>
                </button>
              )}
            </div>
          )}

          {/* 3. Result Screen: Needs Review */}
          {!isCompiling && !isVerifying && isNeedsReview && !isAiUnavailable && (
            <div className="completion-verification-card verify-card--flags">
              <div className="verify-card-left">
                <span className="verify-icon">📑</span>
                <div className="verify-text">
                  <strong className="verify-heading">
                    Verification complete
                  </strong>
                  <div className="completion-stats-chips">
                    <span className="stat-chip stat-chip--verified">
                      ✓ {verifiedCount} verified
                    </span>
                    {summary?.corrected_count !== undefined && summary.corrected_count > 0 && (
                      <span className="stat-chip stat-chip--corrected">
                        ✎ {summary.corrected_count} corrected
                      </span>
                    )}
                    <span className="stat-chip stat-chip--pending">
                      ● {remainingToReview} need review
                    </span>
                  </div>
                  <p className="verify-desc">
                    Review and confirm preacher wording, names, and scriptures.
                  </p>
                </div>
              </div>

              {onBeginVerification && (
                <button
                  type="button"
                  className="btn btn--primary btn--begin-verify"
                  onClick={onBeginVerification}
                  id="btn-begin-verification-completion"
                >
                  <span>Review {remainingToReview} Section{remainingToReview !== 1 ? 's' : ''}</span>
                  <span>→</span>
                </button>
              )}
            </div>
          )}

          {/* 3. Result Screen: AI Unavailable */}
          {!isCompiling && !isVerifying && isAiUnavailable && (
            <div className="completion-verification-card verify-card--unavailable">
              <div className="verify-card-left">
                <span className="verify-icon">⚠️</span>
                <div className="verify-text">
                  <strong className="verify-heading">Verification unavailable</strong>
                  <p className="verify-desc">
                    Your recording and transcript are safe. Automated verification could not be completed right now.
                  </p>
                </div>
              </div>

              <div className="unavailable-actions-row" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {onRetryVerification && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--retry-verify"
                    onClick={() => {
                      setAiStatus('verifying')
                      onRetryVerification()
                    }}
                    id="btn-retry-verification-completion"
                  >
                    <span>↻ Try Again</span>
                  </button>
                )}
                {onBeginVerification && (
                  <button
                    type="button"
                    className="btn btn--primary btn--begin-verify"
                    onClick={onBeginVerification}
                    id="btn-manual-verify-completion"
                  >
                    <span>Review Manually</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            </div>
          )}

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

