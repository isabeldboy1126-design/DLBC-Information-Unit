import { Icon } from '../common/Icon'
import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl } from '../../config'

/**
 * YouTubeSessionView — Dedicated YouTube Ingestion Interface.
 * 
 * Supports:
 * - URL analysis and validation for both recorded videos and live streams.
 * - Dynamic metadata extraction (title, channel, duration, thumbnail, live status).
 * - Optional programme / event assignment.
 * - Recorded video background transcription with real progress tracking and bot fallback.
 * - High-reliability browser tab-audio capture for YouTube Live broadcasts and playback.
 * - Seamless transition to the session workspace upon completion.
 */
export function YouTubeSessionView({
  onBack,
  onOpenSession,
  onStartTabCapture,
  liveAudio,
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

  // Helper to compile session metadata
  const getSessionMetadata = () => {
    const progName = currentProgramme?.name || 'Sunday Worship Service'
    const sessName = currentProgrammeSessions.find((s) => s.id === selectedSessionId)?.name || ''
    return {
      title: customTitle.trim() || videoMeta?.title || 'YouTube Session',
      programme: progName,
      programme_session: sessName,
      minister: minister.trim(),
      message_title: customTitle.trim() || videoMeta?.title || '',
      source_type: 'youtube_tab',
      youtube_url: videoMeta?.url || '',
      thumbnail: videoMeta?.thumbnail || '',
    }
  }

  // 2. Start Tab Audio Capture (Browser Tab DisplayMedia Stream)
  const handleStartTabCapture = async () => {
    if (!videoMeta || !onStartTabCapture) return
    setJobError('')
    const meta = getSessionMetadata()
    try {
      await onStartTabCapture(meta)
    } catch (err) {
      setJobError(err.message || 'Failed to initiate tab audio capture.')
    }
  }

  // 3. Start Recorded Automatic Server-Side Transcription
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
        <h1 className="youtube-session-title">YouTube Session</h1>
      </div>

      {/* 2. URL Input Card */}
      <div className="card youtube-input-card">
        <form onSubmit={handleAnalyzeUrl} className="youtube-url-form">
          <div className="form-group youtube-url-group">
            <label className="form-label" htmlFor="youtube-url-input">
              YouTube video, shorts or live broadcast
            </label>
            <div className="youtube-input-flex">
              <input
                id="youtube-url-input"
                type="text"
                className="form-control youtube-url-field"
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={isAnalyzing || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
              />
              <button
                type="submit"
                className={`btn youtube-analyze-btn ${
                  !youtubeUrl.trim() || isAnalyzing || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'
                    ? 'youtube-analyze-btn--disabled'
                    : 'youtube-analyze-btn--enabled'
                }`}
                disabled={isAnalyzing || !youtubeUrl.trim() || activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
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
          </div>
        </form>

        {analysisError && (
          <div className="youtube-error-banner">
            <span>⚠ {analysisError}</span>
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
                    disabled={activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
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
                    disabled={activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
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
                    disabled={activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
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
                    disabled={activeJob?.status === 'preparing' || activeJob?.status === 'transcribing'}
                  />
                </div>
              </div>

              {/* Action Cards / Selection */}
              {!activeJob && (
                <div className="youtube-action-container" style={{ marginTop: '1.25rem' }}>
                  {videoMeta.is_live ? (
                    /* -------------------------------------------------- */
                    /* LIVE BROADCAST INGESTION MODES                     */
                    /* -------------------------------------------------- */
                    <div className="youtube-live-options-card">
                      <div className="tab-capture-hero-box">
                        <div className="tab-hero-header">
                          <span className="live-pulse-dot">●</span>
                          <h3 className="tab-hero-title">YouTube Live Audio Capture</h3>
                        </div>
                        <p className="tab-hero-desc">
                          Transcribes the live broadcast directly through your browser using tab-audio capture.
                        </p>

                        <div className="tab-guide-steps-list">
                          <div className="tab-guide-step-item">
                            <span className="step-circle">1</span>
                            <div className="step-content">
                              <span>Open the YouTube live stream in a separate browser tab and ensure playback is active.</span>
                              <div style={{ marginTop: '0.4rem' }}>
                                <button
                                  type="button"
                                  className="btn btn--outline btn--small"
                                  onClick={() => window.open(videoMeta.url, '_blank')}
                                >
                                  ↗ Open YouTube Live Stream
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="tab-guide-step-item">
                            <span className="step-circle">2</span>
                            <div className="step-content">
                              <span>Return to this DLBC app tab.</span>
                            </div>
                          </div>

                          <div className="tab-guide-step-item">
                            <span className="step-circle">3</span>
                            <div className="step-content">
                              <span>Click <strong>"Capture YouTube Tab Audio"</strong> below, select the YouTube tab, and make sure <strong>"Share tab audio"</strong> is enabled in the browser prompt.</span>
                            </div>
                          </div>
                        </div>

                        <div className="tab-hero-cta" style={{ marginTop: '1.2rem' }}>
                          <button
                            type="button"
                            className="btn btn--primary btn--large"
                            onClick={handleStartTabCapture}
                          >
                            <span> Capture YouTube Tab Audio</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : videoMeta.is_upcoming ? (
                    <div className="alert alert--info">
                      This live stream is scheduled and has not started broadcasting yet.
                    </div>
                  ) : (
                    /* -------------------------------------------------- */
                    /* RECORDED VIDEO INGESTION MODES                     */
                    /* -------------------------------------------------- */
                    <div className="youtube-recorded-options-grid">
                      {/* Option 1: Automatic Server-Side */}
                      <div className="recorded-option-card">
                        <div className="recorded-opt-header">
                          <h3 className="recorded-opt-title">⚡ Process Automatically</h3>
                          <span className="opt-tag">Fastest</span>
                        </div>
                        <p className="recorded-opt-desc">
                          Extracts and transcribes audio directly on the server in the background. Best for standard recorded messages.
                        </p>
                        <button
                          type="button"
                          className="btn btn--primary"
                          style={{ width: '100%', marginTop: 'auto' }}
                          onClick={handleStartRecordedTranscription}
                        >
                          <span>Process Automatically →</span>
                        </button>
                      </div>

                      {/* Option 2: Browser Tab Playback Capture */}
                      <div className="recorded-option-card">
                        <div className="recorded-opt-header">
                          <h3 className="recorded-opt-title"> Transcribe Through Playback</h3>
                          <span className="opt-tag opt-tag--secondary">100% Reliable</span>
                        </div>
                        <p className="recorded-opt-desc">
                          Plays the video in your browser and captures tab audio live. Completely immune to YouTube bot restrictions.
                        </p>
                        <button
                          type="button"
                          className="btn btn--outline"
                          style={{ width: '100%', marginTop: 'auto' }}
                          onClick={() => {
                            window.open(videoMeta.url, '_blank')
                            handleStartTabCapture()
                          }}
                        >
                          <span>Play & Capture Tab Audio</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {jobError && (
                <div className="youtube-error-banner" style={{ marginTop: '1rem' }}>
                  <span>⚠ {jobError}</span>
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
                <div className="youtube-bot-fallback-box" style={{ marginTop: '1.25rem' }}>
                  <div className="bot-fallback-header">
                    <span style={{ fontSize: '1.4rem' }}><Icon name="alert" /></span>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--color-warning, #f59e0b)' }}>
                        YouTube Server Access Restricted
                      </h4>
                      <p style={{ margin: '0.3rem 0 0', color: 'var(--color-text-secondary, #cbd5e1)', fontSize: '0.9rem' }}>
                        YouTube is blocking automatic server-side downloading for this video.
                        You can still transcribe it in full by playing it in your browser and capturing the tab's audio.
                      </p>
                    </div>
                  </div>

                  <div className="bot-fallback-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => {
                        window.open(videoMeta.url, '_blank')
                        handleStartTabCapture()
                      }}
                    >
                      <span> Transcribe Through Browser Playback</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--outline"
                      onClick={() => window.open(videoMeta.url, '_blank')}
                    >
                      <span>↗ Open in YouTube</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

