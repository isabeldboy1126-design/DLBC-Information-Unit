import React, { useState, useRef, useEffect } from 'react'

export function RawTranscriptViewer({ transcript, onNewTranscription, mediaElementRef, onJumpToTime }) {
  const [viewMode, setViewMode] = useState('segments') // 'segments' | 'continuous'
  const [copied, setCopied] = useState(false)
  const [mediaDuration, setMediaDuration] = useState(transcript?.duration_seconds || 0)

  const localPlayerRef = useRef(null)
  const playerRef = mediaElementRef || localPlayerRef
  const pendingSeekTimeRef = useRef(null)

  if (!transcript) return null

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

  const handleCopyFullTranscript = () => {
    // Extracts clean continuous raw transcript text without timestamps, percentages, flags, or labels
    const cleanText =
      transcript.raw_text?.trim() ||
      (transcript.segments ? transcript.segments.map((s) => s.text.trim()).filter(Boolean).join(' ') : '')

    if (cleanText) {
      navigator.clipboard.writeText(cleanText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  // Resolve media identifier (works for live recordings and uploaded files)
  const mediaId =
    transcript.recording_id ||
    transcript.upload_id ||
    transcript.saved_filename ||
    transcript.original_filename

  const mediaUrl = `http://localhost:8000/api/transcription/media/${encodeURIComponent(mediaId)}`
  const isVideo = transcript.is_video || transcript.saved_filename?.endsWith('.mp4')

  // Handle media metadata loaded
  const handleLoadedMetadata = (e) => {
    const dur = e.target.duration
    if (dur && !isNaN(dur) && isFinite(dur)) {
      setMediaDuration(dur)
    }
    // If user clicked a timestamp before metadata loaded, execute seek now
    if (pendingSeekTimeRef.current !== null) {
      const targetTime = pendingSeekTimeRef.current
      pendingSeekTimeRef.current = null
      e.target.currentTime = targetTime
      e.target.play().catch(() => {})
    }
  }

  // Jump to specific timestamp
  const handleTimestampClick = (startTime) => {
    const el = playerRef.current
    if (el) {
      if (el.readyState >= 1) {
        el.currentTime = startTime
        el.play().catch((err) => console.log('Playback notice:', err))
      } else {
        pendingSeekTimeRef.current = startTime
        el.load()
      }
    }
    if (typeof onJumpToTime === 'function') {
      onJumpToTime(startTime)
    }
  }

  return (
    <div className="card transcript-viewer-card">
      <div className="card-header">
        <div className="transcript-title-group">
          <h3>Raw Transcript</h3>
          <span className="file-subtitle">📄 {transcript.original_filename}</span>
        </div>
        <div className="header-badges">
          <span className="badge badge--success">✓ Raw Transcript Preserved</span>
          <span className="badge badge--primary">
            {transcript.provider_name === 'azure_speech'
              ? 'Azure Speech (en-NG)'
              : transcript.provider_name === 'faster_whisper'
              ? 'Local Faster-Whisper'
              : 'Google Speech-to-Text'}
          </span>
        </div>
      </div>

      <div className="card-body">
        {/* Playable Original Media Player */}
        <div className="media-playback-section">
          <div className="playback-header">
            <span className="section-label">Original Recording Playback:</span>
            {mediaDuration > 0 && (
              <span className="duration-tag">⏱️ Duration: {formatSeconds(mediaDuration)}</span>
            )}
          </div>
          {isVideo ? (
            <video
              ref={playerRef}
              key={mediaUrl}
              controls
              preload="metadata"
              src={mediaUrl}
              onLoadedMetadata={handleLoadedMetadata}
              className="native-video-player"
              id="uploaded-video-player"
            >
              Your browser does not support HTML5 video playback.
            </video>
          ) : (
            <audio
              ref={playerRef}
              key={mediaUrl}
              controls
              preload="metadata"
              src={mediaUrl}
              onLoadedMetadata={handleLoadedMetadata}
              className="native-audio-player"
              id="uploaded-audio-player"
            >
              Your browser does not support HTML5 audio playback.
            </audio>
          )}
        </div>

        {/* View Mode Controls & Copy Actions */}
        <div className="transcript-toolbar">
          <div className="view-mode-tabs">
            <button
              type="button"
              className={`tab-btn ${viewMode === 'segments' ? 'tab-btn--active' : ''}`}
              onClick={() => setViewMode('segments')}
            >
              ⏱️ Timestamped Segments ({transcript.segments?.length || 0})
            </button>
            <button
              type="button"
              className={`tab-btn ${viewMode === 'continuous' ? 'tab-btn--active' : ''}`}
              onClick={() => setViewMode('continuous')}
            >
              📄 Continuous Raw Text
            </button>
          </div>

          <div className="toolbar-actions">
            <button
              type="button"
              className={`btn btn--small ${copied ? 'btn--success' : 'btn--outline'}`}
              onClick={handleCopyFullTranscript}
              id="btn-copy-full-transcript"
              title="Copy entire raw transcript as clean continuous text (no timestamps, flags, or labels)"
            >
              {copied ? '✓ Copied Full Transcript!' : '📋 Copy Full Transcript'}
            </button>
            {onNewTranscription && (
              <button type="button" className="btn btn--secondary btn--small" onClick={onNewTranscription}>
                + Transcribe Another File
              </button>
            )}
          </div>
        </div>

        {/* Transcript Body */}
        <div className="transcript-content-box">
          {viewMode === 'segments' && transcript.segments && transcript.segments.length > 0 ? (
            <div className="segments-list">
              {transcript.segments.map((seg, idx) => (
                <div
                  key={idx}
                  className={`segment-row ${seg.is_low_confidence ? 'segment-row--flagged' : ''}`}
                >
                  <button
                    type="button"
                    className="segment-timestamp-btn"
                    onClick={() => handleTimestampClick(seg.start_time)}
                    title={`Click to jump original audio to ${formatSeconds(seg.start_time)}`}
                  >
                    ▶ [{formatSeconds(seg.start_time)} - {formatSeconds(seg.end_time)}]
                  </button>
                  <span className="segment-text">{seg.text}</span>
                  {seg.confidence !== null && seg.confidence !== undefined && (
                    <span
                      className={`segment-confidence-tag ${
                        seg.is_low_confidence ? 'tag--warning' : 'tag--neutral'
                      }`}
                      title={
                        seg.is_low_confidence
                          ? 'Flagged for Phase 5 verification: confidence below 60%'
                          : `Recognition Confidence: ${Math.round(seg.confidence * 100)}%`
                      }
                    >
                      {seg.is_low_confidence ? '⚠️ ' : ''}
                      {Math.round(seg.confidence * 100)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="continuous-text-box">
              <p className="continuous-raw-text">
                {transcript.raw_text || 'No speech recognized or transcript is empty.'}
              </p>
            </div>
          )}
        </div>

        {/* Notice of Immutability */}
        <div className="immutability-notice">
          <p>
            🔒 <strong>Immutable Raw Record:</strong> This transcript is preserved exactly as produced by the
            transcription service. It is not edited, summarized, or modified, serving as the trusted source for the
            subsequent Verification and Editorial review stages.
          </p>
        </div>
      </div>
    </div>
  )
}
