import React from 'react'

export function VerifiedTranscriptSkeleton({ onBack, error = null, onRetry = null }) {
  return (
    <div className="session-subview-container" aria-busy="true" aria-label="Loading verified transcript">
      <div className="card verified-transcript-card">
        {/* Top Header */}
        <div className="verified-transcript-top-header">
          <div className="verified-header-title-group">
            {onBack && (
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={onBack}
                aria-label="Back"
              >
                ←
              </button>
            )}
            <div>
              <div className="session-skeleton-block" style={{ width: '320px', height: '24px', marginBottom: '8px' }} />
              <div className="session-skeleton-block" style={{ width: '220px', height: '14px' }} />
            </div>
          </div>
          <div className="verified-top-actions">
            <div className="session-skeleton-block" style={{ width: '110px', height: '36px', borderRadius: '6px' }} />
            <div className="session-skeleton-block" style={{ width: '130px', height: '36px', borderRadius: '6px' }} />
          </div>
        </div>

        {error && (
          <div style={{ padding: '14px 18px', margin: '16px 0', background: 'var(--danger-light, #fef2f2)', border: '1px solid var(--danger-border, #fecaca)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--danger, #dc2626)', fontSize: '14px', fontWeight: 500 }}>{error}</span>
            {onRetry && (
              <button type="button" className="btn btn--small btn--primary" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}

        {/* Complete Banner */}
        <div className="verified-complete-banner" style={{ opacity: 0.7 }}>
          <span className="banner-check-icon">✓</span>
          <div style={{ flex: 1 }}>
            <div className="session-skeleton-block" style={{ width: '140px', height: '16px', marginBottom: '6px' }} />
            <div className="session-skeleton-block" style={{ width: '85%', height: '12px' }} />
          </div>
        </div>

        {/* Master Player Bar */}
        <div className="verified-master-player-bar">
          <div className="verified-player-label">
            <span className="player-indicator-dot" />
            <span>Master Audio</span>
          </div>
          <div className="session-skeleton-block" style={{ flex: 1, height: '36px', borderRadius: '8px' }} />
        </div>

        {/* Body Box */}
        <div className="verified-body-box">
          <div className="verified-body-toolbar">
            <div className="verified-toolbar-left" style={{ display: 'flex', gap: '12px' }}>
              <div className="session-skeleton-block" style={{ width: '130px', height: '24px', borderRadius: '4px' }} />
              <div className="session-skeleton-block" style={{ width: '150px', height: '24px', borderRadius: '4px' }} />
            </div>
            <div className="session-skeleton-block" style={{ width: '140px', height: '30px', borderRadius: '6px' }} />
          </div>

          <div className="verified-text-canvas" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="session-skeleton-block" style={{ width: '95%', height: '16px' }} />
            <div className="session-skeleton-block" style={{ width: '90%', height: '16px' }} />
            <div className="session-skeleton-block" style={{ width: '85%', height: '16px' }} />
            <div className="session-skeleton-block" style={{ width: '92%', height: '16px', marginTop: '12px' }} />
            <div className="session-skeleton-block" style={{ width: '88%', height: '16px' }} />
            <div className="session-skeleton-block" style={{ width: '70%', height: '16px' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
