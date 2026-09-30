import { Icon } from '../common/Icon'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getApiUrl } from '../../config'
import { getCleanSessionName } from '../sessions/SessionDetailView'
import { getActiveProcess, setActiveProcess, clearActiveProcess, minimizeActiveProcess } from '../common/activeProcessManager'

function DocumentIconLarge() { return <Icon name="document" /> }

function MinimizeIcon() { return <Icon name="minimize" /> }


function CheckIcon() { return <Icon name="check" /> }


function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'Not recorded'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s < 10 ? '0' : ''}${s}s`
}

function formatDate(dateStr) {
  if (!dateStr) return 'Not recorded'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

const STEPS = [
  { id: 1, key: 'preparing_transcript', label: 'Preparing Transcript' },
  { id: 2, key: 'ai_processing', label: 'AI Processing' },
  { id: 3, key: 'preparing_report', label: 'Preparing Report' },
  { id: 4, key: 'completed', label: 'Draft saved' },
]

export function ReportProcessingModal({
  isOpen,
  session,
  onClose,
  onViewReport,
  onProcessingComplete,
}) {
  const [currentStage, setCurrentStage] = useState('preparing_transcript')
  const [runId, setRunId] = useState(null)
  const [runData, setRunData] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return
    const dialog = dialogRef.current
    const priorFocus = document.activeElement
    const affected = []
    for (let branch = dialog; branch.parentElement && branch.parentElement !== document.body; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) if (sibling !== branch && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) { affected.push([sibling, sibling.inert]); sibling.inert = true }
    }
    const controls = () => [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length)
    controls()[0]?.focus()
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); minimizeActiveProcess(); closeRef.current?.() }
      if (e.key === 'Tab') { const list = controls(); const first = list[0]; const last = list.at(-1); if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last?.focus() } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first?.focus() } }
    }
    const focus = e => { if (!dialog.contains(e.target)) controls()[0]?.focus() }
    document.addEventListener('keydown', key); document.addEventListener('focusin', focus)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('focusin', focus); for (const [el, inert] of affected) el.inert = inert; if (priorFocus?.isConnected) priorFocus.focus() }
  }, [isOpen])

  const pollTimerRef = useRef(null)
  const isMountedRef = useRef(true)
  const onProcessingCompleteRef = useRef(onProcessingComplete)
  onProcessingCompleteRef.current = onProcessingComplete

  const startedSessionRef = useRef(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  const sessionId = session?.session_id
  const activeContextRef = useRef({ isOpen, sessionId })
  activeContextRef.current = { isOpen, sessionId }

  const getActiveStepNumber = () => {
    if (currentStage === 'preparing_transcript') return 1
    if (currentStage === 'ai_processing') return 2
    if (currentStage === 'preparing_report') return 3
    if (currentStage === 'completed') return 4
    return 1
  }

  // Poll status from backend
  const pollStatus = useCallback(async () => {
    const isCurrent = () => isMountedRef.current && activeContextRef.current.isOpen && activeContextRef.current.sessionId === sessionId
    if (!sessionId || !isCurrent()) return
    try {
      const res = await fetch(getApiUrl(`/api/report-processing/status/${sessionId}`))
      if (!res.ok) throw new Error(`Processing status unavailable (${res.status}). Reopen or retry to check the saved session.`)
      const data = await res.json()
      if (!isCurrent()) return

      setRunData(data)
      if (data.run_id) setRunId(data.run_id)

      const cleanTitle = getCleanSessionName(session)
      const stageMap = {
        preparing_transcript: 'Preparing Transcript',
        ai_processing: 'AI Processing',
        preparing_report: 'Preparing Report',
        completed: 'Draft ready for review',
      }

      if (data.status === 'in_progress') {
        const nextStage = data.current_stage || 'ai_processing'
        setCurrentStage(nextStage)
        setActiveProcess({
          jobType: 'report_processing',
          sessionId,
          sessionTitle: cleanTitle,
          stageLabel: stageMap[nextStage] || 'AI Processing',
          isCompleted: false,
          runId: data.run_id || runId,
        })
      } else if (data.status === 'completed') {
        setCurrentStage('completed')
        setActiveProcess({
          jobType: 'report_processing',
          sessionId,
          sessionTitle: cleanTitle,
          stageLabel: 'Draft ready for review',
          isCompleted: true,
          runId: data.run_id || runId,
        })
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
        if (onProcessingCompleteRef.current) onProcessingCompleteRef.current(data)
      } else if (data.status === 'failed') {
        setCurrentStage('failed')
        setErrorMsg(data.error_message || 'Report processing failed')
        clearActiveProcess()
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
      } else if (data.status === 'cancelled') {
        setCurrentStage('cancelled')
        clearActiveProcess()
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
      }
    } catch (e) {
      if (!isCurrent()) return
      setErrorMsg(e.message)
      setCurrentStage('failed')
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [sessionId, session, runId])

  // Trigger or resume processing
  const startProcessing = useCallback(async (forceNew = false) => {
    const isCurrent = () => isMountedRef.current && activeContextRef.current.isOpen && activeContextRef.current.sessionId === sessionId
    if (!sessionId || !isCurrent()) return
    setErrorMsg(null)
    setIsCancelling(false)
    setCurrentStage('preparing_transcript')
    const cleanTitle = getCleanSessionName(session)

    try {
      const statusRes = await fetch(getApiUrl(`/api/report-processing/status/${sessionId}`))
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        if (!isCurrent()) return
        if (statusData.status === 'completed' && forceNew !== true) {
          setRunData(statusData)
          setRunId(statusData.run_id)
          setCurrentStage('completed')
          setActiveProcess({
            jobType: 'report_processing',
            sessionId,
            sessionTitle: cleanTitle,
            stageLabel: 'Draft ready for review',
            isCompleted: true,
            runId: statusData.run_id,
          })
          return
        }
        if (statusData.status === 'in_progress') {
          setRunData(statusData)
          setRunId(statusData.run_id)
          setCurrentStage(statusData.current_stage || 'ai_processing')
          setActiveProcess({
            jobType: 'report_processing',
            sessionId,
            sessionTitle: cleanTitle,
            stageLabel: 'AI Processing',
            isCompleted: false,
            runId: statusData.run_id,
          })
          if (pollTimerRef.current) clearInterval(pollTimerRef.current)
          pollTimerRef.current = setInterval(pollStatus, 1200)
          return
        }
      }

      if (!isCurrent()) return
      const res = await fetch(getApiUrl('/api/report-processing/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, force_new: forceNew === true }),
      })

      if (res.ok) {
        const data = await res.json()
        const current = isCurrent()
        const tracked = getActiveProcess()
        // An accepted server job survives its dialog. Do not displace a newer
        // session's tracked job when a delayed response arrives after navigation.
        if (current || !tracked || tracked.sessionId === sessionId) setActiveProcess({
          jobType: 'report_processing',
          sessionId,
          sessionTitle: cleanTitle,
          stageLabel: 'Preparing Transcript',
          isCompleted: false,
          runId: data.run_id,
          ...(!current ? { isMinimized: true } : {}),
        })
        if (!current) return
        setRunId(data.run_id)
        setCurrentStage(data.current_stage || 'preparing_transcript')

        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        pollTimerRef.current = setInterval(pollStatus, 1200)
      } else {
        const err = await res.json()
        if (!isCurrent()) return
        setErrorMsg(err.detail || 'Failed to start report processing')
        setCurrentStage('failed')
        clearActiveProcess()
      }
    } catch (e) {
      if (!isCurrent()) return
      setErrorMsg(`Failed to connect: ${e.message}`)
      setCurrentStage('failed')
      clearActiveProcess()
    }
  }, [sessionId, session, pollStatus])

  useEffect(() => {
    if (isOpen && sessionId) {
      if (startedSessionRef.current !== sessionId) {
        startedSessionRef.current = sessionId
        startProcessing()
      }
    } else {
      startedSessionRef.current = null
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [isOpen, sessionId, startProcessing])

  const handleCancel = async () => {
    if (!runId && !sessionId) {
      onClose()
      return
    }
    try {
      setIsCancelling(true)
      if (runId) {
        const res = await fetch(getApiUrl(`/api/report-processing/cancel/${runId}`), { method: 'POST' })
        if (!res.ok) throw new Error(`Cancellation could not be confirmed (${res.status}). Processing may still be running.`)
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      setCurrentStage('cancelled')
      setTimeout(() => {
        if (isMountedRef.current) onClose()
      }, 500)
    } catch (e) {
      setErrorMsg(e.message)
    } finally {
      setIsCancelling(false)
    }
  }

  if (!isOpen) return null

  const cleanTitle = getCleanSessionName(session)
  const sessionDate = formatDate(session?.date_created || session?.created_at)
  const sessionDuration = formatDuration(session?.duration_seconds || session?.duration)
  const sessionMinister = session?.minister || 'Minister not recorded'
  const activeStep = getActiveStepNumber()

  // -------------------------------------------------------------
  // FULL FLOATING MODAL MATCHING APPROVED REFERENCE IMAGE
  // -------------------------------------------------------------
  return (
    <div
      className="report-processing-modal-backdrop"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-processing-title"
    >
      <div className="report-processing-modal-card">
        {/* Top Controls: Minimize Button */}
        <div className="modal-card-top-controls">
          <button
            type="button"
            className="modal-minimize-btn"
            onClick={() => {
              minimizeActiveProcess()
              if (onClose) onClose()
            }}
            title="Minimize to background"
            aria-label="Minimize"
          >
            <MinimizeIcon />
          </button>
        </div>

        {/* Header Badge & Title Section */}
        <div className="report-processing-header-section">
          <div className="report-processing-badge-icon">
            <DocumentIconLarge />
          </div>
          <h2 id="report-processing-title" className="report-processing-title">
            Report Processing
          </h2>
          <div className="report-processing-session-title">
            {cleanTitle}
          </div>
          <div className="report-processing-metadata-row">
            <span>{sessionDate}</span>
            <span className="meta-separator">•</span>
            <span>{sessionDuration}</span>
            <span className="meta-separator">•</span>
            <span>{sessionMinister}</span>
          </div>
        </div>

        {/* 4-Stage Stepper Strip */}
        <div className="report-processing-stepper" role="progressbar" aria-label="Report processing stage" aria-valuetext={currentStage === 'failed' ? 'Processing failed' : currentStage === 'cancelled' ? 'Cancelled' : STEPS[activeStep - 1].label} aria-valuenow={activeStep} aria-valuemin="1" aria-valuemax="4">
          {STEPS.map((step, idx) => {
            const isCompleted = activeStep > step.id || currentStage === 'completed'
            const isCurrent = activeStep === step.id && currentStage !== 'completed'
            return (
              <React.Fragment key={step.id}>
                {idx > 0 && (
                  <div
                    className={`stepper-connector ${activeStep >= step.id ? 'stepper-connector--active' : ''}`}
                  />
                )}
                <div className={`stepper-step ${isCurrent ? 'stepper-step--active' : ''} ${isCompleted ? 'stepper-step--completed' : ''}`}>
                  <div className="stepper-circle">
                    {isCompleted ? <CheckIcon /> : step.id}
                  </div>
                  <span className="stepper-label">{step.label}</span>
                </div>
              </React.Fragment>
            )
          })}
        </div>

        {errorMsg && currentStage !== 'failed' && <p className="error-banner" role="alert">{errorMsg}</p>}

        {/* Stage-Specific Content */}
        {currentStage === 'failed' ? (
          <div className="report-processing-error-box" role="alert">
            <div className="error-title">Report Generation Failed</div>
            <div className="error-desc">{errorMsg || 'An unexpected error occurred during processing.'}</div>
            <div className="error-actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => startProcessing(true)}
              >
                Retry
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        ) : currentStage === 'completed' ? (
          <div className="report-processing-completed-box">
            <div className="completed-badge-icon">
              <CheckIcon />
            </div>
            <h3 className="completed-title">Draft ready for review</h3><p>Generation is complete. Human review and approval are required before export.</p>
            <div className="completed-actions-row">
              <button
                type="button"
                className="btn-process-view-report"
                onClick={() => {
                  onClose()
                  if (onViewReport) onViewReport(runData)
                }}
              >
                Review draft →
              </button>
            </div>
          </div>
        ) : currentStage === 'cancelled' ? (
          <p role="status">Cancellation confirmed. Saved source material remains preserved.</p>
        ) : currentStage === 'preparing_transcript' ? (
          /* Stage 1: Preparing Transcript — EXACTLY ONE status line with one indicator */
          <div className="report-processing-subtasks-card">
            <div className="report-processing-task-row">
              <span className="report-processing-blue-spinner" />
              <span className="report-processing-task-label">
                Preparing verified transcript and report instructions…
              </span>
            </div>
          </div>
        ) : currentStage === 'preparing_report' ? (
          /* Stage 3: Preparing Report — EXACTLY ONE status line with one indicator */
          <div className="report-processing-subtasks-card">
            <div className="report-processing-task-row">
              <span className="report-processing-blue-spinner" />
              <span className="report-processing-task-label">
                Validating and saving the report draft…
              </span>
            </div>
          </div>
        ) : (
          <div className="report-processing-subtasks-card">
            <div className="report-processing-task-row">
              <span className="report-processing-blue-spinner" />
              <span className="report-processing-task-label">Preparing the draft from the verified transcript…</span>
            </div>
            <p className="card-subtitle">The saved draft will require human review and approval.</p>
          </div>
        )}

        {/* Bottom Cancel Action */}
        {currentStage !== 'completed' && currentStage !== 'failed' && (
          <div className="report-processing-bottom-bar">
            <button
              type="button"
              className="btn-cancel-report-process"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Process'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

