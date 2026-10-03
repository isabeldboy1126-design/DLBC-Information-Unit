import React from 'react'

export function MediaView({ onBack, onOpenSession, sessions = [] }) {
  // Captured sessions with audio recordings
  const audioSessions = (sessions || [])
    .filter((s) => s.audio_file || s.audio_path || s.storage_path || s.duration_seconds > 0)
    .slice(0, 6)

  return (
    <div className="media-shell-container">
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
        <h1 className="mobile-header-title">Media</h1>
        <div style={{ width: 36 }} />
      </div>

      <div className="media-shell-content">
        {/* Hero Section */}
        <div className="media-hero-card">
          <div className="media-hero-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="2" y1="7" x2="7" y2="7" />
              <line x1="2" y1="17" x2="7" y2="17" />
              <line x1="17" y1="17" x2="22" y2="17" />
              <line x1="17" y1="7" x2="22" y2="7" />
            </svg>
          </div>
          <div className="media-hero-text">
            <h2 className="media-hero-title">Media &amp; Audio Assets</h2>
            <p className="media-hero-desc">
              Archived sermon audio, broadcast ingest tracks, and cross-device media feeds. Transferred audio files will appear here.
            </p>
          </div>
        </div>

        {/* Captured Audio Assets */}
        <div className="media-section">
          <div className="media-section-header">
            <h3 className="media-section-title">Archived Audio Feeds</h3>
            <span className="media-count-pill">{audioSessions.length}</span>
          </div>

          {audioSessions.length > 0 ? (
            <div className="media-assets-list">
              {audioSessions.map((s) => {
                const title = s.session_title || s.programme || s.event_type || 'Audio Recording'
                const dayNum = s.day_number || (s.metadata && s.metadata.day_number)
                const dateStr = s.date_created ? new Date(s.date_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'
                const durationMins = s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m ${s.duration_seconds % 60}s` : 'Captured Audio'

                return (
                  <div
                    key={s.session_id}
                    className="media-asset-row"
                    onClick={() => onOpenSession && onOpenSession(s.session_id, 'overview')}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="media-asset-left">
                      <div className="media-audio-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        </svg>
                      </div>
                      <div className="media-asset-info">
                        <div className="media-asset-title-row">
                          <span className="media-asset-title">{title}</span>
                          {dayNum && <span className="session-day-badge">{dayNum}</span>}
                        </div>
                        <div className="media-asset-meta">
                          <span>{dateStr}</span>
                          <span>·</span>
                          <span>{durationMins}</span>
                          <span>·</span>
                          <span className="media-format-pill">WAV / Lossless</span>
                        </div>
                      </div>
                    </div>
                    <div className="media-asset-action">
                      <span className="media-listen-btn">Listen →</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="media-empty-card">
              <div className="media-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <h4 className="media-empty-title">No Transferred Media Assets</h4>
              <p className="media-empty-desc">
                Pristine lossless audio recorded during live church services or uploaded sermon tracks will be accessible here.
              </p>
            </div>
          )}
        </div>

        {/* Feature Preview Card */}
        <div className="media-preview-card">
          <div className="media-preview-badge">STAGE 2 FEATURE</div>
          <h4 className="media-preview-title">Media Receiver &amp; Multi-Device Ingest</h4>
          <p className="media-preview-desc">
            Direct peer-to-peer audio transfer from media sound-desks, automated church camera audio extraction, and offline session synchronization will be enabled in the media update.
          </p>
        </div>
      </div>
    </div>
  )
}
