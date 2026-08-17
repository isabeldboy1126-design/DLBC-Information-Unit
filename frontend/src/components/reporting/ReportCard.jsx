import React, { useState } from 'react'

export function ReportCard({
  role,
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
      return <span className="badge badge--success">✓ Draft Ready ({report.standard_version_label || 'v1'})</span>
    }
    if (report.status === 'failed') {
      return <span className="badge badge--danger">✕ Generation Failed</span>
    }
    return <span className="badge badge--muted">{report.status}</span>
  }

  return (
    <div className={`card report-card report-card--${role}`}>
      <div className="card-header">
        <div>
          <h3>{roleTitle}</h3>
          <p className="card-subtitle">{roleSubtitle}</p>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      <div className="card-body">
        {isGenerating && (
          <div className="report-loading-state">
            <div className="spinner"></div>
            <p>Analyzing verified transcript and drafting report...</p>
            <span className="hint-text">Generating independent draft for {roleTitle}</span>
          </div>
        )}

        {!isGenerating && report && report.status === 'failed' && (
          <div className="report-failed-box">
            <p className="text-danger">
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
          <div className="report-ready-content">
            <div className="report-meta-bar">
              <span className="report-title-header">
                <strong>{report.report_title || 'Message Report Draft'}</strong>
              </span>
              <div className="report-actions">
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={handleCopy}
                  title="Copy formatted markdown report"
                >
                  {copied ? '✓ Copied!' : '📋 Copy Draft'}
                </button>
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={onRegenerate}
                  disabled={disabled}
                  title="Regenerate this reporter draft independently"
                >
                  ↻ Regenerate
                </button>
              </div>
            </div>

            {report.scriptures && report.scriptures.length > 0 && (
              <div className="scriptures-pill-box">
                <span className="pill-label">Scriptures:</span>
                {report.scriptures.map((sc, i) => (
                  <span key={i} className="scripture-pill">
                    📖 {sc}
                  </span>
                ))}
              </div>
            )}

            {report.key_points && report.key_points.length > 0 && (
              <div className="key-points-summary">
                <strong>Main Points Identified:</strong>
                <ul>
                  {report.key_points.map((kp, idx) => (
                    <li key={idx}>{kp}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="report-text-container">
              <pre className="report-markdown-preview">{report.report_text}</pre>
            </div>

            {report.warnings && report.warnings.length > 0 && (
              <div className="report-warnings-note">
                <strong>Transcript Observations:</strong>
                <ul>
                  {report.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="report-footer-meta">
              <span>Standard: <strong>{report.standard_version_label}</strong></span>
              <span>Model: <code>{report.model_name || 'gemini'}</code></span>
              <span>Created: {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        )}

        {!isGenerating && !report && (
          <div className="report-empty-state">
            <p>No report draft generated yet for {roleTitle}.</p>
            <p className="hint-text">
              Click <strong>"Generate Reports"</strong> above to generate both independent drafts from the Verified Transcript.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
