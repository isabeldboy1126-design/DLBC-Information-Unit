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
    model: 'gemini-2.5-flash',
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
    <div className="reporting-workspace">
      {/* Top Navigation & Session Identity Bar */}
      <div className="reporting-header-bar">
        <div className="header-left">
          <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
            ← Back to Session
          </button>
          <div>
            <h2>{session?.title || 'Session Reporting'}</h2>
            <div className="session-breadcrumbs">
              <span className="breadcrumb-item">Recording ✓</span>
              <span className="breadcrumb-item">Raw Transcript ✓</span>
              <span className="breadcrumb-item">Verified Transcript ✓</span>
              <span className="breadcrumb-item breadcrumb-item--active">Reporting ●</span>
              <span className="breadcrumb-item breadcrumb-item--future">Editing ○</span>
              <span className="breadcrumb-item breadcrumb-item--future">Proofreading ○</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={() => setIsStandardsOpen(true)}
          >
            ⚙️ Reporting Standards ({aiStatus.active_standard_version})
          </button>
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

      {/* AI Configuration Status Ribbon */}
      <div className="reporting-status-ribbon">
        <div className="ribbon-item">
          <span className="ribbon-label">Source Text:</span>
          <span className="badge badge--success">✓ Verified Transcript (Authoritative)</span>
        </div>

        <div className="ribbon-item">
          <span className="ribbon-label">Active Standard:</span>
          <span className="badge badge--primary">Reporting Standard {aiStatus.active_standard_version}</span>
        </div>

        <div className="ribbon-item">
          <span className="ribbon-label">AI Status:</span>
          {aiStatus.configured ? (
            <span className="badge badge--success">
              ● Ready ({aiStatus.model})
            </span>
          ) : (
            <span className="badge badge--warning" title="Add GEMINI_API_KEY to backend .env">
              ⚠ AI Reporting is not configured (Key Required)
            </span>
          )}
        </div>

        <div className="ribbon-action">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => handleGenerate('all')}
            disabled={generatingRole !== null}
            id="btn-generate-reports"
          >
            {generatingRole === 'all'
              ? '⚡ Generating Reports...'
              : bothReady
              ? '↻ Regenerate Both Reports'
              : '⚡ Generate Reports'}
          </button>
        </div>
      </div>

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

      {/* Reports Ready for Next Stage (Editing) Banner */}
      {bothReady && (
        <div className="reports-ready-banner">
          <div className="banner-text">
            <h4>✓ Both Independent Report Drafts Are Ready!</h4>
            <p>
              Reporter A (Main Structure) and Reporter B (Details & Omissions) have produced independent drafts from the Verified Transcript.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--success"
            onClick={onNavigateToEditing}
            id="btn-continue-to-editing"
          >
            Reports Ready for Editing →
          </button>
        </div>
      )}

      {/* Dual Independent Reporter Output Grid */}
      <div className="reporting-dual-grid">
        <ReportCard
          role="reporter_a"
          roleTitle="Reporter A — Main Message & Structure"
          roleSubtitle="Focuses on central themes, logical outline, key statements, and core scriptures"
          report={reporterA}
          isGenerating={isGeneratingA}
          onRegenerate={() => handleGenerate('reporter_a')}
          disabled={generatingRole !== null}
        />

        <ReportCard
          role="reporter_b"
          roleTitle="Reporter B — Detail & Omission Watch"
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
