import React from 'react'

/**
 * AppShell — Persistent application shell matching the Stitch design system.
 * 
 * Features:
 * - Deep Navy Left Sidebar (#0F2947) with DLBC logo, primary "Start Live Session" CTA,
 *   navigation items (Dashboard, Sessions, Settings), and bottom Operator Profile.
 * - Top Bar with Context/Breadcrumbs, Global Search, Notification bell, and User badge.
 */
export function AppShell({
  activeNav, // 'dashboard' | 'sessions' | 'settings' | 'live_session' | 'workspace'
  onNavigate,
  breadcrumbs = [],
  onStartLiveSession,
  onOpenSearch,
  searchTerm = '',
  onSearchChange,
  children,
}) {
  return (
    <div className="app-shell-container">
      {/* ------------------------------------------------------------- */}
      {/* LEFT SIDEBAR                                                  */}
      {/* ------------------------------------------------------------- */}
      <aside className="app-sidebar">
        {/* Brand Logo */}
        <div className="sidebar-brand" onClick={() => onNavigate('dashboard')} role="button" tabIndex={0}>
          <div className="sidebar-brand-icon">
            <span className="church-icon">🏛️</span>
          </div>
          <div className="sidebar-brand-text">
            <span className="brand-name">DLBC</span>
            <span className="brand-sub">INFORMATION UNIT</span>
          </div>
        </div>

        {/* Primary CTA: Start Live Session */}
        <div className="sidebar-cta-container">
          <button
            type="button"
            className="sidebar-live-btn"
            onClick={onStartLiveSession}
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
            className={`sidebar-nav-item ${activeNav === 'dashboard' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onNavigate('dashboard')}
            id="nav-link-dashboard"
          >
            <span className="nav-icon">⊞</span>
            <span className="nav-label">Dashboard</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeNav === 'sessions' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onNavigate('sessions')}
            id="nav-link-sessions"
          >
            <span className="nav-icon">📋</span>
            <span className="nav-label">Sessions</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeNav === 'settings' ? 'sidebar-nav-item--active' : ''}`}
            onClick={() => onNavigate('settings')}
            id="nav-link-settings"
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
          </button>
        </nav>

        {/* Sidebar Footer: Operator Profile & System Live Status */}
        <div className="sidebar-footer">
          <div className="operator-profile-card">
            <div className="operator-avatar">👤</div>
            <div className="operator-info">
              <span className="operator-name">Operator Admin</span>
              <span className="operator-unit">DLBC System User</span>
            </div>
          </div>
          <div className="system-live-indicator">
            <span className="system-live-dot">●</span>
            <span className="system-live-text">SYSTEM LIVE</span>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* MAIN CONTENT AREA & TOP BAR                                   */}
      {/* ------------------------------------------------------------- */}
      <div className="app-main-column">
        {/* Top Header Bar */}
        <header className="app-topbar">
          {/* Breadcrumbs / Context */}
          <div className="topbar-left">
            {breadcrumbs.length > 0 ? (
              <nav className="topbar-breadcrumbs">
                <span className="breadcrumb-root" onClick={() => onNavigate('dashboard')}>
                  Information Unit
                </span>
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={idx}>
                    <span className="breadcrumb-separator">›</span>
                    {crumb.onClick ? (
                      <span className="breadcrumb-link" onClick={crumb.onClick}>
                        {crumb.label}
                      </span>
                    ) : (
                      <span className="breadcrumb-current">{crumb.label}</span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            ) : (
              <div className="topbar-context">
                <span className="context-label">Context:</span>
                <span className="context-value">Information Unit</span>
              </div>
            )}
          </div>

          {/* Search, Notifications & Profile Badge */}
          <div className="topbar-right">
            {onSearchChange && (
              <div className="topbar-search">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="topbar-search-input"
                  placeholder="Search sessions, logs, or speakers..."
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
            )}

            {/* Notification Bell */}
            <div className="topbar-notification" title="Notifications">
              <span className="notification-bell">🔔</span>
              <span className="notification-dot" />
            </div>

            {/* Operator Badge */}
            <div className="topbar-user-badge">
              <div className="user-badge-text">
                <span className="user-badge-name">Operator Admin</span>
                <span className="user-badge-id">ID: IU-8492</span>
              </div>
              <div className="user-badge-avatar">👤</div>
            </div>
          </div>
        </header>

        {/* Page Content View */}
        <main className="app-content-body">
          {children}
        </main>
      </div>
    </div>
  )
}
