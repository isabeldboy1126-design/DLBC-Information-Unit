import React, { useState, useEffect, useRef } from 'react'

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function SessionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function SidebarToggleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  )
}

/**
 * AppShell — Persistent application shell matching the Lead Monitor reference design.
 */
export function AppShell({
  activeView, // 'dashboard' | 'sessions' | 'settings' | 'new_live' | 'transcribe' | 'live_recording'
  isLiveRecordingActive = false,
  onNavigate,
  screenTitle = 'Dashboard',
  onBack = null,
  onStartLiveSession,
  children,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.location.hash.includes('sidebar_collapsed')
    } catch {
      return false
    }
  })
  const [isHoverExpanded, setIsHoverExpanded] = useState(false)
  const hoverEnterTimerRef = useRef(null)
  const hoverLeaveTimerRef = useRef(null)

  const openMobileNav = () => setMobileNavOpen(true)
  const closeMobileNav = () => setMobileNavOpen(false)

  // Handle pointer hover on collapsed rail to temporarily expand
  const handleSidebarMouseEnter = () => {
    if (!isCollapsed) return
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      return
    }
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current)
      hoverLeaveTimerRef.current = null
    }
    hoverEnterTimerRef.current = setTimeout(() => {
      setIsHoverExpanded(true)
    }, 110)
  }

  const handleSidebarMouseLeave = () => {
    if (!isCollapsed) return
    if (hoverEnterTimerRef.current) {
      clearTimeout(hoverEnterTimerRef.current)
      hoverEnterTimerRef.current = null
    }
    hoverLeaveTimerRef.current = setTimeout(() => {
      setIsHoverExpanded(false)
    }, 180)
  }

  const handleToggleCollapse = () => {
    if (hoverEnterTimerRef.current) clearTimeout(hoverEnterTimerRef.current)
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current)
    setIsHoverExpanded(false)
    setIsCollapsed(!isCollapsed)
  }

  const isEffectivelyExpanded = !isCollapsed || isHoverExpanded

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
      <aside
        className={`app-sidebar ${isCollapsed ? 'app-sidebar--collapsed' : ''} ${isCollapsed && isHoverExpanded ? 'app-sidebar--hover-expanded' : ''} ${mobileNavOpen ? 'app-sidebar--mobile-open' : ''}`}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        <div className="sidebar-top">
          {/* Brand Logo & Collapse Toggle */}
          <div className="sidebar-brand-row">
            <div
              className="sidebar-brand"
              onClick={() => {
                onNavigate('dashboard')
                closeMobileNav()
              }}
              role="button"
              tabIndex={0}
              title={!isEffectivelyExpanded ? 'DLBC Information Unit' : undefined}
            >
              <img
                src="/dlbc-logo.png"
                alt="DLBC logo"
                className="sidebar-brand-logo"
              />
              {isEffectivelyExpanded && (
                <div className="sidebar-brand-text">
                  <span className="brand-name">DLBC</span>
                  <span className="brand-sub">INFORMATION UNIT</span>
                </div>
              )}
            </div>

            {/* Desktop Collapse / Expand Toggle */}
            <button
              type="button"
              className="sidebar-desktop-collapse-btn"
              onClick={handleToggleCollapse}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <SidebarToggleIcon />
            </button>

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

          {/* Active Recording Alert (Displayed only when recording is running in background) */}
          {isLiveRecordingActive && (
            <div className="sidebar-recording-alert">
              <button
                type="button"
                className="sidebar-recording-alert-btn"
                onClick={() => {
                  onStartLiveSession()
                  closeMobileNav()
                }}
                id="sidebar-btn-active-recording"
                title="Return to active recording monitor"
              >
                <span className="live-pulse-dot">●</span>
                {isEffectivelyExpanded && <span className="live-btn-text">ACTIVE RECORDING</span>}
              </button>
            </div>
          )}

          {/* Main Navigation Links: Dashboard and Sessions ONLY */}
          <nav className="sidebar-nav">
            <button
              type="button"
              className={`sidebar-nav-item ${activeView === 'dashboard' ? 'sidebar-nav-item--active' : ''}`}
              onClick={() => {
                onNavigate('dashboard')
                closeMobileNav()
              }}
              id="nav-link-dashboard"
              title={!isEffectivelyExpanded ? 'Dashboard' : undefined}
            >
              <span className="nav-icon"><HomeIcon /></span>
              {isEffectivelyExpanded && <span className="nav-label">Dashboard</span>}
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeView === 'sessions' ? 'sidebar-nav-item--active' : ''}`}
              onClick={() => {
                onNavigate('sessions')
                closeMobileNav()
              }}
              id="nav-link-sessions"
              title={!isEffectivelyExpanded ? 'Sessions' : undefined}
            >
              <span className="nav-icon"><SessionsIcon /></span>
              {isEffectivelyExpanded && <span className="nav-label">Sessions</span>}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer: Settings alone at the bottom (System Ready removed) */}
        <div className="sidebar-footer">
          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'settings' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => {
              onNavigate('settings')
              closeMobileNav()
            }}
            id="nav-link-settings"
            title={!isEffectivelyExpanded ? 'Settings' : undefined}
          >
            <span className="nav-icon"><SettingsIcon /></span>
            {isEffectivelyExpanded && <span className="nav-label">Settings</span>}
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
      <div className={`app-main-column ${isCollapsed ? 'app-main-column--collapsed' : ''}`}>
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
                  aria-label="Back"
                  title="Back"
                >
                  <span className="back-arrow" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </span>
                </button>
                {screenTitle ? (
                  <span className="topbar-screen-title">{screenTitle}</span>
                ) : null}
              </div>
            ) : (
              <h1 className="topbar-screen-title topbar-screen-title--root">{screenTitle}</h1>
            )}
          </div>

          {/* Right: Notification Bell & User Avatar */}
          <div className="topbar-right">
            <button
              type="button"
              className="topbar-notification"
              title="Notifications"
              id="topbar-notification-bell"
              aria-label="Notifications"
            >
              <span className="notification-bell"><BellIcon /></span>
              <span className="notification-dot" />
            </button>
            <div className="topbar-avatar" title="Account">
              <span>D</span>
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
