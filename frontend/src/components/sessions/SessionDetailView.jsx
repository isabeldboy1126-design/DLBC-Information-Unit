import React, { useState, useRef } from 'react'
import { RawTranscriptViewer } from '../transcription/RawTranscriptViewer'
import { VerificationWorkflow } from '../verification/VerificationWorkflow'
import { ReportingView } from '../reporting/ReportingView'
import { EditingView } from '../editing/EditingView'
import { ProofreadingView } from '../proofreading/ProofreadingView'
import { FinalReportView } from '../final_report/FinalReportView'
import { LifecycleStepper } from '../common/LifecycleStepper'

/**
 * SessionDetailView — Central Session Workspace Hub matching session-workspace.png.
 * 
 * Features:
 * - Session Identifier & Status Header with inline title editing.
 * - Authoritative 8-Stage Lifecycle Stepper.
 * - "Action Required" Hero Banner guiding the operator to the immediate next stage.
 * - 6 Artifact Tiles Grid (Audio, Raw Transcript, Verified Transcript, Reporter Drafts, Edited Report, Final Report)
 *   with lock logic, ready badges, and direct navigation triggers.
 * - Operational Incident Banner for interrupted sessions.
 * - "Future Stages" right roadmap sidebar explaining downstream milestones.
 * - Discrete child stage views for Raw Transcript, Verification, Verified Transcript, Reporting, Editing, Proofreading, and Final Report.
 */
