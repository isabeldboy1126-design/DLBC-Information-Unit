import React, { useState, useEffect, useCallback } from 'react'
import { EditorStandardsModal } from './EditorStandardsModal'
import { SourceReferenceDrawer } from './SourceReferenceDrawer'

export function EditingView({ session, onBack, onNavigateToProofreading }) {
  const [editingData, setEditingData] = useState({
    session_id: session?.session_id,
    editing_status: 'not_started',
    editing_completed_at: null,
    active_revision: null,
    revisions: [],
    sources_available: {
      verified_transcript: false,
      reporter_a: false,
      reporter_b: false,
      can_edit: false,
    },
    sources: {
      verified_text: '',
      reporter_a: null,
      reporter_b: null,
    },
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
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [showRevisionsDrawer, setShowRevisionsDrawer] = useState(false)
  const [errorBanner, setErrorBanner] = useState(null)
  const [successBanner, setSuccessBanner] = useState(null)
  const [copied, setCopied] = useState(false)

  const sessionId = session?.session_id

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/editing/status')
      if (res.ok) {
        const data = await res.json()
        setAiStatus(data)
      }
    } catch (e) {
      console.error('Error fetching editor status:', e)
    }
  }, [])

  const fetchEditingReport = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`http://localhost:8000/api/editing/sessions/${sessionId}/report`)
      if (res.ok) {
        const data = await res.json()
        setEditingData(data)
        if (data.active_revision) {
          setReportTitle(data.active_revision.report_title || session?.title || 'Edited Message Report')
          setReportText(data.active_revision.report_text || '')
          setIsDirty(false)
        }
      }
    } catch (e) {
      console.error('Error fetching edited report:', e)
    }
  }, [sessionId, session?.title])

  useEffect(() => {
    fetchStatus()
    fetchEditingReport()
  }, [fetchStatus, fetchEditingReport])

  const handleTextChange = (e) => {
    setReportText(e.target.value)
    setIsDirty(true)
  }

  const handleTitleChange = (e) => {
    setReportTitle(e.target.value)
    setIsDirty(true)
  }

  const handleGenerate = async () => {
    if (!editingData.sources_available.can_edit) {
      setErrorBanner('Both Reporter A and Reporter B drafts are required before Editing can begin.')
      return
    }

    try {
      setErrorBanner(null)
      setSuccessBanner(null)
      setIsGenerating(true)
      setShowRegenConfirm(false)

      const res = await fetch(`http://localhost:8000/api/editing/sessions/${sessionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (res.ok) {
        const data = await res.json()
        setSuccessBanner('✓ AI Editor successfully compiled the report from Reporter A & B!')
        await fetchEditingReport()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to generate edited report.')
      }
    } catch (e) {
      setErrorBanner(`Network or server error during generation: ${e.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!reportText.trim()) {
      setErrorBanner('Report text cannot be empty.')
      return
    }

    try {
      setErrorBanner(null)
      setIsSaving(true)
      const res = await fetch(`http://localhost:8000/api/editing/sessions/${sessionId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_title: reportTitle.trim() || undefined,
          report_text: reportText.trim(),
        }),
      })

      if (res.ok) {
        setIsDirty(false)
        setSuccessBanner('✓ Manual changes saved successfully as a new revision.')
        setTimeout(() => setSuccessBanner(null), 3000)
        await fetchEditingReport()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to save edits.')
      }
    } catch (e) {
      setErrorBanner(`Error saving edits: ${e.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleActivateRevision = async (revId) => {
    try {
      const res = await fetch(`http://localhost:8000/api/editing/sessions/${sessionId}/revisions/${revId}/activate`, {
        method: 'POST',
      })
      if (res.ok) {
        setSuccessBanner('✓ Restored earlier revision.')
        setTimeout(() => setSuccessBanner(null), 3000)
        await fetchEditingReport()
      }
    } catch (e) {
      alert(`Error activating revision: ${e.message}`)
    }
  }

  const handleCompleteEditing = async () => {
    if (isDirty) {
      if (!window.confirm('You have unsaved changes! Save them before completing editing?')) {
        return
      }
      await handleSave()
    }

    try {
      const res = await fetch(`http://localhost:8000/api/editing/sessions/${sessionId}/complete`, {
        method: 'POST',
      })
      if (res.ok) {
        setSuccessBanner('✓ Editing marked as complete! Ready for Proofreading.')
        await fetchEditingReport()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to complete editing.')
      }
    } catch (e) {
      setErrorBanner(`Error completing editing: ${e.message}`)
    }
  }

  const handleCopyReport = () => {
    if (!reportText) return
    navigator.clipboard.writeText(`# ${reportTitle}\n\n${reportText}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const activeRev = editingData.active_revision
  const isComplete = editingData.editing_status === 'complete'
  const canEdit = editingData.sources_available.can_edit
  const wordCount = reportText ? reportText.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = reportText ? reportText.length : 0

  return (
    <div className="editing-workspace">
      {/* Top Header Navigation Bar */}
      <div className="editing-header-bar">
        <div className="header-left">
          <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
            ← Back to Session
          </button>
          <div>
            <h2>{session?.title || 'Session Editing'}</h2>
            <div className="session-breadcrumbs">
              <span className="breadcrumb-item">Recording ✓</span>
              <span className="breadcrumb-item">Raw Transcript ✓</span>
              <span className="breadcrumb-item">Verification ✓</span>
              <span className="breadcrumb-item">Verified Transcript ✓</span>
              <span className="breadcrumb-item">Reporting ✓</span>
              <span className="breadcrumb-item breadcrumb-item--active">Editing ●</span>
              <span className="breadcrumb-item breadcrumb-item--future">Proofreading ○</span>
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
            ⚙️ Editor Standards ({aiStatus.active_standard_version})
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

      {/* Editing Status Ribbon */}
      <div className="editing-status-ribbon">
        <div className="ribbon-item">
          <span className="ribbon-label">Sources:</span>
          {canEdit ? (
            <span className="badge badge--success">✓ Verified Transcript + Reporter A & B Ready</span>
          ) : (
            <span className="badge badge--warning">⚠ Missing Reporter Drafts</span>
          )}
        </div>

        <div className="ribbon-item">
          <span className="ribbon-label">Standard:</span>
          <span className="badge badge--primary">Editor Standard {aiStatus.active_standard_version}</span>
        </div>

        {activeRev && (
          <div className="ribbon-item">
            <span className="ribbon-label">Active Revision:</span>
            <span className="badge badge--secondary">
              Rev {activeRev.revision_number} ({activeRev.revision_source === 'human_edited' ? 'Human Edited' : 'AI Generated'})
            </span>
          </div>
        )}

        <div className="ribbon-item">
          <span className="ribbon-label">Status:</span>
          {isComplete ? (
            <span className="badge badge--success">✓ Editing Complete</span>
          ) : isDirty ? (
            <span className="badge badge--warning">● Unsaved Changes</span>
          ) : activeRev ? (
            <span className="badge badge--primary">In Review / Saved</span>
          ) : (
            <span className="badge badge--muted">Not Started</span>
          )}
        </div>

        <div className="ribbon-action">
          {activeRev ? (
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => setShowRevisionsDrawer(!showRevisionsDrawer)}
            >
              🕒 Revisions ({editingData.revisions_count})
            </button>
          ) : null}
        </div>
      </div>

      {/* Stage Complete Banner (Ready for Proofreading) */}
      {isComplete && (
        <div className="reports-ready-banner">
          <div className="banner-text">
            <h4>✓ Editing is Complete!</h4>
            <p>The report has been compiled and reviewed. It is now ready for the AI Proofreading stage.</p>
          </div>
          <button
            type="button"
            className="btn btn--success"
            onClick={onNavigateToProofreading || (() => alert('Proofreading stage will be implemented in Phase 8.'))}
            id="btn-continue-to-proofreading"
          >
            Ready for Proofreading →
          </button>
        </div>
      )}

      {/* Main Workspace Layout (Two Columns: Source Reference & Editor) */}
      <div className="editing-main-layout">
        {/* Left Column: Source Reference Drawer */}
        <div className="editing-source-col">
          <SourceReferenceDrawer sources={editingData.sources} />
        </div>

        {/* Right Column: AI Compilation & Interactive Editor */}
        <div className="editing-editor-col">
          {!activeRev && !isGenerating && (
            <div className="card editor-empty-card">
              <div className="editor-empty-content">
                <h3>📝 Synthesize & Compile Report</h3>
                <p>
                  The AI Editor will intelligently reconcile Reporter A (Structure) and Reporter B (Details & Omissions) against the authoritative Verified Transcript.
                </p>

                {!canEdit && (
                  <div className="notice-card" style={{ margin: '1rem 0' }}>
                    <p className="text-warning">
                      ⚠️ Both Reporter A and Reporter B drafts must be generated in the Reporting stage before Editing can begin.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn--primary btn--large"
                  onClick={handleGenerate}
                  disabled={!canEdit || isGenerating}
                  id="btn-generate-editor-draft"
                >
                  ⚡ Generate Compiled Editor Draft
                </button>
              </div>
            </div>
          )}

          {isGenerating && (
            <div className="card editor-loading-card">
              <div className="spinner"></div>
              <h3>Synthesizing Reporter A & B...</h3>
              <p>Reconciling facts against the Verified Transcript and drafting the unified report...</p>
            </div>
          )}

          {activeRev && !isGenerating && (
            <div className="card editor-workspace-card">
              <div className="editor-top-bar">
                <div className="editor-title-box">
                  <label htmlFor="report-title-input">Report Title / Topic:</label>
                  <input
                    id="report-title-input"
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
                    onClick={() => setShowRegenConfirm(true)}
                    title="Regenerate a new AI revision"
                  >
                    ↻ Regenerate Draft
                  </button>
                </div>
              </div>

              {/* Review notes / Source uncertainties if surfaced by AI */}
              {activeRev.source_uncertainties && activeRev.source_uncertainties.length > 0 && (
                <div className="source-uncertainties-banner">
                  <strong>🔍 Unverified Discrepancies Flagged by AI:</strong>
                  <ul>
                    {activeRev.source_uncertainties.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activeRev.review_notes && activeRev.review_notes.length > 0 && (
                <div className="review-notes-box">
                  <strong>💡 Editorial Synthesis Notes:</strong>
                  <ul>
                    {activeRev.review_notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Main Editable Textarea */}
              <div className="editor-textarea-container">
                <textarea
                  className="form-control editor-textarea"
                  rows={20}
                  value={reportText}
                  onChange={handleTextChange}
                  placeholder="Compiled report content..."
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
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    id="btn-save-edits"
                  >
                    {isSaving ? 'Saving...' : '💾 Save Changes'}
                  </button>

                  {!isComplete && (
                    <button
                      type="button"
                      className="btn btn--success"
                      onClick={handleCompleteEditing}
                      id="btn-complete-editing"
                    >
                      ✓ Complete Editing
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Revision History Drawer / Modal */}
      {showRevisionsDrawer && (
        <div className="modal-backdrop" onClick={() => setShowRevisionsDrawer(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🕒 Edited Report Revisions History</h3>
              <button type="button" className="btn-close" onClick={() => setShowRevisionsDrawer(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <ul className="standards-history-list">
                {editingData.revisions.map((rev) => (
                  <li
                    key={rev.revision_id}
                    className={`history-item ${rev.is_active ? 'history-item--active' : ''}`}
                  >
                    <div className="history-info">
                      <strong>Revision {rev.revision_number}</strong>{' '}
                      <span className="badge badge--secondary">
                        {rev.revision_source === 'human_edited'
                          ? '👤 Human Edited'
                          : rev.revision_source === 'ai_regenerated'
                          ? '↻ AI Regenerated'
                          : '⚡ AI Generated'}
                      </span>
                      {rev.is_active && <span className="badge badge--success">Active</span>}
                      <span className="history-date">{new Date(rev.created_at).toLocaleString()}</span>
                      <p className="history-notes">{rev.report_title}</p>
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

      {/* Safety Confirmation Modal for AI Regeneration */}
      {showRegenConfirm && (
        <div className="modal-backdrop" onClick={() => setShowRegenConfirm(false)}>
          <div className="modal-container modal-container--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>↻ Confirm AI Regeneration</h3>
              <button type="button" className="btn-close" onClick={() => setShowRegenConfirm(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                Regenerating will run the AI Editor again using Reporter A, Reporter B, and the Verified Transcript.
              </p>
              <p>
                <strong>Your existing revision will be safely preserved in the Revisions History</strong> and you can restore it at any time.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn--secondary" onClick={() => setShowRegenConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={handleGenerate}>
                Yes, Generate New Revision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Standards Management Modal */}
      <EditorStandardsModal
        isOpen={isStandardsOpen}
        onClose={() => setIsStandardsOpen(false)}
        onStandardUpdated={(updatedStd) => {
          setAiStatus((prev) => ({ ...prev, active_standard_version: updatedStd.version_label }))
        }}
      />
    </div>
  )
}
