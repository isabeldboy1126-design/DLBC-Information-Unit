import React, { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl } from '../../config'
import { Icon } from '../common/Icon'
import { SourceAudio } from '../common/SourceAudio'
import { SourceReferenceDrawer } from '../editing/SourceReferenceDrawer'

export function FinalReportView({ session, onBack, onNavigateToProofreading, onReportUpdated }) {
 const sessionId = session?.session_id
 const [data, setData] = useState(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState(null)
 const [feedback, setFeedback] = useState(null)
 const [busy, setBusy] = useState(null)
 const [editing, setEditing] = useState(false)
 const [title, setTitle] = useState('')
 const [text, setText] = useState('')
 const [reviewed, setReviewed] = useState(false)
 const [sourceReviewed, setSourceReviewed] = useState(false)
 const [sourceTitleOverride, setSourceTitleOverride] = useState('')
 const [showRevisions, setShowRevisions] = useState(false)
 const [showSource, setShowSource] = useState(false)
 const loadRequestRef = useRef(0)
 const currentSessionRef = useRef(sessionId)
 currentSessionRef.current = sessionId
 const load = useCallback(async () => {
  const request = ++loadRequestRef.current
  setReviewed(false)
  setSourceReviewed(false)
  setSourceTitleOverride('')
  setData(previous => previous ? { ...previous, can_export: false, can_approve: false, can_finalize: false } : previous)
  try {
   const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}`))
   if (!res.ok) throw new Error(`Report unavailable (${res.status}).`)
   const next = await res.json()
   if (request !== loadRequestRef.current) return false
   setData(next)
   const report = next.active_final_report || next.source_proofread_report
   setTitle(report?.report_title || report?.proofread_title || session?.title || '')
   setText(report?.report_text || report?.proofread_text || '')
   setReviewed(false)
   return true
  } catch (e) { if (request === loadRequestRef.current) setError(e.message); return false } finally { if (request === loadRequestRef.current) setLoading(false) }
 }, [sessionId, session?.title])
 useEffect(() => { setData(null); setLoading(true); setError(null); setFeedback(null); setEditing(false); load(); return () => { loadRequestRef.current++ } }, [load])
 const acceptedSource = data?.source_proofread_report
 const acceptedTitle = acceptedSource?.proofread_title || acceptedSource?.report_title || 'Untitled accepted report'
 const active = data?.active_final_report
 const approved = data?.can_export === true && active?.approval_status === 'approved'
 const revisionId = active?.id
 const wordCount = text.trim().split(/\s+/).filter(Boolean).length
 const action = async (kind, path, body) => {
  setBusy(kind); setError(null); setFeedback(null)
  try {
   const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}/${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
   if (currentSessionRef.current !== sessionId) return
   if (!res.ok) {
    if (res.status === 409) {
     setReviewed(false)
     setSourceReviewed(false)
     setData(previous => previous ? { ...previous, can_export: false, can_approve: false, can_finalize: false } : previous)
    }
    const result = await res.json()
    throw new Error(result.detail || `Action failed (${res.status}).`)
   }
   setEditing(false)
   const refreshed = await load()
   await onReportUpdated?.()
   if (!refreshed) throw new Error('The change was saved, but the current report could not be refreshed. Reload before approving or exporting.')
   setFeedback(kind === 'approve' || kind === 'finalize' ? 'Approval saved. Export is available only for the current approved revision.' : 'Revision saved. Review and approve this revision before exporting.')
  } catch (e) { if (currentSessionRef.current === sessionId) setError(e.message) } finally { if (currentSessionRef.current === sessionId) setBusy(null) }
 }
 const download = async () => {
  if (!approved || editing) return
  setBusy('download'); setError(null)
  try {
   const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}/download`))
   if (!res.ok) { const result = await res.json(); throw new Error(result.detail || 'Approved document could not be downloaded.') }
   const url = URL.createObjectURL(await res.blob())
   const a = document.createElement('a'); a.href = url; a.download = `${title || 'Report'}.docx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
   setFeedback('Approved document downloaded.')
  } catch (e) { if (currentSessionRef.current === sessionId) setError(e.message) } finally { if (currentSessionRef.current === sessionId) setBusy(null) }
 }
 const copy = async () => {
  try { await navigator.clipboard.writeText(`# ${title}\n\n${text}`); setFeedback('Report text copied.') }
  catch { setError('Clipboard unavailable. Select and copy the report text instead.') }
 }
 return <div className="final-report-workspace">
  <div className="reporting-ready-floating-card">
   <div className="ready-card-left"><Icon name="document" size={24} /><div className="ready-card-text"><span className="editorial-eyebrow">{approved ? 'APPROVED REPORT' : active?.approval_status === 'legacy_unreviewed' ? 'LEGACY REPORT • REVIEW REQUIRED' : 'DRAFT • HUMAN REVIEW REQUIRED'}</span><h2 className="ready-card-title">{title || 'Report review'}</h2><p>{wordCount} words {active ? `• Revision ${active.revision_number || 1}` : ''}</p></div></div>
   <div className="ready-card-actions"><button className="btn btn--secondary" onClick={() => setShowSource(v => !v)} aria-expanded={showSource}><Icon name="document" /> {showSource ? 'Hide source' : 'Source context'}</button><button className="btn btn--secondary" onClick={copy} disabled={!text}><Icon name="copy" /> Copy text</button><button className="btn btn--primary" onClick={download} disabled={!approved || editing || !!busy} id="btn-download-final-docx-card"><Icon name="download" /> {busy === 'download' ? 'Downloading…' : 'Download approved document'}</button></div>
  </div>
  {error && <div className="error-banner" role="alert">{error}<button className="btn btn--secondary" onClick={() => { setError(null); load() }}>Reload report</button></div>}
  {feedback && <div className="feedback-banner" role="status">{feedback}</div>}
  {loading ? <p role="status">Loading saved report…</p> : !text ? <div className="card" style={{ padding: 24 }}><h3>No report available</h3><p>Prepare a report from the verified transcript, or finish reviewing the proofread revision.</p><button className="btn btn--secondary" onClick={onBack}>Back to session</button>{onNavigateToProofreading && <button className="btn btn--secondary" onClick={onNavigateToProofreading}>Review proofreading</button>}</div> : <>
   <div className="approval-review-note">
    {approved ? <p>Human approval is recorded for this saved revision. A correction creates a new draft requiring review.</p> : <p>{active?.approval_status === 'legacy_unreviewed' ? 'This earlier report has no recorded human approval. ' : ''}Review the full report against the verified transcript and source audio before approval. AI generation alone does not approve a report.</p>}
    {!approved && active && <div className="approval-actions"><label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={editing || !!busy} /> I have reviewed this saved revision against the source.</label><button className="btn btn--primary" id="btn-approve-report" disabled={!reviewed || editing || !!busy || !data?.can_approve || !revisionId || !!session?.is_archived} onClick={() => action('approve', 'approve', { revision_id: revisionId })}><Icon name="check" /> {busy === 'approve' ? 'Approving…' : 'Approve this revision'}</button></div>}
    {data?.can_finalize && acceptedSource && <section className="accepted-source-review" aria-label="Accepted proofread source">
      <h3>{active ? 'Replace with the accepted proofread report' : 'Approve the accepted proofread report'}</h3>
      <p>{active ? 'The current saved report will remain in revision history. ' : ''}This action uses the accepted source below.</p>
      <h4>{acceptedTitle}</h4>
      <p className="card-subtitle">Accepted proofread revision {acceptedSource.revision_number || acceptedSource.revision_id || 'saved'}</p>
      <details><summary>Read accepted source</summary><pre className="report-pre">{acceptedSource.proofread_text || acceptedSource.report_text}</pre></details>
      <label htmlFor="accepted-title-override">Final title override (optional)</label>
      <input id="accepted-title-override" value={sourceTitleOverride} onChange={e => { setSourceTitleOverride(e.target.value); setSourceReviewed(false) }} placeholder={acceptedTitle} disabled={!!busy} />
      <div className="approval-actions"><label><input type="checkbox" checked={sourceReviewed} onChange={e => setSourceReviewed(e.target.checked)} disabled={!!busy || editing} /> I have reviewed this accepted proofread revision and its final title.</label>
      <button className="btn btn--primary" id="btn-finalize-accepted" disabled={!sourceReviewed || !!busy || editing || !!session?.is_archived} onClick={() => action('finalize', 'finalize', { proofread_revision_id: acceptedSource.revision_id, ...(sourceTitleOverride.trim() ? { report_title: sourceTitleOverride.trim() } : {}) })}>{active ? 'Replace and approve accepted report' : 'Approve accepted proofread report'}</button></div>
    </section>}
   </div>
   <div className={`source-disclosure ${showSource ? 'is-open' : ''}`}><section aria-label="Source context" inert={!showSource} aria-hidden={!showSource}><SourceReferenceDrawer sources={{ verified_text: session?.verified_text }} /><SourceAudio source={session} /></section></div>
   <div className="final-report-page-grid"><aside className="final-report-meta-sidebar"><div className="session-meta-panel"><h4>Session record</h4><div className="meta-field-item"><span className="meta-field-label">MINISTER</span><span className="meta-field-value">{active?.minister || session?.minister || 'Not recorded'}</span></div><div className="meta-field-item"><span className="meta-field-label">STATUS</span><span className="meta-field-value">{approved ? 'Approved' : 'Needs review'}</span></div>{active?.approved_at && <div className="meta-field-item"><span className="meta-field-label">APPROVED</span><span>{new Date(active.approved_at).toLocaleString()}</span></div>}</div><div className="post-final-box"><h5>Revision history</h5><p>Earlier versions remain preserved. Saving or restoring a revision requires renewed approval.</p><button className="btn btn--outline" onClick={() => { if (editing) load(); setEditing(v => !v); setReviewed(false) }} disabled={!!busy || !active || !!session?.is_archived}>{editing ? 'Cancel edit' : 'Edit new revision'}</button><button className="btn btn--secondary" onClick={() => setShowRevisions(v => !v)} aria-expanded={showRevisions}>Revisions ({data?.revisions?.length || 0})</button>{showRevisions && <ul className="revision-review-list">{data?.revisions?.map(r => <li key={r.id}><span>Revision {r.revision_number} • {r.approval_status || 'Needs review'}</span><button className="btn btn--secondary" disabled={!!busy || editing || r.id === revisionId || !!session?.is_archived} onClick={() => action('restore', `revisions/${r.id}/activate`)}>Restore for review</button></li>)}</ul>}</div></aside>
    <div>{editing ? <div className="editing-paper-surface"><label htmlFor="report-title">Report title</label><input id="report-title" className="editing-paper-title-input" value={title} onChange={e => setTitle(e.target.value)} /><label htmlFor="report-text">Report text</label><textarea id="report-text" className="editing-paper-textarea" rows={22} value={text} onChange={e => setText(e.target.value)} /><button className="btn btn--primary" id="btn-save-final-revision" disabled={!!busy || !text.trim()} onClick={() => action('save', 'save-revision', { report_title: title.trim(), report_text: text.trim() })}>{busy === 'save' ? 'Saving…' : 'Save new draft revision'}</button></div> : <article className="final-archival-paper-card"><div className="archival-doc-supertitle">DLBC INFORMATION UNIT • {approved ? 'APPROVED REPORT' : 'REVIEW COPY'}</div><h1 className="archival-doc-main-title">{title}</h1><hr className="archival-doc-divider" /><div className="archival-body-text"><pre>{text}</pre></div><footer className="archival-doc-footer-centered">{wordCount} words • Source and revision records preserved</footer></article>}</div>
   </div>
  </>}
 </div>
}
