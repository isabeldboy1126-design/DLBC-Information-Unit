import React, { useRef } from 'react'

export function RecordedFileUploader({
  fileType,
  setFileType,
  selectedFile,
  fileMetadata,
  onFileSelect,
  onStartTranscription,
  uploadStatus,
  disabled,
  configStatus,
  selectedProvider,
  setSelectedProvider,
}) {
  const fileInputRef = useRef(null)

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const isBusy = uploadStatus === 'uploading' || uploadStatus === 'transcribing'
  const acceptedFormats = fileType === 'video' ? '.mp4,.mov,.webm' : '.wav,.mp3,.m4a,.flac,.ogg'

  const activeProviderName =
    selectedProvider === 'azure_speech'
      ? 'Azure Speech (en-NG)'
      : selectedProvider === 'google_speech_to_text'
      ? 'Google Speech'
      : 'Local Whisper'

  return (
    <div className="card recorded-uploader-card">
      <div className="card-header">
        <h3>Transcribe Recorded Message</h3>
        <div className="config-badge-group">
          <span className="badge badge--success">
            ⚙ Active: {activeProviderName}
          </span>
        </div>
      </div>

      <div className="card-body">
        {/* Provider Selector */}
        <div className="uploader-step">
          <label className="step-label">Transcription Engine:</label>
          <div className="provider-options-grid">
            <label
              className={`provider-option-card ${selectedProvider === 'azure_speech' ? 'provider-option-card--active' : ''}`}
            >
              <input
                type="radio"
                name="transcriptionProvider"
                value="azure_speech"
                checked={selectedProvider === 'azure_speech'}
                onChange={() => setSelectedProvider('azure_speech')}
                disabled={isBusy || disabled}
              />
              <div className="provider-option-text">
                <span className="provider-title">☁️ Azure Speech — English (Nigeria) [en-NG]</span>
                <span className="provider-desc">
                  {configStatus?.providers?.azure_speech?.is_configured
                    ? '✓ Configured & Ready (southafricanorth)'
                    : '⚠ Configure AZURE_SPEECH_KEY in backend/.env'}
                </span>
              </div>
            </label>

            <label
              className={`provider-option-card ${selectedProvider === 'faster_whisper' ? 'provider-option-card--active' : ''}`}
            >
              <input
                type="radio"
                name="transcriptionProvider"
                value="faster_whisper"
                checked={selectedProvider === 'faster_whisper'}
                onChange={() => setSelectedProvider('faster_whisper')}
                disabled={isBusy || disabled}
              />
              <div className="provider-option-text">
                <span className="provider-title">💻 Local Faster-Whisper</span>
                <span className="provider-desc">✓ Offline CPU (int8 small model — No API Key needed)</span>
              </div>
            </label>

            <label
              className={`provider-option-card ${selectedProvider === 'google_speech_to_text' ? 'provider-option-card--active' : ''}`}
            >
              <input
                type="radio"
                name="transcriptionProvider"
                value="google_speech_to_text"
                checked={selectedProvider === 'google_speech_to_text'}
                onChange={() => setSelectedProvider('google_speech_to_text')}
                disabled={isBusy || disabled}
              />
              <div className="provider-option-text">
                <span className="provider-title">☁️ Google Cloud Speech-to-Text</span>
                <span className="provider-desc">
                  {configStatus?.providers?.google_speech_to_text?.is_configured
                    ? '✓ Cloud credentials configured'
                    : '⚠ Credentials / billing pending'}
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* 1. Choose File Type */}
        <div className="uploader-step">
          <label className="step-label">Choose file type:</label>
          <div className="toggle-group" role="radiogroup" aria-label="Media File Type">
            <button
              type="button"
              className={`toggle-btn ${fileType === 'audio' ? 'toggle-btn--active' : ''}`}
              onClick={() => {
                setFileType('audio')
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              disabled={isBusy || disabled}
            >
              🎵 Audio (WAV, MP3, M4A)
            </button>
            <button
              type="button"
              className={`toggle-btn ${fileType === 'video' ? 'toggle-btn--active' : ''}`}
              onClick={() => {
                setFileType('video')
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              disabled={isBusy || disabled}
            >
              🎬 Video (MP4)
            </button>
          </div>
        </div>

        {/* 2. Select File */}
        <div className="uploader-step">
          <label className="step-label">Select recorded sermon / message:</label>
          <div className="file-selection-area">
            <input
              type="file"
              ref={fileInputRef}
              accept={acceptedFormats}
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onFileSelect(e.target.files[0])
                }
              }}
              disabled={isBusy || disabled}
            />

            <button
              type="button"
              className="btn btn--outline btn--file-select"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy || disabled}
              id="btn-select-file"
            >
              📁 {selectedFile ? 'Choose Different File' : 'Select File'}
            </button>

            <span className="file-formats-hint">
              Supported: {fileType === 'video' ? 'MP4 video (audio extracted automatically)' : 'WAV, MP3, M4A audio files'}
            </span>
          </div>
        </div>

        {/* 3. Selected File Metadata Card */}
        {fileMetadata && (
          <div className="selected-file-card">
            <div className="file-card-header">
              <span className="file-name-icon">
                {fileType === 'video' ? '🎬' : '🎵'} <strong>{fileMetadata.name}</strong>
              </span>
              <span className="badge badge--muted">{formatFileSize(fileMetadata.size)}</span>
            </div>
            <div className="file-card-details">
              <span className="detail-item"><strong>Format:</strong> {fileMetadata.type}</span>
              <span className="detail-item"><strong>Preservation:</strong> Original file preserved unchanged</span>
              {fileType === 'video' && (
                <span className="detail-item"><strong>Audio Track:</strong> Extracted automatically to processing copy</span>
              )}
            </div>
          </div>
        )}

        {/* 4. Transcribe Button */}
        <div className="uploader-actions">
          <button
            type="button"
            className="btn btn--primary btn--large"
            onClick={onStartTranscription}
            disabled={!selectedFile || isBusy || disabled}
            id="btn-start-transcribe"
          >
            {isBusy ? 'Processing...' : '🚀 Transcribe Message'}
          </button>
        </div>
      </div>
    </div>
  )
}
