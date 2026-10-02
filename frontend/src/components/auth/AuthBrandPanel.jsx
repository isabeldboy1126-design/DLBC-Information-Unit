import React from 'react'

export function AuthBrandPanel({
  tagline = 'Archival & Editorial Intelligence Platform',
}) {
  return (
    <div className="auth-brand-panel">
      {/* Subtle ecclesiastical architectural motif background */}
      <div className="auth-brand-backdrop">
        <svg className="auth-brand-pattern" viewBox="0 0 600 800" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <radialGradient id="authAura" cx="50%" cy="35%" r="60%">
              <stop offset="0%" stopColor="var(--color-primary-glow, rgba(59, 130, 246, 0.22))" />
              <stop offset="60%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id="authLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.03)" />
              <stop offset="50%" stopColor="rgba(255, 255, 255, 0.12)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.02)" />
            </linearGradient>
          </defs>

          {/* Radiant Church Architecture Arcs & Tracery */}
          <circle cx="300" cy="280" r="260" fill="url(#authAura)" />
          <path d="M 120 700 C 120 400, 480 400, 480 700" stroke="url(#authLineGrad)" strokeWidth="1.5" />
          <path d="M 160 700 C 160 440, 440 440, 440 700" stroke="url(#authLineGrad)" strokeWidth="1.2" />
          <path d="M 200 700 C 200 480, 400 480, 400 700" stroke="url(#authLineGrad)" strokeWidth="1" />
          <circle cx="300" cy="300" r="160" stroke="url(#authLineGrad)" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx="300" cy="300" r="110" stroke="url(#authLineGrad)" strokeWidth="1" />
          <line x1="300" y1="100" x2="300" y2="700" stroke="url(#authLineGrad)" strokeWidth="1.2" />
          <line x1="140" y1="300" x2="460" y2="300" stroke="url(#authLineGrad)" strokeWidth="1.2" />
        </svg>
      </div>

      <div className="auth-brand-content">
        {/* Institutional Emblem and Header */}
        <div className="auth-brand-emblem-group">
          <div className="auth-brand-emblem-ring">
            <img
              src="/dlbc-logo.png"
              alt="Deeper Christian Life Ministry Emblem"
              className="auth-brand-emblem-img"
            />
          </div>
          <div className="auth-brand-titles">
            <span className="auth-church-name">DEEPER LIFE BIBLE CHURCH</span>
            <h1 className="auth-unit-name">Information Unit</h1>
          </div>
        </div>

        <p className="auth-brand-tagline">{tagline}</p>

        {/* Core Institutional Value Pillars */}
        <div className="auth-brand-pillars">
          <div className="auth-pillar-item">
            <div className="auth-pillar-icon">🎙️</div>
            <div className="auth-pillar-text">
              <strong className="auth-pillar-title">Lossless Recording Integrity</strong>
              <p className="auth-pillar-desc">Hardware-governed live capture & multi-source audio ingest</p>
            </div>
          </div>

          <div className="auth-pillar-item">
            <div className="auth-pillar-icon">⚖️</div>
            <div className="auth-pillar-text">
              <strong className="auth-pillar-title">Automated Acoustic Verification</strong>
              <p className="auth-pillar-desc">Continuous doctrine cross-checks and ministerial verification</p>
            </div>
          </div>

          <div className="auth-pillar-item">
            <div className="auth-pillar-icon">📑</div>
            <div className="auth-pillar-text">
              <strong className="auth-pillar-title">Executive Editorial Intelligence</strong>
              <p className="auth-pillar-desc">Direct publication-ready reports for leadership and archival units</p>
            </div>
          </div>
        </div>

        {/* Footer Security / Version Note */}
        <div className="auth-brand-footer">
          <span className="auth-brand-version">DLBC Information Unit · Windows Desktop Release</span>
          <span className="auth-brand-confidentiality">Authorized Church Personnel Only</span>
        </div>
      </div>
    </div>
  )
}
