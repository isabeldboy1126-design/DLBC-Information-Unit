import { Icon } from '../common/Icon'
import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl, authFetch } from '../../config'
import { getSessionHierarchy } from '../sessions/SessionDetailView'
import { ConfirmationModal } from '../common/ConfirmationModal'
import { SessionCompletionView } from '../sessions/SessionCompletionView'
import { setActiveProcess } from '../common/activeProcessManager'

/**
 * VerificationWorkflow — Human verification workspace matching verification-workspace.png.
 */
export function VerificationWorkflow({
  session,
  verificationState,
  onStartVerification,
  onLoadVerificationState,
  onResolveItem,
  onAddItem,
  onConfirmAllRemaining,
  onFinalise,
  onConfirmRawAsVerified,
  onPlaySegment,
  onNavigateToReporting,
  onFinishForNow,
  isProcessingProp,
  onTriggerProcessing,
  onCloseProcessing,
}) {
  const [filter, setFilter] = useState('pending') // 'pending' | 'resolved' | 'all'
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [editedText, setEditedText] = useState('')
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false)
  const [showProcessingScreen, setShowProcessingScreen] = useState(false)
  const [isAiVerifying, setIsAiVerifying] = useState(false)
  const [aiFeedback, setAiFeedback] = useState(null)
  const [isBulkConfirming, setIsBulkConfirming] = useState(false)
  const [showFinaliseModal, setShowFinaliseModal] = useState(false)
  const [isFinalising, setIsFinalising] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayingSegment, setIsPlayingSegment] = useState(false)
  const [audioSpeed, setAudioSpeed] = useState(1.0)
  const [currentTime, setCurrentTime] = useState(0)

  const audioRef = useRef(null)
  const segmentPlaybackEndRef = useRef(null)
  const sessionId = session?.session_id
  const vStatus = session?.verification_status || 'not_started'

  // Load verification state if not loaded yet for this session
  useEffect(() => {
    if (sessionId && (!verificationState || verificationState.session_id !== sessionId)) {
      onLoadVerificationState(sessionId)
    }
  }, [sessionId, verificationState, onLoadVerificationState])

  const items = verificationState?.items || []
  const itemsTotal = verificationState?.items_total || items.length || 0
  const itemsResolved = verificationState?.items_resolved || items.filter((i) => i.action !== 'pending').length || 0
  const pendingCount = itemsTotal - itemsResolved

  // Filtered items
  const filteredItems =
    filter === 'pending'
      ? items.filter((i) => i.action === 'pending')
      : filter === 'resolved'
      ? items.filter((i) => i.action !== 'pending')
      : items

  const activeItem = filteredItems[activeItemIndex] || filteredItems[0] || null

  // Sync edited text and clear active segment playback boundary when active item changes
  useEffect(() => {
    segmentPlaybackEndRef.current = null
    setIsPlayingSegment(false)
    if (activeItem) {
      setEditedText(activeItem.verified_text || activeItem.original_text || activeItem.text || '')
    }
  }, [activeItem?.item_id, activeItem?.segment_index])

  useEffect(() => {
    return () => {
      segmentPlaybackEndRef.current = null
    }
  }, [])

  const formatSeconds = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00'
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const remMins = mins % 60
      return `${pad(hours)}:${pad(remMins)}:${pad(secs)}`
    }
    return `${pad(mins)}:${pad(secs)}`
  }

  const formatSegmentTime = (seconds) => {
    if (!seconds && seconds !== 0) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(mins)}:${pad(secs)}`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return 'Aug 23, 2026'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return 'Aug 23, 2026'
    }
  }

  const { programme: progDisplay, sessionTitle: sessionDisplay, preacher: preacherDisplay } = getSessionHierarchy(session)

  // Media setup
  const mediaId =
    session?.recording_id ||
    session?.audio_filename ||
    session?.session_id
  const mediaUrl = getApiUrl(`/api/transcription/media/${encodeURIComponent(mediaId)}`)

  // Bounded Segment Playback: Plays strictly between segment start_time and end_time, then automatically pauses
  const handleReplaySegment = (startTime, endTime) => {
    if (!audioRef.current) return
    const sTime = Number(startTime) || 0
    const eTime = endTime != null && Number(endTime) > sTime ? Number(endTime) : sTime + 5

    segmentPlaybackEndRef.current = eTime
    setIsPlayingSegment(true)

    audioRef.current.currentTime = sTime
    audioRef.current.play().catch(() => {})
    setIsPlaying(true)

    if (onPlaySegment) {
      onPlaySegment(sTime)
    }
  }

  // Master Unrestricted Audio Playback
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        // User clicked master play — clear bounded segment playback for full context
        segmentPlaybackEndRef.current = null
        setIsPlayingSegment(false)
        audioRef.current.play().catch(() => {})
        setIsPlaying(true)
      } else {
        audioRef.current.pause()
        setIsPlaying(false)
        setIsPlayingSegment(false)
        segmentPlaybackEndRef.current = null
      }
    }
  }

  // Master Scrubber Seek (Unrestricted)
  const handleMasterSeek = (timeSec) => {
    segmentPlaybackEndRef.current = null
    setIsPlayingSegment(false)
    if (audioRef.current) {
      audioRef.current.currentTime = timeSec
      audioRef.current.play().catch(() => {})
      setIsPlaying(true)
    }
    if (onPlaySegment) {
      onPlaySegment(timeSec)
    }
  }

  // Audio Time Update Handler (Enforces segment boundary when in bounded playback mode)
  const handleAudioTimeUpdate = (e) => {
    const time = e.target.currentTime
    setCurrentTime(time)

    // Automatically pause if bounded segment end boundary is reached
    if (segmentPlaybackEndRef.current !== null && time >= segmentPlaybackEndRef.current) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      setIsPlaying(false)
      setIsPlayingSegment(false)
      segmentPlaybackEndRef.current = null
    }
  }

  const toggleSpeed = () => {
    const nextSpeed = audioSpeed === 1.0 ? 1.25 : audioSpeed === 1.25 ? 1.5 : audioSpeed === 1.5 ? 0.75 : 1.0
    setAudioSpeed(nextSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }

  // Single Primary Action: Save & Next →
  const handleSaveCorrection = async () => {
    if (!activeItem) return
    const originalText = (activeItem.original_text || activeItem.text || '').trim()
    const textToSave = (editedText || '').trim() || originalText
    const isUnmodified = textToSave === originalText

    await onResolveItem(sessionId, activeItem.segment_index, {
      verified_text: textToSave,
      action: isUnmodified ? 'confirmed' : 'corrected',
      correction_note: isUnmodified ? 'Confirmed transcript' : 'Operator correction',
    })

    // Advance to next pending item if available
    if (activeItemIndex < filteredItems.length - 1) {
      setActiveItemIndex(activeItemIndex + 1)
    }
  }

  const handleBulkConfirm = async () => {
    setIsBulkConfirming(true)
    await onConfirmAllRemaining(sessionId)
    setIsBulkConfirming(false)
    setShowBulkConfirmModal(false)
  }

  const handleFinalise = () => {
    setShowFinaliseModal(true)
  }

  const handleConfirmFinalise = async () => {
    setIsFinalising(true)
    try {
      await onFinalise(sessionId)
      setShowFinaliseModal(false)
    } finally {
      setIsFinalising(false)
    }
  }

  const handleTriggerAiVerification = async () => {
    if (!sessionId) return
    setIsAiVerifying(true)
    setAiFeedback(null)
    setActiveProcess({
      jobType: 'verification',
      sessionId,
      sessionTitle: sessionDisplay || session?.title || 'Sunday Worship Service',
      stageLabel: 'Verifying transcript',
      isCompleted: false,
    })
    if (onTriggerProcessing) {
      onTriggerProcessing()
    } else {
      setShowProcessingScreen(true)
    }
    try {
      const res = await authFetch(getApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/verification/verify-ai`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, auto_resolve: true, background: true }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        console.error('AI verification trigger failed:', res.status, errJson)
      }
    } catch (err) {
      console.error('Error triggering AI verification:', err)
    } finally {
      setIsAiVerifying(false)
    }
  }

  // If user triggered "Use AI to Verify", switch immediately to the dedicated processing screen
  const isCurrentlyProcessing = isProcessingProp !== undefined ? isProcessingProp : showProcessingScreen

  if (isCurrentlyProcessing) {
    return (
      <SessionCompletionView
        session={session}
        skipCompiling={true}
        onBeginVerification={async () => {
          if (onCloseProcessing) {
            onCloseProcessing()
          } else {
            setShowProcessingScreen(false)
          }
          if (onLoadVerificationState) {
            await onLoadVerificationState(sessionId)
          }
        }}
        onGoToReporting={onNavigateToReporting}
        onFinishForNow={onFinishForNow}
        onViewSessionDetails={onFinishForNow}
        onRetryVerification={handleTriggerAiVerification}
      />
    )
  }

  return (
    <div className="verification-workspace-container">
      {/* Hidden Native Audio Element */}
      <audio
        ref={audioRef}
        key={mediaUrl}
        preload="metadata"
        src={mediaUrl}
        onTimeUpdate={handleAudioTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false)
          setIsPlayingSegment(false)
        }}
        style={{ display: 'none' }}
      />


      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER                                                 */}
      {/* ------------------------------------------------------------- */}
      <div className="verification-workspace-header">
        <div className="verification-header-left">
          <div className="verification-programme-eyebrow">{progDisplay}</div>
          <h1 className="verification-main-title">{sessionDisplay}</h1>
          <p className="verification-subline">
            {formatDate(session?.date_created)} &bull; {preacherDisplay}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN 2-COLUMN WORKSPACE GRID                               */}
      {/* ------------------------------------------------------------- */}
      <div className="verification-workspace-grid">
        {/* LEFT COLUMN: Progress & Flagged Segments List */}
        <div className="verification-left-col">
          {/* Progress Card */}
          <div className="card verification-progress-card">
            <div className="progress-info-row">
              <span className="progress-fraction-label">
                <strong>{itemsResolved} of {itemsTotal} resolved</strong>
              </span>
              <span className="progress-percentage-label">
                {itemsTotal ? Math.round((itemsResolved / itemsTotal) * 100) : 0}%
              </span>
            </div>

            <div className="verification-progress-track">
              <div
                className="verification-progress-fill"
                style={{ width: `${itemsTotal ? (itemsResolved / itemsTotal) * 100 : 0}%` }}
              />
            </div>

            {/* Segmented Filter Tabs */}
            <div className="verification-segmented-tabs">
              <button
                type="button"
                className={`segmented-tab ${filter === 'pending' ? 'segmented-tab--active' : ''}`}
                onClick={() => {
                  setFilter('pending')
                  setActiveItemIndex(0)
                }}
              >
                Pending ({items.length > 0 ? items.filter((i) => i.action === 'pending').length : pendingCount})
              </button>

              <button
                type="button"
                className={`segmented-tab ${filter === 'resolved' ? 'segmented-tab--active' : ''}`}
                onClick={() => {
                  setFilter('resolved')
                  setActiveItemIndex(0)
                }}
              >
                Resolved ({items.length > 0 ? items.filter((i) => i.action !== 'pending').length : itemsResolved})
              </button>

              <button
                type="button"
                className={`segmented-tab ${filter === 'all' ? 'segmented-tab--active' : ''}`}
                onClick={() => {
                  setFilter('all')
                  setActiveItemIndex(0)
                }}
              >
                All ({items.length > 0 ? items.length : itemsTotal})
              </button>
            </div>

            {/* Action Buttons Row: Confirm All & Use AI to Verify */}
            {pendingCount > 0 && (
              <div className="verification-action-buttons-row">
                <button
                  type="button"
                  className="btn-confirm-all-action"
                  onClick={() => setShowBulkConfirmModal(true)}
                  disabled={pendingCount === 0}
                  title="Accept original machine text for all remaining flags"
                >
                  <span className="action-btn-icon">✓</span>
                  <span>Confirm All</span>
                </button>

                <button
                  type="button"
                  id="btn-trigger-ai-verify"
                  className={`btn-ai-verify-action ${isAiVerifying ? 'btn-ai-verify-action--loading' : ''}`}
                  onClick={handleTriggerAiVerification}
                  disabled={isAiVerifying || pendingCount === 0}
                  title="Use AI to verify transcript against biblical context"
                >
                  <span className="action-btn-icon"><Icon name={isAiVerifying ? 'clock' : 'document'} /></span>
                  <span>{isAiVerifying ? 'Verifying with AI...' : 'Use AI to Verify'}</span>
                </button>
              </div>
            )}

            {/* Live AI Verification Status Banner / Top-level notice */}
            {aiFeedback && (
              <div className={`ai-verify-notice-banner ai-verify-notice-banner--${aiFeedback?.type || 'warning'}`}>
                <span className="notice-spark"><Icon name="document" /></span>
                <span className="notice-text">
                  {aiFeedback?.message || 'Automated verification is currently unavailable. Manual review is available.'}
                </span>
                {aiFeedback && (
                  <button
                    type="button"
                    className="btn-close-notice"
                    onClick={() => setAiFeedback(null)}
                    aria-label="Dismiss feedback"
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Flagged Items Scroll List */}
          <div className="flagged-items-scroll-list">
            {filteredItems.length === 0 ? (
              <div className="empty-flagged-card">
                <span>✓</span>
                {filter !== 'pending' && <p>No verification items found.</p>}
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = activeItem?.item_id === item.item_id || (activeItem?.segment_index === item.segment_index)
                const isResolved = item.action !== 'pending'
                const timeStart = item.start_time || 0
                const isManual =
                  item.flag_reasons &&
                  Array.isArray(item.flag_reasons) &&
                  item.flag_reasons.some(
                    (f) => f.flag_type === 'manual_flag' || f.type === 'manual_flag'
                  )

                const pillLabel = isResolved
                  ? item.action === 'corrected'
                    ? 'Corrected'
                    : 'Confirmed'
                  : isManual
                  ? 'Manual Review'
                  : 'Low Confidence'

                const displayText = item.verified_text || item.original_text || item.text || ''

                return (
                  <div
                    key={item.item_id || item.segment_index || idx}
                    className={`flagged-item-card ${isSelected ? 'flagged-item-card--selected' : ''} ${
                      isResolved ? 'flagged-item-card--resolved' : ''
                    }`}
                    onClick={() => {
                      setActiveItemIndex(idx)
                      handleReplaySegment(timeStart, item.end_time)
                    }}
                  >
                    <div className="flagged-item-columns">
                      <span className="item-time-pill">{formatSegmentTime(timeStart)}</span>
                      <span className="item-quote-text">&ldquo;{displayText}&rdquo;</span>
                      <span className="item-chevron-icon" aria-hidden="true">›</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Master Audio Player + Active Segment Editor */}
        <div className="verification-right-col">
          {/* Master Audio Player Card */}
          <div className="card master-audio-card">
            <div className="master-audio-header">
              <span className="master-audio-title">Master Audio</span>
              <button
                type="button"
                className="btn-speed-toggle"
                onClick={toggleSpeed}
                title="Change playback speed"
              >
                {audioSpeed}x ∨
              </button>
            </div>

            <div className="master-audio-scrubber">
              <button
                type="button"
                className="btn-master-play"
                onClick={togglePlayPause}
                title={isPlaying && !isPlayingSegment ? 'Pause' : 'Play'}
                aria-label={isPlaying && !isPlayingSegment ? 'Pause' : 'Play'}
              >
                <Icon name={isPlaying && !isPlayingSegment ? 'pause' : 'play'} />
              </button>

              <input type="range" className="source-audio-seek" aria-label="Source playback position" min="0" max={Number.isFinite(audioRef.current?.duration) ? audioRef.current.duration : session?.duration_seconds || 0} step="1" value={currentTime} onChange={e => { const time = Number(e.target.value); setCurrentTime(time); handleMasterSeek(time) }} />

              <span className="master-time-display">
                {formatSeconds(currentTime)} / {formatSeconds(audioRef.current?.duration || session?.duration_seconds || 0)}
              </span>
            </div>
          </div>

          {/* Active Segment Editor Card */}
          {activeItem ? (
            <div className="card active-segment-card">
              <div className="active-segment-header">
                <span className="active-segment-title">
                  Active Segment &bull; {formatSegmentTime(activeItem.start_time || 0)} &ndash; {formatSegmentTime(activeItem.end_time || (activeItem.start_time || 0) + 1)}
                </span>
                <button
                  type="button"
                  className={`btn-replay-segment ${isPlayingSegment ? 'btn-replay-segment--active' : ''}`}
                  onClick={() => handleReplaySegment(activeItem.start_time || 0, activeItem.end_time)}
                  title="Replay this segment audio"
                >
                  <span className="replay-icon"><Icon name="refresh" /></span>
                  <span>{isPlayingSegment ? 'Playing...' : 'Replay'}</span>
                </button>
              </div>

              {/* Raw Transcript Read-Only Block */}
              <div className="segment-field-block">
                <span className="field-label-uppercase">TRANSCRIPT</span>
                <div className="transcript-readonly-box">
                  <p>{activeItem.original_text || activeItem.text || ''}</p>
                </div>
              </div>

              {/* Correction Editable Block */}
              <div className="segment-field-block">
                <span className="field-label-uppercase">CORRECTION</span>
                <textarea
                  className="form-control correction-textarea"
                  rows={4}
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  placeholder="Enter corrected transcript wording..."
                />
              </div>

              {/* Only show AI suggestion when a verified or corrected proposal is available */}
              {activeItem?.ai_decision && ['VERIFIED', 'CORRECTED'].includes(activeItem.ai_decision.toUpperCase()) ? (
                <div className={`ai-hint-box ai-hint-box--${activeItem.ai_decision.toLowerCase()}`}>
                  <span className="sparkle-icon" aria-hidden="true"><Icon name="document" /></span>
                  <div className="ai-hint-details">
                    <div className="ai-hint-title-row">
                      <strong className="ai-hint-title">
                        {activeItem.ai_decision.toUpperCase() === 'CORRECTED'
                          ? 'AI Suggested Correction'
                          : 'AI Verified'}
                      </strong>
                      {activeItem.ai_confidence && (
                        <span className="ai-hint-confidence">
                          {Math.round(activeItem.ai_confidence * 100)}% confidence
                        </span>
                      )}
                    </div>
                    {activeItem.ai_explanation && (
                      <p className="ai-hint-explanation">{activeItem.ai_explanation}</p>
                    )}
                    {activeItem.ai_verified_text && activeItem.ai_verified_text !== editedText && (
                      <button
                        type="button"
                        className="btn-apply-ai-suggestion"
                        onClick={() => setEditedText(activeItem.ai_verified_text)}
                      >
                        Apply AI Wording: &ldquo;{activeItem.ai_verified_text}&rdquo;
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Actions Row at Bottom: Single Primary Action */}
              <div className="active-segment-bottom-actions">
                <button
                  type="button"
                  className="btn btn-segment-save-next"
                  onClick={handleSaveCorrection}
                  id="btn-save-correction"
                >
                  Save &amp; Next →
                </button>
              </div>
            </div>
          ) : (pendingCount === 0 && itemsTotal > 0) ? (
            <div className="card active-segment-completed-card">
              <div className="completed-state-content">
                <div className="completed-check-icon">✓</div>
                <h3 className="completed-title">All verification items resolved</h3>
                <button
                  type="button"
                  className="btn btn--primary btn--proceed-action"
                  onClick={handleFinalise}
                  disabled={isFinalising}
                  id="btn-finalize-verification"
                >
                  {isFinalising ? 'Processing...' : 'Proceed →'}
                </button>
              </div>
            </div>
          ) : (
            <div className="card active-segment-empty">
              <p>Select a flagged segment on the left to verify.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Confirm Modal */}
      {showBulkConfirmModal && (
        <div className="verification-modal-backdrop">
          <div className="card verification-modal-card">
            <h3>⚠ Confirm All Remaining Flagged Sections</h3>
            <p>
              You are about to accept original machine wording for all {pendingCount} remaining flagged sections without modifying their text.
            </p>
            <p className="modal-subtext">
              Any sections you already corrected manually will be safely preserved.
            </p>
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowBulkConfirmModal(false)}
                disabled={isBulkConfirming}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--success"
                onClick={handleBulkConfirm}
                disabled={isBulkConfirming}
                id="btn-confirm-all-modal-submit"
              >
                {isBulkConfirming ? 'Confirming...' : 'Yes, Confirm All Remaining'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Modal */}
      <ConfirmationModal
        isOpen={showFinaliseModal}
        title="Finalise Verification?"
        message={`All ${itemsTotal} verification items are resolved. Would you like to create the final Verified Transcript now?`}
        supportingText="This will combine all segments with your human corrections as the approved factual source for AI Report Processing."
        confirmLabel="Proceed →"
        cancelLabel="Cancel"
        variant="primary"
        isLoading={isFinalising}
        onConfirm={handleConfirmFinalise}
        onCancel={() => setShowFinaliseModal(false)}
      />
    </div>
  )
}
