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
import { useActiveProcess, expandActiveProcess } from './components/common/activeProcessManager'
import { SessionCompletionView } from './components/sessions/SessionCompletionView'
import { SessionHistoryList } from './components/sessions/SessionHistoryList'
import { SessionDetailView, getCleanSessionName } from './components/sessions/SessionDetailView'
import { SessionDetailSkeleton } from './components/sessions/SessionDetailSkeleton'
import { AutomaticProcessingView } from './components/processing/AutomaticProcessingView'
import { DesktopUploadRecordingView } from './components/transcription/DesktopUploadRecordingView'
import { SettingsView } from './components/settings/SettingsView'
import { YouTubeSessionView } from './components/youtube/YouTubeSessionView'
import { CompletedReportsView } from './components/reporting/CompletedReportsView'
import { WorkspaceView } from './components/workspace/WorkspaceView'
import { MediaView } from './components/media/MediaView'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { StartupAnimation } from './components/common/StartupAnimation'

// File Transcription Components
import { RecordedFileUploader } from './components/transcription/RecordedFileUploader'
import { TranscriptionProgress } from './components/transcription/TranscriptionProgress'
import { RawTranscriptViewer } from './components/transcription/RawTranscriptViewer'
import { TranscriptsHistoryList } from './components/transcription/TranscriptsHistoryList'

import { ErrorBanner } from './components/ErrorBanner'
import { useAuth } from './context/AuthContext'
import { LoginView } from './views/LoginView'
import { CreateAccountView } from './views/CreateAccountView'
import { ForgotPasswordView } from './views/ForgotPasswordView'
import { ResetPasswordView } from './views/ResetPasswordView'
import { OnboardingView } from './views/OnboardingView'
import { ProfileView } from './components/profile/ProfileView'
import { useRemoteControl } from './hooks/useRemoteControl'
import { RemoteControlView } from './components/remote/RemoteControlView'
import { DownloadView } from './views/DownloadView'
import { PublicMediaUploadView } from './views/PublicMediaUploadView'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { CloseRecordingModal } from './components/common/CloseRecordingModal'
import { setupWindowCloseProtection, forceExitApplication } from './services/desktopPlatform'
import './App.css'

