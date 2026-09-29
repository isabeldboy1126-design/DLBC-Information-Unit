import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '../../config'

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatDuration(sec) {
  if (!sec || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}m ${s < 10 ? '0' : ''}${s}s`
}

export function CompletedReportsView({ onNavigateSession }) {
  const [reports, setReports] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProgramme, setSelectedProgramme] = useState('all')
  const [selectedMinister, setSelectedMinister] = useState('all')
  const [downloadingId, setDownloadingId] = useState(null)

  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.append('query', searchQuery.trim())
      if (selectedProgramme !== 'all') params.append('programme', selectedProgramme)
      if (selectedMinister !== 'all') params.append('minister', selectedMinister)

      const res = await fetch(getApiUrl(`/api/report-processing/archive?${params.toString()}`))
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
      }
    } catch (e) {
      console.error('Error fetching completed reports:', e)
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, selectedProgramme, selectedMinister])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReports()
    }, 250)
    return () => clearTimeout(timer)
  }, [fetchReports])

  const handleDownloadDocx = async (e, report) => {
    e.stopPropagation()
    const sessionId = report.session_id
    if (!sessionId) return
    try {
      setDownloadingId(sessionId)
      const res = await fetch(getApiUrl(`/api/report-processing/download-docx/${sessionId}`))
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        let filename = report.docx_filename || `${report.report_title || 'Report'}.docx`
        const disposition = res.headers.get('content-disposition')
        if (disposition && disposition.includes('filename=')) {
          filename = disposition.split('filename=')[1].replace(/[\\"\\']/g, '').trim()
        }
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Could not download document. Final document might still be preparing.')
      }
    } catch (err) {
      alert(`Download failed: ${err.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  // Derive unique programmes and ministers for filter dropdowns
  const programmes = Array.from(new Set(reports.map(r => r.programme || r.event_type).filter(Boolean)))
  const ministers = Array.from(new Set(reports.map(r => r.minister).filter(Boolean)))

  return (
    <div className="completed-reports-view">
      {/* Top Header */}
      <div className="completed-reports-header">
        <div>
          <h1 className="completed-reports-title">Reports Archive</h1>
          <p className="completed-reports-subtitle">
            All finalized DLBC Information Unit reports and downloadable Word (.docx) documents.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="completed-reports-filter-bar">
        <div className="reports-search-box">
          <SearchIcon />
          <input
            type="text"
            className="reports-search-input"
            placeholder="Search reports by title, keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="reports-search-clear"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="reports-filters-group">
          <select
            className="reports-filter-select"
            value={selectedProgramme}
            onChange={(e) => setSelectedProgramme(e.target.value)}
          >
            <option value="all">All Programmes</option>
            {programmes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            className="reports-filter-select"
            value={selectedMinister}
            onChange={(e) => setSelectedMinister(e.target.value)}
          >
            <option value="all">All Ministers</option>
            {ministers.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="reports-loading-state">
          <div className="report-processing-blue-spinner" />
          <span>Loading reports archive...</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="reports-empty-state">
          <DocumentIcon />
          <h3>No reports found</h3>
          <p>
            {searchQuery || selectedProgramme !== 'all' || selectedMinister !== 'all'
              ? 'Try changing or clearing your search filters.'
              : 'Once sessions are processed with AI, finalized reports will appear here.'}
          </p>
        </div>
      ) : (
        <div className="reports-cards-grid">
          {reports.map((report) => {
            const title = report.report_title || report.session_title || 'Final Message Report'
            const programme = report.programme || report.event_type || 'Sunday Worship Service'
            const minister = report.minister || 'Pastor (Dr) W.F. Kumuyi'
            const date = formatDate(report.completed_at || report.date_created)
            const duration = formatDuration(report.duration_seconds)
            const wordCount = report.word_count || 0

            return (
              <div
                key={report.run_id || report.session_id}
                className="report-archive-card"
                onClick={() => {
                  if (onNavigateSession) onNavigateSession(report.session_id, 'final_report')
                  else window.location.hash = `#session/${report.session_id}/final_report`
                }}
              >
                <div className="report-card-top">
                  <div className="report-card-icon-badge">
                    <DocumentIcon />
                  </div>
                  <div className="report-card-meta">
                    <span className="report-card-programme">{programme}</span>
                    <span className="report-card-date">{date}</span>
                  </div>
                </div>

                <h3 className="report-card-title">{title}</h3>

                <div className="report-card-details">
                  <span className="detail-item">{minister}</span>
                  {duration !== '—' && (
                    <>
                      <span className="detail-bullet">•</span>
                      <span className="detail-item">{duration}</span>
                    </>
                  )}
                  {wordCount > 0 && (
                    <>
                      <span className="detail-bullet">•</span>
                      <span className="detail-item detail-item--words">{wordCount} words</span>
                    </>
                  )}
                </div>

                <div className="report-card-footer">
                  <span className="report-status-badge report-status-badge--ready">
                    ✓ Document Ready
                  </span>
                  <div className="report-card-actions">
                    <button
                      type="button"
                      className="btn-archive-view"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onNavigateSession) onNavigateSession(report.session_id, 'final_report')
                        else window.location.hash = `#session/${report.session_id}/final_report`
                      }}
                      title="View Report"
                    >
                      <EyeIcon />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      className="btn-archive-download"
                      onClick={(e) => handleDownloadDocx(e, report)}
                      disabled={downloadingId === report.session_id}
                      title="Download Microsoft Word .docx"
                    >
                      <DownloadIcon />
                      <span>{downloadingId === report.session_id ? 'Downloading...' : 'Word Doc'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

