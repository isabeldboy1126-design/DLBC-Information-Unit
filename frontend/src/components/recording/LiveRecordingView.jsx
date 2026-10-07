import React, { useState, useRef, useEffect } from 'react'

/**
 * LiveRecordingView — Active recording monitor matching live-session-recording.png.
 * 
 * Features:
 * - Top Control Header: Red Recording Active badge, Elapsed Time counter,
 *   live audio waveform visualizer, Signal status, and Stop Session action.
 * - Active Session Metadata card (Title, Minister, Message Topic).
 * - Status Sub-bar: Storage health, AI transcription stream status, provider info.
 * - Real-time streaming transcript canvas with auto-scroll and flagged segment highlighting.
 * - Manual flag toggle button on segments for human-in-the-loop attention during capture.
 */
export function LiveRecordingView({
  sessionMetadata = {},
  elapsedTime = 0,
  liveTranscript = [],
  audioLevel = 0,
  hasAudioSignal = false,
  isPaused = false,
  onPauseRecording,
  onResumeRecording,
  onMinimize,
  onStopRecording,
  onToggleManualFlag,
}) {
  const [isStopping, setIsStopping] = useState(false)
  const transcriptContainerRef = useRef(null)

  const handleStop = async () => {
    if (isStopping) return
    setIsStopping(true)
    try {
      if (onStopRecording) {
        await onStopRecording()
      }
    } catch (err) {
      console.error('[LiveRecordingView] Stop recording error:', err)
      setIsStopping(false)
    }
  }

  const segments = Array.isArray(liveTranscript) ? liveTranscript : (liveTranscript?.segments || [])
  const interimText = liveTranscript?.interimText || ''
  const transcriptStatus = liveTranscript?.status || 'listening'

  // Auto-scroll container to bottom as new live segments or interim text arrive
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight
    }
  }, [segments.length, interimText])

  const formatTimer = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }

  const formatSegmentTime = (seconds) => {
    if (!seconds && seconds !== 0) return '00:00:00'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }

  // Format compact metadata line: Programme • Session • Minister • Message Title
  const metadataParts = [
    sessionMetadata.programme || sessionMetadata.eventType,
    sessionMetadata.programmeSession || sessionMetadata.sessionSection,
    sessionMetadata.minister,
    sessionMetadata.messageTitle,
  ].filter(Boolean)

  const compactMetadataString = metadataParts.length > 0
    ? metadataParts.join(' • ')
    : (sessionMetadata.title || 'Live Session Recording')

  const dayNumber = sessionMetadata.day_number || sessionMetadata.dayNumber

  return (
    <div className="live-recording-view-container">
      {/* ------------------------------------------------------------- */}
      {/* MOBILE LIVE RECORDING (Matching Reference Screen 3)           */}
      {/* ------------------------------------------------------------- */}
      <div className="mobile-live-recording-layout">
        {/* Mobile Header */}
        <div className="mobile-subpage-header">
          <button
            type="button"
            className="mobile-header-back-btn"
            onClick={onMinimize}
            aria-label="Back / Minimize to background"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="mobile-header-title">Live Session</h1>
          <div className="mobile-header-action-slot">
            <span className="mobile-rec-pulse-badge">●</span>
          </div>
        </div>

        {/* Central Audio Waveform Graphic */}
        <div className="mobile-recording-waveform-stage">
          <div className="mobile-waveform-bars-container">
            {[24, 45, 75, 90, 60, 35, 80, 95, 65, 40, 85, 100, 70, 50, 80, 60, 40, 90, 75, 55, 30].map((baseH, i) => {
              const dynHeight = isPaused ? 15 : Math.max(12, Math.min(100, (baseH * (audioLevel > 0 ? (0.4 + audioLevel * 0.8) : 0.3))))
              return (
                <div
                  key={i}
                  className="mobile-waveform-bar"
                  style={{
                    height: `${dynHeight}%`,
                    opacity: isPaused ? 0.35 : 0.9,
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* Digital Timer & Recording Status */}
        <div className="mobile-timer-section">
          <div className="mobile-digital-clock">{formatTimer(elapsedTime)}</div>
          <div className="mobile-recording-status-indicator">
            {isPaused ? (
              <span className="mobile-status-text mobile-status-text--paused">⏸ Paused</span>
            ) : (
              <span className="mobile-status-text mobile-status-text--recording">
                <span className="mobile-rec-dot">●</span> Recording...
              </span>
            )}
          </div>
        </div>

        {/* Session Metadata Card */}
        <div className="mobile-session-metadata-card">
          <div className="mobile-meta-key-row">
            <span className="mobile-meta-key">Event</span>
            <span className="mobile-meta-val">{sessionMetadata.eventType || sessionMetadata.programme || 'Sunday Worship Service'}</span>
          </div>
          <div className="mobile-meta-key-row">
            <span className="mobile-meta-key">Programme</span>
            <span className="mobile-meta-val">{sessionMetadata.programme || sessionMetadata.eventType || 'Sunday Worship Service'}</span>
          </div>
          <div className="mobile-meta-key-row">
            <span className="mobile-meta-key">Pastor</span>
            <span className="mobile-meta-val">{sessionMetadata.minister || 'Pastor W.F. Kumuyi'}</span>
          </div>
          <div className="mobile-meta-key-row">
            <span className="mobile-meta-key">Input</span>
            <span className="mobile-meta-val mobile-meta-val--interactive">
              Microphone (Default) <span className="mobile-chevron-icon">›</span>
            </span>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="mobile-recording-bottom-bar">
          <button
            type="button"
            className="mobile-btn-pause-resume"
            onClick={isPaused ? onResumeRecording : onPauseRecording}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>

          <button
            type="button"
            className="mobile-btn-stop-recording"
            onClick={handleStop}
            id="mobile-btn-stop-recording"
            disabled={isStopping}
          >
            <span className="mobile-stop-icon">■</span>
            <span>{isStopping ? 'Finalizing recording...' : 'Stop Recording'}</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DESKTOP LIVE RECORDING LAYOUT (Unchanged Desktop Layout)       */}
      {/* ------------------------------------------------------------- */}
      <div className="desktop-live-recording-layout">
        {/* 1. COMPACT TOP RECORDING CONTROL BAR                          */}
        <div className={`card live-top-recording-bar ${isPaused ? 'live-top-bar--paused' : ''}`}>
        <div className="live-bar-left">
          {/* Active / Paused Recording Badge */}
          {isPaused ? (
            <div className="live-rec-badge-pill" style={{ background: '#fef3c7', borderColor: '#fde68a' }}>
              <span className="live-rec-dot" style={{ background: '#d97706', animation: 'none' }}>⏸</span>
              <span className="live-rec-text" style={{ color: '#92400e' }}>PAUSED</span>
            </div>
          ) : sessionMetadata.source_type === 'youtube_tab' ? (
            <div className="live-rec-badge-pill" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
              <span className="live-rec-dot" style={{ background: '#dc2626' }}>●</span>
              <span className="live-rec-text" style={{ color: '#991b1b' }}>YOUTUBE TAB AUDIO</span>
            </div>
          ) : (
            <div className="live-rec-badge-pill">
              <span className="live-rec-dot">●</span>
              <span className="live-rec-text">RECORDING ACTIVE</span>
            </div>
          )}

          {/* Recording Timer */}
          <div className="live-bar-timer" style={{ opacity: isPaused ? 0.75 : 1 }}>
            {formatTimer(elapsedTime)}
          </div>

          {/* Audio Waveform & Signal Status */}
          <div className="live-bar-signal-group">
            <div className="live-waveform-visualizer" title={isPaused ? 'Recording paused' : 'Live audio signal level'}>
              {[0.2, 0.5, 0.8, 0.4, 0.9, 0.6, 0.3, 0.7, 0.5, 0.8, 0.3].map((height, i) => {
                const dynamicHeight = Math.max(15, Math.min(100, (audioLevel * (i % 2 === 0 ? 1.2 : 0.8))))
                return (
                  <div
                    key={i}
                    className="waveform-bar"
                    style={{
                      height: `${(!isPaused && hasAudioSignal) ? dynamicHeight : 15}%`,
                      opacity: isPaused ? 0.4 : 1,
                    }}
                  />
                )
              })}
            </div>
            <span className="live-signal-badge">
              {isPaused ? '⏸ PAUSED' : hasAudioSignal ? '📶 STRONG' : '📶 IDLE'}
            </span>
          </div>

          {/* Compact Session / Programme Details with optional Day badge */}
          <div className="live-bar-metadata" title={compactMetadataString}>
            <span className="live-meta-icon">{sessionMetadata.source_type === 'youtube_tab' ? '📺' : '🏛️'}</span>
            <span className="live-meta-text">{compactMetadataString}</span>
            {dayNumber && (
              <span className="session-day-badge" title={`Day ${dayNumber}`}>
                {dayNumber}
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="live-bar-right">
          {onMinimize && (
            <button
              type="button"
              className="btn btn--outline btn--minimize-recording"
              onClick={onMinimize}
              id="btn-minimize-live-recording"
              title="Minimize recorder to floating widget and use other app features"
            >
              <span className="minimize-icon">🗕</span>
              <span>Minimize</span>
            </button>
          )}

          {/* Pause / Resume Button */}
          {isPaused ? (
            <button
              type="button"
              className="btn btn--outline btn--resume-recording"
              onClick={onResumeRecording}
              id="btn-resume-live-recording"
              title="Resume recording on the same session"
              style={{ fontWeight: 600 }}
            >
              <span className="btn-icon">▶</span>
              <span>RESUME</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--outline btn--pause-recording"
              onClick={onPauseRecording}
              id="btn-pause-live-recording"
              title="Pause audio capture without finalizing"
              style={{ fontWeight: 600 }}
            >
              <span className="btn-icon">⏸</span>
              <span>PAUSE</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn--danger btn--stop-session"
            onClick={handleStop}
            id="btn-stop-live-recording"
            disabled={isStopping}
            title={isPaused ? 'Finalize recording captured so far' : 'Stop and finalize session'}
          >
            <span className="stop-icon">⏹</span>
            <span>{isStopping ? 'FINALIZING...' : 'STOP SESSION'}</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. REAL-TIME DOMINANT TRANSCRIPT CANVAS (35px)                */}
      {/* ------------------------------------------------------------- */}
      <div className="card live-transcript-canvas-card">
        <div className="transcript-stream-container" ref={transcriptContainerRef}>
          {segments.length === 0 && !interimText ? (
            <div className="transcript-waiting-placeholder">
              <span className="waiting-spinner">⏳</span>
              <p className="waiting-text">
                {sessionMetadata.source_type === 'youtube_tab'
                  ? 'Capturing audio from shared YouTube tab... Live transcript will stream here.'
                  : 'Listening for live audio input... Live transcript will stream here.'}
              </p>
            </div>
          ) : (
            <>
              {segments.map((seg, idx) => {
                const isFlagged = seg.is_low_confidence || (seg.flags && seg.flags.length > 0)
                const timeStr = formatSegmentTime(seg.start_time || seg.offset || idx * 4)

                return (
                  <div
                    key={idx}
                    className={`transcript-stream-segment ${
                      isFlagged ? 'transcript-stream-segment--flagged' : ''
                    }`}
                  >
                    <div className="segment-timestamp">{timeStr}</div>

                    <div className="segment-body">
                      {isFlagged && (
                        <span className="flag-alert-icon" title="Flagged for verification review">
                          ⚠️
                        </span>
                      )}
                      <span className="segment-text">{seg.text}</span>
                    </div>

                    {onToggleManualFlag && (
                      <button
                        type="button"
                        className={`btn-flag-toggle ${isFlagged ? 'btn-flag--active' : ''}`}
                        onClick={() => onToggleManualFlag(idx)}
                        title={isFlagged ? 'Remove verification flag' : 'Flag section for human review'}
                      >
                        🚩
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Real-time Interim Live Speech */}
              {interimText && (
                <div className="transcript-stream-segment transcript-stream-segment--interim">
                  <div className="segment-timestamp">{formatSegmentTime(elapsedTime)}</div>
                  <div className="segment-body">
                    <span className="segment-text segment-text--interim">
                      {interimText} <span className="typing-cursor">|</span>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Streaming Cursor indicator */}
          {segments.length > 0 && !interimText && (
            <div className="streaming-cursor-row">
              <span className="cursor-dots">...</span>
              <span className="cursor-text">Listening for speech...</span>
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------- */}
        {/* 3. SUBTLE SECONDARY STATUS FOOTER                           */}
        {/* ----------------------------------------------------------- */}
        <div className="recording-status-subbar">
          <div className="subbar-left">
            <div className="status-chip chip--optimal">
              <span>☁️ STORAGE: OPTIMAL</span>
            </div>
            <div className="status-chip chip--ai">
              <span>👂 AI TRANSCRIPTION: {transcriptStatus.toUpperCase()}</span>
            </div>
          </div>

          <div className="subbar-right">
            <span className="engine-model-text">
              {sessionMetadata.source_type === 'youtube_tab'
                ? 'Azure Speech (en-NG) • YouTube Tab Audio • Lossless PCM Archive'
                : 'Azure Speech (en-NG) • Lossless PCM Archive'}
            </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
