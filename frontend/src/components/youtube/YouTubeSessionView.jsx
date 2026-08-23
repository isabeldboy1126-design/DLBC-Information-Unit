import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl } from '../../config'

/**
 * YouTubeSessionView — Dedicated YouTube Ingestion Interface.
 * 
 * Supports:
 * - URL analysis and validation for both recorded videos and live streams.
 * - Dynamic metadata extraction (title, channel, duration, thumbnail, live status).
 * - Optional programme / event assignment.
 * - Recorded video background transcription with real progress tracking.
 * - Server-side YouTube Live stream transcription with real-time ticker and stop action.
 * - Seamless transition to the session workspace upon completion.
 */
export function YouTubeSessionView({
  onBack,
  onOpenSession,
}) {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [videoMeta, setVideoMeta] = useState(null)

  // Configured programmes from settings
  const [programmes, setProgrammes] = useState([])
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [minister, setMinister] = useState('')
  const [customTitle, setCustomTitle] = useState('')

  // Recorded flow state
  const [activeJob, setActiveJob] = useState(null)
  const [jobError, setJobError] = useState('')
  const pollIntervalRef = useRef(null)

  // Live stream flow state
  const [liveSessionId, setLiveSessionId] = useState(null)
  const [isLiveActive, setIsLiveActive] = useState(false)
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0)
  const [liveSegments, setLiveSegments] = useState([])
  const [liveInterimText, setLiveInterimText] = useState('')
  const [isStoppingLive, setIsStoppingLive] = useState(false)
  const livePollIntervalRef = useRef(null)

  // Load configured programmes
  useEffect(() => {
    let isMounted = true
    async function loadProgrammes() {
      try {
        const res = await fetch(getApiUrl('/api/programmes?include_archived=false'))
        if (res.ok && isMounted) {
          const data = await res.json()
          setProgrammes(data)
          if (data.length > 0) {
            setSelectedProgrammeId(data[0].id)
            const activeSess = (data[0].sessions || []).filter((s) => !s.is_archived)
            if (activeSess.length > 0) setSelectedSessionId(activeSess[0].id)
          }
        }
      } catch (err) {
        console.error('Error fetching programmes:', err)
      }
    }
    loadProgrammes()
    return () => { isMounted = false }
  }, [])

  // Cleanup polling timers on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (livePollIntervalRef.current) clearInterval(livePollIntervalRef.current)
    }
  }, [])

  const currentProgramme = programmes.find((p) => p.id === selectedProgrammeId) || programmes[0]
  const currentProgrammeSessions = (currentProgramme?.sessions || []).filter((s) => !s.is_archived)

  const handleProgrammeChange = (progId) => {
    setSelectedProgrammeId(progId)
    const targetProg = programmes.find((p) => p.id === progId)
    const activeSess = (targetProg?.sessions || []).filter((s) => !s.is_archived)
    if (activeSess.length > 0) {
      setSelectedSessionId(activeSess[0].id)
    } else {
      setSelectedSessionId('')
    }
  }

  // 1. Analyze YouTube URL
  const handleAnalyzeUrl = async (e) => {
    if (e) e.preventDefault()
    const trimmed = youtubeUrl.trim()
    if (!trimmed) {
      setAnalysisError('Please enter a YouTube link.')
      return
    }

    setIsAnalyzing(true)
    setAnalysisError('')
    setVideoMeta(null)
    setActiveJob(null)
    setJobError('')
    setLiveSessionId(null)
    setIsLiveActive(false)

    try {
      const res = await fetch(getApiUrl('/api/youtube/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to inspect YouTube URL.')
      }

      setVideoMeta(data.metadata)
      setCustomTitle(data.metadata.title || '')
    } catch (err) {
      setAnalysisError(err.message || 'Unable to access YouTube stream.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // 2. Start Recorded Transcription
  const handleStartRecordedTranscription = async () => {
    if (!videoMeta) return
    setJobError('')

    const progName = currentProgramme?.name || 'Sunday Worship Service'
    const sessName = currentProgrammeSessions.find((s) => s.id === selectedSessionId)?.name || ''

    try {
      const res = await fetch(getApiUrl('/api/youtube/transcribe-recorded'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoMeta.url,
          title: customTitle.trim() || videoMeta.title,
          programme: progName,
          programme_session: sessName,
          minister: minister.trim(),
          language_code: 'en-NG',
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to start transcription.')
      }

      setActiveJob(data.job)

      // Start Polling
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(getApiUrl(`/api/transcription/jobs/${data.job.job_id}`))
          if (pollRes.ok) {
            const pollData = await pollRes.json()
            setActiveJob(pollData.job)
            if (pollData.job.status === 'completed' || pollData.job.status === 'failed') {
              clearInterval(pollIntervalRef.current)
            }
          }
        } catch (pollErr) {
          console.error('Job poll error:', pollErr)
        }
      }, 1500)
    } catch (err) {
      setJobError(err.message || 'Error starting recorded transcription.')
    }
  }

  // 3. Start YouTube Live Stream Transcription
  const handleStartLiveTranscription = async () => {
    if (!videoMeta) return
    setJobError('')

    const progName = currentProgramme?.name || 'Sunday Worship Service'
    const sessName = currentProgrammeSessions.find((s) => s.id === selectedSessionId)?.name || ''

    try {
      const res = await fetch(getApiUrl('/api/youtube/live/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoMeta.url,
          title: customTitle.trim() || videoMeta.title,
          programme: progName,
          programme_session: sessName,
          minister: minister.trim(),
          message_title: customTitle.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to start YouTube Live stream.')
      }

      setLiveSessionId(data.session_id)
      setIsLiveActive(true)

      // Start Live Polling
      if (livePollIntervalRef.current) clearInterval(livePollIntervalRef.current)
      livePollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(getApiUrl(`/api/youtube/live/status/${data.session_id}`))
          if (statusRes.ok) {
            const statusData = await statusRes.json()
            setLiveElapsedSeconds(statusData.elapsed_seconds || 0)
            setLiveSegments(statusData.segments || [])
            setLiveInterimText(statusData.interim_text || '')
            if (statusData.status === 'completed' || statusData.status === 'stream_ended') {
              setIsLiveActive(false)
              clearInterval(livePollIntervalRef.current)
            }
          }
        } catch (pollErr) {
          console.error('Live poll error:', pollErr)
        }
      }, 1200)
    } catch (err) {
      setJobError(err.message || 'Error starting live stream transcription.')
    }
  }

  // 4. Stop YouTube Live Transcription
  const handleStopLive = async () => {
    if (!liveSessionId) return
    setIsStoppingLive(true)
    try {
      await fetch(getApiUrl(`/api/youtube/live/stop/${liveSessionId}`), {
        method: 'POST',
      })
      setIsLiveActive(false)
      if (livePollIntervalRef.current) clearInterval(livePollIntervalRef.current)
    } catch (err) {
      console.error('Error stopping live stream:', err)
    } finally {
      setIsStoppingLive(false)
    }
  }

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '—'
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (hours > 0) return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
    return `${pad(mins)}:${pad(secs)}`
  }

  return (
    <div className="youtube-session-page-container">
      {/* 1. Header */}
      <div className="youtube-session-header">
        <div>
          <h1 className="youtube-session-title">YouTube Session</h1>
          <p className="youtube-session-subtitle">
            Ingest and transcribe recorded YouTube messages or live broadcasts with Azure Speech.
          </p>
        </div>

        <button type="button" className="btn btn--outline btn--small" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>

      {/* 2. URL Input Card */}
      <div className="card youtube-input-card">
        <form onSubmit={handleAnalyzeUrl} className="youtube-url-form">
          <div className="form-group youtube-url-group">
            <label className="form-label" htmlFor="youtube-url-input">
              YouTube Video or Live Stream URL *
            </label>
            <div className="youtube-input-flex">
              <input
                id="youtube-url-input"
                type="text"
                className="form-control youtube-url-field"
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={isAnalyzing || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing' || isLiveActive}
              />
              <button
                type="submit"
                className="btn btn--primary youtube-analyze-btn"
                disabled={isAnalyzing || !youtubeUrl.trim() || isLiveActive || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
              >
                {isAnalyzing ? (
                  <>
                    <span className="spinner spinner--small" />
                    <span>Analysing...</span>
                  </>
                ) : (
                  <span>Analyse Link</span>
                )}
              </button>
            </div>
            <span className="form-help-text">
              Supports standard YouTube videos, YouTube Live broadcasts, and youtu.be shortlinks.
            </span>
          </div>
        </form>

        {analysisError && (
          <div className="youtube-error-banner">
            <span>⚠️ {analysisError}</span>
          </div>
        )}
      </div>

      {/* 3. Analyzed Metadata & Configuration Card */}
      {videoMeta && (
        <div className="card youtube-meta-card">
          <div className="youtube-meta-grid">
            {/* Thumbnail Preview */}
            <div className="youtube-thumbnail-container">
              {videoMeta.thumbnail ? (
                <img
                  src={videoMeta.thumbnail}
                  alt={videoMeta.title}
                  className="youtube-thumbnail-img"
                />
              ) : (
                <div className="youtube-thumbnail-placeholder">
                  <span>▶</span>
                </div>
              )}
              <div className="youtube-badge-row">
                {videoMeta.is_live ? (
                  <span className="status-badge badge--live">● LIVE BROADCAST</span>
                ) : videoMeta.is_upcoming ? (
                  <span className="status-badge badge--default">⏰ UPCOMING STREAM</span>
                ) : (
                  <span className="status-badge badge--completed">
                    ⏱ {formatDuration(videoMeta.duration_seconds)}
                  </span>
                )}
              </div>
            </div>

            {/* Video Details & Form */}
            <div className="youtube-details-container">
              <h2 className="youtube-video-title">{videoMeta.title}</h2>
              <p className="youtube-channel-name">Channel: <strong>{videoMeta.channel}</strong></p>

              {/* Form Metadata */}
              <div className="form-row-2col" style={{ marginTop: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="yt-prog-select">Programme / Event</label>
                  <select
                    id="yt-prog-select"
                    className="form-control form-select"
                    value={selectedProgrammeId}
                    onChange={(e) => handleProgrammeChange(e.target.value)}
                    disabled={isLiveActive || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
                  >
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="yt-sess-select">Session / Section</label>
                  <select
                    id="yt-sess-select"
                    className="form-control form-select"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    disabled={isLiveActive || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
                  >
                    {currentProgrammeSessions.length === 0 ? (
                      <option>General Session</option>
                    ) : (
                      currentProgrammeSessions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="form-row-2col">
                <div className="form-group">
                  <label className="form-label" htmlFor="yt-minister">Preacher / Minister</label>
                  <input
                    id="yt-minister"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Pastor W.F. Kumuyi"
                    value={minister}
                    onChange={(e) => setMinister(e.target.value)}
                    disabled={isLiveActive || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="yt-custom-title">Session Title</label>
                  <input
                    id="yt-custom-title"
                    type="text"
                    className="form-control"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    disabled={isLiveActive || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              {!activeJob && !isLiveActive && !liveSessionId && (
                <div className="youtube-action-bar">
                  {videoMeta.is_live ? (
                    <button
                      type="button"
                      className="btn btn--primary btn--large"
                      onClick={handleStartLiveTranscription}
                    >
                      <span className="live-pulse-dot" style={{ marginRight: '0.4rem' }}>●</span>
                      <span>Start Live Transcription</span>
                    </button>
                  ) : videoMeta.is_upcoming ? (
                    <div className="alert alert--info">
                      This live stream has not started broadcasting yet.
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--large"
                      onClick={handleStartRecordedTranscription}
                    >
                      <span>Start Transcription</span>
                      <span style={{ marginLeft: '0.4rem' }}>→</span>
                    </button>
                  )}
                </div>
              )}

              {jobError && (
                <div className="youtube-error-banner" style={{ marginTop: '1rem' }}>
                  <span>⚠️ {jobError}</span>
                </div>
              )}
            </div>
          </div>

          {/* 4. Active Recorded Transcription Progress */}
          {activeJob && (
            <div className="youtube-progress-section">
              <div className="youtube-progress-header">
                <div>
                  <h3 className="youtube-progress-title">
                    {activeJob.status === 'completed' ? 'Transcription Complete' : 'Processing YouTube Audio'}
                  </h3>
                  <p className="youtube-progress-sub">{activeJob.status_message}</p>
                </div>
                <span className="youtube-progress-pct">{Math.round(activeJob.progress_percent || 0)}%</span>
              </div>

              <div className="progress-bar-track">
                <div
                  className={`progress-bar-fill ${activeJob.status === 'completed' ? 'fill--success' : ''}`}
                  style={{ width: `${Math.max(5, activeJob.progress_percent || 0)}%` }}
                />
              </div>

              {activeJob.status === 'completed' && (
                <div className="youtube-complete-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--large"
                    onClick={() => {
                      const sessId = `session_${activeJob.upload_id}`
                      onOpenSession(sessId)
                    }}
                  >
                    <span>Open Session Workspace</span>
                    <span style={{ marginLeft: '0.5rem' }}>→</span>
                  </button>
                </div>
              )}

              {activeJob.status === 'failed' && (
                <div className="youtube-error-banner" style={{ marginTop: '1rem' }}>
                  <span>⚠️ Error: {activeJob.error || 'Transcription failed.'}</span>
                </div>
              )}
            </div>
          )}

          {/* 5. Active YouTube Live Stream Monitor */}
          {(isLiveActive || liveSessionId) && (
            <div className="youtube-live-monitor-section">
              <div className="youtube-live-monitor-header">
                <div className="live-header-left">
                  <span className="status-badge badge--live">● YOUTUBE LIVE</span>
                  <span className="live-timer-text">{formatDuration(liveElapsedSeconds)}</span>
                  <span className="live-azure-badge">Azure Speech: en-NG</span>
                </div>

                <div className="live-header-right">
                  {isLiveActive ? (
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      onClick={handleStopLive}
                      disabled={isStoppingLive}
                    >
                      {isStoppingLive ? 'Finalizing...' : '⏹ Stop YouTube Transcription'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={() => onOpenSession(liveSessionId)}
                    >
                      <span>Open Session Workspace →</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Real-time Ticker */}
              <div className="youtube-live-ticker-box">
                <span className="ticker-label">Live Hypotheses:</span>
                <p className="ticker-text">
                  {liveInterimText || (liveSegments.length > 0 ? liveSegments[liveSegments.length - 1].text : 'Ingesting audio stream from YouTube broadcast...')}
                  {liveInterimText && <span className="floating-typing-cursor">|</span>}
                </p>
              </div>

              {/* Live Segments List */}
              <div className="youtube-live-segments-scroll">
                {liveSegments.length === 0 ? (
                  <div className="empty-segments-notice">
                    Listening to server-side YouTube Live stream...
                  </div>
                ) : (
                  liveSegments.map((seg, idx) => (
                    <div key={idx} className="youtube-live-segment-row">
                      <span className="seg-time">[{formatDuration(seg.start_time)}]</span>
                      <span className="seg-text">{seg.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
