import { ReportingView } from '../reporting/ReportingView'
import { EditingView } from '../editing/EditingView'
import { ProofreadingView } from '../proofreading/ProofreadingView'
import { isApproved, hasReviewableReport } from './sessionWorkflow'
import { Icon } from '../common/Icon'
import React, { useState, useRef, useEffect } from 'react'
import { getApiUrl } from '../../config'
import { RawTranscriptViewer } from '../transcription/RawTranscriptViewer'
import { VerificationWorkflow } from '../verification/VerificationWorkflow'
import { FinalReportView } from '../final_report/FinalReportView'
import { ReportProcessingModal } from '../reporting/ReportProcessingModal'

function MicIcon() { return <Icon name="mic" /> }

function DocumentIcon() { return <Icon name="document" /> }

function CalendarIcon() { return <Icon name="calendar" /> }

function UserIcon() { return <Icon name="user" /> }


function LockIcon() { return <Icon name="lock" /> }

function PencilIcon() { return <Icon name="pencil" /> }

export function getSessionHierarchy(session) {
  let programme = ''
  let sessionTitle = ''
  let preacher = session?.minister || ''

  if (session?.metadata_json) {
    try {
      const meta = typeof session.metadata_json === 'string' ? JSON.parse(session.metadata_json) : session.metadata_json
      programme = meta.programme || meta.eventType || ''
      sessionTitle = meta.programmeSession || meta.session_name || meta.messageTitle || ''
      if (!preacher && meta.minister) preacher = meta.minister
    } catch {}
  }
  if (!programme && session?.metadata?.programme) programme = session.metadata.programme
  if (!programme && session?.metadata?.eventType) programme = session.metadata.eventType
  if (!programme && session?.programme) programme = session.programme
  if (!programme && session?.programme_type) programme = session.programme_type

  const rawTitle = (session?.title || '').trim()

  if (!sessionTitle && rawTitle.includes('—')) {
    const parts = rawTitle.split('—').map((p) => p.trim())
    if (parts.length >= 2) {
      if (!programme) programme = parts[0]
      sessionTitle = parts.slice(1).join(' — ')
    }
  } else if (!sessionTitle && rawTitle.includes(' - ')) {
    const parts = rawTitle.split(' - ').map((p) => p.trim())
    if (parts.length >= 2) {
      if (!programme) programme = parts[0]
      sessionTitle = parts.slice(1).join(' - ')
    }
  }

  if (!sessionTitle) {
    sessionTitle = rawTitle || 'Untitled session'
  }
  if (!programme) {
    programme = 'Programme not recorded'
  }
  if (!preacher) {
    preacher = 'Minister not recorded'
  }

  return { programme, sessionTitle, preacher }
}

export function getCleanSessionName(session) {
  if (!session) return 'Untitled session'

  let raw = ''
  if (typeof session === 'string') {
    raw = session.trim()
  } else {
    raw = (session.session_name || session.session_title || session.title || '').trim()
  }

  // Deduplicate identical halves first: e.g. "Sunday Worship Service — Sunday Worship Service"
  const separators = ['—', '–', ' - ', ' \uFFFD ', '  ']
  for (const sep of separators) {
    if (raw.includes(sep)) {
      const parts = raw.split(sep).map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
        return parts[0]
      }
    }
  }

  const { programme, sessionTitle } = getSessionHierarchy(session)

  if (sessionTitle && !sessionTitle.startsWith('Recording') && !sessionTitle.endsWith('.wav')) {
    return sessionTitle
  }
  if (programme && !programme.startsWith('Recording') && !programme.endsWith('.wav')) {
    return programme
  }

  for (const sep of separators) {
    if (raw.includes(sep)) {
      const parts = raw.split(sep).map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 2) {
        if (parts[0].toLowerCase() === parts[1].toLowerCase()) {
          return parts[0]
        }
        if (!parts[1].startsWith('Recording') && !parts[1].endsWith('.wav')) {
          return parts[1]
        }
        if (!parts[0].startsWith('Recording') && !parts[0].endsWith('.wav')) {
          return parts[0]
        }
      }
    }
  }

  // Strip leading/trailing dash symbols or extra spaces
  raw = raw.replace(/^[-—–\s]+|[-—–\s]+$/g, '').trim()
  if (raw.startsWith('Recording') || raw.endsWith('.wav')) {
    return 'Sunday Worship Service'
  }

  return raw || 'Sunday Worship Service'
}

