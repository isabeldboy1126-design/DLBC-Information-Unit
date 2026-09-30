import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function ResetPasswordView({ onComplete }) {
  const { updatePassword, error, clearError } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)
    clearError()

    if (!password || !confirmPassword) {
      setLocalError('All fields are required.')
      return
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      await updatePassword(password)
      setSuccess(true)
    } catch (err) {
      setLocalError(err.message || 'Failed to update password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand">
            <div className="auth-logo-badge">DLBC</div>
            <div className="auth-brand-title">Information Unit</div>
          </div>
          <h1 className="auth-title">Set new password</h1>
        </div>

        {success ? (
          <div className="auth-form">
            <div className="auth-notice-banner" role="status">
              Your password has been successfully updated.
            </div>
            <button
              type="button"
              className="auth-submit-btn"
              onClick={onComplete}
            >
              Continue to Workspace →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {(localError || error) && (
              <div className="auth-error-banner" role="alert">
                {localError || error}
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-new-password" className="auth-label">
                New password
              </label>
              <input
                id="auth-new-password"
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                autoFocus
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="auth-confirm-new-password" className="auth-label">
                Confirm new password
              </label>
              <input
                id="auth-confirm-new-password"
                type="password"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating...' : 'Update password →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
