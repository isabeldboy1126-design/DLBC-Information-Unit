import React from 'react'

export function FloatingProcessController({
  jobType = 'report_processing', // 'verification' | 'report_processing'
  sessionTitle = 'Sunday Worship Service',
  stageLabel = 'AI Processing',
  isCompleted = false,
  onExpand,
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
      title={`Click to expand ${typeLabel}`}
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

        <div className="floating-header-right">
          <button
            type="button"
            className="btn btn--outline btn--small floating-btn-maximize"
            onClick={(e) => {
              e.stopPropagation()
              if (onExpand) onExpand()
            }}
            title={`Expand ${typeLabel}`}
          >
            <span className="btn-icon">🗖</span>
            <span>Expand</span>
          </button>
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
