import React, { useState, useEffect } from 'react'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useRecordedTranscription } from './hooks/useRecordedTranscription'
import { useSessions } from './hooks/useSessions'

// Stitch Design Shell & Core Views
import { AppShell } from './components/common/AppShell'
import { DashboardView } from './components/dashboard/DashboardView'
import { NewLiveSessionView } from './components/sessions/NewLiveSessionView'
import { LiveRecordingView } from './components/recording/LiveRecordingView'
import { FloatingRecordingController } from './components/recording/FloatingRecordingController'
import { SessionCompletionView } from './components/sessions/SessionCompletionView'
import { SessionHistoryList } from './components/sessions/SessionHistoryList'
import { SessionDetailView } from './components/sessions/SessionDetailView'
import { SettingsView } from './components/settings/SettingsView'
import { YouTubeSessionView } from './components/youtube/YouTubeSessionView'

// File Transcription Components
import { RecordedFileUploader } from './components/transcription/RecordedFileUploader'
import { TranscriptionProgress } from './components/transcription/TranscriptionProgress'
import { RawTranscriptViewer } from './components/transcription/RawTranscriptViewer'
import { TranscriptsHistoryList } from './components/transcription/TranscriptsHistoryList'

import { ErrorBanner } from './components/ErrorBanner'
import './App.css'

