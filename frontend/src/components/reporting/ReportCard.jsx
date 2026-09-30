import { Icon } from '../common/Icon'
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
      {/* Standardized Card Header */}
      <div className="stitch-report-card-header">
        <div className="reporter-badge-title-group">
          <span className={`role-badge-box role-badge-box--${roleBadge.toLowerCase()}`}>
            {roleBadge}
          </span>
          <div className="reporter-title-wrap">
            <h3 className="reporter-card-title">{roleTitle}</h3>
            {roleSubtitle && (
              <p className="reporter-card-subtitle">{roleSubtitle}</p>
            )}
          </div>
        </div>
        <div className="reporter-card-header-actions">
          {getStatusBadge()}
          <button
            type="button"
            className="btn-icon-refresh"
            onClick={onRegenerate}
            disabled={disabled || isGenerating}
            title={`Regenerate ${roleTitle}`}
            aria-label={`Regenerate ${roleTitle}`}
          >
            ↻
          </button>
        </div>
      </div>

      <div className="stitch-report-card-body">
        {/* Loading State */}
        {isGenerating && (
          <div className="report-loading-state">
            <div className="spinner"></div>
            <p className="loading-state-title">Analyzing verified transcript and drafting report...</p>
            <span className="hint-text">Generating independent draft for {roleTitle}</span>
          </div>
        )}

        {/* Failed State */}
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
              <Icon name="refresh" /> Retry {roleTitle}
            </button>
          </div>
        )}

        {/* Ready Generated Report State (Natural growth without fixed height) */}
        {!isGenerating && report && report.status === 'ready' && (
          <div className="report-ready-content">
            <div className="report-ready-header-row">
              <strong className="report-draft-heading">
                {report.report_title || 'Message Report Draft'}
              </strong>
              <button
                type="button"
                className="btn btn--secondary btn--small btn-copy-draft"
                onClick={handleCopy}
                title="Copy formatted draft"
              >
                {copied ? '✓ Copied!' : ' Copy Draft'}
              </button>
            </div>

            {/* Special Structured Presentation for Reporter B Details if available */}
            {role === 'reporter_b' && report.key_points && report.key_points.length > 0 && (
              <div className="reporter-key-details-box">
                <div className="key-details-title-row">
                  <span><Icon name="copy" /></span>
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
              <div className="scriptures-pill-box">
                <span className="pill-label">Scriptures:</span>
                {report.scriptures.map((sc, i) => (
                  <span key={i} className="scripture-pill">
                     {sc}
                  </span>
                ))}
              </div>
            )}

            {/* Natural content growth container (no fixed/max height) */}
            <div className="report-text-natural-container">
              <pre className="report-markdown-preview">
                {report.report_text}
              </pre>
            </div>

            <div className="report-footer-meta">
              <span>Standard: <strong>{report.standard_version_label}</strong></span>
              <span>Created: {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        )}

        {/* Compact & Clean Empty State */}
        {!isGenerating && !report && (
          <div className="report-empty-state-compact">
            <div className="empty-state-icon"><Icon name="document" /></div>
            <p className="empty-state-heading">No draft generated yet for {roleTitle}</p>
            <p className="empty-state-hint">
              Click <strong>"Generate Reports"</strong> to produce this independent draft from the verified transcript.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
