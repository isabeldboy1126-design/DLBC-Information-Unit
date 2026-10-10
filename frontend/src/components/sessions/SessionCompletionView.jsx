import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl, authFetch } from '../../config'
import { minimizeActiveProcess, clearActiveProcess, setActiveProcess } from '../common/activeProcessManager'

/**
 * SessionCompletionView — Contained floating processing panel matching
 * approved design references (media_1790599569372.png & media_1790599569328.png).
 *
 * Visual hierarchy:
 * 1. Ambient Background / Backdrop: Dimmed backdrop retaining underlying view.
 * 2. Top-Left Context: Session title and Date · Duration.
 * 3. Contained Floating Card: Compact elevated white panel (max-width: 530px).
 *    - Compiling / Verifying / AI Processing states: Circular gradient ring spinner,
 *      title, progress text, horizontal progress bar, 5-step vertical timeline.
 *    - Expand & Minimize buttons in top controls.
 *    - Report Ready state: Mint/green check badge, 2-column stats, "View Executive Report →".
 *    - Cancelled state: Neutral slate badge, safe message.
 *    - Unavailable / Failed state: Soft amber badge, safe message.
 */
export function SessionCompletionView({
  session,
  latestRecording,
  onBeginVerification,
  onGoToReporting,
  onFinishForNow,
  onViewSessionDetails,
  onRetryVerification,
  onMinimize,
  onExpand,
  onViewReport,
  skipCompiling = false,
  isOverlay = false,
}) {
  const sessionId = session?.session_id || latestRecording?.session_id
  const serviceName = session?.title || latestRecording?.title || 'Sunday Worship'
  const durationSec = session?.duration_seconds || session?.audio_duration_seconds || latestRecording?.duration_seconds || 0
  const dateCreated = session?.date_created || latestRecording?.created_at || new Date().toISOString()
  const rawFlagCount = session?.flag_count || 0

  const [aiStatus, setAiStatus] = useState(skipCompiling ? 'verifying' : (session?.ai_verification_status || 'compiling'))
  const [reportState, setReportState] = useState('idle') // 'idle' | 'ai_processing' | 'generating_report' | 'ready' | 'failed'
  const [summary, setSummary] = useState(session?.ai_verification_summary || null)
  const [itemsTotal, setItemsTotal] = useState(session?.verification_items_total || rawFlagCount)
  const [itemsPending, setItemsPending] = useState(rawFlagCount)
  const [itemsResolved, setItemsResolved] = useState(session?.verification_items_resolved || 0)
  const [compilingStep, setCompilingStep] = useState(skipCompiling ? 2 : 1)
  const [isCancelling, setIsCancelling] = useState(false)
  const isMountedRef = useRef(true)

  const handleCancelVerification = async () => {
    if (!sessionId) return
    try {
      setIsCancelling(true)
      await authFetch(getApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/verification/cancel`), {
        method: 'POST',
      })
      clearActiveProcess()
      setAiStatus('cancelled')
      if (onFinishForNow) {
        onFinishForNow()
      } else if (onViewSessionDetails) {
        onViewSessionDetails()
      } else if (onBeginVerification) {
        await onBeginVerification()
      }
    } catch (e) {
      console.error('Error cancelling verification:', e)
      clearActiveProcess()
      setAiStatus('cancelled')
      if (onFinishForNow) onFinishForNow()
    } finally {
      setIsCancelling(false)
    }
  }

  // Poll verification and automatic report-processing status until completed
  useEffect(() => {
    if (!sessionId) return
    isMountedRef.current = true
    let pollInterval = null

    const stepTimer = setTimeout(() => {
      if (isMountedRef.current) setCompilingStep(2)
    }, 2000)

    const checkStatus = async () => {
      if (!isMountedRef.current) return
      try {
        // 1. Check verification status
        const res = await authFetch(getApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/verification/ai-status`))
        if (res.ok) {
          const data = await res.json()
          if (isMountedRef.current && data) {
            const status = data.ai_verification_status || 'idle'
            setAiStatus(status)
            if (data.summary && Object.keys(data.summary).length > 0) {
              setSummary(data.summary)
            }
            if (data.items_total !== undefined) setItemsTotal(data.items_total)
            if (data.items_pending !== undefined) setItemsPending(data.items_pending)
            if (data.items_resolved !== undefined) setItemsResolved(data.items_resolved)
          }
        }

        // 2. Check full session report statuses
        try {
          const sessRes = await authFetch(getApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}`))
          if (sessRes.ok) {
            const sessData = await sessRes.json()
            const sObj = sessData.session || sessData
            if (sObj?.final_report_status === 'complete' || sObj?.report_processing_status === 'completed') {
              if (isMountedRef.current) {
                setReportState('ready')
                if (pollInterval) clearInterval(pollInterval)
                return
              }
            }
          }
        } catch (e) {}

        // 3. Check report processing status
        try {
          const rpRes = await authFetch(getApiUrl(`/api/report-processing/status/${encodeURIComponent(sessionId)}`))
          if (rpRes.ok) {
            const rpData = await rpRes.json()
            if (isMountedRef.current && rpData && rpData.status) {
              if (rpData.status === 'completed') {
                setReportState('ready')
                if (pollInterval) clearInterval(pollInterval)
                return
              } else if (rpData.status === 'preparing_report') {
                setReportState('generating_report')
              } else if (rpData.status === 'ai_processing' || rpData.status === 'preparing_transcript') {
                setReportState('ai_processing')
              } else if (rpData.status === 'failed') {
                setReportState('failed')
              }
            }
          }
        } catch (e) {}
      } catch (err) {
        console.error('Error fetching processing status:', err)
      }
    }

    checkStatus()
    pollInterval = setInterval(checkStatus, 1600)

    return () => {
      isMountedRef.current = false
      clearTimeout(stepTimer)
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [sessionId])

  // Keep active process in sync without setting isMinimized: true
  useEffect(() => {
    if (!sessionId) return
    let currentLabel = 'Compiling session...'
    if (reportState === 'ready') {
      currentLabel = 'Executive Report Ready'
    } else if (reportState === 'generating_report') {
      currentLabel = 'Generating Report...'
    } else if (reportState === 'ai_processing') {
      currentLabel = 'Processing with AI...'
    } else if (aiStatus === 'verifying') {
      currentLabel = 'Verifying transcript...'
    } else if (aiStatus === 'compiling') {
      currentLabel = 'Compiling session...'
    }

    setActiveProcess({
      sessionId,
      sessionTitle: serviceName,
      stageLabel: currentLabel,
      isCompleted: reportState === 'ready',
      jobType: 'automatic_pipeline',
    })
  }, [sessionId, serviceName, aiStatus, reportState])

  const formatDateMeta = (isoStr) => {
    try {
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return 'Aug 23, 2026'
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return 'Aug 23, 2026'
    }
  }

  const formatDurationMeta = (totalSec) => {
    if (!totalSec && totalSec !== 0) return '25m 41s'
    const hours = Math.floor(totalSec / 3600)
    const mins = Math.floor((totalSec % 3600) / 60)
    const secs = Math.floor(totalSec % 60)
    if (hours > 0) {
      return `${hours}h ${mins}m ${String(secs).padStart(2, '0')}s`
    }
    return `${mins}m ${String(secs).padStart(2, '0')}s`
  }

  const isCompiling = !skipCompiling && aiStatus === 'compiling' && reportState === 'idle'
  const isVerifying =
    !isCompiling &&
    ((skipCompiling && (aiStatus === 'compiling' || aiStatus === 'verifying')) ||
    (!skipCompiling && aiStatus === 'verifying')) &&
    reportState === 'idle'
  const isAiProcessing = reportState === 'ai_processing'
  const isGeneratingReport = reportState === 'generating_report'
  const isReportReady = reportState === 'ready'
  const isCancelled = aiStatus === 'cancelled'
  const isFailed = aiStatus === 'failed' || reportState === 'failed'
  const isAiUnavailable = aiStatus === 'ai_unavailable'

  const isVerificationDone = ['completed_verified', 'completed_needs_review'].includes(aiStatus) || ['ai_processing', 'generating_report', 'ready'].includes(reportState)
  const isAiDone = reportState === 'ready'
  const isInProgress = (isCompiling || isVerifying || isAiProcessing || isGeneratingReport) && !isCancelled && !isFailed && !isAiUnavailable

  const remainingToReview = summary?.unresolved_count !== undefined ? summary.unresolved_count : itemsPending
  const verifiedCount = summary?.verified_count !== undefined ? summary.verified_count : Math.max(0, itemsTotal - remainingToReview)
  const resolvedCount = itemsResolved !== undefined && itemsResolved > 0 ? itemsResolved : Math.max(0, itemsTotal - itemsPending)

  let cardTitle = 'Compiling session'
  let cardSubtitle = 'Preparing audio and sermon context'
  let progressPercent = 30

  if (isReportReady) {
    cardTitle = 'Executive report ready'
    cardSubtitle = 'Verification and AI compilation complete'
    progressPercent = 100
  } else if (isGeneratingReport) {
    cardTitle = 'Generating report'
    cardSubtitle = 'Compiling structured executive document'
    progressPercent = 90
  } else if (isAiProcessing) {
    cardTitle = 'Processing with AI'
    cardSubtitle = 'Extracting themes, outlines and scriptures'
    progressPercent = 75
  } else if (isVerifying) {
    cardTitle = 'Verifying transcript'
    cardSubtitle = itemsTotal > 0
      ? `${resolvedCount} of ${itemsTotal} sections checked`
      : 'Checking sermon transcript accuracy...'
    progressPercent = itemsTotal > 0 ? Math.max(35, Math.min(65, Math.round((resolvedCount / itemsTotal) * 65))) : 45
  } else if (isCompiling) {
    cardTitle = 'Compiling session'
    cardSubtitle = 'Preparing audio and sermon context'
    progressPercent = compilingStep >= 2 ? 30 : 15
  }

  const cardContent = (
    <div className="session-completion-page">
      {!isOverlay && (
        <div className="completion-ambient-bg" aria-hidden="true">
          <svg className="ambient-curve" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
            <path d="M620 -80 C 920 120, 1180 380, 1440 520 L 1440 -80 Z" fill="rgba(235, 244, 255, 0.65)" />
            <path d="M360 900 C 660 670, 1060 630, 1440 770 L 1440 900 Z" fill="rgba(224, 238, 255, 0.55)" />
            <path d="M-80 340 C 200 510, 300 710, 470 900 L -80 900 Z" fill="rgba(238, 247, 255, 0.7)" />
          </svg>
        </div>
      )}

      {/* Contained Floating Processing Card with Neat Metadata Above */}
      <div className="completion-card-wrapper">
        <p className="completion-meta-above-card">
          {formatDateMeta(dateCreated)} · {formatDurationMeta(durationSec)}
        </p>

        <div className="completion-floating-card" style={{ position: 'relative' }}>
          {/* Top Controls: Expand and Minimize Buttons */}
          <div className="modal-card-top-controls" style={{ position: 'absolute', top: '18px', right: '18px', display: 'flex', gap: '8px' }}>
            {onExpand && (
              <button
                type="button"
                className="modal-expand-btn"
                onClick={onExpand}
                title="Expand to detailed processing view"
                aria-label="Expand"
              >
                🗖
              </button>
            )}
            {(onMinimize || onFinishForNow || onViewSessionDetails) && (
              <button
                type="button"
                className="modal-minimize-btn"
                onClick={() => {
                  minimizeActiveProcess()
                  if (onMinimize) {
                    onMinimize()
                  } else if (onFinishForNow) {
                    onFinishForNow()
                  } else if (onViewSessionDetails) {
                    onViewSessionDetails()
                  }
                }}
                title="Minimize to background status bar"
                aria-label="Minimize"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            )}
          </div>

          {/* 1. Compiling, Verifying, or AI Processing State */}
          {isInProgress && (
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
                {cardTitle}
              </h2>

              <p className="floating-card-subtitle">
                {cardSubtitle}
              </p>

              {/* Compact Progress Bar */}
              <div className="floating-progress-track">
                <div
                  className="floating-progress-fill"
                  style={{
                    width: `${progressPercent}%`,
                  }}
                />
              </div>

              {/* 5-Step Vertical Timeline */}
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
                <div className={`timeline-line ${isVerificationDone ? 'timeline-line--done' : ''}`} />

                {/* Step 3: Verifying transcript */}
                <div className={`timeline-item ${isVerificationDone ? 'timeline-item--done' : isVerifying ? 'timeline-item--active' : 'timeline-item--pending'}`}>
                  <div className={`timeline-bullet ${isVerificationDone ? 'timeline-bullet--done' : isVerifying ? 'timeline-bullet--active' : 'timeline-bullet--pending'}`}>
                    {isVerificationDone ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : isVerifying ? (
                      <span className="timeline-pulse-dot" />
                    ) : null}
                  </div>
                  <span className={`timeline-text ${isVerifying ? 'timeline-text--active' : ''}`}>
                    Verifying transcript
                  </span>
                </div>
                <div className={`timeline-line ${isAiDone ? 'timeline-line--done' : ''}`} />

                {/* Step 4: AI processing */}
                <div className={`timeline-item ${isAiDone ? 'timeline-item--done' : (isAiProcessing || isGeneratingReport) ? 'timeline-item--active' : 'timeline-item--pending'}`}>
                  <div className={`timeline-bullet ${isAiDone ? 'timeline-bullet--done' : (isAiProcessing || isGeneratingReport) ? 'timeline-bullet--active' : 'timeline-bullet--pending'}`}>
                    {isAiDone ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (isAiProcessing || isGeneratingReport) ? (
                      <span className="timeline-pulse-dot" />
                    ) : null}
                  </div>
                  <span className={`timeline-text ${(isAiProcessing || isGeneratingReport) ? 'timeline-text--active' : ''}`}>
                    {isGeneratingReport ? 'Generating report' : 'Processing with AI'}
                  </span>
                </div>
                <div className={`timeline-line ${isReportReady ? 'timeline-line--done' : 'timeline-line--pending'}`} />

                {/* Step 5: Report ready */}
                <div className={`timeline-item ${isReportReady ? 'timeline-item--done' : 'timeline-item--pending'}`}>
                  <div className={`timeline-bullet ${isReportReady ? 'timeline-bullet--done' : 'timeline-bullet--pending'}`}>
                    {isReportReady && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className={`timeline-text ${isReportReady ? 'timeline-text--active' : 'timeline-text--pending'}`}>
                    Executive report ready
                  </span>
                </div>
              </div>

              {/* Cancel verification action */}
              <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn-cancel-report-process"
                  onClick={handleCancelVerification}
                  disabled={isCancelling}
                  id="btn-cancel-verification"
                >
                  {isCancelling ? 'Cancelling...' : 'Cancel verification'}
                </button>
              </div>
            </div>
          )}

          {/* 2. Complete State (Report Ready or Verification Complete) */}
          {!isInProgress && !isCancelled && !isFailed && !isAiUnavailable && (
            <div className="completion-state-complete">
              <div className="completion-success-badge">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 className="floating-card-title floating-card-title--complete">
                {isReportReady ? 'Executive report ready' : 'Verification complete'}
              </h2>

              {/* 2-Column Stats Box */}
              <div className="floating-stats-container">
                <div className="floating-stat-col">
                  <span className="floating-stat-num">{verifiedCount}</span>
                  <span className="floating-stat-label">sections verified</span>
                </div>
                <div className="floating-stat-divider" />
                <div className="floating-stat-col">
                  <span className="floating-stat-num">{isReportReady ? 'Ready' : remainingToReview}</span>
                  <span className="floating-stat-label">{isReportReady ? 'Executive document' : 'sections to review'}</span>
                </div>
              </div>

              {/* Full-Width Action Button */}
              <button
                type="button"
                className="btn-floating-primary"
                id="btn-completion-continue-action"
                onClick={() => {
                  if (isReportReady) {
                    if (onViewReport) onViewReport(sessionId)
                    else if (onGoToReporting) onGoToReporting()
                    else if (onViewSessionDetails) onViewSessionDetails()
                  } else if (remainingToReview > 0 && onBeginVerification) {
                    onBeginVerification()
                  } else if (onGoToReporting) {
                    onGoToReporting()
                  } else if (onViewSessionDetails) {
                    onViewSessionDetails()
                  }
                }}
              >
                {isReportReady
                  ? 'View Executive Report →'
                  : remainingToReview > 0
                  ? `Review ${remainingToReview} Section${remainingToReview !== 1 ? 's' : ''} →`
                  : 'Process with AI →'}
              </button>
            </div>
          )}

          {/* 3. Cancelled State */}
          {isCancelled && (
            <div className="completion-state-cancelled" style={{ textAlign: 'center' }}>
              <div className="completion-unavailable-badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>

              <h2 className="floating-card-title">Verification cancelled</h2>

              <p className="floating-card-desc">
                Automated verification was cancelled. Your recording, transcript, and previously resolved items remain safe.
              </p>

              <div className="floating-card-actions-row">
                {onRetryVerification && (
                  <button
                    type="button"
                    className="btn-floating-secondary"
                    id="btn-restart-verification-completion"
                    onClick={() => {
                      setAiStatus('compiling')
                      onRetryVerification()
                    }}
                  >
                    ↻ Restart Verification
                  </button>
                )}
                {onBeginVerification && (
                  <button
                    type="button"
                    className="btn-floating-primary btn-floating-primary--auto"
                    id="btn-manual-verify-cancelled"
                    onClick={onBeginVerification}
                  >
                    Review Flagged Items →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 4. Unavailable or Failed State */}
          {(isFailed || isAiUnavailable) && (
            <div className="completion-state-unavailable">
              <div className="completion-unavailable-badge">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <h2 className="floating-card-title">{isFailed ? 'Processing failed' : 'Verification unavailable'}</h2>

              <p className="floating-card-desc">
                Your recording and transcript are safe. Automated processing could not be completed right now.
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

  if (isOverlay) {
    return (
      <div className="session-completion-modal-overlay" role="dialog" aria-modal="true" aria-label="Session Processing Progress">
        {cardContent}
      </div>
    )
  }

  return cardContent
}

