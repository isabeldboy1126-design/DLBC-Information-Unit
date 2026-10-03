import React, { useState } from 'react'
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
  const [showNewDocModal, setShowNewDocModal] = useState(false)
  const [starredIds, setStarredIds] = useState(() => {
    try {
      const stored = localStorage.getItem('dlbc_workspace_starred')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

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
  }

  // If a document is active for editing, render the full-featured WorkspaceEditor
  if (currentEditingId) {
    const activeSession = sessions.find((s) => s.session_id === currentEditingId) || { session_id: currentEditingId }
    return (
      <WorkspaceEditor
        sessionId={currentEditingId}
        session={activeSession}
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

  // Derive documents from church sessions
  const allDocuments = sessions.map((s) => {
    const title = s.session_title || s.title || s.programme || s.event_type || 'Worship Service'
    const sessionLabel = s.programme || s.event_type || 'Sunday Service'
    const isFinalized = s.final_report_status === 'complete' || s.status === 'completed'
    const isEdited = s.editing_status === 'complete' || s.report_processing_status === 'completed'
    const statusLabel = isFinalized ? 'Finalized' : isEdited ? 'Edited' : 'Draft'

    let updatedDate = 'Recent'
    if (s.date_created) {
      try {
        updatedDate = new Date(s.date_created).toLocaleDateString('en-US', {
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
      status: statusLabel,
      words: s.word_count || (statusLabel === 'Finalized' ? 1842 : statusLabel === 'Edited' ? 1203 : 620),
      session: s,
    }
  })

  // Filter documents by tab and search query
  const filteredDocuments = allDocuments.filter((doc) => {
    if (activeTab === 'starred' && !starredIds.includes(doc.sessionId)) return false
    if (activeTab === 'recent') {
      // Show top 6
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return doc.title.toLowerCase().includes(q) || doc.sessionName.toLowerCase().includes(q)
    }
    return true
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

  const handleSelectDoc = (sId) => {
    setSelectedSessionId(sId)
    if (onSelectDocument) {
      onSelectDocument(sId)
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
            onClick={() => setShowNewDocModal(true)}
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
          onClick={() => setShowNewDocModal(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create New Document
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
                onClick={() => setShowNewDocModal(true)}
              >
                Choose Session Report
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. MODAL: CHOOSE SESSION REPORT TO EDIT                       */}
      {/* ------------------------------------------------------------- */}
      {showNewDocModal && (
        <div className="modal-overlay" onClick={() => setShowNewDocModal(false)}>
          <div
            className="workspace-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="media-modal-header">
              <h2 className="media-modal-title">Open Session in Workspace</h2>
              <button
                type="button"
                className="media-modal-close-btn"
                onClick={() => setShowNewDocModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="workspace-modal-body">
              <p className="workspace-modal-sub">
                Select an existing church session report to open and refine in the Workspace editor:
              </p>
              <div className="workspace-session-picker-list">
                {sessions.map((s) => {
                  const t = s.session_title || s.title || s.programme || 'Church Session'
                  const dateStr = s.date_created ? new Date(s.date_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'
                  return (
                    <div
                      key={s.session_id}
                      className="workspace-picker-item"
                      onClick={() => {
                        setShowNewDocModal(false)
                        handleSelectDoc(s.session_id)
                      }}
                    >
                      <div className="workspace-picker-left">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <div>
                          <strong>{t}</strong>
                          <span>{s.event_type || 'Worship Service'} · {dateStr}</span>
                        </div>
                      </div>
                      <span className="btn btn--small btn--secondary">Open</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="media-modal-footer">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowNewDocModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