/**
 * SessionDetailView — Central Session Workspace Hub matching session-workspace.png.
 */
export function SessionDetailView({
  session,
  initialStage = 'overview',
  onBack,
  onUpdateTitle,
  onRefreshSession,
  onUpdateDetails,
  onSubViewChange,
  // Phase 5: Verification props
  verificationState,
  onStartVerification,
  onLoadVerificationState,
  onResolveVerificationItem,
  onAddVerificationItem,
  onConfirmAllRemaining,
  onFinaliseVerification,
  onConfirmRawAsVerified,
  // Navigation props
  onNavigateStage,
  verificationProcessing,
  onTriggerVerificationProcessing,
  onCloseVerificationProcessing,
}) {
  const getDefaultView = () => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#\/?/, '').trim()
      if (hash.startsWith('session/')) {
        const parts = hash.split('/')
        if (parts[2]) return parts[2]
      }
      if (hash === 'session_workspace') return 'overview'
      if (hash === 'verification_workspace') return 'verification'
    }

    if (initialStage === 'report_processing') {
      return 'overview'
    }
    if (initialStage) {
      return initialStage
    }

      const vStatus = session?.verification_status || 'not_started'

    if (hasReviewableReport(session)) return 'overview'
    if (vStatus === 'in_progress') return 'verification'
    return 'overview'
  }

  const [activeView, setActiveView] = useState(getDefaultView)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [showReportProcessingModal, setShowReportProcessingModal] = useState(() => {
    return initialStage === 'report_processing' || (typeof window !== 'undefined' && window.location.hash.includes('/report_processing'))
  })
  const mediaElementRef = useRef(null)

  const changeStage = (newStage) => {
    setActiveView(newStage)
    if (onNavigateStage) {
      onNavigateStage(newStage)
    }
  }

  // Synchronize activeView when opening a new session or changing initialStage or hash route
  useEffect(() => {
    setActiveView(getDefaultView())
    if (initialStage === 'report_processing' || (typeof window !== 'undefined' && window.location.hash.includes('/report_processing'))) {
      setShowReportProcessingModal(true)
    }
    const handleHash = () => {
      setActiveView(getDefaultView())
      if (window.location.hash.includes('/report_processing')) {
        setShowReportProcessingModal(true)
      }
    }
    window.addEventListener('hashchange', handleHash)
    window.addEventListener('popstate', handleHash)
    return () => {
      window.removeEventListener('hashchange', handleHash)
      window.removeEventListener('popstate', handleHash)
    }
  }, [session?.session_id, initialStage])

  // Inform parent AppShell about current subview title and back action
  React.useEffect(() => {
    if (!onSubViewChange) return
    const titles = {
      overview: 'Session Workspace',
      raw_transcript: 'Raw Transcript',
      verification: 'Verification',
      verified_transcript: 'Verified Transcript',
      reporting: 'Reporter Drafts',
      editing: 'Editing',
      proofreading: 'Proofreading',
      final_report: 'Final Review',
    }
    const title = titles[activeView] || 'Session Workspace'
    const backFn = activeView === 'overview' ? onBack : () => changeStage('overview')
    onSubViewChange({ title, onBack: backFn })
  }, [activeView, onBack, onSubViewChange])

  if (!session) {
    return (
      <div className="session-workspace-loading-state" role="status" aria-live="polite">
        <div className="session-loading-spinner" />
        <p className="session-loading-text">Loading session workspace…</p>
        <button type="button" className="btn btn--outline btn--small" onClick={onBack}>
          ← Back to Sessions
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // CHILD STAGE ROUTING
  // ---------------------------------------------------------------------------
  if (activeView === 'reporting') return <ReportingView session={session} onBack={() => changeStage('overview')} onNavigateToEditing={() => changeStage('editing')} />
  if (activeView === 'editing') return <EditingView session={session} onBack={() => changeStage('overview')} onNavigateToProofreading={() => changeStage('proofreading')} />
  if (activeView === 'proofreading') return <ProofreadingView session={session} onBack={() => changeStage('overview')} onNavigateToFinalReport={() => changeStage('final_report')} />
  if (activeView === 'final_report') {
    return (
      <FinalReportView
        session={session}
        onReportUpdated={onRefreshSession}
        onBack={() => changeStage('overview')}
      />
    )
  }

  // Formatting helpers
  const formatSeconds = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00:00'
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (hours > 0) {
      return `${hours}h ${pad(mins)}m ${pad(secs)}s`
    }
    return `${pad(mins)}:${pad(secs)}`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return isoStr
    }
  }

  const handleSaveDetails = async (details) => {
    if (onUpdateDetails) {
      return await onUpdateDetails(session.session_id, details)
    }
    return false
  }

  const handleJumpToTime = (seconds) => {
    if (mediaElementRef.current) {
      mediaElementRef.current.currentTime = seconds
      mediaElementRef.current.play().catch(() => {})
    }
  }

  // Construct transcript object for RawTranscriptViewer
  const transcriptData = {
    transcript_id: session.transcript_id || `tr_${session.recording_id || session.session_id}`,
    recording_id: session.recording_id || session.session_id,
    upload_id: session.recording_id || session.session_id,
    original_filename: session.audio_filename || `${session.session_id}.wav`,
    saved_filename: session.audio_filename || `${session.session_id}.wav`,
    duration_seconds: session.duration_seconds || session.audio_duration_seconds,
    provider_name: session.provider_name || 'azure_speech',
    raw_text: session.raw_text || (session.segments ? session.segments.map((s) => s.text).join(' ') : ''),
    segments: session.segments || [],
    created_at: session.date_created,
  }

  // Lifecycle stage statuses
  const vStatus = session?.verification_status || 'not_started'
  const hasTranscript = !!(session?.transcript_id || (session?.segment_count && session.segment_count > 0))
  const flagCount = session?.flag_count || session?.verification_items_total || 0
  const resolvedCount = session?.verification_items_resolved ?? verificationState?.resolved_count ?? 0
  const isVerified =
    vStatus === 'completed' ||
    vStatus === 'complete' ||
    !!session?.verified_at ||
    !!session?.verified_text ||
    (flagCount === 0 && hasTranscript && session?.status !== 'recording') ||
    (resolvedCount >= flagCount && flagCount > 0)
  const rStatus = session?.reporting_status || 'not_started'
  const eStatus = session?.editing_status || 'not_started'
  const pStatus = session?.proofreading_status || 'not_started'

  // ---------------------------------------------------------------------------
  // VIEW: RAW TRANSCRIPT STANDALONE
  // ---------------------------------------------------------------------------
  if (activeView === 'raw_transcript') {
    return (
      <div className="session-subview-container">
        <RawTranscriptViewer
          transcript={transcriptData}
          mediaElementRef={mediaElementRef}
          onJumpToTime={handleJumpToTime}
          onBeginVerification={() => {
            onStartVerification(session.session_id)
            changeStage('verification')
          }}
          flagCount={flagCount}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // VIEW: VERIFICATION WORKSPACE STANDALONE
  // ---------------------------------------------------------------------------
  if (activeView === 'verification') {
    return (
      <div className="session-subview-container">
        <VerificationWorkflow
          session={session}
          verificationState={verificationState}
          onStartVerification={onStartVerification}
          onLoadVerificationState={onLoadVerificationState}
          onResolveItem={onResolveVerificationItem}
          onAddItem={onAddVerificationItem}
          onConfirmAllRemaining={onConfirmAllRemaining}
          onFinalise={async (sId) => {
            await onFinaliseVerification(sId)
            changeStage('overview')
          }}
          onConfirmRawAsVerified={async (sId) => {
            await onConfirmRawAsVerified(sId)
            changeStage('overview')
          }}
          onPlaySegment={handleJumpToTime}
          onNavigateToReporting={() => {
            changeStage('overview')
            setShowReportProcessingModal(true)
          }}
          onFinishForNow={() => changeStage('overview')}
          isProcessingProp={verificationProcessing}
          onTriggerProcessing={onTriggerVerificationProcessing}
          onCloseProcessing={onCloseVerificationProcessing}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // VIEW: VERIFIED TRANSCRIPT STANDALONE
  // ---------------------------------------------------------------------------
  if (activeView === 'verified_transcript') {
    return (
      <div className="session-subview-container">
        <div className="card verified-transcript-card">
          <div className="verified-transcript-top-header">
            <div>
              <h2 className="verified-view-title">{session.title || 'Sunday Morning Worship Service'}</h2>
              <p className="verified-view-sub">
                Verified Transcript &bull; Created {formatDate(session.verified_at || session.date_created)} &bull; Human verification recorded
              </p>
            </div>
            <div className="verified-top-actions">
              <button type="button" className="btn btn--outline" onClick={() => changeStage('overview')}>
                Finish for Now
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setShowReportProcessingModal(true)}>
                Process with AI →
              </button>
            </div>
          </div>

          <div className="verified-complete-banner">
            <span className="banner-check-icon">✓</span>
            <div>
              <strong>Transcript verified</strong>
              <p>This transcript is now the approved factual source for Information Unit Reporting and Editing.</p>
            </div>
          </div>

          <div className="verified-body-box">
            <div className="verified-body-toolbar">
              <button
                type="button"
                className="btn-link-small"
                onClick={() => setActiveView('raw_transcript')}
              >
                 View Raw Transcript
              </button>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => {
                  navigator.clipboard.writeText(session.verified_text || '')
                  alert('✓ Copied verified transcript text to clipboard!')
                }}
              >
                 Copy Full Transcript
              </button>
            </div>

            <div className="verified-text-canvas">
              <p className="verified-continuous-text">
                {session.verified_text || session.raw_text || 'Verified transcript text.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Extract clean hierarchy and metadata
  const { programme: progDisplay, sessionTitle: sessionDisplay, preacher: preacherDisplay } = getSessionHierarchy(session)
  const durationSec = session.duration_seconds || session.audio_duration_seconds || 0
  const durationDisplay = durationSec > 0 ? formatSeconds(durationSec) : 'Not recorded'
  const dateDisplay = formatDate(session.date_created)

  // ---------------------------------------------------------------------------
  // VIEW: SESSION WORKSPACE OVERVIEW HUB (session-workspace.png)
  // ---------------------------------------------------------------------------
  return (
    <div className="session-workspace-page-container">
      {/* 1. Header Bar: Programme (muted, secondary) + Session Title (dominant) + Meta line */}
      <div className="session-workspace-header">
        <div className="session-workspace-header-content">
          <div className="session-programme-eyebrow">{progDisplay}</div>

          <div className="session-title-row">
            <h1 className="session-dominant-title">{sessionDisplay}</h1>

            <button
              type="button"
              className="btn-workspace-edit-details"
              onClick={() => setIsEditModalOpen(true)}
              title="Edit session details"
            >
              <PencilIcon />
              <span>Edit Details</span>
            </button>
          </div>

          <div className="session-workspace-meta-line">
            <span className="session-meta-item">
              <CalendarIcon />
              <span>{dateDisplay}</span>
            </span>
            <span className="session-meta-item">
              <UserIcon />
              <span>{preacherDisplay}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Verification Action Strip (floating white card matching reference design) */}
      {(() => {
        const isSessionVerified = isVerified
        const hasFinalDoc = (hasReviewableReport(session)) || session?.final_report_id || session?.docx_file_path || session?.report_processing_status === 'completed'

        if (!isSessionVerified && flagCount > 0) {
          const remaining = Math.max(0, flagCount - resolvedCount)
          return (
            <div className="verification-action-strip">
              <div className="verification-strip-left">
                <div className="verification-strip-icon-box" aria-hidden="true">
                  <DocumentIcon />
                </div>
                <span className="verification-strip-text">
                  {remaining > 0 ? `${remaining} sections need verification` : `${flagCount} sections need verification`}
                </span>
              </div>
              <button
                type="button"
                className="btn-verify-cta"
                onClick={() => {
                  onStartVerification(session.session_id)
                  changeStage('verification')
                }}
                id="btn-workspace-begin-verify"
              >
                Verify →
              </button>
            </div>
          )
        }

        if (isSessionVerified) {
          if (hasFinalDoc) {
            return (
              <div className="verification-action-strip">
                <div className="verification-strip-left">
                  <div className="verification-strip-icon-box" aria-hidden="true">
                    <DocumentIcon />
                  </div>
                  <span className="verification-strip-text">
                    {isApproved(session) ? 'Approved report' : 'Draft needs human review'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-verify-cta"
                  onClick={() => changeStage('final_report')}
                  id="btn-workspace-download-doc"
                >
                  Review report
                </button>
              </div>
            )
          }

          return (
            <div className="verification-action-strip">
              <div className="verification-strip-left">
                <div className="verification-strip-icon-box" aria-hidden="true">
                  <DocumentIcon />
                </div>
                <span className="verification-strip-text">
                  Transcript verified
                </span>
              </div>
              <button
                type="button"
                className="btn-verify-cta"
                onClick={() => setShowReportProcessingModal(true)}
                id="btn-workspace-process-ai"
              >
                Process with AI →
              </button>
            </div>
          )
        }

        return null
      })()}

      <nav className="stage-review-navigation" aria-label="Report review stages">
        <span className="editorial-eyebrow">REVIEW TOOLS</span>
        <button className="btn btn--secondary" disabled={!isVerified} onClick={() => changeStage('reporting')}>Reporter drafts</button>
        <button className="btn btn--secondary" disabled={eStatus === 'not_started' && rStatus !== 'reports_ready'} onClick={() => changeStage('editing')}>Editing</button>
        <button className="btn btn--secondary" disabled={eStatus !== 'complete' && pStatus === 'not_started'} onClick={() => changeStage('proofreading')}>Proofreading</button>
        <button className="btn btn--secondary" disabled={!hasReviewableReport(session) && pStatus !== 'complete'} onClick={() => changeStage('final_report')}>Final review</button>
      </nav>
      {/* 4. Session Materials Section (6 Artifact Cards) */}
      <section className="session-materials-section" aria-label="Session Materials">
        <h2 className="session-materials-heading">Session Materials</h2>

        <div className="workspace-artifacts-grid">
          {/* Tile 1: Audio Recording */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <MicIcon />
              </div>
              <span className="badge badge--success-pill">✓ Saved</span>
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Audio Recording</h3>
              <p className="artifact-tile-desc">{durationDisplay}</p>
            </div>
            <button
              type="button"
              className="btn-tile-action btn-tile-action--active"
              onClick={() => changeStage('raw_transcript')}
            >
              ▶ Play Recording
            </button>
          </div>

          {/* Tile 2: Raw Transcript */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              <span className="badge badge--success-pill">✓ Ready</span>
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Raw Transcript</h3>
              <p className="artifact-tile-desc">{session.segment_count || 267} segments</p>
            </div>
            <button
              type="button"
              className="btn-tile-action btn-tile-action--active"
              onClick={() => changeStage('raw_transcript')}
            >
              View Raw Transcript
            </button>
          </div>

          {/* Tile 3: Verified Transcript */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {isVerified ? (
                <span className="badge badge--success-pill">✓ Verified</span>
              ) : (
                <span className="badge badge--neutral-pill">● Pending</span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Verified Transcript</h3>
              <p className="artifact-tile-desc">
                {isVerified ? 'Approved Factual Record' : 'Human verification required'}
              </p>
            </div>
            {isVerified ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('verified_transcript')}
              >
                View Verified Transcript
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
              >
                <LockIcon />
                <span>Will be available after verification</span>
              </button>
            )}
          </div>

          {/* Tile 4: Reporter Drafts */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {rStatus === 'reports_ready' ? (
                <span className="badge badge--success-pill">✓ Ready</span>
              ) : (
                <span className="badge badge--locked-pill">
                  <LockIcon /> Locked
                </span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Reporter Drafts</h3>
              <p className="artifact-tile-desc">
                {rStatus === 'reports_ready' ? 'Reporter A & B drafts saved' : 'Not yet available'}
              </p>
            </div>
            {rStatus === 'reports_ready' ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('reporting')}
              >
                Review drafts
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
              >
                <LockIcon />
                <span>Will be available after processing</span>
              </button>
            )}
          </div>

          {/* Tile 5: Edited Report */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {['draft_ready', 'complete', 'completed'].includes(eStatus) ? (
                <span className="badge badge--success-pill">Draft saved</span>
              ) : (
                <span className="badge badge--locked-pill">
                  <LockIcon /> Locked
                </span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Edited Report</h3>
              <p className="artifact-tile-desc">
                {['draft_ready', 'complete', 'completed'].includes(eStatus) ? 'Saved edited revision' : 'Not yet available'}
              </p>
            </div>
            {['draft_ready', 'complete', 'completed'].includes(eStatus) ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('editing')}
              >
                Review edited draft
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
              >
                <LockIcon />
                <span>Will be available after processing</span>
              </button>
            )}
          </div>

          {/* Tile 6: Final Report */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {hasReviewableReport(session) ? (
                <span className="badge badge--success-pill">{isApproved(session) ? 'Approved' : 'Needs review'}</span>
              ) : (
                <span className="badge badge--locked-pill">
                  <LockIcon /> Locked
                </span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Final Report</h3>
              <p className="artifact-tile-desc">
                {hasReviewableReport(session) ? (isApproved(session) ? 'Approved • Word (.docx)' : 'Draft • human review required') : 'Not yet available'}
              </p>
            </div>
            {hasReviewableReport(session) ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('final_report')}
              >
                Review report
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
              >
                <LockIcon />
                <span>Will be available in this stage</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Operational Notice (if interrupted) */}
      {session.is_interrupted ? (
        <div className="workspace-operational-notice">
          <div className="notice-icon">ℹ</div>
          <div className="notice-body">
            <strong>Operational Notice</strong>
            <p>{session.recovery_notes || 'Brief interruption recorded. Master lossless recording safely preserved.'}</p>
          </div>
        </div>
      ) : null}

      {/* 5. Centered Floating Dialog for Editing Session Details */}
      <EditSessionDetailsModal
        isOpen={isEditModalOpen}
        session={session}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveDetails}
      />

      {/* 6. Stage 7 Unified Report Processing Modal */}
      <ReportProcessingModal
        isOpen={showReportProcessingModal}
        session={session}
        onClose={() => setShowReportProcessingModal(false)}
        onViewReport={() => changeStage('final_report')}
        onProcessingComplete={() => {
          onRefreshSession?.()
        }}
      />
    </div>
  )
}

/**
 * EditSessionDetailsModal — Centered floating dialog for editing:
 * (1) Event / Programme
 * (2) Session / Section (cascading dependency)
 * (3) Pastor / Minister
 * Persists immediately via onSave, without refresh. No start/stop timestamps.
 */
function EditSessionDetailsModal({ isOpen, session, onClose, onSave }) {
  const { programme: initialProg, sessionTitle: initialSess, preacher: initialPreacher } = getSessionHierarchy(session)
  const [programmes, setProgrammes] = useState([])
  const [selectedProgramme, setSelectedProgramme] = useState(initialProg)
  const [customProgramme, setCustomProgramme] = useState('')
  const [selectedSession, setSelectedSession] = useState(initialSess)
  const [customSession, setCustomSession] = useState('')
  const [minister, setMinister] = useState(initialPreacher)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    let isMounted = true
    async function loadProgrammes() {
      try {
        const res = await fetch(getApiUrl('/api/programmes?include_archived=false'))
        if (res.ok && isMounted) {
          const data = await res.json()
          setProgrammes(data)
        }
      } catch (err) {
        console.error('Failed to load programmes in EditSessionDetailsModal:', err)
      }
    }
    loadProgrammes()
    return () => { isMounted = false }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setSelectedProgramme(initialProg)
      setSelectedSession(initialSess)
      setMinister(initialPreacher)
      setCustomProgramme('')
      setCustomSession('')
      setErrorMsg(null)
    }
  }, [isOpen, initialProg, initialSess, initialPreacher])

  if (!isOpen) return null

  const matchedProg = programmes.find((p) => p.name === selectedProgramme || p.id === selectedProgramme)
  const activeSessions = (matchedProg?.sessions || []).filter((s) => !s.is_archived)

  const handleProgrammeChange = (val) => {
    setSelectedProgramme(val)
    if (val === '__none__') {
      return
    }
    if (val === '__custom__') {
      setSelectedSession('__custom__')
      return
    }
    const found = programmes.find((p) => p.name === val || p.id === val)
    const progSessions = (found?.sessions || []).filter((s) => !s.is_archived)
    if (progSessions.length > 0) {
      setSelectedSession(progSessions[0].name)
    } else {
      setSelectedSession('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)

    const finalProgramme = selectedProgramme === '__none__'
      ? ''
      : selectedProgramme === '__custom__'
      ? customProgramme.trim()
      : selectedProgramme.trim()
    const finalSession = selectedSession === '__custom__'
      ? customSession.trim()
      : selectedSession.trim()
    const finalMinister = minister.trim()

    if (selectedProgramme !== '__none__' && !finalProgramme) {
      setErrorMsg('Please select or specify an Event / Programme.')
      return
    }
    if (!finalSession) {
      setErrorMsg('Please select or enter a Session / Section name.')
      return
    }

    try {
      setIsSaving(true)
      const success = await onSave({
        programme: finalProgramme,
        sessionTitle: finalSession,
        minister: finalMinister,
      })
      if (success) {
        onClose()
      } else {
        setErrorMsg('Failed to update session details. Please try again.')
      }
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="edit-details-title">
      <div className="modal-container modal-container--edit-details" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 id="edit-details-title" className="modal-title">Edit Session Details</h2>
            <p className="modal-subtitle">Update event metadata, session classification, and minister</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-details-form">
          {errorMsg && (
            <div className="edit-details-error-banner" role="alert">
              {errorMsg}
            </div>
          )}

          {/* 1. Event / Programme (Optional / Standalone) */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-event-select">
              Event / Programme <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.85em' }}>(Optional)</span>
            </label>
            <select
              id="edit-event-select"
              className="form-control"
              value={
                selectedProgramme === '__none__' || !selectedProgramme
                  ? '__none__'
                  : programmes.some((p) => p.name === selectedProgramme)
                  ? selectedProgramme
                  : selectedProgramme === '__custom__'
                  ? '__custom__'
                  : selectedProgramme
              }
              onChange={(e) => handleProgrammeChange(e.target.value)}
            >
              <option value="__none__">[ None / Standalone ]</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
              {selectedProgramme &&
                selectedProgramme !== '__none__' &&
                selectedProgramme !== '__custom__' &&
                !programmes.some((p) => p.name === selectedProgramme) && (
                  <option value={selectedProgramme}>{selectedProgramme} (Current)</option>
              )}
              <option value="__custom__">+ Custom Event / Programme...</option>
            </select>
          </div>

          {selectedProgramme === '__custom__' && (
            <div className="form-group form-group--nested">
              <label className="form-label" htmlFor="edit-custom-event-input">
                Custom Event Name <span className="form-required">*</span>
              </label>
              <input
                id="edit-custom-event-input"
                type="text"
                className="form-control"
                placeholder="e.g. Special Ministers Conference"
                value={customProgramme}
                onChange={(e) => setCustomProgramme(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}

          {/* 2. Session / Section (Cascading) */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-session-select">
              Session / Section <span className="form-required">*</span>
            </label>
            {activeSessions.length > 0 && selectedProgramme !== '__custom__' ? (
              <select
                id="edit-session-select"
                className="form-control"
                value={
                  activeSessions.some((s) => s.name === selectedSession)
                    ? selectedSession
                    : selectedSession === '__custom__'
                    ? '__custom__'
                    : selectedSession || ''
                }
                onChange={(e) => setSelectedSession(e.target.value)}
                required
              >
                <option value="" disabled>Select a Session / Section...</option>
                {activeSessions.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
                {selectedSession && !activeSessions.some((s) => s.name === selectedSession) && selectedSession !== '__custom__' && (
                  <option value={selectedSession}>{selectedSession} (Current)</option>
                )}
                <option value="__custom__">+ Custom Session Name...</option>
              </select>
            ) : (
              <input
                id="edit-session-input"
                type="text"
                className="form-control"
                placeholder="e.g. Sunday Morning Worship Service"
                value={selectedSession === '__custom__' ? customSession : selectedSession}
                onChange={(e) => {
                  setSelectedSession(e.target.value)
                  setCustomSession(e.target.value)
                }}
                required
              />
            )}
          </div>

          {selectedSession === '__custom__' && activeSessions.length > 0 && selectedProgramme !== '__custom__' && (
            <div className="form-group form-group--nested">
              <label className="form-label" htmlFor="edit-custom-session-input">
                Custom Session Name <span className="form-required">*</span>
              </label>
              <input
                id="edit-custom-session-input"
                type="text"
                className="form-control"
                placeholder="e.g. Day 2 Morning Impartation"
                value={customSession}
                onChange={(e) => setCustomSession(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}

          {/* 3. Pastor / Minister */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-minister-input">
              Pastor / Minister
            </label>
            <input
              id="edit-minister-input"
              type="text"
              className="form-control"
              placeholder="e.g. Pastor W.F. Kumuyi"
              value={minister}
              onChange={(e) => setMinister(e.target.value)}
            />
          </div>

          <div className="modal-actions edit-details-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isSaving}
            >
              {isSaving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
