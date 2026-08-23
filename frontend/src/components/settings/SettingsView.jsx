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

  // Direct Inline Instructions State
  const [activeStageTab, setActiveStageTab] = useState('reporting') // 'reporting' | 'editing' | 'proofreading'
  
  // 1. Reporting Editable Fields
  const [repGeneral, setRepGeneral] = useState('')
  const [repReporterA, setRepReporterA] = useState('')
  const [repReporterB, setRepReporterB] = useState('')
  const [repTerminology, setRepTerminology] = useState('')
  const [repExamples, setRepExamples] = useState('')
  const [repNotes, setRepNotes] = useState('')
  const [repSaving, setRepSaving] = useState(false)
  const [repFeedback, setRepFeedback] = useState(null)

  // 2. Editing Editable Fields
  const [editGeneral, setEditGeneral] = useState('')
  const [editCompilation, setEditCompilation] = useState('')
  const [editTerminology, setEditTerminology] = useState('')
  const [editExamples, setEditExamples] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editFeedback, setEditFeedback] = useState(null)

  // 3. Proofreading Editable Fields
  const [proofGuidelines, setProofGuidelines] = useState('')
  const [proofTerminology, setProofTerminology] = useState('')
  const [proofFormatting, setProofFormatting] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [proofSaving, setProofSaving] = useState(false)
  const [proofFeedback, setProofFeedback] = useState(null)

  const fetchAllStatuses = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [transRes, repRes, editRes, proofRes, repStdRes, editStdRes, proofStdRes] = await Promise.all([
        fetch(getApiUrl('/api/transcription/config-status')).catch(() => null),
        fetch(getApiUrl('/api/reporting/status')).catch(() => null),
        fetch(getApiUrl('/api/editing/status')).catch(() => null),
        fetch(getApiUrl('/api/proofreading/status')).catch(() => null),
        fetch(getApiUrl('/api/reporting/standards/active')).catch(() => null),
        fetch(getApiUrl('/api/editing/standards/active')).catch(() => null),
        fetch(getApiUrl('/api/proofreading/standards/active')).catch(() => null),
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

      // Load active standards content into inline editors
      if (repStdRes && repStdRes.ok) {
        const repData = await repStdRes.json()
        const std = repData.standard || {}
        setRepGeneral(std.general_guidelines || '')
        setRepReporterA(std.reporter_a_instructions || '')
        setRepReporterB(std.reporter_b_instructions || '')
        setRepTerminology(std.terminology || '')
        setRepExamples(std.examples || '')
      }
      if (editStdRes && editStdRes.ok) {
        const editData = await editStdRes.json()
        const std = editData.standard || {}
        setEditGeneral(std.general_guidelines || '')
        setEditCompilation(std.compilation_guidance || '')
        setEditTerminology(std.terminology || '')
        setEditExamples(std.approved_examples || '')
      }
      if (proofStdRes && proofStdRes.ok) {
        const proofData = await proofStdRes.json()
        const std = proofData.standard || {}
        setProofGuidelines(std.guidelines || '')
        setProofTerminology(std.terminology || '')
        setProofFormatting(std.formatting_rules || '')
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

  // Save Reporting Instructions
  const handleSaveReportingInstructions = async () => {
    if (!repGeneral.trim()) {
      alert('General reporting guidelines cannot be empty.')
      return
    }
    setRepSaving(true)
    setRepFeedback(null)
    try {
      const res = await fetch(getApiUrl('/api/reporting/standards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          general_guidelines: repGeneral,
          reporter_a_instructions: repReporterA,
          reporter_b_instructions: repReporterB,
          terminology: repTerminology,
          examples: repExamples,
          notes: repNotes.trim() || 'Updated instructions from Settings',
          set_active: true,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setRepFeedback(`✓ Saved & Activated Reporting Standard ${data.standard.version_label}! All subsequent reporting runs will strictly follow these instructions.`)
        setRepNotes('')
        fetchAllStatuses()
        setTimeout(() => setRepFeedback(null), 6000)
      } else {
        const err = await res.json()
        alert(`Failed to save reporting instructions: ${err.detail || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error saving reporting instructions: ${err.message}`)
    } finally {
      setRepSaving(false)
    }
  }

  // Save Editor Instructions
  const handleSaveEditorInstructions = async () => {
    if (!editGeneral.trim()) {
      alert('General editorial guidelines cannot be empty.')
      return
    }
    setEditSaving(true)
    setEditFeedback(null)
    try {
      const res = await fetch(getApiUrl('/api/editing/standards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          general_guidelines: editGeneral,
          compilation_guidance: editCompilation,
          terminology: editTerminology,
          approved_examples: editExamples,
          notes: editNotes.trim() || 'Updated instructions from Settings',
          set_active: true,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setEditFeedback(`✓ Saved & Activated Editor Standard ${data.standard.version_label}! All subsequent editor synthesis runs will strictly follow these instructions.`)
        setEditNotes('')
        fetchAllStatuses()
        setTimeout(() => setEditFeedback(null), 6000)
      } else {
        const err = await res.json()
        alert(`Failed to save editor instructions: ${err.detail || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error saving editor instructions: ${err.message}`)
    } finally {
      setEditSaving(false)
    }
  }

  // Save Proofreading Instructions
  const handleSaveProofreadingInstructions = async () => {
    if (!proofGuidelines.trim()) {
      alert('Proofreading guidelines cannot be empty.')
      return
    }
    setProofSaving(true)
    setProofFeedback(null)
    try {
      const res = await fetch(getApiUrl('/api/proofreading/standards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guidelines: proofGuidelines,
          terminology: proofTerminology,
          formatting_rules: proofFormatting,
          notes: proofNotes.trim() || 'Updated instructions from Settings',
          set_active: true,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setProofFeedback(`✓ Saved & Activated Proofreading Standard ${data.standard.version_label}! All subsequent proofreading runs will strictly follow these instructions.`)
        setProofNotes('')
        fetchAllStatuses()
        setTimeout(() => setProofFeedback(null), 6000)
      } else {
        const err = await res.json()
        alert(`Failed to save proofreading instructions: ${err.detail || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error saving proofreading instructions: ${err.message}`)
    } finally {
      setProofSaving(false)
    }
  }

  return (
    <div className="settings-page-container">
      {/* Top Header */}
      <div className="settings-page-header">
        <div className="settings-header-left">
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

        {/* Section 1: Editorial Standards & Knowledge Management (User-Facing) */}
        <div className="card settings-card">
          <div className="card-header settings-card-header">
            <div className="settings-card-header-title">
              <span className="settings-icon">📜</span>
              <h3>Editorial Standards &amp; Instruction Management</h3>
            </div>
            <span className="badge badge--primary">User Manageable &bull; Instant AI Update</span>
          </div>

          <div className="card-body">
            <p className="settings-card-desc">
              Directly edit and save the instructions, ministerial vocabulary, and formatting standards for each AI stage. When you click <strong>Save Instructions</strong>, the updated rules immediately become active for all subsequent runs without keeping older context.
            </p>

            {/* Stage Selector Tabs */}
            <div className="settings-stage-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn--small ${activeStageTab === 'reporting' ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => setActiveStageTab('reporting')}
                id="tab-select-reporting-instructions"
              >
                <span>1. Reporting Instructions (Dual Reporters)</span>
                <span className="badge" style={{ marginLeft: '0.4rem', background: activeStageTab === 'reporting' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: activeStageTab === 'reporting' ? '#fff' : '#334155' }}>
                  {reportingStatus?.active_standard_version || 'v1'}
                </span>
              </button>

              <button
                type="button"
                className={`btn btn--small ${activeStageTab === 'editing' ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => setActiveStageTab('editing')}
                id="tab-select-editor-instructions"
              >
                <span>2. AI Editor Instructions (Synthesis)</span>
                <span className="badge" style={{ marginLeft: '0.4rem', background: activeStageTab === 'editing' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: activeStageTab === 'editing' ? '#fff' : '#334155' }}>
                  {editingStatus?.active_standard_version || 'v1'}
                </span>
              </button>

              <button
                type="button"
                className={`btn btn--small ${activeStageTab === 'proofreading' ? 'btn--primary' : 'btn--outline'}`}
                onClick={() => setActiveStageTab('proofreading')}
                id="tab-select-proofreading-instructions"
              >
                <span>3. Proofreading Instructions (Quality &amp; Rules)</span>
                <span className="badge" style={{ marginLeft: '0.4rem', background: activeStageTab === 'proofreading' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: activeStageTab === 'proofreading' ? '#fff' : '#334155' }}>
                  {proofreadingStatus?.active_standard_version || 'v1'}
                </span>
              </button>
            </div>

            {/* TAB 1: REPORTING INSTRUCTIONS */}
            {activeStageTab === 'reporting' && (
              <div className="stage-instructions-panel">
                {repFeedback && (
                  <div className="settings-alert" style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#14532d', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <strong>{repFeedback}</strong>
                  </div>
                )}

                <div className="instructions-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                      <span>📄 General Reporting Guidelines &amp; Outline Conventions *</span>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Applies to both Reporter A and Reporter B</span>
                    </label>
                    <textarea
                      className="form-control"
                      style={{ minHeight: '140px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                      value={repGeneral}
                      onChange={(e) => setRepGeneral(e.target.value)}
                      placeholder="Overall tone, structure, paragraph length, and Information Unit guidelines..."
                    />
                  </div>

                  <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        👤 Reporter A Instructions (Structure &amp; Flow)
                      </label>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '130px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                        value={repReporterA}
                        onChange={(e) => setRepReporterA(e.target.value)}
                        placeholder="Instructions focusing on sermon outline, central message, primary scriptures..."
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        🔍 Reporter B Instructions (Detail &amp; Omissions Watch)
                      </label>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '130px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                        value={repReporterB}
                        onChange={(e) => setRepReporterB(e.target.value)}
                        placeholder="Instructions focusing on supporting facts, illustrations, dates, quotes, secondary scriptures..."
                      />
                    </div>
                  </div>

                  <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        📖 Church Terminology &amp; Glossary
                      </label>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '110px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                        value={repTerminology}
                        onChange={(e) => setRepTerminology(e.target.value)}
                        placeholder="Ministerial titles, church departments, specific spelling conventions..."
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        🌟 Approved Reference Examples
                      </label>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '110px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                        value={repExamples}
                        onChange={(e) => setRepExamples(e.target.value)}
                        placeholder="High quality reference examples to guide the AI..."
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Change note for this save (optional):
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Updated sermon title formatting and pastoral titles..."
                      value={repNotes}
                      onChange={(e) => setRepNotes(e.target.value)}
                    />
                  </div>

                  {/* Save Action Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn--primary"
                      style={{ padding: '0.65rem 1.4rem', fontSize: '0.95rem', fontWeight: 700 }}
                      onClick={handleSaveReportingInstructions}
                      disabled={repSaving}
                      id="btn-save-reporting-instructions"
                    >
                      {repSaving ? 'Saving...' : '💾 Save & Apply Reporting Instructions'}
                    </button>

                    <button
                      type="button"
                      className="btn btn--outline btn--small"
                      onClick={() => setActiveModal('reporting')}
                    >
                      ⚙️ Version History &amp; Revert
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: EDITOR INSTRUCTIONS */}
            {activeStageTab === 'editing' && (
              <div className="stage-instructions-panel">
                {editFeedback && (
                  <div className="settings-alert" style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#14532d', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <strong>{editFeedback}</strong>
                  </div>
                )}

                <div className="instructions-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      📄 General Editorial &amp; Synthesis Guidelines *
                    </label>
                    <textarea
                      className="form-control"
                      style={{ minHeight: '140px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                      value={editGeneral}
                      onChange={(e) => setEditGeneral(e.target.value)}
                      placeholder="Rules for synthesizing Reporter A & B into a unified official report..."
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      🔀 Compilation &amp; Reconciliation Guidance
                    </label>
                    <textarea
                      className="form-control"
                      style={{ minHeight: '130px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                      value={editCompilation}
                      onChange={(e) => setEditCompilation(e.target.value)}
                      placeholder="How to resolve discrepancies between drafts, retain facts, and structure headings..."
                    />
                  </div>

                  <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        📖 Church Terminology &amp; Glossary
                      </label>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '110px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                        value={editTerminology}
                        onChange={(e) => setEditTerminology(e.target.value)}
                        placeholder="Ministerial titles, official vocabulary, terminology..."
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        🌟 Approved Synthesis Examples
                      </label>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '110px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                        value={editExamples}
                        onChange={(e) => setEditExamples(e.target.value)}
                        placeholder="Reference examples of high quality edited reports..."
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Change note for this save (optional):
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Adjusted heading levels and scripture format..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  </div>

                  {/* Save Action Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn--primary"
                      style={{ padding: '0.65rem 1.4rem', fontSize: '0.95rem', fontWeight: 700 }}
                      onClick={handleSaveEditorInstructions}
                      disabled={editSaving}
                      id="btn-save-editor-instructions"
                    >
                      {editSaving ? 'Saving...' : '💾 Save & Apply Editor Instructions'}
                    </button>

                    <button
                      type="button"
                      className="btn btn--outline btn--small"
                      onClick={() => setActiveModal('editing')}
                    >
                      ⚙️ Version History &amp; Revert
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PROOFREADING INSTRUCTIONS */}
            {activeStageTab === 'proofreading' && (
              <div className="stage-instructions-panel">
                {proofFeedback && (
                  <div className="settings-alert" style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#14532d', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <strong>{proofFeedback}</strong>
                  </div>
                )}

                <div className="instructions-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      📄 Conservative Proofreading Guidelines *
                    </label>
                    <textarea
                      className="form-control"
                      style={{ minHeight: '140px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                      value={proofGuidelines}
                      onChange={(e) => setProofGuidelines(e.target.value)}
                      placeholder="Spelling, grammar, punctuation, conservative edit rules (no unnecessary rewording)..."
                    />
                  </div>

                  <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        📖 Church Terminology &amp; Reverence Capitalization
                      </label>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '130px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                        value={proofTerminology}
                        onChange={(e) => setProofTerminology(e.target.value)}
                        placeholder="Reverence pronouns (He, Him, His for God/Jesus), ministerial names and titles..."
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        📜 Scripture Citation &amp; Typography Rules
                      </label>
                      <textarea
                        className="form-control"
                        style={{ minHeight: '130px', fontFamily: 'monospace', fontSize: '0.88rem', lineHeight: 1.45 }}
                        value={proofFormatting}
                        onChange={(e) => setProofFormatting(e.target.value)}
                        placeholder="Bible verse formatting conventions (e.g. John 3:16; 1 Thessalonians 5:17)..."
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Change note for this save (optional):
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Refined KJV Scripture notation and reverence pronouns..."
                      value={proofNotes}
                      onChange={(e) => setProofNotes(e.target.value)}
                    />
                  </div>

                  {/* Save Action Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn--primary"
                      style={{ padding: '0.65rem 1.4rem', fontSize: '0.95rem', fontWeight: 700 }}
                      onClick={handleSaveProofreadingInstructions}
                      disabled={proofSaving}
                      id="btn-save-proofreading-instructions"
                    >
                      {proofSaving ? 'Saving...' : '💾 Save & Apply Proofreading Instructions'}
                    </button>

                    <button
                      type="button"
                      className="btn btn--outline btn--small"
                      onClick={() => setActiveModal('proofreading')}
                    >
                      ⚙️ Version History &amp; Revert
                    </button>
                  </div>
                </div>
              </div>
            )}
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
