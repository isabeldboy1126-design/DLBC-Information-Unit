import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl } from '../../config'
import { getSessionHierarchy } from '../sessions/SessionDetailView'

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
}) {
  const [filter, setFilter] = useState('pending') // 'pending' | 'resolved' | 'all'
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [editedText, setEditedText] = useState('')
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false)
  const [showAiNotice, setShowAiNotice] = useState(false)
  const [isBulkConfirming, setIsBulkConfirming] = useState(false)
  const [isFinalising, setIsFinalising] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPlayingSegment, setIsPlayingSegment] = useState(false)
  const [audioSpeed, setAudioSpeed] = useState(1.0)
  const [currentTime, setCurrentTime] = useState(0)

  const audioRef = useRef(null)
  const segmentPlaybackEndRef = useRef(null)
  const sessionId = session?.session_id
  const vStatus = session?.verification_status || 'not_started'

  // Load verification state if in progress and not loaded yet
  useEffect(() => {
    if (sessionId && vStatus === 'in_progress' && !verificationState) {
      onLoadVerificationState(sessionId)
    }
  }, [sessionId, vStatus, verificationState, onLoadVerificationState])

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

  // Item resolution actions
  const handleSaveCorrection = async () => {
    if (!activeItem) return
    const textToSave = editedText.trim() || activeItem.original_text || activeItem.text || ''
    await onResolveItem(sessionId, activeItem.segment_index, {
      verified_text: textToSave,
      action: 'corrected',
      correction_note: 'Operator correction',
    })
    // Advance to next pending item if available
    if (activeItemIndex < filteredItems.length - 1) {
      setActiveItemIndex(activeItemIndex + 1)
    }
  }

  const handleOriginalCorrect = async () => {
    if (!activeItem) return
    const originalText = activeItem.original_text || activeItem.text || ''
    await onResolveItem(sessionId, activeItem.segment_index, {
      verified_text: originalText,
      action: 'confirmed',
      correction_note: 'Confirmed original transcript',
    })
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

  const handleFinalise = async () => {
    if (
      !window.confirm(
        `All ${itemsTotal} verification items are resolved.\n\nCreate the final Verified Transcript now?\n\nThis will combine all segments with your human corrections as the approved factual source.`
      )
    ) {
      return
    }
    setIsFinalising(true)
    await onFinalise(sessionId)
    setIsFinalising(false)
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
                <strong>{itemsResolved} of {itemsTotal || 59} resolved</strong>
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
                Pending ({items.filter((i) => i.action === 'pending').length})
              </button>

              <button
                type="button"
                className={`segmented-tab ${filter === 'resolved' ? 'segmented-tab--active' : ''}`}
                onClick={() => {
                  setFilter('resolved')
                  setActiveItemIndex(0)
                }}
              >
                Resolved ({items.filter((i) => i.action !== 'pending').length})
              </button>

              <button
                type="button"
                className={`segmented-tab ${filter === 'all' ? 'segmented-tab--active' : ''}`}
                onClick={() => {
                  setFilter('all')
                  setActiveItemIndex(0)
                }}
              >
                All ({items.length})
              </button>
            </div>

            {/* Action Buttons Row: Confirm All & Use AI to Verify */}
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
                className="btn-ai-verify-action"
                onClick={() => setShowAiNotice(!showAiNotice)}
                title="Use AI to verify transcript against biblical context"
              >
                <span className="action-btn-icon">✦</span>
                <span>Use AI to Verify</span>
              </button>
            </div>

            {/* Subtle informational notice (zero API calls, safe UI feedback) */}
            {showAiNotice && (
              <div className="ai-verify-notice-banner">
                <span className="notice-spark">✦</span>
                <span className="notice-text">
                  AI verification integration is scheduled for the next backend phase. No external API calls are made in this UI pass.
                </span>
                <button
                  type="button"
                  className="btn-close-notice"
                  onClick={() => setShowAiNotice(false)}
                  aria-label="Dismiss notice"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Flagged Items Scroll List */}
          <div className="flagged-items-scroll-list">
            {filteredItems.length === 0 ? (
              <div className="empty-flagged-card">
                <span>✓</span>
                <p>
                  {filter === 'pending'
                    ? 'All flagged items in this section have been resolved!'
                    : 'No verification items found.'}
                </p>
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
                      <span className={`item-reason-pill ${isResolved ? 'item-reason-pill--resolved' : ''}`}>
                        {pillLabel}
                      </span>
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
                {isPlaying && !isPlayingSegment ? '⏸' : '▶'}
              </button>

              <div
                className="master-audio-waveform-track"
                onClick={(e) => {
                  if (audioRef.current && audioRef.current.duration) {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const clickPos = (e.clientX - rect.left) / rect.width
                    const seekTo = clickPos * audioRef.current.duration
                    handleMasterSeek(seekTo)
                  }
                }}
              >
                <div
                  className="master-audio-waveform-fill"
                  style={{
                    width: `${
                      audioRef.current?.duration
                        ? (currentTime / audioRef.current.duration) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>

              <span className="master-time-display">
                {formatSeconds(currentTime)} / {formatSeconds(audioRef.current?.duration || session?.duration_seconds || 1541)}
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
                  <span className="replay-icon">↻</span>
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

              {/* Informational AI assistance banner matching reference screenshot */}
              <div className="ai-hint-box">
                <span className="sparkle-icon" aria-hidden="true">✦</span>
                <span>AI assistance is available to suggest improvements.</span>
              </div>

              {/* Actions Row at Bottom */}
              <div className="active-segment-bottom-actions">
                <button
                  type="button"
                  className="btn btn-segment-confirm"
                  onClick={handleOriginalCorrect}
                  id="btn-original-was-correct"
                >
                  Confirm
                </button>
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
          ) : (
            <div className="card active-segment-empty">
              <p>Select a flagged segment on the left to verify.</p>
            </div>
          )}


          {/* Finalize Banner (When all items resolved) */}
          {itemsTotal > 0 && itemsResolved === itemsTotal && (
            <div className="verification-finalize-ready-box">
              <div className="finalize-ready-text">
                <strong>✓ All Verification Items Resolved!</strong>
                <p>Ready to compile the final Verified Transcript and proceed to Reporting.</p>
              </div>

              <button
                type="button"
                className="btn btn--success btn--finalize-action"
                onClick={handleFinalise}
                disabled={isFinalising}
                id="btn-finalize-verification"
              >
                {isFinalising ? 'Finalizing...' : 'Finalise Verification →'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Confirm Modal */}
      {showBulkConfirmModal && (
        <div className="verification-modal-backdrop">
          <div className="card verification-modal-card">
            <h3>⚠️ Confirm All Remaining Flagged Sections</h3>
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
    </div>
  )
}
