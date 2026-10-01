import React, { useState, useEffect } from 'react'
import { getApiUrl, authFetch } from '../../config'
import { minimizeActiveProcess } from '../common/activeProcessManager'

/**
 * SessionCompletionView — Contained floating processing panel matching
 * approved design references (media_1790599569372.png & media_1790599569328.png).
 *
 * Visual hierarchy:
 * 1. Ambient Background: Serene pale-blue curves/gradients.
 * 2. Top-Left Context: Session title (e.g. Sunday Worship) and Date · Duration (e.g. Aug 23, 2026 · 25m 41s).
 * 3. Contained Floating Card: Compact elevated white panel (max-width: 530px).
 *    - Compiling / Verifying state: Circular gradient ring spinner, title, progress text,
 *      horizontal progress bar, 4-step vertical timeline.
 *    - Verification Complete state: Mint/green check badge, title, 2-column stats box,
 *      full-width blue continue button.
 *    - Unavailable state: Soft amber badge, safe message, Try Again + Review Manually buttons.
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
  const durationSec = session?.duration_seconds ?? session?.audio_duration_seconds ?? latestRecording?.duration_seconds ?? null
  const dateCreated = session?.date_created || latestRecording?.created_at || null
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



    const checkStatus = async () => {
      try {
        const res = await authFetch(getApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/verification/ai-status`))
        if (!res.ok) throw new Error(`Verification status unavailable (${res.status})`)
        const data = await res.json()
        if (isMounted && data) {
          const status = data.ai_verification_status || 'idle'
          setAiStatus(status)
          setCompilingStep(status === 'idle' ? 1 : 2)
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
        if (isMounted) setAiStatus('ai_unavailable')
        console.error('Error fetching AI verification status:', err)
      }
    }

    checkStatus()
    pollInterval = setInterval(checkStatus, 1500)

    return () => {
      isMounted = false

      if (pollInterval) clearInterval(pollInterval)
    }
  }, [sessionId])

  const formatDateMeta = (isoStr) => {
    try {
      if (!isoStr) return 'Date not recorded'
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return 'Not recorded'
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return 'Not recorded'
    }
  }

  const formatDurationMeta = (totalSec) => {
    if (totalSec === null || totalSec === undefined) return 'Duration not recorded'
    const hours = Math.floor(totalSec / 3600)
    const mins = Math.floor((totalSec % 3600) / 60)
    const secs = Math.floor(totalSec % 60)
    if (hours > 0) {
      return `${hours}h ${mins}m ${String(secs).padStart(2, '0')}s`
    }
    return `${mins}m ${String(secs).padStart(2, '0')}s`
  }

  const isCompiling = !skipCompiling && aiStatus === 'compiling'
  const isVerifying =
    (skipCompiling && (aiStatus === 'compiling' || aiStatus === 'verifying')) ||
    (!skipCompiling && aiStatus === 'verifying')
  const isAiUnavailable = !['compiling', 'verifying', 'completed_verified', 'completed_needs_review'].includes(aiStatus)

  const remainingToReview = summary?.unresolved_count !== undefined ? summary.unresolved_count : itemsPending
  const verifiedCount = summary?.verified_count !== undefined ? summary.verified_count : Math.max(0, itemsTotal - remainingToReview)
  const resolvedCount = itemsResolved !== undefined && itemsResolved > 0 ? itemsResolved : Math.max(0, itemsTotal - itemsPending)

  return (
    <div className="session-completion-page">
      {/* Ambient Pale-Blue Waves / Curves Background */}
      <div className="completion-ambient-bg" aria-hidden="true">
        <svg className="ambient-curve" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <path d="M620 -80 C 920 120, 1180 380, 1440 520 L 1440 -80 Z" fill="rgba(235, 244, 255, 0.65)" />
          <path d="M360 900 C 660 670, 1060 630, 1440 770 L 1440 900 Z" fill="rgba(224, 238, 255, 0.55)" />
          <path d="M-80 340 C 200 510, 300 710, 470 900 L -80 900 Z" fill="rgba(238, 247, 255, 0.7)" />
        </svg>
      </div>

      {/* Contained Floating Processing Card with Neat Metadata Above */}
      <div className="completion-card-wrapper">
        <p className="completion-meta-above-card">
          {formatDateMeta(dateCreated)} · {formatDurationMeta(durationSec)}
        </p>

        <div className="completion-floating-card" style={{ position: 'relative' }}>
          {/* Top Controls: Minimize Button */}
          {(isCompiling || isVerifying) && (
            <div className="modal-card-top-controls" style={{ position: 'absolute', top: '18px', right: '18px' }}>
              <button
                type="button"
                className="modal-minimize-btn"
                onClick={() => {
                  minimizeActiveProcess()
                  if (onFinishForNow) {
                    onFinishForNow()
                  } else if (onViewSessionDetails) {
                    onViewSessionDetails()
                  }
                }}
                title="Minimize to background"
                aria-label="Minimize"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          )}

          {/* 1. Compiling or Verifying State (media_1790599569372.png) */}
          {(isCompiling || isVerifying) && (
            <div className="completion-state-processing">
              {/* Circular gradient ring spinner */}
              <div className="completion-spinner-box">
                <svg className="completion-spinner-svg" width="58" height="58" viewBox="0 0 58 58" fill="none" aria-hidden="true">
                  <circle cx="29" cy="29" r="24" stroke="#e2e8f0" strokeWidth="4" />
                  <path d="M29 5 A 24 24 0 0 1 53 29" stroke="url(#spinnerGrad)" strokeWidth="4" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="spinnerGrad" x1="29" y1="5" x2="53" y2="29" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#1d68f2" />
                      <stop offset="1" stopColor="#3b82f6" stopOpacity="0.25" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <h2 className="floating-card-title">
                {isCompiling ? 'Compiling session' : 'Verifying transcript'}
              </h2>

              <p className="floating-card-subtitle">
                {isCompiling
                  ? 'Preparing audio and sermon context'
                  : itemsTotal > 0
                  ? `${resolvedCount} of ${itemsTotal} sections checked`
                  : 'Checking sermon transcript accuracy...'}
              </p>

              {/* Compact Progress Bar */}
              <div className="floating-progress-track">
                <div
                  className="floating-progress-fill"
                  style={{
                    width: isCompiling
                      ? '0%'
                      : `${itemsTotal > 0 ? Math.min(100, Math.round((resolvedCount / itemsTotal) * 100)) : 0}%`,
                  }}
                />
              </div>

              {/* 4-Step Vertical Timeline */}
              <div className="floating-timeline">
                {/* Step 1: Recording saved */}
                <div className="timeline-item timeline-item--done">
                  <div className="timeline-bullet timeline-bullet--done">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="timeline-text">Recording saved</span>
                </div>
                <div className="timeline-line timeline-line--done" />

                {/* Step 2: Finalizing transcript */}
                <div className={`timeline-item ${!isCompiling || compilingStep > 1 ? 'timeline-item--done' : 'timeline-item--active'}`}>
                  <div className={`timeline-bullet ${!isCompiling || compilingStep > 1 ? 'timeline-bullet--done' : 'timeline-bullet--active'}`}>
                    {!isCompiling || compilingStep > 1 ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span className="timeline-pulse-dot" />
                    )}
                  </div>
                  <span className={`timeline-text ${isCompiling && compilingStep === 1 ? 'timeline-text--active' : ''}`}>
                    Finalizing transcript
                  </span>
                </div>
                <div className={`timeline-line ${!isCompiling ? 'timeline-line--done' : ''}`} />

                {/* Step 3: Verifying transcript */}
                <div className={`timeline-item ${isVerifying ? 'timeline-item--active' : 'timeline-item--pending'}`}>
                  <div className={`timeline-bullet ${isVerifying ? 'timeline-bullet--active' : 'timeline-bullet--pending'}`}>
                    {isVerifying ? <span className="timeline-pulse-dot" /> : null}
                  </div>
                  <span className={`timeline-text ${isVerifying ? 'timeline-text--active' : ''}`}>
                    Verifying transcript
                  </span>
                </div>
                <div className="timeline-line timeline-line--pending" />

                {/* Step 4: Completing session */}
                <div className="timeline-item timeline-item--pending">
                  <div className="timeline-bullet timeline-bullet--pending" />
                  <span className="timeline-text timeline-text--pending">
                    Completing session
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 2. Verification Complete State (media_1790599569328.png) */}
          {!isCompiling && !isVerifying && !isAiUnavailable && (
            <div className="completion-state-complete">
              <div className="completion-success-badge">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 className="floating-card-title floating-card-title--complete">
                AI check finished — review the transcript
              </h2>

              {/* 2-Column Stats Box */}
              <div className="floating-stats-container">
                <div className="floating-stat-col">
                  <span className="floating-stat-num">{verifiedCount}</span>
                  <span className="floating-stat-label">sections verified automatically</span>
                </div>
                <div className="floating-stat-divider" />
                <div className="floating-stat-col">
                  <span className="floating-stat-num">{remainingToReview}</span>
                  <span className="floating-stat-label">sections need your review</span>
                </div>
              </div>

              {/* Full-Width Action Button */}
              <button
                type="button"
                className="btn-floating-primary"
                id={remainingToReview > 0 ? "btn-begin-verification-completion" : "btn-continue-completion"}
                onClick={() => {
                  if (remainingToReview > 0 && onBeginVerification) {
                    onBeginVerification()
                  } else if (onGoToReporting) {
                    onGoToReporting()
                  } else if (onFinishForNow) {
                    onFinishForNow()
                  } else if (onBeginVerification) {
                    onBeginVerification()
                  }
                }}
              >
                {remainingToReview > 0
                  ? `Review ${remainingToReview} Section${remainingToReview !== 1 ? 's' : ''} →`
                  : 'Process with AI →'}
              </button>
            </div>
          )}

          {/* 3. Unavailable State */}
          {!isCompiling && !isVerifying && isAiUnavailable && (
            <div className="completion-state-unavailable">
              <div className="completion-unavailable-badge">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <h2 className="floating-card-title">Verification unavailable</h2>

              <p className="floating-card-desc">
                Your recording and transcript are safe. Automated verification could not be completed right now.
              </p>

              <div className="floating-card-actions-row">
                {onRetryVerification && (
                  <button
                    type="button"
                    className="btn-floating-secondary"
                    id="btn-retry-verification-completion"
                    onClick={() => {
                      setAiStatus('verifying')
                      onRetryVerification()
                    }}
                  >
                    ↻ Try Again
                  </button>
                )}
                {onBeginVerification && (
                  <button
                    type="button"
                    className="btn-floating-primary btn-floating-primary--auto"
                    id="btn-manual-verify-completion"
                    onClick={onBeginVerification}
                  >
                    Review Manually →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

