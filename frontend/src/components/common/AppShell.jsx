import React, { useState } from 'react'

/**
 * AppShell — Persistent application shell matching the Stitch design system.
 * 
 * Features:
 * - Deep Navy Left Sidebar (#0F2947) with DLBC logo, primary "Start Live Session" CTA,
 *   navigation items (Dashboard, Sessions, Settings).
 * - On Mobile: Responsive slide-out drawer with hamburger toggle.
 * - Simplified Contextual Top Bar:
 *   - Sub-screens: "← Back   [Current Screen Name]"
 *   - Dashboard: "Dashboard" (no back button)
 *   - Right: Notification icon alone.
 */
export function AppShell({
  activeView, // 'dashboard' | 'sessions' | 'settings' | 'new_live' | 'transcribe'
  onNavigate,
  screenTitle = 'Dashboard',
  onBack = null,
  onStartLiveSession,
  children,
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const handleNavClick = (view) => {
    setIsMobileNavOpen(false)
    onNavigate(view)
  }

  const handleStartLiveClick = () => {
    setIsMobileNavOpen(false)
    onStartLiveSession()
  }

  return (
    <div className="app-shell-container">
      {/* Mobile Drawer Backdrop */}
      {isMobileNavOpen && (
        <div
          className="mobile-sidebar-backdrop"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* LEFT SIDEBAR                                                  */}
      {/* ------------------------------------------------------------- */}
      <aside className={`app-sidebar ${isMobileNavOpen ? 'app-sidebar--open' : ''}`}>
        {/* Brand Logo */}
        <div className="sidebar-brand-row">
          <div className="sidebar-brand" onClick={() => handleNavClick('dashboard')} role="button" tabIndex={0}>
            <img
              src="/dlbc-logo.png"
              alt="DLBC logo"
              className="sidebar-brand-logo"
            />
            <div className="sidebar-brand-text">
              <span className="brand-name">DLBC</span>
              <span className="brand-sub">INFORMATION UNIT</span>
            </div>
          </div>

          {/* Close button inside mobile drawer */}
          <button
            type="button"
            className="mobile-sidebar-close-btn"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        {/* Primary CTA: Start Live Session */}
        <div className="sidebar-cta-container">
          <button
            type="button"
            className="sidebar-live-btn"
            onClick={handleStartLiveClick}
            id="sidebar-btn-start-live"
          >
            <span className="live-pulse-dot">●</span>
            <span className="live-btn-text">START LIVE SESSION</span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'dashboard' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => handleNavClick('dashboard')}
            id="nav-link-dashboard"
          >
            <span className="nav-icon">⊞</span>
            <span className="nav-label">Dashboard</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'sessions' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => handleNavClick('sessions')}
            id="nav-link-sessions"
          >
            <span className="nav-icon">📋</span>
            <span className="nav-label">Sessions</span>
          </button>
        </nav>

        {/* Sidebar Footer: Settings */}
        <div className="sidebar-footer">
          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'settings' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => handleNavClick('settings')}
            id="nav-link-settings"
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* MAIN CONTENT AREA & TOP BAR                                   */}
      {/* ------------------------------------------------------------- */}
      <div className="app-main-column">
        {/* Top Header Bar */}
        <header className="app-topbar">
          {/* Dynamic Contextual Title & Back Button */}
          <div className="topbar-left">
            {/* Hamburger Button (Mobile / Tablet only) */}
            <button
              type="button"
              className="mobile-menu-toggle"
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
              aria-label="Toggle navigation menu"
              id="btn-toggle-mobile-menu"
            >
              ☰
            </button>

            {onBack ? (
              <div className="topbar-nav-header">
                <button
                  type="button"
                  className="topbar-back-btn"
                  onClick={onBack}
                  id="topbar-btn-back"
                >
                  <span className="back-arrow">←</span>
                  <span className="back-text">Back</span>
                </button>
                <span className="topbar-screen-title">{screenTitle}</span>
              </div>
            ) : (
              <h1 className="topbar-screen-title topbar-screen-title--root">{screenTitle}</h1>
            )}
          </div>

          {/* Right: Notification Bell Alone */}
          <div className="topbar-right">
            <div className="topbar-notification" title="Notifications" id="topbar-notification-bell">
              <span className="notification-bell">🔔</span>
              <span className="notification-dot" />
            </div>
          </div>
        </header>

        {/* Page Content Body — the ONLY scrolling region */}
        <main className="app-content-body">
          {children}
        </main>
      </div>
    </div>
  )
}
