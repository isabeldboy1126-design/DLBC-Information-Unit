import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '../../config'
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
    model: 'gemini-3.7-flash',
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
      const res = await fetch(getApiUrl('/api/editing/status'))
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
      const res = await fetch(getApiUrl(`/api/editing/sessions/${sessionId}/report`))
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

      const res = await fetch(getApiUrl(`/api/editing/sessions/${sessionId}/generate`), {
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
      const res = await fetch(getApiUrl(`/api/editing/sessions/${sessionId}/save`), {
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
      const res = await fetch(getApiUrl(`/api/editing/sessions/${sessionId}/revisions/${revId}/activate`), {
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
      const res = await fetch(getApiUrl(`/api/editing/sessions/${sessionId}/complete`), {
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

  const handleExportDocx = async () => {
    if (!activeRev) return
    if (isDirty) {
      const confirmSave = window.confirm(
        'You have unsaved manual edits!\n\nDo you want to save your changes before exporting to Word (.docx)?\n\nClick OK to Save & Export, or Cancel to abort export.'
      )
      if (confirmSave) {
        await handleSave()
      } else {
        return
      }
    }
    window.location.href = getApiUrl(`/api/editing/sessions/${sessionId}/export-docx`)
  }

  const activeRev = editingData.active_revision
  const isComplete = editingData.editing_status === 'complete' || session?.editing_status === 'complete'
  const canEdit = editingData.sources_available.can_edit
  const wordCount = reportText ? reportText.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = reportText ? reportText.length : 0

  return (
    <div className="editing-workspace-container">
      {/* Top Header Navigation Bar Matching editing-workspace.png */}
      <div className="editing-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid #e3e8ef' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
            ← Back to Reporting
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
          <span className="badge" style={{ background: '#eef4fa', color: '#163e73', fontWeight: 700, fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
            🏷️ EDITING PHASE
          </span>
          <div className="session-breadcrumbs" style={{ margin: 0 }}>
            <span className="breadcrumb-item breadcrumb-item--done">1</span>
            <span className="breadcrumb-item breadcrumb-item--active">2</span>
            <span className="breadcrumb-item breadcrumb-item--future">3</span>
          </div>
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

      {/* Editing Subheader Action Bar Matching editing-workspace.png */}
      <div className="editing-top-subbar">
        <div className="editing-standard-label-group">
          <span style={{ color: '#163e73', fontWeight: 700 }}>✦ AI Editor Standard:</span>
          <strong>{aiStatus.active_standard_version || 'v2'}</strong>
          <button
            type="button"
            className="btn-link-small"
            onClick={() => setIsStandardsOpen(true)}
            id="btn-manage-editor-standards"
          >
            Manage
          </button>
        </div>

        <div className="editing-status-pill-save">
          {isDirty ? (
            <span style={{ color: '#d97706', fontWeight: 700 }}>● Unsaved Changes</span>
          ) : isComplete ? (
            <span style={{ color: '#047857', fontWeight: 600 }}>✓ Editing Completed <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>• Ready for Proofreading</span></span>
          ) : activeRev ? (
            <span style={{ color: '#047857', fontWeight: 600 }}>✓ Draft Compiled - Ready for Review <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>• Saved</span></span>
          ) : (
            <span style={{ color: '#64748b' }}>Ready to Compile</span>
          )}
        </div>

        <div className="editing-actions-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-save-changes"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            id="btn-save-edited-report"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>

          {isComplete ? (
            <button
              type="button"
              className="btn btn--primary btn-continue-proofreading"
              onClick={onNavigateToProofreading}
              id="btn-continue-to-proofreading"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.25rem',
                fontWeight: 700,
                fontSize: '0.875rem',
                borderRadius: '8px',
                background: '#0f2947',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15, 41, 71, 0.25)',
              }}
            >
              <span>Continue to Proofreading</span>
              <span style={{ fontSize: '1.1rem' }}>→</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-complete-editing-dark"
              onClick={handleCompleteEditing}
              id="btn-complete-editing"
            >
              <span>Complete Editing</span>
              <span>✓</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Workspace Layout (Document Paper Left, Reference Right) */}
      <div className="editing-two-col-grid">
        {/* Left Column: Editable Document Paper Surface */}
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
            <div className="editing-paper-surface">
              <input
                id="report-title-input"
                type="text"
                className="editing-paper-title-input"
                value={reportTitle}
                onChange={handleTitleChange}
                placeholder="Enter message topic..."
              />

              <textarea
                id="report-text-textarea"
                className="editing-paper-textarea"
                value={reportText}
                onChange={handleTextChange}
                placeholder="Compiled report text..."
              />

              <div className="editing-paper-toolbar">
                <button
                  type="button"
                  onClick={handleCopyReport}
                  title="Copy full markdown report"
                >
                  📋 {copied ? 'Copied!' : 'Copy'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowRevisionsDrawer(!showRevisionsDrawer)}
                  title="View revision history"
                >
                  🕒 Revisions ({editingData.revisions_count || 1})
                </button>

                <button
                  type="button"
                  onClick={() => setShowRegenConfirm(true)}
                  title="Regenerate a new AI revision"
                >
                  ↻ Regenerate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Source Reference Materials & AI Review Notes */}
        <div className="editing-right-sidebar-panel">
          <SourceReferenceDrawer sources={editingData.sources} />

          {/* AI Review Notes Alert Box Matching editing-workspace.png */}
          {activeRev && (
            <div className="ai-review-notes-alert-card">
              <div className="review-notes-header">
                <span>⚠️ AI Review Notes</span>
                <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '0.72rem' }}>
                  {activeRev.source_uncertainties?.length || 1} Issue
                </span>
              </div>
              <p className="review-note-desc">
                {activeRev.source_uncertainties && activeRev.source_uncertainties.length > 0
                  ? activeRev.source_uncertainties[0]
                  : 'Scripture Reference Check: Ensure Bible references match the preacher citations exactly.'}
              </p>
              <div className="review-note-actions">
                <button type="button" className="btn-note-dismiss" onClick={() => {}}>
                  Dismiss
                </button>
                <button
                  type="button"
                  className="btn-note-insert"
                  onClick={() => {
                    setReportText((prev) => prev + '\n\n*Scripture Citation: Verified against Biblical standard.*')
                    setIsDirty(true)
                  }}
                >
                  Insert Citation
                </button>
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