export function SessionDetailView({
  session,
  onBack,
  onUpdateTitle,
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
}) {
  const getDefaultView = () => {
    const fStatus = session?.final_report_status || 'not_started'
    const pStatus = session?.proofreading_status || 'not_started'
    const eStatus = session?.editing_status || 'not_started'
    const rStatus = session?.reporting_status || 'not_started'
    const vStatus = session?.verification_status || 'not_started'

    if (fStatus === 'complete') return 'overview'
    if (pStatus === 'complete') return 'overview'
    if (pStatus === 'ready_for_review' || pStatus === 'generating') return 'proofreading'
    if (eStatus === 'complete') return 'overview'
    if (eStatus === 'draft_ready' || eStatus === 'in_review' || eStatus === 'generating') return 'editing'
    if (rStatus === 'reports_ready') return 'overview'
    if (vStatus === 'in_progress') return 'verification'
    return 'overview'
  }

  const [activeView, setActiveView] = useState(getDefaultView)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(session?.title || '')
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const mediaElementRef = useRef(null)

  // Synchronize activeView when opening a new session
  React.useEffect(() => {
    setActiveView(getDefaultView())
  }, [session?.session_id])

  // Inform parent AppShell about current subview title and back action
  React.useEffect(() => {
    if (!onSubViewChange) return
    const titles = {
      overview: 'Session Workspace',
      raw_transcript: 'Raw Transcript',
      verification: 'Verification',
      verified_transcript: 'Verified Transcript',
      reporting: 'Reporting',
      editing: 'Editing',
      proofreading: 'Proofreading',
      final_report: 'Final Report',
    }
    const title = titles[activeView] || 'Session Workspace'
    const backFn = activeView === 'overview' ? onBack : () => setActiveView('overview')
    onSubViewChange({ title, onBack: backFn })
  }, [activeView, onBack, onSubViewChange])

  if (!session) return null

  // ---------------------------------------------------------------------------
  // CHILD STAGE ROUTING
  // ---------------------------------------------------------------------------
  if (activeView === 'reporting') {
    return (
      <ReportingView
        session={session}
        onBack={() => setActiveView('overview')}
        onNavigateToEditing={() => setActiveView('editing')}
      />
    )
  }

  if (activeView === 'editing') {
    return (
      <EditingView
        session={session}
        onBack={() => setActiveView('overview')}
        onNavigateToProofreading={() => setActiveView('proofreading')}
      />
    )
  }

  if (activeView === 'proofreading') {
    return (
      <ProofreadingView
        session={session}
        onBack={() => setActiveView('overview')}
        onNavigateToFinalReport={() => setActiveView('final_report')}
      />
    )
  }

  if (activeView === 'final_report') {
    return (
      <FinalReportView
        session={session}
        onBack={() => setActiveView('overview')}
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

  const handleSaveTitle = async () => {
    if (!editedTitle.trim()) return
    setIsSavingTitle(true)
    const success = await onUpdateTitle(session.session_id, editedTitle.trim())
    setIsSavingTitle(false)
    if (success) {
      setIsEditingTitle(false)
    }
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
  const isVerified = vStatus === 'completed' || !!session?.verified_at || !!session?.verified_text
  const rStatus = session?.reporting_status || 'not_started'
  const eStatus = session?.editing_status || 'not_started'
  const pStatus = session?.proofreading_status || 'not_started'
  const fStatus = session?.final_report_status || 'not_started'
  const hasAudio = !!(session?.audio_filename || session?.recording_id)
  const hasTranscript = !!(session?.transcript_id || (session?.segment_count && session.segment_count > 0))
  const flagCount = session?.flag_count || 0

  // ---------------------------------------------------------------------------
  // VIEW: RAW TRANSCRIPT STANDALONE
  // ---------------------------------------------------------------------------
  if (activeView === 'raw_transcript') {
    return (
      <div className="session-subview-container">
        <div className="subview-header">
          <button type="button" className="btn btn--outline btn--small" onClick={() => setActiveView('overview')}>
            ← Back to Session Workspace
          </button>
        </div>
        <RawTranscriptViewer
          transcript={transcriptData}
          mediaElementRef={mediaElementRef}
          onJumpToTime={handleJumpToTime}
          onBeginVerification={() => {
            onStartVerification(session.session_id)
            setActiveView('verification')
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
        <div className="subview-header">
          <button type="button" className="btn btn--outline btn--small" onClick={() => setActiveView('overview')}>
            ← Back to Session Workspace
          </button>
        </div>
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
            setActiveView('overview')
          }}
          onConfirmRawAsVerified={async (sId) => {
            await onConfirmRawAsVerified(sId)
            setActiveView('overview')
          }}
          onPlaySegment={handleJumpToTime}
          onNavigateToReporting={() => setActiveView('reporting')}
          onFinishForNow={() => setActiveView('overview')}
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
        <div className="subview-header">
          <button type="button" className="btn btn--outline btn--small" onClick={() => setActiveView('overview')}>
            ← Back to Session Workspace
          </button>
        </div>
        <div className="card verified-transcript-card">
          <div className="verified-transcript-top-header">
            <div>
              <h2 className="verified-view-title">{session.title || 'Sunday Morning Worship Service'}</h2>
              <p className="verified-view-sub">
                Verified Transcript &bull; Created {formatDate(session.verified_at || session.date_created)} &bull; Verified by Operator Admin
              </p>
            </div>
            <div className="verified-top-actions">
              <button type="button" className="btn btn--outline" onClick={() => setActiveView('overview')}>
                Finish for Now
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setActiveView('reporting')}>
                Continue to Reporting →
              </button>
            </div>
          </div>

          <div className="verified-complete-banner">
            <span className="banner-check-icon">✓</span>
            <div>
              <strong>Verification Complete</strong>
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
                📜 View Raw Transcript
              </button>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => {
                  navigator.clipboard.writeText(session.verified_text || '')
                  alert('✓ Copied verified transcript text to clipboard!')
                }}
              >
                📋 Copy Full Transcript
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

  // ---------------------------------------------------------------------------
  // VIEW: SESSION WORKSPACE OVERVIEW HUB (session-workspace.png)
  // ---------------------------------------------------------------------------
  return (
    <div className="session-workspace-page-container">
      {/* 1. Header Bar: Identifier + Status + Sermon Title + Edit Title */}
      <div className="session-workspace-header">
        <div className="session-header-top-row">
          <div className="session-id-group">
            <span
              className={`session-status-badge ${
                fStatus === 'complete'
                  ? 'status--completed'
                  : pStatus === 'complete'
                  ? 'status--proofread'
                  : eStatus === 'complete'
                  ? 'status--edited'
                  : rStatus === 'reports_ready'
                  ? 'status--reported'
                  : isVerified
                  ? 'status--verified'
                  : 'status--verification'
              }`}
            >
              {fStatus === 'complete'
                ? '● COMPLETED'
                : pStatus === 'complete'
                ? '● PROOFREADING COMPLETE'
                : eStatus === 'complete'
                ? '● EDITING COMPLETE'
                : rStatus === 'reports_ready'
                ? '● REPORTS READY'
                : isVerified
                ? '● VERIFIED'
                : '● ACTIVE VERIFICATION'}
            </span>
          </div>

          <button
            type="button"
            className="btn btn--outline btn--small edit-details-btn"
            onClick={() => {
              setEditedTitle(session.title || '')
              setIsEditingTitle(!isEditingTitle)
            }}
          >
            ✏️ Edit Details
          </button>
        </div>

        {/* Title & Metadata Line */}
        {isEditingTitle ? (
          <div className="workspace-title-edit-box">
            <input
              type="text"
              className="form-control title-input-large"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={handleSaveTitle}
              disabled={isSavingTitle}
            >
              {isSavingTitle ? 'Saving...' : 'Save Title'}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => setIsEditingTitle(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <h1 className="session-workspace-title">{session.title || 'Sunday Morning Worship Service'}</h1>
        )}

        <div className="session-workspace-meta-line">
          <div className="meta-item">
            <span className="meta-icon">📅</span>
            <span>{formatDate(session.date_created)}</span>
          </div>
          {(session.metadata?.programme || session.metadata_json && JSON.parse(session.metadata_json || '{}').programme || session.metadata?.eventType || session.metadata_json && JSON.parse(session.metadata_json || '{}').eventType) && (
            <div className="meta-item">
              <span className="meta-icon">⛪</span>
              <span>{session.metadata?.programme || JSON.parse(session.metadata_json || '{}').programme || session.metadata?.eventType || JSON.parse(session.metadata_json || '{}').eventType}</span>
            </div>
          )}
          {(session.metadata?.programmeSession || session.metadata_json && JSON.parse(session.metadata_json || '{}').programmeSession) && (
            <div className="meta-item">
              <span className="meta-icon">📋</span>
              <span>{session.metadata?.programmeSession || JSON.parse(session.metadata_json || '{}').programmeSession}</span>
            </div>
          )}
          {(session.minister || (session.metadata?.minister || session.metadata_json && JSON.parse(session.metadata_json || '{}').minister)) && (
            <div className="meta-item">
              <span className="meta-icon">👤</span>
              <span>{session.minister || session.metadata?.minister || JSON.parse(session.metadata_json || '{}').minister}</span>
            </div>
          )}
          {(session.metadata?.messageTitle || session.metadata_json && JSON.parse(session.metadata_json || '{}').messageTitle) && (
            <div className="meta-item">
              <span className="meta-icon">📖</span>
              <span>{session.metadata?.messageTitle || JSON.parse(session.metadata_json || '{}').messageTitle}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Authoritative 8-Stage Lifecycle Stepper */}
      <LifecycleStepper
        session={session}
        activeStage={isVerified ? (rStatus === 'reports_ready' ? 'editing' : 'reporting') : 'verification'}
        onSelectStage={(stageId) => {
          if (stageId === 'raw_transcript') setActiveView('raw_transcript')
          else if (stageId === 'verification') setActiveView('verification')
          else if (stageId === 'verified_transcript') setActiveView('verified_transcript')
          else if (stageId === 'reporting') setActiveView('reporting')
          else if (stageId === 'editing') setActiveView('editing')
          else if (stageId === 'proofreading') setActiveView('proofreading')
          else if (stageId === 'final_report') setActiveView('final_report')
        }}
      />

      {/* 3. Action Hero Banner + 6 Artifact Tiles Grid */}
      <div className="workspace-main-column">
        {/* Action Required Hero Banner */}
        {!isVerified && flagCount > 0 ? (
          <div className="workspace-action-hero">
            <div className="action-hero-text">
              <div className="action-hero-badge">
                <span className="hero-alert-icon">⚠️</span>
                <span>ACTION REQUIRED</span>
              </div>
              <h2 className="action-hero-title">{flagCount} sections require human verification</h2>
              <p className="action-hero-desc">
                AI confidence below threshold. Review required before transcript finalization.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--action-hero"
              onClick={() => {
                onStartVerification(session.session_id)
                setActiveView('verification')
              }}
              id="btn-workspace-begin-verify"
            >
              <span>Begin Verification ({flagCount} pending blocks)</span>
              <span>→</span>
            </button>
          </div>
        ) : (isVerified || flagCount === 0) && rStatus !== 'reports_ready' ? (
          <div className="workspace-action-hero hero--reporting">
            <div className="action-hero-text">
              <h2 className="action-hero-title">
                {isVerified ? 'Verified Transcript Approved' : 'No Verification Required'}
              </h2>
              <p className="action-hero-desc">
                {isVerified
                  ? 'Ready to run dual independent Information Unit reporting drafts (Reporter A & B).'
                  : 'All transcript sections met high confidence thresholds. Ready to run Information Unit reporting drafts.'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--action-hero"
              onClick={async () => {
                if (!isVerified && flagCount === 0 && onConfirmRawAsVerified) {
                  await onConfirmRawAsVerified(session.session_id)
                }
                setActiveView('reporting')
              }}
              id="btn-workspace-go-to-reporting"
            >
              <span>Go to Reporting</span>
              <span>→</span>
            </button>
          </div>
        ) : rStatus === 'reports_ready' && eStatus !== 'complete' ? (
          <div className="workspace-action-hero hero--editing">
            <div className="action-hero-text">
              <h2 className="action-hero-title">Reporting Drafts Ready for Compilation</h2>
              <p className="action-hero-desc">
                Both Reporter A and B have finished. Synthesize and review the Edited Report.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--action-hero"
              onClick={() => setActiveView('editing')}
              id="btn-workspace-open-editing"
            >
              <span>Open Editing Workspace</span>
              <span>→</span>
            </button>
          </div>
        ) : eStatus === 'complete' && pStatus !== 'complete' ? (
          <div className="workspace-action-hero hero--proofreading">
            <div className="action-hero-text">
              <h2 className="action-hero-title">Edited Report Ready for Proofreading</h2>
              <p className="action-hero-desc">
                Run conservative AI proofreading and theological formatting check.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--action-hero"
              onClick={() => setActiveView('proofreading')}
              id="btn-workspace-open-proofreading"
            >
              <span>Open Proofreading Workspace</span>
              <span>→</span>
            </button>
          </div>
        ) : fStatus === 'complete' ? (
          <div className="workspace-action-hero hero--completed">
            <div className="action-hero-text">
              <div className="action-hero-badge">
                <span className="hero-alert-icon">🏆</span>
                <span>WORKFLOW COMPLETE</span>
              </div>
              <h2 className="action-hero-title">Final Message Report Ready</h2>
              <p className="action-hero-desc">
                The publication-ready message report is compiled. Download Word (.docx) or view final document.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--success btn--action-hero"
              onClick={() => setActiveView('final_report')}
              id="btn-workspace-open-final-report"
            >
              <span>Download Final Document (.docx)</span>
              <span>→</span>
            </button>
          </div>
        ) : null}

        {/* 6 Artifact Cards Grid (3 Columns) */}
        <div className="workspace-artifacts-grid">
          {/* Tile 1: Audio Recording */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <span className="tile-icon tile-icon--mic">◉</span>
              <span className="badge badge--success">✓ Saved</span>
            </div>
            <div className="artifact-tile-body">
              <h4 className="artifact-tile-title">Audio Recording</h4>
              <p className="artifact-tile-desc">Source Material ({formatSeconds(session.duration_seconds || session.audio_duration_seconds)})</p>
            </div>
            <button
              type="button"
              className="btn-tile-action"
              onClick={() => setActiveView('raw_transcript')}
            >
              ▶ Play Recording
            </button>
          </div>

          {/* Tile 2: Raw Transcript */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <span className="tile-icon">≡</span>
              <span className="badge badge--success">✓ Ready</span>
            </div>
            <div className="artifact-tile-body">
              <h4 className="artifact-tile-title">Raw Transcript</h4>
              <p className="artifact-tile-desc">Indexed &amp; Synced ({session.segment_count || 0} segments)</p>
            </div>
            <button
              type="button"
              className="btn-tile-action"
              onClick={() => setActiveView('raw_transcript')}
            >
              View Raw Transcript
            </button>
          </div>

          {/* Tile 3: Verified Transcript */}
          <div className={`card artifact-tile ${!isVerified ? 'artifact-tile--locked' : ''}`}>
            <div className="artifact-tile-header">
              <span className="tile-icon">✓</span>
              <span className={`badge ${isVerified ? 'badge--success' : 'badge--secondary'}`}>
                {isVerified ? '✓ Verified' : '⊘ Locked'}
              </span>
            </div>
            <div className="artifact-tile-body">
              <h4 className="artifact-tile-title">Verified Transcript</h4>
              <p className="artifact-tile-desc">{isVerified ? 'Approved Factual Record' : 'Human Review Required'}</p>
            </div>
            <button
              type="button"
              className="btn-tile-action"
              onClick={() => isVerified ? setActiveView('verified_transcript') : setActiveView('verification')}
            >
              {isVerified ? 'View Verified Transcript' : 'Begin Verification'}
            </button>
          </div>

          {/* Tile 4: Reporter Drafts */}
          <div className={`card artifact-tile ${rStatus !== 'reports_ready' && !isVerified && flagCount > 0 ? 'artifact-tile--locked' : ''}`}>
            <div className="artifact-tile-header">
              <span className="tile-icon">◈</span>
              <span className={`badge ${rStatus === 'reports_ready' ? 'badge--success' : (isVerified || flagCount === 0) ? 'badge--info' : 'badge--secondary'}`}>
                {rStatus === 'reports_ready' ? '✓ Ready' : (isVerified || flagCount === 0) ? '◎ Ready to Generate' : '⊘ Locked'}
              </span>
            </div>
            <div className="artifact-tile-body">
              <h4 className="artifact-tile-title">Reporter Drafts</h4>
              <p className="artifact-tile-desc">{rStatus === 'reports_ready' ? 'Reporter A & B Complete' : (isVerified || flagCount === 0) ? 'Ready for Reporting' : 'Verification Required'}</p>
            </div>
            <button
              type="button"
              className="btn-tile-action"
              onClick={async () => {
                if (!isVerified && flagCount === 0 && onConfirmRawAsVerified) {
                  await onConfirmRawAsVerified(session.session_id)
                }
                setActiveView('reporting')
              }}
              disabled={!isVerified && flagCount > 0}
            >
              {rStatus === 'reports_ready' ? 'View Reports' : (isVerified || flagCount === 0) ? 'Go to Reporting' : 'Reports Locked'}
            </button>
          </div>

          {/* Tile 5: Edited Report */}
          <div className={`card artifact-tile ${eStatus !== 'complete' && eStatus !== 'draft_ready' ? 'artifact-tile--locked' : ''}`}>
            <div className="artifact-tile-header">
              <span className="tile-icon">▤</span>
              <span className={`badge ${eStatus === 'complete' ? 'badge--success' : eStatus === 'draft_ready' ? 'badge--info' : 'badge--secondary'}`}>
                {eStatus === 'complete' ? '✓ Complete' : eStatus === 'draft_ready' ? '◎ Draft Ready' : '⊘ Locked'}
              </span>
            </div>
            <div className="artifact-tile-body">
              <h4 className="artifact-tile-title">Edited Report</h4>
              <p className="artifact-tile-desc">Theological Review</p>
            </div>
            <button
              type="button"
              className="btn-tile-action"
              onClick={() => rStatus === 'reports_ready' && setActiveView('editing')}
              disabled={rStatus !== 'reports_ready'}
            >
              {eStatus === 'complete' ? 'Open Editing' : rStatus === 'reports_ready' ? 'Compile Draft' : 'Editing Locked'}
            </button>
          </div>

          {/* Tile 6: Final Report */}
          <div className={`card artifact-tile ${fStatus !== 'complete' ? 'artifact-tile--locked' : ''}`}>
            <div className="artifact-tile-header">
              <span className="tile-icon">◇</span>
              <span className={`badge ${fStatus === 'complete' ? 'badge--success' : 'badge--secondary'}`}>
                {fStatus === 'complete' ? '✓ Final' : '⊘ Locked'}
              </span>
            </div>
            <div className="artifact-tile-body">
              <h4 className="artifact-tile-title">Final Report</h4>
              <p className="artifact-tile-desc">Archival &amp; Word (.docx)</p>
            </div>
            <button
              type="button"
              className="btn-tile-action"
              onClick={() => pStatus === 'complete' && setActiveView('final_report')}
              disabled={pStatus !== 'complete' && fStatus !== 'complete'}
            >
              {fStatus === 'complete' ? 'Download .docx' : pStatus === 'complete' ? 'Finalize Report' : 'Report Locked'}
            </button>
          </div>
        </div>

        {/* Operational Notice (if interrupted) */}
        {session.is_interrupted ? (
          <div className="workspace-operational-notice">
            <div className="notice-icon">ℹ️</div>
            <div className="notice-body">
              <strong>Operational Notice</strong>
              <p>{session.recovery_notes || 'Brief interruption recorded. Master lossless recording safely preserved.'}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
