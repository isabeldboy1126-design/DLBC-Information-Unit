import React from 'react'

export function AudioSourceSelector({
  devices,
  selectedDeviceId,
  onSelectDevice,
  permissionState,
  onRequestPermission,
  onRefreshDevices,
  trackSettings,
  disabled,
}) {
  return (
    <div className="card audio-source-selector">
      <div className="card-header">
        <h3>1. Audio Source Selection</h3>
        <div className="permission-badge">
          {permissionState === 'granted' && (
            <span className="badge badge--success">✓ Mic Permission Granted</span>
          )}
          {permissionState === 'prompt' && (
            <span className="badge badge--warning">⚠ Permission Required</span>
          )}
          {permissionState === 'denied' && (
            <span className="badge badge--danger">✕ Permission Denied</span>
          )}
        </div>
      </div>

      <div className="card-body">
        {permissionState !== 'granted' ? (
          <div className="permission-prompt">
            <p>
              {permissionState === 'denied'
                ? 'Microphone access is currently blocked in your browser settings. Please enable microphone permission in your browser address bar (site settings) and re-check.'
                : 'To discover audio inputs (laptop microphone, USB interfaces, mixers), please allow microphone access.'}
            </p>
            <button
              type="button"
              className={permissionState === 'denied' ? 'btn btn--secondary' : 'btn btn--primary'}
              onClick={onRequestPermission}
              id="btn-request-permission"
            >
              {permissionState === 'denied'
                ? '↻ Re-check Microphone Permission'
                : 'Grant Microphone Access'}
            </button>
          </div>
        ) : (
          <div className="device-selection-controls">
            <div className="form-group">
              <label htmlFor="device-select">Available Audio Input Devices:</label>
              <div className="select-row">
                <select
                  id="device-select"
                  className="form-control"
                  value={selectedDeviceId}
                  onChange={(e) => onSelectDevice(e.target.value)}
                  disabled={disabled}
                >
                  {devices.length === 0 ? (
                    <option value="">No audio input devices detected</option>
                  ) : (
                    devices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>
                        {device.label || `Audio Input ${index + 1}`}
                      </option>
                    ))
                  )}
                </select>

                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={onRefreshDevices}
                  disabled={disabled}
                  title="Rescan connected audio devices"
                >
                  ↻ Rescan
                </button>
              </div>
            </div>

            {trackSettings && (
              <div className="device-inspector">
                <span className="inspector-item">
                  <strong>Device:</strong> {trackSettings.label}
                </span>
                <span className="inspector-item">
                  <strong>Hardware Sample Rate:</strong> {trackSettings.sampleRate} Hz
                </span>
                <span className="inspector-item">
                  <strong>Channels:</strong> {trackSettings.channelCount} (Mono stream)
                </span>
                <span className="inspector-item">
                  <strong>Raw Feed:</strong>{' '}
                  {!trackSettings.echoCancellation && !trackSettings.noiseSuppression
                    ? 'Unprocessed (Lossless)'
                    : 'Browser Filtered'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
