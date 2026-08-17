import React, { useState } from 'react'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useRecordedTranscription } from './hooks/useRecordedTranscription'
import { useSessions } from './hooks/useSessions'

// Phase 1 Components (Live Audio Capture)
import { AudioSourceSelector } from './components/AudioSourceSelector'
import { AudioTestPanel } from './components/AudioTestPanel'
import { RecordingControls } from './components/RecordingControls'
import { CompletedRecordingPlayer } from './components/CompletedRecordingPlayer'

// Phase 2 & 3 Components (Transcription)
import { LiveTranscriptPanel } from './components/transcription/LiveTranscriptPanel'
import { RecordedFileUploader } from './components/transcription/RecordedFileUploader'
import { TranscriptionProgress } from './components/transcription/TranscriptionProgress'
import { RawTranscriptViewer } from './components/transcription/RawTranscriptViewer'
import { TranscriptsHistoryList } from './components/transcription/TranscriptsHistoryList'

// Phase 4 Components (Sessions & Persistence)
import { SessionHistoryList } from './components/sessions/SessionHistoryList'
import { SessionDetailView } from './components/sessions/SessionDetailView'

import { ErrorBanner } from './components/ErrorBanner'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('sessions') // 'sessions' | 'live_audio' | 'transcribe'
  const [sessionTitle, setSessionTitle] = useState('')

  // Phase 1 & Phase 3 Hook (Capture + Live Transcription)
  const liveAudio = useAudioCapture()

  // Phase 2 Hook (Recorded File Transcription)
  const recordedTranscription = useRecordedTranscription()

  // Phase 4 Hook (Persistent Sessions)
  const sessionsHook = useSessions()

  // Navigation guard against accidental tab switching during active recording
  const handleTabChange = (newTab) => {
    if (liveAudio.isRecording && newTab !== 'live_audio') {
      if (
        !window.confirm(
          'A live recording is currently active! Leaving this tab will not stop the recording, but we recommend monitoring live status. Proceed anyway?'
        )
      ) {
        return
      }
    }
    setActiveTab(newTab)
    if (newTab === 'sessions') {
      sessionsHook.fetchSessions()
    }
  }

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-dot"></span>
          <div>
            <h1>DLBC Information Unit App</h1>
            <p className="app-tagline">
              Phase 1–4 &middot; Church Service Sessions, Live Audio Capture &amp; Azure Transcription Pipeline
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="nav-tabs-container">
          <div className="nav-tabs">
            <button
              type="button"
              className={`nav-tab ${activeTab === 'sessions' ? 'nav-tab--active' : ''}`}
              onClick={() => handleTabChange('sessions')}
              id="tab-sessions-history"
            >
              📋 Church Service Sessions (Phase 4)
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === 'live_audio' ? 'nav-tab--active' : ''}`}
              onClick={() => handleTabChange('live_audio')}
              id="tab-live-audio"
            >
              🎙️ Live Audio &amp; Live Transcription (Phase 1 &amp; 3)
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === 'transcribe' ? 'nav-tab--active' : ''}`}
              onClick={() => handleTabChange('transcribe')}
              id="tab-transcribe-file"
            >
              📁 Transcribe Recorded Message (Phase 2)
            </button>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Error Banners */}
        {activeTab === 'sessions' && (
          <ErrorBanner error={sessionsHook.error} onDismiss={sessionsHook.clearError} />
        )}
        {activeTab === 'live_audio' && (
          <ErrorBanner error={liveAudio.error} onDismiss={liveAudio.clearError} />
        )}
        {activeTab === 'transcribe' && (
          <ErrorBanner
            error={
              recordedTranscription.error && recordedTranscription.uploadStatus === 'idle'
                ? recordedTranscription.error
                : null
            }
            onDismiss={recordedTranscription.clearError}
          />
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 0: Church Service Sessions (Phase 4)             */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'sessions' && (
          <div className="sessions-tab-layout">
            {!sessionsHook.activeSession ? (
              <SessionHistoryList
                sessions={sessionsHook.sessions}
                onOpenSession={sessionsHook.loadSession}
                onDeleteSession={sessionsHook.deleteSession}
                onRefresh={sessionsHook.fetchSessions}
                isLoading={sessionsHook.isLoading}
              />
            ) : (
              <SessionDetailView
                session={sessionsHook.activeSession}
                onBack={sessionsHook.closeActiveSession}
                onUpdateTitle={sessionsHook.updateSessionTitle}
                verificationState={sessionsHook.verificationState}
                onStartVerification={sessionsHook.startVerification}
                onLoadVerificationState={sessionsHook.loadVerificationState}
                onResolveVerificationItem={sessionsHook.resolveVerificationItem}
                onAddVerificationItem={sessionsHook.addVerificationItem}
                onConfirmAllRemaining={sessionsHook.confirmAllRemaining}
                onFinaliseVerification={sessionsHook.finaliseVerification}
                onConfirmRawAsVerified={sessionsHook.confirmRawAsVerified}
              />
            )}
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 1: Live Audio Capture & Live Transcription       */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'live_audio' && (
          <div
            className={`dashboard-grid ${
              liveAudio.isTranscriptExpanded ? 'dashboard-grid--expanded-transcript' : ''
            }`}
          >
            {!liveAudio.isTranscriptExpanded && (
              <div className="grid-left">
                <AudioSourceSelector
                  devices={liveAudio.devices}
                  selectedDeviceId={liveAudio.selectedDeviceId}
                  onSelectDevice={liveAudio.setSelectedDeviceId}
                  permissionState={liveAudio.permissionState}
                  onRequestPermission={liveAudio.requestPermission}
                  onRefreshDevices={liveAudio.updateDeviceList}
                  trackSettings={liveAudio.trackSettings}
                  disabled={liveAudio.isRecording || liveAudio.isTesting}
                />

                <AudioTestPanel
                  isTesting={liveAudio.isTesting}
                  onStartTest={liveAudio.startAudioTest}
                  onStopTest={liveAudio.stopAudioTest}
                  isRecording={liveAudio.isRecording}
                  audioLevel={liveAudio.audioLevel}
                  audioDb={liveAudio.audioDb}
                  hasAudioSignal={liveAudio.hasAudioSignal}
                  permissionGranted={liveAudio.permissionState === 'granted'}
                />

                <RecordingControls
                  isRecording={liveAudio.isRecording}
                  onStartRecording={(title) => liveAudio.startRecording(title || sessionTitle)}
                  onStopRecording={liveAudio.stopRecording}
                  elapsedTime={liveAudio.elapsedTime}
                  recordingStats={liveAudio.recordingStats}
                  permissionGranted={liveAudio.permissionState === 'granted'}
                  disabled={liveAudio.isTesting}
                  sessionTitle={sessionTitle}
                  setSessionTitle={setSessionTitle}
                />
              </div>
            )}

            <div className={liveAudio.isTranscriptExpanded ? 'grid-full' : 'grid-right'}>
              <LiveTranscriptPanel
                isRecording={liveAudio.isRecording}
                elapsedTime={liveAudio.elapsedTime}
                liveTranscript={liveAudio.liveTranscript}
                isExpanded={liveAudio.isTranscriptExpanded}
                onToggleExpand={() =>
                  liveAudio.setIsTranscriptExpanded(!liveAudio.isTranscriptExpanded)
                }
                onToggleManualFlag={liveAudio.toggleManualFlag}
              />

              {!liveAudio.isTranscriptExpanded && (
                <CompletedRecordingPlayer latestRecording={liveAudio.latestRecording} />
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 2: Recorded File Transcription (Phase 2)         */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'transcribe' && (
          <div className="transcription-layout">
            {!recordedTranscription.activeTranscript ? (
              <div className="dashboard-grid">
                <div className="grid-left">
                  <RecordedFileUploader
                    fileType={recordedTranscription.fileType}
                    setFileType={recordedTranscription.setFileType}
                    selectedFile={recordedTranscription.selectedFile}
                    fileMetadata={recordedTranscription.fileMetadata}
                    onFileSelect={recordedTranscription.handleFileSelect}
                    onStartTranscription={recordedTranscription.startTranscriptionFlow}
                    uploadStatus={recordedTranscription.uploadStatus}
                    configStatus={recordedTranscription.configStatus}
                    selectedProvider={recordedTranscription.selectedProvider}
                    setSelectedProvider={recordedTranscription.setSelectedProvider}
                    disabled={
                      recordedTranscription.uploadStatus === 'uploading' ||
                      recordedTranscription.uploadStatus === 'transcribing'
                    }
                  />

                  <TranscriptionProgress
                    uploadStatus={recordedTranscription.uploadStatus}
                    jobStatus={recordedTranscription.jobStatus}
                    error={recordedTranscription.error}
                    configStatus={recordedTranscription.configStatus}
                    onRetry={recordedTranscription.startTranscriptionFlow}
                  />
                </div>

                <div className="grid-right">
                  <TranscriptsHistoryList
                    transcripts={recordedTranscription.transcriptsList}
                    activeTranscriptId={recordedTranscription.activeTranscript?.transcript_id}
                    onSelectTranscript={recordedTranscription.loadTranscriptById}
                    onRefresh={recordedTranscription.fetchTranscriptsList}
                  />
                </div>
              </div>
            ) : (
              <div className="transcript-fullscreen-view">
                <RawTranscriptViewer
                  transcript={recordedTranscription.activeTranscript}
                  onNewTranscription={recordedTranscription.resetUpload}
                  mediaElementRef={recordedTranscription.mediaElementRef}
                  onJumpToTime={recordedTranscription.jumpToTime}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          Deeper Life Bible Church &middot; Information Unit App &middot; Session Persistence, Live Capture &amp; Azure Transcription Pipeline
        </p>
      </footer>
    </div>
  )
}

export default App

