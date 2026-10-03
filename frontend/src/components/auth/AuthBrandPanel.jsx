import React from 'react'
import startLiveBg from '../../assets/dashboard/start-live-background.png'

/**
 * AuthBrandPanel — Restrained Visual Identity for Desktop Authentication & Onboarding
 *
 * Requirements:
 * - 40–45% left side proportion.
 * - Minimal approved visual identity only: official DLBC logo and "Information Unit".
 * - NO unapproved product marketing copy, no bullet points, no feature claims.
 * - Subtle DLBC-blue treatment with approved architectural church imagery.
 */
export function AuthBrandPanel() {
  return (
    <aside className="auth-brand-panel" aria-label="DLBC Information Unit Brand">
      {/* Background Architectural Image with subtle DLBC blue overlay */}
      <div
        className="auth-brand-backdrop-image"
        style={{ backgroundImage: `url(${startLiveBg})` }}
        aria-hidden="true"
      />
      <div className="auth-brand-backdrop-overlay" aria-hidden="true" />

      {/* Brand Identity Content: Clean, Minimal, Official */}
      <div className="auth-brand-content">
        <div className="auth-brand-header">
          <div className="auth-brand-emblem-wrap">
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

        {/* Minimal Footer */}
        <div className="auth-brand-footer">
          <span className="auth-brand-footer-text">Official Ministerial Desktop Application</span>
        </div>
      </div>
    </aside>
  )
}
