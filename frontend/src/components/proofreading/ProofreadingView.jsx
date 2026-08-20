import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '../../config'
import { ProofreadingStandardsModal } from './ProofreadingStandardsModal'
import { ProofreadingChangesList } from './ProofreadingChangesList'

export function ProofreadingView({ session, onBack, onNavigateToFinalReport }) {
  const [proofreadingData, setProofreadingData] = useState({
    session_id: session?.session_id,
    proofreading_status: 'not_started',
    proofreading_completed_at: null,
    accepted_proofread_revision_id: null,
    can_proofread: false,
    source_edited_report: null,
    active_revision: null,
    revisions: [],
    revisions_count: 0,
  })

  const [aiStatus, setAiStatus] = useState({
    configured: false,
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    active_standard_version: 'v1',
  })

  const [reportTitle, setReportTitle] = useState('')
  const [reportText, setReportText] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isStandardsOpen, setIsStandardsOpen] = useState(false)
  const [showRerunConfirm, setShowRerunConfirm] = useState(false)
  const [showRevisionsDrawer, setShowRevisionsDrawer] = useState(false)
  const [errorBanner, setErrorBanner] = useState(null)
  const [successBanner, setSuccessBanner] = useState(null)
  const [copied, setCopied] = useState(false)
  const [leftTab, setLeftTab] = useState('changes') // 'changes' | 'edited_source'

  const sessionId = session?.session_id

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/proofreading/status'))
      if (res.ok) {
        const data = await res.json()
        setAiStatus(data)
      }
    } catch (e) {
      console.error('Error fetching proofreading status:', e)
    }
  }, [])

  const fetchProofreadReport = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(getApiUrl(`/api/proofreading/sessions/${sessionId}/report`))
      if (res.ok) {
        const data = await res.json()
        setProofreadingData(data)
        if (data.active_revision) {
          setReportTitle(data.active_revision.proofread_title || session?.title || 'Proofread Message Report')
          setReportText(data.active_revision.proofread_text || '')
          setIsDirty(false)
        } else if (data.source_edited_report) {
          setReportTitle(data.source_edited_report.report_title || session?.title || 'Edited Message Report')
          setReportText(data.source_edited_report.report_text || '')
        }
      }
    } catch (e) {
      console.error('Error fetching proofread report:', e)
    }
  }, [sessionId, session?.title])

  useEffect(() => {
    fetchStatus()
    fetchProofreadReport()
  }, [fetchStatus, fetchProofreadReport])

  const handleTextChange = (e) => {
    setReportText(e.target.value)
    setIsDirty(true)
  }

  const handleTitleChange = (e) => {
    setReportTitle(e.target.value)
    setIsDirty(true)
  }

  const handleRunProofread = async () => {
    if (!proofreadingData.can_proofread) {
      setErrorBanner('A completed Edited Report is required before Proofreading can begin.')
      return
    }

    try {
      setErrorBanner(null)
      setSuccessBanner(null)
      setIsGenerating(true)
      setShowRerunConfirm(false)

      const res = await fetch(getApiUrl(`/api/proofreading/sessions/${sessionId}/run`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (res.ok) {
        const data = await res.json()
        setSuccessBanner('✓ AI Proofreader completed the language check successfully!')
        await fetchProofreadReport()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to run proofreading.')
      }
    } catch (e) {
      setErrorBanner(`Network or server error during proofreading: ${e.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveAdjustments = async () => {
    if (!reportText.trim()) {
      setErrorBanner('Report text cannot be empty.')
      return
    }

    try {
      setErrorBanner(null)
      setIsSaving(true)
      const res = await fetch(getApiUrl(`/api/proofreading/sessions/${sessionId}/save`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proofread_title: reportTitle.trim() || undefined,
          proofread_text: reportText.trim(),
        }),
      })

      if (res.ok) {
        setIsDirty(false)
        setSuccessBanner('✓ Manual adjustments saved successfully as a new revision.')
        setTimeout(() => setSuccessBanner(null), 3000)
        await fetchProofreadReport()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to save adjustments.')
      }
    } catch (e) {
      setErrorBanner(`Error saving adjustments: ${e.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAcceptProofread = async () => {
    if (isDirty) {
      if (!window.confirm('You have unsaved manual edits! Save them before accepting?')) {
        return
      }
      await handleSaveAdjustments()
    }

    try {
      const res = await fetch(getApiUrl(`/api/proofreading/sessions/${sessionId}/accept`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (res.ok) {
        setSuccessBanner('✓ Proofread report accepted! Ready for Final Report.')
        await fetchProofreadReport()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to accept proofread report.')
      }
    } catch (e) {
      setErrorBanner(`Error accepting proofread report: ${e.message}`)
    }
  }

  const handleActivateRevision = async (revId) => {
    try {
      const res = await fetch(getApiUrl(`/api/proofreading/sessions/${sessionId}/revisions/${revId}/activate`), {
        method: 'POST',
      })
      if (res.ok) {
        setSuccessBanner('✓ Restored earlier proofread revision.')
        setTimeout(() => setSuccessBanner(null), 3000)
        await fetchProofreadReport()
      }
    } catch (e) {
      alert(`Error activating revision: ${e.message}`)
    }
  }

  const handleCopyReport = () => {
    if (!reportText) return
    navigator.clipboard.writeText(`# ${reportTitle}\n\n${reportText}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const activeRev = proofreadingData.active_revision
  const sourceEdited = proofreadingData.source_edited_report
  const isComplete = proofreadingData.proofreading_status === 'complete'
  const canProofread = proofreadingData.can_proofread
  const isFinalized = isComplete
  const wordCount = reportText ? reportText.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = reportText ? reportText.length : 0

  return (
    <div className="editing-workspace-container proofreading-workspace-container">
      {/* Top Header Navigation Bar */}
      <div className="editing-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid #e3e8ef' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
            ← Back to Editing
          </button>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f2947', margin: '0 0 0.25rem 0' }}>
              {session?.title || 'Sunday Morning Worship & Sermon'}
            </h2>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
              <span>👤 Minister: <strong>{session?.minister_name || session?.speaker || 'Pst. Williams'}</strong></span>
              <span>📅 {session?.date_created ? new Date(session.date_created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Oct 24, 2023'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={() => setIsStandardsOpen(true)}
            id="btn-manage-proofreading-standards"
          >
            ⚙️ Proofreading Standard ({aiStatus.active_standard_version})
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {errorBanner && (
        <div className="error-banner" role="alert">
          <div className="error-content">
            <span className="error-icon">⚠️</span>
            <div className="error-text">{errorBanner}</div>
          </div>
          <button type="button" className="error-dismiss" onClick={() => setErrorBanner(null)}>
            ✕
          </button>
        </div>
      )}

      {successBanner && (
        <div className="feedback-banner" role="status">
          {successBanner}
        </div>
      )}

      {/* STATE 1: PRE-RUN STATE (proofreading-workspace.png) */}
      {!activeRev && !isGenerating && (
        <div className="proofreading-pre-run-box">
          <div className="proofreading-magnifier-icon">🔍</div>
          <h3 className="proofreading-pre-run-title">Run Automated Proofread</h3>
          <p className="proofreading-pre-run-desc">
            The AI Proofreader checks spelling, grammar, punctuation, and scripture citations according to DLBC Standard {aiStatus.active_standard_version || 'v1.4'} without altering theological meaning.
          </p>

          {!canProofread && (
            <div className="notice-card" style={{ margin: '0.5rem 0', maxWidth: '480px' }}>
              <p className="text-warning" style={{ margin: 0, fontSize: '0.88rem' }}>
                ⚠️ An approved Edited Report is required before Proofreading can begin.
              </p>
            </div>
          )}

          <button
            type="button"
            className="btn-start-proofreading-large"
            onClick={handleRunProofread}
            disabled={!canProofread || isGenerating}
            id="btn-start-proofreading"
          >
            <span>⚡</span>
            <span>Start Proofreading Run</span>
          </button>

          <span className="proofreading-est-time">Est. time: ~10-20 seconds</span>
        </div>
      )}

      {/* LOADING STATE */}
      {isGenerating && (
        <div className="card editor-loading-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div className="spinner"></div>
          <h3 style={{ marginTop: '1.25rem', color: '#0f2947' }}>Proofreading in Progress...</h3>
          <p style={{ color: '#64748b' }}>Checking spelling, grammar, punctuation, and Scripture formatting against editorial standards...</p>
        </div>
      )}

      {/* STATE 2 & 3: REVIEW STATE OR FINALIZED STATE */}
      {activeRev && !isGenerating && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Banner: Review Mode vs Finalized */}
          {isFinalized ? (
            <div className="reporting-ready-floating-card" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
              <div className="ready-card-left">
                <div className="ready-check-icon-circle" style={{ background: '#10b981', color: '#ffffff' }}>✓</div>
                <div className="ready-card-text">
                  <strong style={{ color: '#065f46' }}>Proofreading Finalized</strong>
                  <p style={{ color: '#047857' }}>The report has been successfully proofread and locked. It is now ready for final publishing.</p>
                </div>
              </div>
              <div className="ready-card-actions">
                <button
                  type="button"
                  className="btn-continue-editing-primary"
                  onClick={onNavigateToFinalReport}
                  id="btn-continue-to-final-report"
                >
                  <span>Continue to Final Report</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="proofreading-review-top-banner">
              <div className="review-banner-left">
                <div className="review-check-badge">✓</div>
                <div>
                  <h4 className="review-banner-title">Proofreading Complete</h4>
                  <p className="review-banner-sub">
                    {activeRev.changes?.length || 0} suggestions made across the document.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => setShowRerunConfirm(true)}
                  title="Re-run AI proofreading"
                >
                  ↻ Re-run
                </button>

                <button
                  type="button"
                  className="btn-save-changes"
                  onClick={handleSaveAdjustments}
                  disabled={!isDirty || isSaving}
                  id="btn-save-proofread-adjustments"
                >
                  {isSaving ? 'Saving...' : 'Save Edits'}
                </button>

                <button
                  type="button"
                  className="btn-complete-editing-dark"
                  onClick={handleAcceptProofread}
                  id="btn-complete-proofreading"
                >
                  <span>Complete Proofreading</span>
                  <span>✓</span>
                </button>
              </div>
            </div>
          )}

          {/* 2-Column Grid */}
          <div className="editing-two-col-grid">
            {/* Left Column: Document Surface */}
            <div className="editing-editor-col">
              <div className="review-toolbar-row">
                {isFinalized ? (
                  <div className="document-locked-bar">
                    <span>🔒 DOCUMENT LOCKED</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span className="review-mode-pill">● Review Mode</span>
                    {isDirty && <span className="badge badge--warning">● Unsaved Edits</span>}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={handleCopyReport}
                    title="Copy full report"
                  >
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    onClick={() => setShowRevisionsDrawer(!showRevisionsDrawer)}
                  >
                    🕒 Revisions ({proofreadingData.revisions_count || 1})
                  </button>
                </div>
              </div>

              <div className="editing-paper-surface">
                <input
                  id="proofread-title-input"
                  type="text"
                  className="editing-paper-title-input"
                  value={reportTitle}
                  onChange={handleTitleChange}
                  disabled={isFinalized}
                  placeholder="Enter message topic..."
                />

                <textarea
                  id="proofread-text-textarea"
                  className="editing-paper-textarea"
                  value={reportText}
                  onChange={handleTextChange}
                  disabled={isFinalized}
                  placeholder="Proofread report content..."
                />

                {isFinalized && (
                  <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                    <span className="end-of-transcript-pill">● END OF TRANSCRIPT</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Suggestions Sidebar or Final Summary Sidebar */}
            <div className="editing-right-sidebar-panel">
              {isFinalized ? (
                <div className="suggestions-sidebar-card">
                  <div className="suggestions-sidebar-header">
                    <h4 className="suggestions-title">Session Summary</h4>
                    <span className="badge badge--success">Complete</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Total Corrections:</span>
                      <strong>{activeRev.changes?.length || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Words:</span>
                      <strong>{wordCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Standard:</span>
                      <strong>DLBC Standard {activeRev.standard_version_label || 'v1.4'}</strong>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <button
                      type="button"
                      className="btn btn--outline btn--small"
                      onClick={handleCopyReport}
                      style={{ width: '100%' }}
                    >
                      📋 Copy Full Transcript
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--small"
                      onClick={() => window.print()}
                      style={{ width: '100%' }}
                    >
                      🖨 Print View
                    </button>
                  </div>
                </div>
              ) : (
                <div className="suggestions-sidebar-card">
                  <div className="suggestions-sidebar-header">
                    <h4 className="suggestions-title">Suggestions</h4>
                    <span className="suggestions-count-pill">{activeRev.changes?.length || 0} Left</span>
                  </div>

                  {activeRev.changes && activeRev.changes.length > 0 ? (
                    <ProofreadingChangesList
                      changes={activeRev.changes}
                      reviewNotes={activeRev.review_notes}
                    />
                  ) : (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: '#10b981' }}>
                      <span style={{ fontSize: '1.5rem' }}>✓</span>
                      <p style={{ margin: '0.5rem 0 0 0', fontWeight: 700, fontSize: '0.88rem' }}>No language issues detected!</p>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Text aligns with DLBC editorial standard.</span>
                    </div>
                  )}

                  {/* Manual Confirmation Alert Box */}
                  <div className="ai-review-notes-alert-card" style={{ marginTop: '0.5rem' }}>
                    <div className="review-notes-header">
                      <span>⚠ Manual Confirmation</span>
                    </div>
                    <p className="review-note-desc">
                      Verify speaker quotes and proper nouns against church history standard.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      {showRevisionsDrawer && (
        <div className="modal-backdrop" onClick={() => setShowRevisionsDrawer(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🕒 Proofread Report Revisions History</h3>
              <button type="button" className="btn-close" onClick={() => setShowRevisionsDrawer(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <ul className="standards-history-list">
                {proofreadingData.revisions.map((rev) => (
                  <li
                    key={rev.revision_id}
                    className={`history-item ${rev.is_active ? 'history-item--active' : ''}`}
                  >
                    <div className="history-info">
                      <strong>Revision {rev.revision_number}</strong>{' '}
                      <span className="badge badge--secondary">
                        {rev.revision_source === 'human_reviewed' ? '👤 Human Adjusted' : '⚡ AI Proofread'}
                      </span>
                      {rev.is_accepted && <span className="badge badge--success">✓ Accepted</span>}
                      {rev.is_active && <span className="badge badge--primary">Active</span>}
                      <span className="history-date">{new Date(rev.created_at).toLocaleString()}</span>
                      <p className="history-notes">{rev.proofread_title}</p>
                    </div>
                    <div className="history-actions">
                      {!rev.is_active && (
                        <button
                          type="button"
                          className="btn btn--outline btn--small"
                          onClick={() => {
                            handleActivateRevision(rev.revision_id)
                            setShowRevisionsDrawer(false)
                          }}
                        >
                          Restore This Revision
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Safety Confirmation Modal for Re-running AI Proofreading */}
      {showRerunConfirm && (
        <div className="modal-backdrop" onClick={() => setShowRerunConfirm(false)}>
          <div className="modal-container modal-container--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>↻ Confirm AI Proofreading Re-run</h3>
              <button type="button" className="btn-close" onClick={() => setShowRerunConfirm(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                Re-running will run the AI Proofreader again on the source Edited Report.
              </p>
              <p>
                <strong>Your existing proofread revisions will be safely preserved in the Revisions History</strong> and can be restored at any time.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn--secondary" onClick={() => setShowRerunConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={handleRunProofread}>
                Yes, Re-run Proofreading
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proofreading Standards Modal */}
      <ProofreadingStandardsModal
        isOpen={isStandardsOpen}
        onClose={() => setIsStandardsOpen(false)}
        onStandardUpdated={(updatedStd) => {
          setAiStatus((prev) => ({ ...prev, active_standard_version: updatedStd.version_label }))
        }}
      />
    </div>
  )
}
