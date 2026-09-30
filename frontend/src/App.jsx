import React, { useState, useEffect, useRef } from 'react'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useRecordedTranscription } from './hooks/useRecordedTranscription'
import { useSessions } from './hooks/useSessions'

// Stitch Design Shell & Core Views
import { AppShell } from './components/common/AppShell'
import { DashboardView } from './components/dashboard/DashboardView'
import { NewLiveSessionView } from './components/sessions/NewLiveSessionView'
import { LiveRecordingView } from './components/recording/LiveRecordingView'
import { FloatingRecordingController } from './components/recording/FloatingRecordingController'
import { FloatingProcessController } from './components/common/FloatingProcessController'
import { GlobalLoadingOverlay } from './components/common/GlobalLoadingOverlay'
import { useActiveProcess, expandActiveProcess } from './components/common/activeProcessManager'
import { SessionCompletionView } from './components/sessions/SessionCompletionView'
import { SessionHistoryList } from './components/sessions/SessionHistoryList'
import { SessionDetailView, getCleanSessionName } from './components/sessions/SessionDetailView'
import { SettingsView } from './components/settings/SettingsView'
import { YouTubeSessionView } from './components/youtube/YouTubeSessionView'
import { CompletedReportsView } from './components/reporting/CompletedReportsView'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// File Transcription Components
import { RecordedFileUploader } from './components/transcription/RecordedFileUploader'
import { TranscriptionProgress } from './components/transcription/TranscriptionProgress'
import { RawTranscriptViewer } from './components/transcription/RawTranscriptViewer'
import { TranscriptsHistoryList } from './components/transcription/TranscriptsHistoryList'

import { ErrorBanner } from './components/ErrorBanner'
import './App.css'
import './styles/editorial.css'

