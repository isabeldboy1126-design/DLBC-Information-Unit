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
  const [sessionName, setSessionName] = useState('Sunday Morning Worship Service')
  const [eventType, setEventType] = useState('Sunday Worship Service')
  const [minister, setMinister] = useState('')
  const [messageTitle, setMessageTitle] = useState('')
  const [validationError, setValidationError] = useState('')

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
    if (!sessionName.trim()) {
      setValidationError('Session Name is required.')
      return
    }
    setValidationError('')
    // Pass metadata to startRecording
    onStartRecording({
      title: sessionName.trim(),
      eventType,
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
            {/* Session Name */}
            <div className="form-group">
              <label className="form-label" htmlFor="input-session-name">
                Session Name *
              </label>
              <input
                type="text"
                id="input-session-name"
                className="form-control"
                placeholder="e.g. Sunday Morning Worship Service"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
              />
            </div>

            {/* Event Type & Minister */}
            <div className="form-row-2col">
              <div className="form-group">
                <label className="form-label" htmlFor="select-event-type">
                  Event Type
                </label>
                <select
                  id="select-event-type"
                  className="form-control form-select"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                >
                  <option value="Sunday Worship Service">Sunday Worship Service</option>
                  <option value="Monday Bible Study">Monday Bible Study</option>
                  <option value="Thursday Revival Broadcast">Thursday Revival Broadcast</option>
                  <option value="Leadership Training Seminar">Leadership Training Seminar</option>
                  <option value="Youth Fellowship Service">Youth Fellowship Service</option>
                  <option value="Special Broadcast Event">Special Broadcast Event</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="input-minister">
                  Minister / Speaker
                </label>
                <input
                  type="text"
                  id="input-minister"
                  className="form-control"
                  placeholder="Enter speaker name"
                  value={minister}
                  onChange={(e) => setMinister(e.target.value)}
                />
              </div>
            </div>

            {/* Message Title */}
            <div className="form-group">
              <label className="form-label" htmlFor="input-message-title">
                Message Title (Optional)
              </label>
              <input
                type="text"
                id="input-message-title"
                className="form-control"
                placeholder="Theme or topic of the message"
                value={messageTitle}
                onChange={(e) => setMessageTitle(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Audio Input & Start Action */}
        <div className="new-session-right-col">
          {/* Audio Input Card */}
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
              <div className="source-selection-header">
                <span className="form-label">Source Selection</span>
                <button
                  type="button"
                  className="btn-link-small"
                  onClick={liveAudio.updateDeviceList}
                  title="Refresh connected audio devices"
                >
                  ↻ Refresh
                </button>
              </div>

              {/* Device List Radios */}
              <div className="audio-devices-radio-group">
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
                  <div className="device-radio-item device-radio-item--selected">
                    <input type="radio" checked readOnly id="dev-default" />
                    <label htmlFor="dev-default">Default System Microphone</label>
                  </div>
                ) : (
                  liveAudio.devices.map((device) => {
                    const isSelected = liveAudio.selectedDeviceId === device.deviceId
                    const label = device.label || `Microphone ${device.deviceId.slice(0, 8)}`
                    const isUsb = label.toLowerCase().includes('usb') || label.toLowerCase().includes('interface')

                    return (
                      <div
                        key={device.deviceId}
                        className={`device-radio-item ${isSelected ? 'device-radio-item--selected' : ''}`}
                        onClick={() => liveAudio.setSelectedDeviceId(device.deviceId)}
                      >
                        <input
                          type="radio"
                          id={`dev-${device.deviceId}`}
                          name="audio-device"
                          checked={isSelected}
                          onChange={() => liveAudio.setSelectedDeviceId(device.deviceId)}
                        />
                        <label htmlFor={`dev-${device.deviceId}`}>
                          {label} {isUsb && <span className="usb-pill">USB</span>}
                        </label>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Input Level Live Visualizer */}
              <div className="input-level-block">
                <div className="input-level-label-row">
                  <span className="form-label">Input Level</span>
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
