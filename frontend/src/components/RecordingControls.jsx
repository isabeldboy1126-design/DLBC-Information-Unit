import React from 'react'

export function RecordingControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  elapsedTime,
  recordingStats,
  permissionGranted,
  disabled,
}) {
  // Format seconds into HH:MM:SS
  const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const pad = (num) => String(num).padStart(2, '0')
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    }
    return `${pad(minutes)}:${pad(seconds)}`
  }

  // Format bytes to KB or MB
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 KB'
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className={`card recording-controls ${isRecording ? 'recording-controls--active' : ''}`}>
      <div className="card-header">
        <h3>3. Session Recording Controls</h3>
        {isRecording && (
          <span className="live-indicator">
            <span className="live-dot"></span> LIVE RECORDING
          </span>
        )}
      </div>

      <div className="card-body">
        <div className="recording-status-box">
          <div className="timer-display" id="elapsed-timer">
            {formatTime(elapsedTime)}
          </div>
          <div className="timer-label">Elapsed Recording Time</div>

          {isRecording && (
            <div className="progressive-stats">
              <span className="stat-pill">
                📦 Chunks Streamed: <strong>{recordingStats.chunks}</strong>
              </span>
              <span className="stat-pill">
                💾 Saved to Disk: <strong>{formatBytes(recordingStats.bytes)}</strong>
              </span>
              <span className="stat-pill stat-pill--safe">
                ✓ Progressively preserved in FastAPI
              </span>
            </div>
          )}
        </div>

        <div className="recording-button-row">
          {!isRecording ? (
            <button
              type="button"
              className="btn btn--record btn--large"
              onClick={onStartRecording}
              disabled={!permissionGranted || disabled}
              id="btn-start-recording"
            >
              <span className="rec-icon">●</span> Start Recording Message
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--stop btn--large"
              onClick={onStopRecording}
              id="btn-stop-recording"
            >
              <span className="stop-icon">■</span> Stop & Finalize Recording
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
