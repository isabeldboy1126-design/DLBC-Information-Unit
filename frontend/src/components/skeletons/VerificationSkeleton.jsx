import React from 'react'

export function VerificationSkeleton({ onBack, error = null, onRetry = null }) {
  return (
    <div className="verification-workflow-layout" aria-busy="true" aria-label="Loading verification workflow">
      {/* LEFT COLUMN */}
      <div className="verification-left-col">
        <div className="verification-left-header">
          {onBack && (
            <div style={{ marginBottom: '8px' }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onBack}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                ← Back
              </button>
            </div>
          )}
          <div className="session-skeleton-block" style={{ width: '60%', height: '22px', marginBottom: '8px' }} />
          <div className="session-skeleton-block" style={{ width: '40%', height: '14px', marginBottom: '12px' }} />

          {error && (
            <div style={{ padding: '10px 14px', margin: '8px 0', background: 'var(--danger-light, #fef2f2)', border: '1px solid var(--danger-border, #fecaca)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--danger, #dc2626)', fontSize: '13px' }}>{error}</span>
              {onRetry && (
                <button type="button" className="btn btn--small btn--primary" onClick={onRetry}>
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
            <div className="session-skeleton-block" style={{ width: '64px', height: '28px', borderRadius: '14px' }} />
            <div className="session-skeleton-block" style={{ width: '72px', height: '28px', borderRadius: '14px' }} />
            <div className="session-skeleton-block" style={{ width: '60px', height: '28px', borderRadius: '14px' }} />
          </div>
        </div>

        {/* Flagged Items Scroll List */}
        <div className="flagged-items-scroll-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flagged-item-card" style={{ cursor: 'default' }}>
              <div className="flagged-item-columns" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="session-skeleton-block" style={{ width: '50px', height: '20px', borderRadius: '10px', flexShrink: 0 }} />
                <div className="session-skeleton-block" style={{ flex: 1, height: '14px' }} />
                <div className="session-skeleton-block" style={{ width: '12px', height: '12px', borderRadius: '2px', flexShrink: 0 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="verification-right-col">
        {/* Master Audio Player Card */}
        <div className="card master-audio-card" style={{ marginBottom: '16px' }}>
          <div className="master-audio-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="session-skeleton-block" style={{ width: '100px', height: '18px' }} />
            <div className="session-skeleton-block" style={{ width: '50px', height: '24px', borderRadius: '4px' }} />
          </div>
          <div className="session-skeleton-block" style={{ width: '100%', height: '8px', borderRadius: '4px', marginBottom: '12px' }} />
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
            <div className="session-skeleton-block" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
          </div>
        </div>

        {/* Active Segment Review Card */}
        <div className="card active-segment-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div className="session-skeleton-block" style={{ width: '140px', height: '20px' }} />
            <div className="session-skeleton-block" style={{ width: '60px', height: '20px', borderRadius: '10px' }} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div className="session-skeleton-block" style={{ width: '100px', height: '14px', marginBottom: '8px' }} />
            <div className="session-skeleton-block" style={{ width: '100%', height: '60px', borderRadius: '6px' }} />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div className="session-skeleton-block" style={{ width: '110px', height: '14px', marginBottom: '8px' }} />
            <div className="session-skeleton-block" style={{ width: '100%', height: '80px', borderRadius: '6px' }} />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <div className="session-skeleton-block" style={{ width: '90px', height: '36px', borderRadius: '6px' }} />
            <div className="session-skeleton-block" style={{ width: '110px', height: '36px', borderRadius: '6px' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
