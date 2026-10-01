import React, { useState, useEffect } from 'react'

/**
 * Format elapsed seconds to HH:MM:SS
 */
function formatElapsed(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
}

/**
 * RemoteControlView
 * Dedicated, restrained multi-device remote control card.
 * Allows observing active recording, issuing remote stop, viewing synchronized
 * verification & AI processing stages, and jumping to view verification/report.
 */
export function RemoteControlView({
  remoteControl,
  onNavigate,
  onBack,
}) {
  const {
    activeRecording,
    activeWorkflow,
    registeredDevices,
    isRemoteStopPending,
    remoteStopMessage,
    requestRemoteStop,
    cancelWorkflowSync,
    deviceUid,
  } = remoteControl

  // Live timer tick calculated from started_at
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!activeRecording?.started_at) {
      setElapsedSeconds(0)
      return
    }

    const startMs = new Date(activeRecording.started_at).getTime()
    const updateTime = () => {
      const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
      setElapsedSeconds(diffSec)
    }

    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [activeRecording?.started_at])

  const ownerDeviceName = activeRecording?.owner_device_name || 'Media Device'
  const isOwner = activeRecording?.owner_device_id === deviceUid

  return (
    <div className="remote-control-container" style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Top Header / Back Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button
          type="button"
          className="btn btn--outline btn--small"
          onClick={onBack}
        >
          ← Back to Dashboard
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="live-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeRecording ? '#10b981' : '#6b7280' }} />
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {activeRecording ? 'Live Session Active' : 'Account Synchronized'}
          </span>
        </div>
      </div>

      {/* Main Remote Card */}
      {activeRecording ? (
        <div className="card" style={{ padding: '28px', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'var(--color-surface-card)' }}>
          {/* Status Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: isRemoteStopPending ? 'rgba(234, 179, 8, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: isRemoteStopPending ? '#eab308' : '#10b981',
                  marginBottom: '8px',
                }}
              >
                {isRemoteStopPending ? 'Stopping Recording...' : 'Live Recording in Progress'}
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '4px 0' }}>
                {activeRecording.session_title || 'Live Worship Service'}
              </h2>
              {activeRecording.minister && (
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                  Minister: {activeRecording.minister}
                </p>
              )}
            </div>

            {/* Device Badge */}
            <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              <div>Host Device</div>
              <strong style={{ color: 'var(--color-text-primary)', display: 'block', marginTop: '2px' }}>
                {ownerDeviceName} {isOwner ? '(This device)' : ''}
              </strong>
            </div>
          </div>

          {/* Large Live Timer */}
          <div style={{ textAlign: 'center', margin: '32px 0', padding: '20px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              Elapsed Duration
            </div>
            <div style={{ fontSize: '42px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.04em', color: 'var(--color-text-primary)' }}>
              {formatElapsed(elapsedSeconds)}
            </div>
          </div>

          {/* Action Area: Stop Button / Stopping Feedback */}
          <div>
            {isRemoteStopPending ? (
              <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(234, 179, 8, 0.08)', borderRadius: '8px', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
                <span className="floating-process-spinner" style={{ marginRight: '8px' }} />
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#fef08a' }}>
                  {remoteStopMessage || `Stopping on ${ownerDeviceName}...`}
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '6px 0 0 0' }}>
                  The host device is finalizing audio and saving the session transcript.
                </p>
              </div>
            ) : isOwner ? (
              <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--color-text-muted)', padding: '12px' }}>
                This device is the recording owner. You can stop recording using the recording controls or the button below.
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--danger"
                style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={requestRemoteStop}
              >
                <span>⏹</span>
                <span>Stop Recording Remotely</span>
              </button>
            )}
          </div>
        </div>
      ) : activeWorkflow ? (
        /* Synchronized Post-Recording Workflow Status */
        <div className="card" style={{ padding: '28px', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'var(--color-surface-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: activeWorkflow.status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: activeWorkflow.status === 'completed' ? '#10b981' : '#60a5fa',
                  marginBottom: '8px',
                }}
              >
                {activeWorkflow.workflow_stage === 'verification'
                  ? 'Verification Stage'
                  : activeWorkflow.workflow_stage === 'ai_processing'
                  ? 'AI Processing Stage'
                  : 'Report Ready'}
              </span>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '4px 0' }}>
                {activeWorkflow.session_title || 'Session Processing'}
              </h2>
            </div>
            <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              <div>Processing Host</div>
              <strong style={{ color: 'var(--color-text-primary)', display: 'block', marginTop: '2px' }}>
                {activeWorkflow.ui_host_device_name || 'Media Laptop'}
              </strong>
            </div>
          </div>

          {/* Workflow Stage Progress */}
          {activeWorkflow.workflow_stage === 'verification' && (
            <div style={{ margin: '24px 0', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {activeWorkflow.message || 'Verification in progress...'}
                </span>
                {activeWorkflow.total_items > 0 && (
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {activeWorkflow.completed_items || 0} of {activeWorkflow.total_items} checked
                  </span>
                )}
              </div>
              {activeWorkflow.total_items > 0 && (
                <div style={{ width: '100%', height: '6px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'var(--color-primary)',
                      width: `${Math.min(100, Math.round(((activeWorkflow.completed_items || 0) / activeWorkflow.total_items) * 100))}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ flex: 1 }}
                  onClick={() => onNavigate(`session/${activeWorkflow.session_id}/verification`)}
                >
                  View verification →
                </button>
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => cancelWorkflowSync(activeWorkflow.session_id, 'verification')}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activeWorkflow.workflow_stage === 'ai_processing' && (
            <div style={{ margin: '24px 0', padding: '20px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <span className="floating-process-spinner" style={{ display: 'inline-block', marginBottom: '12px' }} />
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                AI processing in progress...
              </div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 16px 0' }}>
                {activeWorkflow.message || 'Generating official DLBC report...'}
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => cancelWorkflowSync(activeWorkflow.session_id, 'ai_processing')}
                >
                  Cancel Processing
                </button>
              </div>
            </div>
          )}

          {activeWorkflow.workflow_stage === 'final_report' && (
            <div style={{ margin: '24px 0', padding: '20px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>✓</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#10b981' }}>
                Report ready
              </div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 16px 0' }}>
                The final Information Unit report has been generated and is ready for review.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 600 }}
                onClick={() => onNavigate(`session/${activeWorkflow.session_id}/final_report`)}
              >
                View report →
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Idle / No Active Remote Session State */
        <div className="card text-center" style={{ padding: '40px 20px', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'var(--color-surface-card)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', color: 'var(--color-text-muted)' }}>📡</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
            No Active Remote Recording
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '420px', margin: '0 auto 24px auto', lineHeight: 1.5 }}>
            When a recording is started from another device on this account (such as your Media Laptop), live controls and workflow status will appear here automatically.
          </p>
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={onBack}
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* Registered Account Devices List */}
      <div style={{ marginTop: '28px' }}>
        <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
          Registered Devices ({registeredDevices.length})
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {registeredDevices.map((dev) => {
            const isThisDevice = dev.device_uid === deviceUid
            const isOnline = dev.is_online
            return (
              <div
                key={dev.id || dev.device_uid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border-subtle)',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isOnline ? '#10b981' : '#6b7280',
                    }}
                  />
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {dev.display_name} {isThisDevice ? '(This device)' : ''}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                    {dev.platform || dev.device_type}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {isOnline ? 'Online' : 'Offline'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
