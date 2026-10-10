import React, { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl, authFetch } from '../../config'
import { useAuth } from '../../context/AuthContext'

/**
 * AutomaticVerificationToggle
 * Provides an ON/OFF control for Automatic AI Verification scoped per unit (Adult, Youth, Campus).
 * - When ON: Blue active state with label "Automatic Verification On".
 * - When OFF: Neutral inactive state with label "Automatic Verification Off".
 * Persists independently per unit to backend settings API (/api/report-processing/settings).
 */
export function AutomaticVerificationToggle({
  unit = null, // 'Adult' | 'Youth' | 'Campus' | null (defaults to current account sector)
  variant = 'standard', // 'standard' | 'compact'
  showDescription = false,
  className = '',
  onChange,
}) {
  const { account } = useAuth()
  
  // Resolve effective church unit
  const rawUnit = unit || account?.sector || account?.custom_sector || 'Adult'
  const normalizedUnit = rawUnit.toLowerCase().includes('youth')
    ? 'Youth'
    : rawUnit.toLowerCase().includes('campus')
    ? 'Campus'
    : 'Adult'

  const [isEnabled, setIsEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const activeReqRef = useRef(0)

  // Fetch unit setting on mount or when unit changes
  const fetchSetting = useCallback(async (reqId) => {
    setIsLoading(true)
    try {
      const url = getApiUrl(`/api/report-processing/settings?unit=${encodeURIComponent(normalizedUnit)}`)
      const res = await authFetch(url)
      if (res.ok && reqId === activeReqRef.current) {
        const data = await res.json()
        const unitKey = normalizedUnit.toLowerCase()
        let val = null
        if (data.unit_settings && typeof data.unit_settings[unitKey] === 'boolean') {
          val = data.unit_settings[unitKey]
        } else if (typeof data.auto_verification_enabled === 'boolean') {
          val = data.auto_verification_enabled
        } else if (typeof data.auto_verification_enabled === 'string') {
          val = data.auto_verification_enabled.toLowerCase() === 'true'
        }
        if (val !== null) {
          setIsEnabled(val)
        }
      }
    } catch (err) {
      console.warn(`Failed to load auto_verification_enabled setting for ${normalizedUnit}:`, err)
    } finally {
      if (reqId === activeReqRef.current) {
        setIsLoading(false)
      }
    }
  }, [normalizedUnit])

  useEffect(() => {
    const reqId = ++activeReqRef.current
    fetchSetting(reqId)
  }, [fetchSetting])

  const handleToggle = async (e) => {
    e?.preventDefault()
    e?.stopPropagation()
    if (isLoading || isSaving) return

    const prev = isEnabled
    const next = !prev
    setIsEnabled(next)
    setIsSaving(true)
    if (onChange) onChange(next)

    try {
      const res = await authFetch(getApiUrl('/api/report-processing/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_verification_enabled: next,
          unit: normalizedUnit.toLowerCase(),
          key: `auto_verification_enabled:${normalizedUnit.toLowerCase()}`,
          value: next,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json().catch(() => ({}))
      const unitKey = normalizedUnit.toLowerCase()
      if (data.unit_settings && typeof data.unit_settings[unitKey] === 'boolean') {
        setIsEnabled(data.unit_settings[unitKey])
      } else if (typeof data.auto_verification_enabled === 'boolean') {
        setIsEnabled(data.auto_verification_enabled)
      }
    } catch (err) {
      console.error(`Failed to update automatic verification setting for ${normalizedUnit}:`, err)
      // Rollback on failure
      setIsEnabled(prev)
      if (onChange) onChange(prev)
    } finally {
      setIsSaving(false)
    }
  }

  const isCompact = variant === 'compact'

  return (
    <div className={`auto-verify-toggle-wrapper ${className}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label={`Automatic Verification is currently ${isEnabled ? 'On' : 'Off'}. Click to toggle.`}
        title={
          isEnabled
            ? 'Automatic Verification is ON. Click to disable automatic AI verification.'
            : 'Automatic Verification is OFF. Click to enable automatic AI verification.'
        }
        className={`auto-verify-toggle-btn ${isEnabled ? 'auto-verify-toggle-btn--on' : 'auto-verify-toggle-btn--off'} ${
          isCompact ? 'auto-verify-toggle-btn--compact' : ''
        }`}
        onClick={handleToggle}
        disabled={isLoading || isSaving}
        id="btn-auto-verification-toggle"
      >
        <span
          className={`auto-verify-toggle-indicator ${
            isEnabled ? 'auto-verify-toggle-indicator--on' : 'auto-verify-toggle-indicator--off'
          }`}
          aria-hidden="true"
        >
          {isEnabled ? '✓' : '○'}
        </span>
        <span className="auto-verify-toggle-label">
          {isEnabled ? 'Automatic Verification On' : 'Automatic Verification Off'}
        </span>
      </button>

      {showDescription && (
        <span
          className="auto-verify-toggle-desc"
          style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #888)', marginLeft: '0.75rem' }}
        >
          {isEnabled
            ? 'AI verification runs automatically when audio has a valid transcript.'
            : 'AI verification will not run automatically. Manual verification remains available.'}
        </span>
      )}
    </div>
  )
}
