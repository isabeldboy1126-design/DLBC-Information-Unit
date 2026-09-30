import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../common/Icon'
import { SourceAudio } from '../common/SourceAudio'
import { SessionListStatus } from '../sessions/SessionListStatus'
import { sessionWorkflow, hasReviewableReport } from '../sessions/sessionWorkflow'
import { getApiUrl } from '../../config'

export const isActionableAttentionSession = session => !session?.is_archived && sessionWorkflow(session).attention
export const calculateTotalAttentionSessions = sessions => Array.isArray(sessions) ? sessions.filter(isActionableAttentionSession).length : 0
export const calculateTotalAttentionItems = calculateTotalAttentionSessions

function dateLabel(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Date not recorded'
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
function durationLabel(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)} min` : 'Duration not recorded'
}

export function DashboardView({ sessions = [], isLoading, sessionsLoaded, sessionsError, onRefresh, onStartLiveSession, onStartYouTubeSession, onOpenSession, onViewAllSessions, onFileSelect }) {
  const inputRef = useRef(null)
  const cache = useRef(new Map())
  const [selectedId, setSelectedId] = useState(null)
  const [mobilePanel, setMobilePanel] = useState('list')
  const previewRef = useRef(null)
  const listHeadingRef = useRef(null)
  const previousPanelRef = useRef(mobilePanel)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [reload, setReload] = useState(0)
  const work = [...sessions].filter(s => !s.is_archived && (!attentionOnly || isActionableAttentionSession(s))).sort((a, b) => new Date(b.date_created || 0) - new Date(a.date_created || 0))
  const selected = work.find(s => s.session_id === selectedId) || work[0]

  const selectedSessionId = selected?.session_id
  useEffect(() => {
    if (!selectedSessionId) { setPreview(null); setPreviewLoading(false); setPreviewError(null); return }
    const controller = new AbortController()
    const id = selectedSessionId
    setPreview(cache.current.get(id) || null)
    setPreviewLoading(true)
    setPreviewError(null)
    const load = async () => {
      try {
        const res = await fetch(getApiUrl(`/api/sessions/${encodeURIComponent(id)}`), { signal: controller.signal })
        if (!res.ok) throw new Error(`Session preview unavailable (${res.status}).`)
        const result = await res.json()
        if (!result.session || result.session.session_id !== id) throw new Error('Session preview response is invalid.')
        const source = result.session
        let artifact = { title: source.title || 'Untitled session', label: 'No transcript available', text: '', source }
        if (hasReviewableReport(source)) {
          const reportRes = await fetch(getApiUrl(`/api/final-report/sessions/${encodeURIComponent(id)}`), { signal: controller.signal })
          if (!reportRes.ok) throw new Error(`Saved report preview unavailable (${reportRes.status}).`)
          const reportData = await reportRes.json()
          const active = reportData.active_final_report
          if (active?.report_text) artifact = { title: active.report_title || artifact.title, text: active.report_text, source, label: reportData.can_export === true && active.approval_status === 'approved' ? 'Approved report' : 'Draft · needs review' }
          else if (reportData.source_proofread_report?.proofread_text) artifact = { title: reportData.source_proofread_report.proofread_title || artifact.title, text: reportData.source_proofread_report.proofread_text, source, label: 'Accepted proofread source · final review required' }
        } else if (source.verified_text) {
          artifact = { ...artifact, label: 'Verified transcript', text: source.verified_text }
        } else {
          const raw = source.raw_text || source.segments?.map(s => s.text || '').join('\n\n')
          if (raw) artifact = { ...artifact, label: 'Raw transcript · not verified', text: raw }
        }
        if (controller.signal.aborted) return
        cache.current.set(id, artifact)
        setPreview(artifact)
      } catch (error) {
        if (!controller.signal.aborted) setPreviewError(error.message)
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [selectedSessionId, selected?.final_report_status, selected?.verification_status, reload])

  useEffect(() => {
    if (previousPanelRef.current !== mobilePanel && window.matchMedia('(max-width: 760px)').matches) {
      if (mobilePanel === 'document') previewRef.current?.focus()
      else listHeadingRef.current?.focus()
    }
    previousPanelRef.current = mobilePanel
  }, [mobilePanel])

  const file = event => { const chosen = event.target.files?.[0]; if (chosen) onFileSelect?.(chosen); event.target.value = '' }
  const drop = event => { event.preventDefault(); if (event.dataTransfer.files?.[0]) onFileSelect?.(event.dataTransfer.files[0]) }
  const workflow = sessionWorkflow(selected)

  return <div className="editorial-desk" onDragOver={event => event.preventDefault()} onDrop={drop}>
    <div className="desk-workspace-toolbar"><h1>Workspace</h1><div className="desk-intake-actions">
      <button className="btn btn--primary" id="hero-card-live" onClick={onStartLiveSession}><Icon name="mic" />Record live</button>
      <button className="btn btn--secondary" id="hero-link-upload" onClick={() => inputRef.current?.click()}><Icon name="upload" />Import recording</button>
      <details className="desk-source-menu"><summary><Icon name="caret" /><span>More sources</span></summary><button onClick={onStartYouTubeSession} id="hero-card-youtube"><Icon name="play" />Open YouTube session</button></details>
      <input ref={inputRef} hidden type="file" accept="audio/*,video/*,.wav,.mp3,.mp4,.m4a" onChange={file} />
    </div></div>
    <div className="desk-mobile-view-switch" aria-label="Workspace view"><button aria-pressed={mobilePanel === 'list'} onClick={() => setMobilePanel('list')}>Session list</button><button aria-pressed={mobilePanel === 'document'} onClick={() => setMobilePanel('document')} disabled={!selected}>Selected document</button></div>
    <div className="desk-workspace-grid" data-mobile-panel={mobilePanel}>
      <section className="desk-session-list" aria-label="Session work list">
        <div className="desk-list-heading"><h2 ref={listHeadingRef} tabIndex={-1}>Continue your work</h2><button className="desk-text-action" onClick={onViewAllSessions}>View all <Icon name="arrow" size={16} /></button></div>
        <div className="desk-list-filter"><button aria-pressed={!attentionOnly} onClick={() => setAttentionOnly(false)}>All work</button><button aria-pressed={attentionOnly} onClick={() => setAttentionOnly(true)}>Needs attention ({calculateTotalAttentionSessions(sessions)})</button></div>
        <SessionListStatus isLoading={isLoading} hasLoaded={sessionsLoaded} error={sessionsError} onRefresh={onRefresh} />
        {sessionsLoaded && !isLoading && work.length === 0 && <div className="desk-empty-list"><Icon name="sessions" size={28} /><h3>{attentionOnly ? 'No work needs attention' : 'No recorded sessions found.'}</h3><p>{attentionOnly ? 'Choose All work to browse saved sessions.' : 'Record live or import an existing recording to start a session. Set up audio input before live capture.'}</p></div>}
        <div className="desk-work-items">{work.slice(0, 12).map(session => {
          const stage = sessionWorkflow(session)
          return <button className={`desk-work-item ${selected?.session_id === session.session_id ? 'is-selected' : ''}`} key={session.session_id} aria-pressed={selected?.session_id === session.session_id} onClick={() => { setSelectedId(session.session_id); if (window.matchMedia('(max-width: 760px)').matches) setMobilePanel('document') }}>
            <Icon name="document" size={24} /><span className="desk-work-copy"><strong>{session.title || 'Untitled session'}</strong><span>{durationLabel(session.duration_seconds)} · {dateLabel(session.date_created)}</span><span className={`desk-stage desk-stage--${stage.label === 'Approved' ? 'approved' : 'review'}`}><span aria-hidden="true" />{stage.label}</span></span><Icon name="arrow" size={18} />
          </button>
        })}</div>
      </section>
      <section className="desk-document-preview" aria-label="Selected session preview" ref={previewRef} tabIndex={-1} key={selected?.session_id || 'empty'}>
        {selected ? <>
          <div className="desk-preview-tools"><span><Icon name="document" />{preview?.label || 'Session source'}</span><button className="desk-text-action" onClick={() => onOpenSession(selected.session_id, workflow.stage)}>{workflow.action}<Icon name="arrow" size={16} /></button></div>
          <h2 className="desk-document-title">{preview?.title || selected.title || 'Untitled session'}</h2>
          <p className="desk-preview-metadata">{selected.minister || 'Minister not recorded'}{selected.programme ? ` · ${selected.programme}` : ''}</p>
          {previewLoading && <p className="desk-preview-notice">{preview ? 'Refreshing source preview…' : 'Loading selected source…'}</p>}
          {previewError && <div className="error-banner" role="alert">{previewError}{preview ? ' Showing previously loaded content.' : ''}<button className="btn btn--secondary" onClick={() => setReload(value => value + 1)}>Retry preview</button></div>}
          {preview?.text ? <article className="desk-document-prose"><pre>{preview.text}</pre></article> : !previewLoading && !previewError ? <div className="desk-document-empty"><h3>No transcript available yet</h3><p>Open the session to inspect its source and current work. A report will appear here only after it has been saved.</p></div> : null}
          {preview && <div className="desk-preview-source"><SourceAudio source={preview.source} /></div>}
        </> : <div className="desk-document-empty"><Icon name="document" size={32} /><h2>{sessionsError && !sessionsLoaded ? 'Your saved work is unavailable' : isLoading && !sessionsLoaded ? 'Loading your workspace' : 'A clear place to review the message'}</h2><p>{sessionsError && !sessionsLoaded ? 'Retry the session list to reconnect. Recording and import remain available.' : 'Select a saved session to read its available transcript or report alongside the original source.'}</p></div>}
      </section>
    </div>
  </div>
}
