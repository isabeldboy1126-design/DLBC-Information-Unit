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
  isPaused = false,
  onPauseRecording,
  onResumeRecording,
  onMinimize,
  onStopRecording,
  onToggleManualFlag,
}) {
  const transcriptContainerRef = useRef(null)

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
      {/* 1. COMPACT TOP RECORDING CONTROL BAR                          */}
      {/* ------------------------------------------------------------- */}
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
            onClick={onStopRecording}
            id="btn-stop-live-recording"
            title={isPaused ? 'Finalize recording captured so far' : 'Stop and finalize session'}
          >
            <span className="stop-icon">⏹</span>
            <span>STOP SESSION</span>
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
  )
}
