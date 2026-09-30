import { Icon } from '../common/Icon'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl, authFetch } from '../../config'

function SearchIcon() { return <Icon name="search" /> }

function DownloadIcon() { return <Icon name="download" /> }

function DocumentIcon() { return <Icon name="document" /> }

function EyeIcon() { return <Icon name="eye" /> }

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
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [reports, setReports] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProgramme, setSelectedProgramme] = useState('all')
  const [selectedMinister, setSelectedMinister] = useState('all')
  const [downloadingId, setDownloadingId] = useState(null)

  const requestId = useRef(0)

  const fetchReports = useCallback(async () => {
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.append('query', searchQuery.trim())
      if (selectedProgramme !== 'all') params.append('programme', selectedProgramme)
      if (selectedMinister !== 'all') params.append('minister', selectedMinister)

      const res = await authFetch(getApiUrl(`/api/report-processing/archive?${params.toString()}`))
      if (!res.ok) throw new Error(`Report collection unavailable (${res.status})`)
      const data = await res.json()
      if (!Array.isArray(data.reports)) throw new Error('Invalid report collection response')
      if (currentRequest !== requestId.current) return
      setReports(data.reports)
      setLoaded(true)
    } catch (e) {
      if (currentRequest === requestId.current) setError(e.message)
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false)
    }
  }, [searchQuery, selectedProgramme, selectedMinister])

  const invalidateRequests = useCallback(() => { requestId.current++ }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReports()
    }, 250)
    return () => { clearTimeout(timer); invalidateRequests() }
  }, [fetchReports, invalidateRequests])

  const handleDownloadDocx = async (e, report) => {
    e.stopPropagation()
    const sessionId = report.session_id
    if (!sessionId || report.can_export !== true) return
    try {
      setDownloadingId(sessionId)
      const res = await authFetch(getApiUrl(`/api/final-report/sessions/${sessionId}/download`))
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
        const result = await res.json()
        setError(result.detail || 'Approved document could not be downloaded. Reload the report to check its current approval.')
      }
    } catch (err) {
      setError(`Download failed: ${err.message}`)
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
            Saved reports for review. Word documents are available after human approval.
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
            aria-label="Search reports"
            placeholder="Search reports by title, keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="reports-search-clear"
              aria-label="Clear report search"
              onClick={() => setSearchQuery('')}
            >
              <Icon name="close" />
            </button>
          )}
        </div>

        <div className="reports-filters-group">
          <select
            className="reports-filter-select"
            aria-label="Filter reports by programme"
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
            aria-label="Filter reports by minister"
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

      {error && <div className="error-banner" role="alert">{loaded ? 'Could not refresh. Showing previously loaded reports. ' : 'Reports are unavailable. '}{error}<button className="btn btn--secondary" onClick={fetchReports}>Retry reports</button></div>}
      {/* Reports List */}
      {isLoading ? (
        <div className="reports-loading-state">
          <div className="report-processing-blue-spinner" />
          <span>Loading reports archive...</span>
        </div>
      ) : !loaded ? null : reports.length === 0 ? (
        <div className="reports-empty-state">
          <DocumentIcon />
          <h3>No reports found</h3>
          <p>
            {searchQuery || selectedProgramme !== 'all' || selectedMinister !== 'all'
              ? 'Try changing or clearing your search filters.'
              : 'Generated drafts await human review. Approved reports can be exported.'}
          </p>
        </div>
      ) : (
        <div className="reports-cards-grid">
          {reports.map((report) => {
            const title = report.report_title || report.session_title || 'Final Message Report'
            const programme = report.programme || report.event_type || 'Programme not recorded'
            const minister = report.minister || 'Minister not recorded'
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
                  <span className={`report-status-badge ${report.can_export === true ? 'report-status-badge--ready' : 'report-status-badge--review'}`}>
                    {report.can_export === true ? 'Approved' : report.approval_status === 'legacy_unreviewed' ? 'Legacy • needs review' : 'Needs review'}
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
                      disabled={downloadingId === report.session_id || report.can_export !== true}
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

