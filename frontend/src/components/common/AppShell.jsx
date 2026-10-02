import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../context/AuthContext'

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

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
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
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

function ReportsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="17" x2="8" y2="13" />
      <line x1="12" y1="17" x2="12" y2="9" />
      <line x1="16" y1="17" x2="16" y2="11" />
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
  activeView, // 'dashboard' | 'sessions' | 'reports' | 'settings' | 'new_live' | 'transcribe' | 'live_recording'
  isLiveRecordingActive = false,
  isRemoteRecordingActive = false,
  onNavigate,
  screenTitle = 'Dashboard',
  onBack = null,
  onStartLiveSession,
  children,
}) {
  const { isDark, toggleTheme } = useTheme()
  const { user, account, signOut, demoMode, exitDemoMode } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const mobileToggleRef = useRef(null)
  const sidebarRef = useRef(null)
  const notificationsRef = useRef(null)
  const userMenuRef = useRef(null)

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('dlbc_sidebar_collapsed')
      if (stored !== null) return stored === 'true'
      return typeof window !== 'undefined' && window.location.hash.includes('sidebar_collapsed')
    } catch {
      return false
    }
  })

  const openMobileNav = () => setMobileNavOpen(true)
  const closeMobileNav = () => setMobileNavOpen(false)

  const handleToggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem('dlbc_sidebar_collapsed', String(next))
      } catch (e) {
        // ignore
      }
      return next
    })
  }

  const isEffectivelyExpanded = !isCollapsed

  // Mobile drawer focus trap & keyboard management
  useEffect(() => {
    if (!mobileNavOpen) return

    const previousActiveElement = document.activeElement

    // Move focus to first interactive element in drawer
    const timer = setTimeout(() => {
      if (sidebarRef.current) {
        const focusable = sidebarRef.current.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (focusable) focusable.focus()
      }
    }, 50)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMobileNav()
        return
      }

      if (event.key === 'Tab' && sidebarRef.current) {
        const focusables = Array.from(
          sidebarRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => el.offsetParent !== null)

        if (focusables.length === 0) return

        const firstElement = focusables[0]
        const lastElement = focusables[focusables.length - 1]

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
      if (mobileToggleRef.current) {
        mobileToggleRef.current.focus()
      } else if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus()
      }
    }
  }, [mobileNavOpen])

  // Notifications popover outside click and escape listener
  useEffect(() => {
    if (!isNotificationsOpen) return

    const handleClickOutside = (e) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setIsNotificationsOpen(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isNotificationsOpen])

  useEffect(() => {
    if (!isUserMenuOpen) return

    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isUserMenuOpen])

  if (activeView === 'settings') {
    return (
      <div className="app-shell-settings-bleed">
        {children}
      </div>
    )
  }

  return (
    <div className="app-shell-container">
      {/* ------------------------------------------------------------- */}
      {/* LEFT SIDEBAR                                                  */}
      {/* ------------------------------------------------------------- */}
      <aside
        ref={sidebarRef}
        className={`app-sidebar ${isCollapsed ? 'app-sidebar--collapsed' : ''} ${mobileNavOpen ? 'app-sidebar--mobile-open' : ''}`}
        aria-label="Sidebar Navigation"
        {...(mobileNavOpen ? { role: 'dialog', 'aria-modal': 'true' } : {})}
      >
        <div className="sidebar-top">
          {/* Brand Logo & Collapse Toggle */}
          <div className="sidebar-brand-row">
            <button
              type="button"
              className="sidebar-brand"
              onClick={() => {
                onNavigate('dashboard')
                closeMobileNav()
              }}
              title={!isEffectivelyExpanded ? 'DLBC Information Unit' : undefined}
              aria-label="DLBC Information Unit - Go to Dashboard"
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
            </button>

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

          {/* Remote Recording Alert (Displayed when another device is recording) */}
          {isRemoteRecordingActive && !isLiveRecordingActive && (
            <div className="sidebar-recording-alert" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
              <button
                type="button"
                className="sidebar-recording-alert-btn"
                onClick={() => {
                  onNavigate('remote_control')
                  closeMobileNav()
                }}
                id="sidebar-btn-remote-recording"
                title="Remote recording active on account"
              >
                <span className="live-pulse-dot" style={{ background: '#10b981', boxShadow: '0 0 8px #10b981' }}>●</span>
                {isEffectivelyExpanded && <span className="live-btn-text" style={{ color: '#10b981' }}>REMOTE ACTIVE</span>}
              </button>
            </div>
          )}

          {/* Main Navigation Links: Dashboard, Sessions, Remote Control */}
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

            <button
              type="button"
              className={`sidebar-nav-item ${activeView === 'remote_control' ? 'sidebar-nav-item--active' : ''}`}
              onClick={() => {
                onNavigate('remote_control')
                closeMobileNav()
              }}
              id="nav-link-remote-control"
              title={!isEffectivelyExpanded ? 'Remote Control' : undefined}
            >
              <span className="nav-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </span>
              {isEffectivelyExpanded && <span className="nav-label">Remote Control</span>}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer: Settings and collapse button at the bottom */}
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

          {/* Theme Toggle Button */}
          <button
            type="button"
            className="sidebar-nav-item sidebar-theme-toggle-btn"
            onClick={toggleTheme}
            id="btn-sidebar-theme-toggle"
            title={!isEffectivelyExpanded ? (isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode') : undefined}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <span className="nav-icon">{isDark ? <SunIcon /> : <MoonIcon />}</span>
            {isEffectivelyExpanded && (
              <span className="nav-label">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            )}
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
              ref={mobileToggleRef}
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
            <div className="topbar-notification-anchor" ref={notificationsRef}>
              <button
                type="button"
                className="topbar-notification"
                title="Notifications"
                id="topbar-notification-bell"
                aria-label="Notifications (none)"
                aria-expanded={isNotificationsOpen}
                onClick={() => setIsNotificationsOpen(prev => !prev)}
              >
                <span className="notification-bell"><BellIcon /></span>
              </button>

              {isNotificationsOpen && (
                <div className="notifications-popover" role="dialog" aria-label="Notifications">
                  <div className="notifications-popover-header">
                    <span className="notifications-popover-title">Notifications</span>
                  </div>
                  <div className="notifications-popover-body">
                    <p className="notifications-empty-title">No notifications</p>
                    <p className="notifications-empty-text">You are all caught up.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="topbar-user-anchor" ref={userMenuRef}>
              <button
                type="button"
                className="topbar-avatar"
                title="Account menu"
                aria-label="Account menu"
                aria-expanded={isUserMenuOpen}
                onClick={() => setIsUserMenuOpen(prev => !prev)}
                id="topbar-user-avatar-btn"
              >
                <span>{demoMode ? 'D' : (user?.email ? user.email.charAt(0).toUpperCase() : 'U')}</span>
              </button>

              {isUserMenuOpen && (
                <div className="user-menu-popover" role="menu" aria-label="Account Menu">
                  <div className="user-menu-header">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span className="user-menu-email">{user?.email || (demoMode ? 'demo@local.dlbc' : 'user@church.org')}</span>
                      {demoMode && (
                        <span className="user-menu-demo-tag">Local Demo</span>
                      )}
                    </div>
                    <span className="user-menu-unit">{account?.account_name || 'DLBC Information Unit'}</span>
                    <span className="user-menu-role">
                      {demoMode ? 'Local Demo Mode' : (account?.role ? `${account.role.charAt(0).toUpperCase() + account.role.slice(1)}` : 'Owner')}
                    </span>
                  </div>
                  <div className="user-menu-divider" />
                  <button
                    type="button"
                    className="user-menu-item"
                    onClick={() => {
                      setIsUserMenuOpen(false)
                      if (onNavigate) onNavigate('profile')
                    }}
                    id="btn-user-profile"
                    role="menuitem"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.85, flexShrink: 0 }}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>Profile</span>
                  </button>
                  <div className="user-menu-divider" />
                  {demoMode ? (
                    <button
                      type="button"
                      className="user-menu-item"
                      onClick={() => {
                        setIsUserMenuOpen(false)
                        exitDemoMode()
                      }}
                      id="btn-user-exit-demo"
                      role="menuitem"
                    >
                      Exit Demo
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="user-menu-item user-menu-item--danger"
                      onClick={() => {
                        setIsUserMenuOpen(false)
                        signOut()
                      }}
                      id="btn-user-signout"
                      role="menuitem"
                    >
                      Sign out
                    </button>
                  )}
                </div>
              )}
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
