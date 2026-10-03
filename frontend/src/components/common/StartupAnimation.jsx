import React, { useState, useEffect, useRef, useCallback } from 'react'

/**
 * StartupAnimation — Institutional DLBC Startup Construction Sequence
 *
 * Pacing (~4.5s total):
 * 1. Open Bible / line-work foundation: 0.0s – 1.0s
 * 2. Globe / world ministry arcs: 1.0s – 2.0s
 * 3. Radiant cross emerges with soft illumination: 2.0s – 2.8s
 * 4. Outer emblem and church title resolve (dlbc-logo.png): 2.8s – 3.8s
 * 5. Subtitle "Information Unit" softly settles: 3.8s – 4.5s
 * 6. Smooth transition into authenticated workspace: ~4.5s – 4.9s
 *
 * Accessibility & Controls:
 * - Skip button visible from ~0.45s onward
 * - Escape key immediately dismisses
 * - Respects prefers-reduced-motion
 * - Respects dlbc_startup_animation_enabled setting
 */
export function StartupAnimation({ onComplete }) {
  const [showSkip, setShowSkip] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const completedRef = useRef(false)
  const lastTapRef = useRef(0)

  const handleDismiss = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    setIsFadingOut(true)
    setTimeout(() => {
      onComplete?.()
    }, 300)
  }, [onComplete])

  const handlePointerDown = useCallback((e) => {
    if (e.target && e.target.closest && e.target.closest('.dlbc-startup-skip-btn')) {
      return
    }
    const now = Date.now()
    const DOUBLE_TAP_WINDOW = 350
    if (now - lastTapRef.current <= DOUBLE_TAP_WINDOW) {
      handleDismiss()
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }, [handleDismiss])

  useEffect(() => {
    // 1. Check persistent disable setting
    try {
      const enabled = localStorage.getItem('dlbc_startup_animation_enabled')
      if (enabled === 'false') {
        onComplete?.()
        return
      }
    } catch {
      // Fallback: proceed
    }

    // 2. Check prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia) {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (motionQuery.matches) {
        onComplete?.()
        return
      }
    }

    // 3. Reveal skip button at ~0.45s
    const skipTimer = setTimeout(() => {
      setShowSkip(true)
    }, 450)

    // 4. Escape key listener for immediate dismissal
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleDismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    // 5. Normal full sequence completion timer (~4.5s run + fade)
    const completionTimer = setTimeout(() => {
      handleDismiss()
    }, 4500)

    return () => {
      clearTimeout(skipTimer)
      clearTimeout(completionTimer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleDismiss, onComplete])

  return (
    <div
      className={`dlbc-startup-overlay ${isFadingOut ? 'dlbc-startup-overlay--exit' : ''}`}
      role="dialog"
      aria-label="DLBC Information Unit Startup"
      aria-modal="true"
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDismiss}
    >
      {/* Ambient Radial Illumination */}
      <div className="dlbc-startup-ambient-glow" aria-hidden="true" />

      {/* Skip Button */}
      {showSkip && (
        <button
          type="button"
          className="dlbc-startup-skip-btn"
          onClick={handleDismiss}
          aria-label="Skip startup animation"
        >
          Skip ✕
        </button>
      )}

      {/* Main Animation Stage */}
      <div className="dlbc-startup-stage">
        {/* Emblem & SVG Line Construction Container */}
        <div className="dlbc-emblem-container">
          {/* Construction SVG Line-work (Stages 1, 2, 3) */}
          <svg
            className="dlbc-construction-svg"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="dlbcGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="50%" stopColor="#d97706" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
              <radialGradient id="crossAuraGrad" cx="50%" cy="45%" r="50%">
                <stop offset="0%" stopColor="rgba(245, 158, 11, 0.45)" />
                <stop offset="60%" stopColor="rgba(245, 158, 11, 0.1)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>

            {/* Stage 1: Open Bible Foundation Line-work (0.0s - 1.0s) */}
            <g className="dlbc-anim-bible">
              {/* Left page outline */}
              <path
                d="M 100 152 C 82 144, 55 142, 38 148 L 40 168 C 58 162, 85 164, 100 172 Z"
                className="dlbc-stroke-line dlbc-stroke-line--bible"
              />
              {/* Right page outline */}
              <path
                d="M 100 152 C 118 144, 145 142, 162 148 L 160 168 C 142 162, 115 164, 100 172 Z"
                className="dlbc-stroke-line dlbc-stroke-line--bible"
              />
              {/* Center spine */}
              <line
                x1="100"
                y1="150"
                x2="100"
                y2="173"
                className="dlbc-stroke-line dlbc-stroke-line--spine"
              />
              {/* Left page internal text lines */}
              <path d="M 52 153 C 66 149, 82 150, 92 154" className="dlbc-stroke-line dlbc-stroke-line--ribbon" />
              <path d="M 53 160 C 66 156, 82 157, 92 161" className="dlbc-stroke-line dlbc-stroke-line--ribbon" />
              {/* Right page internal text lines */}
              <path d="M 108 154 C 118 150, 134 149, 148 153" className="dlbc-stroke-line dlbc-stroke-line--ribbon" />
              <path d="M 108 161 C 118 157, 134 156, 147 160" className="dlbc-stroke-line dlbc-stroke-line--ribbon" />
            </g>

            {/* Stage 2: Globe Ministry Arcs (1.0s - 2.0s) */}
            <g className="dlbc-anim-globe">
              {/* Globe circle boundary */}
              <circle cx="100" cy="95" r="48" className="dlbc-stroke-line dlbc-stroke-line--globe" />
              {/* Equator arc */}
              <ellipse cx="100" cy="95" rx="48" ry="16" className="dlbc-stroke-line dlbc-stroke-line--globe-arc" />
              {/* Upper latitude arc */}
              <ellipse cx="100" cy="74" rx="42" ry="12" className="dlbc-stroke-line dlbc-stroke-line--globe-arc" />
              {/* Lower latitude arc */}
              <ellipse cx="100" cy="116" rx="42" ry="12" className="dlbc-stroke-line dlbc-stroke-line--globe-arc" />
              {/* Central meridian */}
              <ellipse cx="100" cy="95" rx="20" ry="48" className="dlbc-stroke-line dlbc-stroke-line--globe-arc" />
            </g>

            {/* Stage 3: Radiant Cross & Illumination Rays (2.0s - 2.8s) */}
            <g className="dlbc-anim-cross">
              {/* Soft Radial Aura */}
              <circle cx="100" cy="85" r="45" fill="url(#crossAuraGrad)" className="dlbc-cross-glow" />
              {/* Cross vertical shaft */}
              <line x1="100" y1="46" x2="100" y2="135" className="dlbc-stroke-cross dlbc-stroke-cross--shaft" />
              {/* Cross horizontal beam */}
              <line x1="72" y1="74" x2="128" y2="74" className="dlbc-stroke-cross dlbc-stroke-cross--beam" />
              {/* Radiant light rays */}
              <line x1="100" y1="36" x2="100" y2="28" className="dlbc-stroke-ray" />
              <line x1="100" y1="145" x2="100" y2="153" className="dlbc-stroke-ray" />
              <line x1="62" y1="74" x2="54" y2="74" className="dlbc-stroke-ray" />
              <line x1="138" y1="74" x2="146" y2="74" className="dlbc-stroke-ray" />
              <line x1="78" y1="52" x2="72" y2="46" className="dlbc-stroke-ray" />
              <line x1="122" y1="52" x2="128" y2="46" className="dlbc-stroke-ray" />
              <line x1="78" y1="96" x2="72" y2="102" className="dlbc-stroke-ray" />
              <line x1="122" y1="96" x2="128" y2="102" className="dlbc-stroke-ray" />
            </g>
          </svg>

          {/* Stage 4: Official DLBC Logo Resolution (2.8s - 3.8s) */}
          <div className="dlbc-emblem-image-wrapper">
            <img
              src="/dlbc-logo.png"
              alt="Deeper Life Bible Church Emblem"
              className="dlbc-emblem-img"
            />
            {/* Outer golden resolving ring */}
            <div className="dlbc-emblem-ring" />
          </div>
        </div>

        {/* Stage 4 & 5: Institutional Typography Resolution */}
        <div className="dlbc-startup-text-block">
          <div className="dlbc-church-title">
            DEEPER LIFE BIBLE CHURCH
          </div>
          <div className="dlbc-ministry-title">
            INFORMATION UNIT
          </div>
        </div>
      </div>
    </div>
  )
}
