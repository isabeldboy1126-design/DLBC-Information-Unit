import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl, authFetch, getPublicWebBaseUrl } from '../../config'
import { useAuth } from '../../context/AuthContext'

/**
 * MediaView — Media Receiver & Ingest Hub (Desktop + Mobile)
 * Matches visual authority:
 * - Desktop: media_1791012340774.jpg (Panels 3, 4, 5, 6)
 * - Mobile: media_1791012340786.jpg (Panels 4, 5, 6)
 * Rebuilt as Photo-First:
 * - Default Active Tab: Photos
 * - Secondary Tab: Audio Recordings
 */
export function MediaView({ onBack, onOpenSession, onRefreshSessions, sessions = [] }) {
  const { user, demoMode } = useAuth()

  // Primary Tab Switcher: 'photos' (default) | 'recordings'
  const [mediaSection, setMediaSection] = useState('photos')

  // Photos State
  const [photos, setPhotos] = useState([])
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const [photoSearch, setPhotoSearch] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false)
  const [inAppPhotos, setInAppPhotos] = useState([])
  const [inAppPhotoCaption, setInAppPhotoCaption] = useState('')
  const [isUploadingInAppPhotos, setIsUploadingInAppPhotos] = useState(false)

  // Shared Upload Link State
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
      const res = await authFetch('/api/media/token')
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

  // Fetch Photos
  const fetchPhotos = async () => {
    try {
      const res = await authFetch('/api/media/assets?asset_type=photo')
      if (res.ok) {
        const data = await res.json()
        setPhotos(data.assets || [])
      }
    } catch (e) {
      console.warn('Failed to fetch photo assets:', e)
    } finally {
      setLoadingPhotos(false)
    }
  }

  // Fetch Recordings
  const fetchRecordings = async () => {
    try {
      const res = await authFetch('/api/media/recordings')
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
    fetchPhotos()
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

  // Compute public upload URL using getPublicWebBaseUrl()
  const uploadUrl = tokenData?.token
    ? `${getPublicWebBaseUrl()}/#media/upload/${tokenData.token}`
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
          text: 'Upload photos or recordings directly to the Information Unit:',
          url: uploadUrl,
        })
      } catch (e) {
        handleCopyLink()
      }
    } else {
      handleCopyLink()
    }
  }

  const handleRegenerateToken = async () => {
    try {
      const res = await authFetch('/api/media/token/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleRevokeToken = async () => {
    if (!window.confirm('Are you sure you want to revoke this upload link? External upload links currently active will immediately stop functioning.')) {
      return
    }
    try {
      const res = await authFetch('/api/media/token/revoke', { method: 'POST' })
      if (res.ok) {
        setTokenData((prev) => prev ? { ...prev, token: null } : null)
        alert('Upload link revoked. You can generate a new one anytime.')
      }
    } catch (e) {
      alert('Failed to revoke upload link: ' + e.message)
    }
  }

  // Photo Handlers
  const handleDeletePhoto = async (assetId) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return
    try {
      const res = await authFetch(`/api/media/assets/${assetId}`, { method: 'DELETE' })
      if (res.ok) {
        setSelectedPhoto(null)
        await fetchPhotos()
      }
    } catch (e) {
      alert('Failed to delete photo: ' + e.message)
    }
  }

  const handleInAppPhotoUploadSubmit = async (e) => {
    e.preventDefault()
    if (!inAppPhotos || inAppPhotos.length === 0) return
    setIsUploadingInAppPhotos(true)

    const formData = new FormData()
    Array.from(inAppPhotos).forEach((f) => formData.append('files', f))
    if (inAppPhotoCaption) formData.append('caption', inAppPhotoCaption)

    try {
      const res = await authFetch('/api/media/assets/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Upload failed')
      }
      await fetchPhotos()
      setShowPhotoUploadModal(false)
      setInAppPhotos([])
      setInAppPhotoCaption('')
    } catch (err) {
      alert('Photo upload error: ' + err.message)
    } finally {
      setIsUploadingInAppPhotos(false)
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
      const res = await authFetch('/api/media/recordings/upload', {
        method: 'POST',
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
      const res = await authFetch(`/api/media/recordings/${selectedRecording.recording_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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
      const res = await authFetch(`/api/media/recordings/${selectedRecording.recording_id}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      const res = await authFetch(`/api/media/recordings/${recId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setSelectedRecording(null)
        await fetchRecordings()
      }
    } catch (e) {
      alert('Failed to delete recording: ' + e.message)
    }
  }

  // Filter photos
  const filteredPhotos = photos.filter((p) => {
    if (!photoSearch.trim()) return true
    const q = photoSearch.toLowerCase()
    return (
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.original_filename && p.original_filename.toLowerCase().includes(q)) ||
      (p.sender_name && p.sender_name.toLowerCase().includes(q)) ||
      (p.programme && p.programme.toLowerCase().includes(q)) ||
      (p.caption && p.caption.toLowerCase().includes(q))
    )
  })

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h2 className="media-share-title" style={{ margin: 0 }}>Secure Media Upload Link</h2>
              {tokenData?.token ? (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                  Active
                </span>
              ) : (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  Revoked
                </span>
              )}
            </div>
            <p className="media-share-sub">
              Give this link to church media team members to upload photos and audio recordings directly without needing app access.
            </p>
            <div className="media-share-input-row">
              <div className="media-share-url-box">
                <span className="media-share-url-text">
                  {uploadUrl || (loadingToken ? 'Loading link...' : 'No active upload link. Click Regenerate to create one.')}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--primary media-copy-btn"
                onClick={handleCopyLink}
                disabled={!uploadUrl}
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
                disabled={!uploadUrl}
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
            <div className="media-share-footer-links" style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
              <button
                type="button"
                className="media-text-action-btn"
                onClick={() => setShowRegenerateModal(true)}
              >
                Regenerate Link
              </button>
              {tokenData?.token && (
                <button
                  type="button"
                  className="media-text-action-btn"
                  style={{ color: '#f87171' }}
                  onClick={handleRevokeToken}
                >
                  Revoke Link
                </button>
              )}
            </div>
          </div>
        </div>

        {/* PRIMARY SECTION TABS: PHOTOS (Default) | AUDIO RECORDINGS */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '20px', paddingBottom: '4px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`media-tab ${mediaSection === 'photos' ? 'media-tab--active' : ''}`}
              onClick={() => setMediaSection('photos')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Photos</span>
              <span className="media-tab-count">{photos.length}</span>
            </button>
            <button
              type="button"
              className={`media-tab ${mediaSection === 'recordings' ? 'media-tab--active' : ''}`}
              onClick={() => setMediaSection('recordings')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <span>Audio Recordings</span>
              <span className="media-tab-count">{recordings.length}</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {mediaSection === 'photos' && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setShowPhotoUploadModal(true)}
                style={{ fontSize: '13px', padding: '6px 14px' }}
              >
                + Upload Photos
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* VIEW A: PHOTO-FIRST GALLERY                                   */}
        {/* ------------------------------------------------------------- */}
        {mediaSection === 'photos' && (
          <div>
            {loadingPhotos ? (
              <div className="media-loading-card">
                <div className="auth-boot-spinner" />
                <p>Loading photo assets...</p>
              </div>
            ) : filteredPhotos.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: '16px',
                marginTop: '12px',
              }}>
                {filteredPhotos.map((photo) => {
                  const viewUrl = getApiUrl(`/api/media/assets/${photo.asset_id}/view`)
                  return (
                    <div
                      key={photo.asset_id}
                      onClick={() => setSelectedPhoto(photo)}
                      role="button"
                      tabIndex={0}
                      style={{
                        background: '#131317',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
                        e.currentTarget.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.4)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none'
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#09090b', overflow: 'hidden' }}>
                        <img
                          src={viewUrl}
                          alt={photo.title || photo.original_filename}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {photo.width > 0 && photo.height > 0 && (
                          <span style={{
                            position: 'absolute',
                            bottom: '6px',
                            right: '6px',
                            fontSize: '10px',
                            backgroundColor: 'rgba(0, 0, 0, 0.75)',
                            color: '#e5e7eb',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                          }}>
                            {photo.width}×{photo.height}
                          </span>
                        )}
                      </div>

                      <div style={{ padding: '12px' }}>
                        <h4 style={{
                          margin: '0 0 6px 0',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#ffffff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {photo.title || photo.original_filename}
                        </h4>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#9ca3af' }}>
                          <span>{photo.sender_name || 'Media Unit'}</span>
                          <span>{formatFileSize(photo.file_size)}</span>
                        </div>
                        {photo.programme && (
                          <div style={{ marginTop: '6px', fontSize: '11px', color: '#93c5fd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {photo.programme}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="media-empty-state">
                <div className="media-empty-icon-wrap">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <h3 className="media-empty-heading">No photos in gallery</h3>
                <p className="media-empty-sub">
                  Photos submitted by media team members through the upload link will appear here.
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleCopyLink}
                  disabled={!uploadUrl}
                >
                  Copy Upload Link
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW B: AUDIO RECORDINGS TABLE (Preserved)                     */}
        {/* ------------------------------------------------------------- */}
        {mediaSection === 'recordings' && (
          <div>
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

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4: PHOTO LIGHTBOX & DETAILS                              */}
      {/* ------------------------------------------------------------- */}
      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div
            className="media-modal-card"
            style={{ maxWidth: '840px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="media-modal-header">
              <button
                type="button"
                className="media-modal-back-btn"
                onClick={() => setSelectedPhoto(null)}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="media-modal-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedPhoto.title || selectedPhoto.original_filename || 'Photo Detail'}
              </h2>
              <button
                type="button"
                className="media-modal-close-btn"
                onClick={() => setSelectedPhoto(null)}
              >
                ✕
              </button>
            </div>

            <div className="media-modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <div style={{
                background: '#09090b',
                borderRadius: '8px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxHeight: '480px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '16px'
              }}>
                <img
                  src={getApiUrl(`/api/media/assets/${selectedPhoto.asset_id}/view`)}
                  alt={selectedPhoto.title || selectedPhoto.original_filename}
                  style={{ maxWidth: '100%', maxHeight: '480px', objectFit: 'contain' }}
                />
              </div>

              {selectedPhoto.caption && (
                <div style={{ marginBottom: '16px', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                  <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Caption / Note</div>
                  <div style={{ fontSize: '14px', color: '#f3f4f6', lineHeight: 1.5 }}>{selectedPhoto.caption}</div>
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: '13px',
              }}>
                <div>
                  <span style={{ color: '#9ca3af', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Sender</span>
                  <span style={{ color: '#e5e7eb', fontWeight: 500 }}>{selectedPhoto.sender_name || 'Anonymous'}</span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>File Name</span>
                  <span style={{ color: '#e5e7eb', fontWeight: 500, wordBreak: 'break-all' }}>{selectedPhoto.original_filename}</span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Dimensions</span>
                  <span style={{ color: '#e5e7eb', fontWeight: 500 }}>{selectedPhoto.width && selectedPhoto.height ? `${selectedPhoto.width} × ${selectedPhoto.height} px` : 'Unknown'}</span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>File Size</span>
                  <span style={{ color: '#e5e7eb', fontWeight: 500 }}>{formatFileSize(selectedPhoto.file_size_bytes)}</span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Date Uploaded</span>
                  <span style={{ color: '#e5e7eb', fontWeight: 500 }}>{selectedPhoto.created_at ? new Date(selectedPhoto.created_at).toLocaleString() : '—'}</span>
                </div>
                {selectedPhoto.event && (
                  <div>
                    <span style={{ color: '#9ca3af', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Event / Prog</span>
                    <span style={{ color: '#e5e7eb', fontWeight: 500 }}>{selectedPhoto.event} {selectedPhoto.programme ? `— ${selectedPhoto.programme}` : ''}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="media-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => handleDeletePhoto(selectedPhoto.asset_id)}
                style={{ fontSize: '13px' }}
              >
                Delete Photo
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={getApiUrl(`/api/media/assets/${selectedPhoto.asset_id}/view`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--secondary"
                  style={{ fontSize: '13px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  Open Original
                </a>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setSelectedPhoto(null)}
                  style={{ fontSize: '13px' }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 5: IN-APP PHOTO UPLOAD                                  */}
      {/* ------------------------------------------------------------- */}
      {showPhotoUploadModal && (
        <div className="modal-overlay" onClick={() => setShowPhotoUploadModal(false)}>
          <div
            className="media-modal-card"
            style={{ maxWidth: '580px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="media-modal-header">
              <h2 className="media-modal-title">Upload Photos to Gallery</h2>
              <button
                type="button"
                className="media-modal-close-btn"
                onClick={() => setShowPhotoUploadModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInAppPhotoUploadSubmit}>
              <div className="media-modal-body">
                <div className="form-group mb-3">
                  <label className="form-label" style={{ fontWeight: 600 }}>Select Photo(s) (JPEG, PNG, WEBP)</label>
                  <input
                    type="file"
                    className="form-control"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    required
                    onChange={(e) => setInAppPhotos(e.target.files)}
                  />
                  {inAppPhotos && inAppPhotos.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#60a5fa' }}>
                      {inAppPhotos.length} photo{inAppPhotos.length === 1 ? '' : 's'} selected ({Array.from(inAppPhotos).map((f) => f.name).join(', ')})
                    </div>
                  )}
                </div>

                <div className="form-group mb-3">
                  <label className="form-label" style={{ fontWeight: 600 }}>Caption or Note (Optional)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="Enter an optional note or caption for these photos..."
                    value={inAppPhotoCaption}
                    onChange={(e) => setInAppPhotoCaption(e.target.value)}
                  />
                </div>
              </div>

              <div className="media-modal-footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowPhotoUploadModal(false)}
                  disabled={isUploadingInAppPhotos}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={isUploadingInAppPhotos || !inAppPhotos || inAppPhotos.length === 0}
                >
                  {isUploadingInAppPhotos ? 'Uploading Photos...' : 'Upload Photos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
