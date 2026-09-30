import { Icon } from '../common/Icon'
import React from 'react'

/**
 * FloatingRecordingController — Compact persistent floating recorder widget.
 * 
 * Displays in the bottom-right corner while a live recording session is active
 * and the operator is navigating or working in other areas of the application.
 * 
 * Features:
 * - Red pulsating "RECORDING" indicator with live elapsed timer.
 * - Live audio waveform / signal strength indicator.
 * - AI speech-to-text status badge (Azure en-NG).
 * - Real-time preview ticker of the latest transcript words.
 * - Single-click "Open Full Recorder" action (maximizes with 0 state loss).
 * - Direct "Stop Session" button triggering the standard finalization flow.
 */
export function FloatingRecordingController({
  sessionMetadata = {},
  elapsedTime = 0,
  liveTranscript = {},
  audioLevel = 0,
  hasAudioSignal = false,
  onMaximize,
  onStopRecording,
}) {
  const segments = Array.isArray(liveTranscript)
    ? liveTranscript
    : (liveTranscript?.segments || [])
  const interimText = liveTranscript?.interimText || ''
  const transcriptStatus = liveTranscript?.status || 'listening'

  // Get the most recent text to display in the mini ticker
  const latestSegment = segments.length > 0 ? segments[segments.length - 1] : null
  const tickerText = interimText || (latestSegment ? latestSegment.text : 'Listening for sermon speech...')

  const formatTimer = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (hours > 0) {
      return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
    }
    return `${pad(mins)}:${pad(secs)}`
  }

  const sessionTitle = sessionMetadata.title || sessionMetadata.eventType || 'Live Worship Service'

  return (
    <aside
      className="floating-recorder-card"
      aria-label="Active Live Recording"
      role="region"
    >
      {/* Top Header Row: Recording Badge, Timer, Signal, and Action Buttons */}
      <div className="floating-recorder-header">
        <div className="floating-header-left">
          <div className="floating-rec-badge">
            <span className="floating-pulse-dot">●</span>
            <span className="floating-rec-label">LIVE</span>
          </div>

          <div className="floating-timer" title="Recording Elapsed Time">
            {formatTimer(elapsedTime)}
          </div>

          {/* Mini Waveform Visualizer */}
          <div className="floating-waveform" title="Microphone signal level">
            {[0.3, 0.7, 0.4, 0.9, 0.5, 0.8, 0.3].map((height, i) => {
              const dynamicHeight = Math.max(20, Math.min(100, audioLevel * (i % 2 === 0 ? 1.2 : 0.8)))
              return (
                <div
                  key={i}
                  className="floating-waveform-bar"
                  style={{ height: `${hasAudioSignal ? dynamicHeight : 20}%` }}
                />
              )
            })}
          </div>
        </div>

        <div className="floating-header-right">
          <button
            type="button"
            className="btn btn--outline btn--small floating-btn-maximize"
            onClick={onMaximize}
            id="btn-maximize-live-recorder"
            title="Open full live recording workspace"
          >
            <span className="btn-icon"></span>
            <span>Open Recorder</span>
          </button>

          <button
            type="button"
            className="btn btn--danger btn--small floating-btn-stop"
            onClick={onStopRecording}
            id="btn-stop-from-floating-recorder"
            title="Stop and finalize this live recording session"
          >
            <span className="btn-icon">⏹</span>
            <span>Stop</span>
          </button>
        </div>
      </div>

      {/* Middle Body: Session Title & Active Transcript Ticker */}
      <div className="floating-recorder-body">
        <div className="floating-session-title" title={sessionTitle}>
          <span className="floating-meta-icon"><Icon name="home" /></span>
          <span className="floating-meta-name">{sessionTitle}</span>
        </div>

        <div className="floating-ticker-row" title="Live speech transcript ticker">
          <span className="floating-ticker-icon">{interimText ? '' : ''}</span>
          <p className="floating-ticker-text">
            {tickerText}
            {interimText && <span className="floating-typing-cursor">|</span>}
          </p>
        </div>
      </div>

      {/* Bottom Sub-bar: Status Indicators */}
      <div className="floating-recorder-footer">
        <div className="floating-status-item">
          <span className={`floating-status-dot ${hasAudioSignal ? 'dot--active' : 'dot--idle'}`} />
          <span className="floating-status-text">Audio: {hasAudioSignal ? 'Strong' : 'Active'}</span>
        </div>

        <div className="floating-status-item">
          <span className={`floating-status-dot ${transcriptStatus === 'listening' || transcriptStatus === 'recognizing' ? 'dot--azure' : 'dot--idle'}`} />
          <span className="floating-status-text">Azure STT: {transcriptStatus}</span>
        </div>

        <div className="floating-status-segments">
          <span>{segments.length} segment{segments.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </aside>
  )
}