function App() {
  // Read initial view from URL hash if present (e.g. #sessions, #new_live)
  const getInitialView = () => {
    try {
      const hash = window.location.hash.replace('#', '')
      if (hash.startsWith('sessions') || hash === 'session_workspace' || hash === 'verification_workspace') return 'sessions'
      if (['dashboard', 'sessions', 'new_live', 'transcribe', 'youtube', 'settings', 'live_recording'].includes(hash)) {
        return hash
      }
    } catch {}
    return 'dashboard'
  }

  // Navigation: 'dashboard' | 'sessions' | 'new_live' | 'transcribe' | 'youtube' | 'settings' | 'live_recording'
  const [currentView, setCurrentView] = useState(getInitialView)
  const [isRecorderMinimized, setIsRecorderMinimized] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      if (hash.startsWith('sessions') || hash === 'session_workspace' || hash === 'verification_workspace') {
        setCurrentView('sessions')
        return
      }
      if (['dashboard', 'sessions', 'new_live', 'transcribe', 'youtube', 'settings', 'live_recording'].includes(hash)) {
        setCurrentView(hash)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])
  const [sessionMetadata, setSessionMetadata] = useState({
    title: 'Sunday Morning Worship Service',
    eventType: 'Sunday Worship Service',
    minister: '',
    messageTitle: '',
  })
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [completedSessionId, setCompletedSessionId] = useState(null)
  const [sessionSubViewInfo, setSessionSubViewInfo] = useState({
    title: 'Session Workspace',
    onBack: null,
  })
  const [sessionsStatusFilter, setSessionsStatusFilter] = useState('all')

  // Phase 1 & 3: Audio Capture & Live Transcription Hook
  const liveAudio = useAudioCapture()

  // Phase 2: Recorded File Transcription Hook
  const recordedTranscription = useRecordedTranscription()

  // Phase 4: Persistent Church Sessions Hook
  const sessionsHook = useSessions()

  // Auto-load first session when directly loading #session_workspace or #verification_workspace
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash === 'session_workspace' || hash === 'verification_workspace') {
      if (sessionsHook.sessions && sessionsHook.sessions.length > 0 && !sessionsHook.activeSession) {
        sessionsHook.loadSession(sessionsHook.sessions[0].session_id)
      }
    }
  }, [sessionsHook.sessions, sessionsHook.activeSession])

  // Synchronize modal and minimized state when recording starts/stops
  useEffect(() => {
    if (liveAudio.isRecording) {
      setShowCompletionModal(false)
    } else {
      setIsRecorderMinimized(false)
    }
  }, [liveAudio.isRecording])

  // Handle Start Recording from NewLiveSessionView
  const handleStartRecording = async (meta) => {
    setSessionMetadata(meta)
    setIsRecorderMinimized(false)
    const success = await liveAudio.startRecording(meta.title, meta)
    if (success) {
      setIsRecorderMinimized(false)
    }
  }

  // Handle Stop Recording
  const handleStopRecording = async () => {
    setIsRecorderMinimized(false)
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

  // Seamless Navigation Handler allowing background recording in floating mode
  const handleNavigate = (view) => {
    if (liveAudio.isRecording) {
      if (view === 'live_recording') {
        setIsRecorderMinimized(false)
        return
      }
      // Switch to floating recorder mode on navigation to any other section
      setIsRecorderMinimized(true)
    }
    if (view === 'sessions') {
      sessionsHook.closeActiveSession()
      sessionsHook.fetchSessions()
      setSessionsStatusFilter('all')
    }
    setCurrentView(view)
  }

  // Handle direct file selection from Dashboard dropzone
  const handleDashboardFileSelect = (file) => {
    recordedTranscription.handleFileSelect(file)
    setCurrentView('transcribe')
  }

  // Contextual Top Header computation: Screen Title & Back Action
  const getHeaderContext = () => {
    if (liveAudio.isRecording && !isRecorderMinimized) {
      return {
        title: 'Live Session Recording',
        onBack: () => setIsRecorderMinimized(true),
      }
    }
    if (showCompletionModal) {
      return {
        title: 'Session Completion',
        onBack: () => {
          setShowCompletionModal(false)
          setCurrentView('dashboard')
        },
      }
    }
    if (currentView === 'dashboard') {
      return {
        title: 'Dashboard',
        onBack: null,
      }
    }
    if (currentView === 'new_live') {
      return {
        title: 'New Live Recording',
        onBack: () => setCurrentView('dashboard'),
      }
    }
    if (currentView === 'transcribe') {
      return {
        title: 'Transcribe Recording File',
        onBack: () => setCurrentView('dashboard'),
      }
    }
    if (currentView === 'youtube') {
      return {
        title: 'YouTube Session',
        onBack: () => setCurrentView('dashboard'),
      }
    }
    if (currentView === 'settings') {
      return {
        title: 'Settings & Standards',
        onBack: () => setCurrentView('dashboard'),
      }
    }
    if (currentView === 'sessions') {
      if (sessionsHook.activeSession) {
        return {
          title: sessionSubViewInfo.title,
          onBack: sessionSubViewInfo.onBack || (() => sessionsHook.closeActiveSession()),
        }
      }
      return {
        title: '',
        onBack: () => setCurrentView('dashboard'),
      }
    }
    return {
      title: 'Information Unit',
      onBack: null,
    }
  }

  const { title: currentScreenTitle, onBack: currentScreenBack } = getHeaderContext()

  return (
    <AppShell
      activeView={
        showCompletionModal
          ? 'dashboard'
          : liveAudio.isRecording && !isRecorderMinimized
          ? 'live_recording'
          : currentView
      }
      isLiveRecordingActive={liveAudio.isRecording}
      onNavigate={handleNavigate}
      screenTitle={currentScreenTitle}
      onBack={currentScreenBack}
      onStartLiveSession={() => {
        if (liveAudio.isRecording) {
          setIsRecorderMinimized(false)
        } else {
          setCurrentView('new_live')
        }
      }}
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
      {/* VIEW: LIVE RECORDING ACTIVE (Full Screen Mode)               */}
      {/* ------------------------------------------------------------- */}
      {liveAudio.isRecording && !isRecorderMinimized ? (
        <LiveRecordingView
          sessionMetadata={sessionMetadata}
          elapsedTime={liveAudio.elapsedTime}
          liveTranscript={liveAudio.liveTranscript}
          audioLevel={liveAudio.audioLevel}
          hasAudioSignal={liveAudio.hasAudioSignal}
          onMinimize={() => setIsRecorderMinimized(true)}
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
          onGoToReporting={async () => {
            setShowCompletionModal(false)
            const targetSession =
              sessionsHook.activeSession ||
              sessionsHook.sessions.find((s) => s.session_id === completedSessionId) ||
              sessionsHook.sessions[0]
            if (targetSession) {
              if (targetSession.flag_count === 0 && !targetSession.verified_text) {
                await sessionsHook.confirmRawAsVerified(targetSession.session_id)
              }
              await sessionsHook.loadSession(targetSession.session_id)
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
          onStartLiveSession={() => {
            if (liveAudio.isRecording) {
              setIsRecorderMinimized(false)
            } else {
              setCurrentView('new_live')
            }
          }}
          onStartYouTubeSession={() => setCurrentView('youtube')}
          onOpenSession={(sessionId) => {
            const activeRecId = liveAudio.latestSession?.session_id || liveAudio.latestRecording?.session_id
            if (liveAudio.isRecording && (sessionId === activeRecId || sessionsHook.sessions.find((s) => s.session_id === sessionId)?.status === 'recording')) {
              setIsRecorderMinimized(false)
              return
            }
            sessionsHook.loadSession(sessionId)
            setCurrentView('sessions')
          }}
          onViewAllSessions={() => {
            sessionsHook.closeActiveSession()
            setSessionsStatusFilter('all')
            setCurrentView('sessions')
          }}
          onViewNeedsVerification={() => {
            sessionsHook.closeActiveSession()
            setSessionsStatusFilter('needs_verification')
            setCurrentView('sessions')
          }}
          onFileSelect={handleDashboardFileSelect}
        />
      ) : currentView === 'new_live' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 2: NEW LIVE SESSION SETUP                              */
        /* ----------------------------------------------------------- */
        liveAudio.isRecording ? (
          <div className="card text-center p-4">
            <h3>Live Recording in Progress</h3>
            <p>An active recording is already running in the background.</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setIsRecorderMinimized(false)}
            >
              Open Active Recorder
            </button>
          </div>
        ) : (
          <NewLiveSessionView
            liveAudio={liveAudio}
            onStartRecording={handleStartRecording}
            onBack={() => setCurrentView('dashboard')}
          />
        )
      ) : currentView === 'sessions' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 3: SESSIONS HISTORY & WORKSPACE                        */
        /* ----------------------------------------------------------- */
        !sessionsHook.activeSession ? (
          <SessionHistoryList
            sessions={sessionsHook.sessions}
            onOpenSession={(sessionId) => {
              const activeRecId = liveAudio.latestSession?.session_id || liveAudio.latestRecording?.session_id
              if (liveAudio.isRecording && (sessionId === activeRecId || sessionsHook.sessions.find((s) => s.session_id === sessionId)?.status === 'recording')) {
                setIsRecorderMinimized(false)
                return
              }
              sessionsHook.loadSession(sessionId)
            }}
            onDeleteSession={sessionsHook.deleteSession}
            onRefresh={sessionsHook.fetchSessions}
            onStartNewSession={() => {
              if (liveAudio.isRecording) {
                setIsRecorderMinimized(false)
              } else {
                setCurrentView('new_live')
              }
            }}
            isLoading={sessionsHook.isLoading}
            initialStatusFilter={sessionsStatusFilter}
          />
        ) : (
          <SessionDetailView
            session={sessionsHook.activeSession}
            onBack={sessionsHook.closeActiveSession}
            onUpdateTitle={sessionsHook.updateSessionTitle}
            onSubViewChange={setSessionSubViewInfo}
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
      ) : currentView === 'youtube' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 6: YOUTUBE INGESTION PIPELINE                          */
        /* ----------------------------------------------------------- */
        <YouTubeSessionView
          onBack={() => setCurrentView('dashboard')}
          onOpenSession={(sessionId) => {
            sessionsHook.loadSession(sessionId)
            setCurrentView('sessions')
          }}
          liveAudio={liveAudio}
          onStartTabCapture={async (meta) => {
            setSessionMetadata(meta)
            setIsRecorderMinimized(false)
            const success = await liveAudio.startTabCapture(meta.title, meta)
            if (success) {
              setIsRecorderMinimized(false)
              setCurrentView('live_recording')
            }
            return success
          }}
        />
      ) : null}

      {/* ------------------------------------------------------------- */}
      {/* FLOATING CONTROLLER: Persistent across all app views when min */}
      {/* ------------------------------------------------------------- */}
      {liveAudio.isRecording && isRecorderMinimized && (
        <FloatingRecordingController
          sessionMetadata={sessionMetadata}
          elapsedTime={liveAudio.elapsedTime}
          liveTranscript={liveAudio.liveTranscript}
          audioLevel={liveAudio.audioLevel}
          hasAudioSignal={liveAudio.hasAudioSignal}
          onMaximize={() => setIsRecorderMinimized(false)}
          onStopRecording={handleStopRecording}
        />
      )}
    </AppShell>
  )
}

export default App
