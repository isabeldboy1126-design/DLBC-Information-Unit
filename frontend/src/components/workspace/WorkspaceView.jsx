import React from 'react'

export function WorkspaceView({ onBack, onOpenSession, sessions = [] }) {
  // Recent reports/sessions available for editorial review
  const recentReports = (sessions || [])
    .filter((s) => s.final_report_status === 'complete' || s.report_processing_status === 'completed' || s.verification_status === 'completed')
    .slice(0, 5)

  return (
    <div className="workspace-shell-container">
      {/* Top Header */}
      <div className="mobile-subpage-header desktop-hidden">
        <button
          type="button"
          className="mobile-header-back-btn"
          onClick={onBack}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="mobile-header-title">Workspace</h1>
        <div style={{ width: 36 }} />
      </div>

      <div className="workspace-shell-content">
        {/* Hero Section */}
        <div className="workspace-hero-card">
          <div className="workspace-hero-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div className="workspace-hero-text">
            <h2 className="workspace-hero-title">Editorial Workspace</h2>
            <p className="workspace-hero-desc">
              Ministerial document editing, report revision comparison, and publication-ready drafting. Reports available for editing will appear here.
            </p>
          </div>
        </div>

        {/* Available Reports for Editing */}
        <div className="workspace-section">
          <div className="workspace-section-header">
            <h3 className="workspace-section-title">Reports Available for Editing</h3>
            <span className="workspace-count-pill">{recentReports.length}</span>
          </div>

          {recentReports.length > 0 ? (
            <div className="workspace-reports-list">
              {recentReports.map((s) => {
                const title = s.session_title || s.programme || s.event_type || 'Worship Service'
                const dayNum = s.day_number || (s.metadata && s.metadata.day_number)
                const dateStr = s.date_created ? new Date(s.date_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'

                return (
                  <div
                    key={s.session_id}
                    className="workspace-report-row"
                    onClick={() => onOpenSession && onOpenSession(s.session_id, 'final_report')}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="workspace-report-left">
                      <div className="workspace-doc-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </div>
                      <div className="workspace-report-info">
                        <div className="workspace-report-title-row">
                          <span className="workspace-report-title">{title}</span>
                          {dayNum && <span className="session-day-badge">{dayNum}</span>}
                        </div>
                        <span className="workspace-report-date">{dateStr}</span>
                      </div>
                    </div>
                    <div className="workspace-report-action">
                      <span className="workspace-open-btn">Open Report →</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="workspace-empty-card">
              <div className="workspace-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <h4 className="workspace-empty-title">No Reports Pending Editorial Review</h4>
              <p className="workspace-empty-desc">
                When live recordings or uploaded sermon files complete automatic transcription and verification, their publication drafts will appear here for editorial review.
              </p>
            </div>
          )}
        </div>

        {/* Feature Preview Card (Restrained, intentional placeholder) */}
        <div className="workspace-preview-card">
          <div className="workspace-preview-badge">STAGE 2 FEATURE</div>
          <h4 className="workspace-preview-title">Report Editor &amp; Ministerial Publication Desk</h4>
          <p className="workspace-preview-desc">
            Direct paragraph citations, scripture concordance reference verification, and institutional multi-column report formatting will be enabled in the upcoming editorial release.
          </p>
        </div>
      </div>
    </div>
  )
}
