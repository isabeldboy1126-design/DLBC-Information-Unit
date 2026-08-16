import React, { useEffect, useRef, useState } from 'react'

export function LiveTranscriptPanel({
  isRecording,
  elapsedTime,
  liveTranscript,
  isExpanded,
  onToggleExpand,
  onToggleManualFlag,
}) {
  const scrollContainerRef = useRef(null)
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false)

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

  // Handle scroll events to detect if user manually scrolled up
  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setIsUserScrolledUp(!isAtBottom)
  }

  // Auto-scroll to bottom when new segments or interim text arrive, unless user scrolled up
  useEffect(() => {
    if (!isUserScrolledUp && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [liveTranscript.segments, liveTranscript.interimText, isUserScrolledUp])

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
      setIsUserScrolledUp(false)
    }
  }

  // Status Badge Rendering
  const getTranscriptionStatusBadge = () => {
    switch (liveTranscript.status) {
      case 'listening':
        return <span className="badge badge--success">🟢 Azure Connected (en-NG)</span>
      case 'recognizing':
        return <span className="badge badge--primary">🎙️ Receiving Speech...</span>
      case 'reconnecting':
        return <span className="badge badge--warning">⚠️ Reconnecting...</span>
      case 'unavailable':
        return <span className="badge badge--danger">✕ Live Transcription Unavailable</span>
      case 'completed':
        return <span className="badge badge--success">✓ Completed & Preserved</span>
      case 'initializing':
        return <span className="badge badge--muted">⏳ Connecting to Azure...</span>
      default:
        return <span className="badge badge--muted">Ready</span>
    }
  }

  return (
    <div className={`live-transcript-panel card ${isExpanded ? 'live-transcript-panel--expanded' : ''}`}>
      {/* Panel Header */}
      <div className="card-header live-transcript-header">
        <div className="header-title-group">
          <div className="title-row">
            <h3>Live Sermon Transcript</h3>
            {isRecording && <span className="live-rec-dot-pulse">● LIVE</span>}
          </div>
          <div className="status-indicators-row">
            {isRecording ? (
              <span className="badge badge--recording">● Recording — {formatSeconds(elapsedTime)}</span>
            ) : (
              <span className="badge badge--muted">Audio Idle</span>
            )}
            {getTranscriptionStatusBadge()}
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn--outline btn--small expand-btn"
            onClick={onToggleExpand}
            title={isExpanded ? 'Collapse transcript to normal size' : 'Expand transcript for full screen reading'}
          >
            {isExpanded ? '🗗 Normal View' : '⛶ Expand Live Transcript'}
          </button>
        </div>
      </div>

      {/* Transcript Scrollable Area */}
      <div
        className="live-transcript-body"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {liveTranscript.segments.length === 0 && !liveTranscript.interimText ? (
          <div className="live-transcript-empty">
            {isRecording ? (
              <div className="listening-prompt">
                <div className="spinner-small" />
                <p>Listening for speech... Recognized phrases will appear here in real-time.</p>
              </div>
            ) : (
              <p className="idle-prompt">
                🎙️ Start recording to begin live speech recognition with Azure Speech (en-NG).
              </p>
            )}
          </div>
        ) : (
          <div className="live-segments-container">
            {liveTranscript.segments.map((seg, idx) => {
              const hasManualFlag = seg.flags && seg.flags.some((f) => f.flag_type === 'manual_flag')
              const isAutoFlagged = seg.is_low_confidence

              return (
                <div
                  key={idx}
                  className={`live-segment-row ${isAutoFlagged ? 'live-segment--autoflagged' : ''} ${
                    hasManualFlag ? 'live-segment--manualflagged' : ''
                  }`}
                >
                  <div className="live-segment-meta">
                    <span className="live-timestamp">
                      [{formatSeconds(seg.start_time)} - {formatSeconds(seg.end_time)}]
                    </span>

                    {seg.confidence !== null && seg.confidence !== undefined && (
                      <span
                        className={`segment-confidence-tag ${
                          isAutoFlagged ? 'tag--warning' : 'tag--neutral'
                        }`}
                        title={
                          isAutoFlagged
                            ? 'Flagged for verification: confidence below 60%'
                            : `Confidence: ${Math.round(seg.confidence * 100)}%`
                        }
                      >
                        {isAutoFlagged ? '⚠️ ' : ''}
                        {Math.round(seg.confidence * 100)}%
                      </span>
                    )}

                    <button
                      type="button"
                      className={`manual-flag-btn ${hasManualFlag ? 'manual-flag-btn--active' : ''}`}
                      onClick={() => onToggleManualFlag && onToggleManualFlag(idx)}
                      title={
                        hasManualFlag
                          ? 'Click to remove manual review flag'
                          : 'Click to flag this phrase for review (Phase 5)'
                      }
                    >
                      {hasManualFlag ? '🚩 Flagged' : '⚑ Flag'}
                    </button>
                  </div>

                  <div className="live-segment-content">
                    <span className="live-segment-text">{seg.text}</span>
                  </div>
                </div>
              )
            })}

            {/* Real-time Interim Hypothesis */}
            {liveTranscript.interimText && (
              <div className="live-interim-row">
                <span className="interim-label">💬</span>
                <span className="interim-text">{liveTranscript.interimText}...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Return-to-Live Button */}
      {isUserScrolledUp && (
        <button
          type="button"
          className="btn-return-to-live"
          onClick={scrollToBottom}
          title="Jump to latest live speech"
        >
          ⬇ Return to Live
        </button>
      )}

      {/* Footer Info */}
      <div className="live-transcript-footer">
        <span className="footer-tip">
          💡 <strong>Live Flagging:</strong> Click ⚑ on any phrase to mark it for verification. Recording continues safely even if live transcription reconnects.
        </span>
      </div>
    </div>
  )
}
