import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '../../config'
import { SourceReferenceDrawer } from '../editing/SourceReferenceDrawer'

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
  const [showSourceContext, setShowSourceContext] = useState(false)

  const sessionId = session?.session_id

  const fetchFinalReportData = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}`))
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
      const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}/finalize`), {
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
      const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}/save-revision`), {
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
    window.location.href = getApiUrl(`/api/final-report/sessions/${sessionId}/download`)
  }

  const handleCopyReport = () => {
    if (!reportText) return
    navigator.clipboard.writeText(`# ${reportTitle}\n\n${reportText}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleActivateRevision = async (revId) => {
    try {
      const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}/revisions/${revId}/activate`), {
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

  const [isDownloadingDoc, setIsDownloadingDoc] = useState(false)

  const handleDownloadDocument = async () => {
    if (!sessionId) return
    setIsDownloadingDoc(true)
    setErrorBanner(null)
    try {
      const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}/download`))
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setErrorBanner(err.detail || 'Failed to download document.')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportTitle || session?.title || 'Report'}.docx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setSuccessBanner('✓ Document downloaded successfully!')
      setTimeout(() => setSuccessBanner(null), 3000)
    } catch (e) {
      setErrorBanner(`Failed to download document: ${e.message}`)
    } finally {
      setIsDownloadingDoc(false)
    }
  }

  const hasReportContent = Boolean(reportText && reportText.trim())

  return (
    <div className="final-report-workspace">
      {/* Top Navigation & Action Banner */}
      <div className="reporting-ready-floating-card" style={{ marginBottom: '1.5rem' }}>
        <div className="ready-card-left">
          <div className="ready-doc-icon-circle" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="ready-card-text">
            <h3 className="ready-card-title" style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 0.2rem 0' }}>
              {reportTitle || session?.title || 'Message Report'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>
              {wordCount} words{activeFinal?.revision_number ? ` • Revision ${activeFinal.revision_number}` : ''}
            </p>
          </div>
        </div>

        <div className="ready-card-actions">
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={() => setShowSourceContext((prev) => !prev)}
            aria-expanded={showSourceContext}
            title="Inspect verified transcript and source context"
          >
            {showSourceContext ? '✕ Hide source' : 'Source context'}
          </button>

          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={handleCopyReport}
            title="Copy formatted text"
          >
            {copied ? '✓ Copied!' : '📋 Copy text'}
          </button>

          <button
            type="button"
            className="btn-continue-editing-primary"
            onClick={handleDownloadDocument}
            disabled={isDownloadingDoc || !hasReportContent}
            id="btn-download-final-docx-card"
            title="Download Microsoft Word (.docx) document"
          >
            <span>
              {isDownloadingDoc ? 'Downloading...' : 'Download report'}
            </span>
            <span>⬇</span>
          </button>
        </div>
      </div>

      {/* Collapsible Source Reference Context Drawer */}
      {showSourceContext && (
        <div className="final-report-source-drawer-wrapper" style={{ marginBottom: '1.5rem' }}>
          <SourceReferenceDrawer
            sources={{
              verified_text: session?.verified_text || session?.raw_text || 'No verified transcript found.',
              reporter_a: finalReportData.source_proofread_report
                ? {
                    report_title: finalReportData.source_proofread_report.proofread_title,
                    report_text: finalReportData.source_proofread_report.proofread_text,
                  }
                : null,
            }}
          />
        </div>
      )}

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

      {/* Main Content: 2-Column Archival View or Loading State */}
      {!hasReportContent ? (
        <div className="card editor-empty-card" style={{ marginTop: '1.5rem', padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div className="editor-empty-content" style={{ maxWidth: '560px', margin: '0 auto' }}>
            <span style={{ fontSize: '2.5rem' }}>📄</span>
            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f2947', margin: '0.5rem 0' }}>Preparing Final Report</h3>
            <p style={{ color: '#64748b', fontSize: '0.92rem', lineHeight: 1.5 }}>
              Loading report content and formatting archival document...
            </p>
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
                  {activeFinal?.service_date ? new Date(activeFinal.service_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>

              <div className="meta-field-item">
                <span className="meta-field-label">MINISTER</span>
                <span className="meta-field-value">{activeFinal?.minister || session?.minister_name || session?.minister || 'Minister not provided'}</span>
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
                <span className="meta-field-label">STATUS</span>
                <span className="meta-field-value">Report ready</span>
              </div>
            </div>

            <div className="post-final-box">
              <h5>Post-Finalization</h5>
              <p>Need to make a correction? Edit and save a new revision without overwriting earlier versions.</p>
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

            {finalReportData.revisions?.length > 1 && (
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => setShowRevisionsModal(true)}
                style={{ width: '100%' }}
              >
                🕒 Revisions ({finalReportData.revisions_count || finalReportData.revisions.length})
              </button>
            )}
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
                  {reportTitle || activeFinal?.report_title || 'Message Report'}
                </h1>
                <div className="archival-doc-delivery">
                  Delivered by {activeFinal?.minister || session?.minister || 'Minister not provided'} on {activeFinal?.service_date ? new Date(activeFinal.service_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <hr className="archival-doc-divider" />

                <div className="archival-body-text">
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '1rem', lineHeight: '1.8', margin: 0 }}>
                    {reportText}
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
