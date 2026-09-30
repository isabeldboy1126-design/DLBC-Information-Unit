import React, { useState, useEffect } from 'react'
import { getApiUrl } from '../../config'

export function ReportingStandardsModal({ isOpen, onClose, onStandardUpdated }) {
  const [standardsList, setStandardsList] = useState([])
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('general') // 'general' | 'reporter_a' | 'reporter_b' | 'terminology' | 'examples' | 'history'

  // Editable Form Fields
  const [generalGuidelines, setGeneralGuidelines] = useState('')
  const [reporterAInstructions, setReporterAInstructions] = useState('')
  const [reporterBInstructions, setReporterBInstructions] = useState('')
  const [terminology, setTerminology] = useState('')
  const [examples, setExamples] = useState('')
  const [changeNotes, setChangeNotes] = useState('')
  const [feedbackMsg, setFeedbackMsg] = useState(null)

  const fetchStandards = async () => {
    try {
      setLoading(true)
      const res = await fetch(getApiUrl('/api/reporting/standards'))
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
      console.error('Error fetching reporting standards:', e)
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
    setReporterAInstructions(std.reporter_a_instructions || '')
    setReporterBInstructions(std.reporter_b_instructions || '')
    setTerminology(std.terminology || '')
    setExamples(std.examples || '')
    setChangeNotes('')
  }

  const handleSaveNewVersion = async () => {
    if (!generalGuidelines.trim()) {
      alert('General guidelines cannot be empty.')
      return
    }

    try {
      setSaving(true)
      setFeedbackMsg(null)
      const res = await fetch(getApiUrl('/api/reporting/standards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          general_guidelines: generalGuidelines,
          reporter_a_instructions: reporterAInstructions,
          reporter_b_instructions: reporterBInstructions,
          terminology: terminology,
          examples: examples,
          notes: changeNotes.trim() || undefined,
          set_active: true,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setFeedbackMsg(`✓ Successfully created and activated Reporting Standard ${data.standard.version_label}!`)
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
      const res = await fetch(getApiUrl(`/api/reporting/standards/${version}/activate`), {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setFeedbackMsg(`✓ Reporting Standard ${data.standard.version_label} is now active.`)
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
            <h2>Reporting Standards & Guidance</h2>
            <p className="modal-subtitle">
              Manage editable reporting instructions, role guidance, glossary, and reference examples
            </p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="protected-rules-banner">
          <span className="banner-icon"></span>
          <div>
            <strong>Protected Backend Rules:</strong> Core accuracy, non-fabrication, and strict transcript fidelity guardrails are enforced on the backend and cannot be overridden.
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
                className={`nav-item ${activeTab === 'reporter_a' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('reporter_a')}
              >
                 Reporter A (Structure)
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'reporter_b' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('reporter_b')}
              >
                 Reporter B (Details)
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
                <h3>General Reporting Guidelines ({selectedVersion?.version_label})</h3>
                <p className="hint-text">
                  Define overall report structure, tone, level of detail, and standard Information Unit conventions.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={generalGuidelines}
                  onChange={(e) => setGeneralGuidelines(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'reporter_a' && (
              <div className="editor-section">
                <h3>Reporter A — Main Message & Structure Instructions</h3>
                <p className="hint-text">
                  Guidance emphasizing central themes, chronological flow, primary scriptures, and coherent organization.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={reporterAInstructions}
                  onChange={(e) => setReporterAInstructions(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'reporter_b' && (
              <div className="editor-section">
                <h3>Reporter B — Detail & Omission Watch Instructions</h3>
                <p className="hint-text">
                  Guidance emphasizing supporting points, names, numbers, illustrations, quotes, and specific facts.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={reporterBInstructions}
                  onChange={(e) => setReporterBInstructions(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'terminology' && (
              <div className="editor-section">
                <h3>Church Terminology & Glossary</h3>
                <p className="hint-text">
                  Specific spellings, titles, departments, programme names, and standard phrasing used in Deeper Life messages.
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
                <h3>Approved Report Examples</h3>
                <p className="hint-text">
                  Reference examples of high-quality Information Unit reports to provide in-context guidance for the AI.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={examples}
                  onChange={(e) => setExamples(e.target.value)}
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
                    placeholder="Change notes for this new version (optional)..."
                    value={changeNotes}
                    onChange={(e) => setChangeNotes(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSaveNewVersion}
                  disabled={saving}
                  id="btn-modal-save-reporting-standards"
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
