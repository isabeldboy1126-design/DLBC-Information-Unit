import React from 'react'

export function FloatingProcessController({
  jobType = 'report_processing', // 'verification' | 'report_processing'
  sessionTitle = 'Sunday Worship Service',
  stageLabel = 'AI Processing',
  isCompleted = false,
  onExpand,
  onDismiss,
}) {
  const typeLabel = jobType === 'verification' ? 'Verification' : 'Report Processing'
  const displayStage = isCompleted
    ? (jobType === 'verification' ? 'Verification complete' : 'Report ready')
    : stageLabel

  return (
    <aside
      className="floating-recorder-card floating-process-panel"
      onClick={onExpand}
      role="region"
      aria-label={`${typeLabel} in progress`}
      title={`Click to open ${typeLabel}`}
    >
      <div className="floating-recorder-header">
        <div className="floating-header-left">
          <div className="floating-process-badge">
            {isCompleted ? (
              <span className="floating-check-icon">✓</span>
            ) : (
              <span className="floating-process-spinner" />
            )}
            <span className="floating-process-type">{typeLabel}</span>
          </div>
        </div>

        <div className="floating-header-right" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn--outline btn--small floating-btn-maximize"
            onClick={(e) => {
              e.stopPropagation()
              if (onExpand) onExpand()
            }}
            title={isCompleted ? `Open ${typeLabel}` : `Expand ${typeLabel}`}
          >
            <span className="btn-icon">{isCompleted ? '→' : '🗖'}</span>
            <span>{isCompleted ? 'Open' : 'Expand'}</span>
          </button>
          {onDismiss && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={(e) => {
                e.stopPropagation()
                onDismiss()
              }}
              title="Dismiss"
              aria-label="Dismiss"
              style={{ padding: '2px 6px', fontSize: '13px', lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="floating-process-body">
        <div className="floating-process-session-title">{sessionTitle}</div>
        <div className="floating-process-stage-row">
          <span className="floating-process-stage-name">{displayStage}</span>
          {!isCompleted && <span className="floating-pulse-dot">●</span>}
        </div>
      </div>
    </aside>
  )
}
