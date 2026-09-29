import React, { useState, useEffect } from 'react'

/**
 * GlobalLoadingOverlay — Restrained page/view loading overlay.
 * Uses three animated blue dots moving cleanly from left to right.
 * Lightly overlays the view with a subtle translucent layer.
 * Includes a ~180ms threshold delay so fast sub-200ms transitions do not flash.
 */
export function GlobalLoadingOverlay({ isVisible, delayMs = 180 }) {
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    let timer = null
    if (isVisible) {
      timer = setTimeout(() => {
        setShouldShow(true)
      }, delayMs)
    } else {
      setShouldShow(false)
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isVisible, delayMs])

  if (!shouldShow) return null

  return (
    <div className="global-loading-overlay" role="status" aria-live="polite" aria-label="Loading content">
      <div className="loading-dots-blue">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
