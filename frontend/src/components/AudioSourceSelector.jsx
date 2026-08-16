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
  // Categorize detected devices into Microphone vs USB Input
  const isUsbDevice = (device) => {
    const label = (device.label || '').toLowerCase()
    return /usb|focusrite|behringer|scarlett|audiobox|mixer|interface|yamaha|line/i.test(label)
  }

  const usbDevices = devices.filter(isUsbDevice)
  const micDevices = devices.filter((d) => !isUsbDevice(d))

  // Determine current active source category label
  const getActiveSourceCategory = () => {
    if (!trackSettings) return 'Microphone'
    const label = (trackSettings.label || '').toLowerCase()
    return /usb|focusrite|behringer|scarlett|audiobox|mixer|interface|yamaha|line/i.test(label)
      ? 'USB Input'
      : 'Microphone'
  }

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
                : 'To discover audio inputs (Microphone, USB Input / mixer interface), please allow microphone access.'}
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
              <label htmlFor="device-select">
                <strong>Audio Source:</strong>
              </label>
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
                    <>
                      {/* Microphone Group */}
                      <optgroup label="Microphone">
                        {micDevices.length > 0 ? (
                          micDevices.map((d, index) => (
                            <option key={d.deviceId || `mic-${index}`} value={d.deviceId}>
                              Microphone — {d.label || `Built-in Device ${index + 1}`}
                            </option>
                          ))
                        ) : (
                          <option disabled value="__mic_none__">Microphone — Not detected</option>
                        )}
                      </optgroup>

                      {/* USB Input Group */}
                      <optgroup label="USB Input">
                        {usbDevices.length > 0 ? (
                          usbDevices.map((d, index) => (
                            <option key={d.deviceId || `usb-${index}`} value={d.deviceId}>
                              USB Input — {d.label || `USB Interface ${index + 1}`}
                            </option>
                          ))
                        ) : (
                          <option disabled value="__usb_none__">USB Input — Not connected</option>
                        )}
                      </optgroup>
                    </>
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
                  <strong>Source Type:</strong> {getActiveSourceCategory()}
                </span>
                <span className="inspector-item">
                  <strong>Detected Device:</strong> {trackSettings.label}
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
