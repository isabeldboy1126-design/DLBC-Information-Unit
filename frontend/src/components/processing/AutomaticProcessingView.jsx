import React, { useState, useEffect, useRef } from 'react'
import { authFetch } from '../../config'
import { getCleanSessionName, getSessionHierarchy } from '../sessions/SessionDetailView'
import { setActiveProcess, minimizeActiveProcess } from '../common/activeProcessManager'

const PIPELINE_STAGES = [
  { id: 'compiling', label: 'Compiling Recording', subtext: 'Finalizing audio master & formatting' },
  { id: 'transcribing', label: 'Transcribing', subtext: 'Generating speech transcript' },
  { id: 'verifying', label: 'Verifying', subtext: 'Acoustic verification & doctrine cross-check' },
  { id: 'ai_processing', label: 'Processing with AI', subtext: 'Extracting key themes, outlines & scriptures' },
  { id: 'generating_report', label: 'Generating Report', subtext: 'Compiling structured executive report' },
]

export function AutomaticProcessingView({
  sessionId,
  session: initialSession,
  initialStage = 'compiling',
  onViewReport,
  onOpenSession,
  onReturnToDashboard,
  onMinimize,
}) {
  const [session, setSession] = useState(initialSession || null)
  const [pipelineState, setPipelineState] = useState(initialStage) // 'compiling' | 'transcribing' | 'verifying' | 'ai_processing' | 'generating_report' | 'ready' | 'error'
  const [verificationStats, setVerificationStats] = useState({ total: 0, resolved: 0, verified: 0, needsReview: 0 })
  const [reportRun, setReportRun] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const pollTimerRef = useRef(null)
  const isMountedRef = useRef(true)

  // Fetch full session details
  const fetchSession = async () => {
    if (!sessionId) return null
    try {
      const res = await authFetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
      if (res.ok) {
        const data = await res.json()
        const sess = data.session || data
        if (isMountedRef.current && sess) {
          setSession(sess)
          return sess
        }
      }
    } catch (err) {
      console.warn('Failed to poll session details:', err)
    }
    return null
  }

  // Poll pipeline states dynamically
  useEffect(() => {
    isMountedRef.current = true

    const pollPipeline = async () => {
      if (!sessionId || !isMountedRef.current) return

      const curSession = await fetchSession()
      const vStatus = curSession?.ai_verification_status || 'idle'
      const rpStatus = curSession?.report_processing_status || 'not_started'
      const fStatus = curSession?.final_report_status || 'not_started'

      // Check if report is already completed
      if (fStatus === 'complete' || rpStatus === 'completed') {
        if (isMountedRef.current) {
          setPipelineState('ready')
        }
        return
      }

      // Check report processing run
      try {
        const rpRes = await authFetch(`/api/report-processing/status/${encodeURIComponent(sessionId)}`)
        if (rpRes.ok) {
          const run = await rpRes.json()
          if (isMountedRef.current && run && run.status) {
            setReportRun(run)
            if (run.status === 'completed') {
              setPipelineState('ready')
              return
            } else if (run.status === 'preparing_report') {
              setPipelineState('generating_report')
              return
            } else if (run.status === 'ai_processing' || run.status === 'preparing_transcript') {
              setPipelineState('ai_processing')
              return
            } else if (run.status === 'failed') {
              setPipelineState('error')
              setErrorMessage(run.error_message || 'AI Report Processing encountered an error.')
              return
            }
          }
        }
      } catch (err) {
        // Fall through to verification polling
      }

      // Check verification status
      try {
        const vRes = await authFetch(`/api/sessions/${encodeURIComponent(sessionId)}/verification/ai-status`)
        if (vRes.ok) {
          const vData = await vRes.json()
          if (isMountedRef.current && vData) {
            const st = vData.ai_verification_status || vStatus
            setVerificationStats({
              total: vData.items_total || 0,
              resolved: vData.items_resolved || 0,
              verified: vData.summary?.verified_count || 0,
              needsReview: vData.items_pending || vData.summary?.unresolved_count || 0,
            })

            if (st === 'compiling') {
              setPipelineState('compiling')
            } else if (st === 'verifying') {
              setPipelineState('verifying')
            } else if (st === 'completed_verified' || st === 'completed_needs_review') {
              // Verification finished, moving into AI report processing
              setPipelineState('ai_processing')
            } else if (st === 'ai_unavailable' || st === 'failed') {
              // If AI unavailable or verification error, we can still allow proceeding to report or review
              setPipelineState('ai_processing')
            }
          }
        }
      } catch (err) {
        // Ignore polling error
      }
    }

    pollPipeline()
    pollTimerRef.current = setInterval(pollPipeline, 1800)

    return () => {
      isMountedRef.current = false
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [sessionId])

  const handleRetryProcessing = async () => {
    if (!sessionId) return
    setIsRetrying(true)
    setErrorMessage(null)
    setPipelineState('ai_processing')
    try {
      await authFetch('/api/report-processing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, force_new: true }),
      })
    } catch (e) {
      setErrorMessage(`Retry failed: ${e.message}`)
      setPipelineState('error')
    } finally {
      setIsRetrying(false)
    }
  }

  const { programme } = getSessionHierarchy(session)
  const cleanTitle = getCleanSessionName(session)
  const dayNumber = session?.day_number || session?.metadata?.day_number

  // Keep global background processing state in sync for docked in-app indicator
  useEffect(() => {
    if (!sessionId) return
    const stageLabels = {
      compiling: 'Compiling Recording...',
      transcribing: 'Transcribing speech...',
      verifying: 'Verifying transcript...',
      ai_processing: 'Processing with AI...',
      generating_report: 'Generating Executive Report...',
      ready: 'Executive Report Ready',
      error: 'Processing Error',
    }
    const label = stageLabels[pipelineState] || 'Processing...'
    setActiveProcess({
      sessionId,
      sessionTitle: cleanTitle || 'Session',
      dayNumber: dayNumber || null,
      stageLabel: label,
      isCompleted: pipelineState === 'ready',
      jobType: 'automatic_pipeline',
    })
  }, [sessionId, pipelineState, cleanTitle, dayNumber])

  const formatDate = (isoStr) => {
    if (!isoStr) return ''
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return ''
    }
  }

  const formatDuration = (totalSec) => {
    if (!totalSec || totalSec <= 0) return '0m 00s'
    const mins = Math.floor(totalSec / 60)
    const secs = Math.floor(totalSec % 60)
    return `${mins}m ${String(secs).padStart(2, '0')}s`
  }

  const getStageIndex = (stateKey) => {
    switch (stateKey) {
      case 'compiling':
        return 0
      case 'transcribing':
        return 1
      case 'verifying':
        return 2
      case 'ai_processing':
        return 3
      case 'generating_report':
        return 4
      case 'ready':
        return 5
      default:
        return 2
    }
  }

  const currentActiveIndex = getStageIndex(pipelineState)

  return (
    <div className="automatic-processing-view-container">
      {/* ----------------------------------------------------------------- */}
      {/* Top Header / Identity Bar                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="card processing-header-card">
        <div className="processing-header-left">
          <div className="processing-status-pill">
            {pipelineState === 'ready' ? (
              <span className="pill-dot pill-dot--success">●</span>
            ) : pipelineState === 'error' ? (
              <span className="pill-dot pill-dot--error">●</span>
            ) : (
              <span className="pill-dot pill-dot--pulse">●</span>
            )}
            <span className="pill-label">
              {pipelineState === 'ready'
                ? 'REPORT READY'
                : pipelineState === 'error'
                ? 'PROCESSING ERROR'
                : 'AUTOMATIC PROCESSING'}
            </span>
          </div>

          <div className="processing-title-group">
            <h1 className="processing-session-title">
              {cleanTitle}
              {dayNumber && (
                <span className="session-day-badge" title={`Day ${dayNumber}`}>
                  {dayNumber}
                </span>
              )}
            </h1>

            <div className="processing-meta-row">
              {programme && <span className="meta-item">🏛️ {programme}</span>}
              {session?.minister && <span className="meta-item">👤 {session.minister}</span>}
              {session?.date_created && <span className="meta-item">📅 {formatDate(session.date_created)}</span>}
              {(session?.duration_seconds || session?.audio_duration_seconds) ? (
                <span className="meta-item">⏱️ {formatDuration(session.duration_seconds || session.audio_duration_seconds)}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="processing-header-right">
          {onMinimize && pipelineState !== 'ready' && (
            <button
              type="button"
              className="btn btn--outline btn--minimize-processing"
              onClick={() => {
                minimizeActiveProcess()
                if (onMinimize) onMinimize()
              }}
              title="Minimize processing to in-app status bar and use other features"
            >
              <span>🗕 Minimize</span>
            </button>
          )}

          {onOpenSession && (
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => onOpenSession(sessionId)}
              title="Inspect raw artifacts in Session view"
            >
              <span>Open Session</span>
            </button>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Main Stage Card                                                   */}
      {/* ----------------------------------------------------------------- */}
      <div className="card processing-body-card">
        {pipelineState === 'ready' ? (
          <div className="processing-ready-card">
            <div className="ready-badge-ring">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h2 className="ready-headline">Executive Report Ready</h2>
            <p className="ready-description">
              The automated pipeline has completed transcription, acoustic verification, and AI report generation.
              Your final report is ready for editorial review and distribution.
            </p>

            <div className="ready-stats-grid">
              <div className="stat-card">
                <span className="stat-value">✓ 100%</span>
                <span className="stat-label">Pipeline completed</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {verificationStats.verified || verificationStats.resolved || 'Verified'}
                </span>
                <span className="stat-label">Sections cross-checked</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {reportRun?.tokens_used ? `${Math.round(reportRun.tokens_used / 1000)}k` : 'Ready'}
                </span>
                <span className="stat-label">AI report compilation</span>
              </div>
            </div>

            <div className="ready-actions-row">
              <button
                type="button"
                className="btn btn--primary btn--view-report"
                id="btn-view-ready-report"
                onClick={() => onViewReport(sessionId)}
              >
                <span>View Report →</span>
              </button>

              <button
                type="button"
                className="btn btn--outline"
                id="btn-open-ready-session"
                onClick={() => onOpenSession(sessionId)}
              >
                <span>Inspect Session Artifacts</span>
              </button>

              {onReturnToDashboard && (
                <button
                  type="button"
                  className="btn btn--subtle"
                  id="btn-return-dashboard"
                  onClick={onReturnToDashboard}
                >
                  <span>Back to Dashboard</span>
                </button>
              )}
            </div>
          </div>
        ) : pipelineState === 'error' ? (
          <div className="processing-error-card">
            <div className="error-icon-box">⚠️</div>
            <h2 className="error-headline">Processing Encountered an Issue</h2>
            <p className="error-description">
              {errorMessage || 'An error occurred during automatic report generation. Your original recording and transcript remain 100% safe.'}
            </p>

            <div className="error-actions-row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleRetryProcessing}
                disabled={isRetrying}
              >
                {isRetrying ? 'Retrying...' : '↻ Retry AI Processing'}
              </button>

              <button
                type="button"
                className="btn btn--outline"
                onClick={() => onOpenSession(sessionId)}
              >
                Open Session Anyway
              </button>
            </div>
          </div>
        ) : (
          <div className="processing-in-progress-card">
            <div className="processing-spinner-container">
              <svg className="processing-spinner" width="60" height="60" viewBox="0 0 60 60" fill="none">
                <circle cx="30" cy="30" r="26" stroke="#e2e8f0" strokeWidth="4" />
                <path d="M30 4 A 26 26 0 0 1 56 30" stroke="#1d68f2" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </div>

            <h2 className="current-stage-title">
              {PIPELINE_STAGES[Math.min(currentActiveIndex, 4)]?.label}...
            </h2>
            <p className="current-stage-subtitle">
              {PIPELINE_STAGES[Math.min(currentActiveIndex, 4)]?.subtext}
            </p>

            {/* Stepper Display */}
            <div className="pipeline-stepper">
              {PIPELINE_STAGES.map((stg, idx) => {
                const isCompleted = idx < currentActiveIndex
                const isActive = idx === currentActiveIndex

                return (
                  <div
                    key={stg.id}
                    className={`stepper-step ${
                      isCompleted ? 'stepper-step--completed' : isActive ? 'stepper-step--active' : 'stepper-step--pending'
                    }`}
                  >
                    <div className="step-indicator stepper-circle">
                      {isCompleted ? (
                        <span className="step-check">✓</span>
                      ) : (
                        <span className="step-number">{idx + 1}</span>
                      )}
                    </div>
                    <div className="step-content">
                      <span className="step-label">{stg.label}</span>
                      <span className="step-sub">{stg.subtext}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* In-flight telemetry feedback */}
            <div className="processing-telemetry-box">
              {pipelineState === 'verifying' && verificationStats.total > 0 && (
                <span className="telemetry-badge">
                  Checking {verificationStats.resolved} of {verificationStats.total} transcript sections
                </span>
              )}
              {pipelineState === 'ai_processing' && reportRun?.current_step && (
                <span className="telemetry-badge">
                  AI Step: {reportRun.current_step.replace(/_/g, ' ')}
                </span>
              )}
              {pipelineState === 'generating_report' && (
                <span className="telemetry-badge">
                  Compiling formatted report draft
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
