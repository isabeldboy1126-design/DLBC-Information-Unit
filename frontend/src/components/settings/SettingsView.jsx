import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl, API_BASE_URL } from '../../config'
import { ProgrammesSettingsSection } from './ProgrammesSettingsSection'

export function SettingsView({ onBack }) {
  const [instruction, setInstruction] = useState('')
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
      const [instRes, setRes] = await Promise.all([
        fetch(getApiUrl('/api/report-processing/instruction')).catch(() => null),
        fetch(getApiUrl('/api/report-processing/settings')).catch(() => null),
      ])

      if (instRes && instRes.ok) {
        const instData = await instRes.json()
        setInstruction(instData.instruction || '')
      }
      if (setRes && setRes.ok) {
        const setData = await setRes.json()
        const autoVal = setData.auto_process_after_verification
        setAutoProcessAfterVerification(autoVal !== false && autoVal !== 'false')
      }
      setLastRefreshed(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Error fetching settings:', err)
      setError(`Could not connect to backend server at ${API_BASE_URL}.`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettingsData()
  }, [fetchSettingsData])

  const handleSaveInstructions = async () => {
    if (!instruction.trim()) {
      alert('Unified instructions cannot be empty.')
      return
    }
    setIsSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(getApiUrl('/api/report-processing/instruction'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim() }),
      })
      if (res.ok) {
        setFeedback('✓ Instructions saved successfully. Future Report Processing runs will follow these rules.')
        fetchSettingsData()
        setTimeout(() => setFeedback(null), 5000)
      } else {
        const err = await res.json()
        alert(`Failed to save instructions: ${err.detail || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error saving instructions: ${err.message}`)
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
            <h1 className="settings-title">System Settings &amp; Editorial Standards</h1>
            <p className="settings-subtitle">
              Manage authoritative editorial instructions and configure church programmes.
            </p>
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
            disabled={isLoading}
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
              <p className="settings-card-subtitle">
                Unified rules, theology style, and report structure enforced during single-stage Report Processing.
              </p>
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

          {/* Unified Instructions Area */}
          <div className="unified-instructions-group">
            <div className="unified-instructions-header">
              <label htmlFor="unified-instructions-textarea" className="unified-instructions-label">
                Unified Report Processing Instructions
              </label>
              <span className="unified-instructions-badge">Authoritative Prompt</span>
            </div>
            <textarea
              id="unified-instructions-textarea"
              className="unified-instructions-textarea"
              rows={16}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Loading unified editorial instructions..."
              disabled={isLoading}
            />
            <div className="unified-instructions-actions">
              <button
                type="button"
                className="btn btn--primary btn-save-instructions"
                onClick={handleSaveInstructions}
                disabled={isSaving || isLoading}
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

