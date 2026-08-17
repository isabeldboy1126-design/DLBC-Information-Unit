import React, { useState } from 'react'

/**
 * VerificationItemRow — displays a single verification item (flagged segment)
 * for the reviewer to confirm or correct.
 */
export function VerificationItemRow({ item, onResolve, onPlaySegment, formatSeconds }) {
  const [editedText, setEditedText] = useState(item.verified_text || item.original_text)
  const [correctionNote, setCorrectionNote] = useState(item.correction_note || '')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const isPending = item.action === 'pending'
  const isConfirmed = item.action === 'confirmed'
  const isCorrected = item.action === 'corrected'

  const statusClass = isPending
    ? 'vi-row--pending'
    : isConfirmed
    ? 'vi-row--confirmed'
    : 'vi-row--corrected'

  const statusLabel = isPending ? '⏳ Pending' : isConfirmed ? '✓ Confirmed' : '✏️ Corrected'

  // Flag reason display
  const flagReasons = item.flag_reasons || []
  const flagSummary = flagReasons
    .map((f) => {
      if (f.type === 'low_confidence') return `Low confidence (${Math.round((f.confidence || 0) * 100)}%)`
      if (f.type === 'manual_flag') return 'Manual flag'
      if (f.type === 'manual_verification') return 'Added by reviewer'
      return f.type || 'Flagged'
    })
    .join(', ')

  const handleConfirm = async () => {
    setIsSaving(true)
    await onResolve(item.segment_index, {
      verified_text: item.original_text,
      action: 'confirmed',
      correction_note: null,
    })
    setIsEditing(false)
    setIsSaving(false)
  }

  const handleSaveCorrection = async () => {
    if (!editedText.trim()) return
    setIsSaving(true)
    await onResolve(item.segment_index, {
      verified_text: editedText.trim(),
      action: 'corrected',
      correction_note: correctionNote.trim() || null,
    })
    setIsEditing(false)
    setIsSaving(false)
  }

  return (
    <div className={`verification-item-row ${statusClass}`} id={`vi-seg-${item.segment_index}`}>
      {/* Header: timestamp, play, status */}
      <div className="vi-row-header">
        <button
          type="button"
          className="segment-timestamp-btn"
          onClick={() => onPlaySegment(item.start_time)}
          title={`Play audio from ${formatSeconds(item.start_time)}`}
        >
          ▶ [{formatSeconds(item.start_time)} – {formatSeconds(item.end_time)}]
        </button>

        <span className="vi-status-badge">{statusLabel}</span>

        {item.original_confidence !== null && item.original_confidence !== undefined && (
          <span
            className={`segment-confidence-tag ${
              item.original_confidence < 0.6 ? 'tag--warning' : 'tag--neutral'
            }`}
          >
            {Math.round(item.original_confidence * 100)}%
          </span>
        )}
      </div>

      {/* Flag reasons */}
      {flagSummary && <div className="vi-flag-reasons">🚩 {flagSummary}</div>}

      {/* Original text (read-only reference) */}
      <div className="vi-original-text">
        <span className="vi-label">Raw transcript:</span>
        <span className="vi-text-display">{item.original_text}</span>
      </div>

      {/* Corrected text display (when already resolved) */}
      {isCorrected && !isEditing && (
        <div className="vi-corrected-text">
          <span className="vi-label">Corrected to:</span>
          <span className="vi-text-display vi-text-corrected">{item.verified_text}</span>
          {item.correction_note && (
            <div className="vi-correction-note">📝 Note: {item.correction_note}</div>
          )}
        </div>
      )}

      {/* Edit area (when editing or pending) */}
      {(isPending || isEditing) && (
        <div className="vi-edit-area">
          <textarea
            className="vi-edit-textarea"
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={2}
            placeholder="Edit text or confirm original..."
          />
          <input
            type="text"
            className="vi-note-input"
            value={correctionNote}
            onChange={(e) => setCorrectionNote(e.target.value)}
            placeholder="Optional correction note..."
          />
          <div className="vi-action-buttons">
            <button
              type="button"
              className="btn btn--success btn--small"
              onClick={handleConfirm}
              disabled={isSaving}
              title="Confirm original wording is correct — no changes needed"
            >
              {isSaving ? 'Saving...' : '✓ Original Is Correct'}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={handleSaveCorrection}
              disabled={isSaving || !editedText.trim()}
              title="Save corrected text"
            >
              {isSaving ? 'Saving...' : '✏️ Save Correction'}
            </button>
            {isEditing && (
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => {
                  setIsEditing(false)
                  setEditedText(item.verified_text || item.original_text)
                  setCorrectionNote(item.correction_note || '')
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Re-edit button for already-resolved items */}
      {!isPending && !isEditing && (
        <div className="vi-resolved-actions">
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={() => {
              setIsEditing(true)
              setEditedText(item.verified_text || item.original_text)
              setCorrectionNote(item.correction_note || '')
            }}
          >
            ↻ Re-review
          </button>
        </div>
      )}
    </div>
  )
}
