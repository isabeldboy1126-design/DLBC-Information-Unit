import React, { useState, useEffect } from 'react'
import { getApiUrl } from '../../config'

export function ProofreadingStandardsModal({ isOpen, onClose, onStandardUpdated }) {
  const [standardsList, setStandardsList] = useState([])
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('guidelines') // 'guidelines' | 'terminology' | 'formatting' | 'history'

  // Editable Form Fields
  const [guidelines, setGuidelines] = useState('')
  const [terminology, setTerminology] = useState('')
  const [formattingRules, setFormattingRules] = useState('')
  const [changeNotes, setChangeNotes] = useState('')
  const [feedbackMsg, setFeedbackMsg] = useState(null)

  const fetchStandards = async () => {
    try {
      setLoading(true)
      const res = await fetch(getApiUrl('/api/proofreading/standards'))
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
      console.error('Error fetching proofreading standards:', e)
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
    setGuidelines(std.guidelines || '')
    setTerminology(std.terminology || '')
    setFormattingRules(std.formatting_rules || '')
    setChangeNotes('')
  }

  const handleSaveNewVersion = async () => {
    if (!guidelines.trim()) {
      alert('Proofreading guidelines cannot be empty.')
      return
    }

    try {
      setSaving(true)
      setFeedbackMsg(null)
      const res = await fetch(getApiUrl('/api/proofreading/standards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guidelines: guidelines,
          terminology: terminology,
          formatting_rules: formattingRules,
          notes: changeNotes.trim() || undefined,
          set_active: true,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setFeedbackMsg(`✓ Successfully created and activated Proofreading Standard ${data.standard.version_label}!`)
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
      const res = await fetch(getApiUrl(`/api/proofreading/standards/${version}/activate`), {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setFeedbackMsg(`✓ Proofreading Standard ${data.standard.version_label} is now active.`)
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
            <h2>Proofreading Standards &amp; Formatting Rules</h2>
            <p className="modal-subtitle">
              Manage conservative proofreading guidelines, reverence capitalization, and Scripture formatting
            </p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="protected-rules-banner">
          <span className="banner-icon"></span>
          <div>
            <strong>Protected Backend Rules:</strong> Non-fabrication, zero meaning alterations, no rewriting, and strict reverence preservation are immutable backend rules.
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
                className={`nav-item ${activeTab === 'guidelines' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('guidelines')}
              >
                 Guidelines
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'terminology' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('terminology')}
              >
                 Terminology &amp; Reverence
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === 'formatting' ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab('formatting')}
              >
                 Scripture &amp; Formatting
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
            {activeTab === 'guidelines' && (
              <div className="editor-section">
                <h3>Proofreading Guidelines ({selectedVersion?.version_label})</h3>
                <p className="hint-text">
                  Define conservative checking standards, typographical correction boundaries, and grammar rules.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'terminology' && (
              <div className="editor-section">
                <h3>Church Terminology &amp; Reverence Capitalization</h3>
                <p className="hint-text">
                  Standard capitalization rules for divine names, ministerial titles, and official church programmes.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={terminology}
                  onChange={(e) => setTerminology(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'formatting' && (
              <div className="editor-section">
                <h3>Scripture &amp; Citation Formatting Rules</h3>
                <p className="hint-text">
                  Standard rules for Bible book names, chapter-verse punctuation, and British/Nigerian English conventions.
                </p>
                <textarea
                  className="form-control textarea-code"
                  rows={14}
                  value={formattingRules}
                  onChange={(e) => setFormattingRules(e.target.value)}
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
                            setActiveTab('guidelines')
                          }}
                        >
                          View &amp; Edit
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
                    placeholder="Change notes for this new Proofreading Standard version (optional)..."
                    value={changeNotes}
                    onChange={(e) => setChangeNotes(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSaveNewVersion}
                  disabled={saving}
                  id="btn-modal-save-proofreading-standards"
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
