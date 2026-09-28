import React, { useEffect, useRef } from 'react'

/**
 * Global Accessible Confirmation Modal
 *
 * Designed to replace all window.confirm() calls with an accessible, brand-aligned DLBC modal.
 *
 * Props:
 * - isOpen: boolean
 * - onClose / onCancel: () => void
 * - onConfirm: () => Promise<void> | void
 * - title: string
 * - message: string | React.ReactNode
 * - supportingText?: string
 * - confirmLabel?: string (e.g. "Delete Session", "Confirm")
 * - cancelLabel?: string (default "Cancel")
 * - variant?: "danger" | "warning" | "primary" (default "danger")
 * - isLoading?: boolean
 * - icon?: React.ReactNode
 */
export function ConfirmationModal({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title = 'Confirm Action',
  message,
  supportingText,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
  icon,
}) {
  const dialogRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const confirmButtonRef = useRef(null)
  const previousActiveElementRef = useRef(null)

  const handleCancel = () => {
    if (isLoading) return
    if (onCancel) onCancel()
    else if (onClose) onClose()
  }

  const handleConfirm = async () => {
    if (isLoading) return
    if (onConfirm) {
      await onConfirm()
    }
  }

  // Focus management and keyboard navigation
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement

      // Put initial focus on Cancel for safety (especially destructive operations)
      const timer = setTimeout(() => {
        if (cancelButtonRef.current) {
          cancelButtonRef.current.focus()
        }
      }, 50)

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          handleCancel()
          return
        }

        if (e.key === 'Tab') {
          if (!dialogRef.current) return
          const focusable = dialogRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
          const first = focusable[0]
          const last = focusable[focusable.length - 1]

          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault()
              last.focus()
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault()
              first.focus()
            }
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('keydown', handleKeyDown)
        if (previousActiveElementRef.current && previousActiveElementRef.current.focus) {
          try {
            previousActiveElementRef.current.focus()
          } catch {}
        }
      }
    }
  }, [isOpen, isLoading])

  if (!isOpen) return null

  const isDanger = variant === 'danger'

  return (
    <div
      className="confirm-modal-backdrop"
      onClick={handleCancel}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`confirm-modal-container ${isDanger ? 'confirm-modal--danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-body">
          <div className="confirm-modal-icon-wrapper">
            {icon ? (
              icon
            ) : isDanger ? (
              <div className="confirm-icon-danger" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
            ) : (
              <div className="confirm-icon-info" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
            )}
          </div>

          <div className="confirm-modal-content">
            <h2 id="confirm-dialog-title" className="confirm-modal-title">
              {title}
            </h2>
            <div id="confirm-dialog-message" className="confirm-modal-message">
              {message}
            </div>
            {supportingText && (
              <p className="confirm-modal-supporting-text">{supportingText}</p>
            )}
          </div>
        </div>

        <div className="confirm-modal-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="btn-confirm-cancel"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={isDanger ? 'btn-confirm-destructive' : 'btn-confirm-primary'}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="btn-confirm-loading">
                <span className="confirm-spinner" aria-hidden="true" />
                <span>Processing...</span>
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
