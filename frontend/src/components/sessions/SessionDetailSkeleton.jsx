import React from 'react'
import { getSessionHierarchy, getCleanSessionName } from './SessionDetailView'

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

/**
 * Page-shaped skeleton placeholder for Session Workspace.
 * Renders instantaneously on session click to eliminate perceived lag while full session data loads.
 */
export function SessionDetailSkeleton({ session = null, onBack }) {
  const { programme, preacher } = session ? getSessionHierarchy(session) : {}
  const sessionDisplay = session ? getCleanSessionName(session) : ''
  const progDisplay = programme || ''
  const preacherDisplay = preacher || ''
  const dateDisplay = session ? (session.date || session.created_at ? new Date(session.date || session.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '') : ''

  return (
    <div className="session-subview-container session-detail-skeleton-container" aria-busy="true" aria-label="Loading session details">
      {/* ------------------------------------------------------------- */}
      {/* MOBILE SKELETON LAYOUT                                         */}
      {/* ------------------------------------------------------------- */}
      <div className="mobile-session-workspace-layout mobile-only-block">
        <div className="mobile-session-hub">
          <div className="mobile-subpage-header">
            {onBack && (
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
            )}
            <h1 className="mobile-header-title">Session</h1>
            <div style={{ width: 36 }} />
          </div>

          <div className="mobile-session-hub-header">
            {sessionDisplay ? (
              <h2 className="mobile-session-hub-title">{sessionDisplay}</h2>
            ) : (
              <div className="session-skeleton-block" style={{ width: '70%', height: '24px', marginBottom: '8px' }} />
            )}
            {dateDisplay ? (
              <span className="mobile-session-hub-meta">{dateDisplay}</span>
            ) : (
              <div className="session-skeleton-block" style={{ width: '40%', height: '14px' }} />
            )}
          </div>

          <div className="mobile-session-actions-grid" style={{ marginTop: '16px' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card session-skeleton-block" style={{ height: '90px', borderRadius: '12px' }} />
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DESKTOP SKELETON LAYOUT                                        */}
      {/* ------------------------------------------------------------- */}
      <div className="desktop-session-workspace-layout desktop-only-block">
        {/* Back Link / Breadcrumb */}
        {onBack && (
          <div style={{ marginBottom: '12px' }}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onBack}
              style={{ padding: '4px 8px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>←</span>
              <span>Back to Sessions</span>
            </button>
          </div>
        )}

        {/* 1. Header Bar: Programme + Dominant Title + Meta Line */}
        <div className="session-workspace-header">
          <div className="session-workspace-header-content">
            {progDisplay ? (
              <div className="session-programme-eyebrow">{progDisplay}</div>
            ) : (
              <div className="session-skeleton-block" style={{ width: '160px', height: '14px', marginBottom: '4px' }} />
            )}

            <div className="session-title-row">
              {sessionDisplay ? (
                <h1 className="session-dominant-title">{sessionDisplay}</h1>
              ) : (
                <div className="session-skeleton-block" style={{ width: '380px', height: '32px', margin: '4px 0' }} />
              )}
            </div>

            <div className="session-workspace-meta-line" style={{ marginTop: '4px' }}>
              {dateDisplay ? (
                <span className="session-meta-item">
                  <CalendarIcon />
                  <span>{dateDisplay}</span>
                </span>
              ) : (
                <div className="session-skeleton-block" style={{ width: '120px', height: '14px' }} />
              )}
              {preacherDisplay ? (
                <span className="session-meta-item">
                  <UserIcon />
                  <span>{preacherDisplay}</span>
                </span>
              ) : (
                <div className="session-skeleton-block" style={{ width: '140px', height: '14px' }} />
              )}
            </div>
          </div>
        </div>

        {/* 2. Action Strip Skeleton */}
        <div className="card session-skeleton-block session-skeleton-strip" style={{ width: '100%' }} />

        {/* 3. Session Materials Heading & 4 Artifact Tiles */}
        <section className="session-materials-section" aria-label="Session Materials Loading">
          <div className="session-skeleton-block" style={{ width: '150px', height: '20px', marginBottom: '1rem' }} />

          <div className="workspace-artifacts-grid">
            {[
              { title: 'Audio Recording', desc: 'Loading duration...' },
              { title: 'Raw Transcript', desc: 'Loading segments...' },
              { title: 'Verified Transcript', desc: 'Loading status...' },
              { title: 'Final Report', desc: 'Loading report...' },
            ].map((tile, idx) => (
              <div key={idx} className="card artifact-tile session-skeleton-card">
                <div className="artifact-tile-header">
                  <div className="session-skeleton-block" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
                  <div className="session-skeleton-block" style={{ width: '60px', height: '20px', borderRadius: '12px' }} />
                </div>
                <div className="artifact-tile-body" style={{ margin: '16px 0' }}>
                  <h3 className="artifact-tile-title">{tile.title}</h3>
                  <div className="session-skeleton-block" style={{ width: '75%', height: '14px', marginTop: '6px' }} />
                </div>
                <div className="session-skeleton-block" style={{ width: '100%', height: '36px', borderRadius: '6px' }} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
