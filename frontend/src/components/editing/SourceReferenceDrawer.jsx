import React, { useState } from 'react'

export function SourceReferenceDrawer({ sources }) {
  const [activeTab, setActiveTab] = useState('verified') // 'verified' | 'reporter_a' | 'reporter_b'
  const [copied, setCopied] = useState(false)

  const verifiedText = sources?.verified_text || 'No verified transcript found.'
  const reporterA = sources?.reporter_a
  const reporterB = sources?.reporter_b

  const handleCopy = (text, title) => {
    if (!text) return
    navigator.clipboard.writeText(title ? `# ${title}\n\n${text}` : text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card source-reference-card">
      <div className="card-header">
        <div>
          <h3>📚 Source Reference Materials</h3>
          <p className="card-subtitle">
            Consult the Verified Transcript and independent reporting drafts while editing
          </p>
        </div>
        <div>
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={() => {
              if (activeTab === 'verified') handleCopy(verifiedText)
              else if (activeTab === 'reporter_a') handleCopy(reporterA?.report_text, reporterA?.report_title)
              else if (activeTab === 'reporter_b') handleCopy(reporterB?.report_text, reporterB?.report_title)
            }}
          >
            {copied ? '✓ Copied!' : '📋 Copy Selected'}
          </button>
        </div>
      </div>

      <div className="source-tabs-bar">
        <button
          type="button"
          className={`source-tab ${activeTab === 'verified' ? 'source-tab--active' : ''}`}
          onClick={() => setActiveTab('verified')}
        >
          📜 Verified Transcript (Authority)
        </button>
        <button
          type="button"
          className={`source-tab ${activeTab === 'reporter_a' ? 'source-tab--active' : ''}`}
          onClick={() => setActiveTab('reporter_a')}
        >
          👤 Reporter A (Structure)
        </button>
        <button
          type="button"
          className={`source-tab ${activeTab === 'reporter_b' ? 'source-tab--active' : ''}`}
          onClick={() => setActiveTab('reporter_b')}
        >
          🔍 Reporter B (Details)
        </button>
      </div>

      <div className="source-content-box">
        {activeTab === 'verified' && (
          <div className="source-panel">
            <div className="source-panel-meta">
              <span className="badge badge--success">✓ Authoritative Factual Source</span>
            </div>
            <pre className="source-pre">{verifiedText}</pre>
          </div>
        )}

        {activeTab === 'reporter_a' && (
          <div className="source-panel">
            <div className="source-panel-meta">
              <strong>{reporterA?.report_title || 'Reporter A Draft'}</strong>
              <span className="badge badge--primary">Standard {reporterA?.standard_version_label || 'v1'}</span>
            </div>
            <pre className="source-pre">{reporterA?.report_text || 'No Reporter A draft generated yet.'}</pre>
          </div>
        )}

        {activeTab === 'reporter_b' && (
          <div className="source-panel">
            <div className="source-panel-meta">
              <strong>{reporterB?.report_title || 'Reporter B Draft'}</strong>
              <span className="badge badge--primary">Standard {reporterB?.standard_version_label || 'v1'}</span>
            </div>
            <pre className="source-pre">{reporterB?.report_text || 'No Reporter B draft generated yet.'}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
