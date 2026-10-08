import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl } from '../config'

/**
 * PublicMediaUploadView
 *
 * Lightweight, photo-first standalone upload portal for Media team members.
 * Strictly send-only:
 * - NO login required
 * - NO app navigation or sidebar
 * - NO access to past recordings, sessions, transcripts, or reports
 * - Primary: Photos (.jpg, .jpeg, .png, .webp) with multi-photo selection, thumbnails, remove items
 * - Secondary: Optional audio attachment (retaining speech-to-text pipeline)
 */
export function PublicMediaUploadView({ token, onBackToApp }) {
  const [tokenInfo, setTokenInfo] = useState(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [errorInfo, setErrorInfo] = useState(null)

  // Photos State
  const [photos, setPhotos] = useState([]) // Array of { id, file, previewUrl, name, size }
  const photoInputRef = useRef(null)

  // Optional Audio State
  const [includeAudio, setIncludeAudio] = useState(false)
  const [audioFile, setAudioFile] = useState(null)
  const audioInputRef = useRef(null)

  // Metadata State
  const [senderName, setSenderName] = useState('')
  const [note, setNote] = useState('')
  const [event, setEvent] = useState('')
  const [programme, setProgramme] = useState('')
  const [dayNumber, setDayNumber] = useState('')
  const [pinCode, setPinCode] = useState('')

  // Upload Progress & Result
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadError, setUploadError] = useState(null)

  useEffect(() => {
    let isMounted = true
    async function fetchInfo() {
      if (!token) {
        setErrorInfo('No upload token provided in link.')
        setLoadingInfo(false)
        return
      }
      try {
        const res = await fetch(getApiUrl(`/api/media/public/info/${token}`))
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'This media upload link is invalid or has expired.')
        }
        const data = await res.json()
        if (isMounted) {
          setTokenInfo(data)
          if (data.events && data.events.length > 0) {
            setEvent(data.events[0])
          }
          if (data.programmes && data.programmes.length > 0) {
            setProgramme(data.programmes[0])
          }
          setLoadingInfo(false)
        }
      } catch (e) {
        if (isMounted) {
          setErrorInfo(e.message)
          setLoadingInfo(false)
        }
      }
    }
    fetchInfo()
    return () => { isMounted = false }
  }, [token])

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      photos.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })
    }
  }, [photos])

  const handlePhotoSelect = (e) => {
    if (!e.target.files || e.target.files.length === 0) return
    const newFiles = Array.from(e.target.files)
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp']
    const addedPhotos = []

    newFiles.forEach((file) => {
      const ext = '.' + file.name.split('.').pop().toLowerCase()
      if (validExtensions.includes(ext)) {
        addedPhotos.push({
          id: `${file.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
        })
      }
    })

    if (addedPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...addedPhotos])
      setUploadError(null)
    }
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleRemovePhoto = (idToRemove) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === idToRemove)
      if (target && target.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== idToRemove)
    })
  }

  const handleAudioSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0])
      setUploadError(null)
    }
  }

  const handleRemoveAudio = () => {
    setAudioFile(null)
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (photos.length === 0 && !audioFile) {
      setUploadError('Please select at least one photo or attach an audio recording.')
      return
    }

    setIsUploading(true)
    setUploadProgress(10)
    setUploadError(null)

    const formData = new FormData()
    photos.forEach((p) => {
      formData.append('photos', p.file)
    })
    if (audioFile) {
      formData.append('audio', audioFile)
    }

    if (senderName) formData.append('sender_name', senderName)
    if (note) formData.append('note', note)
    if (programme) formData.append('programme', programme)
    if (event) formData.append('event', event)
    if (dayNumber) formData.append('day_number', dayNumber)
    if (pinCode) formData.append('pin_code', pinCode)

    try {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', getApiUrl(`/api/media/public/upload/${token}`))

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 90)
          setUploadProgress(pct)
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100)
          try {
            const data = JSON.parse(xhr.responseText)
            setUploadResult(data)
          } catch {
            setUploadResult({ message: 'Media uploaded successfully!' })
          }
          setIsUploading(false)
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            setUploadError(err.detail || 'Upload failed. Please check network and try again.')
          } catch {
            setUploadError(`Upload failed with server error ${xhr.status}`)
          }
          setIsUploading(false)
        }
      }

      xhr.onerror = () => {
        setUploadError('Network error while uploading. Please check connection.')
        setIsUploading(false)
      }

      xhr.send(formData)
    } catch (err) {
      setUploadError(err.message || 'An unexpected error occurred.')
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0c',
      color: '#f3f4f6',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
    }}>
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: '#121215',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '32px 24px',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
        boxSizing: 'border-box',
      }}>
        {/* Church Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img
            src="/dlbc-logo.png"
            alt="DLBC"
            style={{ width: '60px', height: '60px', objectFit: 'contain', margin: '0 auto 12px' }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
          <h1 style={{
            fontSize: '20px',
            fontWeight: 700,
            margin: '0 0 4px 0',
            color: '#ffffff',
            letterSpacing: '-0.01em',
          }}>
            {tokenInfo?.church_name || 'DLBC Information Unit'}
          </h1>
          <p style={{
            fontSize: '13px',
            color: '#9ca3af',
            margin: '0 0 8px 0',
          }}>
            Media & Photo Submissions
          </p>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(34, 197, 94, 0.12)',
            color: '#4ade80',
            border: '1px solid rgba(34, 197, 94, 0.25)',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#4ade80' }} />
            Secure Upload Link Active
          </span>
        </div>

        {loadingInfo ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
            <div style={{
              display: 'inline-block',
              width: '28px',
              height: '28px',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginBottom: '12px',
            }} />
            <p style={{ margin: 0, fontSize: '13px' }}>Verifying secure upload link...</p>
          </div>
        ) : errorInfo ? (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '10px',
            padding: '20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 6px 0', color: '#f87171', fontSize: '15px' }}>
              Upload Link Unavailable
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#d1d5db', lineHeight: 1.4 }}>
              {errorInfo}
            </p>
          </div>
        ) : uploadResult ? (
          /* Success Screen */
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              margin: '0 auto 16px',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}>
              ✓
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#ffffff' }}>
              Media Sent Successfully!
            </h2>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              {uploadResult.message || 'Your photos and recordings have been received by the Information Unit.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setUploadResult(null)
                setPhotos([])
                setAudioFile(null)
                setUploadProgress(0)
                setNote('')
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Upload More Media
            </button>
          </div>
        ) : (
          /* Upload Form */
          <form onSubmit={handleUpload}>
            {/* 1. PHOTO-FIRST DROPZONE & GALLERY */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#93c5fd', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Photos ({photos.length})
                </h3>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>JPG, PNG, WEBP</span>
              </div>

              {/* Photo Preview Grid */}
              {photos.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                  gap: '10px',
                  marginBottom: '14px',
                }}>
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        position: 'relative',
                        aspectRatio: '1',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: '#050507',
                      }}
                    >
                      <img
                        src={p.previewUrl}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(p.id)}
                        title="Remove photo"
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0, 0, 0, 0.75)',
                          color: '#ffffff',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                        fontSize: '9px',
                        color: '#d1d5db',
                        padding: '2px 4px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {formatFileSize(p.size)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Photos Button */}
              <input
                ref={photoInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handlePhotoSelect}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                style={{
                  width: '100%',
                  padding: photos.length === 0 ? '24px 16px' : '10px 16px',
                  backgroundColor: 'rgba(37, 99, 235, 0.08)',
                  border: '1px dashed rgba(59, 130, 246, 0.4)',
                  borderRadius: '8px',
                  color: '#93c5fd',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: photos.length === 0 ? 'column' : 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>{photos.length === 0 ? 'Click to select photos (multiple allowed)' : '+ Add More Photos'}</span>
              </button>
            </div>

            {/* 2. OPTIONAL AUDIO ATTACHMENT */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#d1d5db', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={includeAudio}
                    onChange={(e) => setIncludeAudio(e.target.checked)}
                    style={{ accentColor: '#2563eb' }}
                  />
                  <span>Attach Audio Recording (Optional)</span>
                </label>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>WAV, MP3, M4A</span>
              </div>

              {includeAudio && (
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,.webm"
                    style={{ display: 'none' }}
                    onChange={handleAudioSelect}
                  />

                  {audioFile ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(37, 99, 235, 0.1)',
                      border: '1px solid rgba(37, 99, 235, 0.25)',
                      borderRadius: '8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '18px' }}>🎵</span>
                        <div style={{ overflow: 'hidden' }}>
                          <p style={{ margin: 0, fontSize: '13px', color: '#ffffff', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {audioFile.name}
                          </p>
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatFileSize(audioFile.size)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveAudio}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f87171',
                          fontSize: '16px',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px dashed rgba(255, 255, 255, 0.2)',
                        borderRadius: '8px',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Choose Audio File
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 3. SENDER & EVENT METADATA */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#93c5fd', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Submission Details
              </h3>

              {/* Sender Name */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  Your Name / Department
                </label>
                <input
                  type="text"
                  placeholder="e.g. Media Unit, Brother John"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#1b1b22',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Event / Service */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  Event / Service
                </label>
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#1b1b22',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  {(tokenInfo?.events || [
                    'Sunday Worship Service',
                    'Monday Bible Study',
                    'Thursday Revival Hour',
                    'Special Programme',
                    'Retreat / Camp',
                  ]).map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
              </div>

              {/* Programme Selection */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  Programme Name
                </label>
                <input
                  type="text"
                  list="programmes-list"
                  placeholder="e.g. Sunday Worship Service, Youth Campaign"
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#1b1b22',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
                <datalist id="programmes-list">
                  {(tokenInfo?.programmes || []).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              {/* Optional Day Number */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  Day Number (Optional)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="e.g. 1"
                  value={dayNumber}
                  onChange={(e) => setDayNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#1b1b22',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Note / Caption */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  Caption / Note
                </label>
                <textarea
                  placeholder="Notes about these photos (e.g. Choir ministration, Pastor preaching, Audience)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows="2"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#1b1b22',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* PIN Code (if enabled) */}
              {tokenInfo?.has_pin && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#fbbf24', marginBottom: '4px' }}>
                    Security PIN *
                  </label>
                  <input
                    type="password"
                    placeholder="Enter 4-digit link PIN"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#1b1b22',
                      border: '1px solid rgba(251, 191, 36, 0.4)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Error Message */}
            {uploadError && (
              <div style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '12px',
                marginBottom: '16px',
              }}>
                {uploadError}
              </div>
            )}

            {/* Progress Bar */}
            {isUploading && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  <span>Uploading media...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: '#2563eb', transition: 'width 0.2s ease' }} />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isUploading || (photos.length === 0 && !audioFile)}
              style={{
                width: '100%',
                padding: '12px 20px',
                backgroundColor: isUploading || (photos.length === 0 && !audioFile) ? '#1f2937' : '#2563eb',
                color: isUploading || (photos.length === 0 && !audioFile) ? '#6b7280' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: isUploading || (photos.length === 0 && !audioFile) ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isUploading
                ? `Sending Media (${uploadProgress}%)...`
                : `Send Media to Information Unit (${photos.length} photo${photos.length === 1 ? '' : 's'}${audioFile ? ' + 1 audio' : ''})`}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