function App() {
  const parseRoute = (rawHash) => {
    const clean = (rawHash || '').replace(/^#\/?/, '').trim()
    if (!clean || clean === 'dashboard') {
      return { view: 'dashboard', sessionId: null, stage: null, subAction: null }
    }
    if (clean === 'sessions') {
      return { view: 'sessions', sessionId: null, stage: null, subAction: null }
    }
    if (clean.startsWith('session/')) {
      const parts = clean.split('/')
      return {
        view: 'sessions',
        sessionId: parts[1] || null,
        stage: parts[2] || 'overview',
        subAction: parts[3] || null,
      }
    }
    if (clean.startsWith('completion/')) {
      const parts = clean.split('/')
      return {
        view: 'completion',
        sessionId: parts[1] || null,
        stage: null,
        subAction: null,
      }
    }
    if (clean === 'session_workspace') {
      return { view: 'sessions', sessionId: null, stage: 'overview', subAction: null }
    }
    if (clean === 'verification_workspace') {
      return { view: 'sessions', sessionId: null, stage: 'verification', subAction: null }
    }
    if (['new_live', 'transcribe', 'youtube', 'settings', 'live_recording', 'reports', 'events'].includes(clean)) {
      return { view: clean, sessionId: null, stage: null, subAction: null }
    }
    return { view: 'dashboard', sessionId: null, stage: null, subAction: null }
  }

  // Navigation state initialized from URL hash
  const [currentView, setCurrentView] = useState(() => {
    return parseRoute(typeof window !== 'undefined' ? window.location.hash : '').view
  })
  const [sessionInitialStage, setSessionInitialStage] = useState(() => {
    return parseRoute(typeof window !== 'undefined' ? window.location.hash : '').stage || 'overview'
  })
  const [verificationProcessing, setVerificationProcessing] = useState(() => {
    return parseRoute(typeof window !== 'undefined' ? window.location.hash : '').subAction === 'processing'
  })
  const [isRecorderMinimized, setIsRecorderMinimized] = useState(false)
  const [showCompletionModal, setShowCompletionModal] = useState(() => {
    return parseRoute(typeof window !== 'undefined' ? window.location.hash : '').view === 'completion'
  })
  const [completedSessionId, setCompletedSessionId] = useState(() => {
    return parseRoute(typeof window !== 'undefined' ? window.location.hash : '').sessionId
  })

  const [sessionMetadata, setSessionMetadata] = useState({
    title: 'Sunday Morning Worship Service',
    eventType: 'Sunday Worship Service',
    minister: '',
    messageTitle: '',
  })
  const [sessionSubViewInfo, setSessionSubViewInfo] = useState({
    title: 'Session Workspace',
    onBack: null,
  })
  const [sessionsStatusFilter, setSessionsStatusFilter] = useState('all')
  const scrollPositions = useRef({})

  // Phase 1 & 3: Audio Capture & Live Transcription Hook
  const liveAudio = useAudioCapture()

  // Phase 2: Recorded File Transcription Hook
  const recordedTranscription = useRecordedTranscription()

  // Phase 4: Persistent Church Sessions Hook
  const sessionsHook = useSessions()

  // Global background processing job tracker (Verification & Report Processing)
  const { activeProcess, clearActiveProcess } = useActiveProcess()

  const applyRoute = (rawHash, isPop = false) => {
    const route = parseRoute(rawHash)

    // Restore or reset scroll for .app-content-body
    const cleanTarget = (rawHash || '').replace(/^#\/?/, '').trim() || 'dashboard'
    requestAnimationFrame(() => {
      const scrollEl = document.querySelector('.app-content-body')
      if (scrollEl) {
        if (isPop) {
          scrollEl.scrollTop = scrollPositions.current[cleanTarget] || 0
        } else {
          scrollEl.scrollTop = 0
        }
      }
    })

    if (route.view === 'completion') {
      setShowCompletionModal(true)
      if (route.sessionId) {
        setCompletedSessionId(route.sessionId)
        if (sessionsHook.activeSession?.session_id !== route.sessionId) {
          sessionsHook.loadSession(route.sessionId)
        }
      }
      return
    }

    setShowCompletionModal(false)

    if (route.view === 'sessions') {
      setCurrentView('sessions')
      if (route.sessionId) {
        if (sessionsHook.activeSession?.session_id !== route.sessionId) {
          sessionsHook.loadSession(route.sessionId)
        }
        setSessionInitialStage(route.stage || 'overview')
        setVerificationProcessing(route.subAction === 'processing')
      } else {
        sessionsHook.closeActiveSession()
        setSessionInitialStage('overview')
        setVerificationProcessing(false)
      }
      return
    }

    setCurrentView(route.view)
    sessionsHook.closeActiveSession()
    setSessionInitialStage('overview')
    setVerificationProcessing(false)
  }

  const navigateTo = (targetHash, state = {}) => {
    if (liveAudio.isRecording) {
      const clean = targetHash.replace(/^#\/?/, '')
      if (clean === 'live_recording') {
        setIsRecorderMinimized(false)
        return
      }
      setIsRecorderMinimized(true)
    }

    const cleanTarget = targetHash.replace(/^#\/?/, '')
    const currentClean = window.location.hash.replace(/^#\/?/, '')

    // Record scroll position of current screen before navigating away
    const scrollEl = document.querySelector('.app-content-body')
    if (scrollEl) {
      scrollPositions.current[currentClean || 'dashboard'] = scrollEl.scrollTop
    }

    const currentDepth = (window.history.state && typeof window.history.state.depth === 'number')
      ? window.history.state.depth
      : 0
    const nextDepth = currentDepth + 1

    if (currentClean !== cleanTarget) {
      window.history.pushState({ ...state, depth: nextDepth }, '', '#' + cleanTarget)
    }
    applyRoute('#' + cleanTarget, false)
  }

  const handleInAppBack = () => {
    const currentDepth = (window.history.state && typeof window.history.state.depth === 'number')
      ? window.history.state.depth
      : 0

    if (currentDepth > 0) {
      window.history.back()
    } else {
      // Fallback: If no browser history exists (e.g. user refreshed or opened direct link),
      // safely navigate to the logical parent screen:
      const clean = window.location.hash.replace(/^#\/?/, '').trim()
      if (clean.startsWith('session/')) {
        const parts = clean.split('/')
        const sId = parts[1]
        const stage = parts[2]
        const sub = parts[3]
        if (sub === 'processing') {
          navigateTo(`session/${sId}/verification`)
        } else if (stage && stage !== 'overview') {
          navigateTo(`session/${sId}`)
        } else {
          navigateTo('sessions')
        }
      } else if (clean.startsWith('completion/')) {
        navigateTo('sessions')
      } else if (['sessions', 'new_live', 'transcribe', 'youtube', 'settings'].includes(clean)) {
        navigateTo('dashboard')
      } else {
        navigateTo('dashboard')
      }
    }
  }

  // Handle browser popstate events (browser back, swipe gesture, mobile back)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }

    if (!window.history.state || typeof window.history.state.depth !== 'number') {
      const initialHash = window.location.hash || '#dashboard'
      window.history.replaceState({ depth: 0 }, '', initialHash)
    }

    const onPopState = () => {
      applyRoute(window.location.hash, true)
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Auto-load session if direct URL loaded
  useEffect(() => {
    const route = parseRoute(window.location.hash)
    if (route.sessionId && (!sessionsHook.activeSession || sessionsHook.activeSession.session_id !== route.sessionId)) {
      sessionsHook.loadSession(route.sessionId)
    }
  }, [sessionsHook.sessions])

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
      navigateTo(`completion/${targetId}`)
    } else {
      setShowCompletionModal(true)
    }
  }

  // Navigation Handler for AppShell Sidebar
  const handleNavigate = (view) => {
    if (view === 'sessions') {
      sessionsHook.closeActiveSession()
      sessionsHook.fetchSessions()
      setSessionsStatusFilter('all')
    }
    navigateTo(view)
  }

  // Handle direct file selection from Dashboard dropzone
  const handleDashboardFileSelect = (file) => {
    recordedTranscription.handleFileSelect(file)
    navigateTo('transcribe')
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
      const targetSession =
        sessionsHook.activeSession ||
        sessionsHook.sessions.find((s) => s.session_id === completedSessionId) ||
        sessionsHook.sessions[0]
      return {
        title: getCleanSessionName(targetSession),
        onBack: handleInAppBack,
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
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'transcribe') {
      return {
        title: 'Transcribe Recording File',
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'youtube') {
      return {
        title: 'YouTube Session',
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'settings') {
      return {
        title: 'Settings & Standards',
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'reports') {
      return {
        title: 'Reports',
        onBack: null,
      }
    }
    if (currentView === 'events') {
      return {
        title: 'Events',
        onBack: null,
      }
    }
    if (currentView === 'sessions') {
      const activeOrTarget =
        sessionsHook.activeSession ||
        sessionsHook.sessions.find((s) => s.session_id === completedSessionId)
      if (verificationProcessing) {
        return {
          title: getCleanSessionName(activeOrTarget),
          onBack: handleInAppBack,
        }
      }
      if (sessionsHook.activeSession) {
        return {
          title: sessionSubViewInfo.title || '',
          onBack: handleInAppBack,
        }
      }
      return {
        title: '',
        onBack: handleInAppBack,
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

      <ErrorBoundary onReset={() => navigateTo('dashboard')}>
      {/* Reusable 3-blue-dots loading treatment with ~180ms threshold */}
      <GlobalLoadingOverlay isVisible={sessionsHook.loading && !sessionsHook.activeSession} delayMs={180} />

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
            const targetSession =
              sessionsHook.activeSession ||
              sessionsHook.sessions.find((s) => s.session_id === completedSessionId) ||
              sessionsHook.sessions[0]
            if (targetSession) {
              navigateTo(`session/${targetSession.session_id}/verification`)
            }
          }}
          onGoToReporting={async () => {
            const targetSession =
              sessionsHook.activeSession ||
              sessionsHook.sessions.find((s) => s.session_id === completedSessionId) ||
              sessionsHook.sessions[0]
            if (targetSession) {
              if (targetSession.flag_count === 0 && !targetSession.verified_text) {
                await sessionsHook.confirmRawAsVerified(targetSession.session_id)
              }
              navigateTo(`session/${targetSession.session_id}/report_processing`)
            }
          }}
          onFinishForNow={() => {
            navigateTo('sessions')
          }}
          onViewSessionDetails={() => {
            const targetSession =
              sessionsHook.activeSession ||
              sessionsHook.sessions.find((s) => s.session_id === completedSessionId) ||
              sessionsHook.sessions[0]
            if (targetSession) {
              navigateTo(`session/${targetSession.session_id}`)
            }
          }}
        />
      ) : currentView === 'dashboard' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 1: DASHBOARD                                           */
        /* ----------------------------------------------------------- */
        <DashboardView
          sessions={sessionsHook.sessions.filter(s => !s.is_archived)}
          isLoading={sessionsHook.isListLoading}
          sessionsLoaded={sessionsHook.sessionsLoaded}
          sessionsError={sessionsHook.listError}
          onRefresh={sessionsHook.fetchSessions}
          onStartLiveSession={() => {
            if (liveAudio.isRecording) {
              setIsRecorderMinimized(false)
            } else {
              navigateTo('new_live')
            }
          }}
          onStartYouTubeSession={() => navigateTo('youtube')}
          onOpenSession={(sessionId, initialStage = 'overview') => {
            const activeRecId = liveAudio.latestSession?.session_id || liveAudio.latestRecording?.session_id
            if (liveAudio.isRecording && (sessionId === activeRecId || sessionsHook.sessions.find((s) => s.session_id === sessionId)?.status === 'recording')) {
              setIsRecorderMinimized(false)
              return
            }
            navigateTo(`session/${sessionId}${initialStage && initialStage !== 'overview' ? `/${initialStage}` : ''}`)
          }}
          onViewAllSessions={() => {
            setSessionsStatusFilter('all')
            navigateTo('sessions')
          }}
          onViewNeedsVerification={() => {
            setSessionsStatusFilter('attention')
            navigateTo('sessions')
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
            onBack={handleInAppBack}
          />
        )
      ) : currentView === 'sessions' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 3: SESSIONS HISTORY & WORKSPACE                        */
        /* ----------------------------------------------------------- */
        !sessionsHook.activeSession ? (
          <SessionHistoryList
            sessions={sessionsHook.sessions}
            onOpenSession={(sessionId, initialStage = 'overview') => {
              const activeRecId = liveAudio.latestSession?.session_id || liveAudio.latestRecording?.session_id
              if (liveAudio.isRecording && (sessionId === activeRecId || sessionsHook.sessions.find((s) => s.session_id === sessionId)?.status === 'recording')) {
                setIsRecorderMinimized(false)
                return
              }
              navigateTo(`session/${sessionId}${initialStage && initialStage !== 'overview' ? `/${initialStage}` : ''}`)
            }}
            onDeleteSession={sessionsHook.deleteSession}
            onRestoreSession={sessionsHook.restoreSession}
            onRefresh={sessionsHook.fetchSessions}
            onStartNewSession={() => {
              if (liveAudio.isRecording) {
                setIsRecorderMinimized(false)
              } else {
                navigateTo('new_live')
              }
            }}
            isLoading={sessionsHook.isListLoading}
            sessionsLoaded={sessionsHook.sessionsLoaded}
            sessionsError={sessionsHook.listError}
            initialStatusFilter={sessionsStatusFilter}
          />
        ) : (
          <SessionDetailView
            session={sessionsHook.activeSession}
            initialStage={sessionInitialStage}
            onBack={handleInAppBack}
            onRefreshSession={() => sessionsHook.loadSession(sessionsHook.activeSession.session_id)}
            onUpdateTitle={sessionsHook.updateSessionTitle}
            onUpdateDetails={sessionsHook.updateSessionDetails}
            onSubViewChange={setSessionSubViewInfo}
            verificationState={sessionsHook.verificationState}
            onStartVerification={sessionsHook.startVerification}
            onLoadVerificationState={sessionsHook.loadVerificationState}
            onResolveVerificationItem={sessionsHook.resolveVerificationItem}
            onAddVerificationItem={sessionsHook.addVerificationItem}
            onConfirmAllRemaining={sessionsHook.confirmAllRemaining}
            onFinaliseVerification={sessionsHook.finaliseVerification}
            onConfirmRawAsVerified={sessionsHook.confirmRawAsVerified}
            onNavigateStage={(stage) => {
              const sId = sessionsHook.activeSession?.session_id
              if (!sId) return
              const target = stage && stage !== 'overview' ? `session/${sId}/${stage}` : `session/${sId}`
              navigateTo(target)
            }}
            verificationProcessing={verificationProcessing}
            onTriggerVerificationProcessing={() => {
              const sId = sessionsHook.activeSession?.session_id
              if (!sId) return
              navigateTo(`session/${sId}/verification/processing`)
            }}
            onCloseVerificationProcessing={() => {
              handleInAppBack()
            }}
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
        <SettingsView onBack={handleInAppBack} />
      ) : currentView === 'youtube' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 6: YOUTUBE INGESTION PIPELINE                          */
        /* ----------------------------------------------------------- */
        <YouTubeSessionView
          onBack={handleInAppBack}
          onOpenSession={(sessionId) => {
            navigateTo(`session/${sessionId}`)
          }}
          liveAudio={liveAudio}
          onStartTabCapture={async (meta) => {
            setSessionMetadata(meta)
            setIsRecorderMinimized(false)
            const success = await liveAudio.startTabCapture(meta.title, meta)
            if (success) {
              setIsRecorderMinimized(false)
              navigateTo('live_recording')
            }
            return success
          }}
        />
      ) : currentView === 'reports' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 7: COMPLETED REPORTS ARCHIVE                           */
        /* ----------------------------------------------------------- */
        <CompletedReportsView
          onNavigateSession={(sessionId, stage) => {
            navigateTo(`session/${sessionId}/${stage || 'overview'}`)
          }}
        />
      ) : currentView === 'events' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 8: EVENTS / PROGRAMMES SESSIONS                        */
        /* ----------------------------------------------------------- */
        <SessionHistoryList
          sessions={sessionsHook.sessions}
          isLoading={sessionsHook.isListLoading}
          sessionsLoaded={sessionsHook.sessionsLoaded}
          sessionsError={sessionsHook.listError}
          onRefresh={sessionsHook.fetchSessions}
          onOpenSession={(sessionId) => navigateTo(`session/${sessionId}`)}
          onStartLiveSession={handleStartLiveRecording}
          onOpenTranscribe={() => navigateTo('transcribe')}
          initialFilter="all"
        />
      ) : null}
      </ErrorBoundary>

      {/* ------------------------------------------------------------- */}
      {/* FLOATING PROCESS CONTROLLER: Only visible when explicitly minimized */}
      {/* ------------------------------------------------------------- */}
      {activeProcess && activeProcess.isMinimized && (
        <FloatingProcessController
          jobType={activeProcess.jobType}
          sessionTitle={activeProcess.sessionTitle}
          stageLabel={activeProcess.stageLabel}
          isCompleted={activeProcess.isCompleted}
          onExpand={() => {
            expandActiveProcess()
            if (activeProcess.jobType === 'report_processing') {
              if (activeProcess.isCompleted) {
                navigateTo(`session/${activeProcess.sessionId}/final_report`)
              } else {
                navigateTo(`session/${activeProcess.sessionId}/report_processing`)
              }
            } else if (activeProcess.jobType === 'verification') {
              if (activeProcess.isCompleted) {
                navigateTo(`session/${activeProcess.sessionId}/verified_transcript`)
              } else {
                navigateTo(`session/${activeProcess.sessionId}/verification/processing`)
              }
            }
          }}
          onDismiss={() => clearActiveProcess()}
        />
      )}

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
