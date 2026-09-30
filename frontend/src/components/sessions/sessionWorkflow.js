// A completed AI run is a saved draft. Only explicit approval completes the workflow.
export const isApproved = s => s?.final_report_status === 'approved' || s?.approval_status === 'approved'
export const hasReviewableReport = s => isApproved(s) || ['needs_review', 'complete'].includes(s?.final_report_status) || s?.report_processing_status === 'completed'
export const isVerified = s => ['complete', 'completed'].includes(s?.verification_status) || Boolean(s?.verified_text || s?.verified_at)
export function sessionWorkflow(s) {
 if (s?.is_interrupted) return { label: 'Interrupted', action: 'Review session', stage: 'overview', attention: true }
 if (isApproved(s)) return { label: 'Approved', action: 'View report', stage: 'final_report', attention: false }
 if (hasReviewableReport(s)) return { label: 'Needs review', action: 'Review draft', stage: 'final_report', attention: true }
 if (s?.report_processing_status === 'failed') return { label: 'Processing failed', action: 'Retry processing', stage: 'report_processing', attention: true }
 if (isVerified(s)) return { label: 'Verified', action: 'Prepare report', stage: 'report_processing', attention: true }
 if (s?.flag_count > 0 || s?.verification_status === 'in_progress') return { label: 'Needs verification', action: 'Review transcript', stage: 'verification', attention: true }
 return { label: 'In progress', action: 'View session', stage: 'overview', attention: false }
}