function App() {
  const getActiveRoute = () => {
    if (typeof window === 'undefined') return ''
    const p = (window.location.pathname || '').replace(/\/+$/, '')
    if (p === '/download' || p.endsWith('/download')) return 'download'
    const h = (window.location.hash || '').replace(/^#\/?/, '').trim()
    if (h) return h
    if (p && p !== '/') return p.replace(/^\//, '')
    return ''
  }

  const parseRoute = (rawRoute) => {
    const clean = (rawRoute || '').replace(/^#\/?/, '').replace(/^\//, '').replace(/\/+$/, '').trim()
    if (
      clean === 'download' ||
      (typeof window !== 'undefined' && (
        window.location.pathname === '/download' ||
        window.location.pathname === '/download/' ||
        window.location.pathname.endsWith('/download') ||
        window.location.hash === '#download' ||
        window.location.hash === '#/download'
      ))
    ) {
      return { view: 'download', sessionId: null, stage: null, subAction: null }
    }
    if (!clean || clean === 'dashboard') {
      return { view: 'dashboard', sessionId: null, stage: null, subAction: null }
    }
    if (clean === 'sessions') {
      return { view: 'sessions', sessionId: null, stage: null, subAction: null }
    }
    if (clean.startsWith('media/upload/')) {
      const parts = clean.split('/')
      return {
        view: 'media_upload',
        token: parts[2] || null,
        sessionId: null,
        stage: null,
        subAction: null,
      }
    }
    if (clean.startsWith('workspace/')) {
      const parts = clean.split('/')
      return {
        view: 'workspace',
        sessionId: parts[1] || null,
        stage: 'final_report',
        subAction: null,
      }
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
    if (clean.startsWith('processing/')) {
      const parts = clean.split('/')
      return {
        view: 'processing',
        sessionId: parts[1] || null,
        stage: null,
        subAction: null,
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
    if (['new_live', 'transcribe', 'youtube', 'settings', 'live_recording', 'reports', 'events', 'profile', 'remote_control', 'download', 'workspace', 'media'].includes(clean)) {
      return { view: clean, sessionId: null, stage: null, subAction: null }
    }
    return { view: 'dashboard', sessionId: null, stage: null, subAction: null }
  }

  // Navigation state initialized from URL hash or pathname
  const [currentView, setCurrentView] = useState(() => {
    return parseRoute(getActiveRoute()).view
  })
  const [sessionInitialStage, setSessionInitialStage] = useState(() => {
    return parseRoute(getActiveRoute()).stage || 'overview'
  })
  const [verificationProcessing, setVerificationProcessing] = useState(() => {
    return parseRoute(getActiveRoute()).subAction === 'processing'
  })
  const [isRecorderMinimized, setIsRecorderMinimized] = useState(false)
  const preRecordingViewRef = useRef('dashboard')
  const [showCompletionModal, setShowCompletionModal] = useState(() => {
    return parseRoute(typeof window !== 'undefined' ? window.location.hash : '').view === 'completion'
  })
  const [completedSessionId, setCompletedSessionId] = useState(() => {
    return parseRoute(typeof window !== 'undefined' ? window.location.hash : '').sessionId
  })
  const [mediaUploadToken, setMediaUploadToken] = useState(() => {
    return parseRoute(getActiveRoute()).token || null
  })
  const [workspaceSessionId, setWorkspaceSessionId] = useState(() => {
    const parsed = parseRoute(getActiveRoute())
    return parsed.view === 'workspace' ? parsed.sessionId : null
  })
  const [selectedSessionId, setSelectedSessionId] = useState(() => {
    const parsed = parseRoute(getActiveRoute())
    return parsed.view === 'sessions' ? parsed.sessionId : null
  })

  const [sessionMetadata, setSessionMetadata] = useState({
    title: 'Sunday Morning Worship Service',
    eventType: 'Sunday Worship Service',
    minister: '',
    messageTitle: '',
  })
  const [sessionSubViewInfo, setSessionSubViewInfo] = useState({
    title: 'Session',
    onBack: null,
  })
  const [sessionsStatusFilter, setSessionsStatusFilter] = useState('all')
  const scrollPositions = useRef({})

  const { user, isOnboarded, loading: authLoading, demoMode } = useAuth()
  const [authScreen, setAuthScreen] = useState('login')
  const [replayOnboardingActive, setReplayOnboardingActive] = useState(false)
  const [demoTestOnboardingActive, setDemoTestOnboardingActive] = useState(false)
  const [hasPlayedStartupAnimation, setHasPlayedStartupAnimation] = useState(() => {
    try {
      if (typeof window === 'undefined') return true
      const enabled = localStorage.getItem('dlbc_startup_animation_enabled')
      if (enabled === 'false') return true
      return false
    } catch {
      return false
    }
  })

  useEffect(() => {
    const syncRouteFromLocation = () => {
      const routeStr = getActiveRoute()
      const parsed = parseRoute(routeStr)
      if (parsed.view) {
        setCurrentView(parsed.view)
        if (parsed.view === 'sessions') {
          setSelectedSessionId(parsed.sessionId || null)
        } else {
          setSelectedSessionId(null)
        }
        if (parsed.stage) setSessionInitialStage(parsed.stage)
        if (parsed.sessionId) setCompletedSessionId(parsed.sessionId)
        if (parsed.subAction === 'processing') setVerificationProcessing(true)
        if (parsed.token) setMediaUploadToken(parsed.token)
        if (parsed.view === 'workspace') setWorkspaceSessionId(parsed.sessionId)
      }
      const h = typeof window !== 'undefined' ? window.location.hash || '' : ''
      if (h.includes('reset-password')) {
        setAuthScreen('reset')
      }
    }
    syncRouteFromLocation()
    window.addEventListener('hashchange', syncRouteFromLocation)
    window.addEventListener('popstate', syncRouteFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncRouteFromLocation)
      window.removeEventListener('popstate', syncRouteFromLocation)
    }
  }, [])

  // Phase 1 & 3: Audio Capture & Live Transcription Hook
  const liveAudio = useAudioCapture()

  // Phase 2: Recorded File Transcription Hook
  const recordedTranscription = useRecordedTranscription()

  // Phase 4: Persistent Church Sessions Hook
  const sessionsHook = useSessions()

  const handleStopRecordingRef = useRef(null)

  // Multi-Device Remote Control & Account Presence Hook
  const remoteControl = useRemoteControl({
    isRecording: liveAudio.isRecording,
    onRemoteStopRequested: async () => {
      if (handleStopRecordingRef.current) {
        return await handleStopRecordingRef.current()
      }
      return null
    },
    isAuthenticated: Boolean(user) || Boolean(demoMode),
  })

  useEffect(() => {
    if (user && isOnboarded) {
      sessionsHook.fetchSessions()
    }
  }, [user, isOnboarded])

  // Desktop Windows close protection during live recording (both active & paused)
  const [showCloseRecordingModal, setShowCloseRecordingModal] = useState(false)
  const isRecordingRef = useRef(false)
  isRecordingRef.current = liveAudio.isRecording

  useEffect(() => {
    setupWindowCloseProtection(
      () => isRecordingRef.current,
      () => setShowCloseRecordingModal(true)
    )
  }, [])

  const handleConfirmStopAndClose = async () => {
    try {
      if (handleStopRecordingRef.current) {
        await handleStopRecordingRef.current()
      }
    } finally {
      await forceExitApplication()
    }
  }

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

    if (route.view === 'processing') {
      setCurrentView('processing')
      if (route.sessionId) {
        setCompletedSessionId(route.sessionId)
        if (sessionsHook.activeSession?.session_id !== route.sessionId) {
          sessionsHook.loadSession(route.sessionId)
        }
      }
      return
    }

    if (route.view === 'sessions') {
      setCurrentView('sessions')
      setSelectedSessionId(route.sessionId || null)
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

    if (route.view === 'media_upload') {
      setCurrentView('media_upload')
      setSelectedSessionId(null)
      setMediaUploadToken(route.token)
      return
    }

    if (route.view === 'workspace') {
      setCurrentView('workspace')
      setSelectedSessionId(null)
      if (route.sessionId) {
        setWorkspaceSessionId(route.sessionId)
        const isManualDoc = typeof route.sessionId === 'string' && route.sessionId.startsWith('doc_')
        if (isManualDoc) {
          // Standalone manual document: never query session API, clear any session errors
          sessionsHook.clearError?.()
        } else if (sessionsHook.activeSession?.session_id !== route.sessionId) {
          sessionsHook.loadSession(route.sessionId)
        }
      } else {
        setWorkspaceSessionId(null)
      }
      return
    }

    setCurrentView(route.view)
    setSelectedSessionId(null)
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

  const navStateRef = useRef({
    currentView,
    workspaceSessionId,
    isRecording: liveAudio.isRecording,
    isRecorderMinimized,
    showCloseRecordingModal,
    showCompletionModal,
    activeSession: sessionsHook.activeSession,
    sessionInitialStage,
  })

  useEffect(() => {
    navStateRef.current = {
      currentView,
      workspaceSessionId,
      isRecording: liveAudio.isRecording,
      isRecorderMinimized,
      showCloseRecordingModal,
      showCompletionModal,
      activeSession: sessionsHook.activeSession,
      sessionInitialStage,
    }
  })

  const handleInAppBack = () => {
    // 1. If inside workspace editor viewing a document, step back to workspace hub
    if (navStateRef.current.currentView === 'workspace' && navStateRef.current.workspaceSessionId) {
      setWorkspaceSessionId(null)
      navigateTo('workspace')
      return
    }

    // 2. Deterministic hierarchical back navigation
    const clean = (window.location.hash || '').replace(/^#\/?/, '').trim()

    if (clean.startsWith('session/')) {
      const parts = clean.split('/')
      const sId = parts[1]
      const stage = parts[2]
      const sub = parts[3]
      if (sub === 'processing') {
        navigateTo(`session/${sId}/verification`)
      } else if (stage && stage !== 'overview') {
        // Return from sub-stage (transcript, verified_transcript, verification, final_report) to Session Overview
        navigateTo(`session/${sId}`)
      } else {
        // Return from Session Overview to Sessions list
        navigateTo('sessions')
      }
      return
    }

    if (clean.startsWith('workspace/')) {
      setWorkspaceSessionId(null)
      navigateTo('workspace')
      return
    }

    if (clean.startsWith('processing/')) {
      navigateTo('dashboard')
      return
    }

    if (clean.startsWith('completion/')) {
      setShowCompletionModal(false)
      navigateTo('sessions')
      return
    }

    // Direct top-level destinations back to dashboard
    if (['sessions', 'new_live', 'transcribe', 'youtube', 'settings', 'profile', 'remote_control', 'workspace', 'media', 'reports', 'events', 'download'].includes(clean)) {
      navigateTo('dashboard')
      return
    }

    // Fallback: If browser depth exists, pop history
    const currentDepth = (window.history.state && typeof window.history.state.depth === 'number')
      ? window.history.state.depth
      : 0

    if (currentDepth > 0) {
      window.history.back()
    } else {
      navigateTo('dashboard')
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

  // Android Native Hardware Back Button & Gesture Support via Capacitor
  // Registered ONCE on mount with stable mutable state ref to eliminate bridge listener thrashing
  useEffect(() => {
    let backListener = null
    let isMounted = true

    async function registerBackListener() {
      try {
        if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
          const handle = await CapApp.addListener('backButton', () => {
            if (!isMounted) return

            const state = navStateRef.current

            // 1. If Live Recording is open full-screen -> minimize
            if (state.isRecording && !state.isRecorderMinimized) {
              setIsRecorderMinimized(true)
              return
            }

            // 2. Dismiss open overlay modals first
            if (state.showCloseRecordingModal) {
              setShowCloseRecordingModal(false)
              return
            }
            if (state.showCompletionModal) {
              minimizeActiveProcess()
              setShowCompletionModal(false)
              return
            }

            // 3. If in Workspace editor editing a report, return to Workspace hub
            if (state.currentView === 'workspace' && state.workspaceSessionId) {
              setWorkspaceSessionId(null)
              navigateTo('workspace')
              return
            }

            // 4. Check if currently on dashboard root
            const clean = (window.location.hash || '').replace(/^#\/?/, '').trim()
            if (!clean || clean === 'dashboard') {
              CapApp.exitApp()
              return
            }

            // Otherwise execute deterministic hierarchical in-app back
            handleInAppBack()
          })
          backListener = handle
        }
      } catch (err) {
        console.warn('Capacitor backButton setup:', err)
      }
    }

    registerBackListener()

    return () => {
      isMounted = false
      if (backListener && typeof backListener.remove === 'function') {
        backListener.remove()
      }
    }
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

  // If user explicitly navigates to #new_live while recording is active, maximize the active recorder
  useEffect(() => {
    if (currentView === 'new_live' && liveAudio.isRecording) {
      setIsRecorderMinimized(false)
    }
  }, [currentView, liveAudio.isRecording])

  // Handle Start Recording from NewLiveSessionView
  const handleStartRecording = async (meta) => {
    setSessionMetadata(meta)
    setIsRecorderMinimized(false)
    if (currentView && currentView !== 'new_live') {
      preRecordingViewRef.current = currentView
    }
    const success = await liveAudio.startRecording(meta.title, meta)
    if (success) {
      setIsRecorderMinimized(false)
      await remoteControl.startRecordingSync({
        title: meta.title,
        minister: meta.minister,
        eventType: meta.eventType,
      })
    }
  }

  // Handle Stop Recording
  const handleStopRecording = async () => {
    setIsRecorderMinimized(false)
    const recordingResult = await liveAudio.stopRecording()
    const targetId =
      recordingResult?.session_id ||
      recordingResult?.session?.session_id ||
      liveAudio.latestSession?.session_id ||
      liveAudio.latestRecording?.session_id

    if (targetId) {
      setCompletedSessionId(targetId)
      setActiveProcess({
        sessionId: targetId,
        sessionTitle: sessionMetadata?.title || sessionMetadata?.eventType || 'Live Worship Service',
        dayNumber: sessionMetadata?.day_number || null,
        stageLabel: 'Compiling session...',
        isCompleted: false,
        isMinimized: false,
        jobType: 'automatic_pipeline',
      })
      setShowCompletionModal(true)
    } else {
      navigateTo('dashboard')
    }

    // Run background sync operations asynchronously without blocking the UI transition
    Promise.allSettled([
      sessionsHook.fetchSessions(),
      remoteControl.stopRecordingSync(targetId),
      targetId ? sessionsHook.loadSession(targetId) : Promise.resolve(),
    ]).catch((err) => {
      console.warn('[handleStopRecording] Background sync error:', err)
    })

    return recordingResult
  }
  handleStopRecordingRef.current = handleStopRecording

  // Navigation Handler for AppShell Sidebar
  const handleNavigate = (view) => {
    if (view === 'sessions') {
      setSelectedSessionId(null)
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
    if (currentView === 'processing') {
      const targetSession =
        sessionsHook.activeSession ||
        sessionsHook.sessions.find((s) => s.session_id === completedSessionId)
      return {
        title: targetSession ? getCleanSessionName(targetSession) : 'Automatic Processing',
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'transcribe') {
      return {
        title: 'Upload Recording',
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'youtube') {
      return {
        title: 'YouTube Session',
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'profile') {
      return {
        title: 'Account Profile',
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'remote_control') {
      return {
        title: 'Remote Control',
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
    if (currentView === 'workspace') {
      return {
        title: workspaceSessionId ? 'Workspace Editor' : 'Workspace',
        onBack: handleInAppBack,
      }
    }
    if (currentView === 'media') {
      return {
        title: 'Media Receiver',
        onBack: handleInAppBack,
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

  // Boot / Loading guard — prevents any flashing of private content
  if (authLoading) {
    return (
      <div className="auth-boot-screen">
        <div className="auth-boot-content">
          <div className="auth-logo-badge auth-logo-badge--large">DLBC</div>
          <div className="auth-boot-spinner" />
          <p className="auth-boot-text">Loading DLBC Information Unit...</p>
        </div>
      </div>
    )
  }

  // Public Media Upload Landing Page (accessible via link without login)
  if (currentView === 'media_upload') {
    return (
      <PublicMediaUploadView
        token={mediaUploadToken}
        onBackToApp={() => navigateTo('dashboard')}
      />
    )
  }

  // Public Download Landing Page (accessible without login)
  if (currentView === 'download') {
    return <DownloadView onBackToApp={() => navigateTo('dashboard')} />
  }

  // Unauthenticated routing
  if (!user) {
    if (authScreen === 'create') {
      return <CreateAccountView onSwitchToLogin={() => setAuthScreen('login')} />
    }
    if (authScreen === 'forgot') {
      return <ForgotPasswordView onSwitchToLogin={() => setAuthScreen('login')} />
    }
    if (authScreen === 'reset') {
      return <ResetPasswordView onComplete={() => setAuthScreen('login')} />
    }
    return (
      <LoginView
        onSwitchToCreate={() => setAuthScreen('create')}
        onSwitchToForgot={() => setAuthScreen('forgot')}
        onOpenDownload={() => {
          if (typeof window !== 'undefined') window.location.hash = '#download'
          setCurrentView('download')
        }}
      />
    )
  }

  // First-time onboarding guard
  if (!isOnboarded) {
    return <OnboardingView isReplay={false} />
  }

  // Demo Test Onboarding mode triggered from Settings in Demo mode
  if (demoMode && demoTestOnboardingActive) {
    return (
      <OnboardingView
        isDemoTest={true}
        onDemoTestCancel={() => setDemoTestOnboardingActive(false)}
        onDemoTestComplete={() => setDemoTestOnboardingActive(false)}
      />
    )
  }

  // Replay onboarding mode triggered from Settings
  if (replayOnboardingActive) {
    return (
      <OnboardingView
        isReplay={true}
        onReplayCancel={() => setReplayOnboardingActive(false)}
        onReplayComplete={() => setReplayOnboardingActive(false)}
      />
    )
  }

  const { title: currentScreenTitle, onBack: currentScreenBack } = getHeaderContext()

  return (
    <>
      {!hasPlayedStartupAnimation && (
        <StartupAnimation
          onComplete={() => {
            setHasPlayedStartupAnimation(true)
          }}
        />
      )}
      <AppShell
        activeView={
          showCompletionModal
            ? 'dashboard'
            : liveAudio.isRecording && !isRecorderMinimized
            ? 'live_recording'
            : currentView
        }
      isLiveRecordingActive={liveAudio.isRecording}
      isRemoteRecordingActive={remoteControl.isRemoteRecordingActive}
      onNavigate={handleNavigate}
      screenTitle={currentScreenTitle}
      onBack={currentScreenBack}
      onStartLiveSession={() => {
        if (liveAudio.isRecording) {
          setIsRecorderMinimized(false)
        } else {
          preRecordingViewRef.current = currentView !== 'new_live' ? currentView : 'dashboard'
          navigateTo('new_live')
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
          connectionHealth={liveAudio.connectionHealth}
          isStreamingConnected={liveAudio.isStreamingConnected}
          streamDisconnectError={liveAudio.streamDisconnectError}
          onMinimize={() => {
            setIsRecorderMinimized(true)
            const target =
              preRecordingViewRef.current && preRecordingViewRef.current !== 'new_live'
                ? preRecordingViewRef.current
                : 'dashboard'
            navigateTo(target)
          }}
          onStopRecording={handleStopRecording}
          onToggleManualFlag={liveAudio.toggleManualFlag}
        />
      ) : currentView === 'dashboard' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 1: DASHBOARD                                           */
        /* ----------------------------------------------------------- */
        <DashboardView
          sessions={sessionsHook.sessions}
          isLoading={sessionsHook.isLoading}
          error={sessionsHook.error}
          onRetry={sessionsHook.fetchSessions}
          onStartLiveSession={() => {
            if (liveAudio.isRecording) {
              setIsRecorderMinimized(false)
            } else {
              preRecordingViewRef.current = 'dashboard'
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
            setSessionsStatusFilter('needs_verification')
            navigateTo('sessions')
          }}
          onFileSelect={handleDashboardFileSelect}
          onOpenTranscribe={() => navigateTo('transcribe')}
          remoteControl={remoteControl}
          onOpenRemoteControl={() => navigateTo('remote_control')}
          onOpenWorkspace={() => navigateTo('workspace')}
          onOpenProfile={() => navigateTo('profile')}
        />
      ) : currentView === 'new_live' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 2: NEW LIVE SESSION SETUP                              */
        /* ----------------------------------------------------------- */
        liveAudio.isRecording ? null : (
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
        !selectedSessionId ? (
          <SessionHistoryList
            sessions={sessionsHook.sessions}
            onOpenSession={(sessionId, initialStage = 'overview') => {
              const activeRecId = liveAudio.latestSession?.session_id || liveAudio.latestRecording?.session_id
              if (liveAudio.isRecording && (sessionId === activeRecId || sessionsHook.sessions.find((s) => s.session_id === sessionId)?.status === 'recording')) {
                setIsRecorderMinimized(false)
                return
              }
              setSelectedSessionId(sessionId)
              navigateTo(`session/${sessionId}${initialStage && initialStage !== 'overview' ? `/${initialStage}` : ''}`)
            }}
            onDeleteSession={sessionsHook.deleteSession}
            onRefresh={sessionsHook.fetchSessions}
            onRetry={sessionsHook.fetchSessions}
            onStartNewSession={() => {
              if (liveAudio.isRecording) {
                setIsRecorderMinimized(false)
              } else {
                preRecordingViewRef.current = 'sessions'
                navigateTo('new_live')
              }
            }}
            isLoading={sessionsHook.isLoading}
            error={sessionsHook.error}
            initialStatusFilter={sessionsStatusFilter}
          />
        ) : (
          (() => {
            const hasFullLoaded = sessionsHook.activeSession && sessionsHook.activeSession.session_id === selectedSessionId
            if (hasFullLoaded) {
              return (
                <SessionDetailView
                  session={sessionsHook.activeSession}
                  initialStage={sessionInitialStage}
                  onBack={handleInAppBack}
                  onUpdateTitle={sessionsHook.updateSessionTitle}
                  onUpdateDetails={sessionsHook.updateSessionDetails}
                  onDeleteSession={sessionsHook.deleteSession}
                  onSubViewChange={setSessionSubViewInfo}
                  onLoadSegments={sessionsHook.loadSessionSegments}
                  verificationState={sessionsHook.verificationState}
                  onStartVerification={sessionsHook.startVerification}
                  onLoadVerificationState={sessionsHook.loadVerificationState}
                  onResolveVerificationItem={sessionsHook.resolveVerificationItem}
                  onAddVerificationItem={sessionsHook.addVerificationItem}
                  onConfirmAllRemaining={sessionsHook.confirmAllRemaining}
                  onFinaliseVerification={sessionsHook.finaliseVerification}
                  onConfirmRawAsVerified={sessionsHook.confirmRawAsVerified}
                  onNavigateStage={(stage) => {
                    const sId = sessionsHook.activeSession?.session_id || selectedSessionId
                    if (!sId) return
                    const target = stage && stage !== 'overview' ? `session/${sId}/${stage}` : `session/${sId}`
                    navigateTo(target)
                  }}
                  verificationProcessing={verificationProcessing}
                  onTriggerVerificationProcessing={() => {
                    const sId = sessionsHook.activeSession?.session_id || selectedSessionId
                    if (!sId) return
                    navigateTo(`session/${sId}/verification/processing`)
                  }}
                  onCloseVerificationProcessing={() => {
                    handleInAppBack()
                  }}
                />
              )
            }

            // If activeSession is still loading for selectedSessionId, show page-shaped skeleton immediately
            const summarySession = sessionsHook.sessions.find((s) => s.session_id === selectedSessionId)
            return (
              <SessionDetailSkeleton
                session={summarySession}
                onBack={handleInAppBack}
              />
            )
          })()
        )
      ) : currentView === 'transcribe' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 4: DESKTOP UPLOAD RECORDING WORKFLOW                   */
        /* ----------------------------------------------------------- */
        <DesktopUploadRecordingView
          onEnterProcessing={(sId) => {
            setCompletedSessionId(sId)
            navigateTo(`processing/${sId}`)
          }}
          onBack={handleInAppBack}
          initialFile={recordedTranscription.selectedFile}
        />
      ) : currentView === 'processing' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 4B: UNIFIED AUTOMATIC PROCESSING EXPERIENCE            */
        /* ----------------------------------------------------------- */
        <AutomaticProcessingView
          sessionId={completedSessionId || sessionsHook.activeSession?.session_id}
          session={sessionsHook.activeSession}
          onViewReport={(sId) => navigateTo(`session/${sId}/final_report`)}
          onOpenSession={(sId) => navigateTo(`session/${sId}`)}
          onReturnToDashboard={() => navigateTo('dashboard')}
          onMinimize={() => navigateTo('dashboard')}
        />
      ) : currentView === 'settings' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 5: SETTINGS & STANDARDS                                */
        /* ----------------------------------------------------------- */
        <SettingsView
          onBack={handleInAppBack}
          onReplayOnboarding={() => setReplayOnboardingActive(true)}
          onTestOnboarding={() => setDemoTestOnboardingActive(true)}
        />
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
          onBack={handleInAppBack}
        />
      ) : currentView === 'events' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 8: EVENTS / PROGRAMMES SESSIONS                        */
        /* ----------------------------------------------------------- */
        <SessionHistoryList
          onOpenSession={(sessionId) => navigateTo(`session/${sessionId}`)}
          onStartLiveSession={() => {
            if (liveAudio.isRecording) {
              setIsRecorderMinimized(false)
            } else {
              preRecordingViewRef.current = 'events'
              navigateTo('new_live')
            }
          }}
          onOpenTranscribe={() => navigateTo('transcribe')}
          initialFilter="all"
          onBack={handleInAppBack}
        />
      ) : currentView === 'profile' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 9: USER PROFILE & CHURCH IDENTITY                      */
        /* ----------------------------------------------------------- */
        <ProfileView
          onBack={handleInAppBack}
          onEditChurchDetails={() => setReplayOnboardingActive(true)}
        />
      ) : currentView === 'remote_control' ? (
        /* ----------------------------------------------------------- */
        /* VIEW 10: MULTI-DEVICE REMOTE CONTROL                        */
        /* ----------------------------------------------------------- */
        <RemoteControlView
          remoteControl={remoteControl}
          onNavigate={navigateTo}
          onBack={handleInAppBack}
        />
      ) : currentView === 'workspace' ? (
        <WorkspaceView
          sessions={sessionsHook.sessions}
          activeSessionId={workspaceSessionId}
          onOpenSession={(sessionId, initialStage = 'final_report') => {
            navigateTo(`session/${sessionId}/${initialStage}`)
          }}
          onSelectDocument={(sessionId) => {
            setWorkspaceSessionId(sessionId)
            navigateTo(`workspace/${sessionId}`)
          }}
          onCloseEditor={() => {
            setWorkspaceSessionId(null)
            navigateTo('workspace')
          }}
          onBack={handleInAppBack}
          onRefreshSessions={sessionsHook.fetchSessions}
        />
      ) : currentView === 'media' ? (
        <MediaView
          sessions={sessionsHook.sessions}
          onOpenSession={(sessionId, initialStage = 'overview') => {
            navigateTo(`session/${sessionId}`)
          }}
          onBack={handleInAppBack}
          onRefreshSessions={sessionsHook.fetchSessions}
        />
      ) : currentView === 'download' ? (
        <DownloadView onBackToApp={() => navigateTo('dashboard')} />
      ) : null}
      </ErrorBoundary>

      {/* Desktop Windows Close Protection Modal */}
      <CloseRecordingModal
        isOpen={showCloseRecordingModal}
        onKeepRecording={() => setShowCloseRecordingModal(false)}
        onStopAndClose={handleConfirmStopAndClose}
      />

      {/* ------------------------------------------------------------- */}
      {/* FLOATING PROCESSING WINDOW: Contained foreground modal        */}
      {/* ------------------------------------------------------------- */}
      {showCompletionModal && (
        <SessionCompletionView
          isOverlay={true}
          session={
            sessionsHook.activeSession ||
            sessionsHook.sessions.find((s) => s.session_id === (completedSessionId || activeProcess?.sessionId)) ||
            sessionsHook.sessions[0]
          }
          latestRecording={liveAudio.latestRecording}
          onMinimize={() => {
            minimizeActiveProcess()
            setShowCompletionModal(false)
          }}
          onExpand={() => {
            setShowCompletionModal(false)
            const targetId = completedSessionId || activeProcess?.sessionId
            if (targetId) {
              navigateTo(`processing/${targetId}`)
            }
          }}
          onViewReport={(sId) => {
            setShowCompletionModal(false)
            const targetId = sId || completedSessionId || activeProcess?.sessionId
            if (targetId) {
              navigateTo(`session/${targetId}/final_report`)
            }
          }}
          onGoToReporting={() => {
            setShowCompletionModal(false)
            const targetId = completedSessionId || activeProcess?.sessionId
            if (targetId) {
              navigateTo(`session/${targetId}/final_report`)
            }
          }}
          onBeginVerification={() => {
            setShowCompletionModal(false)
            const targetId = completedSessionId || activeProcess?.sessionId
            if (targetId) {
              navigateTo(`session/${targetId}/verification`)
            }
          }}
          onFinishForNow={() => {
            minimizeActiveProcess()
            setShowCompletionModal(false)
          }}
          onViewSessionDetails={() => {
            setShowCompletionModal(false)
            const targetId = completedSessionId || activeProcess?.sessionId
            if (targetId) {
              navigateTo(`session/${targetId}`)
            }
          }}
          onRetryVerification={() => {
            setShowCompletionModal(false)
            const targetId = completedSessionId || activeProcess?.sessionId
            if (targetId) {
              navigateTo(`session/${targetId}/verification`)
            }
          }}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* COMPACT IN-APP STATUS INDICATOR: Persistent across views      */}
      {/* ------------------------------------------------------------- */}
      {activeProcess && activeProcess.isMinimized && currentView !== 'processing' && !verificationProcessing && !showCompletionModal && (
        <aside className="docked-processing-bar" role="status" aria-live="polite">
          <div className="docked-processing-content">
            <div className="docked-processing-title-row">
              <span className={`docked-processing-dot ${activeProcess.isCompleted ? 'docked-processing-dot--completed' : 'pill-dot--pulse'}`}>
                {activeProcess.isCompleted ? '✓' : '●'}
              </span>
              <span className="docked-processing-title" title={activeProcess.sessionTitle}>
                {activeProcess.sessionTitle}
                {activeProcess.dayNumber && (
                  <span className="session-day-badge" title={`Day ${activeProcess.dayNumber}`}>
                    {activeProcess.dayNumber}
                  </span>
                )}
              </span>
            </div>
            <div className="docked-processing-stage-row">
              <span className="docked-processing-stage">{activeProcess.stageLabel}</span>
            </div>
          </div>
          <div className="docked-processing-actions">
            <button
              type="button"
              className="btn btn--small btn--primary docked-open-btn"
              onClick={() => {
                if (activeProcess.isCompleted) {
                  navigateTo(`session/${activeProcess.sessionId}/final_report`)
                } else {
                  setCompletedSessionId(activeProcess.sessionId)
                  expandActiveProcess()
                  setShowCompletionModal(true)
                }
              }}
            >
              Open
            </button>
            {!activeProcess.isCompleted && (
              <button
                type="button"
                className="btn btn--small btn--ghost docked-cancel-btn"
                style={{ color: '#ef4444', fontSize: '13px', padding: '4px 8px' }}
                onClick={async () => {
                  const jobName = activeProcess.jobType === 'verification' ? 'verification' : 'processing'
                  if (window.confirm(`Cancel ${jobName} for "${activeProcess.sessionTitle}"?\n\nThe session and existing data will remain available.`)) {
                    try {
                      if (activeProcess.jobType === 'report_processing') {
                        if (activeProcess.sessionId) {
                          await authFetch(getApiUrl(`/api/report-processing/sessions/${encodeURIComponent(activeProcess.sessionId)}/cancel`), { method: 'POST' })
                        }
                        if (activeProcess.runId) {
                          await authFetch(getApiUrl(`/api/report-processing/cancel/${encodeURIComponent(activeProcess.runId)}`), { method: 'POST' })
                        }
                      } else if (activeProcess.jobType === 'verification') {
                        if (activeProcess.sessionId) {
                          await authFetch(getApiUrl(`/api/sessions/${encodeURIComponent(activeProcess.sessionId)}/verification/cancel`), { method: 'POST' })
                        }
                      }
                    } catch (e) {
                      console.error('Failed to cancel active process:', e)
                    } finally {
                      clearActiveProcess()
                    }
                  }
                }}
                title="Cancel processing"
              >
                Cancel
              </button>
            )}
            {activeProcess.isCompleted && (
              <button
                type="button"
                className="btn-close-docked"
                onClick={() => clearActiveProcess()}
                aria-label="Dismiss"
                title="Dismiss"
              >
                ✕
              </button>
            )}
          </div>
        </aside>
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
          connectionHealth={liveAudio.connectionHealth}
          isStreamingConnected={liveAudio.isStreamingConnected}
          streamDisconnectError={liveAudio.streamDisconnectError}
          onMaximize={() => setIsRecorderMinimized(false)}
          onStopRecording={handleStopRecording}
        />
      )}
    </AppShell>
    </>
  )
}

export default App
