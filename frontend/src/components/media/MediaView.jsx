import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl } from '../../config'
import { useAuth } from '../../context/AuthContext'

/**
 * MediaView — Media Receiver & Ingest Hub (Desktop + Mobile)
 * Matches visual authority:
 * - Desktop: media_1791012340774.jpg (Panels 3, 4, 5, 6)
 * - Mobile: media_1791012340786.jpg (Panels 4, 5, 6)
 */
export function MediaView({ onBack, onOpenSession, onRefreshSessions, sessions = [] }) {
  const { user, demoMode } = useAuth()

  // State
  const [tokenData, setTokenData] = useState(null)
  const [loadingToken, setLoadingToken] = useState(true)
  const [recordings, setRecordings] = useState([])
  const [loadingRecordings, setLoadingRecordings] = useState(true)
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'needs_details' | 'processing' | 'ready' | 'processed'
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileSearchVisible, setMobileSearchVisible] = useState(false)

  // Modals
  const [selectedRecording, setSelectedRecording] = useState(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  // Direct Upload Form
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadEvent, setUploadEvent] = useState('Sunday Worship Service')
  const [uploadProgramme, setUploadProgramme] = useState('')
  const [uploadDay, setUploadDay] = useState('')
  const [uploadPastor, setUploadPastor] = useState('')
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  // Details Edit Form
  const [editProg, setEditProg] = useState('')
  const [editDay, setEditDay] = useState('')
  const [editPastor, setEditPastor] = useState('')
  const [isSavingDetails, setIsSavingDetails] = useState(false)
  const [isProcessingItem, setIsProcessingItem] = useState(false)
  const [actionError, setActionError] = useState(null)

  // PIN settings
  const [pinEnabled, setPinEnabled] = useState(false)
  const [pinCode, setPinCode] = useState('')
  const [savingPin, setSavingPin] = useState(false)

  const audioRef = useRef(null)

  // Fetch Token
  const fetchToken = async () => {
    try {
      const res = await fetch(getApiUrl('/api/media/token'), {
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
      })
      if (res.ok) {
        const data = await res.json()
        setTokenData(data)
        setPinEnabled(Boolean(data.has_pin))
      }
    } catch (e) {
      console.warn('Failed to fetch media token:', e)
    } finally {
      setLoadingToken(false)
    }
  }

  // Fetch Recordings
  const fetchRecordings = async () => {
    try {
      const res = await fetch(getApiUrl('/api/media/recordings'), {
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
      })
      if (res.ok) {
        const data = await res.json()
        setRecordings(data.recordings || [])
      }
    } catch (e) {
      console.warn('Failed to fetch media recordings:', e)
    } finally {
      setLoadingRecordings(false)
    }
  }

  useEffect(() => {
    fetchToken()
    fetchRecordings()
  }, [user])

  // Polling for processing items
  useEffect(() => {
    const hasProcessing = recordings.some((r) => r.status === 'processing')
    if (!hasProcessing) return

    const interval = setInterval(() => {
      fetchRecordings()
      if (onRefreshSessions) onRefreshSessions()
    }, 3500)
    return () => clearInterval(interval)
  }, [recordings])

  // Compute public upload URL
  const uploadUrl = typeof window !== 'undefined' && tokenData?.token
    ? `${window.location.origin}/#media/upload/${tokenData.token}`
    : ''

  const handleCopyLink = () => {
    if (!uploadUrl) return
    navigator.clipboard.writeText(uploadUrl).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2200)
    })
  }

  const handleShareLink = async () => {
    if (!uploadUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'DLBC Information Unit — Media Upload',
          text: 'Upload audio recording directly to the Information Unit:',
          url: uploadUrl,
        })
      } catch (e) {
        // Fallback to copy
        handleCopyLink()
      }
    } else {
      handleCopyLink()
    }
  }

  const handleRegenerateToken = async () => {
    try {
      const res = await fetch(getApiUrl('/api/media/token/regenerate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({ pin_code: pinEnabled && pinCode ? pinCode : null }),
      })
      if (res.ok) {
        const data = await res.json()
        setTokenData(data)
        setShowRegenerateModal(false)
      }
    } catch (e) {
      alert('Failed to regenerate upload link: ' + e.message)
    }
  }

  // Handle direct file upload
  const handleDirectUploadSubmit = async (e) => {
    e.preventDefault()
    if (!uploadFile) {
      setUploadError('Please choose an audio file.')
      return
    }
    setIsSubmittingUpload(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', uploadFile)
    if (uploadEvent) formData.append('event', uploadEvent)
    if (uploadProgramme) formData.append('programme', uploadProgramme)
    if (uploadDay) formData.append('day_number', uploadDay)
    if (uploadPastor) formData.append('pastor_name', uploadPastor)

    try {
      const res = await fetch(getApiUrl('/api/media/recordings/upload'), {
        method: 'POST',
        headers: {
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Upload failed')
      }
      await fetchRecordings()
      setShowUploadModal(false)
      setUploadFile(null)
      setUploadProgramme('')
      setUploadDay('')
      setUploadPastor('')
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setIsSubmittingUpload(false)
    }
  }

  // Open detail modal
  const handleOpenDetails = (rec) => {
    setSelectedRecording(rec)
    setEditProg(rec.programme || '')
    setEditDay(rec.day_number || '')
    setEditPastor(rec.pastor_name || '')
    setActionError(null)
  }

  // Save details
  const handleSaveDetails = async () => {
    if (!selectedRecording) return
    setIsSavingDetails(true)
    setActionError(null)
    try {
      const res = await fetch(getApiUrl(`/api/media/recordings/${selectedRecording.recording_id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          programme: editProg,
          day_number: editDay ? parseInt(editDay, 10) : null,
          pastor_name: editPastor,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to update details')
      }
      const updated = await res.json()
      setSelectedRecording(updated)
      await fetchRecordings()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setIsSavingDetails(false)
    }
  }

  // Process recording now
  const handleProcessNow = async () => {
    if (!selectedRecording) return
    setIsProcessingItem(true)
    setActionError(null)
    try {
      const res = await fetch(getApiUrl(`/api/media/recordings/${selectedRecording.recording_id}/process`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          programme: editProg || selectedRecording.programme,
          day_number: editDay ? parseInt(editDay, 10) : selectedRecording.day_number,
          pastor_name: editPastor || selectedRecording.pastor_name,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to start processing')
      }
      const data = await res.json()
      await fetchRecordings()
      if (onRefreshSessions) onRefreshSessions()
      if (data.session_id && onOpenSession) {
        setSelectedRecording(null)
        onOpenSession(data.session_id, 'overview')
      }
    } catch (e) {
      setActionError(e.message)
    } finally {
      setIsProcessingItem(false)
    }
  }

  // Delete recording
  const handleDeleteRecording = async (recId) => {
    if (!window.confirm('Are you sure you want to delete this received audio recording?')) return
    try {
      const res = await fetch(getApiUrl(`/api/media/recordings/${recId}`), {
        method: 'DELETE',
        headers: {
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
      })
      if (res.ok) {
        setSelectedRecording(null)
        await fetchRecordings()
      }
    } catch (e) {
      alert('Failed to delete recording: ' + e.message)
    }
  }

  // Filter recordings
  const filteredRecordings = recordings.filter((r) => {
    // Tab filter
    if (activeTab === 'pending' || activeTab === 'needs_details') {
      if (r.status !== 'needs_details' && r.status !== 'new') return false
    } else if (activeTab === 'processing') {
      if (r.status !== 'processing') return false
    } else if (activeTab === 'ready') {
      if (r.status !== 'ready' && r.status !== 'new') return false
    } else if (activeTab === 'processed') {
      if (r.status !== 'processed') return false
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const title = (r.title || '').toLowerCase()
      const prog = (r.programme || '').toLowerCase()
      const pastor = (r.pastor_name || '').toLowerCase()
      return title.includes(q) || prog.includes(q) || pastor.includes(q)
    }
    return true
  })

  // Format Helpers
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 MB'
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const formatDate = (iso) => {
    if (!iso) return 'Recent'
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return 'Recent'
    }
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'processing':
        return <span className="media-badge media-badge--processing"><span className="media-dot-pulse">●</span> Processing</span>
      case 'ready':
        return <span className="media-badge media-badge--ready">Ready</span>
      case 'processed':
        return <span className="media-badge media-badge--processed">Processed</span>
      case 'needs_details':
        return <span className="media-badge media-badge--warning">Needs Details</span>
      case 'new':
      default:
        return <span className="media-badge media-badge--new">New</span>
    }
  }

  return (
    <div className="media-hub-container">
      {/* Top Mobile Bar */}
      <div className="media-mobile-topbar desktop-hidden">
        <button
          type="button"
          className="media-mobile-back-btn"
          onClick={onBack}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="media-mobile-title">Media</h1>
        <div className="media-mobile-actions">
          <button
            type="button"
            className="media-icon-btn"
            onClick={() => setMobileSearchVisible(!mobileSearchVisible)}
            aria-label="Search"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button
            type="button"
            className="media-icon-btn"
            onClick={() => setShowUploadModal(true)}
            aria-label="Direct Upload"
            title="Upload audio file"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="media-main-content">
        {/* Desktop Header */}
        <div className="media-desktop-header mobile-hidden">
          <div className="media-desktop-header-left">
            <h1 className="media-heading-title">Media</h1>
            <p className="media-heading-sub">Receive and manage uploaded recordings from sound desk and media team.</p>
          </div>
          <div className="media-desktop-header-right">
            <div className="media-search-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search recordings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="media-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="media-search-clear"
                  onClick={() => setSearchQuery('')}
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn--secondary media-top-btn"
              onClick={() => setShowUploadModal(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload File
            </button>
          </div>
        </div>

        {/* Mobile Search Bar toggle */}
        {mobileSearchVisible && (
          <div className="media-mobile-search-bar desktop-hidden">
            <input
              type="text"
              placeholder="Search recordings by title, pastor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="media-mobile-search-input"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                className="media-search-clear"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Hero Card: Share Upload Link (Matches Desktop Panel 4 & Mobile Panel 4) */}
        <div className="media-share-hero-card">
          <div className="media-share-icon-wrap">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
              <polyline points="12 13 12 7 9 10" />
              <polyline points="12 7 15 10" />
            </svg>
          </div>
          <div className="media-share-details">
            <h2 className="media-share-title">Send a Recording</h2>
            <p className="media-share-sub">
              Give this link to media team members so they can upload recordings without accessing the app.
            </p>
            <div className="media-share-input-row">
              <div className="media-share-url-box">
                <span className="media-share-url-text">
                  {uploadUrl || 'Loading upload link...'}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--primary media-copy-btn"
                onClick={handleCopyLink}
              >
                {copySuccess ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Upload Link
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn--secondary media-share-alt-btn"
                onClick={handleShareLink}
                title="Share link"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share Link
              </button>
            </div>
            <div className="media-share-footer-links">
              <button
                type="button"
                className="media-text-action-btn"
                onClick={() => setShowRegenerateModal(true)}
              >
                Regenerate Link
              </button>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="media-tabs-bar">
          <div className="media-tabs-list">
            <button
              type="button"
              className={`media-tab ${activeTab === 'all' ? 'media-tab--active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Recordings
              <span className="media-tab-count">{recordings.length}</span>
            </button>
            <button
              type="button"
              className={`media-tab ${activeTab === 'pending' ? 'media-tab--active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              Needs Details
              <span className="media-tab-count">
                {recordings.filter((r) => r.status === 'needs_details').length}
              </span>
            </button>
            <button
              type="button"
              className={`media-tab ${activeTab === 'processing' ? 'media-tab--active' : ''}`}
              onClick={() => setActiveTab('processing')}
            >
              Processing
              <span className="media-tab-count">
                {recordings.filter((r) => r.status === 'processing').length}
              </span>
            </button>
            <button
              type="button"
              className={`media-tab ${activeTab === 'ready' ? 'media-tab--active' : ''}`}
              onClick={() => setActiveTab('ready')}
            >
              Ready
              <span className="media-tab-count">
                {recordings.filter((r) => r.status === 'ready' || r.status === 'new').length}
              </span>
            </button>
            <button
              type="button"
              className={`media-tab ${activeTab === 'processed' ? 'media-tab--active' : ''}`}
              onClick={() => setActiveTab('processed')}
            >
              Processed
              <span className="media-tab-count">
                {recordings.filter((r) => r.status === 'processed').length}
              </span>
            </button>
          </div>
        </div>

        {/* Section Heading for Mobile */}
        <div className="media-section-header desktop-hidden">
          <h3 className="media-section-title">Received Recordings</h3>
          <span className="media-section-count">{filteredRecordings.length}</span>
        </div>

        {/* Recordings Table / List */}
        {loadingRecordings ? (
          <div className="media-loading-card">
            <div className="auth-boot-spinner" />
            <p>Loading recordings...</p>
          </div>
        ) : filteredRecordings.length > 0 ? (
          <div className="media-table-container">
            {/* Desktop Table Header */}
            <div className="media-table-header mobile-hidden">
              <div className="media-col media-col-title">Title</div>
              <div className="media-col media-col-uploaded">Uploaded</div>
              <div className="media-col media-col-source">Source</div>
              <div className="media-col media-col-status">Status</div>
            </div>

            {/* Rows */}
            <div className="media-rows-stack">
              {filteredRecordings.map((rec) => {
                const dateStr = formatDate(rec.created_at)
                const timeStr = formatTime(rec.created_at)
                const sizeStr = formatFileSize(rec.file_size)
                const isProcessing = rec.status === 'processing'

                return (
                  <div
                    key={rec.recording_id}
                    className="media-row-card"
                    onClick={() => handleOpenDetails(rec)}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Title Column */}
                    <div className="media-col media-col-title">
                      <div className="media-audio-glyph">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                      <div className="media-title-stack">
                        <span className="media-title-text">{rec.title}</span>
                        <span className="media-title-sub desktop-hidden">
                          {sizeStr} · {dateStr}
                          {rec.day_number && ` · Day ${rec.day_number}`}
                        </span>
                      </div>
                    </div>

                    {/* Uploaded Column (Desktop) */}
                    <div className="media-col media-col-uploaded mobile-hidden">
                      <span className="media-uploaded-date">{dateStr}</span>
                      <span className="media-uploaded-time">{timeStr}</span>
                    </div>

                    {/* Source Column (Desktop) */}
                    <div className="media-col media-col-source mobile-hidden">
                      <span className="media-source-pill">
                        {rec.source === 'direct_upload' ? 'Direct File' : 'Phone Upload (via link)'}
                      </span>
                    </div>

                    {/* Status Column */}
                    <div className="media-col media-col-status">
                      {getStatusBadge(rec.status)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="media-empty-state">
            <div className="media-empty-icon-wrap">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <h3 className="media-empty-heading">No recordings in this category</h3>
            <p className="media-empty-sub">
              Recordings sent through the upload link will appear here ready to be processed.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleCopyLink}
            >
              Copy Upload Link
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: RECORDING DETAILS & ACTIONS (Matches Panel 6)         */}
      {/* ------------------------------------------------------------- */}
      {selectedRecording && (
        <div className="modal-overlay" onClick={() => setSelectedRecording(null)}>
          <div
            className="media-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="media-modal-header">
              <button
                type="button"
                className="media-modal-back-btn"
                onClick={() => setSelectedRecording(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="media-modal-title">Recording Details</h2>
              <button
                type="button"
                className="media-modal-close-btn"
                onClick={() => setSelectedRecording(null)}
              >
                ✕
              </button>
            </div>

            <div className="media-modal-body">
              {/* Audio Card */}
              <div className="media-detail-audio-hero">
                <div className="media-detail-audio-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <div className="media-detail-audio-info">
                  <h3 className="media-detail-audio-title">{selectedRecording.title}</h3>
                  <p className="media-detail-audio-meta">
                    {formatDate(selectedRecording.created_at)} · {formatFileSize(selectedRecording.file_size)} · {selectedRecording.file_format || 'WAV'}
                  </p>
                </div>
              </div>

              {/* In-app Audio Stream Player */}
              <div className="media-player-container">
                <audio
                  ref={audioRef}
                  controls
                  className="media-audio-element"
                  src={getApiUrl(`/api/media/recordings/${selectedRecording.recording_id}/stream`)}
                  preload="metadata"
                >
                  Your browser does not support audio playback.
                </audio>
              </div>

              {/* Progress Stepper if Processing (Matches Panel 5 & 6) */}
              {selectedRecording.status === 'processing' && (
                <div className="media-processing-card">
                  <div className="media-stepper-stack">
                    <div className="media-step media-step--done">
                      <span className="media-step-dot">✓</span>
                      <div className="media-step-content">
                        <strong>Uploading file</strong>
                        <span>Upload complete</span>
                      </div>
                    </div>
                    <div className="media-step media-step--active">
                      <span className="media-step-dot media-step-dot--pulse">●</span>
                      <div className="media-step-content">
                        <strong>Transcribing audio</strong>
                        <span className="media-step-status-tag">In progress...</span>
                      </div>
                    </div>
                    <div className="media-step media-step--pending">
                      <span className="media-step-dot">3</span>
                      <div className="media-step-content">
                        <strong>Verifying</strong>
                        <span>Pending</span>
                      </div>
                    </div>
                    <div className="media-step media-step--pending">
                      <span className="media-step-dot">4</span>
                      <div className="media-step-content">
                        <strong>Processing with AI</strong>
                        <span>Pending</span>
                      </div>
                    </div>
                    <div className="media-step media-step--pending">
                      <span className="media-step-dot">5</span>
                      <div className="media-step-content">
                        <strong>Generating report</strong>
                        <span>Pending</span>
                      </div>
                    </div>
                  </div>

                  <div className="media-processing-progress-row">
                    <div className="media-progress-bar">
                      <div className="media-progress-fill" style={{ width: '42%' }} />
                    </div>
                    <span className="media-progress-percent">42%</span>
                  </div>

                  {selectedRecording.session_id && (
                    <button
                      type="button"
                      className="btn btn--secondary media-view-session-btn"
                      onClick={() => {
                        setSelectedRecording(null)
                        if (onOpenSession) onOpenSession(selectedRecording.session_id, 'overview')
                      }}
                    >
                      View Session (Processing in background)
                    </button>
                  )}
                </div>
              )}

              {/* Metadata Fields Table */}
              <div className="media-metadata-card">
                <div className="media-meta-row">
                  <span className="media-meta-label">Source</span>
                  <span className="media-meta-val">
                    {selectedRecording.source === 'direct_upload' ? 'Direct Upload' : 'Phone Upload (via link)'}
                  </span>
                </div>
                <div className="media-meta-row">
                  <span className="media-meta-label">Uploaded</span>
                  <span className="media-meta-val">
                    {formatDate(selectedRecording.created_at)}, {formatTime(selectedRecording.created_at)}
                  </span>
                </div>
                <div className="media-meta-row">
                  <span className="media-meta-label">Uploaded by</span>
                  <span className="media-meta-val">{selectedRecording.uploaded_by || 'Media Team (Link)'}</span>
                </div>
                <div className="media-meta-row">
                  <span className="media-meta-label">Status</span>
                  <span className="media-meta-val">{getStatusBadge(selectedRecording.status)}</span>
                </div>

                {/* Editable Programme Details if Needs Details or New */}
                <div className="media-edit-details-section">
                  <h4 className="media-edit-heading">Session Details</h4>
                  <div className="media-form-field">
                    <label>Programme / Title</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editProg}
                      onChange={(e) => setEditProg(e.target.value)}
                      placeholder="e.g. Sunday Worship Service"
                    />
                  </div>
                  <div className="media-form-row">
                    <div className="media-form-field">
                      <label>Day Number</label>
                      <input
                        type="number"
                        className="form-control"
                        value={editDay}
                        onChange={(e) => setEditDay(e.target.value)}
                        placeholder="e.g. 1"
                      />
                    </div>
                    <div className="media-form-field">
                      <label>Minister / Preacher</label>
                      <input
                        type="text"
                        className="form-control"
                        value={editPastor}
                        onChange={(e) => setEditPastor(e.target.value)}
                        placeholder="e.g. Pastor W.F. Kumuyi"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--small btn--secondary"
                    onClick={handleSaveDetails}
                    disabled={isSavingDetails}
                  >
                    {isSavingDetails ? 'Saving...' : 'Update Details'}
                  </button>
                </div>
              </div>

              {actionError && (
                <div className="media-alert-error">{actionError}</div>
              )}

              {/* Actions Section */}
              <div className="media-modal-actions-card">
                <h4 className="media-actions-heading">Actions</h4>
                <div className="media-actions-buttons-stack">
                  {selectedRecording.status !== 'processing' && selectedRecording.status !== 'processed' && (
                    <button
                      type="button"
                      className="btn btn--primary media-action-btn"
                      onClick={handleProcessNow}
                      disabled={isProcessingItem}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      {isProcessingItem ? 'Starting Pipeline...' : 'Process Now'}
                    </button>
                  )}

                  {selectedRecording.session_id && (
                    <button
                      type="button"
                      className="btn btn--secondary media-action-btn"
                      onClick={() => {
                        setSelectedRecording(null)
                        if (onOpenSession) onOpenSession(selectedRecording.session_id, 'overview')
                      }}
                    >
                      Open Church Session →
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn--danger-outline media-action-btn"
                    onClick={() => handleDeleteRecording(selectedRecording.recording_id)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete Recording
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: DIRECT FILE UPLOAD (In-App)                          */}
      {/* ------------------------------------------------------------- */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div
            className="media-upload-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="media-modal-header">
              <h2 className="media-modal-title">Upload Audio Recording</h2>
              <button
                type="button"
                className="media-modal-close-btn"
                onClick={() => setShowUploadModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleDirectUploadSubmit} className="media-modal-form">
              <div className="media-file-dropzone">
                <input
                  type="file"
                  id="media-file-input"
                  accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg"
                  onChange={(e) => setUploadFile(e.target.files[0] || null)}
                  style={{ display: 'none' }}
                />
                <label htmlFor="media-file-input" className="media-dropzone-label">
                  <div className="media-dropzone-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  {uploadFile ? (
                    <div className="media-selected-file">
                      <strong>{uploadFile.name}</strong>
                      <span>({formatFileSize(uploadFile.size)})</span>
                    </div>
                  ) : (
                    <div>
                      <strong>Select or drop audio file</strong>
                      <p>WAV, MP3, M4A, AAC up to 500MB</p>
                    </div>
                  )}
                </label>
              </div>

              <div className="form-group">
                <label>Event Type</label>
                <select
                  className="form-control"
                  value={uploadEvent}
                  onChange={(e) => setUploadEvent(e.target.value)}
                >
                  <option value="Sunday Worship Service">Sunday Worship Service</option>
                  <option value="Monday Bible Study">Monday Bible Study</option>
                  <option value="Thursday Revival & Evangelism">Thursday Revival &amp; Evangelism</option>
                  <option value="Global Crusade">Global Crusade</option>
                  <option value="Retreat">Retreat</option>
                  <option value="Special Programme">Special Programme</option>
                </select>
              </div>

              <div className="form-group">
                <label>Programme / Message Title</label>
                <input
                  type="text"
                  className="form-control"
                  value={uploadProgramme}
                  onChange={(e) => setUploadProgramme(e.target.value)}
                  placeholder="e.g. Walking in Divine Dominion"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Day Number (optional)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={uploadDay}
                    onChange={(e) => setUploadDay(e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
                <div className="form-group">
                  <label>Minister / Preacher (optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={uploadPastor}
                    onChange={(e) => setUploadPastor(e.target.value)}
                    placeholder="e.g. Pastor W.F. Kumuyi"
                  />
                </div>
              </div>

              {uploadError && (
                <div className="media-alert-error">{uploadError}</div>
              )}

              <div className="media-modal-footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={isSubmittingUpload || !uploadFile}
                >
                  {isSubmittingUpload ? 'Uploading...' : 'Upload Recording'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: REGENERATE LINK CONFIRMATION                         */}
      {/* ------------------------------------------------------------- */}
      {showRegenerateModal && (
        <div className="modal-overlay" onClick={() => setShowRegenerateModal(false)}>
          <div
            className="media-confirm-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="media-modal-header">
              <h2 className="media-modal-title">Regenerate Upload Link</h2>
              <button
                type="button"
                className="media-modal-close-btn"
                onClick={() => setShowRegenerateModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="media-modal-body">
              <p className="media-confirm-text">
                Generating a new upload link will immediately invalidate any previous link.
                Media team members currently using the old link will no longer be able to upload.
              </p>
              <div className="form-group mt-3">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={pinEnabled}
                    onChange={(e) => setPinEnabled(e.target.checked)}
                  />
                  <span>Require a PIN to upload</span>
                </label>
                {pinEnabled && (
                  <input
                    type="text"
                    className="form-control mt-2"
                    placeholder="Enter 4-6 digit PIN"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                    maxLength={8}
                  />
                )}
              </div>
            </div>
            <div className="media-modal-footer">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowRegenerateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleRegenerateToken}
              >
                Regenerate Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
