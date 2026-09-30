import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl, API_BASE_URL } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { ProgrammesSettingsSection } from './ProgrammesSettingsSection'

export function SettingsView({ onBack, onReplayOnboarding }) {
  const { account } = useAuth()
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

  const fetchSettingsData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // 1. Fetch settings (auto-process after verification)
      try {
        const setRes = await fetch(getApiUrl('/api/report-processing/settings'))
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

      // Primary: /api/report-processing/instruction
      try {
        const instRes = await fetch(getApiUrl('/api/report-processing/instruction'))
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
          const setRes2 = await fetch(getApiUrl('/api/report-processing/settings'))
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
          const stdRes = await fetch(getApiUrl('/api/report-processing/standards/active'))
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
      const res = await fetch(getApiUrl('/api/report-processing/instruction'), {
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
    if (!isAutoProcessLoaded || isSavingAutoProcess) return
    const prevVal = autoProcessAfterVerification
    const nextVal = !prevVal
    setAutoProcessAfterVerification(nextVal)
    setIsSavingAutoProcess(true)
    setError(null)
    try {
      const res = await fetch(getApiUrl('/api/report-processing/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_process_after_verification: nextVal }),
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
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

  return (
    <div className="settings-page-container">
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
            disabled={isLoading || isSaving || isSavingAutoProcess}
          >
            {isLoading ? 'Checking...' : '↻ Refresh'}
          </button>
        </div>
      </div>

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

      {/* SECTION 1: Editorial Standards & Instruction Management */}
      <div className="settings-card editorial-standards-card">
        <div className="settings-card-header">
          <div className="settings-card-title-group">
            <span className="settings-card-icon">📋</span>
            <div>
              <h2 className="settings-card-title">Editorial Standards &amp; Instruction Management</h2>
            </div>
          </div>
        </div>

        <div className="settings-card-body">
          {/* Simple Auto-Process Row */}
          <div className="settings-auto-process-row">
            <div className="settings-auto-process-label-group">
              <span className="settings-auto-process-label">Auto-Process After Verification</span>
              {!isAutoProcessLoaded && !isLoading && (
                <span className="settings-field-unavailable-hint" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #888)', marginLeft: '0.5rem' }}>
                  (unavailable)
                </span>
              )}
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
                disabled={isSaving || isLoading || !instructionLoaded || !instruction.trim()}
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
            {onReplayOnboarding && (
              <button
                type="button"
                className="btn btn--secondary btn-replay-onboarding"
                onClick={onReplayOnboarding}
                id="btn-replay-onboarding"
              >
                Replay Onboarding
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

