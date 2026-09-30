import React, { useState, useEffect } from 'react'
import { getApiUrl } from '../../config'

export function EditorStandardsModal({ isOpen, onClose, onStandardUpdated }) {
  const [standardsList, setStandardsList] = useState([])
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('general') // 'general' | 'compilation' | 'terminology' | 'examples' | 'history'

  // Editable Form Fields
  const [generalGuidelines, setGeneralGuidelines] = useState('')
  const [compilationGuidance, setCompilationGuidance] = useState('')
  const [terminology, setTerminology] = useState('')
  const [approvedExamples, setApprovedExamples] = useState('')
  const [changeNotes, setChangeNotes] = useState('')
  const [feedbackMsg, setFeedbackMsg] = useState(null)

  const fetchStandards = async () => {
    try {
      setLoading(true)
      const res = await fetch(getApiUrl('/api/editing/standards'))
      if (res.ok) {
        const data = await res.json()
        const list = data.standards || []
        setStandardsList(list)
        if (list.length > 0) {
          const active = list.find((s) => s.is_active) || list[0]
          loadStandardIntoForm(active)
        }
      }
    } catch (e) {
      console.error('Error fetching editor standards:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchStandards()
      setFeedbackMsg(null)
    }
  }, [isOpen])

  const loadStandardIntoForm = (std) => {
    setSelectedVersion(std)
    setGeneralGuidelines(std.general_guidelines || '')
    setCompilationGuidance(std.compilation_guidance || '')
    setTerminology(std.terminology || '')
    setApprovedExamples(std.approved_examples || '')
    setChangeNotes('')
  }

  const handleSaveNewVersion = async () => {
    if (!generalGuidelines.trim()) {
      alert('General editorial guidelines cannot be empty.')
      return
    }

    try {
      setSaving(true)
      setFeedbackMsg(null)
      const res = await fetch(getApiUrl('/api/editing/standards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          general_guidelines: generalGuidelines,
          compilation_guidance: compilationGuidance,
          terminology: terminology,
          approved_examples: approvedExamples,
          notes: changeNotes.trim() || undefined,
          set_active: true,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setFeedbackMsg(`✓ Successfully created and activated Editor Standard ${data.standard.version_label}!`)
        await fetchStandards()
        if (onStandardUpdated) onStandardUpdated(data.standard)
      } else {
        const err = await res.json()
        alert(`Failed to save standard: ${err.detail || 'Unknown error'}`)
      }
    } catch (e) {
      alert(`Error saving standard: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleActivateVersion = async (version) => {
    try {
      setSaving(true)
      const res = await fetch(getApiUrl(`/api/editing/standards/${version}/activate`), {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setFeedbackMsg(`✓ Editor Standard ${data.standard.version_label} is now active.`)
        await fetchStandards()
        if (onStandardUpdated) onStandardUpdated(data.standard)
      }
    } catch (e) {
      alert(`Error activating version: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container modal-container--large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Editor Standards & Compilation Guidance</h2>
            <p className="modal-subtitle">
              Manage editable editing instructions, reconciliation rules, terminology, and approved examples
            </p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="protected-rules-banner">
          <span className="banner-icon"></span>
          <div>
            <strong>Protected Backend Rules:</strong> Strict Verified Transcript authority, non-fabrication, and factual reconciliation guardrails are immutable backend rules.
          </div>
        </div>

        {feedbackMsg && <div className="feedback-banner">{feedbackMsg}</div>}

        <div className="standards-layout">
          <div className="standards-sidebar">
            <div className="standards-version-selector">
              <label>Viewing Standard:</label>
              <select
                className="form-control"
                value={selectedVersion?.version || ''}
                onChange={(e) => {
                  const ver = parseInt(e.target.value, 10)
                  const found = standardsList.find((s) => s.version === ver)
                  if (found) loadStandardIntoForm(found)
                }}
              >
                {standardsList.map((s) => (
                  <option key={s.version} value={s.version}>
                    {s.version_label} {s.is_active ? '(Active)' : ''} — {new Date(s.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <nav className="standards-nav">
              <button
                type="button"
                className={`nav-item ${activeTab === 'general' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                 General Guidelines
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'compilation' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('compilation')}
              >
                 Compilation & Reconciliation
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'terminology' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('terminology')}
              >
                 Church Terminology
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'examples' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('examples')}
              >
                 Approved Examples
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'history' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                 Version History ({standardsList.length})
              </button>
            </nav>

            {!selectedVersion?.is_active && (
              <div className="activate-box">
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => handleActivateVersion(selectedVersion?.version)}
                  disabled={saving}
                >
                  Make {selectedVersion?.version_label} Active
                </button>
              </div>
            )}
          </div>

          <div className="standards-editor-content">
            {activeTab === 'general' && (
              <div className="editor-section">
                <h3>General Editorial Guidelines ({selectedVersion?.version_label})</h3>
                <p className="hint-text">
                  Define publication-ready tone, unified third-person voice, structural sections, and conciseness standards.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={generalGuidelines}
                  onChange={(e) => setGeneralGuidelines(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'compilation' && (
              <div className="editor-section">
                <h3>Compilation & Reconciliation Guidance</h3>
                <p className="hint-text">
                  Define how Reporter A (structure) and Reporter B (detail watch) are synthesized, and how disagreements are checked against the Verified Transcript.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={compilationGuidance}
                  onChange={(e) => setCompilationGuidance(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'terminology' && (
              <div className="editor-section">
                <h3>Church Terminology & Glossary</h3>
                <p className="hint-text">
                  Standard titles, abbreviations, and department names used in Deeper Life Bible Church reporting.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={terminology}
                  onChange={(e) => setTerminology(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'examples' && (
              <div className="editor-section">
                <h3>Approved Finished Report Examples</h3>
                <p className="hint-text">
                  High-quality reference examples of completed Information Unit reports.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={approvedExamples}
                  onChange={(e) => setApprovedExamples(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'history' && (
              <div className="editor-section">
                <h3>Version History</h3>
                <ul className="standards-history-list">
                  {standardsList.map((s) => (
                    <li key={s.version} className={`history-item ${s.is_active ? 'history-item--active' : ''}`}>
                      <div className="history-info">
                        <strong>{s.version_label}</strong> {s.is_active && <span className="badge badge--success">Active</span>}
                        <span className="history-date">{new Date(s.created_at).toLocaleString()}</span>
                        <p className="history-notes">{s.notes || 'No change notes.'}</p>
                      </div>
                      <div className="history-actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--small"
                          onClick={() => {
                            loadStandardIntoForm(s)
                            setActiveTab('general')
                          }}
                        >
                          View & Edit
                        </button>
                        {!s.is_active && (
                          <button
                            type="button"
                            className="btn btn--outline btn--small"
                            onClick={() => handleActivateVersion(s.version)}
                            disabled={saving}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeTab !== 'history' && (
              <div className="standards-save-bar">
                <div className="change-notes-input">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Change notes for this new Editor Standard version (optional)..."
                    value={changeNotes}
                    onChange={(e) => setChangeNotes(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSaveNewVersion}
                  disabled={saving}
                  id="btn-modal-save-editor-standards"
                >
                  {saving ? 'Saving...' : ' Save & Apply Instructions'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
