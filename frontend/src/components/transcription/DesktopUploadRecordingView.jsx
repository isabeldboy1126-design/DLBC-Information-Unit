import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl, authFetch } from '../../config'

export function DesktopUploadRecordingView({
  onEnterProcessing,
  onBack,
  initialFile = null,
}) {
  const [file, setFile] = useState(initialFile || null)
  const [programmes, setProgrammes] = useState([])
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [dayNumber, setDayNumber] = useState('')
  const [minister, setMinister] = useState('')
  const [messageTitle, setMessageTitle] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [isLoadingProgrammes, setIsLoadingProgrammes] = useState(true)

  const fileInputRef = useRef(null)

  // Fetch active configured programmes
  useEffect(() => {
    let isMounted = true
    async function loadProgrammes() {
      try {
        setIsLoadingProgrammes(true)
        const res = await fetch(getApiUrl('/api/programmes?include_archived=false'))
        if (res.ok && isMounted) {
          const data = await res.json()
          setProgrammes(data)
          if (data.length > 0) {
            const first = data[0]
            setSelectedProgrammeId(first.id)
            const activeSessions = (first.sessions || []).filter((s) => !s.is_archived)
            if (activeSessions.length > 0) {
              setSelectedSessionId(activeSessions[0].id)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load programmes:', err)
      } finally {
        if (isMounted) setIsLoadingProgrammes(false)
      }
    }
    loadProgrammes()
    return () => { isMounted = false }
  }, [])

  const currentProgramme = programmes.find((p) => p.id === selectedProgrammeId) || programmes[0]
  const currentProgrammeSessions = (currentProgramme?.sessions || []).filter((s) => !s.is_archived)
  const currentSession = currentProgrammeSessions.find((s) => s.id === selectedSessionId) || currentProgrammeSessions[0]

  const handleProgrammeChange = (progId) => {
    setSelectedProgrammeId(progId)
    const target = programmes.find((p) => p.id === progId)
    const activeSessions = (target?.sessions || []).filter((s) => !s.is_archived)
    if (activeSessions.length > 0) {
      setSelectedSessionId(activeSessions[0].id)
    } else {
      setSelectedSessionId('')
    }
  }

  const performUpload = async (targetFile) => {
    const f = targetFile || file
    if (!f) {
      setUploadError('Please select an audio or video file to upload.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      // 1. Upload audio/video file
      const formData = new FormData()
      formData.append('file', f)

      const uploadRes = await authFetch('/api/transcription/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const errJson = await uploadRes.json().catch(() => ({}))
        throw new Error(errJson.detail || 'Failed to upload recorded file.')
      }

      const uploadData = await uploadRes.json()
      const uploadId = uploadData.upload?.upload_id

      if (!uploadId) {
        throw new Error('Server did not return an upload identifier.')
      }

      // 2. Compute metadata and title
      const progName = currentProgramme?.name || 'Uploaded Service'
      const sessName = currentSession?.name || ''
      const parsedDay = dayNumber ? parseInt(dayNumber, 10) : null
      const computedTitle = sessName
        ? `${progName} — ${sessName}${messageTitle.trim() ? ': ' + messageTitle.trim() : ''}`
        : `${progName}${messageTitle.trim() ? ': ' + messageTitle.trim() : ''}`

      // 3. Initiate background transcription and automatic pipeline
      const transcribeRes = await authFetch(`/api/transcription/transcribe/${encodeURIComponent(uploadId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: computedTitle.trim(),
          programme: progName,
          session_name: sessName,
          minister: minister.trim(),
          day_number: parsedDay && parsedDay > 0 ? parsedDay : null,
          language_code: 'en-US',
        }),
      })

      if (!transcribeRes.ok) {
        const errJson = await transcribeRes.json().catch(() => ({}))
        throw new Error(errJson.detail || 'Failed to start transcription job.')
      }

      const expectedSessionId = `session_${uploadId}`

      // 4. Enter the unified automatic processing experience!
      if (onEnterProcessing) {
        onEnterProcessing(expectedSessionId)
      }
    } catch (err) {
      console.error('Upload and process error:', err)
      setUploadError(err.message || 'Error uploading file.')
      setIsUploading(false)
    }
  }

  const handleUploadAndProcess = () => performUpload(file)

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setUploadError(null)
      await performUpload(selected)
    }
  }

  return (
    <div className="desktop-upload-view-container">
      {/* ------------------------------------------------------------- */}
      {/* MOBILE UPLOAD RECORDING VIEW (Matching Reference Screen 10)   */}
      {/* ------------------------------------------------------------- */}
      <div className="mobile-upload-view-layout">
        <div className="mobile-subpage-header">
          <button
            type="button"
            className="mobile-header-back-btn"
            onClick={onBack}
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="mobile-header-title">Upload Recording</h1>
          <div style={{ width: 36 }} />
        </div>

        {uploadError && (
          <div className="new-session-alert">
            <span>⚠️ {uploadError}</span>
          </div>
        )}

        {/* Big Upload Drop Box */}
        <div
          className="mobile-upload-hero-box"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <div className="mobile-upload-cloud-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h2 className="mobile-upload-box-title">Select audio file</h2>
          <p className="mobile-upload-box-sub">
            {isUploading ? 'Uploading and preparing pipeline...' : 'Tap to browse or choose a file'}
          </p>

          <div className="mobile-upload-formats-pill">
            <span className="mobile-formats-label">Supported formats:</span>
            <span className="mobile-formats-types">MP3, WAV, M4A, AAC, OGG</span>
          </div>
        </div>

        {/* Or choose from device */}
        <div className="mobile-upload-options-section">
          <h3 className="mobile-upload-options-heading">Or choose from device</h3>

          <div className="mobile-upload-options-list">
            <button
              type="button"
              className="mobile-upload-option-row"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <div className="mobile-option-left">
                <span className="mobile-option-icon">🎵</span>
                <span className="mobile-option-label">Audio files</span>
              </div>
              <span className="mobile-chevron">›</span>
            </button>

            <button
              type="button"
              className="mobile-upload-option-row"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <div className="mobile-option-left">
                <span className="mobile-option-icon">📥</span>
                <span className="mobile-option-label">Downloads</span>
              </div>
              <span className="mobile-chevron">›</span>
            </button>

            <button
              type="button"
              className="mobile-upload-option-row"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <div className="mobile-option-left">
                <span className="mobile-option-icon">📁</span>
                <span className="mobile-option-label">Browse files</span>
              </div>
              <span className="mobile-chevron">›</span>
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DESKTOP UPLOAD RECORDING VIEW (Unchanged Desktop Layout)       */}
      {/* ------------------------------------------------------------- */}
      <div className="desktop-upload-layout">
        <div className="new-session-header">
          <h1 className="new-session-title">Upload Recording</h1>
        </div>

        {uploadError && (
          <div className="new-session-alert">
            <span>⚠️ {uploadError}</span>
          </div>
        )}

        <div className="new-session-grid">
          {/* Left Column: Metadata */}
          <div className="card new-session-card">
            <div className="card-header new-session-card-header">
              <div className="card-header-icon-title">
                <span className="card-icon">📄</span>
                <h3>Session Metadata</h3>
              </div>
            </div>

          <div className="card-body new-session-card-body">
            {/* Programme / Event */}
            <div className="form-group">
              <label className="form-label" htmlFor="upload-select-programme">
                Programme / Event *
              </label>
              {isLoadingProgrammes ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading configured programmes...</div>
              ) : programmes.length === 0 ? (
                <select id="upload-select-programme" className="form-control form-select" disabled>
                  <option>No programmes configured in Settings</option>
                </select>
              ) : (
                <select
                  id="upload-select-programme"
                  className="form-control form-select"
                  value={selectedProgrammeId}
                  onChange={(e) => handleProgrammeChange(e.target.value)}
                  disabled={isUploading}
                >
                  {programmes.map((prog) => (
                    <option key={prog.id} value={prog.id}>
                      {prog.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Session / Section & Day */}
            <div className="form-row-2col">
              <div className="form-group" style={{ flex: 3 }}>
                <label className="form-label" htmlFor="upload-select-session">
                  Session / Section
                </label>
                {currentProgrammeSessions.length === 0 ? (
                  <select id="upload-select-session" className="form-control form-select" disabled>
                    <option>General Session</option>
                  </select>
                ) : (
                  <select
                    id="upload-select-session"
                    className="form-control form-select"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    disabled={isUploading}
                  >
                    {currentProgrammeSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group" style={{ flex: 1, minWidth: '95px' }}>
                <label className="form-label" htmlFor="upload-day-number">
                  Day
                </label>
                <input
                  type="number"
                  id="upload-day-number"
                  className="form-control"
                  placeholder="e.g. 2"
                  min="1"
                  max="365"
                  value={dayNumber}
                  onChange={(e) => setDayNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={isUploading}
                />
              </div>
            </div>

            {/* Pastor / Minister */}
            <div className="form-group">
              <label className="form-label" htmlFor="upload-input-minister">
                Pastor / Minister
              </label>
              <input
                type="text"
                id="upload-input-minister"
                className="form-control"
                placeholder="e.g. Pastor W.F. Kumuyi"
                value={minister}
                onChange={(e) => setMinister(e.target.value)}
                disabled={isUploading}
              />
            </div>

            {/* Message Title (Optional) */}
            <div className="form-group">
              <label className="form-label" htmlFor="upload-message-title">
                Message Title (Optional)
              </label>
              <input
                type="text"
                id="upload-message-title"
                className="form-control"
                placeholder="Theme or message topic (optional)"
                value={messageTitle}
                onChange={(e) => setMessageTitle(e.target.value)}
                disabled={isUploading}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Audio File & Action */}
        <div className="card new-session-card">
          <div className="card-header new-session-card-header">
            <div className="card-header-icon-title">
              <span className="card-icon">📁</span>
              <h3>Audio File</h3>
            </div>
          </div>

          <div className="card-body new-session-card-body">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".wav,.mp3,.m4a,.flac,.ogg,.mp4,.mov,.webm"
              style={{ display: 'none' }}
            />

            <div
              className={`file-dropzone-box ${file ? 'file-dropzone-box--has-file' : ''}`}
              onClick={() => !isUploading && fileInputRef.current?.click()}
            >
              {file ? (
                <div className="dropzone-file-info">
                  <span className="file-icon-large">🎵</span>
                  <div className="file-text-details">
                    <span className="file-name-bold">{file.name}</span>
                    <span className="file-meta-sub">{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--subtle btn--sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                    }}
                    disabled={isUploading}
                  >
                    Change File
                  </button>
                </div>
              ) : (
                <div className="dropzone-empty-prompt">
                  <span className="dropzone-icon">📥</span>
                  <p className="dropzone-title">Click to select audio recording</p>
                  <p className="dropzone-sub">Supports WAV, MP3, M4A, FLAC, and MP4 video recordings</p>
                </div>
              )}
            </div>

            <div className="upload-actions-wrapper" style={{ marginTop: '2rem' }}>
              <button
                type="button"
                className="btn btn--primary btn--start-recording"
                id="btn-upload-and-process"
                onClick={handleUploadAndProcess}
                disabled={isUploading || !file}
                style={{ width: '100%', padding: '0.85rem' }}
              >
                {isUploading ? (
                  <span>Uploading & Starting Processing...</span>
                ) : (
                  <span>Upload and Process →</span>
                )}
              </button>

              {onBack && (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={onBack}
                  disabled={isUploading}
                  style={{ width: '100%', marginTop: '0.75rem' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
