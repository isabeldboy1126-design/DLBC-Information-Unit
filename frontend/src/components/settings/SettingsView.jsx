import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl, API_BASE_URL } from '../../config'
import { ProgrammesSettingsSection } from './ProgrammesSettingsSection'

export function SettingsView({ onBack }) {
  const [instruction, setInstruction] = useState('')
  const [instructionLoaded, setInstructionLoaded] = useState(false)
  const [autoProcessAfterVerification, setAutoProcessAfterVerification] = useState(true)
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
        }
      } catch (e) {
        console.warn('Failed to load settings:', e)
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
        }
      } catch (e) {
        console.warn('Primary instruction fetch failed:', e)
      }

      // Fallback 1: /api/report-processing/standards/active
      if (!loadedInstruction) {
        try {
          const stdRes = await fetch(getApiUrl('/api/report-processing/standards/active'))
          if (stdRes.ok) {
            const stdData = await stdRes.json()
            if (stdData && (stdData.instruction || stdData.unified_instructions)) {
              loadedInstruction = stdData.instruction || stdData.unified_instructions
            }
          }
        } catch (e) {
          console.warn('Standards fallback fetch failed:', e)
        }
      }

      // Fallback 2: /api/report-processing/settings
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

      if (loadedInstruction && typeof loadedInstruction === 'string' && loadedInstruction.trim()) {
        setInstruction(loadedInstruction)
        setInstructionLoaded(true)
      } else {
        setInstructionLoaded(false)
        setError(`Unable to load AI Processing Instructions from backend (${API_BASE_URL}). Please verify backend connectivity.`)
      }

      setLastRefreshed(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Error fetching settings:', err)
      setInstructionLoaded(false)
      setError(`Could not connect to backend server at ${API_BASE_URL}.`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettingsData()
  }, [fetchSettingsData])

  const handleSaveInstructions = async () => {
    if (!instructionLoaded) {
      setError('Cannot save: instructions failed to load from server. Please refresh first.')
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
        setError(`Failed to save instructions: ${err.detail || 'Unknown error'}`)
      }
    } catch (err) {
      setError(`Error saving instructions: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleAutoProcess = async () => {
    const nextVal = !autoProcessAfterVerification
    setAutoProcessAfterVerification(nextVal)
    try {
      await fetch(getApiUrl('/api/report-processing/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_process_after_verification: nextVal }),
      })
    } catch (err) {
      console.error('Failed to toggle auto_process_after_verification:', err)
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
            disabled={isLoading || isSaving}
          >
            {isLoading ? 'Checking...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="settings-alert settings-alert--error">
          <span>⚠️ {error}</span>
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
            <span className="settings-auto-process-label">Auto-Process After Verification</span>
            <label className="toggle-switch" aria-label="Auto-Process After Verification">
              <input
                type="checkbox"
                checked={autoProcessAfterVerification}
                onChange={handleToggleAutoProcess}
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

            {isLoading && !instructionLoaded ? (
              <div className="instructions-loading-skeleton" aria-hidden="true">
                <div className="skeleton-line" style={{ width: '60%' }}></div>
                <div className="skeleton-line" style={{ width: '85%' }}></div>
                <div className="skeleton-line" style={{ width: '75%' }}></div>
                <div className="skeleton-line" style={{ width: '90%' }}></div>
                <div className="skeleton-line" style={{ width: '50%' }}></div>
              </div>
            ) : (
              <textarea
                id="unified-instructions-textarea"
                className="unified-instructions-textarea"
                rows={16}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Enter AI processing instructions..."
                disabled={isLoading || !instructionLoaded}
              />
            )}

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
    </div>
  )
}

