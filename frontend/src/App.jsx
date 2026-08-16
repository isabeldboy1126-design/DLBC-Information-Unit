import React from 'react'
import { useAudioCapture } from './hooks/useAudioCapture'
import { AudioSourceSelector } from './components/AudioSourceSelector'
import { AudioTestPanel } from './components/AudioTestPanel'
import { RecordingControls } from './components/RecordingControls'
import { CompletedRecordingPlayer } from './components/CompletedRecordingPlayer'
import { ErrorBanner } from './components/ErrorBanner'
import './App.css'

function App() {
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    permissionState,
    requestPermission,
    updateDeviceList,
    trackSettings,
    isTesting,
    startAudioTest,
    stopAudioTest,
    isRecording,
    startRecording,
    stopRecording,
    elapsedTime,
    recordingStats,
    latestRecording,
    audioLevel,
    audioDb,
    hasAudioSignal,
    error,
    clearError,
  } = useAudioCapture()

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-dot"></span>
          <div>
            <h1>DLBC Information Unit App</h1>
            <p className="app-tagline">
              Phase 1 &middot; Audio Capture Lab &middot; Lossless PCM/WAV Master Pipeline
            </p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <ErrorBanner error={error} onDismiss={clearError} />

        <div className="dashboard-grid">
          <div className="grid-left">
            <AudioSourceSelector
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={setSelectedDeviceId}
              permissionState={permissionState}
              onRequestPermission={requestPermission}
              onRefreshDevices={updateDeviceList}
              trackSettings={trackSettings}
              disabled={isRecording || isTesting}
            />

            <AudioTestPanel
              isTesting={isTesting}
              onStartTest={startAudioTest}
              onStopTest={stopAudioTest}
              isRecording={isRecording}
              audioLevel={audioLevel}
              audioDb={audioDb}
              hasAudioSignal={hasAudioSignal}
              permissionGranted={permissionState === 'granted'}
            />

            <RecordingControls
              isRecording={isRecording}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              elapsedTime={elapsedTime}
              recordingStats={recordingStats}
              permissionGranted={permissionState === 'granted'}
              disabled={isTesting}
            />
          </div>

          <div className="grid-right">
            <CompletedRecordingPlayer latestRecording={latestRecording} />
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Deeper Life Bible Church &middot; Information Unit &middot; Audio Capture Engine v1.0 &middot;
          Lossless 16-bit PCM Progressive Preservation
        </p>
      </footer>
    </div>
  )
}

export default App
