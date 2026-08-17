import React, { useState, useEffect, useCallback } from 'react'
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
    model: 'gemini-2.5-flash',
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
      const res = await fetch('http://localhost:8000/api/proofreading/status')
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
      const res = await fetch(`http://localhost:8000/api/proofreading/sessions/${sessionId}/report`)
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

      const res = await fetch(`http://localhost:8000/api/proofreading/sessions/${sessionId}/run`, {
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
      const res = await fetch(`http://localhost:8000/api/proofreading/sessions/${sessionId}/save`, {
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
      const res = await fetch(`http://localhost:8000/api/proofreading/sessions/${sessionId}/accept`, {
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
      const res = await fetch(`http://localhost:8000/api/proofreading/sessions/${sessionId}/revisions/${revId}/activate`, {
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
  const wordCount = reportText ? reportText.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = reportText ? reportText.length : 0

  return (
    <div className="editing-workspace proofreading-workspace">
      {/* Top Header Navigation Bar */}
      <div className="editing-header-bar">
        <div className="header-left">
          <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
            ← Back to Session
          </button>
          <div>
            <h2>{session?.title || 'Session Proofreading'}</h2>
            <div className="session-breadcrumbs">
              <span className="breadcrumb-item">Recording ✓</span>
              <span className="breadcrumb-item">Raw Transcript ✓</span>
              <span className="breadcrumb-item">Verification ✓</span>
              <span className="breadcrumb-item">Verified Transcript ✓</span>
              <span className="breadcrumb-item">Reporting ✓</span>
              <span className="breadcrumb-item">Editing ✓</span>
              <span className="breadcrumb-item breadcrumb-item--active">Proofreading ●</span>
              <span className="breadcrumb-item breadcrumb-item--future">Final Report ○</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={() => setIsStandardsOpen(true)}
          >
            ⚙️ Proofreading Standards ({aiStatus.active_standard_version})
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

      {/* Proofreading Status Ribbon */}
      <div className="editing-status-ribbon">
        <div className="ribbon-item">
          <span className="ribbon-label">Primary Source:</span>
          {sourceEdited ? (
            <span className="badge badge--success">✓ Edited Report (Rev {sourceEdited.revision_number})</span>
          ) : (
            <span className="badge badge--warning">⚠ Missing Edited Report</span>
          )}
        </div>

        <div className="ribbon-item">
          <span className="ribbon-label">Standard:</span>
          <span className="badge badge--primary">Proofreading Standard {aiStatus.active_standard_version}</span>
        </div>

        {activeRev && (
          <div className="ribbon-item">
            <span className="ribbon-label">Active Revision:</span>
            <span className="badge badge--secondary">
              Rev {activeRev.revision_number} ({activeRev.revision_source === 'human_reviewed' ? 'Human Adjusted' : 'AI Proofread'})
            </span>
          </div>
        )}

        <div className="ribbon-item">
          <span className="ribbon-label">Status:</span>
          {isComplete ? (
            <span className="badge badge--success">✓ Proofreading Complete</span>
          ) : isDirty ? (
            <span className="badge badge--warning">● Unsaved Changes</span>
          ) : activeRev ? (
            <span className="badge badge--primary">In Review</span>
          ) : (
            <span className="badge badge--muted">Ready to Run</span>
          )}
        </div>

        <div className="ribbon-action">
          {activeRev ? (
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => setShowRevisionsDrawer(!showRevisionsDrawer)}
            >
              🕒 Revisions ({proofreadingData.revisions_count})
            </button>
          ) : null}
        </div>
      </div>

      {/* Stage Complete Banner */}
      {isComplete && (
        <div className="reports-ready-banner">
          <div className="banner-text">
            <h4>✓ Proofreading Complete!</h4>
            <p>The report has been reviewed, polished, and accepted. It is ready for the Final Report stage.</p>
          </div>
          <button
            type="button"
            className="btn btn--success btn--large"
            onClick={onNavigateToFinalReport || (() => alert('Final Report stage will be implemented in Phase 9.'))}
            id="btn-continue-to-final-report"
          >
            Ready for Final Report →
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="editing-main-layout proofreading-main-layout">
        {/* Left Column: Changes Breakdown or Source Edited Report */}
        <div className="editing-source-col">
          {activeRev ? (
            <div>
              <div className="source-tabs-bar" style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  className={`source-tab ${leftTab === 'changes' ? 'source-tab--active' : ''}`}
                  onClick={() => setLeftTab('changes')}
                >
                  🔍 Suggested Corrections ({activeRev.changes?.length || 0})
                </button>
                <button
                  type="button"
                  className={`source-tab ${leftTab === 'edited_source' ? 'source-tab--active' : ''}`}
                  onClick={() => setLeftTab('edited_source')}
                >
                  📄 Original Edited Report
                </button>
              </div>

              {leftTab === 'changes' && (
                <ProofreadingChangesList
                  changes={activeRev.changes}
                  reviewNotes={activeRev.review_notes}
                />
              )}

              {leftTab === 'edited_source' && (
                <div className="card source-reference-card">
                  <div className="card-header">
                    <div>
                      <h3>📄 Original Edited Report</h3>
                      <p className="card-subtitle">
                        Phase 7 approved source (Rev {sourceEdited?.revision_number})
                      </p>
                    </div>
                  </div>
                  <pre className="source-pre">{sourceEdited?.report_text || 'No edited report text.'}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="card source-reference-card">
              <div className="card-header">
                <div>
                  <h3>📄 Source Edited Report</h3>
                  <p className="card-subtitle">
                    The Proofreader will check this document without altering meaning or structure.
                  </p>
                </div>
              </div>
              <pre className="source-pre">{sourceEdited?.report_text || 'No edited report found. Please complete Phase 7 editing first.'}</pre>
            </div>
          )}
        </div>

        {/* Right Column: AI Proofread Workspace */}
        <div className="editing-editor-col">
          {!activeRev && !isGenerating && (
            <div className="card editor-empty-card">
              <div className="editor-empty-content">
                <h3>🔍 Conservative AI Proofreading</h3>
                <p>
                  The AI Proofreader will perform a careful pass over the Edited Report to catch typographical errors, spelling slips, punctuation inaccuracies, and Scripture citation formats while strictly protecting the text.
                </p>

                {!canProofread && (
                  <div className="notice-card" style={{ margin: '1rem 0' }}>
                    <p className="text-warning">
                      ⚠️ An approved Edited Report from Phase 7 is required before Proofreading can begin.
                    </p>
                  </div>
                )}

                <div className="proofreading-pre-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--large"
                    onClick={handleRunProofread}
                    disabled={!canProofread || isGenerating}
                    id="btn-run-proofread"
                  >
                    ⚡ Run AI Proofread
                  </button>
                </div>
              </div>
            </div>
          )}

          {isGenerating && (
            <div className="card editor-loading-card">
              <div className="spinner"></div>
              <h3>Proofreading in Progress...</h3>
              <p>Checking spelling, grammar, punctuation, and Scripture formatting against editorial standards...</p>
            </div>
          )}

          {activeRev && !isGenerating && (
            <div className="card editor-workspace-card">
              <div className="editor-top-bar">
                <div className="editor-title-box">
                  <label htmlFor="proofread-title-input">Report Title / Topic:</label>
                  <input
                    id="proofread-title-input"
                    type="text"
                    className="form-control report-title-input"
                    value={reportTitle}
                    onChange={handleTitleChange}
                    placeholder="Enter message topic..."
                  />
                </div>

                <div className="editor-top-actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={handleCopyReport}
                    title="Copy full markdown report"
                  >
                    {copied ? '✓ Copied!' : '📋 Copy Report'}
                  </button>

                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    onClick={() => setShowRerunConfirm(true)}
                    title="Re-run AI proofreading"
                  >
                    ↻ Re-run Proofreading
                  </button>
                </div>
              </div>

              {/* Main Editable Textarea */}
              <div className="editor-textarea-container">
                <textarea
                  className="form-control editor-textarea"
                  rows={20}
                  value={reportText}
                  onChange={handleTextChange}
                  placeholder="Proofread report content..."
                />
              </div>

              {/* Bottom Action & Metrics Bar */}
              <div className="editor-bottom-bar">
                <div className="editor-metrics">
                  <span><strong>{wordCount}</strong> words</span>
                  <span><strong>{charCount}</strong> characters</span>
                  <span>Standard: <strong>{activeRev.standard_version_label}</strong></span>
                  <span>Model: <code>{activeRev.model_name || 'gemini-2.5-flash'}</code></span>
                </div>

                <div className="editor-bottom-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleSaveAdjustments}
                    disabled={isSaving || !isDirty}
                    id="btn-save-proofread-edits"
                  >
                    {isSaving ? 'Saving...' : '💾 Save Adjustments'}
                  </button>

                  {!isComplete && (
                    <button
                      type="button"
                      className="btn btn--success"
                      onClick={handleAcceptProofread}
                      id="btn-accept-proofread"
                    >
                      ✓ Accept Proofread Version
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
