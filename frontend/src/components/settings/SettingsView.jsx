import { ReadinessSummary } from './ReadinessSummary'
import { Icon } from '../common/Icon'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl, API_BASE_URL, authFetch } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { ProgrammesSettingsSection } from './ProgrammesSettingsSection'

export function SettingsView({ onBack, onReplayOnboarding, onTestOnboarding }) {
  const { account, demoMode } = useAuth()
  const [instruction, setInstruction] = useState('')
  const [instructionLoaded, setInstructionLoaded] = useState(false)
  const [autoProcessAfterVerification, setAutoProcessAfterVerification] = useState(null)
  const [autoStatus, setAutoStatus] = useState('loading')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const settingsRequest = useRef(0)
  const [hasDemoDraft, setHasDemoDraft] = useState(() => {
    try {
      return Boolean(localStorage.getItem('dlbc_demo_onboarding_draft'))
    } catch (e) {
      return false
    }
  })

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

  const fetchSettingsData = useCallback(async () => {
    const request = ++settingsRequest.current
    setIsLoading(true)
    setError(null)
    setAutoProcessAfterVerification(null)
    setAutoStatus('loading')
    try {
      // 1. Fetch settings (auto-process after verification)
      try {
        const setRes = await authFetch(getApiUrl('/api/report-processing/settings'))
        if (!setRes.ok) throw new Error(`Settings request failed: ${setRes.status}`)
        const setData = await setRes.json()
        const autoVal = setData.auto_process_after_verification
        if (![true, false, 'true', 'false'].includes(autoVal)) throw new Error('Automation value is missing or invalid')
        if (request !== settingsRequest.current) return
        setAutoProcessAfterVerification(autoVal === true || autoVal === 'true')
        setAutoStatus('loaded')
      } catch (e) {
        if (request !== settingsRequest.current) return
        console.warn('Failed to load settings:', e)
        setAutoStatus('unavailable')
      }

      // 2. Fetch authoritative instruction with multi-endpoint fallback
      let loadedInstruction = null

      // Primary: /api/report-processing/instruction
      try {
        const instRes = await authFetch(getApiUrl('/api/report-processing/instruction'))
        if (instRes.ok) {
          const instData = await instRes.json()
          if (instData && (instData.instruction || instData.unified_instructions)) {
            loadedInstruction = instData.instruction || instData.unified_instructions
          }
        } else {
          console.warn(`Primary instruction endpoint returned HTTP ${instRes.status}`)
        }
      } catch (e) {
        console.warn('Primary instruction fetch failed:', e)
      }

      // Fallback 1: /api/report-processing/settings
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

      // Fallback 2: /api/report-processing/standards/active
      if (!loadedInstruction) {
        try {
          const stdRes = await authFetch(getApiUrl('/api/report-processing/standards/active'))
          if (stdRes.ok) {
            const stdData = await stdRes.json()
            if (stdData && (stdData.instruction || stdData.unified_instructions)) {
              loadedInstruction = stdData.instruction || stdData.unified_instructions
            } else if (stdData && (stdData.reporter_extraction_instructions || stdData.anti_slop_rules)) {
              // Intelligently synthesize from standard sections if un-migrated standard record returned
              const parts = []
              if (stdData.anti_slop_rules) {
                parts.push(`ANTI-AI-SLOP RULES & TONE MANDATE (ZERO TOLERANCE):\n${stdData.anti_slop_rules.trim()}`)
              }
              if (stdData.reporter_extraction_instructions) {
                parts.push(`1. REPORTER EXTRACTION STANDARDS:\n${stdData.reporter_extraction_instructions.trim()}`)
              }
              if (stdData.editorial_selection_instructions) {
                parts.push(`2. EDITORIAL SELECTION STANDARDS (KEEP / COMPRESS / OMIT):\n${stdData.editorial_selection_instructions.trim()}`)
              }
              if (stdData.writing_instructions) {
                parts.push(`3. INFORMATION UNIT WRITING STANDARDS:\n${stdData.writing_instructions.trim()}`)
              }
              if (stdData.proofreading_instructions) {
                parts.push(`4. PROOFREADING & VALIDATION STANDARDS:\n${stdData.proofreading_instructions.trim()}`)
              }
              if (parts.length > 0) {
                loadedInstruction = parts.join('\n\n')
              }
            }
          }
        } catch (e) {
          console.warn('Standards fallback fetch failed:', e)
        }
      }

      if (request !== settingsRequest.current) return
      if (loadedInstruction && typeof loadedInstruction === 'string' && loadedInstruction.trim()) {
        setInstruction(loadedInstruction)
        setInstructionLoaded(true)
        setError(null)
      } else {
        setInstructionLoaded(false)
        console.error(`Unable to load AI Processing Instructions from backend (${API_BASE_URL}).`)
        setError('AI Processing Instructions could not be loaded.')
      }

      setLastRefreshed(new Date().toLocaleTimeString())
    } catch (err) {
      if (request !== settingsRequest.current) return
      console.error(`Error connecting to backend server at ${API_BASE_URL}:`, err)
      setInstructionLoaded(false)
      setError('AI Processing Instructions could not be loaded.')
    } finally {
      if (request === settingsRequest.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettingsData()
  }, [fetchSettingsData])

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
        console.error('Server rejected instruction save:', err)
        setError(`Failed to save instructions: ${err.detail || 'Server rejected request'}`)
      }
    } catch (err) {
      console.error('Network error saving instructions:', err)
      setError('AI Processing Instructions could not be saved.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleAutoProcess = async () => {
    if (autoProcessAfterVerification === null || isLoading || isSaving || autoStatus === 'saving') return
    const previous = autoProcessAfterVerification
    const nextVal = !autoProcessAfterVerification
    setAutoProcessAfterVerification(nextVal)
    setAutoStatus('saving')
    try {
      const response = await authFetch(getApiUrl('/api/report-processing/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_process_after_verification: nextVal }),
      })
      if (!response.ok) throw new Error(`Automation save failed: ${response.status}`)
      setAutoStatus('saved')
    } catch (err) {
      console.error('Failed to toggle auto_process_after_verification:', err)
      setAutoProcessAfterVerification(previous)
      setAutoStatus('failed')
    }
  }

  return (
    <div className="settings-page-container">
      <ReadinessSummary />
      {/* Top Header */}
      <div className="settings-page-header">
        <div className="settings-header-left">
          <div>
            <h1 className="settings-title">Settings</h1>
          </div>
        </div>

        <div className="settings-header-right">
          {lastRefreshed && (
            <span className="settings-refresh-label">Checked at {lastRefreshed}</span>
          )}
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={fetchSettingsData}
            disabled={isLoading || isSaving || autoStatus === 'saving'}
          >
            {isLoading ? 'Checking...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="settings-alert settings-alert--error" role="alert">
          <div className="settings-alert-content">
            <span className="settings-alert-text">⚠ {error}</span>
            <button
              type="button"
              className="btn btn--small btn--outline btn-retry-load"
              onClick={fetchSettingsData}
              disabled={isLoading || isSaving || autoStatus === 'saving'}
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

      {/* SECTION 1: Editorial Standards & Instruction Management */}
      <div className="settings-card editorial-standards-card">
        <div className="settings-card-header">
          <div className="settings-card-title-group">
            <span className="settings-card-icon"><Icon name="copy" /></span>
            <div>
              <h2 className="settings-card-title">Editorial Standards &amp; Instruction Management</h2>
            </div>
          </div>
        </div>

        <div className="settings-card-body">
          {/* Simple Auto-Process Row */}
          <div className="settings-auto-process-row">
            <span className="settings-auto-process-label">Auto-Process After Verification</span>
            {autoProcessAfterVerification === null ? (
              <span>{autoStatus === 'loading' ? 'Loading…' : 'Unknown'}</span>
            ) : <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoProcessAfterVerification}
                onChange={handleToggleAutoProcess}
                aria-label="Auto-Process After Verification"
                aria-describedby="automation-status"
                disabled={isLoading || isSaving || autoStatus === 'saving'}
              />
              <span className="toggle-slider"></span>
            </label>}
          </div>
          <p id="automation-status" role={autoStatus === 'unavailable' || autoStatus === 'failed' ? 'alert' : 'status'}>
            {autoStatus === 'loading' ? 'Loading saved automation setting…'
              : autoStatus === 'unavailable' ? 'Saved automation setting is unknown. Retry loading before making changes.'
              : autoStatus === 'saving' ? 'Saving automation setting…'
              : autoStatus === 'failed' ? 'Automation setting could not be saved. Restored the last confirmed value. Toggle again to retry.'
              : autoStatus === 'saved' ? 'Automation setting saved.'
              : 'Saved automation setting loaded.'}
          </p>
          {autoStatus === 'unavailable' && (
            <button type="button" className="btn btn--outline btn--small" onClick={fetchSettingsData} disabled={isLoading || isSaving}>
              Retry automation settings
            </button>
          )}

          {/* AI Processing Instructions Area */}
          <div className="unified-instructions-group">
            <div className="unified-instructions-header">
              <label htmlFor="unified-instructions-textarea" className="unified-instructions-label">
                AI Processing Instructions
              </label>
              {isLoading && (
                <span className="instructions-loading-badge" aria-live="polite">
                  <span className="instructions-spinner" aria-hidden="true" />
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
                disabled={isSaving || isLoading || autoStatus === 'saving' || !instructionLoaded || !instruction.trim()}
              >
                {isSaving ? 'Saving Instructions...' : 'Save Instructions'}
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* SECTION 2: App Programmes */}
      <ProgrammesSettingsSection />

      {/* SECTION 3: Church Account & Hierarchy */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-header-left">
            <span className="settings-card-icon">🏛️</span>
            <div>
              <h2 className="settings-card-title">Church Account &amp; Hierarchy</h2>
            </div>
          </div>
        </div>
        <div className="settings-card-body">
          <div className="settings-account-details-row">
            <div className="settings-account-identity-box">
              <span className="settings-account-name-label">Current Church Unit</span>
              <span className="settings-account-name-val">{account?.account_name || 'DLBC Information Unit'}</span>
              <span className="settings-account-sub-val">
                {[account?.sector, account?.church_state, account?.terminal_level ? account.terminal_level.replace(/_/g, ' ') : null].filter(Boolean).join(' · ')}
              </span>
            </div>
            {demoMode ? (
              <div className="demo-settings-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                {onTestOnboarding && (
                  <button
                    type="button"
                    className="btn btn--secondary btn-replay-onboarding"
                    onClick={onTestOnboarding}
                    id="btn-test-onboarding"
                  >
                    Test Onboarding
                  </button>
                )}
                {hasDemoDraft && (
                  <button
                    type="button"
                    className="demo-reset-draft-btn"
                    onClick={handleResetDemoDraft}
                    id="btn-reset-demo-draft"
                    title="Clear local test onboarding draft"
                  >
                    Reset test onboarding
                  </button>
                )}
              </div>
            ) : (
              onReplayOnboarding && (
                <button
                  type="button"
                  className="btn btn--secondary btn-replay-onboarding"
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
  )
}

