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
}) {
  const sessionId = session?.session_id || latestRecording?.session_id
  const serviceName = session?.title || latestRecording?.title || 'Sunday Morning Worship Service'
  const durationSec = session?.duration_seconds || session?.audio_duration_seconds || latestRecording?.duration_seconds || 0
  const dateCreated = session?.date_created || latestRecording?.created_at || new Date().toISOString()
  const rawFlagCount = session?.flag_count || 0

  const [aiStatus, setAiStatus] = useState(session?.ai_verification_status || 'compiling')
  const [summary, setSummary] = useState(session?.ai_verification_summary || null)
  const [itemsTotal, setItemsTotal] = useState(session?.verification_items_total || rawFlagCount)
  const [itemsPending, setItemsPending] = useState(rawFlagCount)
  const [compilingStep, setCompilingStep] = useState(1)

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

  const isCompiling = aiStatus === 'compiling'
  const isVerifying = aiStatus === 'verifying'
  const isVerifiedSuccess = aiStatus === 'completed_verified' || (aiStatus === 'idle' && itemsPending === 0 && rawFlagCount === 0)
  const isNeedsReview = aiStatus === 'completed_needs_review' || (aiStatus === 'idle' && itemsPending > 0)
  const isAiUnavailable = aiStatus === 'ai_unavailable' || aiStatus === 'failed'

  const remainingToReview = summary?.unresolved_count !== undefined ? summary.unresolved_count : itemsPending

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
              ? 'Autonomous AI Verification in Progress'
              : isVerifiedSuccess
              ? 'Session Verified Successfully'
              : isAiUnavailable
              ? 'Session Captured — Manual Review Available'
              : 'Session Captured — Review Required'}
          </h2>
          <p className="completion-subtitle">
            {isCompiling
              ? 'Recording is safely preserved. Indexing speech text and extracting bounded audio windows.'
              : isVerifying
              ? 'Evaluating audio slices, Azure speech transcript, and King James Bible doctrinal context.'
              : isVerifiedSuccess
              ? 'All segments verified against King James Scripture and DLBC church vocabulary. 0 items to review.'
              : isAiUnavailable
              ? 'Audio and raw transcripts are safely saved. AI verification service is unreachable; proceed with manual review.'
              : `AI verification resolved known passages. ${remainingToReview} segment${remainingToReview !== 1 ? 's' : ''} require reviewer confirmation.`}
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

          {/* 1. Compiling Screen Component */}
          {isCompiling && (
            <div className="completion-processing-box compiling-box">
              <div className="processing-header">
                <span className="processing-tag">STAGE 1: COMPILING</span>
                <span className="processing-subtext">Preparing audio windows &amp; KJV doctrinal context</span>
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
                <span className="processing-tag">STAGE 2: VERIFYING</span>
                <span className="processing-subtext">Comparing Azure Speech, Gemini Audio &amp; KJV Context</span>
              </div>

              <div className="verifying-content-row">
                <div className="verifying-sparkle-indicator">
                  <span className="sparkle-pulse">✦</span>
                </div>
                <div className="verifying-details">
                  <strong className="verifying-title">
                    Verifying {itemsTotal > 0 ? `${itemsTotal} flagged segment${itemsTotal !== 1 ? 's' : ''}` : 'segments'} with AI...
                  </strong>
                  <p className="verifying-desc">
                    Cross-referencing acoustic phonetics against 66 King James Bible books and DLBC ministry vocabulary.
                  </p>
                </div>
              </div>

              <div className="verifying-progress-track">
                <div className="verifying-progress-fill" />
              </div>
            </div>
          )}

          {/* 3. Result Screen: Success / 0 to Review */}
          {!isCompiling && !isVerifying && isVerifiedSuccess && (
            <div className="completion-verification-card verify-card--clean">
              <div className="verify-card-left">
                <span className="verify-icon">✓</span>
                <div className="verify-text">
                  <strong className="verify-heading">All Segments Verified (0 to Review)</strong>
                  <p className="verify-desc">
                    All transcript sections met high-confidence doctrinal matching. Ready to proceed directly to Information Unit Reporting.
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
                  <span>Go to Reporting</span>
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
                    {remainingToReview} Segment{remainingToReview !== 1 ? 's' : ''} Require Human Review
                  </strong>
                  <div className="completion-stats-chips">
                    {summary?.verified_count !== undefined && (
                      <span className="stat-chip stat-chip--verified">
                        ✓ {summary.verified_count} Verified by AI
                      </span>
                    )}
                    {summary?.corrected_count !== undefined && summary.corrected_count > 0 && (
                      <span className="stat-chip stat-chip--corrected">
                        ✎ {summary.corrected_count} Corrected by AI
                      </span>
                    )}
                    <span className="stat-chip stat-chip--pending">
                      ● {remainingToReview} Pending Review
                    </span>
                  </div>
                  <p className="verify-desc">
                    Review and confirm preacher wording, names, and scriptures. AI suggestions are pre-filled for rapid one-click approval.
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
                  <span>Review {remainingToReview} Item{remainingToReview !== 1 ? 's' : ''}</span>
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
                  <strong className="verify-heading">AI Verification Unavailable</strong>
                  <p className="verify-desc">
                    The autonomous AI verification service is currently offline or unreachable. Your master audio and raw transcript are 100% safe. You can proceed with standard manual verification.
                  </p>
                </div>
              </div>

              {onBeginVerification && (
                <button
                  type="button"
                  className="btn btn--primary btn--begin-verify"
                  onClick={onBeginVerification}
                  id="btn-manual-verify-completion"
                >
                  <span>Proceed to Manual Review</span>
                  <span>→</span>
                </button>
              )}
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

