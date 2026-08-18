import React, { useState, useEffect, useCallback } from 'react'

export function FinalReportView({ session, onBack }) {
  const [finalReportData, setFinalReportData] = useState({
    session_id: session?.session_id,
    final_report_status: 'not_started',
    final_report_completed_at: null,
    can_finalize: false,
    active_final_report: null,
    revisions: [],
    revisions_count: 0,
    source_proofread_report: null,
    suggested_docx_filename: '',
  })

  const [isFinalizing, setIsFinalizing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [reportTitle, setReportTitle] = useState('')
  const [reportText, setReportText] = useState('')
  const [isSavingRevision, setIsSavingRevision] = useState(false)
  const [showRevisionsModal, setShowRevisionsModal] = useState(false)
  const [errorBanner, setErrorBanner] = useState(null)
  const [successBanner, setSuccessBanner] = useState(null)
  const [copied, setCopied] = useState(false)

  const sessionId = session?.session_id

  const fetchFinalReportData = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`http://localhost:8000/api/final-report/sessions/${sessionId}`)
      if (res.ok) {
        const data = await res.json()
        setFinalReportData(data)
        if (data.active_final_report) {
          setReportTitle(data.active_final_report.report_title || session?.title || 'Final Message Report')
          setReportText(data.active_final_report.report_text || '')
        } else if (data.source_proofread_report) {
          setReportTitle(data.source_proofread_report.proofread_title || session?.title || 'Message Report')
          setReportText(data.source_proofread_report.proofread_text || '')
        }
      }
    } catch (e) {
      console.error('Error fetching final report:', e)
    }
  }, [sessionId, session?.title])

  useEffect(() => {
    fetchFinalReportData()
  }, [fetchFinalReportData])

  const handleFinalizeReport = async () => {
    try {
      setErrorBanner(null)
      setIsFinalizing(true)
      const res = await fetch(`http://localhost:8000/api/final-report/sessions/${sessionId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_title: reportTitle.trim() || undefined,
        }),
      })

      if (res.ok) {
        setSuccessBanner('✓ Final Report finalized successfully! Microsoft Word (.docx) document is ready for download.')
        await fetchFinalReportData()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to finalize report.')
      }
    } catch (e) {
      setErrorBanner(`Error finalizing report: ${e.message}`)
    } finally {
      setIsFinalizing(false)
    }
  }

  const handleSaveRevision = async () => {
    if (!reportText.trim()) {
      setErrorBanner('Report text cannot be empty.')
      return
    }

    try {
      setErrorBanner(null)
      setIsSavingRevision(true)
      const res = await fetch(`http://localhost:8000/api/final-report/sessions/${sessionId}/save-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_title: reportTitle.trim() || undefined,
          report_text: reportText.trim(),
        }),
      })

      if (res.ok) {
        setIsEditing(false)
        setSuccessBanner('✓ Final Report revision saved successfully!')
        setTimeout(() => setSuccessBanner(null), 3000)
        await fetchFinalReportData()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to save revision.')
      }
    } catch (e) {
      setErrorBanner(`Error saving revision: ${e.message}`)
    } finally {
      setIsSavingRevision(false)
    }
  }

  const handleDownloadDocx = () => {
    if (!activeFinal) return
    window.location.href = `http://localhost:8000/api/final-report/sessions/${sessionId}/download`
  }

  const handleCopyReport = () => {
    if (!reportText) return
    navigator.clipboard.writeText(`# ${reportTitle}\n\n${reportText}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleActivateRevision = async (revId) => {
    try {
      const res = await fetch(`http://localhost:8000/api/final-report/sessions/${sessionId}/revisions/${revId}/activate`, {
        method: 'POST',
      })
      if (res.ok) {
        setSuccessBanner('✓ Restored earlier Final Report revision.')
        setTimeout(() => setSuccessBanner(null), 3000)
        await fetchFinalReportData()
      }
    } catch (e) {
      alert(`Error activating revision: ${e.message}`)
    }
  }

  const activeFinal = finalReportData.active_final_report
  const isFinalized = Boolean(activeFinal)
  const canFinalize = finalReportData.can_finalize
  const wordCount = reportText ? reportText.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = reportText ? reportText.length : 0
  const fileSizeKb = activeFinal?.docx_file_size ? (activeFinal.docx_file_size / 1024).toFixed(1) : null

  return (
    <div className="final-report-workspace">
      {/* Top Navigation Bar */}
      <div className="editing-header-bar">
        <div className="header-left">
          <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
            ← Back to Session Overview
          </button>
          <div>
            <h2>{reportTitle || session?.title || 'Final Report'}</h2>
            <div className="session-breadcrumbs">
              <span className="breadcrumb-item">Recording ✓</span>
              <span className="breadcrumb-item">Raw Transcript ✓</span>
              <span className="breadcrumb-item">Verification ✓</span>
              <span className="breadcrumb-item">Verified Transcript ✓</span>
              <span className="breadcrumb-item">Reporting ✓</span>
              <span className="breadcrumb-item">Editing ✓</span>
              <span className="breadcrumb-item">Proofreading ✓</span>
              <span className="breadcrumb-item breadcrumb-item--active">Final Report ● Complete</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          {isFinalized && (
            <button
              type="button"
              className="btn btn--success btn--large"
              onClick={handleDownloadDocx}
              id="btn-download-final-docx-top"
              title="Download Microsoft Word .docx file"
            >
              📥 Download Word Document (.docx)
            </button>
          )}
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

      {/* Status Ribbon */}
      <div className="editing-status-ribbon">
        <div className="ribbon-item">
          <span className="ribbon-label">Workflow Status:</span>
          {isFinalized ? (
            <span className="badge badge--success">✓ Workflow Complete</span>
          ) : (
            <span className="badge badge--primary">Ready to Finalize</span>
          )}
        </div>

        <div className="ribbon-item">
          <span className="ribbon-label">Format:</span>
          <span className="badge badge--secondary">Microsoft Word (.docx)</span>
        </div>

        {activeFinal && (
          <div className="ribbon-item">
            <span className="ribbon-label">Revision:</span>
            <span className="badge badge--primary">Final Release (Rev {activeFinal.revision_number})</span>
          </div>
        )}

        {fileSizeKb && (
          <div className="ribbon-item">
            <span className="ribbon-label">File Size:</span>
            <span className="badge badge--muted">{fileSizeKb} KB</span>
          </div>
        )}

        <div className="ribbon-action">
          {isFinalized && finalReportData.revisions_count > 1 && (
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => setShowRevisionsModal(true)}
            >
              🕒 Revisions ({finalReportData.revisions_count})
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {!isFinalized ? (
        <div className="card editor-empty-card" style={{ marginTop: '1.5rem' }}>
          <div className="editor-empty-content">
            <h3>🏆 Ready for Final Report Generation</h3>
            <p>
              The Proofread Report has been approved. Finalizing will generate an immutable Final Report record and create a beautifully formatted, editable Microsoft Word (.docx) document ready for distribution.
            </p>

            <div className="final-report-metadata-preview">
              <div className="preview-item">
                <strong>Message Title:</strong> {reportTitle}
              </div>
              <div className="preview-item">
                <strong>Service Date:</strong> {new Date().toLocaleDateString()}
              </div>
              <div className="preview-item">
                <strong>Export Filename:</strong> <code>{finalReportData.suggested_docx_filename || 'Message Report.docx'}</code>
              </div>
            </div>

            <div className="proofreading-pre-actions" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn--primary btn--large"
                onClick={handleFinalizeReport}
                disabled={!canFinalize || isFinalizing}
                id="btn-finalize-report"
              >
                {isFinalizing ? 'Generating Document...' : '🏆 Finalize & Generate Word Document'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card final-report-card">
          <div className="final-report-top-actions">
            <div className="document-filename-tag">
              <span className="filename-icon">📄</span>
              <span className="filename-text">{activeFinal.docx_filename}</span>
            </div>

            <div className="top-action-buttons">
              <button
                type="button"
                className="btn btn--success"
                onClick={handleDownloadDocx}
                id="btn-download-final-docx-card"
              >
                📥 Download .docx
              </button>

              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={handleCopyReport}
              >
                {copied ? '✓ Copied!' : '📋 Copy Text'}
              </button>

              {!isEditing ? (
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => setIsEditing(true)}
                  id="btn-edit-final-report"
                >
                  ✏️ Edit Final Text
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </div>

          {/* Edit Mode vs Read Mode */}
          {isEditing ? (
            <div className="final-report-editor-box">
              <div className="notice-card" style={{ marginBottom: '1rem' }}>
                <p>
                  <strong>ℹ️ Post-Finalization Edit:</strong> Saving edits here will safely create a new incremented Final Report revision without overwriting earlier versions.
                </p>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label><strong>Report Title:</strong></label>
                <input
                  type="text"
                  className="form-control"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                />
              </div>

              <textarea
                className="form-control editor-textarea"
                rows={22}
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
              />

              <div className="editor-bottom-bar" style={{ marginTop: '1rem' }}>
                <div className="editor-metrics">
                  <span><strong>{wordCount}</strong> words</span>
                  <span><strong>{charCount}</strong> characters</span>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSaveRevision}
                  disabled={isSavingRevision}
                  id="btn-save-final-revision"
                >
                  {isSavingRevision ? 'Saving...' : '💾 Save as New Revision'}
                </button>
              </div>
            </div>
          ) : (
            <div className="final-report-viewer">
              {/* Document Header Representation */}
              <div className="doc-paper-header">
                <div className="doc-supertitle">DEEPER CHRISTIAN LIFE MINISTRY — INFORMATION UNIT</div>
                <h1 className="doc-main-title">{activeFinal.report_title}</h1>
                <div className="doc-metadata-line">
                  <span><strong>Minister:</strong> {activeFinal.minister || 'Pastor W.F. Kumuyi'}</span>
                  <span><strong>Service:</strong> {activeFinal.programme || 'Church Service'}</span>
                  <span><strong>Date:</strong> {activeFinal.service_date ? new Date(activeFinal.service_date).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                </div>
                <hr className="doc-divider" />
              </div>

              {/* Document Body */}
              <div className="doc-paper-body">
                <pre className="doc-markdown-pre">{activeFinal.report_text}</pre>
              </div>

              {/* Footer Summary */}
              <div className="doc-paper-footer">
                <span>Deeper Life Bible Church Information Unit</span>
                <span>{wordCount} words</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revisions History Modal */}
      {showRevisionsModal && (
        <div className="modal-backdrop" onClick={() => setShowRevisionsModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🕒 Final Report Revision History</h3>
              <button type="button" className="btn-close" onClick={() => setShowRevisionsModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <ul className="standards-history-list">
                {finalReportData.revisions.map((rev) => (
                  <li
                    key={rev.id}
                    className={`history-item ${rev.is_active ? 'history-item--active' : ''}`}
                  >
                    <div className="history-info">
                      <strong>Revision {rev.revision_number}</strong>{' '}
                      {rev.is_active && <span className="badge badge--success">Active</span>}
                      <span className="history-date">{new Date(rev.created_at).toLocaleString()}</span>
                      <p className="history-notes">{rev.report_title} ({rev.docx_filename})</p>
                    </div>
                    <div className="history-actions">
                      {!rev.is_active && (
                        <button
                          type="button"
                          className="btn btn--outline btn--small"
                          onClick={() => {
                            handleActivateRevision(rev.id)
                            setShowRevisionsModal(false)
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
    </div>
  )
}
