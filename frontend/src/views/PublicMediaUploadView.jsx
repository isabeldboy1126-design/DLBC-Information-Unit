import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl } from '../config'

/**
 * PublicMediaUploadView
 *
 * Lightweight, standalone upload page for Media team members.
 * Strictly send-only:
 * - NO login required
 * - NO app navigation or sidebar
 * - NO access to past recordings, sessions, transcripts, or reports
 * - Scoped to church account via high-entropy token validated by backend
 */
export function PublicMediaUploadView({ token, onBackToApp }) {
  const [tokenInfo, setTokenInfo] = useState(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [errorInfo, setErrorInfo] = useState(null)

  // Form State
  const [event, setEvent] = useState('')
  const [programme, setProgramme] = useState('')
  const [dayNumber, setDayNumber] = useState('')
  const [pastorName, setPastorName] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)

  // Upload status
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadError, setUploadError] = useState(null)

  const fileInputRef = useRef(null)

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

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      setUploadError(null)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!selectedFile) {
      setUploadError('Please select an audio file to upload.')
      return
    }
    if (!programme.trim()) {
      setUploadError('Please enter or select a programme name.')
      return
    }

    setIsUploading(true)
    setUploadProgress(10)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', selectedFile)
    if (event) formData.append('event', event)
    if (programme) formData.append('programme', programme)
    if (dayNumber) formData.append('day_number', dayNumber)
    if (pastorName) formData.append('pastor_name', pastorName)
    if (pinCode) formData.append('pin_code', pinCode)

    try {
      // Use XMLHttpRequest for live upload progress tracking
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
            setUploadResult({ message: 'Recording uploaded successfully!' })
          }
          setIsUploading(false)
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            setUploadError(err.detail || 'Upload failed. Please check your network or try again.')
          } catch {
            setUploadError(`Upload failed with server error ${xhr.status}`)
          }
          setIsUploading(false)
        }
      }

      xhr.onerror = () => {
        setUploadError('Network error while uploading recording. Please check your connection.')
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
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
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
      padding: '20px 16px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        background: '#121215',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '32px 24px',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
        boxSizing: 'border-box',
      }}>
        {/* Church Emblem & Title */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img
            src="/dlbc-logo.png"
            alt="DLBC"
            style={{ width: '64px', height: '64px', objectFit: 'contain', margin: '0 auto 12px' }}
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
            margin: 0,
          }}>
            Media Recording Upload Portal
          </p>
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
              Recording Received!
            </h2>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              <strong>{uploadResult.title}</strong> has been transferred to the Information Unit editorial inbox.
              {uploadResult.auto_started
                ? ' Automatic speech-to-text transcription and verification have started.'
                : ' Staff will verify details and process the sermon report.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setUploadResult(null)
                setSelectedFile(null)
                setUploadProgress(0)
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
              Upload Another Recording
            </button>
          </div>
        ) : (
          /* Upload Form */
          <form onSubmit={handleUpload}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#93c5fd', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Session Details
              </h3>

              {/* Event Type */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  Event / Service
                </label>
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: '#1a1a20',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  {(tokenInfo?.events || []).map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
              </div>

              {/* Programme */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  Programme / Message Title <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="text"
                  list="programme-suggestions"
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                  placeholder="e.g. Sunday Worship Service"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: '#1a1a20',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
                <datalist id="programme-suggestions">
                  {(tokenInfo?.programmes || []).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              {/* Day & Pastor Name */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '4px' }}>
                <div style={{ flex: '0 0 85px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                    Day (opt)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={dayNumber}
                    onChange={(e) => setDayNumber(e.target.value)}
                    placeholder="e.g. 1"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#1a1a20',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                    Pastor / Preacher Name
                  </label>
                  <input
                    type="text"
                    value={pastorName}
                    onChange={(e) => setPastorName(e.target.value)}
                    placeholder="e.g. Pastor W.F. Kumuyi"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#1a1a20',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* PIN Code if enabled */}
              {tokenInfo?.has_pin && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                    Link Access PIN <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <input
                    type="password"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                    placeholder="Enter security PIN"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#1a1a20',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Audio File Selection Card */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: '12px',
                padding: '24px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: selectedFile ? 'rgba(37, 99, 235, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                marginBottom: '20px',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.webm"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              <div style={{ fontSize: '32px', marginBottom: '8px' }}>
                {selectedFile ? '🎵' : '☁️'}
              </div>

              {selectedFile ? (
                <div>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 600, fontSize: '14px', color: '#60a5fa' }}>
                    {selectedFile.name}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                    {formatFileSize(selectedFile.size)} · Tap to choose different file
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 600, fontSize: '14px', color: '#ffffff' }}>
                    Select Audio File
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                    WAV, MP3, M4A, AAC, FLAC (up to 500 MB)
                  </p>
                </div>
              )}
            </div>

            {uploadError && (
              <div style={{
                marginBottom: '16px',
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '13px',
              }}>
                {uploadError}
              </div>
            )}

            {isUploading && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginBottom: '6px',
                }}>
                  <span>Uploading recording...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${uploadProgress}%`,
                    height: '100%',
                    backgroundColor: '#2563eb',
                    transition: 'width 0.2s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: isUploading || !selectedFile ? '#1f2937' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: isUploading || !selectedFile ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {isUploading ? (
                <>
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Sending to Information Unit...
                </>
              ) : (
                'Upload and Send Recording'
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#6b7280',
        }}>
          <span>DLBC Media Upload Portal · Secure Send</span>
          {onBackToApp && (
            <button
              type="button"
              onClick={onBackToApp}
              style={{
                background: 'none',
                border: 'none',
                color: '#60a5fa',
                cursor: 'pointer',
                fontSize: '12px',
                padding: 0,
              }}
            >
              Staff Sign In →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
