import React from 'react'

export function RawTranscriptSkeleton({ onBack, error = null, onRetry = null }) {
  return (
    <div className="simplified-raw-transcript-view" aria-busy="true" aria-label="Loading raw transcript">
      {onBack && (
        <div style={{ marginBottom: '12px' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onBack}
            style={{ padding: '4px 8px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>←</span>
            <span>Back</span>
          </button>
        </div>
      )}

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

      {/* 1. Header */}
      <div className="raw-header-simple">
        <div>
          <div className="session-skeleton-block" style={{ width: '280px', height: '24px', marginBottom: '8px' }} />
          <div className="session-skeleton-block" style={{ width: '180px', height: '14px' }} />
        </div>
        <div className="session-skeleton-block" style={{ width: '120px', height: '36px', borderRadius: '6px' }} />
      </div>

      {/* 2. Recorded Audio Bar */}
      <section className="raw-audio-section" aria-label="Audio loading">
        <div className="session-skeleton-block" style={{ width: '140px', height: '16px', marginBottom: '10px' }} />
        <div className="audio-player-simple">
          <div className="session-skeleton-block" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
          <div className="session-skeleton-block" style={{ width: '50px', height: '14px' }} />
          <div className="session-skeleton-block" style={{ flex: 1, height: '8px', borderRadius: '4px', margin: '0 12px' }} />
          <div className="session-skeleton-block" style={{ width: '50px', height: '14px' }} />
          <div className="session-skeleton-block" style={{ width: '60px', height: '32px', borderRadius: '4px' }} />
        </div>
      </section>

      {/* 3. Transcript Segments */}
      <section className="raw-transcript-section" aria-label="Transcript loading">
        <div className="raw-transcript-subhead-row">
          <div className="session-skeleton-block" style={{ width: '100px', height: '18px' }} />
          <div className="session-skeleton-block" style={{ width: '180px', height: '32px', borderRadius: '20px' }} />
        </div>

        <div className="transcript-timestamped-list" style={{ marginTop: '16px' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="transcript-timestamped-row" style={{ cursor: 'default' }}>
              <div className="session-skeleton-block" style={{ width: '64px', height: '22px', borderRadius: '12px', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="session-skeleton-block" style={{ width: i % 2 === 0 ? '90%' : '100%', height: '14px' }} />
                <div className="session-skeleton-block" style={{ width: i % 3 === 0 ? '60%' : '80%', height: '14px' }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
