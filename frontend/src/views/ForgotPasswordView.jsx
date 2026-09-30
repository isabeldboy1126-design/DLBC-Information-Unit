import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function ForgotPasswordView({ onSwitchToLogin }) {
  const { resetPassword, error, clearError, authNotice } = useAuth()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [localError, setLocalError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)
    clearError()

    const cleanEmail = email.trim()
    if (!cleanEmail) {
      setLocalError('Please enter your email address.')
      return
    }

    setIsSubmitting(true)
    try {
      await resetPassword(cleanEmail)
      setSent(true)
    } catch (err) {
      setLocalError(err.message || 'Failed to send reset link.')
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
            <div className="auth-brand-text">
              <span className="auth-brand-title">Information Unit</span>
            </div>
          </div>
          <h1 className="auth-title">Reset your password</h1>
        </div>

        {sent ? (
          <div className="auth-form">
            <div className="auth-notice-banner" role="status">
              If an account exists for <strong>{email.trim()}</strong>, a password reset link has been sent. Please check your inbox.
            </div>
            <button
              type="button"
              className="auth-submit-btn"
              onClick={onSwitchToLogin}
            >
              Back to Sign in →
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
              <label htmlFor="auth-forgot-email" className="auth-label">
                Email address
              </label>
              <input
                id="auth-forgot-email"
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@church.org"
                autoComplete="email"
                autoFocus
                required
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send reset link →'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <button
            type="button"
            className="auth-footer-link"
            onClick={onSwitchToLogin}
            disabled={isSubmitting}
          >
            ← Back to Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
