import React, { useState, useEffect } from 'react'
import { getApiUrl, authFetch } from '../config'
import { ConfirmationModal } from './common/ConfirmationModal'

export function CompletedRecordingPlayer({ latestRecording }) {
  const [allRecordings, setAllRecordings] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedRecording, setSelectedRecording] = useState(null)

  const fetchRecordings = async () => {
    try {
      setLoading(true)
      const res = await authFetch(getApiUrl('/api/audio/recordings'))
      if (res.ok) {
        const data = await res.json()
        setAllRecordings(data.recordings || [])
      }
    } catch (e) {
      console.error('Error loading recordings:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecordings()
  }, [latestRecording])

  useEffect(() => {
    if (latestRecording) {
      setSelectedRecording(latestRecording)
    }
  }, [latestRecording])

  const [recordingToDelete, setRecordingToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = (recId) => {
    setRecordingToDelete(recId)
  }

  const handleConfirmDelete = async () => {
    if (!recordingToDelete) return
    setIsDeleting(true)
    try {
      const res = await authFetch(getApiUrl(`/api/audio/recordings/${recordingToDelete}`), {
        method: 'DELETE',
      })
      if (res.ok) {
        if (selectedRecording?.recording_id === recordingToDelete) {
          setSelectedRecording(null)
        }
        await fetchRecordings()
        setRecordingToDelete(null)
      }
    } catch (e) {
      console.error('Error deleting recording:', e)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatBytes = (bytes) => {
    if (!bytes) return '0 KB'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const activeRec = selectedRecording || allRecordings[0]

  return (
    <div className="card completed-recordings-card">
      <div className="card-header">
        <h3>4. Preserved Audio Recordings (Lossless Master)</h3>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={fetchRecordings}
          disabled={loading}
        >
          ↻ Refresh List
        </button>
      </div>

      <div className="card-body">
        {activeRec ? (
          <div className="current-player-box">
            <div className="player-meta-header">
              <span className="rec-title">
                 <strong>{activeRec.filename}</strong>
              </span>
              <span className="badge badge--success">✓ Lossless WAV Preserved</span>
            </div>

            <div className="audio-player-wrapper">
              <audio
                controls
                key={activeRec.recording_id}
                src={getApiUrl(`/api/audio/recordings/${activeRec.recording_id}`)}
                className="native-audio-player"
                id="audio-player"
              >
                Your browser does not support the audio element.
              </audio>
            </div>

            <div className="meta-grid">
              <div className="meta-card">
                <span className="meta-label">Duration</span>
                <span className="meta-val">{activeRec.duration_seconds}s</span>
              </div>
              <div className="meta-card">
                <span className="meta-label">Format / Quality</span>
                <span className="meta-val">
                  {activeRec.bits_per_sample || 16}-bit PCM WAV (Lossless)
                </span>
              </div>
              <div className="meta-card">
                <span className="meta-label">Sample Rate</span>
                <span className="meta-val">{activeRec.sample_rate} Hz</span>
              </div>
              <div className="meta-card">
                <span className="meta-label">Channels</span>
                <span className="meta-val">
                  {activeRec.channels === 1 ? '1 (Mono)' : `${activeRec.channels} (Stereo)`}
                </span>
              </div>
              <div className="meta-card">
                <span className="meta-label">File Size</span>
                <span className="meta-val">{formatBytes(activeRec.file_size)}</span>
              </div>
              <div className="meta-card">
                <span className="meta-label">Source Device</span>
                <span className="meta-val">{activeRec.device_name || 'Audio Input'}</span>
              </div>
            </div>

            <div className="player-actions">
              <a
                href={getApiUrl(`/api/audio/recordings/${activeRec.recording_id}/download`)}
                className="btn btn--outline btn--small"
                download
                id="btn-download-wav"
              >
                ⬇ Download Master WAV
              </a>
              <button
                type="button"
                className="btn btn--danger-outline btn--small"
                onClick={() => handleDelete(activeRec.recording_id)}
              >
                 Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>No audio recordings saved yet.</p>
            <p className="hint-text">
              Select an input source above and click "Start Recording Message" to capture audio.
            </p>
          </div>
        )}

        {allRecordings.length > 1 && (
          <div className="recordings-history">
            <h4>Saved Recordings History ({allRecordings.length})</h4>
            <ul className="recordings-list">
              {allRecordings.map((rec) => (
                <li
                  key={rec.recording_id}
                  className={`recording-item ${
                    activeRec?.recording_id === rec.recording_id ? 'recording-item--selected' : ''
                  }`}
                  onClick={() => setSelectedRecording(rec)}
                >
                  <div className="item-info">
                    <span className="item-name">{rec.filename}</span>
                    <span className="item-sub">
                      {rec.duration_seconds}s &middot; {formatBytes(rec.file_size)} &middot;{' '}
                      {rec.sample_rate} Hz &middot; {rec.created_at || 'Recently'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-select"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedRecording(rec)
                    }}
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Delete Recording Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!recordingToDelete}
        title="Delete Recording?"
        message="Are you sure you want to delete this test recording?"
        supportingText="This action cannot be undone and will permanently remove the audio file."
        confirmLabel="Delete Recording"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setRecordingToDelete(null)}
      />
    </div>
  )
}
