import React from 'react'

export function TranscriptsHistoryList({ transcripts, activeTranscriptId, onSelectTranscript, onRefresh }) {
  if (!transcripts || transcripts.length === 0) return null

  const formatSeconds = (totalSeconds) => {
    if (!totalSeconds) return '0s'
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.floor(totalSeconds % 60)
    if (mins === 0) return `${secs}s`
    return `${mins}m ${secs}s`
  }

  return (
    <div className="card transcripts-history-card">
      <div className="card-header">
        <h3>Saved Raw Transcripts ({transcripts.length})</h3>
        {onRefresh && (
          <button type="button" className="btn btn--secondary btn--small" onClick={onRefresh}>
            ↻ Refresh
          </button>
        )}
      </div>

      <div className="card-body">
        <ul className="transcripts-list">
          {transcripts.map((t) => (
            <li
              key={t.transcript_id}
              className={`transcript-list-item ${
                activeTranscriptId === t.transcript_id ? 'transcript-list-item--active' : ''
              }`}
              onClick={() => onSelectTranscript(t.transcript_id)}
            >
              <div className="item-meta">
                <span className="item-title">
                  {t.is_video ? '🎬' : '🎵'} <strong>{t.original_filename}</strong>
                </span>
                <span className="item-details">
                  {formatSeconds(t.duration_seconds)} &middot; {t.segments_count} segments &middot;{' '}
                  {t.provider_name} &middot; {t.created_at || 'Recently'}
                </span>
                {t.preview_text && <p className="item-preview">"{t.preview_text}"</p>}
              </div>

              <button
                type="button"
                className="btn btn--outline btn--small btn-view"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectTranscript(t.transcript_id)
                }}
              >
                View Transcript
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
