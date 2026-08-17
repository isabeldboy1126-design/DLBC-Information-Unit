import React, { useState, useEffect } from 'react'
import { VerificationItemRow } from './VerificationItemRow'

/**
 * VerificationWorkflow — the main Phase 5 verification UI.
 *
 * Shows ONLY flagged/verification items for review, not every transcript segment.
 * Unflagged segments automatically retain their raw wording in the Verified Transcript.
 */
export function VerificationWorkflow({
  session,
  verificationState,
  onStartVerification,
  onLoadVerificationState,
  onResolveItem,
  onAddItem,
  onConfirmAllRemaining,
  onFinalise,
  onConfirmRawAsVerified,
  onPlaySegment,
}) {
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'resolved'
  const [showAddSegment, setShowAddSegment] = useState(false)
  const [addSegmentIndex, setAddSegmentIndex] = useState('')
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false)
  const [isBulkConfirming, setIsBulkConfirming] = useState(false)
  const [isFinalising, setIsFinalising] = useState(false)
  const [isConfirmingRaw, setIsConfirmingRaw] = useState(false)
  const [copiedVerified, setCopiedVerified] = useState(false)

  const sessionId = session?.session_id
  const vStatus = session?.verification_status || 'not_started'

  // Load verification state when component mounts (if in_progress)
  useEffect(() => {
    if (sessionId && vStatus === 'in_progress' && !verificationState) {
      onLoadVerificationState(sessionId)
    }
  }, [sessionId, vStatus, verificationState, onLoadVerificationState])

  const formatSeconds = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00'
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const remMins = mins % 60
      return `${pad(hours)}:${pad(remMins)}:${pad(secs)}`
    }
    return `${pad(mins)}:${pad(secs)}`
  }

  // ---- NOT STARTED state ----
  if (vStatus === 'not_started') {
    const hasFlags = session?.flag_count > 0

    return (
      <div className="card verification-card">
        <div className="card-header">
          <h3>📋 Transcript Verification</h3>
        </div>
        <div className="card-body verification-not-started">
          {hasFlags ? (
            <>
              <div className="verification-summary-banner">
                <span className="verification-flag-icon">⚠️</span>
                <div>
                  <strong>{session.flag_count} flagged section{session.flag_count !== 1 ? 's' : ''} detected</strong>
                  <p>
                    These segments had low Azure confidence or were manually flagged during recording.
                    Review them against the original audio to confirm or correct the transcript.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onStartVerification(sessionId)}
                id="btn-start-verification"
              >
                Begin Verification ({session.flag_count} item{session.flag_count !== 1 ? 's' : ''} to review)
              </button>
            </>
          ) : (
            <>
              <div className="verification-summary-banner verification-no-flags">
                <span className="verification-flag-icon">✅</span>
                <div>
                  <strong>No flagged sections were detected.</strong>
                  <p>
                    Azure Speech recognition confidence was above the threshold for all segments,
                    and no manual flags were added during recording.
                  </p>
                  <p>
                    You may confirm the entire raw transcript as verified, or start a manual review
                    if you'd like to check specific sections.
                  </p>
                </div>
              </div>
              <div className="verification-zero-flag-actions">
                <button
                  type="button"
                  className="btn btn--success"
                  onClick={async () => {
                    setIsConfirmingRaw(true)
                    await onConfirmRawAsVerified(sessionId)
                    setIsConfirmingRaw(false)
                  }}
                  disabled={isConfirmingRaw}
                  id="btn-confirm-raw-as-verified"
                >
                  {isConfirmingRaw ? 'Creating Verified Transcript...' : '✓ Confirm Raw Transcript as Verified'}
                </button>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => onStartVerification(sessionId)}
                >
                  Start Manual Review Instead
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ---- COMPLETE state ----
  if (vStatus === 'complete') {
    const handleCopyVerified = () => {
      const text = session?.verified_text || ''
      if (text) {
        navigator.clipboard.writeText(text)
        setCopiedVerified(true)
        setTimeout(() => setCopiedVerified(false), 2500)
      }
    }

    return (
      <div className="card verification-card verification-complete-card">
        <div className="card-header">
          <h3>✅ Verified Transcript</h3>
          <span className="badge badge--success">Verification Complete</span>
        </div>
        <div className="card-body">
          <div className="verification-complete-info">
            <p>
              <strong>Verified at:</strong>{' '}
              {session.verified_at
                ? new Date(session.verified_at).toLocaleString()
                : 'Unknown'}
            </p>
            {verificationState && (
              <p>
                <strong>Items reviewed:</strong> {verificationState.items_total || 0} verification item
                {(verificationState.items_total || 0) !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="transcript-toolbar">
            <button
              type="button"
              className={`btn btn--small ${copiedVerified ? 'btn--success' : 'btn--outline'}`}
              onClick={handleCopyVerified}
              id="btn-copy-verified-transcript"
            >
              {copiedVerified ? '✓ Copied Verified Transcript!' : '📋 Copy Full Verified Transcript'}
            </button>
          </div>

          <div className="transcript-content-box verified-transcript-box">
            <p className="continuous-raw-text">
              {session.verified_text || 'Verified transcript is empty.'}
            </p>
          </div>

          <div className="immutability-notice verification-notice">
            <p>
              🔒 <strong>Verified Record:</strong> This transcript has been reviewed and confirmed by a human
              operator. It preserves all original segments with human corrections applied to flagged items.
              The original Raw Transcript remains unchanged.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---- IN PROGRESS state ----
  const items = verificationState?.items || []
  const itemsTotal = verificationState?.items_total || 0
  const itemsResolved = verificationState?.items_resolved || 0
  const progressPercent = itemsTotal > 0 ? Math.round((itemsResolved / itemsTotal) * 100) : 0
  const canFinalise = itemsTotal > 0 && itemsResolved === itemsTotal

  // Filter items
  const filteredItems =
    filter === 'pending'
      ? items.filter((i) => i.action === 'pending')
      : filter === 'resolved'
      ? items.filter((i) => i.action !== 'pending')
      : items

  // Build list of segment indices already in verification (to avoid duplicates in add dialog)
  const existingSegmentIndices = new Set(items.map((i) => i.segment_index))

  // All raw segments available for manual addition
  const allSegments = session?.segments || []
  const addableSegments = allSegments.filter((s) => !existingSegmentIndices.has(s.segment_index))

  const handleAddManualItem = async () => {
    const idx = parseInt(addSegmentIndex, 10)
    if (isNaN(idx)) return
    await onAddItem(sessionId, idx)
    setAddSegmentIndex('')
    setShowAddSegment(false)
  }

  const handleFinalise = async () => {
    if (!window.confirm(
      `All ${itemsTotal} verification items are resolved.\n\nCreate the Verified Transcript now?\n\nThis will combine all raw segments with your corrections into the final Verified Transcript.`
    )) return
    setIsFinalising(true)
    await onFinalise(sessionId)
    setIsFinalising(false)
  }

  return (
    <div className="card verification-card">
      <div className="card-header">
        <h3>📋 Transcript Verification</h3>
        <span className="badge badge--warning">In Progress</span>
      </div>

      <div className="card-body">
        {/* Progress bar */}
        <div className="verification-progress">
          <div className="verification-progress-info">
            <span>
              <strong>{itemsResolved}</strong> of <strong>{itemsTotal}</strong> verification item
              {itemsTotal !== 1 ? 's' : ''} resolved
            </span>
            <span className="verification-progress-pct">{progressPercent}%</span>
          </div>
          <div className="verification-progress-bar-track">
            <div
              className="verification-progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Filter + Add controls */}
        <div className="verification-toolbar">
          <div className="view-mode-tabs">
            <button
              type="button"
              className={`tab-btn ${filter === 'all' ? 'tab-btn--active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              className={`tab-btn ${filter === 'pending' ? 'tab-btn--active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              ⏳ Pending ({items.filter((i) => i.action === 'pending').length})
            </button>
            <button
              type="button"
              className={`tab-btn ${filter === 'resolved' ? 'tab-btn--active' : ''}`}
              onClick={() => setFilter('resolved')}
            >
              ✓ Resolved ({items.filter((i) => i.action !== 'pending').length})
            </button>
          </div>

          <div className="toolbar-actions">
            {itemsTotal - itemsResolved > 0 && (
              <button
                type="button"
                className="btn btn--success btn--small"
                onClick={() => setShowBulkConfirmModal(true)}
                id="btn-confirm-all-remaining"
                title="Accept original wording for all remaining unresolved items"
              >
                ✓ Confirm All Remaining as Correct ({itemsTotal - itemsResolved})
              </button>
            )}
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => setShowAddSegment(!showAddSegment)}
              title="Flag another segment for verification"
            >
              + Add Verification Item
            </button>
          </div>
        </div>

        {/* Bulk confirmation dialog */}
        {showBulkConfirmModal && (
          <div className="verification-bulk-confirm-dialog">
            <div className="bulk-confirm-content">
              <h4>⚠️ Bulk Confirmation</h4>
              <p>
                You are about to confirm all remaining flagged sections using their original transcript wording. No transcript text will be changed.
              </p>
              <div className="vi-action-buttons">
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => setShowBulkConfirmModal(false)}
                  disabled={isBulkConfirming}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--success btn--small"
                  onClick={async () => {
                    setIsBulkConfirming(true)
                    await onConfirmAllRemaining(sessionId)
                    setIsBulkConfirming(false)
                    setShowBulkConfirmModal(false)
                  }}
                  disabled={isBulkConfirming}
                  id="btn-confirm-all-dialog-btn"
                >
                  {isBulkConfirming ? 'Confirming...' : 'Confirm All'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add segment dialog */}
        {showAddSegment && (
          <div className="verification-add-dialog">
            <label>Select an unflagged segment to add for review:</label>
            <select
              value={addSegmentIndex}
              onChange={(e) => setAddSegmentIndex(e.target.value)}
              className="form-control"
            >
              <option value="">— Select segment —</option>
              {addableSegments.map((seg) => (
                <option key={seg.segment_index} value={seg.segment_index}>
                  Segment {seg.segment_index} [{formatSeconds(seg.start_time)} – {formatSeconds(seg.end_time)}]: {seg.text.substring(0, 60)}...
                </option>
              ))}
            </select>
            <div className="vi-action-buttons">
              <button
                type="button"
                className="btn btn--primary btn--small"
                onClick={handleAddManualItem}
                disabled={!addSegmentIndex}
              >
                Add for Review
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => {
                  setShowAddSegment(false)
                  setAddSegmentIndex('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Verification items list */}
        <div className="verification-items-list">
          {filteredItems.length === 0 ? (
            <div className="verification-empty-filter">
              No {filter === 'pending' ? 'pending' : filter === 'resolved' ? 'resolved' : ''} items.
            </div>
          ) : (
            filteredItems.map((item) => (
              <VerificationItemRow
                key={item.item_id || `vi-${item.segment_index}`}
                item={item}
                onResolve={(segIdx, payload) => onResolveItem(sessionId, segIdx, payload)}
                onPlaySegment={onPlaySegment}
                formatSeconds={formatSeconds}
              />
            ))
          )}
        </div>

        {/* Finalise button */}
        <div className="verification-finalise-section">
          {canFinalise ? (
            <button
              type="button"
              className="btn btn--success btn--large"
              onClick={handleFinalise}
              disabled={isFinalising}
              id="btn-finalise-verification"
            >
              {isFinalising
                ? 'Creating Verified Transcript...'
                : `✓ Finalise Verification — Create Verified Transcript (${itemsTotal} items reviewed)`}
            </button>
          ) : (
            <div className="verification-finalise-blocked">
              <span>
                ⏳ {itemsTotal - itemsResolved} verification item{itemsTotal - itemsResolved !== 1 ? 's' : ''} still
                pending — resolve all items to finalise.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
