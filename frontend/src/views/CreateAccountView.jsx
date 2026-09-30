import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function CreateAccountView({ onSwitchToLogin }) {
  const { signUp, error, clearError, authNotice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)
    clearError()

    const cleanEmail = email.trim()
    if (!cleanEmail || !password || !confirmPassword) {
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
      const result = await signUp(cleanEmail, password)
      if (result.requiresConfirmation) {
        setConfirmationSent(true)
      }
    } catch (err) {
      setLocalError(err.message || 'Account creation failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayedError = localError || error

  if (confirmationSent) {
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
            <h1 className="auth-title">Check your email</h1>
          </div>

          <div className="auth-notice-banner" role="status">
            We have sent a verification link to <strong>{email.trim()}</strong>. Please check your inbox and verify your email to continue.
          </div>

          <div className="auth-footer">
            <button
              type="button"
              className="auth-submit-btn"
              onClick={onSwitchToLogin}
            >
              Back to Sign in →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand">
            <div className="auth-logo-badge">DLBC</div>
            <div className="auth-brand-text">
              <span className="auth-brand-title">Information Unit</span>
              <span className="auth-brand-sub">Report & Session Workspace</span>
            </div>
          </div>
          <h1 className="auth-title">Create church account</h1>
        </div>

        {authNotice && (
          <div className="auth-notice-banner" role="status">
            {authNotice}
          </div>
        )}

        {displayedError && (
          <div className="auth-error-banner" role="alert">
            {displayedError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="auth-signup-email" className="auth-label">
              Email address
            </label>
            <input
              id="auth-signup-email"
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

          <div className="auth-field">
            <label htmlFor="auth-signup-password" className="auth-label">
              Password
            </label>
            <div className="auth-input-wrapper">
              <input
                id="auth-signup-password"
                type={showPassword ? 'text' : 'password'}
                className="auth-input auth-input--with-toggle"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="auth-password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="23" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="auth-signup-confirm-password" className="auth-label">
              Confirm password
            </label>
            <input
              id="auth-signup-confirm-password"
              type={showPassword ? 'text' : 'password'}
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
            id="btn-auth-signup"
          >
            {isSubmitting ? 'Creating account...' : 'Create account →'}
          </button>
        </form>

        <div className="auth-footer">
          <span className="auth-footer-text">Already have an account?</span>{' '}
          <button
            type="button"
            className="auth-footer-link"
            onClick={onSwitchToLogin}
            disabled={isSubmitting}
            id="link-switch-signin"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
