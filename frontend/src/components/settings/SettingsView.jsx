import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl, API_BASE_URL, authFetch } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../hooks/useTheme'
import { ProgrammesSettingsSection } from './ProgrammesSettingsSection'
import { APP_VERSION } from '../../utils/version'
import { isDesktop, checkForAppUpdates, downloadAndInstallUpdate, relaunchApplication } from '../../services/desktopPlatform'

export function SettingsView({ onBack, onReplayOnboarding, onTestOnboarding }) {
  const { account, demoMode } = useAuth()
  const { theme, toggleTheme } = useTheme()

  // Active Settings Tab / Destination
  const [activeTab, setActiveTab] = useState('church_profile')

  // Editorial Standards & Instructions state
  const [instruction, setInstruction] = useState('')
  const [instructionLoaded, setInstructionLoaded] = useState(false)
  const [autoProcessAfterVerification, setAutoProcessAfterVerification] = useState(false)
  const [isAutoProcessLoaded, setIsAutoProcessLoaded] = useState(false)
  const [isSavingAutoProcess, setIsSavingAutoProcess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  // Demo onboarding state
  const [hasDemoDraft, setHasDemoDraft] = useState(() => {
    try {
      return Boolean(localStorage.getItem('dlbc_demo_onboarding_draft'))
    } catch {
      return false
    }
  })

  // Startup animation preference
  const [startupAnimationEnabled, setStartupAnimationEnabled] = useState(() => {
    try {
      const val = localStorage.getItem('dlbc_startup_animation_enabled')
      return val !== 'false'
    } catch {
      return true
    }
  })

  // Default Sessions View Mode preference (list or grid)
  const [sessionsDefaultView, setSessionsDefaultView] = useState(() => {
    try {
      return localStorage.getItem('dlbc_sessions_view_mode') || 'list'
    } catch {
      return 'list'
    }
  })

  // Audio devices state
  const [audioDevices, setAudioDevices] = useState([])
  const [hasAudioPermission, setHasAudioPermission] = useState(null)

  // Custom vocabulary state
  const [customVocab, setCustomVocab] = useState(() => {
    try {
      const saved = localStorage.getItem('dlbc_custom_vocabulary')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [newVocabTerm, setNewVocabTerm] = useState('')

  // Software updates state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [updateState, setUpdateState] = useState('idle')
  const [updateError, setUpdateError] = useState(null)

  // Enumerate audio input devices
  useEffect(() => {
    async function loadAudioDevices() {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const inputs = devices.filter((d) => d.kind === 'audioinput')
          setAudioDevices(inputs)
          setHasAudioPermission(inputs.some((d) => Boolean(d.label)))
        } catch (e) {
          console.warn('Could not enumerate audio devices:', e)
        }
      }
    }
    loadAudioDevices()
  }, [])

  // Handle Startup Animation Toggle
  const handleToggleStartupAnimation = (e) => {
    const nextVal = e.target.checked
    setStartupAnimationEnabled(nextVal)
    try {
      localStorage.setItem('dlbc_startup_animation_enabled', String(nextVal))
      setFeedback(nextVal ? 'Startup logo animation enabled.' : 'Startup logo animation disabled.')
      setTimeout(() => setFeedback(null), 3000)
    } catch (err) {
      console.warn('Failed to save startup animation setting:', err)
    }
  }

  // Handle Sessions View Mode Change
  const handleChangeSessionsViewMode = (mode) => {
    setSessionsDefaultView(mode)
    try {
      localStorage.setItem('dlbc_sessions_view_mode', mode)
      setFeedback(`Default sessions view set to ${mode === 'list' ? 'List View' : 'Grid View'}.`)
      setTimeout(() => setFeedback(null), 3000)
    } catch (err) {
      console.warn('Failed to save sessions view setting:', err)
    }
  }

  // Handle Custom Vocabulary Add/Remove
  const handleAddVocabTerm = (e) => {
    e.preventDefault()
    const trimmed = newVocabTerm.trim()
    if (!trimmed || customVocab.includes(trimmed)) return
    const updated = [...customVocab, trimmed]
    setCustomVocab(updated)
    setNewVocabTerm('')
    try {
      localStorage.setItem('dlbc_custom_vocabulary', JSON.stringify(updated))
    } catch (e) {
      console.warn('Failed to save vocabulary:', e)
    }
  }

  const handleRemoveVocabTerm = (termToRemove) => {
    const updated = customVocab.filter((t) => t !== termToRemove)
    setCustomVocab(updated)
    try {
      localStorage.setItem('dlbc_custom_vocabulary', JSON.stringify(updated))
    } catch (e) {
      console.warn('Failed to save vocabulary:', e)
    }
  }

  // Handle Reset Demo Draft
  const handleResetDemoDraft = () => {
    try {
      localStorage.removeItem('dlbc_demo_onboarding_draft')
      setHasDemoDraft(false)
      setFeedback('Demo test onboarding draft cleared.')
      setTimeout(() => setFeedback(null), 3000)
    } catch (e) {
      console.warn('Error clearing demo draft:', e)
    }
  }

  // Software Update Handlers
  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true)
    setUpdateError(null)
    setUpdateState('checking')
    try {
      const res = await checkForAppUpdates()
      if (res.available) {
        setUpdateInfo(res)
        setUpdateState('available')
      } else {
        setUpdateState('up_to_date')
        setTimeout(() => setUpdateState('idle'), 4000)
      }
    } catch (err) {
      setUpdateError('Update check failed. Try again later.')
      setUpdateState('failed')
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.updateRef) return
    setUpdateState('downloading')
    setUpdateError(null)
    try {
      await downloadAndInstallUpdate(updateInfo.updateRef)
      setUpdateState('ready')
    } catch (err) {
      console.error('Update download failed:', err)
      setUpdateError('Update could not be installed. Try again later.')
      setUpdateState('failed')
    }
  }

  const handleRestartToUpdate = async () => {
    await relaunchApplication()
  }

  // Fetch Settings Data
  const fetchSettingsData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // 1. Fetch settings (auto-process after verification)
      try {
        const setRes = await authFetch(getApiUrl('/api/report-processing/settings'))
        if (setRes.ok) {
          const setData = await setRes.json()
          const autoVal = setData.auto_process_after_verification
          setAutoProcessAfterVerification(autoVal !== false && autoVal !== 'false')
          setIsAutoProcessLoaded(true)
        } else {
          setIsAutoProcessLoaded(false)
        }
      } catch (e) {
        console.warn('Failed to load settings:', e)
        setIsAutoProcessLoaded(false)
      }

      // 2. Fetch authoritative instruction with multi-endpoint fallback
      let loadedInstruction = null

      try {
        const instRes = await authFetch(getApiUrl('/api/report-processing/instruction'))
        if (instRes.ok) {
          const instData = await instRes.json()
          if (instData && (instData.instruction || instData.unified_instructions)) {
            loadedInstruction = instData.instruction || instData.unified_instructions
          }
        }
      } catch (e) {
        console.warn('Primary instruction fetch failed:', e)
      }

      if (!loadedInstruction) {
        try {
          const setRes2 = await authFetch(getApiUrl('/api/report-processing/settings'))
          if (setRes2.ok) {
            const setData2 = await setRes2.json()
            if (setData2 && (setData2.instruction || setData2.unified_instructions)) {
              loadedInstruction = setData2.instruction || setData2.unified_instructions
            }
          }
        } catch (e) {
          console.warn('Settings fallback fetch failed:', e)
        }
      }

      if (!loadedInstruction) {
        try {
          const stdRes = await authFetch(getApiUrl('/api/report-processing/standards/active'))
          if (stdRes.ok) {
            const stdData = await stdRes.json()
            if (stdData && (stdData.instruction || stdData.unified_instructions)) {
              loadedInstruction = stdData.instruction || stdData.unified_instructions
            } else if (stdData && (stdData.reporter_extraction_instructions || stdData.anti_slop_rules)) {
              const parts = []
              if (stdData.anti_slop_rules) parts.push(`ANTI-AI-SLOP RULES & TONE MANDATE:\n${stdData.anti_slop_rules.trim()}`)
              if (stdData.reporter_extraction_instructions) parts.push(`1. REPORTER EXTRACTION STANDARDS:\n${stdData.reporter_extraction_instructions.trim()}`)
              if (stdData.editorial_selection_instructions) parts.push(`2. EDITORIAL SELECTION STANDARDS:\n${stdData.editorial_selection_instructions.trim()}`)
              if (stdData.writing_instructions) parts.push(`3. INFORMATION UNIT WRITING STANDARDS:\n${stdData.writing_instructions.trim()}`)
              if (stdData.proofreading_instructions) parts.push(`4. PROOFREADING & VALIDATION STANDARDS:\n${stdData.proofreading_instructions.trim()}`)
              if (parts.length > 0) loadedInstruction = parts.join('\n\n')
            }
          }
        } catch (e) {
          console.warn('Standards fallback fetch failed:', e)
        }
      }

      if (loadedInstruction && typeof loadedInstruction === 'string' && loadedInstruction.trim()) {
        setInstruction(loadedInstruction)
        setInstructionLoaded(true)
        setError(null)
      } else {
        setInstructionLoaded(false)
        setError('AI Processing Instructions could not be loaded.')
      }

      setLastRefreshed(new Date().toLocaleTimeString())
    } catch (err) {
      console.error(`Error connecting to backend server at ${API_BASE_URL}:`, err)
      setInstructionLoaded(false)
      setError('AI Processing Instructions could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettingsData()
  }, [fetchSettingsData])

  // Save AI Instructions
  const handleSaveInstructions = async () => {
    if (!instructionLoaded) {
      setError('Cannot save: instructions could not be loaded. Please click Retry first.')
      return
    }
    const trimmed = instruction.trim()
    if (!trimmed) {
      setError('AI Processing Instructions cannot be empty.')
      return
    }
    setIsSaving(true)
    setFeedback(null)
    setError(null)
    try {
      const res = await authFetch(getApiUrl('/api/report-processing/instruction'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmed, unified_instructions: trimmed }),
      })
      if (res.ok) {
        const data = await res.json()
        const savedText = data.instruction || data.unified_instructions || trimmed
        setInstruction(savedText)
        setInstructionLoaded(true)
        setFeedback('✓ Instructions saved successfully. Future Report Processing runs will follow these rules.')
        setLastRefreshed(new Date().toLocaleTimeString())
        setTimeout(() => setFeedback(null), 5000)
      } else {
        const err = await res.json().catch(() => ({}))
        setError(`Failed to save instructions: ${err.detail || 'Server rejected request'}`)
      }
    } catch (err) {
      console.error('Network error saving instructions:', err)
      setError('AI Processing Instructions could not be saved.')
    } finally {
      setIsSaving(false)
    }
  }

  // Toggle Auto-Process
  const handleToggleAutoProcess = async () => {
    if (!isAutoProcessLoaded || isSavingAutoProcess) return
    const prevVal = autoProcessAfterVerification
    const nextVal = !prevVal
    setAutoProcessAfterVerification(nextVal)
    setIsSavingAutoProcess(true)
    setError(null)
    try {
      const res = await authFetch(getApiUrl('/api/report-processing/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_process_after_verification: nextVal }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json().catch(() => ({}))
      if (typeof data.auto_process_after_verification === 'boolean') {
        setAutoProcessAfterVerification(data.auto_process_after_verification)
      }
    } catch (err) {
      console.error('Failed to toggle auto_process_after_verification:', err)
      setAutoProcessAfterVerification(prevVal)
      setError('Settings could not be saved.')
    } finally {
      setIsSavingAutoProcess(false)
    }
  }

  // Destination definitions
  const destinations = [
    { id: 'church_profile', label: 'Church Profile', icon: '🏛️', subtitle: 'Church Unit & hierarchy' },
    { id: 'accounts_team', label: 'Accounts & Team', icon: '👥', subtitle: 'Active user & team scope' },
    { id: 'audio_microphones', label: 'Audio & Microphones', icon: '🎙️', subtitle: 'Hardware & lossless setup' },
    { id: 'programmes_sessions', label: 'Programmes & Sessions', icon: '📅', subtitle: 'Church programme schedule' },
    { id: 'editorial_standards', label: 'Editorial Standards', icon: '📋', subtitle: 'AI instructions & rules' },
    { id: 'ai_models', label: 'AI Models & Providers', icon: '⚡', subtitle: 'Deepgram & Azure LLM' },
    { id: 'vocabulary', label: 'Vocabulary & Glossary', icon: '📖', subtitle: 'Doctrinal terms dictionary' },
    { id: 'application_updates', label: 'Application & Updates', icon: '💻', subtitle: 'Version & release channel' },
    { id: 'storage_security', label: 'Storage & Security', icon: '🛡️', subtitle: 'Audio preservation & auth' },
    { id: 'preferences', label: 'Preferences', icon: '⚙️', subtitle: 'Theme, animation & layout' },
  ]

  const activeDest = destinations.find((d) => d.id === activeTab) || destinations[0]

  return (
    <div className="settings-page-root">
      {/* Top Bar with Back, DLBC Emblem, and Refresh */}
      <header className="settings-top-navbar">
        <div className="settings-top-navbar-left">
          <button
            type="button"
            className="settings-back-btn"
            onClick={onBack}
            id="btn-settings-back"
            title="Return to application workspace"
          >
            <span className="settings-back-arrow">←</span>
            <span>Back to app</span>
          </button>

          <div className="settings-brand-divider" />

          <div className="settings-brand-title-wrap">
            <img src="/dlbc-logo.png" alt="DLBC" className="settings-brand-emblem" />
            <div>
              <span className="settings-brand-title">DLBC INFORMATION UNIT</span>
              <span className="settings-brand-badge">SETTINGS</span>
            </div>
          </div>
        </div>

        <div className="settings-top-navbar-right">
          {lastRefreshed && (
            <span className="settings-refresh-label">Checked at {lastRefreshed}</span>
          )}
          <button
            type="button"
            className="btn btn--outline btn--small settings-refresh-btn"
            onClick={fetchSettingsData}
            disabled={isLoading || isSaving || isSavingAutoProcess}
          >
            {isLoading ? 'Checking...' : '↻ Refresh'}
          </button>
        </div>
      </header>

      {/* Main Settings Two-Column Layout */}
      <div className="settings-split-container">
        {/* Left Internal Sidebar with 10 Destinations */}
        <aside className="settings-destinations-sidebar" aria-label="Settings Categories">
          <div className="settings-sidebar-heading">CONFIGURATION CATEGORIES</div>
          <nav className="settings-nav-list">
            {destinations.map((dest) => {
              const isActive = activeTab === dest.id
              return (
                <button
                  key={dest.id}
                  type="button"
                  className={`settings-nav-item ${isActive ? 'settings-nav-item--active' : ''}`}
                  onClick={() => setActiveTab(dest.id)}
                  id={`btn-settings-nav-${dest.id}`}
                >
                  <span className="settings-nav-item-icon">{dest.icon}</span>
                  <div className="settings-nav-item-text">
                    <span className="settings-nav-item-label">{dest.label}</span>
                    <span className="settings-nav-item-sub">{dest.subtitle}</span>
                  </div>
                  {isActive && <span className="settings-nav-item-indicator" />}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Right Active Destination Content Panel */}
        <main className="settings-content-pane">
          {/* Header of Active Section */}
          <div className="settings-section-header">
            <div className="settings-section-header-title-row">
              <span className="settings-section-header-icon">{activeDest.icon}</span>
              <div>
                <h1 className="settings-section-title">{activeDest.label}</h1>
                <p className="settings-section-desc">{activeDest.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Alert notifications */}
          {error && (
            <div className="settings-alert settings-alert--error" role="alert">
              <div className="settings-alert-content">
                <span className="settings-alert-text">⚠️ {error}</span>
                <button
                  type="button"
                  className="btn btn--small btn--outline btn-retry-load"
                  onClick={fetchSettingsData}
                  disabled={isLoading}
                >
                  {isLoading ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            </div>
          )}

          {feedback && (
            <div className="settings-alert settings-alert--success">
              <span>{feedback}</span>
            </div>
          )}

          {/* TAB 1: Church Profile */}
          {activeTab === 'church_profile' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">🏛️</span>
                <div>
                  <h2 className="settings-card-title">Church Unit &amp; Hierarchy</h2>
                  <span className="settings-card-subtitle">Identity of the operational church reporting unit</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-key-val-grid">
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Church Unit Name</span>
                    <span className="settings-box-val">{account?.account_name || 'DLBC Information Unit'}</span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">State / Region</span>
                    <span className="settings-box-val">{account?.church_state || 'HQ / Central'}</span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Sector / District</span>
                    <span className="settings-box-val">{account?.sector || 'General'}</span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Hierarchy Level</span>
                    <span className="settings-box-val">
                      {account?.terminal_level ? account.terminal_level.replace(/_/g, ' ').toUpperCase() : 'NATIONAL HQ'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--color-text, #1e293b)' }}>Setup &amp; Onboarding Walkthrough</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>
                      Re-run the initial church profile setup guide at any time.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {demoMode ? (
                      <>
                        {onTestOnboarding && (
                          <button
                            type="button"
                            className="btn btn--secondary btn--small"
                            onClick={onTestOnboarding}
                            id="btn-test-onboarding"
                          >
                            Test Onboarding
                          </button>
                        )}
                        {hasDemoDraft && (
                          <button
                            type="button"
                            className="btn btn--outline btn--small"
                            onClick={handleResetDemoDraft}
                            id="btn-reset-demo-draft"
                          >
                            Reset Draft
                          </button>
                        )}
                      </>
                    ) : (
                      onReplayOnboarding && (
                        <button
                          type="button"
                          className="btn btn--secondary btn--small"
                          onClick={onReplayOnboarding}
                          id="btn-replay-onboarding"
                        >
                          Replay Onboarding
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Accounts & Team */}
          {activeTab === 'accounts_team' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">👥</span>
                <div>
                  <h2 className="settings-card-title">User Account &amp; Access Scope</h2>
                  <span className="settings-card-subtitle">Active identity and strict account isolation</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-key-val-grid">
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Authenticated Account Email</span>
                    <span className="settings-box-val">{account?.email || (demoMode ? 'demo@dlbc.org' : 'account@dlbc.org')}</span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Role &amp; Permissions</span>
                    <span className="settings-box-val" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="badge badge--info" style={{ fontSize: '0.75rem' }}>
                        {demoMode ? 'Local Demo' : (account?.role ? account.role.toUpperCase() : 'OWNER')}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="settings-info-callout" style={{ marginTop: '1.25rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#2563eb' }}>🔒 Strict Session &amp; Data Isolation</div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                    All audio recordings, transcripts, verified records, and generated publications are strictly isolated to your authenticated account ID (<code>{account?.account_id || account?.id || 'primary'}</code>). No unauthorized cross-account data access is permitted.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Audio & Microphones */}
          {activeTab === 'audio_microphones' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">🎙️</span>
                <div>
                  <h2 className="settings-card-title">Audio Hardware &amp; Capture Settings</h2>
                  <span className="settings-card-subtitle">Lossless-first audio pipeline configuration</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-key-val-grid">
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Capture Pipeline Quality</span>
                    <span className="settings-box-val" style={{ color: '#10b981', fontWeight: 600 }}>
                      ✓ Lossless-First (Pristine 16-bit PCM WAV)
                    </span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Capture Architecture</span>
                    <span className="settings-box-val">Web Audio API (AudioWorkletNode)</span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Sample Rate</span>
                    <span className="settings-box-val">Native Hardware (44.1 kHz / 48 kHz Auto)</span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Channel Format</span>
                    <span className="settings-box-val">Mono Uncompressed (Speech-Optimized)</span>
                  </div>
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text, #1e293b)' }}>
                    Detected Input Devices ({audioDevices.length})
                  </div>
                  {audioDevices.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>
                      System Default Microphone / Line In active.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {audioDevices.map((dev, idx) => (
                        <div
                          key={dev.deviceId || idx}
                          style={{
                            padding: '0.6rem 0.85rem',
                            borderRadius: '6px',
                            background: 'var(--bg-card-subtle, rgba(0,0,0,0.03))',
                            border: '1px solid var(--border-color, #e2e8f0)',
                            fontSize: '0.85rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span>🎙️ {dev.label || `Audio Input Device #${idx + 1}`}</span>
                          <span className="badge badge--neutral" style={{ fontSize: '0.7rem' }}>Available</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Programmes & Sessions */}
          {activeTab === 'programmes_sessions' && (
            <ProgrammesSettingsSection />
          )}

          {/* TAB 5: Editorial Standards */}
          {activeTab === 'editorial_standards' && (
            <div className="settings-card editorial-standards-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">📋</span>
                <div>
                  <h2 className="settings-card-title">Editorial Standards &amp; Instruction Management</h2>
                  <span className="settings-card-subtitle">AI synthesis guidelines and auto-processing triggers</span>
                </div>
              </div>
              <div className="settings-card-body">
                {/* Auto-Process Row */}
                <div className="settings-auto-process-row">
                  <div className="settings-auto-process-label-group">
                    <span className="settings-auto-process-label">Auto-Process After Verification</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #888)', display: 'block' }}>
                      When enabled, report generation begins automatically once transcript verification completes.
                    </span>
                  </div>
                  <label
                    className={`toggle-switch ${(!isAutoProcessLoaded || isLoading || isSavingAutoProcess) ? 'toggle-switch--disabled' : ''}`}
                    aria-label="Auto-Process After Verification"
                  >
                    <input
                      type="checkbox"
                      checked={autoProcessAfterVerification}
                      onChange={handleToggleAutoProcess}
                      disabled={!isAutoProcessLoaded || isLoading || isSavingAutoProcess}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* AI Processing Instructions Area */}
                <div className="unified-instructions-group" style={{ marginTop: '1.25rem' }}>
                  <div className="unified-instructions-header">
                    <label htmlFor="unified-instructions-textarea" className="unified-instructions-label">
                      AI Processing Instructions (Unified Standard)
                    </label>
                    {isLoading && (
                      <span className="instructions-loading-badge" aria-live="polite">
                        Loading instructions...
                      </span>
                    )}
                  </div>

                  <textarea
                    id="unified-instructions-textarea"
                    className="unified-instructions-textarea"
                    rows={16}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder={isLoading ? '' : 'AI Processing Instructions will appear here when loaded...'}
                    disabled={isLoading || !instructionLoaded}
                  />

                  <div className="unified-instructions-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn-save-instructions"
                      onClick={handleSaveInstructions}
                      disabled={isSaving || isLoading || !instructionLoaded || !instruction.trim()}
                    >
                      {isSaving ? 'Saving Instructions...' : 'Save Instructions'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: AI Models & Providers */}
          {activeTab === 'ai_models' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">⚡</span>
                <div>
                  <h2 className="settings-card-title">AI Processing Models &amp; Service Providers</h2>
                  <span className="settings-card-subtitle">Active cognitive engines powering transcription &amp; reporting</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div className="settings-key-val-box" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.95rem' }}>Live &amp; Recorded Speech-to-Text</strong>
                      <span className="badge badge--success" style={{ fontSize: '0.72rem' }}>Operational</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>
                      <strong>Primary:</strong> Deepgram Nova-2 (WebSocket live streaming &amp; file ingest)<br />
                      <strong>Fallback:</strong> OpenAI Whisper Local Engine
                    </div>
                  </div>

                  <div className="settings-key-val-box" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.95rem' }}>Editorial Extraction &amp; Report Synthesis</strong>
                      <span className="badge badge--success" style={{ fontSize: '0.72rem' }}>Operational</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>
                      <strong>Model:</strong> Azure OpenAI GPT-4o / Google Gemini 2.5<br />
                      <strong>Protocol:</strong> Structured JSON Output compliant with DLBC Information Unit Schema
                    </div>
                  </div>

                  <div className="settings-key-val-box" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.95rem' }}>Transcript Verification &amp; Anti-Slop Checker</strong>
                      <span className="badge badge--success" style={{ fontSize: '0.72rem' }}>Active</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>
                      <strong>Pipeline:</strong> Deterministic Rule Verification Engine + Human Confirmation Threshold
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: Vocabulary & Glossary */}
          {activeTab === 'vocabulary' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">📖</span>
                <div>
                  <h2 className="settings-card-title">DLBC Vocabulary &amp; Doctrinal Glossary</h2>
                  <span className="settings-card-subtitle">Terms prioritized by transcription and report generation</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', marginBottom: '0.5rem' }}>
                    CANONICAL DOCTRINAL TERMS (BUILT-IN)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {[
                      'Pastor W.F. Kumuyi',
                      'GCK (Global Crusade with Kumuyi)',
                      'Search the Scriptures',
                      'Monday Bible Study',
                      'Workers\' Training',
                      'Faith Clinic',
                      'Great Commission',
                      'Systematic Exposition',
                      'Entire Sanctification',
                      'Christian Living',
                      'Tract Distribution',
                      'DCLM / DLBC',
                    ].map((term) => (
                      <span
                        key={term}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '16px',
                          background: 'rgba(37, 99, 235, 0.08)',
                          color: '#2563eb',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          border: '1px solid rgba(37, 99, 235, 0.2)',
                        }}
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', marginBottom: '0.5rem' }}>
                    CUSTOM LOCAL VOCABULARY ({customVocab.length})
                  </div>
                  <form onSubmit={handleAddVocabTerm} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                    <input
                      type="text"
                      className="form-control form-control--small"
                      placeholder="e.g. Local District Pastor Name, Camp Ground"
                      value={newVocabTerm}
                      onChange={(e) => setNewVocabTerm(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn btn--primary btn--small">
                      + Add Term
                    </button>
                  </form>

                  {customVocab.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted, #64748b)' }}>
                      No custom vocabulary added yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {customVocab.map((term) => (
                        <span
                          key={term}
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '16px',
                            background: 'var(--bg-card-subtle, rgba(0,0,0,0.05))',
                            border: '1px solid var(--border-color, #e2e8f0)',
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          {term}
                          <button
                            type="button"
                            onClick={() => handleRemoveVocabTerm(term)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.75rem', padding: 0 }}
                            title="Remove term"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: Application & Updates */}
          {activeTab === 'application_updates' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">💻</span>
                <div>
                  <h2 className="settings-card-title">Application &amp; Software Updates</h2>
                  <span className="settings-card-subtitle">Version metadata and release channel verification</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-key-val-grid">
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">App Semantic Version</span>
                    <span className="settings-box-val" style={{ color: '#2563eb', fontWeight: 600 }}>
                      v{APP_VERSION}
                    </span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Runtime Platform</span>
                    <span className="settings-box-val">
                      {isDesktop() ? 'Windows Desktop (Tauri V2 Native)' : 'Web Application'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--color-text, #1e293b)' }}>Signed Software Updates</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>
                      {updateState === 'checking' && 'Checking for signed updates...'}
                      {updateState === 'available' && `Update ${updateInfo?.version || ''} available for download`}
                      {updateState === 'downloading' && 'Downloading update in background...'}
                      {updateState === 'ready' && 'Update ready to install. Restart when safe.'}
                      {updateState === 'up_to_date' && 'Application is fully up to date.'}
                      {updateState === 'failed' && (updateError || 'Update could not be checked.')}
                      {updateState === 'idle' && (isDesktop() ? 'Automated cryptographic signature checks enabled' : 'Web application automatically uses current server build')}
                    </div>
                  </div>

                  <div>
                    {isDesktop() ? (
                      updateState === 'ready' ? (
                        <button
                          type="button"
                          className="btn btn--primary btn--small"
                          onClick={handleRestartToUpdate}
                          style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                        >
                          Restart to update
                        </button>
                      ) : updateState === 'available' ? (
                        <button
                          type="button"
                          className="btn btn--primary btn--small"
                          onClick={handleDownloadUpdate}
                        >
                          Download update
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--secondary btn--small"
                          onClick={handleCheckForUpdates}
                          disabled={isCheckingUpdate}
                        >
                          {isCheckingUpdate ? 'Checking...' : 'Check for updates'}
                        </button>
                      )
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>✓ Auto-synced</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: Storage & Security */}
          {activeTab === 'storage_security' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">🛡️</span>
                <div>
                  <h2 className="settings-card-title">Storage Integrity &amp; Security Controls</h2>
                  <span className="settings-card-subtitle">Permanent audio preservation and cryptographic policies</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div className="settings-key-val-box" style={{ padding: '0.85rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text, #1e293b)', marginBottom: '0.25rem' }}>
                      🎵 Immutable Source Audio Preservation
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', lineHeight: 1.5 }}>
                      Source audio is stored losslessly prior to any transcription or pipeline execution. The application pipeline is architecturally prohibited from deleting or overwriting the original master audio.
                    </div>
                  </div>

                  <div className="settings-key-val-box" style={{ padding: '0.85rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text, #1e293b)', marginBottom: '0.25rem' }}>
                      📜 Raw Transcript Immutability
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', lineHeight: 1.5 }}>
                      The raw speech-to-text transcript is preserved indefinitely as an immutable record of what the transcription engine produced, separated from verified or edited versions.
                    </div>
                  </div>

                  <div className="settings-key-val-box" style={{ padding: '0.85rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text, #1e293b)', marginBottom: '0.25rem' }}>
                      🗑️ Permanent Deletion Guarantee
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', lineHeight: 1.5 }}>
                      When a session or event is permanently deleted with confirmation, all associated transcripts, verification logs, and report records are completely purged without leaving orphaned data.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: Preferences */}
          {activeTab === 'preferences' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon">⚙️</span>
                <div>
                  <h2 className="settings-card-title">User Interface Preferences</h2>
                  <span className="settings-card-subtitle">Desktop workspace presentation and animation settings</span>
                </div>
              </div>
              <div className="settings-card-body">
                {/* Theme Selector Row */}
                <div className="settings-auto-process-row">
                  <div>
                    <span className="settings-auto-process-label">Visual Theme Mode</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #888)', display: 'block' }}>
                      Switch between institutional light and dark high-contrast themes
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    onClick={toggleTheme}
                    id="btn-settings-toggle-theme"
                  >
                    {theme === 'dark' ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
                  </button>
                </div>

                {/* Startup Animation Toggle */}
                <div className="settings-auto-process-row" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                  <div>
                    <span className="settings-auto-process-label">DLBC Startup Logo Animation</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #888)', display: 'block' }}>
                      Play institutional DLBC emblem startup animation on initial workspace launch
                    </span>
                  </div>
                  <label className="toggle-switch" aria-label="DLBC Startup Animation">
                    <input
                      type="checkbox"
                      checked={startupAnimationEnabled}
                      onChange={handleToggleStartupAnimation}
                      id="toggle-startup-animation"
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Default Sessions View Toggle */}
                <div className="settings-auto-process-row" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                  <div>
                    <span className="settings-auto-process-label">Sessions Desktop Presentation</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #888)', display: 'block' }}>
                      Choose default presentation style for the Sessions History view
                    </span>
                  </div>
                  <div className="sessions-view-toggle-group">
                    <button
                      type="button"
                      className={`btn-view-toggle ${sessionsDefaultView === 'list' ? 'btn-view-toggle--active' : ''}`}
                      onClick={() => handleChangeSessionsViewMode('list')}
                      id="btn-pref-sessions-list"
                    >
                      ☰ Dense List
                    </button>
                    <button
                      type="button"
                      className={`btn-view-toggle ${sessionsDefaultView === 'grid' ? 'btn-view-toggle--active' : ''}`}
                      onClick={() => handleChangeSessionsViewMode('grid')}
                      id="btn-pref-sessions-grid"
                    >
                      ⊞ Card Grid
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
