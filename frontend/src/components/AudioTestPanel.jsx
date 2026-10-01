import React from 'react'
import { AudioLevelMeter } from './AudioLevelMeter'

export function AudioTestPanel({
  isTesting,
  onStartTest,
  onStopTest,
  isRecording,
  audioLevel,
  audioDb,
  hasAudioSignal,
  permissionGranted,
}) {
  return (
    <div className="card audio-test-panel">
      <div className="card-header">
        <h3>2. Input Verification & Audio Test</h3>
        <span className="card-subtitle">
          Verify that sound is reaching the application before recording
        </span>
      </div>

      <div className="card-body">
        <AudioLevelMeter
          audioLevel={audioLevel}
          audioDb={audioDb}
          hasAudioSignal={hasAudioSignal}
          isActive={isTesting || isRecording}
        />

        <div className="test-actions">
          {!isTesting ? (
            <button
              type="button"
              className="btn btn--outline"
              onClick={onStartTest}
              disabled={!permissionGranted || isRecording}
              id="btn-start-test"
            >
               Start Audio Test (Pre-check)
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--warning"
              onClick={onStopTest}
              id="btn-stop-test"
            >
              ⏹ Stop Audio Test
            </button>
          )}

          <p className="hint-text">
            {isTesting
              ? 'Speak into the microphone or play audio from your mixer. The level bar should respond.'
              : 'Testing audio checks live microphone levels without saving files to disk.'}
          </p>
        </div>
      </div>
    </div>
  )
}
