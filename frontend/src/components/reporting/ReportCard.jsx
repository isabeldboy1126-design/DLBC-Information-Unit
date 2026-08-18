import React, { useState } from 'react'

export function ReportCard({
  role,
  roleBadge = 'A',
  roleTitle,
  roleSubtitle,
  report,
  isGenerating,
  onRegenerate,
  disabled,
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!report?.report_text) return
    navigator.clipboard.writeText(
      `# ${report.report_title || roleTitle}\n\n${report.report_text}`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getStatusBadge = () => {
    if (isGenerating) {
      return <span className="badge badge--warning badge--pulse">⚡ Generating...</span>
    }
    if (!report) {
      return <span className="badge badge--muted">○ Not Generated</span>
    }
    if (report.status === 'ready') {
      return <span className="badge badge--success">✓ Draft Ready</span>
    }
    if (report.status === 'failed') {
      return <span className="badge badge--danger">✕ Generation Failed</span>
    }
    return <span className="badge badge--muted">{report.status}</span>
  }

  return (
    <div className={`card stitch-report-card report-card--${role}`}>
      <div className="stitch-report-card-header">
        <div className="reporter-badge-title-group">
          <span className={`role-badge-box role-badge-box--${roleBadge.toLowerCase()}`}>
            {roleBadge}
          </span>
          <h3 className="reporter-card-title">{roleTitle}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {getStatusBadge()}
          <button
            type="button"
            className="btn-icon-refresh"
            onClick={onRegenerate}
            disabled={disabled || isGenerating}
            title={`Regenerate ${roleTitle}`}
          >
            ↻
          </button>
        </div>
      </div>

      <div className="card-body" style={{ padding: 0 }}>
        {isGenerating && (
          <div className="report-loading-state" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <div className="spinner"></div>
            <p style={{ marginTop: '0.85rem', color: '#1e293b', fontWeight: 600 }}>Analyzing verified transcript and drafting report...</p>
            <span className="hint-text" style={{ fontSize: '0.8rem', color: '#64748b' }}>Generating independent draft for {roleTitle}</span>
          </div>
        )}

        {!isGenerating && report && report.status === 'failed' && (
          <div className="report-failed-box" style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px' }}>
            <p className="text-danger" style={{ color: '#b91c1c', margin: '0 0 0.5rem 0' }}>
              <strong>Generation Error:</strong> {report.error_message || 'Could not generate report.'}
            </p>
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={onRegenerate}
              disabled={disabled}
            >
              ↻ Retry {roleTitle}
            </button>
          </div>
        )}

        {!isGenerating && report && report.status === 'ready' && (
          <div className="report-ready-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <strong style={{ fontSize: '1.05rem', color: '#0f2947' }}>
                {report.report_title || 'Message Report Draft'}
              </strong>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={handleCopy}
                title="Copy formatted draft"
              >
                {copied ? '✓ Copied!' : '📋 Copy Draft'}
              </button>
            </div>

            {/* Special Structured Presentation for Reporter B Details if available */}
            {role === 'reporter_b' && report.key_points && report.key_points.length > 0 && (
              <div className="reporter-key-details-box">
                <div className="key-details-title-row">
                  <span>📋</span>
                  <span>Key Details Log</span>
                </div>
                <ul className="key-details-list">
                  {report.key_points.map((kp, idx) => (
                    <li key={idx}><strong>{kp.split(':')[0]}:</strong> {kp.split(':').slice(1).join(':')}</li>
                  ))}
                </ul>
              </div>
            )}

            {report.scriptures && report.scriptures.length > 0 && (
              <div className="scriptures-pill-box" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                <span className="pill-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Scriptures:</span>
                {report.scriptures.map((sc, i) => (
                  <span key={i} className="scripture-pill" style={{ background: '#eff6ff', color: '#1e40af', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
                    📖 {sc}
                  </span>
                ))}
              </div>
            )}

            <div className="report-text-container" style={{ maxHeight: '420px', overflowY: 'auto', background: '#fafcff', border: '1px solid #eef2f6', borderRadius: '8px', padding: '1.25rem' }}>
              <pre className="report-markdown-preview" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.92rem', lineHeight: '1.65', color: '#1e293b', margin: 0 }}>
                {report.report_text}
              </pre>
            </div>

            <div className="report-footer-meta" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
              <span>Standard: <strong>{report.standard_version_label}</strong></span>
              <span>Created: {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        )}

        {!isGenerating && !report && (
          <div className="report-empty-state" style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>No report draft generated yet for {roleTitle}.</p>
            <p className="hint-text" style={{ fontSize: '0.82rem', margin: 0 }}>
              Click <strong>"Generate Reports"</strong> above to generate both independent drafts from the Verified Transcript.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
