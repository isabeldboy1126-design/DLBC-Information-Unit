import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl, API_BASE_URL, authFetch } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../hooks/useTheme'
import { ProgrammesSettingsSection } from './ProgrammesSettingsSection'
import { SettingsIcon } from './SettingsIcon'
import { APP_VERSION } from '../../utils/version'
import { isDesktop, checkForAppUpdates, downloadAndInstallUpdate, relaunchApplication } from '../../services/desktopPlatform'

export function SettingsView({ onBack, onReplayOnboarding, onTestOnboarding }) {
  const { account, user, demoMode, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()

  // Active Settings Tab / Destination (default: profile)
  const [activeTab, setActiveTab] = useState('profile')
  const [mobileSubpage, setMobileSubpage] = useState(null)

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
    const clean = newVocabTerm.trim()
    if (!clean) return
    if (customVocab.includes(clean)) {
      setFeedback(`"${clean}" is already in vocabulary.`)
      setTimeout(() => setFeedback(null), 3000)
      return
    }
    const updated = [...customVocab, clean]
    setCustomVocab(updated)
    setNewVocabTerm('')
    try {
      localStorage.setItem('dlbc_custom_vocabulary', JSON.stringify(updated))
      setFeedback(`Added "${clean}" to custom vocabulary.`)
      setTimeout(() => setFeedback(null), 3000)
    } catch (err) {
      console.warn('Failed to save custom vocabulary:', err)
    }
  }

  const handleRemoveVocabTerm = (termToRemove) => {
    const updated = customVocab.filter((t) => t !== termToRemove)
    setCustomVocab(updated)
    try {
      localStorage.setItem('dlbc_custom_vocabulary', JSON.stringify(updated))
      setFeedback(`Removed "${termToRemove}".`)
      setTimeout(() => setFeedback(null), 3000)
    } catch (err) {
      console.warn('Failed to remove vocabulary term:', err)
    }
  }

  // Handle Demo Onboarding reset
  const handleResetDemoDraft = () => {
    try {
      localStorage.removeItem('dlbc_demo_onboarding_draft')
      setHasDemoDraft(false)
      setFeedback('Test onboarding draft reset.')
      setTimeout(() => setFeedback(null), 3000)
    } catch (err) {
      console.warn('Failed to reset demo draft:', err)
    }
  }

  // Handle Updates
  const handleCheckForUpdates = async () => {
    if (isCheckingUpdate) return
    setIsCheckingUpdate(true)
    setUpdateError(null)
    setUpdateState('checking')
    try {
      const result = await checkForAppUpdates()
      if (result && result.available) {
        setUpdateInfo(result)
        setUpdateState('available')
        setFeedback(`Update ${result.version} is available!`)
      } else {
        setUpdateInfo(null)
        setUpdateState('up_to_date')
        setFeedback('Application is up to date.')
      }
    } catch (err) {
      console.error('Update check failed:', err)
      setUpdateError(err.message || 'Could not check for updates.')
      setUpdateState('failed')
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleDownloadUpdate = async () => {
    setUpdateState('downloading')
    setUpdateError(null)
    try {
      await downloadAndInstallUpdate(updateInfo?.updateRef, (progress) => {
        const total = progress.total || progress.contentLength
        if (total && progress.downloaded) {
          const pct = Math.round((progress.downloaded / total) * 100)
          setFeedback(`Downloading update... ${pct}%`)
        }
      })
      setUpdateState('ready')
      setFeedback('Update downloaded and verified. Restart to apply.')
    } catch (err) {
      console.error('Download update failed:', err)
      setUpdateError(err.message || 'Failed to download update.')
      setUpdateState('failed')
    }
  }

  const handleRestartToUpdate = async () => {
    try {
      await relaunchApplication()
    } catch (err) {
      console.error('Relaunch failed:', err)
      setUpdateError(err.message || 'Failed to restart application.')
    }
  }

  // Fetch Settings Data
  const fetchSettingsData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setFeedback(null)
    try {
      // 1. Fetch Auto-Process Setting
      try {
        const settingsRes = await authFetch(getApiUrl('/api/report-processing/settings'))
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          if (typeof settingsData.auto_process_after_verification === 'boolean') {
            setAutoProcessAfterVerification(settingsData.auto_process_after_verification)
            setIsAutoProcessLoaded(true)
          }
        }
      } catch (e) {
        console.warn('Auto-process settings fetch failed:', e)
      }

      // 2. Fetch Editorial Instructions
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
        console.warn('Instructions fetch failed, trying fallback standards endpoint:', e)
      }

      if (!loadedInstruction) {
        try {
          const stdRes = await authFetch(getApiUrl('/api/report-processing/standards'))
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

  // Final 10 Desktop Settings Destinations (Focused on user needs, no technical Storage/Security/AI Providers)
  const destinations = [
    { id: 'profile', label: 'Profile', description: 'Your personal account details and ministerial access role' },
    { id: 'account_church', label: 'Account & Church', description: 'Church unit identity and jurisdictional hierarchy' },
    { id: 'events', label: 'Events', description: 'Church programme schedule and service templates' },
    { id: 'verification', label: 'Verification', description: 'Transcript verification criteria and doctrinal glossary' },
    { id: 'ai_processing', label: 'AI Processing', description: 'Automated synthesis triggers and workflow pacing' },
    { id: 'editorial_standards', label: 'Editorial Standards', description: 'Editorial instructions and ministerial publication standards' },
    { id: 'appearance', label: 'Appearance', description: 'Customize how the application looks and behaves' },
    { id: 'application_updates', label: 'Application & Updates', description: 'Software version and release update management' },
    { id: 'help_support', label: 'Help & Support', description: 'Operational workflows, guides, and technical assistance' },
    { id: 'about', label: 'About', description: 'Application metadata, ministerial mission, and copyright' },
  ]

  const activeDest = destinations.find((d) => d.id === activeTab) || destinations[0]

  return (
    <div className="settings-page-root">
      {/* ------------------------------------------------------------- */}
      {/* MOBILE SETTINGS VIEW (Matching Reference Screen 8-15)         */}
      {/* ------------------------------------------------------------- */}
      <div className="mobile-settings-page-layout">
        {!mobileSubpage ? (
          /* Screen 8: Main Settings List */
          <div className="mobile-settings-main-list">
            <div className="mobile-subpage-header">
              {onBack && (
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
              )}
              <h1 className="mobile-header-title">Settings</h1>
              <div style={{ width: 36 }} />
            </div>

            <div className="mobile-settings-items-stack">
              {/* 1. Profile */}
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('profile')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">👤</div>
                  <div className="mobile-item-text">
                    <span className="mobile-item-label">Profile</span>
                    <span className="mobile-item-sub">Manage your account</span>
                  </div>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              {/* 2. App Preferences */}
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('app_preferences')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">⚙️</div>
                  <div className="mobile-item-text">
                    <span className="mobile-item-label">App Preferences</span>
                    <span className="mobile-item-sub">Appearance, notifications</span>
                  </div>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              {/* 3. Verification Settings */}
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('verification_settings')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">🛡️</div>
                  <div className="mobile-item-text">
                    <span className="mobile-item-label">Verification Settings</span>
                    <span className="mobile-item-sub">Configure verification options</span>
                  </div>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              {/* 4. AI Processing Settings */}
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('ai_processing')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">🧠</div>
                  <div className="mobile-item-text">
                    <span className="mobile-item-label">AI Processing Settings</span>
                    <span className="mobile-item-sub">Processing preferences</span>
                  </div>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              {/* 5. Editing Instructions */}
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('editing_instructions')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">✏️</div>
                  <div className="mobile-item-text">
                    <span className="mobile-item-label">Editing Instructions</span>
                    <span className="mobile-item-sub">View editing guidelines</span>
                  </div>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              {/* 6. Events */}
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('events')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">📅</div>
                  <div className="mobile-item-text">
                    <span className="mobile-item-label">Events</span>
                    <span className="mobile-item-sub">Add and manage events</span>
                  </div>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              {/* 7. Help & Support */}
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('help_support')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">❓</div>
                  <div className="mobile-item-text">
                    <span className="mobile-item-label">Help & Support</span>
                    <span className="mobile-item-sub">Get help and resources</span>
                  </div>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              {/* 8. About */}
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('about')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">ℹ️</div>
                  <div className="mobile-item-text">
                    <span className="mobile-item-label">About</span>
                    <span className="mobile-item-sub">{`App version ${APP_VERSION}`}</span>
                  </div>
                </div>
                <span className="mobile-chevron">›</span>
              </button>
            </div>
          </div>
        ) : mobileSubpage === 'profile' ? (
          /* Screen 9: Profile (Main) */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">Profile</h1>
              <div style={{ width: 36 }} />
            </div>

            <div className="mobile-profile-hero">
              <div className="mobile-profile-avatar-large">
                <span>{(account?.name || user?.name || user?.email || 'Daniel').charAt(0).toUpperCase()}</span>
              </div>
              <h2 className="mobile-profile-name">{account?.name || user?.name || 'Daniel'}</h2>
              <span className="mobile-profile-email">{user?.email || 'daniel@dlbc.org'}</span>
            </div>

            <div className="mobile-settings-items-stack" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('account_info')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">👤</div>
                  <span className="mobile-item-label">Account Information</span>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={() => setMobileSubpage('change_password')}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">🔒</div>
                  <span className="mobile-item-label">Change Password</span>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              <button
                type="button"
                className="mobile-settings-item-row"
                onClick={toggleTheme}
              >
                <div className="mobile-item-left">
                  <div className="mobile-item-icon-box">🎨</div>
                  <span className="mobile-item-label">Theme</span>
                </div>
                <span className="mobile-item-right-text">{theme === 'dark' ? 'Dark ›' : 'Light ›'}</span>
              </button>
            </div>

            <div style={{ marginTop: '2rem', padding: '0 1rem' }}>
              <button
                type="button"
                className="btn btn--danger"
                style={{ width: '100%', height: '44px', borderRadius: '12px', fontWeight: 600 }}
                onClick={() => signOut()}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : mobileSubpage === 'account_info' ? (
          /* Screen 10: Account Information */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage('profile')}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">Account Information</h1>
              <div style={{ width: 36 }} />
            </div>

            <div className="mobile-profile-hero">
              <div className="mobile-profile-avatar-large">
                <span>{(account?.name || user?.name || user?.email || 'Daniel').charAt(0).toUpperCase()}</span>
              </div>
              <button type="button" className="btn-link" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Change Photo</button>
            </div>

            <div className="mobile-form-fields" style={{ padding: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input type="text" className="form-control" defaultValue={account?.name || user?.name || 'Daniel'} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-control" defaultValue={user?.email || 'daniel@dlbc.org'} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <input type="text" className="form-control" defaultValue={account?.role || 'Information Unit'} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="text" className="form-control" defaultValue="+234 801 234 5678" />
              </div>
              <div className="form-group">
                <label className="form-label">Organization</label>
                <input type="text" className="form-control" defaultValue="DLBC" disabled />
              </div>
              <button type="button" className="btn btn--primary" style={{ width: '100%', marginTop: '1rem', height: '44px', borderRadius: '12px' }}>
                Save Changes
              </button>
            </div>
          </div>
        ) : mobileSubpage === 'change_password' ? (
          /* Screen 11: Change Password */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage('profile')}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">Change Password</h1>
              <div style={{ width: 36 }} />
            </div>

            <div className="mobile-form-fields" style={{ padding: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input type="password" className="form-control" placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input type="password" className="form-control" placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input type="password" className="form-control" placeholder="••••••••" />
              </div>
              <button type="button" className="btn btn--primary" style={{ width: '100%', marginTop: '1rem', height: '44px', borderRadius: '12px' }}>
                Update Password
              </button>
            </div>
          </div>
        ) : mobileSubpage === 'app_preferences' ? (
          /* Screen 12: App Preferences */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">App Preferences</h1>
              <div style={{ width: 36 }} />
            </div>

            <div style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Appearance</h3>
              <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="radio" name="app_theme" checked={theme === 'light'} onChange={() => theme !== 'light' && toggleTheme()} />
                  <span>Light Mode</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="radio" name="app_theme" checked={theme === 'dark'} onChange={() => theme !== 'dark' && toggleTheme()} />
                  <span>Dark Mode</span>
                </label>
              </div>

              <h3 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginTop: '1.5rem', marginBottom: '0.75rem' }}>Notifications</h3>
              <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>App Notifications</span>
                  <input type="checkbox" defaultChecked />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Processing Complete</span>
                  <input type="checkbox" defaultChecked />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Verification Updates</span>
                  <input type="checkbox" defaultChecked />
                </div>
              </div>
            </div>
          </div>
        ) : mobileSubpage === 'verification_settings' ? (
          /* Screen 13: Verification Settings */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">Verification Settings</h1>
              <div style={{ width: 36 }} />
            </div>

            <div style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Default Behavior</h3>
              <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="radio" name="verification_behavior" defaultChecked />
                  <span>Manual verification</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="radio" name="verification_behavior" />
                  <span>Automatic verification</span>
                </label>
              </div>

              <h3 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginTop: '1.5rem', marginBottom: '0.75rem' }}>Verification Options</h3>
              <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Show timestamps</span>
                  <input type="checkbox" defaultChecked />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Smart suggestions</span>
                  <input type="checkbox" defaultChecked />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Highlight uncertainties</span>
                  <input type="checkbox" defaultChecked />
                </div>
              </div>
            </div>
          </div>
        ) : mobileSubpage === 'ai_processing' ? (
          /* AI Processing Settings */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">AI Processing Settings</h1>
              <div style={{ width: 36 }} />
            </div>

            <div style={{ padding: '1rem' }}>
              <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem' }}>Auto-process after verification</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Automatically trigger report generation</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoProcessAfterVerification}
                    onChange={handleToggleAutoProcess}
                    disabled={isSavingAutoProcess}
                  />
                </div>
              </div>

              <div className="card" style={{ padding: '1rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Editorial Prompt Guidelines</label>
                <textarea
                  className="unified-instructions-textarea"
                  rows={8}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Enter editorial instructions for the AI report generation..."
                />
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ width: '100%', marginTop: '1rem', height: '42px', borderRadius: '10px' }}
                  onClick={handleSaveInstructions}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Instructions'}
                </button>
              </div>
            </div>
          </div>
        ) : mobileSubpage === 'events' ? (
          /* Screen 14: Events (Manage) */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">Events</h1>
              <div style={{ width: 36 }} />
            </div>
            <div style={{ padding: '1rem' }}>
              <ProgrammesSettingsSection />
            </div>
          </div>
        ) : mobileSubpage === 'editing_instructions' ? (
          /* Screen 15: Editing Instructions */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">Editing Instructions</h1>
              <div style={{ width: 36 }} />
            </div>

            <div style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                These guidelines help the AI process and format transcripts according to DLBC standards.
              </p>

              <div className="mobile-settings-items-stack">
                {['View Guidelines', 'Introduction Format', 'Speaker Labels', 'Scripture References', 'Tone and Style', 'Common Corrections'].map((item) => (
                  <div key={item} className="mobile-settings-item-row" style={{ cursor: 'default' }}>
                    <span className="mobile-item-label">{item}</span>
                    <span className="mobile-chevron">›</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Help & Support / About */
          <div className="mobile-subpage-container">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setMobileSubpage(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">{mobileSubpage === 'about' ? 'About' : 'Help & Support'}</h1>
              <div style={{ width: 36 }} />
            </div>

            <div style={{ padding: '1.25rem' }}>
              <div className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <img src="/dlbc-logo.png" alt="DLBC" style={{ width: '48px', height: '48px', margin: '0 auto 0.75rem' }} />
                <h3 style={{ margin: '0 0 0.25rem' }}>DLBC Information Unit</h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Version {APP_VERSION}</span>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.75rem', lineHeight: 1.5 }}>
                  Institutional ministerial platform for high-integrity sermon audio recording, automatic acoustic verification, and publication-ready report synthesis.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DESKTOP SETTINGS VIEW (Unchanged Desktop Layout)               */}
      {/* ------------------------------------------------------------- */}
      <div className="desktop-settings-page-layout">
        {/* Top Bar with Back to app, DLBC Emblem, and Refresh */}
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

          <div
            className="settings-brand-title-wrap"
            onClick={onBack}
            style={{ cursor: 'pointer' }}
            title="Return to Dashboard"
          >
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
        {/* Left Internal Sidebar with 10 Clean Destinations (No Subtext) */}
        <aside className="settings-destinations-sidebar" aria-label="Settings Categories">
          <div className="settings-sidebar-heading">SETTINGS</div>
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
                  <span className="settings-nav-item-icon"><SettingsIcon name={dest.id} size={18} /></span>
                  <span className="settings-nav-item-label">{dest.label}</span>
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
              <span className="settings-section-header-icon"><SettingsIcon name={activeDest.id} size={24} /></span>
              <div>
                <h1 className="settings-section-title">{activeDest.label}</h1>
                <p className="settings-section-desc">{activeDest.description}</p>
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

          {/* 1. Profile */}
          {activeTab === 'profile' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="profile" size={20} /></span>
                <div>
                  <h2 className="settings-card-title">User Profile &amp; Identity</h2>
                  <span className="settings-card-subtitle">Personal credentials and ministerial access</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-key-val-grid">
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Full Name</span>
                    <span className="settings-box-val">{account?.full_name || account?.name || 'Information Unit Reporter'}</span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Account Email</span>
                    <span className="settings-box-val">{account?.email || (demoMode ? 'demo@dlbc.org' : 'reporter@dlbc.org')}</span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Ministerial Role</span>
                    <span className="settings-box-val">
                      <span className="badge badge--info" style={{ fontSize: '0.75rem' }}>
                        {demoMode ? 'Local Demo' : (account?.role ? account.role.toUpperCase() : 'REPORTER')}
                      </span>
                    </span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Session Status</span>
                    <span className="settings-box-val" style={{ color: '#10b981', fontWeight: 600 }}>
                      ✓ Active &amp; Authenticated
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Account & Church */}
          {activeTab === 'account_church' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="account_church" size={20} /></span>
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
                    <div style={{ fontWeight: 600, color: 'var(--color-text, #1e293b)' }}>Church Profile Setup</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>
                      Update your church location and jurisdictional hierarchy.
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
                          Edit Church Details
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Events */}
          {activeTab === 'events' && (
            <ProgrammesSettingsSection />
          )}

          {/* 4. Verification */}
          {activeTab === 'verification' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="verification" size={20} /></span>
                <div>
                  <h2 className="settings-card-title">Verification &amp; Doctrinal Standards</h2>
                  <span className="settings-card-subtitle">Automated acoustic checks and doctrinal terms glossary</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="settings-key-val-grid">
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Acoustic Verification Mode</span>
                    <span className="settings-box-val" style={{ color: '#10b981', fontWeight: 600 }}>
                      ✓ Automated &amp; Ministerial Sync
                    </span>
                  </div>
                  <div className="settings-key-val-box">
                    <span className="settings-box-label">Replay Time-alignment</span>
                    <span className="settings-box-val">Precision Millisecond Synced</span>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
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
                      No custom vocabulary added yet. Terms added here will be prioritized during transcript verification.
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

          {/* 5. AI Processing */}
          {activeTab === 'ai_processing' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="ai_processing" size={20} /></span>
                <div>
                  <h2 className="settings-card-title">AI Processing Workflow</h2>
                  <span className="settings-card-subtitle">Automated report synthesis controls</span>
                </div>
              </div>
              <div className="settings-card-body">
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


              </div>
            </div>
          )}

          {/* 6. Editorial Standards */}
          {activeTab === 'editorial_standards' && (
            <div className="settings-card editorial-standards-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="editorial_standards" size={20} /></span>
                <div>
                  <h2 className="settings-card-title">Editorial Standards &amp; Instructions</h2>
                  <span className="settings-card-subtitle">AI synthesis guidelines and reporting rules</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div className="unified-instructions-group">
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

          {/* 7. Appearance */}
          {activeTab === 'appearance' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="appearance" size={20} /></span>
                <div>
                  <h2 className="settings-card-title">Appearance &amp; Presentation</h2>
                  <span className="settings-card-subtitle">Customize how the application looks and behaves</span>
                </div>
              </div>
              <div className="settings-card-body">
                {/* Theme Selector */}
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

          {/* 8. Application & Updates */}
          {activeTab === 'application_updates' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="application_updates" size={20} /></span>
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

          {/* 9. Help & Support */}
          {activeTab === 'help_support' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="help_support" size={20} /></span>
                <div>
                  <h2 className="settings-card-title">Help &amp; Operational Support</h2>
                  <span className="settings-card-subtitle">Guides and ministerial support for Information Unit reporters</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="settings-key-val-box" style={{ padding: '1rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--color-text, #1e293b)' }}><span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}><SettingsIcon name="recording" size={16} /> Live Service Recording Workflow</span></strong>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', lineHeight: 1.5 }}>
                      To begin live coverage, click "New Live Service" from the Dashboard. Ensure your church audio feed or USB interface is connected. The system automatically preserves pristine uncompressed audio and generates real-time transcripts.
                    </p>
                  </div>

                  <div className="settings-key-val-box" style={{ padding: '1rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--color-text, #1e293b)' }}><span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}><SettingsIcon name="check" size={16} /> Transcript Verification &amp; Audio Replay</span></strong>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', lineHeight: 1.5 }}>
                      Following recording, reporters review flagged phrases, names, and scriptures. Click on any segment to instantly listen to synchronized audio replay before confirming.
                    </p>
                  </div>

                  <div className="settings-key-val-box" style={{ padding: '1rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--color-text, #1e293b)' }}><span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}><SettingsIcon name="keyboard" size={16} /> Desktop Shortcuts</span></strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--color-text-muted, #64748b)' }}>
                      <div><kbd style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.1)' }}>Space</kbd> Play / Pause Audio</div>
                      <div><kbd style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.1)' }}>Esc</kbd> Close Modal / Overlay</div>
                      <div><kbd style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.1)' }}>Double-tap</kbd> Skip Startup Screen</div>
                    </div>
                  </div>

                  <div className="settings-info-callout">
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: '#2563eb' }}>Technical Assistance</div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                      For system assistance or hardware interface questions, contact the Deeper Life Bible Church Information Unit technical committee or your Regional IT coordinator.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 10. About */}
          {activeTab === 'about' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-icon"><SettingsIcon name="about" size={20} /></span>
                <div>
                  <h2 className="settings-card-title">About DLBC Information Unit</h2>
                  <span className="settings-card-subtitle">Official ministerial application information</span>
                </div>
              </div>
              <div className="settings-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
                  <img src="/dlbc-logo.png" alt="DLBC Emblem" style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                      Deeper Life Bible Church
                    </h3>
                    <div style={{ fontSize: '0.9rem', color: '#2563eb', fontWeight: 600 }}>
                      Information Unit Application v{APP_VERSION}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', marginTop: '0.2rem' }}>
                      Desktop Platform · Windows Native
                    </div>
                  </div>
                </div>

                <div className="settings-key-val-box" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-text, #1e293b)' }}>Ministerial Mission</div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', lineHeight: 1.55 }}>
                    Dedicated to the accurate recording, faithful transcription, editorial excellence, and ministerial preservation of God's Word across Deeper Christian Life Ministry services, retreats, and global crusades worldwide.
                  </p>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #94a3b8)', borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>© 2026 Deeper Christian Life Ministry. All rights reserved.</span>
                  <span>Institutional Publication Standard</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      </div>
    </div>
  )
}
