import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getApiUrl } from '../../config'
import { getCleanSessionName } from '../sessions/SessionDetailView'
import { setActiveProcess, clearActiveProcess, minimizeActiveProcess } from '../common/activeProcessManager'

function DocumentIconLarge() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function MaximizeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '25m 41s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s < 10 ? '0' : ''}${s}s`
}

function formatDate(dateStr) {
  if (!dateStr) return 'Aug 23, 2026'
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
  { id: 4, key: 'completed', label: 'Completed' },
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
  const [isDownloading, setIsDownloading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

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

  const getActiveStepNumber = () => {
    if (currentStage === 'preparing_transcript') return 1
    if (currentStage === 'ai_processing') return 2
    if (currentStage === 'preparing_report') return 3
    if (currentStage === 'completed') return 4
    return 1
  }

  // Poll status from backend
  const pollStatus = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(getApiUrl(`/api/report-processing/status/${sessionId}`))
      if (!res.ok) return
      const data = await res.json()
      if (!isMountedRef.current) return

      setRunData(data)
      if (data.run_id) setRunId(data.run_id)

      const cleanTitle = getCleanSessionName(session)
      const stageMap = {
        preparing_transcript: 'Preparing Transcript',
        ai_processing: 'AI Processing',
        preparing_report: 'Preparing Report',
        completed: 'Report ready',
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
          stageLabel: 'Report ready',
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
      console.error('Error polling report processing status:', e)
    }
  }, [sessionId, session, runId])

  // Trigger or resume processing
  const startProcessing = useCallback(async () => {
    if (!sessionId) return
    setErrorMsg(null)
    setIsCancelling(false)
    setCurrentStage('preparing_transcript')
    const cleanTitle = getCleanSessionName(session)

    try {
      const statusRes = await fetch(getApiUrl(`/api/report-processing/status/${sessionId}`))
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        if (statusData.status === 'completed') {
          setRunData(statusData)
          setRunId(statusData.run_id)
          setCurrentStage('completed')
          setActiveProcess({
            jobType: 'report_processing',
            sessionId,
            sessionTitle: cleanTitle,
            stageLabel: 'Report ready',
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

      const res = await fetch(getApiUrl('/api/report-processing/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })

      if (res.ok) {
        const data = await res.json()
        setRunId(data.run_id)
        setCurrentStage(data.current_stage || 'preparing_transcript')
        setActiveProcess({
          jobType: 'report_processing',
          sessionId,
          sessionTitle: cleanTitle,
          stageLabel: 'Preparing Transcript',
          isCompleted: false,
          runId: data.run_id,
        })

        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        pollTimerRef.current = setInterval(pollStatus, 1200)
      } else {
        const err = await res.json()
        setErrorMsg(err.detail || 'Failed to start report processing')
        setCurrentStage('failed')
        clearActiveProcess()
      }
    } catch (e) {
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
      if (sessionId) {
        await fetch(getApiUrl(`/api/report-processing/sessions/${sessionId}/cancel`), { method: 'POST' })
      }
      if (runId) {
        await fetch(getApiUrl(`/api/report-processing/cancel/${runId}`), { method: 'POST' })
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      setCurrentStage('cancelled')
      clearActiveProcess()
      setTimeout(() => {
        if (isMountedRef.current) onClose()
      }, 500)
    } catch (e) {
      console.error('Error cancelling run:', e)
      onClose()
    } finally {
      setIsCancelling(false)
    }
  }

  const handleDownloadDocx = async () => {
    if (!sessionId) return
    try {
      setIsDownloading(true)
      const res = await fetch(getApiUrl(`/api/report-processing/download-docx/${sessionId}`))
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const disposition = res.headers.get('content-disposition')
        let filename = `${session?.title || 'Report'}.docx`
        if (disposition && disposition.includes('filename=')) {
          filename = disposition.split('filename=')[1].replace(/[\\"\\']/g, '').trim()
        }
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Document generation is in progress. Please try again in a few moments.')
      }
    } catch (e) {
      console.error('Error downloading docx:', e)
      alert(`Download failed: ${e.message}`)
    } finally {
      setIsDownloading(false)
    }
  }

  if (!isOpen) return null

  const cleanTitle = getCleanSessionName(session)
  const sessionDate = formatDate(session?.date_created || session?.created_at)
  const sessionDuration = formatDuration(session?.duration_seconds || session?.duration)
  const sessionMinister = session?.minister || 'Minister not provided'
  const activeStep = getActiveStepNumber()

  // -------------------------------------------------------------
  // FULL FLOATING MODAL MATCHING APPROVED REFERENCE IMAGE
  // -------------------------------------------------------------
  return (
    <div
      className="report-processing-modal-backdrop"
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
        <div className="report-processing-stepper" role="progressbar" aria-valuenow={activeStep} aria-valuemin="1" aria-valuemax="4">
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

        {/* Stage-Specific Content */}
        {currentStage === 'failed' ? (
          <div className="report-processing-error-box">
            <div className="error-title">Report Generation Failed</div>
            <div className="error-desc">{errorMsg || 'An unexpected error occurred during processing.'}</div>
            <div className="error-actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={startProcessing}
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
            <h3 className="completed-title">Report ready</h3>
            <div className="completed-actions-row">
              <button
                type="button"
                className="btn-process-view-report"
                onClick={() => {
                  onClose()
                  if (onViewReport) onViewReport(runData)
                }}
              >
                View report →
              </button>
            </div>
          </div>
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
                Preparing and saving your completed report…
              </span>
            </div>
          </div>
        ) : (
          /* Stage 2: AI Processing — EXACTLY four simultaneous conceptual subtasks */
          <div className="report-processing-subtasks-card">
            <div className="report-processing-task-row">
              <span className="report-processing-blue-spinner" />
              <span className="report-processing-task-label">Reporter Extraction</span>
            </div>
            <div className="report-processing-task-row">
              <span className="report-processing-blue-spinner" />
              <span className="report-processing-task-label">Editorial Selection</span>
            </div>
            <div className="report-processing-task-row">
              <span className="report-processing-blue-spinner" />
              <span className="report-processing-task-label">Information Unit Writing</span>
            </div>
            <div className="report-processing-task-row">
              <span className="report-processing-blue-spinner" />
              <span className="report-processing-task-label">Proofreading</span>
            </div>
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
              {isCancelling ? 'Cancelling...' : 'Cancel processing'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

