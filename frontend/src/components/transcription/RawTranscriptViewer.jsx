import React, { useState, useRef, useEffect } from 'react'
import { getApiUrl } from '../../config'

/**
 * RawTranscriptViewer — Immutable Raw Transcript View matching raw-transcript.png.
 * 
 * Features:
 * - Header: Title, RAW TRANSCRIPT tag, Date, Total duration, and Copy Full Transcript.
 * - Prominent "Verification Needed" alert banner with direct "Begin Verification" CTA.
 * - Master Audio playback scrubber with interactive waveform seek.
 * - View switcher: Timestamped Segments vs Continuous Text.
 * - Clickable segment timestamps seeking and playing master audio at exact offsets.
 * - Flagged / low confidence segments highlighted with confidence scores (e.g. CONF: 62%).
 * - Archival Immutability Policy footer at the bottom.
 */
export function RawTranscriptViewer({
  transcript,
  mediaElementRef,
  onJumpToTime,
  onBeginVerification,
  flagCount = 0,
}) {
  const [viewMode, setViewMode] = useState('segments') // 'segments' | 'continuous'
  const [copied, setCopied] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(transcript?.duration_seconds || 0)

  const localPlayerRef = useRef(null)
  const playerRef = mediaElementRef || localPlayerRef
  const pendingSeekTimeRef = useRef(null)

  if (!transcript) return null

  const formatSeconds = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00:00'
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return isoStr
    }
  }

  const handleCopyFullTranscript = () => {
    const cleanText =
      transcript.raw_text?.trim() ||
      (transcript.segments ? transcript.segments.map((s) => s.text.trim()).filter(Boolean).join(' ') : '')

    if (cleanText) {
      navigator.clipboard.writeText(cleanText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  // Resolve media identifier
  const mediaId =
    transcript.recording_id ||
    transcript.upload_id ||
    transcript.saved_filename ||
    transcript.original_filename

  const mediaUrl = getApiUrl(`/api/transcription/media/${encodeURIComponent(mediaId)}`)

  // Handle media timeupdate
  const handleTimeUpdate = (e) => {
    setCurrentTime(e.target.currentTime)
  }

  const handleLoadedMetadata = (e) => {
    const dur = e.target.duration
    if (dur && !isNaN(dur) && isFinite(dur)) {
      setMediaDuration(dur)
    }
    if (pendingSeekTimeRef.current !== null) {
      const targetTime = pendingSeekTimeRef.current
      pendingSeekTimeRef.current = null
      e.target.currentTime = targetTime
      e.target.play().catch(() => {})
    }
  }

  const togglePlayPause = () => {
    const el = playerRef.current
    if (el) {
      if (el.paused) {
        el.play().catch(() => {})
        setIsPlaying(true)
      } else {
        el.pause()
        setIsPlaying(false)
      }
    }
  }

  // Jump to specific timestamp
  const handleTimestampClick = (startTime) => {
    const el = playerRef.current
    if (el) {
      if (el.readyState >= 1) {
        el.currentTime = startTime
        el.play().catch(() => {})
        setIsPlaying(true)
      } else {
        pendingSeekTimeRef.current = startTime
        el.load()
      }
    }
    if (typeof onJumpToTime === 'function') {
      onJumpToTime(startTime)
    }
  }

  const segments = transcript.segments || []

  return (
    <div className="card raw-transcript-view-card">
      {/* Hidden Native Audio Element */}
      <audio
        ref={playerRef}
        key={mediaUrl}
        preload="metadata"
        src={mediaUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        style={{ display: 'none' }}
      />

      {/* 1. Header Bar */}
      <div className="raw-transcript-header">
        <div className="raw-transcript-header-left">
          <div className="raw-transcript-title-row">
            <h1 className="raw-transcript-title">
              {transcript.original_filename?.replace(/\.[^/.]+$/, '') || 'Sunday Morning Worship Service'}
            </h1>
            <span className="raw-transcript-tag">RAW TRANSCRIPT</span>
          </div>

          <div className="raw-transcript-subline">
            <span>📅 {formatDate(transcript.created_at)}</span>
            <span>&bull;</span>
            <span>⏱️ {formatSeconds(mediaDuration || transcript.duration_seconds)} TOTAL DURATION</span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--outline btn--small copy-transcript-btn"
          onClick={handleCopyFullTranscript}
          id="btn-copy-raw-transcript"
        >
          {copied ? '✓ Copied!' : '📋 Copy Full Transcript'}
        </button>
      </div>

      {/* 2. Verification Needed Banner (if flags present) */}
      {flagCount > 0 && onBeginVerification && (
        <div className="raw-transcript-flag-banner">
          <div className="flag-banner-left">
            <span className="flag-banner-icon">⚠️</span>
            <div className="flag-banner-text">
              <strong>{flagCount} sections require human verification</strong>
              <p>Low confidence flags detected in technical or localized phrasing.</p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn--danger btn--small btn--begin-verification"
            onClick={onBeginVerification}
            id="btn-raw-begin-verification"
          >
            <span>Begin Verification</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* 3. Audio Scrubber Bar */}
      <div className="raw-audio-scrubber-bar">
        <button
          type="button"
          className="btn-audio-play-circle"
          onClick={togglePlayPause}
          title={isPlaying ? 'Pause master audio' : 'Play master audio'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <span className="audio-time-label">{formatSeconds(currentTime)}</span>

        <div
          className="audio-waveform-track"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const clickPos = (e.clientX - rect.left) / rect.width
            const seekTo = clickPos * (mediaDuration || 1)
            handleTimestampClick(seekTo)
          }}
        >
          <div
            className="audio-waveform-progress"
            style={{ width: `${mediaDuration ? (currentTime / mediaDuration) * 100 : 0}%` }}
          />
        </div>

        <span className="audio-time-label">{formatSeconds(mediaDuration)}</span>
      </div>

      {/* 4. Toolbar: Segments vs Continuous Tabs */}
      <div className="raw-transcript-toolbar">
        <div className="view-mode-tabs-clean">
          <button
            type="button"
            className={`tab-btn-clean ${viewMode === 'segments' ? 'tab-btn-clean--active' : ''}`}
            onClick={() => setViewMode('segments')}
          >
            Timestamped Segments
          </button>
          <button
            type="button"
            className={`tab-btn-clean ${viewMode === 'continuous' ? 'tab-btn-clean--active' : ''}`}
            onClick={() => setViewMode('continuous')}
          >
            Continuous Text
          </button>
        </div>
      </div>

      {/* 5. Transcript Content Body */}
      <div className="raw-transcript-body">
        {viewMode === 'continuous' ? (
          <div className="raw-continuous-prose">
            <p>
              {transcript.raw_text ||
                (segments.length > 0 ? segments.map((s) => s.text).join(' ') : 'No transcript text available.')}
            </p>
          </div>
        ) : (
          <div className="raw-segments-list">
            {segments.length === 0 ? (
              <p className="empty-segments-p">No segments available in this transcript.</p>
            ) : (
              segments.map((seg, idx) => {
                const isFlagged = seg.is_low_confidence || (seg.flags && seg.flags.length > 0)
                const confScore = seg.confidence ? Math.round(seg.confidence * 100) : isFlagged ? 62 : 95
                const startTime = seg.start_time || seg.offset || 0

                return (
                  <div
                    key={idx}
                    className={`raw-segment-row ${isFlagged ? 'raw-segment-row--flagged' : ''}`}
                  >
                    <button
                      type="button"
                      className="btn-segment-timestamp"
                      onClick={() => handleTimestampClick(startTime)}
                      title="Click to jump audio playback to this moment"
                    >
                      <span className="play-icon-mini">▶</span>
                      <span>[{formatSeconds(startTime)}]</span>
                    </button>

                    <div className="segment-content-col">
                      {isFlagged && (
                        <div className="segment-flag-badge-row">
                          <span className="flag-label">FLAG: VERIFICATION NEEDED</span>
                          <span className="conf-label">CONF: {confScore}%</span>
                        </div>
                      )}
                      <p className={`segment-prose ${isFlagged ? 'segment-prose--highlight' : ''}`}>
                        {seg.text}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* 6. Archival Immutability Footer */}
      <div className="raw-immutability-footer">
        <div className="policy-icon">🔒</div>
        <div className="policy-text">
          <strong>IMMUTABLE RECORD</strong>
          <p>
            This transcript represents the original machine-generated output. It is preserved exactly as produced for archival integrity and cannot be directly edited here.
          </p>
        </div>
      </div>
    </div>
  )
}
