import React, { useState } from 'react';

/**
 * Recording Close Confirmation Modal
 * Protects active recordings when user attempts to close the Windows desktop window.
 */
export function CloseRecordingModal({ isOpen, onKeepRecording, onStopAndClose }) {
  const [isFinalizing, setIsFinalizing] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsFinalizing(true);
    try {
      await onStopAndClose();
    } catch (err) {
      console.error('[CloseRecordingModal] Error finalizing before exit:', err);
      setIsFinalizing(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(4px)',
    }}>
      <div className="modal-card" style={{
        background: '#121214',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '440px',
        width: '90%',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
        color: '#f0f0f2',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
          }}>
            🔴
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Recording in progress</h3>
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>Active session protection</span>
          </div>
        </div>

        <p style={{ margin: '0 0 24px 0', fontSize: '14px', lineHeight: '1.5', color: '#d1d5db' }}>
          Closing the application will stop the active recording.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onKeepRecording}
            disabled={isFinalizing}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: isFinalizing ? 'not-allowed' : 'pointer',
              background: '#27272a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
            }}
          >
            Keep recording
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleConfirm}
            disabled={isFinalizing}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: isFinalizing ? 'not-allowed' : 'pointer',
              backgroundColor: '#ef4444',
              borderColor: '#ef4444',
              color: '#ffffff',
              fontWeight: 500,
            }}
          >
            {isFinalizing ? 'Finalizing & closing...' : 'Stop and close'}
          </button>
        </div>
      </div>
    </div>
  );
}
