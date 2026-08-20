import React, { useState, useEffect } from 'react'

/**
 * AppShell — Persistent application shell matching the Stitch design system.
 * 
 * Features:
 * - Deep Navy Left Sidebar (#0F2947) with DLBC logo, primary "Start Live Session" CTA,
 *   navigation items (Dashboard, Sessions, Settings).
 * - On Mobile: Responsive slide-out off-canvas drawer with hamburger toggle.
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const openMobileNav = () => setMobileNavOpen(true)
  const closeMobileNav = () => setMobileNavOpen(false)

  useEffect(() => {
    if (!mobileNavOpen) return

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeMobileNav()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileNavOpen])

  return (
    <div className="app-shell-container">
      {/* ------------------------------------------------------------- */}
      {/* LEFT SIDEBAR                                                  */}
      {/* ------------------------------------------------------------- */}
      <aside className={`app-sidebar ${mobileNavOpen ? 'app-sidebar--mobile-open' : ''}`}>
        {/* Brand Logo */}
        <div className="sidebar-brand-row">
          <div
            className="sidebar-brand"
            onClick={() => {
              onNavigate('dashboard')
              closeMobileNav()
            }}
            role="button"
            tabIndex={0}
          >
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
            onClick={closeMobileNav}
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
            onClick={() => {
              onStartLiveSession()
              closeMobileNav()
            }}
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
            onClick={() => {
              onNavigate('dashboard')
              closeMobileNav()
            }}
            id="nav-link-dashboard"
          >
            <span className="nav-icon">⊞</span>
            <span className="nav-label">Dashboard</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'sessions' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => {
              onNavigate('sessions')
              closeMobileNav()
            }}
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
            onClick={() => {
              onNavigate('settings')
              closeMobileNav()
            }}
            id="nav-link-settings"
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          onClick={closeMobileNav}
          aria-label="Close navigation"
        />
      )}

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
              className="mobile-nav-toggle"
              onClick={openMobileNav}
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
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
