import React, { useState, useRef } from 'react'
import { RawTranscriptViewer } from '../transcription/RawTranscriptViewer'
import { VerificationWorkflow } from '../verification/VerificationWorkflow'
import { ReportingView } from '../reporting/ReportingView'
import { EditingView } from '../editing/EditingView'
import { ProofreadingView } from '../proofreading/ProofreadingView'

export function SessionDetailView({
  session,
  onBack,
  onUpdateTitle,
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
    const pStatus = session?.proofreading_status || 'not_started'
    const eStatus = session?.editing_status || 'not_started'
    const rStatus = session?.reporting_status || 'not_started'

    if (pStatus === 'complete' || pStatus === 'ready_for_review' || pStatus === 'generating') {
      return 'proofreading'
    }
    if (eStatus === 'complete') {
      return 'proofreading'
    }
    if (eStatus === 'draft_ready' || eStatus === 'in_review' || eStatus === 'generating') {
      return 'editing'
    }
    if (rStatus === 'reports_ready') {
      return 'editing'
    }
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

  if (!session) return null

  // If user is currently in Reporting view, render ReportingView
  if (activeView === 'reporting') {
    return (
      <ReportingView
        session={session}
        onBack={() => setActiveView('overview')}
        onNavigateToEditing={() => setActiveView('editing')}
      />
    )
  }

  // If user is currently in Editing view, render EditingView
  if (activeView === 'editing') {
    return (
      <EditingView
        session={session}
        onBack={() => setActiveView('overview')}
        onNavigateToProofreading={() => setActiveView('proofreading')}
      />
    )
  }

  // If user is currently in Proofreading view, render ProofreadingView
  if (activeView === 'proofreading') {
    return (
      <ProofreadingView
        session={session}
        onBack={() => setActiveView('overview')}
        onNavigateToFinalReport={() => alert('Final Report stage will be implemented in Phase 9.')}
      />
    )
  }

  const formatSeconds = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00'
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const remMins = mins % 60
      return `${hours}h ${pad(remMins)}m ${pad(secs)}s`
    }
    return `${pad(mins)}:${pad(secs)}`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return 'Unknown Date'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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

  const handleJumpToTime = (seconds) => {
    if (mediaElementRef.current) {
      mediaElementRef.current.currentTime = seconds
      mediaElementRef.current.play().catch(() => {})
    }
  }

  // Verification, Reporting, Editing & Proofreading status
  const vStatus = session?.verification_status || 'not_started'
  const isVerified = vStatus === 'completed' || !!session?.verified_at || !!session?.verified_text
  const rStatus = session?.reporting_status || 'not_started'
  const eStatus = session?.editing_status || 'not_started'
  const pStatus = session?.proofreading_status || 'not_started'
  const hasAudio = session?.audio_filename || session?.recording_id
  const hasTranscript = session?.transcript_id || (session?.segment_count && session.segment_count > 0)

  return (
    <div className="session-detail-container">
      {/* Top Navigation & Title Bar */}
      <div className="session-detail-top-nav">
        <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
          ← Back to Sessions History
        </button>

        <div className="top-nav-right-actions">
          {pStatus === 'complete' ? (
            <button
              type="button"
              className="btn btn--success btn--small"
              onClick={() => setActiveView('proofreading')}
              id="btn-open-proofreading-top"
            >
              ✓ Proofreading Complete →
            </button>
          ) : eStatus === 'complete' ? (
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => setActiveView('proofreading')}
              id="btn-open-proofreading-top"
            >
              🔍 Open Proofreading Workspace →
            </button>
          ) : rStatus === 'reports_ready' ? (
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => setActiveView('editing')}
              id="btn-open-editing-top"
            >
              ⚡ Open Editing Workspace →
            </button>
          ) : isVerified ? (
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => setActiveView('reporting')}
              id="btn-open-reporting-top"
            >
              ⚡ Open Reporting Workspace →
            </button>
          ) : null}
          <span className="session-id-pill">ID: {session.session_id}</span>
        </div>
      </div>

      <div className="card session-detail-card">
        <div className="card-header session-detail-header">
          <div className="session-title-edit-row">
            {isEditingTitle ? (
              <div className="title-edit-form">
                <input
                  type="text"
                  className="form-control title-input"
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
                  {isSavingTitle ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => {
                    setEditedTitle(session.title || '')
                    setIsEditingTitle(false)
                  }}
                  disabled={isSavingTitle}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="title-display-group">
                <h2>{session.title || 'Untitled Session'}</h2>
                <button
                  type="button"
                  className="btn btn--outline btn--small edit-title-btn"
                  onClick={() => {
                    setEditedTitle(session.title || '')
                    setIsEditingTitle(true)
                  }}
                  title="Rename session title"
                >
                  ✏️ Edit Title
                </button>
              </div>
            )}
          </div>

          <div className="header-badges">
            {session.is_interrupted ? (
              <span className="badge badge--warning">⚠ Interrupted Session</span>
            ) : (
              <span className="badge badge--success">✓ Completed Session</span>
            )}
          </div>
        </div>

        <div className="card-body">
          {/* Workflow Stage Indicator */}
          <div className="workflow-stage-indicator">
            <div className={`workflow-stage ${hasAudio ? 'stage--done' : 'stage--pending'}`}>
              🔊 Audio {hasAudio ? '✓' : '⏳'}
            </div>
            <span className="workflow-arrow">→</span>
            <div className={`workflow-stage ${hasTranscript ? 'stage--done' : 'stage--pending'}`}>
              📝 Raw Transcript {hasTranscript ? '✓' : '⏳'}
            </div>
            <span className="workflow-arrow">→</span>
            <div
              className={`workflow-stage ${
                isVerified
                  ? 'stage--done'
                  : vStatus === 'in_progress'
                  ? 'stage--active'
                  : 'stage--pending'
              }`}
            >
              ✓ Verification{' '}
              {isVerified ? '✓' : vStatus === 'in_progress' ? '🔄' : '⏳'}
            </div>
            <span className="workflow-arrow">→</span>
            <div className={`workflow-stage ${isVerified ? 'stage--done' : 'stage--pending'}`}>
              📜 Verified Transcript {isVerified ? '✓' : '⏳'}
            </div>
            <span className="workflow-arrow">→</span>
            <div
              className={`workflow-stage ${
                rStatus === 'reports_ready'
                  ? 'stage--done'
                  : rStatus === 'generating'
                  ? 'stage--active'
                  : isVerified
                  ? 'stage--ready'
                  : 'stage--pending'
              }`}
              onClick={() => isVerified && setActiveView('reporting')}
              style={{ cursor: isVerified ? 'pointer' : 'default' }}
              title={isVerified ? 'Click to open Reporting Workspace' : 'Requires Verified Transcript'}
            >
              ⚡ Reporting{' '}
              {rStatus === 'reports_ready'
                ? '✓'
                : rStatus === 'generating'
                ? '🔄'
                : isVerified
                ? '●'
                : '⏳'}
            </div>
            <span className="workflow-arrow">→</span>
            <div
              className={`workflow-stage ${
                eStatus === 'complete'
                  ? 'stage--done'
                  : eStatus === 'generating' || eStatus === 'draft_ready' || eStatus === 'in_review'
                  ? 'stage--active'
                  : rStatus === 'reports_ready'
                  ? 'stage--ready'
                  : 'stage--future'
              }`}
              onClick={() => rStatus === 'reports_ready' && setActiveView('editing')}
              style={{ cursor: rStatus === 'reports_ready' ? 'pointer' : 'default' }}
              title={rStatus === 'reports_ready' ? 'Click to open Editing Workspace' : 'Requires Reporting stage completion'}
            >
              📄 Editing{' '}
              {eStatus === 'complete'
                ? '✓'
                : eStatus === 'generating'
                ? '🔄'
                : eStatus === 'draft_ready' || eStatus === 'in_review'
                ? '●'
                : rStatus === 'reports_ready'
                ? '⚡'
                : '○'}
            </div>
            <span className="workflow-arrow">→</span>
            <div
              className={`workflow-stage ${
                pStatus === 'complete'
                  ? 'stage--done'
                  : pStatus === 'generating' || pStatus === 'ready_for_review'
                  ? 'stage--active'
                  : eStatus === 'complete'
                  ? 'stage--ready'
                  : 'stage--future'
              }`}
              onClick={() => eStatus === 'complete' && setActiveView('proofreading')}
              style={{ cursor: eStatus === 'complete' ? 'pointer' : 'default' }}
              title={eStatus === 'complete' ? 'Click to open Proofreading Workspace' : 'Requires Editing stage completion'}
            >
              🔍 Proofreading{' '}
              {pStatus === 'complete'
                ? '✓'
                : pStatus === 'generating'
                ? '🔄'
                : pStatus === 'ready_for_review'
                ? '●'
                : eStatus === 'complete'
                ? '⚡'
                : '○'}
            </div>
            <span className="workflow-arrow">→</span>
            <div className="workflow-stage stage--future">
              🏆 Final Report ○
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="session-detail-meta-grid">
            <div className="meta-card">
              <span className="meta-label">Date & Time</span>
              <span className="meta-val">{formatDate(session.date_created)}</span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Total Duration</span>
              <span className="meta-val">
                {formatSeconds(session.duration_seconds || session.audio_duration_seconds)}
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Transcription Engine</span>
              <span className="meta-val">
                {session.provider_name === 'azure_speech'
                  ? 'Azure Speech (en-NG)'
                  : session.provider_name === 'faster_whisper'
                  ? 'Local Faster-Whisper'
                  : session.provider_name || 'Azure Speech'}
              </span>
            </div>

            <div className="meta-card">
              <span className="meta-label">Verification Status</span>
              <span
                className={`meta-val ${
                  vStatus === 'complete'
                    ? 'text--success'
                    : vStatus === 'in_progress'
                    ? 'text--warning'
                    : ''
                }`}
              >
                {vStatus === 'complete'
                  ? '✅ Verified'
                  : vStatus === 'in_progress'
                  ? `🔄 In Progress (${session.verification_items_resolved || 0}/${session.verification_items_total || 0})`
                  : session.flag_count > 0
                  ? `⚠️ ${session.flag_count} Items Flagged`
                  : '✓ 0 Flags'}
              </span>
            </div>
          </div>

          {/* Interruption Recovery Banner */}
          {session.is_interrupted ? (
            <div className="interruption-recovery-banner">
              <strong>ℹ️ Interruption Recovery Report:</strong>
              <p>{session.recovery_notes || 'This session ended unexpectedly and was safely recovered on application restart.'}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* If Proofreading is Complete, show prominent callout for Final Report */}
      {pStatus === 'complete' ? (
        <div className="reports-ready-banner" style={{ margin: '1rem 0', borderColor: 'var(--color-success, #22c55e)' }}>
          <div className="banner-text">
            <h4>✓ Proofreading Complete &amp; Ready for Final Report</h4>
            <p>The report has been verified, edited, and proofread. It is now ready for final review and document export.</p>
          </div>
          <button
            type="button"
            className="btn btn--success btn--large"
            onClick={() => setActiveView('proofreading')}
            id="btn-open-proofreading-overview"
          >
            ✓ View Proofread Report →
          </button>
        </div>
      ) : eStatus === 'complete' ? (
        <div className="reports-ready-banner" style={{ margin: '1rem 0' }}>
          <div className="banner-text">
            <h4>🔍 Edited Report Ready for AI Proofreading</h4>
            <p>The human-approved Edited Report is compiled and ready for conservative AI proofreading and Scripture checking.</p>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--large"
            onClick={() => setActiveView('proofreading')}
            id="btn-open-proofreading-overview"
          >
            🔍 Open Proofreading Workspace →
          </button>
        </div>
      ) : rStatus === 'reports_ready' ? (
        <div className="reports-ready-banner" style={{ margin: '1rem 0' }}>
          <div className="banner-text">
            <h4>⚡ Reporting Drafts Complete &amp; Ready for Editing</h4>
            <p>Reporter A (Structure) and Reporter B (Details) have generated independent drafts from the Verified Transcript.</p>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--large"
            onClick={() => setActiveView('editing')}
            id="btn-open-editing-overview"
          >
            ⚡ Open Editing Workspace →
          </button>
        </div>
      ) : null}

      {/* Phase 5: Verification Workflow */}
      {hasTranscript && (
        <VerificationWorkflow
          session={session}
          verificationState={verificationState}
          onStartVerification={onStartVerification}
          onLoadVerificationState={onLoadVerificationState}
          onResolveItem={onResolveVerificationItem}
          onAddItem={onAddVerificationItem}
          onConfirmAllRemaining={onConfirmAllRemaining}
          onFinalise={onFinaliseVerification}
          onConfirmRawAsVerified={onConfirmRawAsVerified}
          onPlaySegment={handleJumpToTime}
          onNavigateToReporting={() => setActiveView('reporting')}
        />
      )}

      {/* Embedded Raw Transcript & Audio Player */}
      <RawTranscriptViewer
        transcript={transcriptData}
        mediaElementRef={mediaElementRef}
        onJumpToTime={handleJumpToTime}
      />
    </div>
  )
}
