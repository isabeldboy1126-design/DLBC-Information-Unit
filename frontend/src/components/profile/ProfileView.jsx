import React, { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

export function ProfileView({ onBack, onEditChurchDetails, onNavigate }) {
  const { user, account, updateDisplayName, resetPassword, signOut, demoMode, exitDemoMode } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [passwordNotice, setPasswordNotice] = useState(null)
  const [isSendingReset, setIsSendingReset] = useState(false)

  // Initialize display name from user object
  useEffect(() => {
    if (user?.display_name) {
      setDisplayName(user.display_name)
    } else {
      setDisplayName('')
    }
  }, [user?.display_name])

  const handleSaveDisplayName = async (e) => {
    e.preventDefault()
    setIsSavingName(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await updateDisplayName(displayName)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err.message || 'Failed to update display name.')
    } finally {
      setIsSavingName(false)
    }
  }

  const handlePasswordReset = async () => {
    if (demoMode) {
      setPasswordNotice('Password change is disabled in Local Demo Mode.')
      setTimeout(() => setPasswordNotice(null), 3000)
      return
    }
    if (!user?.email) return
    setIsSendingReset(true)
    setPasswordNotice(null)
    try {
      await resetPassword(user.email)
      setPasswordNotice(`Password reset instructions sent to ${user.email}.`)
      setTimeout(() => setPasswordNotice(null), 5000)
    } catch (err) {
      setPasswordNotice(`Error: ${err.message}`)
    } finally {
      setIsSendingReset(false)
    }
  }

  const roleLabel = demoMode
    ? 'Local Demo Mode'
    : account?.role
    ? account.role.charAt(0).toUpperCase() + account.role.slice(1)
    : 'Owner'

  const userInitial = (displayName || user?.email || 'U').charAt(0).toUpperCase()

  return (
    <div className="profile-container" id="profile-view" style={{ maxWidth: '640px', margin: '0 auto', padding: '16px' }}>
      {/* 1. Mobile Header with Visible Back Button */}
      <div className="mobile-subpage-header" style={{ marginBottom: '16px' }}>
        {onBack && (
          <button
            type="button"
            className="mobile-header-back-btn"
            onClick={onBack}
            aria-label="Back to Dashboard"
            id="btn-profile-back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <h1 className="mobile-header-title">Profile</h1>
        <div style={{ width: onBack ? 36 : 0 }} />
      </div>

      {saveSuccess && (
        <div className="settings-alert settings-alert--success" role="status" style={{ marginBottom: '16px' }}>
          <span>Display name updated successfully.</span>
        </div>
      )}

      {saveError && (
        <div className="onboarding-error-banner" role="alert" style={{ marginBottom: '16px' }}>
          <span>{saveError}</span>
        </div>
      )}

      {passwordNotice && (
        <div className="settings-alert settings-alert--success" role="status" style={{ marginBottom: '16px' }}>
          <span>{passwordNotice}</span>
        </div>
      )}

      {/* 2. Personal Profile Card */}
      <div className="card profile-card" style={{ padding: '24px', borderRadius: '14px', border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--color-surface, #ffffff)', marginBottom: '16px' }}>
        {/* Avatar & Core Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '26px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              flexShrink: 0,
            }}
          >
            {userInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-text-primary, #0f172a)', wordBreak: 'break-word' }}>
              {displayName || (demoMode ? 'Local Demo User' : 'Operator')}
            </h2>
            <p style={{ fontSize: '13px', margin: '0 0 6px 0', color: 'var(--color-text-muted, #64748b)', wordBreak: 'break-all' }}>
              {user?.email || (demoMode ? 'demo@dlbc.org' : 'user@church.org')}
            </p>
            <span
              style={{
                display: 'inline-block',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(37, 99, 235, 0.1)',
                color: '#2563eb',
              }}
            >
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Display Name Edit Form */}
        <form onSubmit={handleSaveDisplayName} style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
          <div className="auth-field">
            <label htmlFor="input-profile-display-name" className="auth-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #64748b)', marginBottom: '6px', display: 'block' }}>
              Display Name
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="input-profile-display-name"
                type="text"
                className="form-control"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                maxLength={100}
                style={{ flex: 1, padding: '10px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)' }}
              />
              <button
                type="submit"
                className="btn btn--primary"
                disabled={isSavingName || displayName.trim() === (user?.display_name || '').trim()}
                id="btn-save-display-name"
                style={{ whiteSpace: 'nowrap' }}
              >
                {isSavingName ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 3. Account Actions */}
      <div className="card" style={{ padding: '8px 16px', borderRadius: '14px', border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--color-surface, #ffffff)', marginBottom: '16px' }}>
        {/* Account Information / Church Details */}
        <button
          type="button"
          className="mobile-settings-item-row"
          onClick={() => {
            if (onEditChurchDetails) {
              onEditChurchDetails()
            } else if (onBack) {
              onBack()
            }
          }}
          style={{ width: '100%', padding: '14px 0', border: 'none', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'transparent', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          id="btn-profile-church-info"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>🏛️</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>Church &amp; Information Unit</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>{account?.account_name || 'DLBC Information Unit'}</div>
            </div>
          </div>
          <span style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '18px' }}>›</span>
        </button>

        {/* Change Password */}
        <button
          type="button"
          className="mobile-settings-item-row"
          onClick={handlePasswordReset}
          disabled={isSendingReset}
          style={{ width: '100%', padding: '14px 0', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          id="btn-profile-change-password"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>🔒</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>Change Password</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                {isSendingReset ? 'Sending reset email...' : 'Send reset link to your email'}
              </div>
            </div>
          </div>
          <span style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '18px' }}>›</span>
        </button>
      </div>

      {/* 4. Sign Out */}
      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        {demoMode ? (
          <button
            type="button"
            className="btn btn--outline"
            onClick={exitDemoMode}
            style={{ width: '100%', height: '44px' }}
            id="btn-profile-exit-demo"
          >
            Exit Demo Mode
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--outline"
            onClick={signOut}
            style={{ width: '100%', height: '44px', color: '#dc2626', borderColor: 'rgba(239, 68, 68, 0.4)' }}
            id="btn-profile-signout"
          >
            Sign Out
          </button>
        )}
      </div>
    </div>
  )
}
