import React, { useState, useEffect } from 'react'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useRecordedTranscription } from './hooks/useRecordedTranscription'
import { useSessions } from './hooks/useSessions'

// Stitch Design Shell & Core Views
import { AppShell } from './components/common/AppShell'
import { DashboardView } from './components/dashboard/DashboardView'
import { NewLiveSessionView } from './components/sessions/NewLiveSessionView'
import { LiveRecordingView } from './components/recording/LiveRecordingView'
import { SessionCompletionView } from './components/sessions/SessionCompletionView'
import { SessionHistoryList } from './components/sessions/SessionHistoryList'
import { SessionDetailView } from './components/sessions/SessionDetailView'
import { SettingsView } from './components/settings/SettingsView'

// File Transcription Components
import { RecordedFileUploader } from './components/transcription/RecordedFileUploader'
import { TranscriptionProgress } from './components/transcription/TranscriptionProgress'
import { RawTranscriptViewer } from './components/transcription/RawTranscriptViewer'
import { TranscriptsHistoryList } from './components/transcription/TranscriptsHistoryList'

import { ErrorBanner } from './components/ErrorBanner'
import './App.css'

function App() {
  // Navigation: 'dashboard' | 'sessions' | 'new_live' | 'transcribe' | 'settings'
  const [currentView, setCurrentView] = useState('dashboard')
  const [sessionMetadata, setSessionMetadata] = useState({
    title: 'Sunday Morning Worship Service',
    eventType: 'Sunday Worship Service',
    minister: '',
    messageTitle: '',
  })
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [completedSessionId, setCompletedSessionId] = useState(null)
  const [globalSearch, setGlobalSearch] = useState('')

  // Phase 1 & 3: Audio Capture & Live Transcription Hook
  const liveAudio = useAudioCapture()

  // Phase 2: Recorded File Transcription Hook
  const recordedTranscription = useRecordedTranscription()

  // Phase 4: Persistent Church Sessions Hook
  const sessionsHook = useSessions()

  // Auto-switch to live_recording when recording starts
  useEffect(() => {
    if (liveAudio.isRecording) {
      setShowCompletionModal(false)
    }
  }, [liveAudio.isRecording])

  // Handle Start Recording from NewLiveSessionView
  const handleStartRecording = async (meta) => {
    setSessionMetadata(meta)
    const success = await liveAudio.startRecording(meta.title)
    if (success) {
      // isRecording becomes true, rendering LiveRecordingView
    }
  }

  // Handle Stop Recording
  const handleStopRecording = async () => {
    const recordingResult = await liveAudio.stopRecording()
    await sessionsHook.fetchSessions()
    const targetId =
      recordingResult?.session_id ||
      recordingResult?.session?.session_id ||
      liveAudio.latestSession?.session_id ||
      liveAudio.latestRecording?.session_id
    if (targetId) {
      setCompletedSessionId(targetId)
      await sessionsHook.loadSession(targetId)
    }
    setShowCompletionModal(true)
  }

  // Navigation Guard for active recording
  const handleNavigate = (view) => {
    if (liveAudio.isRecording && view !== 'live_recording') {
      if (
        !window.confirm(
          'A live recording is currently active! Leaving this screen will not stop the recording, but we recommend monitoring live status. Proceed anyway?'
        )
      ) {
        return
      }
    }
    if (view === 'sessions') {
      sessionsHook.closeActiveSession()
      sessionsHook.fetchSessions()
    }
    setCurrentView(view)
  }

  // Handle direct file selection from Dashboard dropzone
  const handleDashboardFileSelect = (file) => {
    recordedTranscription.handleFileSelect(file)
    setCurrentView('transcribe')
  }

  // Build Breadcrumbs
  const getBreadcrumbs = () => {
    if (liveAudio.isRecording) {
      return [{ label: 'Live Session Recording' }]
    }
    if (currentView === 'dashboard') {
      return [{ label: 'Dashboard' }]
    }
    if (currentView === 'new_live') {
      return [
        { label: 'Dashboard', onClick: () => handleNavigate('dashboard') },
        { label: 'New Live Session' },
      ]
    }
    if (currentView === 'sessions') {
      if (sessionsHook.activeSession) {
        return [
          { label: 'Dashboard', onClick: () => handleNavigate('dashboard') },
          { label: 'Sessions', onClick: () => sessionsHook.closeActiveSession() },
          { label: sessionsHook.activeSession.title || 'Session Workspace' },
        ]
      }
      return [
        { label: 'Dashboard', onClick: () => handleNavigate('dashboard') },
        { label: 'Sessions History' },
      ]
    }
    if (currentView === 'transcribe') {
      return [
        { label: 'Dashboard', onClick: () => handleNavigate('dashboard') },
        { label: 'Transcribe Recording' },
      ]
    }
    if (currentView === 'settings') {
      return [
        { label: 'Dashboard', onClick: () => handleNavigate('dashboard') },
        { label: 'Settings & Standards' },
      ]
    }
    return []
  }

  return (
    <AppShell
      activeNav={
        liveAudio.isRecording
          ? 'live_session'
          : currentView === 'new_live'
          ? 'live_session'
          : currentView
      }
      onNavigate={handleNavigate}
      breadcrumbs={getBreadcrumbs()}
      onStartLiveSession={() => {
        if (!liveAudio.isRecording) {
          setCurrentView('new_live')
        }
      }}
      searchTerm={globalSearch}
      onSearchChange={setGlobalSearch}
    >
      {/* Global Error Banners */}
      {sessionsHook.error && (
        <ErrorBanner error={sessionsHook.error} onDismiss={sessionsHook.clearError} />
      )}
      {liveAudio.error && (
        <ErrorBanner error={liveAudio.error} onDismiss={liveAudio.clearError} />
      )}
      {recordedTranscription.error && recordedTranscription.uploadStatus === 'idle' && (
        <ErrorBanner
          error={recordedTranscription.error}
          onDismiss={recordedTranscription.clearError}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW: LIVE RECORDING ACTIVE (Overrides when recording)        */}
      {/* ------------------------------------------------------------- */}
      {liveAudio.isRecording ? (
        <LiveRecordingView
          sessionMetadata={sessionMetadata}
          elapsedTime={liveAudio.elapsedTime}
          liveTranscript={liveAudio.liveTranscript}
          audioLevel={liveAudio.audioLevel}
          hasAudioSignal={liveAudio.hasAudioSignal}
          onStopRecording={handleStopRecording}
          onToggleManualFlag={liveAudio.toggleManualFlag}
        />
      ) : showCompletionModal ? (
        /* ----------------------------------------------------------- */
        /* VIEW: SESSION COMPLETION MODAL                              */
        /* ----------------------------------------------------------- */
        <SessionCompletionView
          session={
            sessionsHook.activeSession ||
            sessionsHook.sessions.find((s) => s.session_id === completedSessionId) ||
            sessionsHook.sessions[0]
          }
          latestRecording={liveAudio.latestRecording}
          onBeginVerification={() => {
            setShowCompletionModal(false)
            const targetSession =
              sessionsHook.activeSession ||
              sessionsHook.sessions.find((s) => s.session_id === completedSessionId) ||
              sessionsHook.sessions[0]
            if (targetSession) {
              sessionsHook.loadSession(targetSession.session_id)
              setCurrentView('sessions')
            }
          }}
          onFinishForNow={() => {
            setShowCompletionModal(false)
            setCurrentView('dashboard')
            sessionsHook.fetchSessions()
          }}
          onViewSessionDetails={() => {
            setShowCompletionModal(false)
            const targetSession =
              sessionsHook.activeSession ||
              sessionsHook.sessions.find((s) => s.session_id === completedSessionId) ||
              sessionsHook.sessions[0]
            if (targetSession) {
              sessionsHook.loadSession(targetSession.session_id)
            }
            setCurrentView('sessions')
          }}
        />
      ) : currentView === 'dashboard' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 1: DASHBOARD                                           */
        /* ----------------------------------------------------------- */
        <DashboardView
          sessions={sessionsHook.sessions}
          onStartLiveSession={() => setCurrentView('new_live')}
          onOpenSession={(sessionId) => {
            sessionsHook.loadSession(sessionId)
            setCurrentView('sessions')
          }}
          onViewAllSessions={() => {
            sessionsHook.closeActiveSession()
            setCurrentView('sessions')
          }}
          onFileSelect={handleDashboardFileSelect}
        />
      ) : currentView === 'new_live' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 2: NEW LIVE SESSION SETUP                              */
        /* ----------------------------------------------------------- */
        <NewLiveSessionView
          liveAudio={liveAudio}
          onStartRecording={handleStartRecording}
          onBack={() => setCurrentView('dashboard')}
        />
      ) : currentView === 'sessions' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 3: SESSIONS HISTORY & WORKSPACE                        */
        /* ----------------------------------------------------------- */
        !sessionsHook.activeSession ? (
          <SessionHistoryList
            sessions={sessionsHook.sessions}
            onOpenSession={(sessionId) => {
              sessionsHook.loadSession(sessionId)
            }}
            onDeleteSession={sessionsHook.deleteSession}
            onRefresh={sessionsHook.fetchSessions}
            onStartNewSession={() => setCurrentView('new_live')}
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
        )
      ) : currentView === 'transcribe' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 4: FILE TRANSCRIBE PIPELINE                            */
        /* ----------------------------------------------------------- */
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
      ) : currentView === 'settings' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 5: SETTINGS & STANDARDS                                */
        /* ----------------------------------------------------------- */
        <SettingsView onBack={() => handleNavigate('dashboard')} />
      ) : null}
    </AppShell>
  )
}

export default App
