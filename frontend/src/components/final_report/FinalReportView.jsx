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
      {/* Top Navigation & Action Banner Matching final-report.png */}
      <div className="reporting-ready-floating-card" style={{ marginBottom: '1.5rem', background: '#ffffff' }}>
        <div className="ready-card-left">
          <div className="ready-check-icon-circle" style={{ background: '#ecfdf5', color: '#10b981' }}>✓</div>
          <div className="ready-card-text">
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#10b981', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              WORKFLOW COMPLETE
            </span>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f2947', margin: '0.15rem 0' }}>
              Final Report Ready
            </h3>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b' }}>
              {session?.title || 'Sunday Morning Worship & Sermon'} • {reportTitle || 'Message Report'}
            </p>
          </div>
        </div>

        <div className="ready-card-actions">
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={handleCopyReport}
            title="Copy formatted text"
          >
            {copied ? '✓ Copied!' : '📋 Copy Text'}
          </button>

          {isFinalized && (
            <button
              type="button"
              className="btn-continue-editing-primary"
              onClick={handleDownloadDocx}
              id="btn-download-final-docx-card"
              title="Download Microsoft Word (.docx) document"
            >
              <span>Download .docx</span>
              <span>⬇</span>
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

      {/* Main Content: Pre-Finalization or 2-Column Archival View */}
      {!isFinalized ? (
        <div className="card editor-empty-card" style={{ marginTop: '1.5rem', padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div className="editor-empty-content" style={{ maxWidth: '560px', margin: '0 auto' }}>
            <span style={{ fontSize: '2.5rem' }}>🏆</span>
            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f2947', margin: '0.5rem 0' }}>Ready for Final Report Generation</h3>
            <p style={{ color: '#64748b', fontSize: '0.92rem', lineHeight: 1.5 }}>
              The Proofread Report has been approved. Finalizing will generate an immutable Final Report record and create a beautifully formatted, editable Microsoft Word (.docx) document ready for distribution.
            </p>

            <div className="final-report-metadata-preview" style={{ margin: '1.5rem auto' }}>
              <div className="preview-item">
                <strong>Message Title:</strong> {reportTitle}
              </div>
              <div className="preview-item">
                <strong>Export Filename:</strong> <code>{finalReportData.suggested_docx_filename || 'Message Report.docx'}</code>
              </div>
            </div>

            <button
              type="button"
              className="btn-continue-editing-primary"
              style={{ margin: '0 auto' }}
              onClick={handleFinalizeReport}
              disabled={!canFinalize || isFinalizing}
              id="btn-finalize-report"
            >
              <span>{isFinalizing ? 'Generating Document...' : '🏆 Finalize & Generate Word Document'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="final-report-page-grid">
          {/* Left Column: Session Metadata & Post-Finalization Options */}
          <div className="final-report-meta-sidebar">
            <div className="session-meta-panel">
              <h4>Session Metadata</h4>

              <div className="meta-field-item">
                <span className="meta-field-label">DATE</span>
                <span className="meta-field-value">
                  {activeFinal.service_date ? new Date(activeFinal.service_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>

              <div className="meta-field-item">
                <span className="meta-field-label">MINISTER</span>
                <span className="meta-field-value">{activeFinal.minister || session?.minister_name || 'Pastor W.F. Kumuyi'}</span>
              </div>

              <div className="meta-field-item">
                <span className="meta-field-label">DURATION</span>
                <span className="meta-field-value">{session?.duration_seconds ? `${Math.round(session.duration_seconds / 60)} min` : '42 min'}</span>
              </div>

              <div className="meta-field-item">
                <span className="meta-field-label">WORD COUNT</span>
                <span className="meta-field-value">{wordCount} words</span>
              </div>

              <div className="meta-field-item">
                <span className="meta-field-label">FINALIZED BY</span>
                <span className="meta-field-value">Admin User</span>
              </div>
            </div>

            <div className="post-final-box">
              <h5>Post-Finalization</h5>
              <p>Need to make a correction after finalization? Create a new revision without overwriting this copy.</p>
              {!isEditing ? (
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => setIsEditing(true)}
                  id="btn-edit-final-report"
                  style={{ marginTop: '0.25rem' }}
                >
                  ✏️ Create Revision
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

            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => setShowRevisionsModal(true)}
              style={{ width: '100%' }}
            >
              🕒 Revisions ({finalReportData.revisions_count || 1})
            </button>
          </div>

          {/* Right Column: Archival Paper Document Simulation */}
          <div>
            {isEditing ? (
              <div className="editing-paper-surface">
                <div className="notice-card" style={{ marginBottom: '1rem' }}>
                  <p>
                    <strong>ℹ️ Post-Finalization Edit:</strong> Saving edits here will safely create a new incremented Final Report revision without overwriting earlier versions.
                  </p>
                </div>

                <input
                  type="text"
                  className="editing-paper-title-input"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="Report Title..."
                />

                <textarea
                  className="editing-paper-textarea"
                  rows={22}
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                />

                <div className="editing-paper-toolbar">
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
              <div className="final-archival-paper-card">
                <div className="archival-doc-supertitle">
                  FINAL TRANSCRIPT REPORT
                </div>
                <h1 className="archival-doc-main-title">
                  {activeFinal.report_title}
                </h1>
                <div className="archival-doc-delivery">
                  Delivered by {activeFinal.minister || 'Pastor W.F. Kumuyi'} on {activeFinal.service_date ? new Date(activeFinal.service_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <hr className="archival-doc-divider" />

                <div className="archival-body-text">
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '1rem', lineHeight: '1.8', color: '#1e293b', margin: 0 }}>
                    {activeFinal.report_text}
                  </pre>
                </div>

                <div className="archival-doc-footer-centered">
                  <span>🏛 DLBC Information Unit • Archival Copy</span>
                  <span style={{ fontSize: '0.72rem' }}>{wordCount} words • Generated from verified transcription workflow</span>
                </div>
              </div>
            )}
          </div>
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
