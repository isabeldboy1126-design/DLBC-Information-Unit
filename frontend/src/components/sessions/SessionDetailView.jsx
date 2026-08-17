import React, { useState, useRef } from 'react'
import { RawTranscriptViewer } from '../transcription/RawTranscriptViewer'
import { VerificationWorkflow } from '../verification/VerificationWorkflow'

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
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(session?.title || '')
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const mediaElementRef = useRef(null)

  if (!session) return null

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

  // Verification status
  const vStatus = session.verification_status || 'not_started'
  const hasTranscript = !!(session.raw_text && session.raw_text.trim())
  const hasAudio = !!(session.audio_file_path || session.recording_id)

  return (
    <div className="session-detail-container">
      {/* Top Navigation & Title Bar */}
      <div className="session-detail-top-nav">
        <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
          ← Back to Sessions History
        </button>

        <span className="session-id-pill">ID: {session.session_id}</span>
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
              🔊 Audio {hasAudio ? '✅' : '⏳'}
            </div>
            <span className="workflow-arrow">→</span>
            <div className={`workflow-stage ${hasTranscript ? 'stage--done' : 'stage--pending'}`}>
              📝 Raw Transcript {hasTranscript ? '✅' : '⏳'}
            </div>
            <span className="workflow-arrow">→</span>
            <div
              className={`workflow-stage ${
                vStatus === 'complete'
                  ? 'stage--done'
                  : vStatus === 'in_progress'
                  ? 'stage--active'
                  : 'stage--pending'
              }`}
            >
              ✓ Verification{' '}
              {vStatus === 'complete' ? '✅' : vStatus === 'in_progress' ? '🔄' : '⏳'}
            </div>
            <span className="workflow-arrow">→</span>
            <div className="workflow-stage stage--future">
              📄 Editor <span className="stage-future-label">Phase 6</span>
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
