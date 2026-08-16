import React from 'react'

export function TranscriptionProgress({ uploadStatus, jobStatus, error, configStatus, onRetry }) {
  if (uploadStatus === 'idle') return null

  const getStageClass = (targetStage) => {
    const stages = ['uploading', 'preparing', 'transcribing', 'completed']
    const currentIndex = stages.indexOf(jobStatus?.status || uploadStatus)
    const targetIndex = stages.indexOf(targetStage)

    if (uploadStatus === 'error') return 'stage--error'
    if (currentIndex > targetIndex) return 'stage--completed'
    if (currentIndex === targetIndex) return 'stage--active'
    return 'stage--pending'
  }

  return (
    <div className={`card progress-card ${uploadStatus === 'error' ? 'progress-card--error' : ''}`}>
      <div className="card-header">
        <h3>Transcription Progress</h3>
        <span className="badge badge--primary">
          {uploadStatus === 'uploading' && 'Uploading...'}
          {uploadStatus === 'transcribing' && 'Transcribing...'}
          {uploadStatus === 'completed' && '✓ Done'}
          {uploadStatus === 'error' && '✕ Action Needed'}
        </span>
      </div>

      <div className="card-body">
        {/* Stage Stepper */}
        <div className="stepper-row">
          <div className={`step-item ${getStageClass('uploading')}`}>
            <span className="step-num">1</span>
            <span className="step-text">Upload File</span>
          </div>
          <div className="step-divider"></div>
          <div className={`step-item ${getStageClass('preparing')}`}>
            <span className="step-num">2</span>
            <span className="step-text">Prepare Audio</span>
          </div>
          <div className="step-divider"></div>
          <div className={`step-item ${getStageClass('transcribing')}`}>
            <span className="step-num">3</span>
            <span className="step-text">Transcription Engine</span>
          </div>
          <div className="step-divider"></div>
          <div className={`step-item ${getStageClass('completed')}`}>
            <span className="step-num">4</span>
            <span className="step-text">Raw Transcript</span>
          </div>
        </div>

        {/* Progress bar */}
        {uploadStatus !== 'error' && uploadStatus !== 'completed' && (
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.max(10, jobStatus?.progress_percent || (uploadStatus === 'uploading' ? 25 : 50))}%` }}
            ></div>
          </div>
        )}

        {/* Status Message */}
        <div className="progress-status-message">
          <p>
            {jobStatus?.status_message ||
              (uploadStatus === 'uploading'
                ? 'Preserving original file to storage/uploads/...'
                : 'Processing...')}
          </p>
        </div>

        {/* Diagnostic Error Help */}
        {error && (
          <div className="error-resolution-box">
            <h4>⚠️ Notice: Transcription Provider Setup</h4>
            <p className="error-details">{error}</p>

            {configStatus && !configStatus.is_configured && (
              <div className="config-instructions">
                <strong>How to configure Google Cloud Speech-to-Text:</strong>
                <pre>{configStatus.instructions}</pre>
              </div>
            )}

            {onRetry && (
              <button type="button" className="btn btn--secondary btn--small" onClick={onRetry}>
                ↻ Try Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
