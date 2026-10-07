import React from 'react'

export function FinalReportSkeleton({ onBack, error = null, onRetry = null }) {
  return (
    <div className="session-subview-container" aria-busy="true" aria-label="Loading final report">
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onBack}
              style={{ padding: '4px 8px', fontSize: '13px' }}
            >
              ← Back
            </button>
          )}
          <div>
            <div className="session-skeleton-block" style={{ width: '260px', height: '24px', marginBottom: '6px' }} />
            <div className="session-skeleton-block" style={{ width: '160px', height: '14px' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="session-skeleton-block" style={{ width: '120px', height: '36px', borderRadius: '6px' }} />
          <div className="session-skeleton-block" style={{ width: '130px', height: '36px', borderRadius: '6px' }} />
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: '16px', background: 'var(--danger-light, #fef2f2)', border: '1px solid var(--danger-border, #fecaca)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--danger, #dc2626)', fontSize: '14px', fontWeight: 500 }}>
            {error}
          </div>
          {onRetry && (
            <button type="button" className="btn btn--small btn--primary" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}

      {/* Document Sheet */}
      <div className="card" style={{ maxWidth: '850px', margin: '0 auto', padding: '48px', minHeight: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="session-skeleton-block" style={{ width: '60%', height: '32px', marginBottom: '16px' }} />
        <div className="session-skeleton-block" style={{ width: '30%', height: '16px', marginBottom: '24px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="session-skeleton-block" style={{ width: '100%', height: '16px' }} />
          <div className="session-skeleton-block" style={{ width: '96%', height: '16px' }} />
          <div className="session-skeleton-block" style={{ width: '92%', height: '16px' }} />
          <div className="session-skeleton-block" style={{ width: '85%', height: '16px' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          <div className="session-skeleton-block" style={{ width: '40%', height: '22px', marginBottom: '8px' }} />
          <div className="session-skeleton-block" style={{ width: '98%', height: '16px' }} />
          <div className="session-skeleton-block" style={{ width: '94%', height: '16px' }} />
          <div className="session-skeleton-block" style={{ width: '90%', height: '16px' }} />
        </div>
      </div>
    </div>
  )
}
