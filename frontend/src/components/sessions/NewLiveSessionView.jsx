import React, { useState, useEffect } from 'react'

/**
 * NewLiveSessionView — Pre-recording configuration matching new-live-session.png.
 * 
 * Features:
 * - 2-Column Layout: Session Metadata form (Left) & Audio Source Configuration (Right)
 * - Real audio device selection (USB interface vs Built-in mic)
 * - Live input level visualizer with dB scale
 * - Auto-tests mic level upon opening so operator sees live audio levels immediately
 * - Form validation ensuring Session Name is provided before starting
 */
export function NewLiveSessionView({
  liveAudio,
  onStartRecording,
  onBack,
}) {
  const [programmes, setProgrammes] = useState([])
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [minister, setMinister] = useState('')
  const [messageTitle, setMessageTitle] = useState('')
  const [customSessionName, setCustomSessionName] = useState('')
  const [isCustomTitleEdited, setIsCustomTitleEdited] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [isLoadingProgrammes, setIsLoadingProgrammes] = useState(true)

  // Fetch active configured programmes from server
  useEffect(() => {
    let isMounted = true
    async function loadProgrammes() {
      try {
        setIsLoadingProgrammes(true)
        const res = await fetch('http://localhost:8000/api/programmes?include_archived=false')
        if (res.ok && isMounted) {
          const data = await res.json()
          setProgrammes(data)
          if (data.length > 0) {
            const firstProg = data[0]
            setSelectedProgrammeId(firstProg.id)
            const activeSessions = (firstProg.sessions || []).filter((s) => !s.is_archived)
            if (activeSessions.length > 0) {
              setSelectedSessionId(activeSessions[0].id)
            }
          }
        }
      } catch (err) {
        console.error('Error fetching programmes in NewLiveSessionView:', err)
      } finally {
        if (isMounted) setIsLoadingProgrammes(false)
      }
    }
    loadProgrammes()
    return () => { isMounted = false }
  }, [])

  // Currently selected programme object
  const currentProgramme = programmes.find((p) => p.id === selectedProgrammeId) || programmes[0]
  // Active sessions belonging to the selected programme
  const currentProgrammeSessions = (currentProgramme?.sessions || []).filter((s) => !s.is_archived)
  // Currently selected session object
  const currentSession = currentProgrammeSessions.find((s) => s.id === selectedSessionId) || currentProgrammeSessions[0]

  // When programme changes, reset selected session to first active session of that programme
  const handleProgrammeChange = (progId) => {
    setSelectedProgrammeId(progId)
    const targetProg = programmes.find((p) => p.id === progId)
    const activeSessions = (targetProg?.sessions || []).filter((s) => !s.is_archived)
    if (activeSessions.length > 0) {
      setSelectedSessionId(activeSessions[0].id)
    } else {
      setSelectedSessionId('')
    }
  }

  // Compute default session title
  const progName = currentProgramme?.name || 'Sunday Worship Service'
  const sessName = currentSession?.name || ''
  const computedDefaultTitle = sessName
    ? `${progName} — ${sessName}${messageTitle.trim() ? ': ' + messageTitle.trim() : ''}`
    : `${progName}${messageTitle.trim() ? ': ' + messageTitle.trim() : ''}`

  const effectiveSessionTitle = isCustomTitleEdited ? customSessionName : computedDefaultTitle

  // Start live test meter when component mounts
  useEffect(() => {
    if (liveAudio.permissionState === 'granted' && !liveAudio.isTesting && !liveAudio.isRecording) {
      liveAudio.startAudioTest().catch(() => {})
    }
    return () => {
      liveAudio.stopAudioTest()
    }
  }, [liveAudio.permissionState])

  const handleStart = () => {
    const finalTitle = effectiveSessionTitle.trim() || computedDefaultTitle
    if (!finalTitle) {
      setValidationError('Please specify or select a Session Title.')
      return
    }
    setValidationError('')

    // Pass structured metadata to startRecording (Message Title is completely optional)
    onStartRecording({
      title: finalTitle,
      programme: progName,
      programmeSession: sessName,
      programmeId: selectedProgrammeId,
      programmeSessionId: selectedSessionId,
      eventType: progName, // Backward compatibility
      minister: minister.trim(),
      messageTitle: messageTitle.trim(),
    })
  }

  // Calculate meter bar width % from audioLevel (0.0 to 1.0)
  const meterWidth = Math.min(100, Math.max(0, (liveAudio.audioLevel || 0) * 100))

  return (
    <div className="new-session-view-container">
      {/* Header */}
      <div className="new-session-header">
        <div>
          <h1 className="new-session-title">New Live Session</h1>
          <p className="new-session-subtitle">
            Configure session details and verify audio input before recording.
          </p>
        </div>

        <button type="button" className="btn btn--outline btn--small" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>

      {(validationError || liveAudio.error) && (
        <div className="new-session-alert">
          <span>⚠️ {validationError || liveAudio.error}</span>
        </div>
      )}

      {/* 2-Column Grid */}
      <div className="new-session-grid">
        {/* Left Column: Session Metadata */}
        <div className="card new-session-card">
          <div className="card-header new-session-card-header">
            <div className="card-header-icon-title">
              <span className="card-icon">📄</span>
              <h3>Session Metadata</h3>
            </div>
          </div>

          <div className="card-body new-session-card-body">
            {/* 1. Programme / Event Dropdown */}
            <div className="form-group">
              <label className="form-label" htmlFor="select-programme-event">
                Programme / Event *
              </label>
              {isLoadingProgrammes ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Loading configured programmes...</div>
              ) : programmes.length === 0 ? (
                <select id="select-programme-event" className="form-control form-select" disabled>
                  <option>No programmes configured in Settings</option>
                </select>
              ) : (
                <select
                  id="select-programme-event"
                  className="form-control form-select"
                  value={selectedProgrammeId}
                  onChange={(e) => handleProgrammeChange(e.target.value)}
                >
                  {programmes.map((prog) => (
                    <option key={prog.id} value={prog.id}>
                      {prog.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 2. Session / Section Dropdown (Dependent on Programme) & Minister */}
            <div className="form-row-2col">
              <div className="form-group">
                <label className="form-label" htmlFor="select-programme-session">
                  Session / Section
                </label>
                {currentProgrammeSessions.length === 0 ? (
                  <select id="select-programme-session" className="form-control form-select" disabled>
                    <option>General Session (No sections configured)</option>
                  </select>
                ) : (
                  <select
                    id="select-programme-session"
                    className="form-control form-select"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                  >
                    {currentProgrammeSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="input-minister">
                  Minister / Speaker
                </label>
                <input
                  type="text"
                  id="input-minister"
                  className="form-control"
                  placeholder="e.g. Pastor W.F. Kumuyi"
                  value={minister}
                  onChange={(e) => setMinister(e.target.value)}
                />
              </div>
            </div>

            {/* 3. Message Title (OPTIONAL) */}
            <div className="form-group">
              <label className="form-label" htmlFor="input-message-title">
                Message Title (Optional)
              </label>
              <input
                type="text"
                id="input-message-title"
                className="form-control"
                placeholder="Theme or topic of the message (optional)"
                value={messageTitle}
                onChange={(e) => setMessageTitle(e.target.value)}
              />
            </div>

            {/* 4. Session Title Preview / Override */}
            <div className="form-group" style={{ marginTop: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="input-session-name">
                  Generated Session Title
                </label>
                {isCustomTitleEdited && (
                  <button
                    type="button"
                    className="btn-link-small"
                    onClick={() => {
                      setIsCustomTitleEdited(false)
                      setCustomSessionName('')
                    }}
                    style={{ fontSize: '0.72rem', color: '#3b82f6' }}
                  >
                    ↺ Reset to auto
                  </button>
                )}
              </div>
              <input
                type="text"
                id="input-session-name"
                className="form-control"
                value={effectiveSessionTitle}
                onChange={(e) => {
                  setIsCustomTitleEdited(true)
                  setCustomSessionName(e.target.value)
                }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Audio Input & Start Action */}
        <div className="new-session-right-col">
          {/* Audio Input Card (Permanently Visible) */}
          <div className="card new-session-card">
            <div className="card-header new-session-card-header">
              <div className="card-header-icon-title">
                <span className="card-icon">🎙️</span>
                <h3>Audio Input</h3>
              </div>
              <span className={`badge ${liveAudio.hasAudioSignal ? 'badge--success' : 'badge--info'}`}>
                {liveAudio.hasAudioSignal ? '● SIGNAL ACTIVE' : '● READY'}
              </span>
            </div>

            <div className="card-body new-session-card-body">
              {/* Audio Input Source Dropdown */}
              <div className="form-group" style={{ margin: 0 }}>
                <div className="source-selection-header">
                  <label className="form-label" htmlFor="select-audio-device" style={{ margin: 0 }}>
                    Audio Input Source
                  </label>
                  <button
                    type="button"
                    className="btn-link-small"
                    onClick={liveAudio.updateDeviceList}
                    title="Refresh connected audio devices"
                  >
                    ↻ Refresh
                  </button>
                </div>

                {liveAudio.permissionState !== 'granted' ? (
                  <div className="permission-prompt-box">
                    <p>Microphone access is required to capture audio.</p>
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={liveAudio.requestPermission}
                    >
                      Grant Audio Permission
                    </button>
                  </div>
                ) : liveAudio.devices.length === 0 ? (
                  <select id="select-audio-device" className="form-control form-select" disabled>
                    <option>Default System Microphone</option>
                  </select>
                ) : (
                  <select
                    id="select-audio-device"
                    className="form-control form-select"
                    value={liveAudio.selectedDeviceId || ''}
                    onChange={(e) => liveAudio.setSelectedDeviceId(e.target.value)}
                  >
                    {liveAudio.devices.map((device) => {
                      const label = device.label || `Microphone ${device.deviceId.slice(0, 8)}`
                      const isUsb = label.toLowerCase().includes('usb') || label.toLowerCase().includes('interface')
                      return (
                        <option key={device.deviceId} value={device.deviceId}>
                          {label} {isUsb ? '(USB)' : ''}
                        </option>
                      )
                    })}
                  </select>
                )}
              </div>

              {/* Input Level Live Visualizer */}
              <div className="input-level-block">
                <div className="input-level-label-row">
                  <span className="form-label" style={{ fontSize: '0.78rem' }}>Input Level</span>
                  <span className="level-db-val">
                    {liveAudio.audioDb !== null ? `${Math.round(liveAudio.audioDb)} dB` : '-∞ dB'}
                  </span>
                </div>

                {/* Meter Bar Container */}
                <div className="live-waveform-meter-track">
                  <div
                    className={`live-waveform-meter-fill ${
                      meterWidth > 75 ? 'meter--hot' : meterWidth > 20 ? 'meter--good' : 'meter--low'
                    }`}
                    style={{ width: `${meterWidth}%` }}
                  />
                </div>

                <div className="meter-scale-markers">
                  <span>-40</span>
                  <span>-20</span>
                  <span>0 dB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Start Recording Card */}
          <div className="card start-recording-card">
            <div className="start-recording-info">
              <span className="info-icon">ℹ️</span>
              <span>Verify settings before starting. Master lossless audio will be captured.</span>
            </div>

            <button
              type="button"
              className="btn btn--primary btn--large btn--start-recording"
              onClick={handleStart}
              id="btn-start-live-recording"
            >
              <span className="btn-rec-circle">⦿</span>
              <span>START RECORDING</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

