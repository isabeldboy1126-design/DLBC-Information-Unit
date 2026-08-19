import React, { useState, useEffect, useCallback } from 'react'
import { ReportCard } from './ReportCard'
import { ReportingStandardsModal } from './ReportingStandardsModal'

export function ReportingView({ session, onBack, onNavigateToEditing }) {
  const [reportsData, setReportsData] = useState({
    reporter_a: null,
    reporter_b: null,
    history: [],
    reporting_status: 'not_started',
  })
  const [aiStatus, setAiStatus] = useState({
    configured: false,
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    active_standard_version: 'v1',
    message: '',
  })
  const [loading, setLoading] = useState(false)
  const [generatingRole, setGeneratingRole] = useState(null) // 'all' | 'reporter_a' | 'reporter_b' | null
  const [isStandardsOpen, setIsStandardsOpen] = useState(false)
  const [errorBanner, setErrorBanner] = useState(null)

  const sessionId = session?.session_id

  // Fetch AI status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/reporting/status')
      if (res.ok) {
        const data = await res.json()
        setAiStatus(data)
      }
    } catch (e) {
      console.error('Error fetching reporting status:', e)
    }
  }, [])

  // Fetch Session Reports
  const fetchReports = useCallback(async () => {
    if (!sessionId) return
    try {
      setLoading(true)
      const res = await fetch(`http://localhost:8000/api/reporting/sessions/${sessionId}/reports`)
      if (res.ok) {
        const data = await res.json()
        setReportsData(data)
      }
    } catch (e) {
      console.error('Error fetching session reports:', e)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchStatus()
    fetchReports()
  }, [fetchStatus, fetchReports])

  const handleGenerate = async (role = 'all') => {
    if (!aiStatus.configured) {
      setErrorBanner('AI Reporting is not configured. Please add GEMINI_API_KEY to your backend .env file.')
      return
    }

    if (!session?.verified_text && !session?.raw_text) {
      setErrorBanner('A Verified Transcript is required before generating reports. Please complete verification first.')
      return
    }

    try {
      setErrorBanner(null)
      setGeneratingRole(role)
      const res = await fetch(`http://localhost:8000/api/reporting/sessions/${sessionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })

      if (res.ok) {
        const data = await res.json()
        setReportsData((prev) => ({
          ...prev,
          reporter_a: data.reporter_a || prev.reporter_a,
          reporter_b: data.reporter_b || prev.reporter_b,
          reporting_status: data.reporting_status,
        }))
        await fetchReports()
      } else {
        const err = await res.json()
        setErrorBanner(err.detail || 'Failed to generate reports.')
        await fetchReports()
      }
    } catch (e) {
      setErrorBanner(`Network or server error during generation: ${e.message}`)
    } finally {
      setGeneratingRole(null)
    }
  }

  const reporterA = reportsData.reporter_a
  const reporterB = reportsData.reporter_b
  const bothReady = reporterA?.status === 'ready' && reporterB?.status === 'ready'
  const isGeneratingAll = generatingRole === 'all'
  const isGeneratingA = generatingRole === 'reporter_a' || isGeneratingAll
  const isGeneratingB = generatingRole === 'reporter_b' || isGeneratingAll

  return (
    <div className="reporting-workspace-container">
      {/* Top Hero Banner (Compact & Refined) */}
      <div className="reporting-hero-banner">
        <div className="reporting-hero-top">
          <button
            type="button"
            className="reporting-back-btn"
            onClick={onBack}
            id="btn-reporting-back-to-session"
          >
            ← Back to Session
          </button>

          <button
            type="button"
            className="reporting-standard-badge-btn"
            onClick={() => setIsStandardsOpen(true)}
            id="btn-manage-reporting-standards"
          >
            <span>Standard: <strong>Reporting Standard {aiStatus.active_standard_version}</strong></span>
            <span className="reporting-standard-manage-link">Manage</span>
          </button>
        </div>

        <div className="reporting-hero-title-group">
          <h1 className="reporting-hero-title">{session?.title || 'Sunday Morning Worship & Sermon'}</h1>
          <div className="reporting-lifecycle-stepper-line">
            <span className="lifecycle-inline-item lifecycle-inline-item--done">Recording ✓</span>
            <span className="lifecycle-inline-item lifecycle-inline-item--done">Raw Transcript ✓</span>
            <span className="lifecycle-inline-item lifecycle-inline-item--done">Verified Transcript ✓</span>
            <span className="lifecycle-inline-item lifecycle-inline-item--active">Reporting ●</span>
            <span className="lifecycle-inline-item lifecycle-inline-item--future">Editing ○</span>
            <span className="lifecycle-inline-item lifecycle-inline-item--future">Proofreading ○</span>
          </div>
        </div>
      </div>

      {/* Error / Alert Banner */}
      {errorBanner && (
        <div className="error-banner" role="alert">
          <div className="error-content">
            <span className="error-icon">⚠️</span>
            <div className="error-text">{errorBanner}</div>
          </div>
          <button type="button" className="error-dismiss" onClick={() => setErrorBanner(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Reports Ready Banner */}
      {bothReady ? (
        <div className="reporting-ready-floating-card">
          <div className="ready-card-left">
            <div className="ready-check-icon-circle">✓</div>
            <div className="ready-card-text">
              <strong>Both Independent Report Drafts Are Ready!</strong>
              <p>Reporter A (Structure) and Reporter B (Details) have completed their independent analyses.</p>
            </div>
          </div>
          <div className="ready-card-actions">
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => handleGenerate('all')}
              disabled={generatingRole !== null}
              title="Regenerate both drafts"
            >
              ↻ Regenerate
            </button>
            <button
              type="button"
              className="btn-continue-editing-primary"
              onClick={onNavigateToEditing}
              id="btn-continue-to-editing"
            >
              <span>Continue to Editing</span>
              <span>→</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="card reporting-status-ribbon">
          <div className="reporting-ribbon-meta-group">
            <div className="reporting-meta-item">
              <span className="meta-label">Source:</span>
              <span className="meta-badge meta-badge--success">✓ Verified Transcript (Authoritative)</span>
            </div>
            <div className="reporting-meta-item">
              <span className="meta-label">Standard:</span>
              <span className="meta-badge meta-badge--primary">Reporting Standard {aiStatus.active_standard_version}</span>
            </div>
            {!aiStatus.configured && (
              <span className="meta-badge meta-badge--warning">⚠ Gemini API Key Required</span>
            )}
          </div>
          <button
            type="button"
            className="btn-generate-reports-primary"
            onClick={() => handleGenerate('all')}
            disabled={generatingRole !== null}
            id="btn-generate-reports"
          >
            {generatingRole === 'all'
              ? '⚡ Generating Reports...'
              : '⚡ Generate Reports'}
          </button>
        </div>
      )}

      {/* Notice if AI key is missing */}
      {!aiStatus.configured && (
        <div className="card notice-card">
          <div className="notice-content">
            <h4>🔑 AI Reporting Setup Note</h4>
            <p>
              The AI Reporting engine is ready and waiting for your Gemini API credentials.
              Once you add <code>GEMINI_API_KEY=your_key</code> to <code>backend/.env</code>, click <strong>Generate Reports</strong> to produce drafts.
            </p>
          </div>
        </div>
      )}

      {/* Dual Independent Reporter Output Grid Matching reporting-workspace.png */}
      <div className="reporting-dual-cards-grid">
        <ReportCard
          role="reporter_a"
          roleBadge="A"
          roleTitle="Main Message & Structure"
          roleSubtitle="Focuses on central themes, logical outline, key statements, and core scriptures"
          report={reporterA}
          isGenerating={isGeneratingA}
          onRegenerate={() => handleGenerate('reporter_a')}
          disabled={generatingRole !== null}
        />

        <ReportCard
          role="reporter_b"
          roleBadge="B"
          roleTitle="Detail & Omission Watch"
          roleSubtitle="Focuses on supporting facts, illustrations, quotes, names, numbers, and subtle details"
          report={reporterB}
          isGenerating={isGeneratingB}
          onRegenerate={() => handleGenerate('reporter_b')}
          disabled={generatingRole !== null}
        />
      </div>

      {/* Standards Management Modal */}
      <ReportingStandardsModal
        isOpen={isStandardsOpen}
        onClose={() => setIsStandardsOpen(false)}
        onStandardUpdated={(updatedStd) => {
          setAiStatus((prev) => ({ ...prev, active_standard_version: updatedStd.version_label }))
        }}
      />
    </div>
  )
}
