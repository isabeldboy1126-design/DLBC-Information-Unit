import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Icon } from './Icon'
import { useTheme } from '../../hooks/useTheme'

const sections = [{ view: 'dashboard', label: 'Workspace' }, { view: 'sessions', label: 'Sessions' }, { view: 'reports', label: 'Reports' }]

export function AppShell({ activeView, isLiveRecordingActive = false, onNavigate, screenTitle = 'Workspace', onBack, onStartLiveSession, children }) {
  const { isDark, toggleTheme } = useTheme()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const drawerRef = useRef(null)
  const openerRef = useRef(null)
  const closeRef = useRef(null)
  const selected = activeView === 'reports' ? 2 : activeView === 'sessions' || activeView === 'session' ? 1 : 0
  const navigate = view => { onNavigate(view); setMobileNavOpen(false) }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => { setIsMobile(media.matches); if (!media.matches) setMobileNavOpen(false) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useLayoutEffect(() => {
    if (!mobileNavOpen || !isMobile) return
    const drawer = drawerRef.current
    const opener = openerRef.current
    const controls = () => [...drawer.querySelectorAll('button:not(:disabled), a[href]')].filter(el => el.getClientRects().length)
    closeRef.current?.focus()
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileNavOpen(false) }
      if (event.key === 'Tab') {
        const list = controls(); const first = list[0]; const last = list.at(-1)
        if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
      }
    }
    const focus = event => { if (!drawer.contains(event.target)) closeRef.current?.focus() }
    document.addEventListener('keydown', key)
    document.addEventListener('focusin', focus)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('focusin', focus); if (opener?.isConnected) opener.focus() }
  }, [mobileNavOpen, isMobile])

  const navigation = <nav className="desk-navigation" aria-label="Workspace sections" style={{ '--selected-section': selected }}>
    {sections.map(({ view, label }) => <button key={view} id={`nav-link-${view}`} className="desk-nav-link" aria-current={activeView === view || (view === 'sessions' && activeView === 'session') ? 'page' : undefined} onClick={() => navigate(view)}>{label}</button>)}
    <span className="desk-nav-baseline" aria-hidden="true" />
  </nav>
  const utilities = <div className="desk-utilities">
    <button id="nav-link-settings" className="desk-utility" onClick={() => navigate('settings')} aria-current={activeView === 'settings' ? 'page' : undefined}><Icon name="settings" /><span>Settings</span></button>
    <button id="btn-sidebar-theme-toggle" className="desk-utility" onClick={toggleTheme} aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}><Icon name={isDark ? 'sun' : 'moon'} /><span>{isDark ? 'Light mode' : 'Dark mode'}</span></button>
  </div>

  return <div className="app-shell-container desk-shell">
    <header className="desk-masthead" inert={mobileNavOpen}>
      {isMobile && <button className="desk-menu-button" ref={openerRef} id="btn-toggle-mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" aria-expanded={mobileNavOpen} aria-controls="app-navigation"><Icon name="menu" /></button>}
      <button className="desk-brand" onClick={() => navigate('dashboard')} aria-label="DLBC Information Unit home"><img src="/dlbc-logo.png" alt="" /><span className="desk-brand-name">DLBC</span><span className="desk-brand-unit">Information Unit</span></button>
      {!isMobile && navigation}
      {!isMobile && utilities}
    </header>
    {isMobile && <>
      {mobileNavOpen && <button className="mobile-nav-backdrop desk-backdrop" aria-label="Close navigation backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`desk-navigation-drawer ${mobileNavOpen ? 'is-open' : ''}`} id="app-navigation" ref={drawerRef} inert={!mobileNavOpen} role={mobileNavOpen ? 'dialog' : undefined} aria-modal={mobileNavOpen || undefined} aria-label="Main navigation">
        <div className="desk-drawer-heading"><strong>Information Unit</strong><button ref={closeRef} onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><Icon name="close" /></button></div>
        {navigation}{utilities}
        {isLiveRecordingActive && <button className="desk-active-recording" onClick={() => { onStartLiveSession?.(); setMobileNavOpen(false) }}>Return to active recording</button>}
      </aside>
    </>}
    <div className="app-main-column desk-main" inert={mobileNavOpen}>
      {(onBack || isLiveRecordingActive) && <div className="desk-context-bar">
        {onBack && <button className="desk-back" onClick={onBack} aria-label="Back"><Icon name="back" /><span>{screenTitle}</span></button>}
        {isLiveRecordingActive && <button className="desk-active-recording" id="sidebar-btn-active-recording" onClick={onStartLiveSession}><span aria-hidden="true">●</span> Return to active recording</button>}
      </div>}
      <main className="app-content-body">{children}</main>
    </div>
  </div>
}
