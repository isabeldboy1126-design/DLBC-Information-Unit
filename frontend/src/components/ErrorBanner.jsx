import React from 'react'

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null

  return (
    <div className="error-banner" role="alert">
      <div className="error-content">
        <span className="error-icon">⚠️</span>
        <div className="error-text">
          <strong>Notice:</strong> {error}
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="error-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}
    </div>
  )
}
