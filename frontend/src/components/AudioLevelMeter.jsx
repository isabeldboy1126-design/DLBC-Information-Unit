import React from 'react'

export function AudioLevelMeter({ audioLevel, audioDb, hasAudioSignal, isActive }) {
  // Compute color based on level
  const getMeterColor = (level) => {
    if (level > 85) return 'var(--color-danger, #e74c3c)'
    if (level > 60) return 'var(--color-warning, #f39c12)'
    return 'var(--color-success, #2ecc71)'
  }

  return (
    <div className="audio-meter-container">
      <div className="meter-header">
        <span className="meter-title">Input Activity Meter</span>
        <div className="signal-status">
          {isActive ? (
            hasAudioSignal ? (
              <span className="badge badge--success badge--pulse" id="status-audio-detected">
                ● Audio detected
              </span>
            ) : (
              <span className="badge badge--muted" id="status-no-audio">
                ○ No audio detected
              </span>
            )
          ) : (
            <span className="badge badge--muted">Inactive (Click Test or Record)</span>
          )}
        </div>
      </div>

      <div className="meter-track">
        <div
          className="meter-fill"
          style={{
            width: isActive ? `${audioLevel}%` : '0%',
            backgroundColor: getMeterColor(audioLevel),
          }}
        />
      </div>

      <div className="meter-footer">
        <span className="meter-db">Level: {isActive ? `${audioDb} dBFS` : '—'}</span>
        <span className="meter-scale">-60 dB &nbsp; &nbsp; -30 dB &nbsp; &nbsp; -12 dB &nbsp; 0 dB</span>
      </div>
    </div>
  )
}
