import React from 'react'

export function ProofreadingChangesList({ changes, reviewNotes }) {
  if ((!changes || changes.length === 0) && (!reviewNotes || reviewNotes.length === 0)) {
    return (
      <div className="card proofreading-changes-card">
        <div className="no-changes-box">
          <span className="no-changes-icon">✨</span>
          <h4>No Corrections Needed</h4>
          <p>
            The conservative AI Proofreader checked the Edited Report and confirmed that spelling, grammar, punctuation, and Scripture formatting adhere to editorial standards without requiring alterations.
          </p>
        </div>
      </div>
    )
  }

  const getBadgeClass = (type) => {
    switch (type) {
      case 'spelling':
        return 'badge--danger'
      case 'grammar':
        return 'badge--warning'
      case 'punctuation':
        return 'badge--secondary'
      case 'capitalization':
        return 'badge--primary'
      case 'scripture_reference':
        return 'badge--success'
      default:
        return 'badge--muted'
    }
  }

  return (
    <div className="card proofreading-changes-card">
      <div className="card-header">
        <div>
          <h3>🔍 Suggested Proofreading Corrections</h3>
          <p className="card-subtitle">
            {changes.length} {changes.length === 1 ? 'correction' : 'corrections'} identified
          </p>
        </div>
      </div>

      {reviewNotes && reviewNotes.length > 0 && (
        <div className="review-notes-box" style={{ marginBottom: '1rem' }}>
          <strong>💡 Human Review Notes:</strong>
          <ul>
            {reviewNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="changes-list">
        {changes.map((item, idx) => (
          <div key={idx} className="change-item">
            <div className="change-header">
              <span className={`badge ${getBadgeClass(item.change_type)}`}>
                {item.change_type.replace('_', ' ').toUpperCase()}
              </span>
              <span className="change-reason">{item.reason}</span>
            </div>

            <div className="change-diff">
              <div className="diff-original">
                <span className="diff-label">Original:</span>
                <span className="diff-text diff-text--del">{item.original_text}</span>
              </div>
              <div className="diff-arrow">→</div>
              <div className="diff-suggested">
                <span className="diff-label">Suggested:</span>
                <span className="diff-text diff-text--ins">{item.suggested_text}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
