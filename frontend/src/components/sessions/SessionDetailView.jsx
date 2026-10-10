import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getApiUrl } from '../../config'
import { RawTranscriptViewer } from '../transcription/RawTranscriptViewer'
import { VerificationWorkflow } from '../verification/VerificationWorkflow'
import { FinalReportView } from '../final_report/FinalReportView'
import { ReportProcessingModal } from '../reporting/ReportProcessingModal'
import { SessionDetailSkeleton } from './SessionDetailSkeleton'
import { AutomaticVerificationToggle } from '../common/AutomaticVerificationToggle'

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d68f2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d68f2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

export function getSessionHierarchy(session) {
  let programme = ''
  let sessionTitle = ''
  let preacher = session?.minister || ''

  if (session?.metadata_json) {
    try {
      const meta = typeof session.metadata_json === 'string' ? JSON.parse(session.metadata_json) : session.metadata_json
      programme = meta.programme || meta.eventType || ''
      sessionTitle = meta.programmeSession || meta.session_name || meta.messageTitle || ''
      if (!preacher && meta.minister) preacher = meta.minister
    } catch {}
  }
  if (!programme && session?.metadata?.programme) programme = session.metadata.programme
  if (!programme && session?.metadata?.eventType) programme = session.metadata.eventType
  if (!programme && session?.programme) programme = session.programme
  if (!programme && session?.programme_type) programme = session.programme_type

  const rawTitle = (session?.title || '').trim()

  if (!sessionTitle && rawTitle.includes('—')) {
    const parts = rawTitle.split('—').map((p) => p.trim())
    if (parts.length >= 2) {
      if (!programme) programme = parts[0]
      sessionTitle = parts.slice(1).join(' — ')
    }
  } else if (!sessionTitle && rawTitle.includes(' - ')) {
    const parts = rawTitle.split(' - ').map((p) => p.trim())
    if (parts.length >= 2) {
      if (!programme) programme = parts[0]
      sessionTitle = parts.slice(1).join(' - ')
    }
  }

  if (!sessionTitle) {
    sessionTitle = rawTitle || 'Sunday Morning Service'
  }
  if (!programme) {
    programme = 'Sunday Worship Service'
  }
  if (!preacher) {
    preacher = 'Pastor W.F. Kumuyi'
  }

  return { programme, sessionTitle, preacher }
}

/**
 * Centrally derives the single authoritative presentation status for a session.
 * Used consistently across Dashboard, Sessions History (Desktop & Mobile), and Workspace.
 */
export function deriveSessionDisplayStatus(sess) {
  if (!sess) {
    return {
      statusKey: 'unknown',
      statusText: 'UNKNOWN',
      statusLabel: 'Unknown',
      statusPillClass: 'status-pill--neutral',
      cardPillClass: 'session-card-pill--neutral',
      actionText: 'View →',
      targetStage: 'overview',
    }
  }

  const isInterrupted = !!sess.is_interrupted
  const isLive = sess.status === 'recording'
  const isFinalComplete = sess.final_report_status === 'complete' || sess.report_processing_status === 'completed' || !!sess.final_report_id
  const isVerified = !isFinalComplete && (sess.verification_status === 'completed' || !!sess.verified_text || !!sess.verified_at)
  const needsVerification = !isFinalComplete && !isVerified && (sess.flag_count > 0 || sess.verification_status === 'in_progress')

  if (isInterrupted) {
    return {
      statusKey: 'interrupted',
      statusText: 'INTERRUPTED',
      statusLabel: 'Interrupted',
      statusPillClass: 'status-pill--interrupted',
      cardPillClass: 'session-card-pill--danger',
      actionText: 'Review →',
      targetStage: 'overview',
    }
  }
  if (isLive) {
    return {
      statusKey: 'live',
      statusText: 'LIVE',
      statusLabel: 'Live',
      statusPillClass: 'status-pill--brand',
      cardPillClass: 'session-card-pill--brand',
      actionText: 'Open Monitor →',
      targetStage: 'overview',
    }
  }
  if (isFinalComplete) {
    return {
      statusKey: 'completed',
      statusText: 'COMPLETED',
      statusLabel: 'Completed',
      statusPillClass: 'status-pill--completed',
      cardPillClass: 'session-card-pill--neutral',
      actionText: 'View Report →',
      targetStage: 'final_report',
    }
  }
  if (isVerified) {
    return {
      statusKey: 'verified',
      statusText: 'VERIFIED',
      statusLabel: 'Verified',
      statusPillClass: 'status-pill--verified',
      cardPillClass: 'session-card-pill--neutral',
      actionText: 'Process with AI →',
      targetStage: 'report_processing',
    }
  }
  if (needsVerification) {
    const count = sess.flag_count || 1
    return {
      statusKey: 'needs_verification',
      statusText: 'NEEDS VERIFICATION',
      statusLabel: `${count} to verify`,
      statusPillClass: 'status-pill--warning',
      cardPillClass: 'session-card-pill--warning',
      actionText: 'Review →',
      targetStage: 'verification',
    }
  }

  return {
    statusKey: 'in_progress',
    statusText: 'IN PROGRESS',
    statusLabel: 'In Progress',
    statusPillClass: 'status-pill--progress',
    cardPillClass: 'session-card-pill--neutral',
    actionText: 'View →',
    targetStage: 'overview',
  }
}

