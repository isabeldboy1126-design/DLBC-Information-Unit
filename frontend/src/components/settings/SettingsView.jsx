import React, { useState, useEffect, useCallback } from 'react'
import { getApiUrl, API_BASE_URL } from '../../config'
import { ReportingStandardsModal } from '../reporting/ReportingStandardsModal'
import { EditorStandardsModal } from '../editing/EditorStandardsModal'
import { ProofreadingStandardsModal } from '../proofreading/ProofreadingStandardsModal'
import { ProgrammesSettingsSection } from './ProgrammesSettingsSection'

export function SettingsView({ onBack }) {
  const [transcriptionConfig, setTranscriptionConfig] = useState(null)
  const [reportingStatus, setReportingStatus] = useState(null)
  const [editingStatus, setEditingStatus] = useState(null)
  const [proofreadingStatus, setProofreadingStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  // Standards Modals state
  const [activeModal, setActiveModal] = useState(null) // 'reporting' | 'editing' | 'proofreading' | null

  const fetchAllStatuses = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [transRes, repRes, editRes, proofRes] = await Promise.all([
        fetch(getApiUrl('/api/transcribe/config-status')).catch(() => null),
        fetch(getApiUrl('/api/reporting/status')).catch(() => null),
        fetch(getApiUrl('/api/editing/status')).catch(() => null),
        fetch(getApiUrl('/api/proofreading/status')).catch(() => null),
      ])

      if (transRes && transRes.ok) {
        setTranscriptionConfig(await transRes.json())
      }
      if (repRes && repRes.ok) {
        setReportingStatus(await repRes.json())
      }
      if (editRes && editRes.ok) {
        setEditingStatus(await editRes.json())
      }
      if (proofRes && proofRes.ok) {
        setProofreadingStatus(await proofRes.json())
      }

      setLastRefreshed(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Error loading settings status:', err)
      setError(`Could not connect to backend server at ${API_BASE_URL}.`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllStatuses()
  }, [fetchAllStatuses])

  return (
    <div className="settings-page-container">
      {/* Top Header */}
      <div className="settings-page-header">
        <div className="settings-header-left">
          {onBack && (
            <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
              ← Back
            </button>
          )}
          <div>
            <h1 className="settings-title">System Settings &amp; AI Standards</h1>
            <p className="settings-subtitle">
              Manage editorial guidelines, inspect transcription providers, and verify system operational status.
            </p>
          </div>
        </div>

        <div className="settings-header-right">
          {lastRefreshed && (
            <span className="settings-refresh-label">Checked at {lastRefreshed}</span>
          )}
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={fetchAllStatuses}
            disabled={isLoading}
          >
            {isLoading ? 'Checking...' : '↻ Refresh Status'}
          </button>
        </div>
      </div>

      {error && (
        <div className="settings-alert settings-alert--error">
          <span>⚠️ {error}</span>
        </div>
      )}

      <div className="settings-grid">
        {/* Section 0: Programmes & Sessions Management (User-Facing) */}
        <ProgrammesSettingsSection />

        {/* Section 1: Editorial Standards & Guidelines Management (User-Facing) */}
        <div className="card settings-card">
          <div className="card-header settings-card-header">
            <div className="settings-card-header-title">
              <span className="settings-icon">📜</span>
              <h3>Editorial Standards &amp; Knowledge Management</h3>
            </div>
            <span className="badge badge--primary">User Manageable</span>
          </div>

          <div className="card-body">
            <p className="settings-card-desc">
              Define the theological guidelines, ministerial vocabulary, and formatting standards used by each AI stage. Updates take effect immediately for new runs.
            </p>

            <div className="settings-standards-list">
              {/* Reporting Standard Card */}
              <div className="settings-standard-row">
                <div className="settings-standard-info">
                  <div className="settings-standard-title-row">
                    <strong>1. Reporting Standards (Dual Reporters)</strong>
                    <span className="badge badge--info">
                      Active: {reportingStatus?.active_standard_version || 'v1'}
                    </span>
                  </div>
                  <p className="settings-standard-summary">
                    Defines guidelines for Reporter A (Structure) and Reporter B (Detail &amp; Omissions), sermon outline conventions, and church terminology.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => setActiveModal('reporting')}
                  id="btn-manage-reporting-standards"
                >
                  ⚙️ Manage Guidelines &amp; Versions
                </button>
              </div>

              {/* Editor Standard Card */}
              <div className="settings-standard-row">
                <div className="settings-standard-info">
                  <div className="settings-standard-title-row">
                    <strong>2. AI Editor Standards (Report Synthesis)</strong>
                    <span className="badge badge--info">
                      Active: {editingStatus?.active_standard_version || 'v1'}
                    </span>
                  </div>
                  <p className="settings-standard-summary">
                    Controls how the AI Editor reconciles Reporter A and B, formats headings, handles sermon illustrations, and verifies Scripture citations.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => setActiveModal('editing')}
                  id="btn-manage-editor-standards"
                >
                  ⚙️ Manage Guidelines &amp; Versions
                </button>
              </div>

              {/* Proofreading Standard Card */}
              <div className="settings-standard-row">
                <div className="settings-standard-info">
                  <div className="settings-standard-title-row">
                    <strong>3. Proofreading Standards (Quality Check)</strong>
                    <span className="badge badge--info">
                      Active: {proofreadingStatus?.active_standard_version || 'v1'}
                    </span>
                  </div>
                  <p className="settings-standard-summary">
                    Configures rules for spelling, punctuation, capitalization, Scripture notation (e.g. KJV format), and protected ministerial names.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => setActiveModal('proofreading')}
                  id="btn-manage-proofreading-standards"
                >
                  ⚙️ Manage Guidelines &amp; Versions
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: AI Pipeline & Language Engine Status */}
        <div className="card settings-card">
          <div className="card-header settings-card-header">
            <div className="settings-card-header-title">
              <span className="settings-icon">🤖</span>
              <h3>AI Language Engine &amp; Pipelines</h3>
            </div>
            <span className="badge badge--success">Backend Managed</span>
          </div>

          <div className="card-body">
            <p className="settings-card-desc">
              Live configuration status of backend AI services. API keys are safely configured in environment variables and never exposed in the client.
            </p>

            <div className="settings-status-table-container">
              <table className="settings-status-table">
                <thead>
                  <tr>
                    <th>Pipeline Stage</th>
                    <th>Provider / Model</th>
                    <th>Status</th>
                    <th>Security</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>AI Reporting (Dual)</strong>
                    </td>
                    <td>{reportingStatus?.provider || 'Google Gemini'} ({reportingStatus?.model || 'gemini-3.7-flash'})</td>
                    <td>
                      {reportingStatus?.configured ? (
                        <span className="badge badge--success">✓ Ready</span>
                      ) : (
                        <span className="badge badge--warning">⚠ Key Required (.env)</span>
                      )}
                    </td>
                    <td><span className="settings-secure-pill">🔒 Backend Only</span></td>
                  </tr>
                  <tr>
                    <td>
                      <strong>AI Editor Synthesis</strong>
                    </td>
                    <td>{editingStatus?.provider || 'Google Gemini'} ({editingStatus?.model || 'gemini-3.7-flash'})</td>
                    <td>
                      {editingStatus?.configured ? (
                        <span className="badge badge--success">✓ Ready</span>
                      ) : (
                        <span className="badge badge--warning">⚠ Key Required (.env)</span>
                      )}
                    </td>
                    <td><span className="settings-secure-pill">🔒 Backend Only</span></td>
                  </tr>
                  <tr>
                    <td>
                      <strong>AI Proofreader</strong>
                    </td>
                    <td>{proofreadingStatus?.provider || 'Google Gemini'} ({proofreadingStatus?.model || 'gemini-3.7-flash'})</td>
                    <td>
                      {proofreadingStatus?.configured ? (
                        <span className="badge badge--success">✓ Ready</span>
                      ) : (
                        <span className="badge badge--warning">⚠ Key Required (.env)</span>
                      )}
                    </td>
                    <td><span className="settings-secure-pill">🔒 Backend Only</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Section 3: Speech-to-Text & Transcription Providers */}
        <div className="card settings-card">
          <div className="card-header settings-card-header">
            <div className="settings-card-header-title">
              <span className="settings-icon">🎙️</span>
              <h3>Speech Recognition &amp; Audio Transcription</h3>
            </div>
            <span className="badge badge--info">Live &amp; Batch</span>
          </div>

          <div className="card-body">
            <div className="settings-provider-grid">
              {/* Azure Speech */}
              <div className="settings-provider-card">
                <div className="settings-provider-header">
                  <div>
                    <strong>Azure Speech Service</strong>
                    <div className="settings-provider-sub">Primary Live &amp; Recorded Engine</div>
                  </div>
                  {transcriptionConfig?.providers?.azure_speech?.is_configured ? (
                    <span className="badge badge--success">✓ Configured</span>
                  ) : (
                    <span className="badge badge--warning">⚠ Unconfigured</span>
                  )}
                </div>
                <div className="settings-provider-details">
                  <div className="settings-detail-row">
                    <span>Region:</span>
                    <code>{transcriptionConfig?.providers?.azure_speech?.region || 'southafricanorth'}</code>
                  </div>
                  <div className="settings-detail-row">
                    <span>Locale:</span>
                    <code>{transcriptionConfig?.providers?.azure_speech?.language || 'en-NG'} (Nigeria)</code>
                  </div>
                  <div className="settings-detail-row">
                    <span>Active Provider:</span>
                    <span>{transcriptionConfig?.active_provider === 'azure_speech' ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>

              {/* Faster Whisper Local Fallback */}
              <div className="settings-provider-card">
                <div className="settings-provider-header">
                  <div>
                    <strong>Faster-Whisper (Local)</strong>
                    <div className="settings-provider-sub">Offline / Resilient Fallback</div>
                  </div>
                  <span className="badge badge--success">✓ Built-in</span>
                </div>
                <div className="settings-provider-details">
                  <div className="settings-detail-row">
                    <span>Mode:</span>
                    <code>Local Device Inference</code>
                  </div>
                  <div className="settings-detail-row">
                    <span>Internet Required:</span>
                    <span>No</span>
                  </div>
                  <div className="settings-detail-row">
                    <span>Audio Sync:</span>
                    <span>High-Fidelity Lossless PCM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Storage, Persistence & Data Safety */}
        <div className="card settings-card">
          <div className="card-header settings-card-header">
            <div className="settings-card-header-title">
              <span className="settings-icon">💾</span>
              <h3>Storage &amp; Data Integrity Rules</h3>
            </div>
            <span className="badge badge--secondary">System Architecture</span>
          </div>

          <div className="card-body">
            <div className="settings-integrity-grid">
              <div className="settings-integrity-item">
                <div className="settings-integrity-title">📁 Master Audio Directory</div>
                <p>Preserved in <code>storage/</code> as original lossless 16kHz PCM WAV. Master audio is never deleted or compressed destructively.</p>
              </div>

              <div className="settings-integrity-item">
                <div className="settings-integrity-title">🗄️ Database Architecture</div>
                <p>Persistent SQLite database at <code>storage/app.db</code>. Automated tests operate on isolated temp databases.</p>
              </div>

              <div className="settings-integrity-item">
                <div className="settings-integrity-title">📄 Document Export Engine</div>
                <p>Deterministic <code>.docx</code> generator. Renders approved proofread text without altering wording or hallucinating changes.</p>
              </div>

              <div className="settings-integrity-item">
                <div className="settings-integrity-title">🔒 Session Isolation Rule</div>
                <p>One Church Service = Exactly One Session ID. Processing stages append revisions without creating duplicate sessions.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals for Standards */}
      {activeModal === 'reporting' && (
        <ReportingStandardsModal
          isOpen={true}
          onClose={() => {
            setActiveModal(null)
            fetchAllStatuses()
          }}
          onStandardActivated={fetchAllStatuses}
        />
      )}

      {activeModal === 'editing' && (
        <EditorStandardsModal
          isOpen={true}
          onClose={() => {
            setActiveModal(null)
            fetchAllStatuses()
          }}
          onStandardActivated={fetchAllStatuses}
        />
      )}

      {activeModal === 'proofreading' && (
        <ProofreadingStandardsModal
          isOpen={true}
          onClose={() => {
            setActiveModal(null)
            fetchAllStatuses()
          }}
          onStandardActivated={fetchAllStatuses}
        />
      )}
    </div>
  )
}
