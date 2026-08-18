import React from 'react'

/**
 * Authoritative 8-Stage Lifecycle Stepper for DLBC Information Unit App
 * 
 * Stages:
 * 1. Recording (Master Audio captured)
 * 2. Raw Transcript (Original machine transcription)
 * 3. Verification (Human review of flagged items)
 * 4. Verified Transcript (Approved factual transcript)
 * 5. Reporting (Dual independent AI reports)
 * 6. Editing (Human-reviewed compiled report)
 * 7. Proofreading (Conservative language check)
 * 8. Final Report (Archival document & DOCX export)
 */
export function LifecycleStepper({ session, activeStage, onSelectStage, compact = false }) {
  if (!session) return null

  const hasAudio = !!(session.audio_filename || session.recording_id)
  const hasRawTranscript = !!(session.transcript_id || (session.segment_count && session.segment_count > 0))
  const isVerified = session.verification_status === 'completed' || !!session.verified_at || !!session.verified_text
  const isVerifying = session.verification_status === 'in_progress'
  const reportingStatus = session.reporting_status || 'not_started'
  const editingStatus = session.editing_status || 'not_started'
  const proofreadingStatus = session.proofreading_status || 'not_started'
  const finalReportStatus = session.final_report_status || 'not_started'

  const stages = [
    {
      id: 'recording',
      label: 'Recording',
      shortLabel: 'Rec',
      isCompleted: hasAudio,
      isActive: activeStage === 'recording',
      isLocked: false,
    },
    {
      id: 'raw_transcript',
      label: 'Raw Transcript',
      shortLabel: 'Raw',
      isCompleted: hasRawTranscript,
      isActive: activeStage === 'raw_transcript',
      isLocked: !hasAudio,
    },
    {
      id: 'verification',
      label: 'Verification',
      shortLabel: 'Verify',
      isCompleted: isVerified,
      isActive: activeStage === 'verification' || isVerifying,
      isLocked: !hasRawTranscript,
    },
    {
      id: 'verified_transcript',
      label: 'Verified Transcript',
      shortLabel: 'Verified',
      isCompleted: isVerified,
      isActive: activeStage === 'verified_transcript',
      isLocked: !isVerified,
    },
    {
      id: 'reporting',
      label: 'Reporting',
      shortLabel: 'Reports',
      isCompleted: reportingStatus === 'reports_ready',
      isActive: activeStage === 'reporting' || reportingStatus === 'partial',
      isLocked: !isVerified,
    },
    {
      id: 'editing',
      label: 'Editing',
      shortLabel: 'Editing',
      isCompleted: editingStatus === 'complete',
      isActive: activeStage === 'editing' || editingStatus === 'draft_ready' || editingStatus === 'in_review',
      isLocked: reportingStatus !== 'reports_ready',
    },
    {
      id: 'proofreading',
      label: 'Proofreading',
      shortLabel: 'Proof',
      isCompleted: proofreadingStatus === 'complete',
      isActive: activeStage === 'proofreading' || proofreadingStatus === 'ready_for_review',
      isLocked: editingStatus !== 'complete',
    },
    {
      id: 'final_report',
      label: 'Final Report',
      shortLabel: 'Final',
      isCompleted: finalReportStatus === 'complete',
      isActive: activeStage === 'final_report',
      isLocked: proofreadingStatus !== 'complete',
    },
  ]

  // Calculate current active step index (1-based)
  const completedCount = stages.filter((s) => s.isCompleted).length
  let currentStepNumber = 1
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].isActive) {
      currentStepNumber = i + 1
      break
    } else if (!stages[i].isCompleted) {
      currentStepNumber = i + 1
      break
    }
    currentStepNumber = stages.length
  }

  return (
    <div className={`lifecycle-stepper-container ${compact ? 'lifecycle-stepper--compact' : ''}`}>
      <div className="lifecycle-stepper-header">
        <span className="lifecycle-stepper-title">Session Lifecycle</span>
        <span className="lifecycle-stepper-counter">Step {currentStepNumber} of 8</span>
      </div>

      <div className="lifecycle-stepper-track">
        {stages.map((stage, idx) => {
          let nodeClass = 'lifecycle-node--pending'
          if (stage.isCompleted) {
            nodeClass = 'lifecycle-node--completed'
          } else if (stage.isActive) {
            nodeClass = 'lifecycle-node--active'
          } else if (stage.isLocked) {
            nodeClass = 'lifecycle-node--locked'
          }

          const canClick = onSelectStage && !stage.isLocked

          return (
            <React.Fragment key={stage.id}>
              {idx > 0 && (
                <div
                  className={`lifecycle-connector ${
                    stages[idx - 1].isCompleted ? 'lifecycle-connector--completed' : ''
                  }`}
                />
              )}

              <button
                type="button"
                className={`lifecycle-step-btn ${nodeClass}`}
                onClick={() => canClick && onSelectStage(stage.id)}
                disabled={!canClick}
                title={`${stage.label}${stage.isLocked ? ' (Locked)' : stage.isCompleted ? ' (Completed)' : ''}`}
              >
                <div className="lifecycle-node-circle">
                  {stage.isCompleted ? (
                    <span className="lifecycle-check">✓</span>
                  ) : stage.isActive ? (
                    <span className="lifecycle-active-dot" />
                  ) : stage.isLocked ? (
                    <span className="lifecycle-lock">🔒</span>
                  ) : (
                    <span className="lifecycle-num">{idx + 1}</span>
                  )}
                </div>
                <span className="lifecycle-node-label">
                  {compact ? stage.shortLabel : stage.label}
                </span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
