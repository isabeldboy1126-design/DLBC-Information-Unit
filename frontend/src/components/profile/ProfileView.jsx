import React, { useState, useEffect } from 'react'
import { Icon } from '../common/Icon'
import { useAuth } from '../../context/AuthContext'

function formatTerminalLevel(level) {
  switch (level) {
    case 'state_headquarters':
      return 'State Headquarters'
    case 'region_headquarters':
      return 'Region Headquarters'
    case 'old_group_headquarters':
      return 'Old Group Headquarters'
    case 'group_headquarters':
      return 'Group Headquarters'
    case 'district':
      return 'District Church'
    default:
      return level ? level.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'
  }
}

export function ProfileView({ onBack, onEditChurchDetails }) {
  const { user, account, updateDisplayName, demoMode } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState(null)

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

  const roleLabel = demoMode
    ? 'Local Demo Mode'
    : account?.role
    ? account.role.charAt(0).toUpperCase() + account.role.slice(1)
    : 'Owner'

  const sectorDisplay =
    account?.sector === 'Other' && account?.custom_sector
      ? `Other (${account.custom_sector})`
      : account?.sector || '—'

  return (
    <div className="profile-container" id="profile-view">
      <div className="profile-header-bar">
        <div className="profile-header-title-group">
          <h1 className="profile-page-title">Profile &amp; Account</h1>
          <p className="profile-page-subtitle">
            Manage your personal identity and view your Church Information Unit configuration.
          </p>
        </div>
      </div>

      {saveSuccess && (
        <div className="settings-alert settings-alert--success" role="status">
          <span>Display name updated successfully.</span>
        </div>
      )}

      {saveError && (
        <div className="onboarding-error-banner" role="alert">
          <span>{saveError}</span>
        </div>
      )}

      {/* SECTION 1: PERSONAL DETAILS */}
      <div className="settings-card profile-card" id="personal-details-section">
        <div className="settings-card-header">
          <div className="settings-card-title-group">
            <span className="settings-card-icon"><Icon name="user" /></span>
            <div>
              <h2 className="settings-card-title">Personal Details</h2>
              <p className="settings-card-subtitle">
                Your personal identity within the application.
              </p>
            </div>
          </div>
        </div>

        <div className="settings-card-body">
          <form onSubmit={handleSaveDisplayName} className="profile-form">
            <div className="auth-field">
              <label htmlFor="input-profile-display-name" className="auth-label">
                Display Name / Name
              </label>
              <div className="profile-input-save-group">
                <input
                  id="input-profile-display-name"
                  type="text"
                  className="auth-input profile-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  maxLength={100}
                />
                <button
                  type="submit"
                  className="btn btn--primary profile-btn-save"
                  disabled={isSavingName || displayName.trim() === (user?.display_name || '').trim()}
                  id="btn-save-display-name"
                >
                  {isSavingName ? 'Saving...' : 'Save Name'}
                </button>
              </div>
              <span className="profile-field-hint">
                Your personal name for attribution. This does not change the church Information Unit identity.
              </span>
            </div>

            <div className="profile-meta-row">
              <div className="auth-field" style={{ flex: 1 }}>
                <label className="auth-label">
                  Email Address
                  <span className="profile-readonly-badge">Read-only</span>
                </label>
                <input
                  type="text"
                  className="auth-input profile-input profile-input--readonly"
                  value={user?.email || (demoMode ? 'demo@dlbc.org' : '')}
                  readOnly
                  disabled
                  id="profile-email-readonly"
                />
              </div>

              <div className="auth-field" style={{ flex: 1 }}>
                <label className="auth-label">
                  Account Role
                  <span className="profile-readonly-badge">View-only</span>
                </label>
                <input
                  type="text"
                  className="auth-input profile-input profile-input--readonly"
                  value={roleLabel}
                  readOnly
                  disabled
                  id="profile-role-readonly"
                />
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* SECTION 2: CHURCH INFORMATION UNIT */}
      <div className="settings-card profile-card" id="church-unit-section">
        <div className="settings-card-header">
          <div className="settings-card-title-group">
            <span className="settings-card-icon">🏛️</span>
            <div>
              <h2 className="settings-card-title">Church Information Unit</h2>
              <p className="settings-card-subtitle">
                The church unit that scopes all recordings, transcripts, verified reports, and programmes.
              </p>
            </div>
          </div>
        </div>

        <div className="settings-card-body">
          <div className="profile-unit-identity-box">
            <div className="profile-unit-identity-left">
              <span className="profile-unit-badge">Active Unit</span>
              <h3 className="profile-unit-name">
                {account?.account_name || 'DLBC Information Unit'}
              </h3>
              <p className="profile-unit-subtext">
                {[
                  account?.sector,
                  account?.church_state,
                  formatTerminalLevel(account?.terminal_level),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--secondary profile-btn-edit-church"
              onClick={onEditChurchDetails}
              id="btn-edit-church-details"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '6px' }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit church details
            </button>
          </div>

          <div className="profile-hierarchy-grid">
            <div className="profile-hierarchy-item">
              <span className="profile-hierarchy-label">Sector</span>
              <span className="profile-hierarchy-val">{sectorDisplay}</span>
            </div>

            <div className="profile-hierarchy-item">
              <span className="profile-hierarchy-label">Church State</span>
              <span className="profile-hierarchy-val">{account?.church_state || '—'}</span>
            </div>

            <div className="profile-hierarchy-item">
              <span className="profile-hierarchy-label">Region</span>
              <span className="profile-hierarchy-val">{account?.region || '—'}</span>
            </div>

            <div className="profile-hierarchy-item">
              <span className="profile-hierarchy-label">Old Group</span>
              <span className="profile-hierarchy-val">{account?.old_group || '—'}</span>
            </div>

            <div className="profile-hierarchy-item">
              <span className="profile-hierarchy-label">Group</span>
              <span className="profile-hierarchy-val">{account?.group_name || '—'}</span>
            </div>

            <div className="profile-hierarchy-item">
              <span className="profile-hierarchy-label">District</span>
              <span className="profile-hierarchy-val">{account?.district || '—'}</span>
            </div>

            <div className="profile-hierarchy-item profile-hierarchy-item--full">
              <span className="profile-hierarchy-label">Headquarters / Terminal Level</span>
              <span className="profile-hierarchy-val profile-hierarchy-val--highlight">
                {formatTerminalLevel(account?.terminal_level)}
              </span>
            </div>
          </div>

          <div className="profile-edit-note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              Clicking <strong>Edit church details</strong> opens the guided configuration flow with your current answers prefilled. Changes are only applied when you review and confirm on the final step. Exiting at any time leaves current church details unchanged.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