export function getCleanSessionName(session) {
  if (!session) return 'Sunday Worship Service'

  let raw = ''
  if (typeof session === 'string') {
    raw = session.trim()
  } else {
    raw = (session.session_name || session.session_title || session.title || '').trim()
  }

  // Deduplicate identical halves first: e.g. "Sunday Worship Service — Sunday Worship Service"
  const separators = ['—', '–', ' - ', ' \uFFFD ', '  ']
  for (const sep of separators) {
    if (raw.includes(sep)) {
      const parts = raw.split(sep).map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
        return parts[0]
      }
    }
  }

  const { programme, sessionTitle } = getSessionHierarchy(session)

  if (sessionTitle && !sessionTitle.startsWith('Recording') && !sessionTitle.endsWith('.wav')) {
    return sessionTitle
  }
  if (programme && !programme.startsWith('Recording') && !programme.endsWith('.wav')) {
    return programme
  }

  for (const sep of separators) {
    if (raw.includes(sep)) {
      const parts = raw.split(sep).map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 2) {
        if (parts[0].toLowerCase() === parts[1].toLowerCase()) {
          return parts[0]
        }
        if (!parts[1].startsWith('Recording') && !parts[1].endsWith('.wav')) {
          return parts[1]
        }
        if (!parts[0].startsWith('Recording') && !parts[0].endsWith('.wav')) {
          return parts[0]
        }
      }
    }
  }

  // Strip leading/trailing dash symbols or extra spaces
  raw = raw.replace(/^[-—–\s]+|[-—–\s]+$/g, '').trim()
  if (raw.startsWith('Recording') || raw.endsWith('.wav')) {
    return 'Sunday Worship Service'
  }

  return raw || 'Sunday Worship Service'
}

/**
 * SessionDetailView — Central Session Workspace Hub matching session-workspace.png.
 */
