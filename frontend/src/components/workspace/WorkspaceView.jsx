import React, { useState, useEffect } from 'react'
import { authFetch } from '../../config'
import { WorkspaceEditor } from './WorkspaceEditor'

/**
 * WorkspaceView — Documents Hub & Manager
 * Matches visual authority:
 * - Desktop: media_1791012340774.jpg (Panels 1, 7)
 * - Mobile: media_1791012340786.jpg (Panel 1)
 */
export function WorkspaceView({
  sessions = [],
  activeSessionId,
  onOpenSession,
  onSelectDocument,
  onCloseEditor,
  onBack,
  onRefreshSessions,
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(activeSessionId || null)
  const [activeTab, setActiveTab] = useState('documents') // 'documents' | 'recent' | 'starred'
  const [searchQuery, setSearchQuery] = useState('')
  const [customDocuments, setCustomDocuments] = useState(() => {
    try {
      const stored = localStorage.getItem('dlbc_workspace_documents')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [attributionModalDoc, setAttributionModalDoc] = useState(null)
  const [editorName, setEditorName] = useState(() => {
    try {
      return localStorage.getItem('dlbc_editor_name') || ''
    } catch {
      return ''
    }
  })
  const [starredIds, setStarredIds] = useState(() => {
    try {
      const stored = localStorage.getItem('dlbc_workspace_starred')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // Load documents from backend and merge with local
  useEffect(() => {
    let isMounted = true
    async function fetchServerDocuments() {
      try {
        const res = await authFetch('/api/workspace/documents')
        if (res.ok && isMounted) {
          const data = await res.json()
          const serverDocs = (data.documents || []).map((d) => ({
            id: d.id,
            sessionId: d.id,
            title: d.title || 'Untitled Document',
            content: d.content || '',
            updatedDate: d.updated_at ? new Date(d.updated_at).toLocaleDateString() : 'Recent',
            updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : Date.now(),
            status: d.status || 'Draft',
            words: d.words || (d.content ? d.content.trim().split(/\s+/).filter(Boolean).length : 0),
            isManual: true,
          }))

          setCustomDocuments((prev) => {
            const map = new Map()
            serverDocs.forEach((d) => map.set(d.id, d))
            prev.forEach((d) => {
              const existing = map.get(d.id)
              if (!existing || (d.updatedAt && d.updatedAt >= (existing.updatedAt || 0))) {
                map.set(d.id, d)
              }
            })
            const merged = Array.from(map.values())
            try {
              localStorage.setItem('dlbc_workspace_documents', JSON.stringify(merged))
            } catch {}
            return merged
          })
        }
      } catch (err) {
        console.warn('Failed to load server workspace documents:', err)
      }
    }
    fetchServerDocuments()
    return () => { isMounted = false }
  }, [])

  // Synchronize with external activeSessionId prop
  const currentEditingId = activeSessionId || selectedSessionId

  // Toggle starred
  const handleToggleStar = (sId, e) => {
    e.stopPropagation()
    const next = starredIds.includes(sId)
      ? starredIds.filter((id) => id !== sId)
      : [...starredIds, sId]
    setStarredIds(next)
    try {
      localStorage.setItem('dlbc_workspace_starred', JSON.stringify(next))
    } catch (err) {
      // ignore
    }
    if (typeof sId === 'string' && sId.startsWith('doc_')) {
      authFetch(`/api/workspace/documents/${sId}/star`, { method: 'POST' }).catch(() => {})
    }
  }

  // Update a custom document in state and storage
  const handleUpdateCustomDocument = (updatedDoc) => {
    setCustomDocuments((prev) => {
      const index = prev.findIndex((d) => d.id === updatedDoc.id)
      let next
      if (index >= 0) {
        next = [...prev]
        next[index] = { ...next[index], ...updatedDoc, updatedAt: Date.now() }
      } else {
        next = [{ ...updatedDoc, updatedAt: Date.now() }, ...prev]
      }
      try {
        localStorage.setItem('dlbc_workspace_documents', JSON.stringify(next))
      } catch (e) {
        console.warn('Failed to update workspace document:', e)
      }
      return next
    })
  }

  // Open document directly into editor
  const openDocDirectly = (sId) => {
    setSelectedSessionId(sId)
    if (onSelectDocument) {
      onSelectDocument(sId)
    }
  }

  // 1. FIX + NEW DOCUMENT: immediately open Workspace Editor with a new blank editable document
  const handleCreateNewDocument = () => {
    // Avoid creating duplicate empty documents from repeated clicks
    const existingEmpty = customDocuments.find(
      (d) => (d.title === 'Untitled Document' || !d.title) && !d.content?.trim()
    )
    if (existingEmpty) {
      openDocDirectly(existingEmpty.id)
      return
    }

    const newDocId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const newDoc = {
      id: newDocId,
      sessionId: newDocId,
      title: 'Untitled Document',
      content: '',
      updatedDate: 'Just now',
      updatedAt: Date.now(),
      status: 'Draft',
      words: 0,
      isManual: true,
    }
    const nextList = [newDoc, ...customDocuments]
    setCustomDocuments(nextList)
    try {
      localStorage.setItem('dlbc_workspace_documents', JSON.stringify(nextList))
    } catch (e) {
      console.warn('Failed to save new document:', e)
    }

    // Persist new document to backend
    authFetch('/api/workspace/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newDocId,
        title: 'Untitled Document',
        content: '',
      }),
    }).catch((e) => console.warn('Async doc creation warning:', e))

    // Immediately open in editor WITHOUT asking "Who is editing?"
    openDocDirectly(newDocId)
  }

  // 2. EXISTING DOCUMENT OPENING: show attribution modal for existing reports
  const handleSelectDoc = (sId) => {
    const doc = allDocuments.find((d) => d.sessionId === sId)
    // If it's a brand-new blank document, skip attribution
    if (doc?.isManual && (!doc.content || !doc.content.trim()) && doc.title === 'Untitled Document') {
      openDocDirectly(sId)
      return
    }
    // Prompt attribution for existing documents/reports
    setAttributionModalDoc(doc || { sessionId: sId, title: 'Document' })
  }

  const handleConfirmAttribution = () => {
    if (!attributionModalDoc) return
    const name = editorName.trim() || 'Editor'
    try {
      localStorage.setItem('dlbc_editor_name', name)
    } catch {}
    const targetId = attributionModalDoc.sessionId
    setAttributionModalDoc(null)
    openDocDirectly(targetId)
  }

  // If a document is active for editing, render the full-featured WorkspaceEditor
  if (currentEditingId) {
    const customDoc = customDocuments.find((d) => d.id === currentEditingId)
    const sessionDoc = sessions.find((s) => s.session_id === currentEditingId)
    const activeDoc = customDoc || sessionDoc || { session_id: currentEditingId }
    return (
      <WorkspaceEditor
        sessionId={currentEditingId}
        session={activeDoc}
        isManual={Boolean(customDoc?.isManual)}
        editorName={editorName}
        onUpdateDocument={handleUpdateCustomDocument}
        onClose={() => {
          setSelectedSessionId(null)
          if (onCloseEditor) onCloseEditor()
        }}
        onBack={() => {
          setSelectedSessionId(null)
          if (onCloseEditor) onCloseEditor()
        }}
      />
    )
  }

  // Format custom standalone documents
  const manualDocsFormatted = customDocuments.map((d) => ({
    sessionId: d.id,
    title: d.title || 'Untitled Document',
    sessionName: 'Standalone Document',
    updatedDate: d.updatedDate || 'Recent',
    updatedAt: d.updatedAt || 0,
    status: d.status || 'Draft',
    words: d.words || (d.content ? d.content.trim().split(/\s+/).filter(Boolean).length : 0),
    isManual: true,
    content: d.content || '',
    doc: d,
  }))

  // Derive documents from church sessions
  const sessionDocsFormatted = sessions.map((s) => {
    const title = s.session_title || s.title || s.programme || s.event_type || 'Worship Service'
    const sessionLabel = s.programme || s.event_type || 'Sunday Service'
    const isFinalized = s.final_report_status === 'complete' || s.status === 'completed'
    const isEdited = s.editing_status === 'complete' || s.report_processing_status === 'completed'
    const statusLabel = isFinalized ? 'Finalized' : isEdited ? 'Edited' : 'Draft'

    let updatedDate = 'Recent'
    let updatedAt = 0
    if (s.date_created) {
      try {
        const d = new Date(s.date_created)
        updatedAt = d.getTime()
        updatedDate = d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      } catch {
        updatedDate = 'Recent'
      }
    }

    return {
      sessionId: s.session_id,
      title,
      sessionName: sessionLabel,
      updatedDate,
      updatedAt,
      status: statusLabel,
      words: s.word_count || (statusLabel === 'Finalized' ? 1842 : statusLabel === 'Edited' ? 1203 : 620),
      isManual: false,
      session: s,
    }
  })

  // Combine custom documents and session reports
  const allDocuments = [...manualDocsFormatted, ...sessionDocsFormatted]

  // Filter documents by tab and search query
  const filteredDocuments = allDocuments.filter((doc) => {
    if (activeTab === 'starred' && !starredIds.includes(doc.sessionId)) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return doc.title.toLowerCase().includes(q) || doc.sessionName.toLowerCase().includes(q)
    }
    return true
  }).sort((a, b) => {
    if (activeTab === 'recent') {
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    }
    return 0
  })

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Finalized':
        return <span className="workspace-badge badge--finalized">● Finalized</span>
      case 'Edited':
        return <span className="workspace-badge badge--edited">● Edited</span>
      case 'Draft':
      default:
        return <span className="workspace-badge badge--draft">● Draft</span>
    }
  }

  return (
    <div className="workspace-hub-root">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER (Desktop + Mobile)                              */}
      {/* ------------------------------------------------------------- */}
      <div className="workspace-hub-header">
        <div className="workspace-hub-header-left">
          <h1 className="workspace-heading-title">Workspace</h1>
          <p className="workspace-heading-sub">Review, edit and finalize reports.</p>
        </div>

        <div className="workspace-hub-header-right">
          <div className="workspace-search-box mobile-hidden">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="workspace-search-input"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="workspace-search-clear"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn--primary workspace-new-btn mobile-hidden"
            onClick={handleCreateNewDocument}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            + New Document
          </button>
        </div>
      </div>

      {/* Mobile Prominent Button (Matches Panel 1) */}
      <div className="workspace-mobile-action-bar desktop-hidden">
        <button
          type="button"
          className="btn btn--primary workspace-mobile-create-btn"
          onClick={handleCreateNewDocument}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          + New Document
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. TABS: My Documents | Recent | Starred                     */}
      {/* ------------------------------------------------------------- */}
      <div className="workspace-tabs-bar">
        <div className="workspace-tabs-list">
          <button
            type="button"
            className={`workspace-tab ${activeTab === 'documents' ? 'workspace-tab--active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            My Documents
          </button>
          <button
            type="button"
            className={`workspace-tab ${activeTab === 'recent' ? 'workspace-tab--active' : ''}`}
            onClick={() => setActiveTab('recent')}
          >
            Recent
          </button>
          <button
            type="button"
            className={`workspace-tab ${activeTab === 'starred' ? 'workspace-tab--active' : ''}`}
            onClick={() => setActiveTab('starred')}
          >
            Starred
            {starredIds.length > 0 && <span className="workspace-tab-count">{starredIds.length}</span>}
          </button>
        </div>
      </div>

      {/* Section Subheading (Mobile) */}
      <div className="workspace-section-title-row desktop-hidden">
        <span className="workspace-section-label">Recent Documents</span>
        <span className="workspace-see-all-link">See all →</span>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. DOCUMENTS TABLE / CARDS                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="workspace-table-container">
        {/* Desktop Header */}
        <div className="workspace-table-header mobile-hidden">
          <div className="ws-col ws-col-title">Title</div>
          <div className="ws-col ws-col-session">Session</div>
          <div className="ws-col ws-col-updated">Updated</div>
          <div className="ws-col ws-col-status">Status</div>
        </div>

        {/* Rows */}
        <div className="workspace-rows-stack">
          {filteredDocuments.length > 0 ? (
            filteredDocuments.map((doc) => {
              const isStarred = starredIds.includes(doc.sessionId)
              return (
                <div
                  key={doc.sessionId}
                  className="workspace-doc-row"
                  onClick={() => handleSelectDoc(doc.sessionId)}
                  role="button"
                  tabIndex={0}
                >
                  {/* Title Column */}
                  <div className="ws-col ws-col-title">
                    <div className="workspace-doc-glyph">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div className="workspace-title-stack">
                      <span className="workspace-doc-title">{doc.title}</span>
                      <span className="workspace-doc-sub desktop-hidden">
                        {doc.status} · {doc.updatedDate} · {doc.words.toLocaleString()} words
                      </span>
                    </div>
                  </div>

                  {/* Session Column (Desktop) */}
                  <div className="ws-col ws-col-session mobile-hidden">
                    <span className="workspace-session-text">{doc.sessionName}</span>
                  </div>

                  {/* Updated Column (Desktop) */}
                  <div className="ws-col ws-col-updated mobile-hidden">
                    <span className="workspace-date-text">{doc.updatedDate}</span>
                  </div>

                  {/* Status Column */}
                  <div className="ws-col ws-col-status">
                    <div className="workspace-status-action-row">
                      {getStatusBadge(doc.status)}
                      <button
                        type="button"
                        className={`workspace-star-btn ${isStarred ? 'starred' : ''}`}
                        onClick={(e) => handleToggleStar(doc.sessionId, e)}
                        title={isStarred ? 'Unstar' : 'Star document'}
                      >
                        ★
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="workspace-empty-card">
              <div className="workspace-empty-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <h3 className="workspace-empty-title">No documents found</h3>
              <p className="workspace-empty-desc">
                Select a completed church session to open its report in the Workspace editor.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleCreateNewDocument}
              >
                + New Document
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. MODAL: WHO IS EDITING? ATTRIBUTION MODAL                   */}
      {/* ------------------------------------------------------------- */}
      {attributionModalDoc && (
        <div className="modal-overlay" onClick={() => setAttributionModalDoc(null)}>
          <div
            className="workspace-modal-card"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attribution-dialog-title"
          >
            <div className="media-modal-header">
              <h2 id="attribution-dialog-title" className="media-modal-title">Who is editing?</h2>
              <button
                type="button"
                className="media-modal-close-btn"
                onClick={() => setAttributionModalDoc(null)}
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleConfirmAttribution()
              }}
            >
              <div className="workspace-modal-body" style={{ padding: '16px 20px' }}>
                <p className="workspace-modal-sub" style={{ marginBottom: 12 }}>
                  Opening <strong>{attributionModalDoc.title}</strong>. Enter your name or editorial role for revision attribution:
                </p>
                <input
                  type="text"
                  className="workspace-title-input"
                  style={{
                    width: '100%',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 14,
                    background: 'var(--bg-surface, #fff)',
                  }}
                  placeholder="e.g. Bro. Emmanuel / Sister Grace"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="media-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setAttributionModalDoc(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
