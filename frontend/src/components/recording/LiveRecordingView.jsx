import React, { useRef, useEffect } from 'react'

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
  onStopRecording,
  onToggleManualFlag,
}) {
  const transcriptEndRef = useRef(null)

  const segments = Array.isArray(liveTranscript) ? liveTranscript : (liveTranscript?.segments || [])
  const interimText = liveTranscript?.interimText || ''
  const transcriptStatus = liveTranscript?.status || 'listening'

  // Auto-scroll to bottom as new live segments or interim text arrive
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  return (
    <div className="live-recording-view-container">
      {/* ------------------------------------------------------------- */}
      {/* 1. STICKY RECORDING MONITOR & CONTROLS HEADER                 */}
      {/* ------------------------------------------------------------- */}
      <div className="live-recording-sticky-controls">
        <div className="recording-monitor-header-grid">
          {/* Left Card: Timer & Controls */}
          <div className="card recording-controls-card">
            <div className="recording-timer-block">
              <div className="recording-badge-row">
                <span className="live-rec-dot">●</span>
                <span className="live-rec-text">RECORDING ACTIVE</span>
              </div>
              <div className="recording-large-timer">{formatTimer(elapsedTime)}</div>
            </div>

            {/* Live Waveform Bars */}
            <div className="live-waveform-visualizer" title="Live audio signal level">
              {[0.2, 0.5, 0.8, 0.4, 0.9, 0.6, 0.3, 0.7, 0.5, 0.8, 0.3].map((height, i) => {
                const dynamicHeight = Math.max(15, Math.min(100, (audioLevel * (i % 2 === 0 ? 1.2 : 0.8))))
                return (
                  <div
                    key={i}
                    className="waveform-bar"
                    style={{ height: `${hasAudioSignal ? dynamicHeight : 15}%` }}
                  />
                )
              })}
            </div>

            {/* Signal Status */}
            <div className="signal-status-box">
              <span className="signal-icon">📶</span>
              <div className="signal-text">
                <span className="signal-label">SIGNAL:</span>
                <span className="signal-val">{hasAudioSignal ? 'STRONG' : 'IDLE'}</span>
              </div>
            </div>

            {/* Stop Session Button */}
            <button
              type="button"
              className="btn btn--danger btn--stop-session"
              onClick={onStopRecording}
              id="btn-stop-live-recording"
            >
              <span className="stop-icon">⏹</span>
              <span>STOP SESSION</span>
            </button>
          </div>

          {/* Right Card: Active Session Information */}
          <div className="card recording-session-info-card">
            <span className="session-info-supertitle">LIVE SESSION</span>
            <h2 className="session-info-main-title">
              {sessionMetadata.title || 'Sunday Morning Worship Service'}
            </h2>

            <div className="session-info-details">
              {(sessionMetadata.programme || sessionMetadata.eventType) && (
                <div className="info-pill-item">
                  <span className="pill-icon">⛪</span>
                  <span>{sessionMetadata.programme || sessionMetadata.eventType}</span>
                </div>
              )}
              {(sessionMetadata.programmeSession || sessionMetadata.sessionSection) && (
                <div className="info-pill-item">
                  <span className="pill-icon">📋</span>
                  <span>{sessionMetadata.programmeSession || sessionMetadata.sessionSection}</span>
                </div>
              )}
              {sessionMetadata.minister && (
                <div className="info-pill-item">
                  <span className="pill-icon">👤</span>
                  <span>{sessionMetadata.minister}</span>
                </div>
              )}
              {sessionMetadata.messageTitle && (
                <div className="info-pill-item">
                  <span className="pill-icon">📖</span>
                  <span>{sessionMetadata.messageTitle}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 2. STATUS SUB-BAR                                             */}
        {/* ------------------------------------------------------------- */}
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
              Engine: Azure Speech (en-NG) &bull; Lossless PCM Archive
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. REAL-TIME TRANSCRIPT STREAM CANVAS                         */}
      {/* ------------------------------------------------------------- */}
      <div className="card live-transcript-canvas-card">
        <div className="transcript-stream-container">
          {segments.length === 0 && !interimText ? (
            <div className="transcript-waiting-placeholder">
              <span className="waiting-spinner">⏳</span>
              <p>Listening to audio input... Transcript will stream here automatically.</p>
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

          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  )
}