export function SessionDetailView({
  session,
  initialStage = 'overview',
  onBack,
  onUpdateTitle,
  onUpdateDetails,
  onSubViewChange,
  // Phase 5: Verification props
  verificationState,
  onStartVerification,
  onLoadVerificationState,
  onResolveVerificationItem,
  onAddVerificationItem,
  onConfirmAllRemaining,
  onFinaliseVerification,
  onConfirmRawAsVerified,
  // Navigation props
  onNavigateStage,
  verificationProcessing,
  onTriggerVerificationProcessing,
  onCloseVerificationProcessing,
  onDeleteSession = null,
  onLoadSegments = null,
}) {
  const getDefaultView = () => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#\/?/, '').trim()
      if (hash.startsWith('session/')) {
        const parts = hash.split('/')
        if (parts[2]) return parts[2]
      }
      if (hash === 'session_workspace') return 'overview'
      if (hash === 'verification_workspace') return 'verification'
    }

    if (initialStage === 'report_processing') {
      return 'overview'
    }
    if (initialStage) {
      return initialStage
    }

    const fStatus = session?.final_report_status || 'not_started'
    const vStatus = session?.verification_status || 'not_started'

    if (fStatus === 'complete') return 'overview'
    if (vStatus === 'in_progress') return 'verification'
    return 'overview'
  }

  const [activeView, setActiveView] = useState(getDefaultView)
  const [isViewingDetailsPage, setIsViewingDetailsPage] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const sessionUnit = session?.unit || session?.sector || (session?.metadata_json && typeof session.metadata_json === 'string' ? (()=>{ try { return JSON.parse(session.metadata_json)?.unit } catch(e){return null} })() : session?.metadata_json?.unit) || null
  const [showReportProcessingModal, setShowReportProcessingModal] = useState(() => {
    return initialStage === 'report_processing' || (typeof window !== 'undefined' && window.location.hash.includes('/report_processing'))
  })
  const mediaElementRef = useRef(null)

  const handleDownloadDocx = async () => {
    if (!session?.session_id) return
    try {
      const res = await fetch(getApiUrl(`/api/report-processing/download-docx/${session.session_id}`))
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${session?.title || 'Report'}.docx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Document is still being prepared. You can generate or download it via Report Processing.')
      }
    } catch (e) {
      alert(`Download error: ${e.message}`)
    }
  }

  const changeStage = (newStage) => {
    setActiveView(newStage)
    if (onNavigateStage) {
      onNavigateStage(newStage)
    }
  }

  const handleOpenReportProcessing = () => {
    setShowReportProcessingModal(true)
    if (onNavigateStage) {
      onNavigateStage('report_processing')
    } else {
      changeStage('report_processing')
    }
  }

  // Synchronize activeView and modal visibility when opening a new session or changing initialStage or hash route
  useEffect(() => {
    setActiveView(getDefaultView())
    const isReportProc = initialStage === 'report_processing' || (typeof window !== 'undefined' && window.location.hash.includes('/report_processing'))
    setShowReportProcessingModal(isReportProc)

    const handleHash = () => {
      setActiveView(getDefaultView())
      const isHashReportProc = typeof window !== 'undefined' && window.location.hash.includes('/report_processing')
      setShowReportProcessingModal(isHashReportProc)
    }
    window.addEventListener('hashchange', handleHash)
    window.addEventListener('popstate', handleHash)
    return () => {
      window.removeEventListener('hashchange', handleHash)
      window.removeEventListener('popstate', handleHash)
    }
  }, [session?.session_id, initialStage])

  // Automatically fetch granular transcript segments on-demand when entering raw_transcript view
  useEffect(() => {
    if (activeView === 'raw_transcript' && session?.session_id && typeof onLoadSegments === 'function') {
      const hasSegments = Array.isArray(session.segments) && session.segments.length > 0
      if (!hasSegments) {
        onLoadSegments(session.session_id)
      }
    }
  }, [activeView, session?.session_id, session?.segments, onLoadSegments])

  // Inform parent AppShell about current subview title and back action
  React.useEffect(() => {
    if (!onSubViewChange) return
    const titles = {
      overview: 'Session',
      raw_transcript: 'Raw Transcript',
      verification: 'Verification',
      verified_transcript: 'Verified Transcript',
      final_report: 'Final Report',
    }
    const title = titles[activeView] || 'Session'
    const backFn = activeView === 'overview' ? onBack : () => changeStage('overview')
    onSubViewChange({ title, onBack: backFn })
  }, [activeView, onBack, onSubViewChange])

  if (!session) {
    return <SessionDetailSkeleton onBack={onBack} />
  }

  // Formatting helpers
  const formatSeconds = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '00:00:00'
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)
    const pad = (n) => String(n).padStart(2, '0')
    if (hours > 0) {
      return `${hours}h ${pad(mins)}m ${pad(secs)}s`
    }
    return `${pad(mins)}:${pad(secs)}`
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return isoStr
    }
  }

  const handleSaveDetails = async (details) => {
    if (onUpdateDetails) {
      return await onUpdateDetails(session.session_id, details)
    }
    return false
  }

  const handleJumpToTime = (seconds) => {
    if (mediaElementRef.current) {
      mediaElementRef.current.currentTime = seconds
      mediaElementRef.current.play().catch(() => {})
    }
  }

  // Construct transcript object for RawTranscriptViewer
  const transcriptData = {
    transcript_id: session.transcript_id || `tr_${session.recording_id || session.session_id}`,
    recording_id: session.recording_id || session.session_id,
    upload_id: session.recording_id || session.session_id,
    original_filename: session.audio_filename || `${session.session_id}.wav`,
    saved_filename: session.audio_filename || `${session.session_id}.wav`,
    duration_seconds: session.duration_seconds || session.audio_duration_seconds,
    provider_name: session.provider_name || 'azure_speech',
    raw_text: session.raw_text || (session.segments ? session.segments.map((s) => s.text).join(' ') : ''),
    segments: session.segments || [],
    created_at: session.date_created,
  }

  // Lifecycle stage statuses
  const vStatus = session?.verification_status || 'not_started'
  const hasAudio = !!(session?.audio_filename || session?.recording_id)
  const hasTranscript = !!(session?.transcript_id || (session?.segment_count && session.segment_count > 0))
  const flagCount = session?.flag_count || session?.verification_items_total || 0
  const resolvedCount = session?.verification_items_resolved ?? verificationState?.resolved_count ?? 0
  const isVerified =
    vStatus === 'completed' ||
    vStatus === 'complete' ||
    !!session?.verified_at ||
    !!session?.verified_text ||
    (flagCount === 0 && hasTranscript && session?.status !== 'recording') ||
    (resolvedCount >= flagCount && flagCount > 0)
  const rStatus = session?.reporting_status || 'not_started'
  const eStatus = session?.editing_status || 'not_started'
  const pStatus = session?.proofreading_status || 'not_started'
  const fStatus = session?.final_report_status || 'not_started'

  // ---------------------------------------------------------------------------
  // CHILD STAGE ROUTING
  // ---------------------------------------------------------------------------
  let subViewContent = null

  if (activeView === 'final_report') {
    subViewContent = (
      <FinalReportView
        session={session}
        onBack={() => changeStage('overview')}
      />
    )
  } else if (activeView === 'raw_transcript') {
    subViewContent = (
      <div className="session-subview-container">
        <RawTranscriptViewer
          transcript={transcriptData}
          mediaElementRef={mediaElementRef}
          onJumpToTime={handleJumpToTime}
          onBeginVerification={() => {
            onStartVerification(session.session_id)
            changeStage('verification')
          }}
          flagCount={flagCount}
        />
      </div>
    )
  } else if (activeView === 'verification') {
    subViewContent = (
      <div className="session-subview-container">
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <AutomaticVerificationToggle unit={sessionUnit} variant="standard" showDescription={true} />
        </div>
        <VerificationWorkflow
          session={session}
          verificationState={verificationState}
          onStartVerification={onStartVerification}
          onLoadVerificationState={onLoadVerificationState}
          onResolveItem={onResolveVerificationItem}
          onAddItem={onAddVerificationItem}
          onConfirmAllRemaining={onConfirmAllRemaining}
          onFinalise={async (sId) => {
            await onFinaliseVerification(sId)
            changeStage('verified_transcript')
          }}
          onConfirmRawAsVerified={async (sId) => {
            await onConfirmRawAsVerified(sId)
            changeStage('verified_transcript')
          }}
          onPlaySegment={handleJumpToTime}
          onNavigateToReporting={handleOpenReportProcessing}
          onFinishForNow={() => changeStage('overview')}
          isProcessingProp={verificationProcessing}
          onTriggerProcessing={onTriggerVerificationProcessing}
          onCloseProcessing={onCloseVerificationProcessing}
        />
      </div>
    )
  } else if (activeView === 'verified_transcript') {
    const audioUrl = getApiUrl(`/api/transcription/media/${encodeURIComponent(session?.recording_id || session?.audio_filename || session?.session_id)}`)
    subViewContent = (
      <div className="session-subview-container">
        <div className="card verified-transcript-card">
          <div className="verified-transcript-top-header">
            <div className="verified-header-title-group">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => changeStage('overview')}
                aria-label="Back to Session Overview"
                title="Back"
              >
                ←
              </button>
              <div>
                <h2 className="verified-view-title">{session.title || 'Sunday Morning Worship Service'}</h2>
                <p className="verified-view-sub">
                  Verified Transcript &bull; Created {formatDate(session.verified_at || session.date_created)} &bull; Verified by Operator Admin
                </p>
              </div>
            </div>
            <div className="verified-top-actions">
              <button type="button" className="btn btn--outline" onClick={() => changeStage('overview')}>
                Finish for Now
              </button>
              <button type="button" className="btn btn--primary" onClick={handleOpenReportProcessing}>
                Process with AI →
              </button>
            </div>
          </div>

          <div className="verified-complete-banner">
            <span className="banner-check-icon">✓</span>
            <div>
              <strong>Transcript verified</strong>
              <p>This transcript is now the approved factual source for Information Unit Reporting and Editing.</p>
            </div>
          </div>

          {/* Compact Master Audio Player */}
          <div className="verified-master-player-bar">
            <div className="verified-player-label">
              <span className="player-indicator-dot" />
              <span>Master Audio</span>
            </div>
            <audio
              ref={mediaElementRef}
              controls
              className="verified-audio-element"
              src={audioUrl}
              preload="metadata"
            />
          </div>

          <div className="verified-body-box">
            <div className="verified-body-toolbar">
              <div className="verified-toolbar-left">
                <button
                  type="button"
                  className="btn-link-small"
                  onClick={() => setActiveView('raw_transcript')}
                >
                  📜 View Raw Transcript
                </button>
                <button
                  type="button"
                  className="btn-link-small"
                  onClick={() => changeStage('verification')}
                >
                  🔍 View Verification Details
                </button>
              </div>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => {
                  navigator.clipboard.writeText(session.verified_text || '')
                  alert('✓ Copied verified transcript text to clipboard!')
                }}
              >
                📋 Copy Full Transcript
              </button>
            </div>

            <div className="verified-text-canvas">
              <p className="verified-continuous-text">
                {session.verified_text || session.raw_text || 'Verified transcript text.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  } else {
    // Extract clean hierarchy and metadata
    const { programme: progDisplay, sessionTitle: sessionDisplay, preacher: preacherDisplay } = getSessionHierarchy(session)
    const durationSec = session.duration_seconds || session.audio_duration_seconds || 0
    const durationDisplay = durationSec > 0 ? formatSeconds(durationSec) : '25m 41s'
    const dateDisplay = formatDate(session.date_created)

    // ---------------------------------------------------------------------------
    // VIEW: SESSION WORKSPACE OVERVIEW HUB (session-workspace.png)
    // ---------------------------------------------------------------------------
    subViewContent = (
      <div className="session-workspace-page-container">
      {/* ------------------------------------------------------------- */}
      {/* MOBILE SESSION HUB & SESSION DETAILS (Collage 1 & 3 Screens 3 & 4) */}
      {/* ------------------------------------------------------------- */}
      <div className="mobile-session-overview-layout">
        {isViewingDetailsPage ? (
          /* Screen 4: Session Details (Full Page) */
          <div className="mobile-session-details-fullpage">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={() => setIsViewingDetailsPage(false)}
                aria-label="Back to Session"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">Session Details</h1>
              <div style={{ width: 36 }} />
            </div>

            {/* Top Identity Card */}
            <div className="mobile-details-hero-card">
              <div className="mobile-details-doc-icon">
                <DocumentIcon />
              </div>
              <div className="mobile-details-hero-text">
                <h2 className="mobile-details-hero-title">{sessionDisplay}</h2>
                <span className="mobile-details-hero-sub">{dateDisplay} · {durationDisplay}</span>
              </div>
            </div>

            {/* Key-Value Details Card */}
            <div className="mobile-details-kv-card">
              <div className="mobile-kv-row">
                <span className="mobile-kv-label">Event</span>
                <span className="mobile-kv-val">{progDisplay}</span>
              </div>
              <div className="mobile-kv-row">
                <span className="mobile-kv-label">Programme</span>
                <span className="mobile-kv-val">{progDisplay}</span>
              </div>
              <div className="mobile-kv-row">
                <span className="mobile-kv-label">Pastor</span>
                <span className="mobile-kv-val">{preacherDisplay}</span>
              </div>
              <div className="mobile-kv-row">
                <span className="mobile-kv-label">Date</span>
                <span className="mobile-kv-val">{dateDisplay}</span>
              </div>
              <div className="mobile-kv-row">
                <span className="mobile-kv-label">Start Time</span>
                <span className="mobile-kv-val">
                  {session?.date_created ? new Date(session.date_created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 AM'}
                </span>
              </div>
              <div className="mobile-kv-row">
                <span className="mobile-kv-label">Duration</span>
                <span className="mobile-kv-val">{durationDisplay}</span>
              </div>
              <div className="mobile-kv-row">
                <span className="mobile-kv-label">Input</span>
                <span className="mobile-kv-val">Microphone (Default)</span>
              </div>
            </div>

            {/* Action Links */}
            <div className="mobile-details-actions-list">
              <button
                type="button"
                className="mobile-details-action-link"
                onClick={() => {
                  const audioUrl = getApiUrl(`/api/sessions/${session.session_id}/audio`)
                  const a = new Audio(audioUrl)
                  a.play().catch(() => alert('Audio playback not supported or audio file unavailable.'))
                }}
              >
                <div className="mobile-details-link-left">
                  <span className="mobile-link-icon">▶</span>
                  <span>View Recording</span>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              <a
                href={getApiUrl(`/api/sessions/${session.session_id}/audio/download`)}
                className="mobile-details-action-link"
                style={{ textDecoration: 'none' }}
                download
                id="mobile-details-download-audio"
              >
                <div className="mobile-details-link-left">
                  <span className="mobile-link-icon">⬇</span>
                  <span>Download Audio</span>
                </div>
                <span className="mobile-chevron">›</span>
              </a>

              <button
                type="button"
                className="mobile-details-action-link"
                onClick={() => changeStage(isVerified ? 'verified_transcript' : 'raw_transcript')}
              >
                <div className="mobile-details-link-left">
                  <span className="mobile-link-icon">📜</span>
                  <span>View Transcript</span>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              <button
                type="button"
                className="mobile-details-action-link"
                onClick={() => changeStage('final_report')}
              >
                <div className="mobile-details-link-left">
                  <span className="mobile-link-icon">📝</span>
                  <span>Open in Workspace</span>
                </div>
                <span className="mobile-chevron">›</span>
              </button>

              {onDeleteSession && (
                <button
                  type="button"
                  className="mobile-details-delete-btn"
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to delete "${sessionDisplay}"? This action cannot be undone.`)) {
                      await onDeleteSession(session.session_id)
                      if (onBack) onBack()
                    }
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Delete Session</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Screen 3: Session Hub (2x3 Grid) */
          <div className="mobile-session-hub">
            <div className="mobile-subpage-header">
              <button
                type="button"
                className="mobile-header-back-btn"
                onClick={onBack}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="mobile-header-title">Session</h1>
              <div style={{ width: 36 }} />
            </div>

            {/* Session Headline Info */}
            <div className="mobile-session-hub-header">
              <h2 className="mobile-session-hub-title">{sessionDisplay}</h2>
              <span className="mobile-session-hub-meta">{dateDisplay} · {durationDisplay}</span>
            </div>

            {/* Link to Session Details */}
            <div
              className="mobile-session-details-trigger-card"
              onClick={() => setIsViewingDetailsPage(true)}
              role="button"
              tabIndex={0}
            >
              <div className="mobile-trigger-left">
                <span className="mobile-trigger-icon">📄</span>
                <span className="mobile-trigger-text">View session details</span>
              </div>
              <span className="mobile-chevron">›</span>
            </div>

            {/* 2x3 Action Grid */}
            <div className="mobile-session-actions-grid">
              <button
                type="button"
                className="mobile-grid-action-btn"
                onClick={() => {
                  const audioUrl = getApiUrl(`/api/sessions/${session.session_id}/audio`)
                  const a = new Audio(audioUrl)
                  a.play().catch(() => alert('Audio playback not supported or audio file unavailable.'))
                }}
              >
                <div className="mobile-grid-action-icon mobile-grid-action-icon--play">▶</div>
                <span className="mobile-grid-action-label">Play Recording</span>
              </button>

              <a
                href={getApiUrl(`/api/sessions/${session.session_id}/audio/download`)}
                className="mobile-grid-action-btn"
                style={{ textDecoration: 'none' }}
                download
                id="mobile-btn-download-audio"
              >
                <div className="mobile-grid-action-icon mobile-grid-action-icon--play">⬇</div>
                <span className="mobile-grid-action-label">Download Audio</span>
              </a>

              <button
                type="button"
                className="mobile-grid-action-btn"
                onClick={() => changeStage(isVerified ? 'verified_transcript' : 'raw_transcript')}
              >
                <div className="mobile-grid-action-icon mobile-grid-action-icon--doc">📜</div>
                <span className="mobile-grid-action-label">View Transcript</span>
              </button>

              <button
                type="button"
                className="mobile-grid-action-btn"
                onClick={() => {
                  onStartVerification(session.session_id)
                  changeStage('verification')
                }}
              >
                <div className="mobile-grid-action-icon mobile-grid-action-icon--verify">☑</div>
                <span className="mobile-grid-action-label">Verify Transcript</span>
              </button>

              <button
                type="button"
                className="mobile-grid-action-btn"
                onClick={handleOpenReportProcessing}
              >
                <div className="mobile-grid-action-icon mobile-grid-action-icon--brain">🧠</div>
                <span className="mobile-grid-action-label">Process with AI</span>
              </button>

              <button
                type="button"
                className="mobile-grid-action-btn"
                onClick={() => changeStage('final_report')}
              >
                <div className="mobile-grid-action-icon mobile-grid-action-icon--edit">✏️</div>
                <span className="mobile-grid-action-label">Editing</span>
              </button>

              <button
                type="button"
                className="mobile-grid-action-btn"
                onClick={() => changeStage('final_report')}
              >
                <div className="mobile-grid-action-icon mobile-grid-action-icon--report">📄</div>
                <span className="mobile-grid-action-label">Final Report</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DESKTOP SESSION WORKSPACE (Unchanged Desktop Layout)           */}
      {/* ------------------------------------------------------------- */}
      <div className="desktop-session-workspace-layout">
      {/* 1. Header Bar: Programme (muted, secondary) + Session Title (dominant) + Meta line */}
      <div className="session-workspace-header">
        <div className="session-workspace-header-content">
          <div className="session-programme-eyebrow">{progDisplay}</div>

          <div className="session-title-row">
            <h1 className="session-dominant-title">
              {sessionDisplay}
              {(session?.day_number || session?.metadata?.day_number) && (
                <span className="session-day-badge" title={`Day ${session.day_number || session.metadata?.day_number}`}>
                  {session.day_number || session.metadata?.day_number}
                </span>
              )}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <AutomaticVerificationToggle unit={sessionUnit} variant="compact" />
              <button
                type="button"
                className="btn-workspace-edit-details"
                onClick={() => setIsEditModalOpen(true)}
                title="Edit session details"
              >
                <PencilIcon />
                <span>Edit Details</span>
              </button>
            </div>
          </div>

          <div className="session-workspace-meta-line">
            <span className="session-meta-item">
              <CalendarIcon />
              <span>{dateDisplay}</span>
            </span>
            <span className="session-meta-item">
              <UserIcon />
              <span>{preacherDisplay}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Verification Action Strip (floating white card matching reference design) */}
      {(() => {
        const isSessionVerified = isVerified
        const hasFinalDoc = (fStatus === 'complete') || session?.final_report_id || session?.docx_file_path || session?.report_processing_status === 'completed'

        if (!isSessionVerified && flagCount > 0) {
          const remaining = Math.max(0, flagCount - resolvedCount)
          return (
            <div className="verification-action-strip">
              <div className="verification-strip-left">
                <div className="verification-strip-icon-box" aria-hidden="true">
                  <DocumentIcon />
                </div>
                <span className="verification-strip-text">
                  {remaining > 0 ? `${remaining} sections need verification` : `${flagCount} sections need verification`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AutomaticVerificationToggle unit={sessionUnit} variant="compact" />
                <button
                  type="button"
                  className="btn-verify-cta"
                  onClick={() => {
                    onStartVerification(session.session_id)
                    changeStage('verification')
                  }}
                  id="btn-workspace-begin-verify"
                >
                  Verify →
                </button>
              </div>
            </div>
          )
        }

        if (isSessionVerified) {
          if (hasFinalDoc) {
            return (
              <div className="verification-action-strip">
                <div className="verification-strip-left">
                  <div className="verification-strip-icon-box" aria-hidden="true">
                    <DocumentIcon />
                  </div>
                  <span className="verification-strip-text">
                    Report ready
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-verify-cta"
                  onClick={() => changeStage('final_report')}
                  id="btn-workspace-view-report"
                >
                  View report →
                </button>
              </div>
            )
          }

          return (
            <div className="verification-action-strip">
              <div className="verification-strip-left">
                <div className="verification-strip-icon-box" aria-hidden="true">
                  <DocumentIcon />
                </div>
                <span className="verification-strip-text">
                  Transcript verified
                </span>
              </div>
              <button
                type="button"
                className="btn-verify-cta"
                onClick={handleOpenReportProcessing}
                id="btn-workspace-process-ai"
              >
                Process with AI →
              </button>
            </div>
          )
        }

        return null
      })()}

      {/* 4. Session Materials Section (6 Artifact Cards) */}
      <section className="session-materials-section" aria-label="Session Materials">
        <h2 className="session-materials-heading">Session Materials</h2>

        <div className="workspace-artifacts-grid">
          {/* Tile 1: Audio Recording */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <MicIcon />
              </div>
              <span className="badge badge--success-pill">✓ Saved</span>
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Audio Recording</h3>
              <p className="artifact-tile-desc">{durationDisplay}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => {
                  const audioUrl = getApiUrl(`/api/sessions/${session.session_id}/audio`)
                  const a = new Audio(audioUrl)
                  a.play().catch(() => changeStage('raw_transcript'))
                }}
                style={{ flex: 1 }}
              >
                ▶ Play
              </button>
              <a
                href={getApiUrl(`/api/sessions/${session.session_id}/audio/download`)}
                className="btn-tile-action btn-tile-action--active"
                style={{
                  flex: 1,
                  textAlign: 'center',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
                download
                title="Download original WAV master recording"
                id="btn-workspace-download-audio"
              >
                ⬇ Download
              </a>
            </div>
          </div>

          {/* Tile 2: Raw Transcript */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {hasTranscript ? (
                <span className="badge badge--success-pill">✓ Ready</span>
              ) : (
                <span className="badge badge--neutral-pill">● Audio Only</span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Raw Transcript</h3>
              <p className="artifact-tile-desc">
                {hasTranscript
                  ? `${session.segment_count || (session.segments ? session.segments.length : 0)} segments`
                  : 'Recording-only session'}
              </p>
            </div>
            {hasTranscript ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('raw_transcript')}
              >
                View Raw Transcript
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
                title="No transcript generated during recording-only mode"
              >
                <LockIcon />
                <span>Audio preserved (No transcript)</span>
              </button>
            )}
          </div>

          {/* Tile 3: Verified Transcript */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {isVerified ? (
                <span className="badge badge--success-pill">✓ Verified</span>
              ) : (
                <span className="badge badge--neutral-pill">● Pending</span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Verified Transcript</h3>
              <p className="artifact-tile-desc">
                {isVerified ? 'Approved Factual Record' : 'Human verification required'}
              </p>
            </div>
            {isVerified ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('verified_transcript')}
              >
                View Verified Transcript
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
              >
                <LockIcon />
                <span>Will be available after verification</span>
              </button>
            )}
          </div>

          {/* Tile 4: Reporter Drafts */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {rStatus === 'reports_ready' || fStatus === 'complete' ? (
                <span className="badge badge--success-pill">✓ Ready</span>
              ) : (
                <span className="badge badge--locked-pill">
                  <LockIcon /> Locked
                </span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Reporter Drafts</h3>
              <p className="artifact-tile-desc">
                {rStatus === 'reports_ready' || fStatus === 'complete' ? 'Reporter A & B Complete' : 'Not yet available'}
              </p>
            </div>
            {rStatus === 'reports_ready' || fStatus === 'complete' ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('final_report')}
              >
                View in Report
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
              >
                <LockIcon />
                <span>Will be available after processing</span>
              </button>
            )}
          </div>

          {/* Tile 5: Edited Report */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {eStatus === 'complete' || fStatus === 'complete' ? (
                <span className="badge badge--success-pill">✓ Complete</span>
              ) : (
                <span className="badge badge--locked-pill">
                  <LockIcon /> Locked
                </span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Edited Report</h3>
              <p className="artifact-tile-desc">
                {eStatus === 'complete' || fStatus === 'complete' ? 'Theological Review' : 'Not yet available'}
              </p>
            </div>
            {eStatus === 'complete' || fStatus === 'complete' ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('final_report')}
              >
                View in Report
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
              >
                <LockIcon />
                <span>Will be available after processing</span>
              </button>
            )}
          </div>

          {/* Tile 6: Final Report */}
          <div className="card artifact-tile">
            <div className="artifact-tile-header">
              <div className="artifact-tile-icon-box">
                <DocumentIcon />
              </div>
              {fStatus === 'complete' ? (
                <span className="badge badge--success-pill">✓ Final</span>
              ) : (
                <span className="badge badge--locked-pill">
                  <LockIcon /> Locked
                </span>
              )}
            </div>
            <div className="artifact-tile-body">
              <h3 className="artifact-tile-title">Final Report</h3>
              <p className="artifact-tile-desc">
                {fStatus === 'complete' ? 'Archival & Word (.docx)' : 'Not yet available'}
              </p>
            </div>
            {fStatus === 'complete' ? (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--active"
                onClick={() => changeStage('final_report')}
              >
                View report →
              </button>
            ) : (
              <button
                type="button"
                className="btn-tile-action btn-tile-action--locked"
                disabled
              >
                <LockIcon />
                <span>Will be available in this stage</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Operational Notice (if interrupted) */}
      {session.is_interrupted ? (
        <div className="workspace-operational-notice">
          <div className="notice-icon">ℹ️</div>
          <div className="notice-body">
            <strong>Operational Notice</strong>
            <p>{session.recovery_notes || 'Brief interruption recorded. Master lossless recording safely preserved.'}</p>
          </div>
        </div>
      ) : null}
        </div>
      </div>
    )
  }

  return (
    <>
      {subViewContent}

      {/* 5. Centered Floating Dialog for Editing Session Details */}
      <EditSessionDetailsModal
        isOpen={isEditModalOpen}
        session={session}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveDetails}
      />

      <ReportProcessingModal
        isOpen={showReportProcessingModal}
        session={session}
        onClose={() => {
          setShowReportProcessingModal(false)
          if (onNavigateStage) {
            onNavigateStage('overview')
          } else {
            changeStage('overview')
          }
        }}
        onViewReport={() => changeStage('final_report')}
        onProcessingComplete={() => {
          if (onFinaliseVerification) onFinaliseVerification()
        }}
      />
    </>
  )
}

/**
 * EditSessionDetailsModal — Centered floating dialog for editing:
 * (1) Event / Programme
 * (2) Session / Section (cascading dependency)
 * (3) Pastor / Minister
 * Persists immediately via onSave, without refresh. No start/stop timestamps.
 */
function EditSessionDetailsModal({ isOpen, session, onClose, onSave }) {
  const { programme: initialProg, sessionTitle: initialSess, preacher: initialPreacher } = getSessionHierarchy(session)
  const initialDay = session?.day_number || session?.metadata?.day_number || ''
  const [programmes, setProgrammes] = useState([])
  const [selectedProgramme, setSelectedProgramme] = useState(initialProg)
  const [customProgramme, setCustomProgramme] = useState('')
  const [selectedSession, setSelectedSession] = useState(initialSess)
  const [customSession, setCustomSession] = useState('')
  const [dayNumber, setDayNumber] = useState(initialDay)
  const [minister, setMinister] = useState(initialPreacher)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    let isMounted = true
    async function loadProgrammes() {
      try {
        const res = await fetch(getApiUrl('/api/programmes?include_archived=false'))
        if (res.ok && isMounted) {
          const data = await res.json()
          setProgrammes(data)
        }
      } catch (err) {
        console.error('Failed to load programmes in EditSessionDetailsModal:', err)
      }
    }
    loadProgrammes()
    return () => { isMounted = false }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setSelectedProgramme(initialProg)
      setSelectedSession(initialSess)
      setDayNumber(session?.day_number || session?.metadata?.day_number || '')
      setMinister(initialPreacher)
      setCustomProgramme('')
      setCustomSession('')
      setErrorMsg(null)
    }
  }, [isOpen, initialProg, initialSess, initialPreacher, session?.day_number, session?.metadata?.day_number])

  if (!isOpen) return null

  const matchedProg = programmes.find((p) => p.name === selectedProgramme || p.id === selectedProgramme)
  const activeSessions = (matchedProg?.sessions || []).filter((s) => !s.is_archived)

  const handleProgrammeChange = (val) => {
    setSelectedProgramme(val)
    if (val === '__none__') {
      return
    }
    if (val === '__custom__') {
      setSelectedSession('__custom__')
      return
    }
    const found = programmes.find((p) => p.name === val || p.id === val)
    const progSessions = (found?.sessions || []).filter((s) => !s.is_archived)
    if (progSessions.length > 0) {
      setSelectedSession(progSessions[0].name)
    } else {
      setSelectedSession('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)

    const finalProgramme = selectedProgramme === '__none__'
      ? ''
      : selectedProgramme === '__custom__'
      ? customProgramme.trim()
      : selectedProgramme.trim()
    const finalSession = selectedSession === '__custom__'
      ? customSession.trim()
      : selectedSession.trim()
    const finalMinister = minister.trim()

    if (selectedProgramme !== '__none__' && !finalProgramme) {
      setErrorMsg('Please select or specify an Event / Programme.')
      return
    }
    if (!finalSession) {
      setErrorMsg('Please select or enter a Session / Section name.')
      return
    }

    try {
      setIsSaving(true)
      const parsedDay = dayNumber ? parseInt(dayNumber, 10) : null
      const success = await onSave({
        programme: finalProgramme,
        sessionTitle: finalSession,
        minister: finalMinister,
        day_number: parsedDay && parsedDay > 0 ? parsedDay : null,
      })
      if (success) {
        onClose()
      } else {
        setErrorMsg('Failed to update session details. Please try again.')
      }
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="edit-details-title">
      <div className="modal-container modal-container--edit-details" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 id="edit-details-title" className="modal-title">Edit Session Details</h2>
            <p className="modal-subtitle">Update event metadata, session classification, and minister</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-details-form">
          {errorMsg && (
            <div className="edit-details-error-banner" role="alert">
              {errorMsg}
            </div>
          )}

          {/* 1. Event / Programme (Optional / Standalone) */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-event-select">
              Event / Programme <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.85em' }}>(Optional)</span>
            </label>
            <select
              id="edit-event-select"
              className="form-control"
              value={
                selectedProgramme === '__none__' || !selectedProgramme
                  ? '__none__'
                  : programmes.some((p) => p.name === selectedProgramme)
                  ? selectedProgramme
                  : selectedProgramme === '__custom__'
                  ? '__custom__'
                  : selectedProgramme
              }
              onChange={(e) => handleProgrammeChange(e.target.value)}
            >
              <option value="__none__">[ None / Standalone ]</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
              {selectedProgramme &&
                selectedProgramme !== '__none__' &&
                selectedProgramme !== '__custom__' &&
                !programmes.some((p) => p.name === selectedProgramme) && (
                  <option value={selectedProgramme}>{selectedProgramme} (Current)</option>
              )}
              <option value="__custom__">+ Custom Event / Programme...</option>
            </select>
          </div>

          {selectedProgramme === '__custom__' && (
            <div className="form-group form-group--nested">
              <label className="form-label" htmlFor="edit-custom-event-input">
                Custom Event Name <span className="form-required">*</span>
              </label>
              <input
                id="edit-custom-event-input"
                type="text"
                className="form-control"
                placeholder="e.g. Special Ministers Conference"
                value={customProgramme}
                onChange={(e) => setCustomProgramme(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}

          {/* 2. Session / Section (Cascading) */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-session-select">
              Session / Section <span className="form-required">*</span>
            </label>
            {activeSessions.length > 0 && selectedProgramme !== '__custom__' ? (
              <select
                id="edit-session-select"
                className="form-control"
                value={
                  activeSessions.some((s) => s.name === selectedSession)
                    ? selectedSession
                    : selectedSession === '__custom__'
                    ? '__custom__'
                    : selectedSession || ''
                }
                onChange={(e) => setSelectedSession(e.target.value)}
                required
              >
                <option value="" disabled>Select a Session / Section...</option>
                {activeSessions.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
                {selectedSession && !activeSessions.some((s) => s.name === selectedSession) && selectedSession !== '__custom__' && (
                  <option value={selectedSession}>{selectedSession} (Current)</option>
                )}
                <option value="__custom__">+ Custom Session Name...</option>
              </select>
            ) : (
              <input
                id="edit-session-input"
                type="text"
                className="form-control"
                placeholder="e.g. Sunday Morning Worship Service"
                value={selectedSession === '__custom__' ? customSession : selectedSession}
                onChange={(e) => {
                  setSelectedSession(e.target.value)
                  setCustomSession(e.target.value)
                }}
                required
              />
            )}
          </div>

          {selectedSession === '__custom__' && activeSessions.length > 0 && selectedProgramme !== '__custom__' && (
            <div className="form-group form-group--nested">
              <label className="form-label" htmlFor="edit-custom-session-input">
                Custom Session Name <span className="form-required">*</span>
              </label>
              <input
                id="edit-custom-session-input"
                type="text"
                className="form-control"
                placeholder="e.g. Day 2 Morning Impartation"
                value={customSession}
                onChange={(e) => setCustomSession(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}

          {/* 3. Day Number (Optional) */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-day-input">
              Day <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.85em' }}>(Optional numeric day e.g. 2)</span>
            </label>
            <input
              id="edit-day-input"
              type="number"
              min="1"
              max="365"
              className="form-control"
              placeholder="e.g. 2"
              value={dayNumber}
              onChange={(e) => setDayNumber(e.target.value)}
            />
          </div>

          {/* 4. Pastor / Minister */}
          <div className="form-group">
            <label className="form-label" htmlFor="edit-minister-input">
              Pastor / Minister
            </label>
            <input
              id="edit-minister-input"
              type="text"
              className="form-control"
              placeholder="e.g. Pastor W.F. Kumuyi"
              value={minister}
              onChange={(e) => setMinister(e.target.value)}
            />
          </div>

          <div className="modal-actions edit-details-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isSaving}
            >
              {isSaving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
