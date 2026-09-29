import React, { useState, useRef, useEffect } from 'react'
import { getApiUrl } from '../../config'

/**
 * RawTranscriptViewer — Simplified, restrained raw transcript page.
 * Focused strictly on:
 * 1. Recorded Audio (clean audio player with scrubber & speed control)
 * 2. Transcript (Timestamped chronological view or Plain Text continuous view)
 */
export function RawTranscriptViewer({
  transcript,
  mediaElementRef,
  onJumpToTime,
}) {
  const [viewMode, setViewMode] = useState('timestamped') // 'timestamped' | 'plain'
  const [copied, setCopied] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(transcript?.duration_seconds || 0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  const localPlayerRef = useRef(null)
  const playerRef = mediaElementRef || localPlayerRef
  const pendingSeekTimeRef = useRef(null)

  if (!transcript) return null

  const formatTimestamp = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00:00'
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (hours > 0) {
      return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
    }
    return `00:${pad(mins)}:${pad(secs)}`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return isoStr
    }
  }

  const handleCopyTranscript = () => {
    const cleanText =
      transcript.raw_text?.trim() ||
      (transcript.segments ? transcript.segments.map((s) => s.text.trim()).filter(Boolean).join(' ') : '')

    if (cleanText) {
      navigator.clipboard.writeText(cleanText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Resolve media identifier
  const mediaId =
    transcript.recording_id ||
    transcript.upload_id ||
    transcript.saved_filename ||
    transcript.original_filename

  const mediaUrl = getApiUrl(`/api/transcription/media/${encodeURIComponent(mediaId)}`)

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

  const handleSpeedChange = (e) => {
    const speed = parseFloat(e.target.value)
    setPlaybackSpeed(speed)
    if (playerRef.current) {
      playerRef.current.playbackRate = speed
    }
  }

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
  const fullText =
    transcript.raw_text ||
    (segments.length > 0 ? segments.map((s) => s.text).join(' ') : 'No transcript text available.')

  return (
    <div className="simplified-raw-transcript-view">
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

      {/* 1. Restrained Metadata Header */}
      <div className="raw-header-simple">
        <div>
          <h2 className="raw-header-title">
            {transcript.original_filename?.replace(/\.[^/.]+$/, '') || 'Raw Transcript'}
          </h2>
          <p className="raw-header-meta">
            {formatDate(transcript.created_at)} • {formatTimestamp(mediaDuration || transcript.duration_seconds)}
          </p>
        </div>

        <button
          type="button"
          className="btn btn--outline btn--small"
          onClick={handleCopyTranscript}
          id="btn-copy-raw-transcript"
        >
          {copied ? '✓ Copied' : 'Copy Transcript'}
        </button>
      </div>

      {/* 2. Recorded Audio Section */}
      <section className="raw-audio-section" aria-label="Recorded Audio">
        <h3 className="raw-section-label">Recorded Audio</h3>

        <div className="audio-player-simple">
          <button
            type="button"
            className="btn-audio-play-simple"
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <span className="audio-time-stamp">{formatTimestamp(currentTime)}</span>

          <input
            type="range"
            className="audio-scrub-slider"
            min={0}
            max={mediaDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const seekTime = parseFloat(e.target.value)
              setCurrentTime(seekTime)
              if (playerRef.current) {
                playerRef.current.currentTime = seekTime
              }
            }}
            aria-label="Audio scrubber"
          />

          <span className="audio-time-stamp audio-time-stamp--total">
            {formatTimestamp(mediaDuration)}
          </span>

          <select
            className="audio-speed-select"
            value={playbackSpeed}
            onChange={handleSpeedChange}
            aria-label="Playback speed"
          >
            <option value="1">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>
        </div>
      </section>

      {/* 3. Transcript Section */}
      <section className="raw-transcript-section" aria-label="Transcript">
        <div className="raw-transcript-subhead-row">
          <h3 className="raw-section-label">Transcript</h3>

          <div className="transcript-mode-pill-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'timestamped'}
              className={`pill-tab ${viewMode === 'timestamped' ? 'pill-tab--active' : ''}`}
              onClick={() => setViewMode('timestamped')}
            >
              Timestamped
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'plain'}
              className={`pill-tab ${viewMode === 'plain' ? 'pill-tab--active' : ''}`}
              onClick={() => setViewMode('plain')}
            >
              Plain Text
            </button>
          </div>
        </div>

        {/* View Mode: Timestamped */}
        {viewMode === 'timestamped' ? (
          <div className="transcript-timestamped-list">
            {segments.length === 0 ? (
              <p className="transcript-empty-notice">No transcript segments available.</p>
            ) : (
              segments.map((seg, idx) => {
                const startTime = seg.start_time || seg.offset || 0
                return (
                  <div
                    key={idx}
                    className="transcript-timestamped-row"
                    onClick={() => handleTimestampClick(startTime)}
                    role="button"
                    tabIndex={0}
                    title="Jump audio to this timestamp"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleTimestampClick(startTime)
                      }
                    }}
                  >
                    <span className="transcript-time-badge">
                      {formatTimestamp(startTime)}
                    </span>
                    <p className="transcript-segment-text">
                      {seg.text}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          /* View Mode: Plain Text */
          <div className="transcript-plain-container">
            <p className="transcript-plain-prose">{fullText}</p>
          </div>
        )}
      </section>
    </div>
  )
}

