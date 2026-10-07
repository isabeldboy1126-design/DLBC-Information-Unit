import React, { useState, useEffect, useRef } from 'react'
import { getApiUrl } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { saveFileWithNativeDialog } from '../../services/desktopPlatform'

/**
 * WorkspaceEditor — High-Fidelity Ministerial Document Editor with Source Panel
 * Matches visual authority:
 * - Desktop: media_1791012340774.jpg (Panels 2, 8)
 * - Mobile: media_1791012340786.jpg (Panels 2, 3)
 */
export function WorkspaceEditor({
  sessionId,
  session,
  isManual = false,
  editorName = '',
  onUpdateDocument,
  onClose,
  onBack,
}) {
  const { user } = useAuth()

  // Document Content & Metadata
  const [reportTitle, setReportTitle] = useState('')
  const [reportText, setReportText] = useState('')
  const [originalReportText, setOriginalReportText] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [lastSaved, setLastSaved] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Saved') // 'Saved' | 'Editing…' | 'Saving…' | 'error'
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Undo / Redo History
  const historyRef = useRef({
    past: [],
    future: [],
  })

  const pushHistory = (txt) => {
    historyRef.current.past.push(txt)
    if (historyRef.current.past.length > 50) historyRef.current.past.shift()
    historyRef.current.future = []
  }

  const handleUndo = () => {
    if (historyRef.current.past.length === 0) return
    const prev = historyRef.current.past.pop()
    historyRef.current.future.push(reportText)
    setReportText(prev)
    updateWordCount(prev)
    updateHeadingsList(prev)
    setSaveStatus('Editing…')
  }

  const handleRedo = () => {
    if (historyRef.current.future.length === 0) return
    const nxt = historyRef.current.future.pop()
    historyRef.current.past.push(reportText)
    setReportText(nxt)
    updateWordCount(nxt)
    updateHeadingsList(nxt)
    setSaveStatus('Editing…')
  }

  // Formatting State
  const [fontFamily, setFontFamily] = useState('Inter')
  const [fontSize, setFontSize] = useState('16')
  const [customFontSize, setCustomFontSize] = useState('16')
  const [lineSpacing, setLineSpacing] = useState('1.5')
  const [showOutline, setShowOutline] = useState(false)
  const [headingsList, setHeadingsList] = useState([])

  // Source Panel State (Source | Transcript | Audio)
  const [sourceTab, setSourceTab] = useState('source') // 'source' | 'transcript' | 'audio'
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true)
  const [selectedSnippet, setSelectedSnippet] = useState(null)
  const [transcriptData, setTranscriptData] = useState([])
  const [transcriptSearch, setTranscriptSearch] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)

  // Floating Context Menu State
  const [floatingMenu, setFloatingMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    selectedText: '',
  })
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [aiActionInProgress, setAiActionInProgress] = useState(false)
  const [aiDiffPreview, setAiDiffPreview] = useState(null)
  const [customAiPrompt, setCustomAiPrompt] = useState('')
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false)

  const editorRef = useRef(null)
  const audioPlayerRef = useRef(null)
  const autosaveTimerRef = useRef(null)

  // 1. Fetch Session Report or Load Standalone Document with Draft Protection
  useEffect(() => {
    let isMounted = true
    async function loadDocument() {
      setIsLoading(true)
      try {
        // Check for local draft cache first to protect uncommitted changes
        let cachedDraft = null
        try {
          const stored = localStorage.getItem(`dlbc_draft_${sessionId}`)
          if (stored) {
            cachedDraft = JSON.parse(stored)
          }
        } catch {}

        // If manual/standalone document
        if (isManual || (typeof sessionId === 'string' && sessionId.startsWith('doc_'))) {
          const initialTitle = cachedDraft?.title || session?.title || 'Untitled Document'
          const initialText = cachedDraft?.content ?? session?.content ?? ''
          if (isMounted) {
            setReportTitle(initialTitle)
            setReportText(initialText)
            setOriginalReportText(initialText)
            updateWordCount(initialText)
            updateHeadingsList(initialText)
            setSaveStatus('Saved')
            setLastSaved(new Date())
            setIsLoading(false)
          }
          return
        }

        // Try Final Report endpoint first for session documents
        let reportData = null
        try {
          const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}`), {
            headers: {
              ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
            },
          })
          if (res.ok) {
            reportData = await res.json()
          }
        } catch (e) {
          console.warn('Final report lookup error:', e)
        }

        let initialText = cachedDraft?.content || ''
        let initialTitle = cachedDraft?.title || session?.session_title || session?.title || 'Ministerial Report'

        if (!initialText) {
          if (reportData?.active_final_report?.report_text) {
            initialText = reportData.active_final_report.report_text
            initialTitle = reportData.active_final_report.report_title || initialTitle
          } else {
            try {
              const editRes = await fetch(getApiUrl(`/api/editing/sessions/${sessionId}/reports`), {
                headers: {
                  ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
                },
              })
              if (editRes.ok) {
                const editData = await editRes.json()
                if (editData?.active_edited_report?.report_text) {
                  initialText = editData.active_edited_report.report_text
                  initialTitle = editData.active_edited_report.report_title || initialTitle
                }
              }
            } catch (e) {
              console.warn('Editing report lookup error:', e)
            }
          }
        }

        // If still empty, fall back to verified_text or clean placeholder
        if (!initialText) {
          initialText = session?.verified_text || session?.raw_text || ''
        }

        if (isMounted) {
          setReportTitle(initialTitle)
          setReportText(initialText)
          setOriginalReportText(initialText)
          updateWordCount(initialText)
          updateHeadingsList(initialText)
          setSaveStatus('Saved')
          setLastSaved(new Date())
        }

        // Fetch verified transcript segments if available
        try {
          const sRes = await fetch(getApiUrl(`/api/sessions/${sessionId}`), {
            headers: {
              ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
            },
          })
          if (sRes.ok) {
            const sData = await sRes.json()
            const sObj = sData.session || sData
            if (sObj.audio_file || sObj.audio_path) {
              setAudioUrl(getApiUrl(`/api/audio/play/${sessionId}`))
            }
            if (sObj.transcript_segments && Array.isArray(sObj.transcript_segments)) {
              setTranscriptData(sObj.transcript_segments)
            } else if (sObj.verified_text) {
              // Parse paragraphs into pseudo-segments
              const paras = sObj.verified_text.split(/\n\n+/).filter(Boolean)
              const segs = paras.map((p, idx) => ({
                id: `seg_${idx}`,
                start_time: idx * 60,
                end_time: (idx + 1) * 60,
                text: p,
              }))
              setTranscriptData(segs)
            }
          }
        } catch (e) {
          console.warn('Transcript lookup error:', e)
        }
      } catch (err) {
        if (isMounted) setLoadError(err.message)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadDocument()
    return () => { isMounted = false }
  }, [sessionId, session, isManual])

  // Word count & Headings calculation
  const updateWordCount = (txt) => {
    const clean = (txt || '').replace(/[#*`_>]/g, ' ').trim()
    const count = clean ? clean.split(/\s+/).filter(Boolean).length : 0
    setWordCount(count)
  }

  const updateHeadingsList = (txt) => {
    const lines = (txt || '').split('\n')
    const headings = []
    lines.forEach((line, idx) => {
      const match = line.match(/^(#{1,3})\s+(.*)$/)
      if (match) {
        headings.push({
          level: match[1].length,
          title: match[2].trim(),
          lineIndex: idx,
        })
      }
    })
    setHeadingsList(headings)
  }

  // Handle Keyboard Shortcuts (Undo/Redo)
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        e.preventDefault()
        handleRedo()
      } else {
        e.preventDefault()
        handleUndo()
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      handleRedo()
    }
  }

  // Handle Content Change
  const handleContentChange = (newText) => {
    pushHistory(reportText)
    setReportText(newText)
    updateWordCount(newText)
    updateHeadingsList(newText)
    setSaveStatus('Editing…')

    // Always protect local draft immediately on every keystroke
    try {
      localStorage.setItem(
        `dlbc_draft_${sessionId}`,
        JSON.stringify({
          title: reportTitle,
          content: newText,
          updatedAt: Date.now(),
        })
      )
    } catch {}

    // Reset autosave timer (2 seconds debounce)
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      saveDocument(newText, reportTitle, true)
    }, 2000)
  }

  // Save Document to Backend or Local Workspace Store
  const saveDocument = async (textToSave = reportText, titleToSave = reportTitle, isAuto = false) => {
    setIsSaving(true)
    setSaveStatus('Saving…')

    // Always protect local draft cache
    try {
      localStorage.setItem(
        `dlbc_draft_${sessionId}`,
        JSON.stringify({
          title: titleToSave,
          content: textToSave,
          updatedAt: Date.now(),
        })
      )
    } catch {}

    // Standalone / Manual workspace document
    if (isManual || (typeof sessionId === 'string' && sessionId.startsWith('doc_'))) {
      if (onUpdateDocument) {
        onUpdateDocument({
          id: sessionId,
          title: titleToSave,
          content: textToSave,
          words: textToSave ? textToSave.trim().split(/\s+/).filter(Boolean).length : 0,
          updatedDate: 'Just now',
          updatedAt: Date.now(),
        })
      }
      setIsSaving(false)
      setSaveStatus('Saved')
      setLastSaved(new Date())
      return
    }

    try {
      // Save revision to Final Report endpoint
      const res = await fetch(getApiUrl(`/api/final-report/sessions/${sessionId}/revisions`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          report_text: textToSave,
          report_title: titleToSave,
          editor_name: editorName || 'Editor',
        }),
      })

      if (res.ok) {
        setSaveStatus('Saved')
        setLastSaved(new Date())
      } else {
        // Fallback to editing endpoint
        const editRes = await fetch(getApiUrl(`/api/editing/sessions/${sessionId}/edit`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            report_text: textToSave,
            report_title: titleToSave,
            editor_name: editorName || 'Editor',
          }),
        })
        if (editRes.ok) {
          setSaveStatus('Saved')
          setLastSaved(new Date())
        } else {
          setSaveStatus('error')
        }
      }
    } catch (e) {
      console.warn('Document save warning:', e)
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  // Export to DOCX
  const handleExportDocx = async () => {
    try {
      if (isManual || (typeof sessionId === 'string' && sessionId.startsWith('doc_'))) {
        const cleanTitle = (reportTitle || 'Untitled Document').replace(/[^a-zA-Z0-9_-]/g, '_')
        const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${reportTitle}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;padding:40px;max-width:800px;margin:auto;}h1{border-bottom:1px solid #ccc;padding-bottom:8px;}</style></head><body><h1>${reportTitle}</h1><div>${(reportText || '').replace(/\n\n/g, '<p></p>').replace(/\n/g, '<br/>')}</div></body></html>`
        const blob = new Blob([htmlDoc], { type: 'application/msword;charset=utf-8' })
        const filename = `${cleanTitle}.doc`
        await saveFileWithNativeDialog(blob, filename, [{ name: 'Word Document', extensions: ['doc', 'docx'] }])
        return
      }

      const url = getApiUrl(`/api/final-report/sessions/${sessionId}/download/docx`)
      const res = await fetch(url, {
        headers: {
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
      })
      if (!res.ok) {
        throw new Error('DOCX export failed')
      }
      const blob = await res.blob()
      const filename = `${reportTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`
      await saveFileWithNativeDialog(blob, filename, [{ name: 'Word Document', extensions: ['docx'] }])
    } catch (e) {
      alert('Export failed: ' + e.message)
    }
  }

  // Format Helper Injection
  const injectFormatting = (prefix, suffix = '') => {
    const textarea = editorRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = textarea.value
    const selected = current.substring(start, end)

    const before = current.substring(0, start)
    const after = current.substring(end)
    const replacement = `${prefix}${selected || 'text'}${suffix}`

    const nextVal = `${before}${replacement}${after}`
    handleContentChange(nextVal)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected.length || 4))
    }, 10)
  }

  // Insert Table
  const insertTable = (rows = 3, cols = 3) => {
    let tableMd = '\n\n| '
    for (let c = 1; c <= cols; c++) tableMd += `Header ${c} | `
    tableMd += '\n| '
    for (let c = 1; c <= cols; c++) tableMd += `--- | `
    tableMd += '\n'
    for (let r = 1; r < rows; r++) {
      tableMd += '| '
      for (let c = 1; c <= cols; c++) tableMd += `Item ${r},${c} | `
      tableMd += '\n'
    }
    tableMd += '\n'
    injectFormatting(tableMd, '')
  }

  // Insert Split Line
  const insertSplitLine = (ratio = '50/50') => {
    let splitMd = `\n\n::: split ${ratio}\n[Left Column: Scriptural Principles]\n---\n[Right Column: Practical Ministerial Applications]\n:::\n\n`
    injectFormatting(splitMd, '')
  }

  // Selection detection for Floating Context Menu & Source Panel Snippet
  const handleEditorSelect = (e) => {
    const textarea = editorRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = textarea.value.substring(start, end).trim()

    if (selected && selected.length >= 3) {
      // Find matching snippet in transcript
      const match = transcriptData.find((seg) =>
        seg.text && (seg.text.toLowerCase().includes(selected.toLowerCase()) ||
        selected.toLowerCase().includes(seg.text.toLowerCase().substring(0, 30)))
      )

      if (match) {
        setSelectedSnippet({
          text: match.text,
          startTime: match.start_time || 0,
          endTime: match.end_time || 60,
          formattedTime: `${formatSeconds(match.start_time || 0)} - ${formatSeconds(match.end_time || 60)}`,
        })
      } else {
        setSelectedSnippet({
          text: `"${selected}"`,
          startTime: 0,
          endTime: 0,
          formattedTime: 'Source reference note',
          isCustom: true,
        })
      }

      // Position floating menu
      const rect = textarea.getBoundingClientRect()
      setFloatingMenu({
        visible: true,
        x: Math.min(rect.right - 260, Math.max(rect.left + 20, e.clientX || rect.left + 80)),
        y: Math.max(80, (e.clientY || rect.top) - 50),
        selectedText: selected,
        start,
        end,
      })
    } else {
      setFloatingMenu((prev) => ({ ...prev, visible: false }))
      setAiMenuOpen(false)
    }
  }

  // Run Contextual AI Edit on Selection
  const handleAiAction = async (actionType, customText = '') => {
    if (!floatingMenu.selectedText) return
    setAiActionInProgress(true)
    setAiMenuOpen(false)

    try {
      const res = await fetch(getApiUrl('/api/editing/ai-assist'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          selected_text: floatingMenu.selectedText,
          action: actionType,
          custom_instruction: customText || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'AI edit request failed')
      }

      const data = await res.json()
      setAiDiffPreview({
        original: floatingMenu.selectedText,
        replacement: data.replacement_text,
        start: floatingMenu.start,
        end: floatingMenu.end,
      })
    } catch (e) {
      alert('AI Assist notice: ' + e.message)
    } finally {
      setAiActionInProgress(false)
    }
  }

  // Apply AI Diff Replacement
  const handleApplyAiDiff = () => {
    if (!aiDiffPreview) return
    const current = reportText
    const before = current.substring(0, aiDiffPreview.start)
    const after = current.substring(aiDiffPreview.end)
    const nextVal = `${before}${aiDiffPreview.replacement}${after}`
    handleContentChange(nextVal)
    setAiDiffPreview(null)
    setFloatingMenu((prev) => ({ ...prev, visible: false }))
  }

  // Audio Time Formatter
  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Audio Playback trigger
  const handlePlayFromTimestamp = (seconds = 0) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = seconds
      audioPlayerRef.current.play()
      setIsPlayingAudio(true)
    }
    setSourceTab('audio')
  }

  return (
    <div className="workspace-editor-root">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP BAR (Matches Desktop Panel 2 & Mobile Panel 2)         */}
      {/* ------------------------------------------------------------- */}
      <div className="workspace-top-bar">
        <div className="workspace-top-left">
          <button
            type="button"
            className="workspace-back-btn"
            onClick={onClose || onBack}
            aria-label="Back to Workspace"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="mobile-hidden">Workspace</span>
          </button>
          <div className="workspace-header-title-stack">
            <input
              type="text"
              className="workspace-title-input"
              value={reportTitle}
              onChange={(e) => {
                const nextTitle = e.target.value
                setReportTitle(nextTitle)
                setSaveStatus('Editing…')
                if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
                autosaveTimerRef.current = setTimeout(() => {
                  saveDocument(reportText, nextTitle, true)
                }, 2000)
              }}
              placeholder="Report Title..."
            />
            <div className="workspace-meta-sub">
              <span>{lastSaved ? lastSaved.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}</span>
              <span>·</span>
              <span className="workspace-word-count-badge">{wordCount.toLocaleString()} words</span>
              <span>·</span>
              <span className={`workspace-save-status ${saveStatus === 'Saved' ? 'status--saved' : saveStatus === 'error' ? 'status--error' : 'status--unsaved'}`}>
                {saveStatus === 'error' ? (
                  <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    Couldn’t sync changes ·{' '}
                    <button
                      type="button"
                      style={{
                        padding: 0,
                        color: '#2563eb',
                        textDecoration: 'underline',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                      onClick={() => saveDocument(reportText, reportTitle, false)}
                    >
                      Retry
                    </button>
                  </span>
                ) : (
                  saveStatus
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="workspace-top-right">
          <button
            type="button"
            className="btn btn--primary workspace-save-btn"
            onClick={() => saveDocument(reportText, reportTitle, false)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          {/* 3-dots Menu */}
          <div className="workspace-menu-dropdown-wrap">
            <button
              type="button"
              className="workspace-dots-btn"
              onClick={() => setMenuDropdownOpen(!menuDropdownOpen)}
              aria-label="More options"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menuDropdownOpen && (
              <div className="workspace-menu-popover">
                <button
                  type="button"
                  className="workspace-menu-item"
                  onClick={() => {
                    setMenuDropdownOpen(false)
                    handleExportDocx()
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export Word (.docx)
                </button>
                <button
                  type="button"
                  className="workspace-menu-item"
                  onClick={() => {
                    setMenuDropdownOpen(false)
                    navigator.clipboard.writeText(reportText)
                    alert('Report copied to clipboard!')
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy Text
                </button>
                <button
                  type="button"
                  className="workspace-menu-item"
                  onClick={() => {
                    setMenuDropdownOpen(false)
                    if (window.confirm('Reset report back to initial generated state?')) {
                      handleContentChange(originalReportText)
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Reset to Original
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. FORMATTING TOOLBAR                                         */}
      {/* ------------------------------------------------------------- */}
      <div className="workspace-toolbar">
        {/* Undo / Redo */}
        <button
          type="button"
          className="workspace-tool-btn"
          onClick={handleUndo}
          title="Undo (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          type="button"
          className="workspace-tool-btn"
          onClick={handleRedo}
          title="Redo (Ctrl+Y)"
        >
          ↷
        </button>
        <div className="workspace-toolbar-sep" />

        {/* Style Dropdown */}
        <select
          className="workspace-tool-select"
          onChange={(e) => {
            const val = e.target.value
            if (val === 'h1') injectFormatting('# ')
            else if (val === 'h2') injectFormatting('## ')
            else if (val === 'h3') injectFormatting('### ')
            else if (val === 'quote') injectFormatting('> ')
            e.target.value = 'normal'
          }}
          defaultValue="normal"
        >
          <option value="normal">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="quote">Quote</option>
        </select>

        {/* Font Family Dropdown */}
        <select
          className="workspace-tool-select mobile-hidden"
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
        >
          <option value="Inter">Inter</option>
          <option value="system-ui">System Sans</option>
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Courier New</option>
        </select>

        {/* Font Size Presets Dropdown */}
        <select
          className="workspace-tool-select"
          value={fontSize}
          onChange={(e) => {
            setFontSize(e.target.value)
            setCustomFontSize(e.target.value)
          }}
        >
          <option value="8">8</option>
          <option value="9">9</option>
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
          <option value="14">14</option>
          <option value="16">16</option>
          <option value="18">18</option>
          <option value="20">20</option>
          <option value="24">24</option>
          <option value="28">28</option>
          <option value="32">32</option>
          <option value="36">36</option>
          <option value="48">48</option>
          <option value="72">72</option>
        </select>

        {/* Custom Font Size Input (User requested custom input) */}
        <div className="workspace-custom-size-box mobile-hidden" title="Custom font size (pt)">
          <input
            type="number"
            min="6"
            max="120"
            className="workspace-size-input"
            value={customFontSize}
            onChange={(e) => {
              setCustomFontSize(e.target.value)
              setFontSize(e.target.value)
            }}
          />
          <span className="workspace-size-unit">pt</span>
        </div>

        <div className="workspace-toolbar-sep" />

        {/* Inline Formatting */}
        <button
          type="button"
          className="workspace-tool-btn"
          onClick={() => injectFormatting('**', '**')}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="workspace-tool-btn"
          onClick={() => injectFormatting('*', '*')}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="workspace-tool-btn"
          onClick={() => injectFormatting('<u>', '</u>')}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          className="workspace-tool-btn mobile-hidden"
          onClick={() => injectFormatting('~~', '~~')}
          title="Strikethrough"
        >
          <s>S</s>
        </button>

        <div className="workspace-toolbar-sep mobile-hidden" />

        {/* Lists & Indents */}
        <button
          type="button"
          className="workspace-tool-btn mobile-hidden"
          onClick={() => injectFormatting('- ')}
          title="Bulleted List"
        >
          • List
        </button>
        <button
          type="button"
          className="workspace-tool-btn mobile-hidden"
          onClick={() => injectFormatting('1. ')}
          title="Numbered List"
        >
          1. List
        </button>

        {/* Split Line Button (User requirement) */}
        <div className="workspace-dropdown-tool-wrap mobile-hidden">
          <button
            type="button"
            className="workspace-tool-btn workspace-split-btn"
            onClick={() => insertSplitLine('50/50')}
            title="Insert Split Line (50/50, 60/40, 40/60)"
          >
            Split Line
          </button>
        </div>

        {/* Basic Table Button (User requirement) */}
        <button
          type="button"
          className="workspace-tool-btn mobile-hidden"
          onClick={() => insertTable(3, 3)}
          title="Insert Table (3x3)"
        >
          Table
        </button>

        {/* Toggle Source Panel Button */}
        <button
          type="button"
          className={`workspace-tool-btn workspace-source-toggle-btn ${sourcePanelOpen ? 'btn-active' : ''}`}
          onClick={() => setSourcePanelOpen(!sourcePanelOpen)}
          title="Toggle Source Panel"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
          <span className="mobile-hidden">Source Panel</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. MAIN WORKSPACE BODY (Editor + Source Panel)                */}
      {/* ------------------------------------------------------------- */}
      <div className={`workspace-body-layout ${sourcePanelOpen ? 'has-source-panel' : 'no-source-panel'}`}>
        {/* Document Editor Column */}
        <div className="workspace-editor-col">
          <div className="workspace-paper-sheet">
            <textarea
              ref={editorRef}
              className="workspace-editor-textarea"
              style={{
                fontFamily: fontFamily === 'Inter' ? 'var(--font-sans)' : fontFamily,
                fontSize: `${fontSize}px`,
                lineHeight: lineSpacing,
              }}
              value={reportText}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onSelect={handleEditorSelect}
              onMouseUp={handleEditorSelect}
              onTouchEnd={handleEditorSelect}
              placeholder="Start drafting or reviewing report..."
            />
          </div>

          {/* Bottom Bar: Word Count & Outline Toggle */}
          <div className="workspace-bottom-status-bar">
            <div className="workspace-bottom-left">
              <span>{wordCount.toLocaleString()} words</span>
            </div>
            <div className="workspace-bottom-right">
              <label className="workspace-outline-toggle">
                <span>Show Outline</span>
                <input
                  type="checkbox"
                  checked={showOutline}
                  onChange={(e) => setShowOutline(e.target.checked)}
                />
              </label>
            </div>
          </div>

          {/* Headings Outline Drawer */}
          {showOutline && headingsList.length > 0 && (
            <div className="workspace-outline-drawer">
              <h4 className="workspace-outline-heading">Document Outline</h4>
              <ul className="workspace-outline-list">
                {headingsList.map((h, i) => (
                  <li
                    key={i}
                    className={`workspace-outline-item level-${h.level}`}
                    onClick={() => {
                      const lines = reportText.split('\n')
                      let charOffset = 0
                      for (let l = 0; l < h.lineIndex; l++) {
                        charOffset += lines[l].length + 1
                      }
                      if (editorRef.current) {
                        editorRef.current.focus()
                        editorRef.current.setSelectionRange(charOffset, charOffset + lines[h.lineIndex].length)
                      }
                    }}
                  >
                    {h.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------- */}
        {/* 4. SOURCE PANEL (Matches Desktop Panel 2 & Mobile Panel 3)  */}
        {/* ----------------------------------------------------------- */}
        {sourcePanelOpen && (
          <div className="workspace-source-panel">
            {/* Panel Tabs */}
            <div className="workspace-source-tabs">
              <button
                type="button"
                className={`source-tab-btn ${sourceTab === 'source' ? 'source-tab-btn--active' : ''}`}
                onClick={() => setSourceTab('source')}
              >
                Source
              </button>
              <button
                type="button"
                className={`source-tab-btn ${sourceTab === 'transcript' ? 'source-tab-btn--active' : ''}`}
                onClick={() => setSourceTab('transcript')}
              >
                Transcript
              </button>
              <button
                type="button"
                className={`source-tab-btn ${sourceTab === 'audio' ? 'source-tab-btn--active' : ''}`}
                onClick={() => setSourceTab('audio')}
              >
                Audio
              </button>
              <button
                type="button"
                className="source-panel-close-btn desktop-hidden"
                onClick={() => setSourcePanelOpen(false)}
                aria-label="Close Source Panel"
              >
                ✕
              </button>
            </div>

            <div className="workspace-source-content">
              {(isManual || (typeof sessionId === 'string' && sessionId.startsWith('doc_'))) ? (
                <div className="source-empty-state" style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', margin: '0 auto 16px', borderRadius: '50%', background: 'var(--bg-tertiary, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary, #64748b)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    No Session Source Attached
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    This is a standalone document. Session transcripts and audio are only available for documents created from recorded or imported sessions.
                  </p>
                </div>
              ) : (
                <>
                  {/* TAB 1: SOURCE IN TRANSCRIPT (Matches Panel 2) */}
                  {sourceTab === 'source' && (
                    <div className="source-view-stack">
                      <div className="source-card-box">
                        <h4 className="source-card-title">Source in transcript</h4>
                        <p className="source-quote-text">
                          {selectedSnippet?.text ||
                            (transcriptData.length > 0
                              ? transcriptData[0].text
                              : 'Select text in the editor to inspect corresponding source transcript references.')}
                        </p>
                        <button
                          type="button"
                          className="source-view-link-btn"
                          onClick={() => setSourceTab('transcript')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          View in transcript →
                        </button>
                      </div>

                      {/* Timestamp Play Card */}
                      <div className="source-timestamp-card">
                        <div className="source-timestamp-label">Timestamp</div>
                        <div className="source-timestamp-player-row">
                          <button
                            type="button"
                            className="source-play-circle-btn"
                            onClick={() => handlePlayFromTimestamp(selectedSnippet?.startTime || 0)}
                            title="Play audio from this point"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </button>
                          <span className="source-timestamp-text">
                            {selectedSnippet?.formattedTime ||
                              (transcriptData.length > 0 && transcriptData[0].start_time != null
                                ? formatSeconds(transcriptData[0].start_time)
                                : '00:00')}
                          </span>
                          <button
                            type="button"
                            className="source-external-link-btn"
                            onClick={() => setSourceTab('audio')}
                            title="Open full audio"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Related Transcript Context */}
                      <div className="source-related-card">
                        <h4 className="source-related-title">Related transcript</h4>
                        <p className="source-related-text">
                          {selectedSnippet?.text
                            ? 'Transcript context associated with selected passage.'
                            : (transcriptData.length > 0
                                ? transcriptData[0].text
                                : 'No related transcript context available for this section.')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: SEARCHABLE FULL TRANSCRIPT */}
                  {sourceTab === 'transcript' && (
                    <div className="source-transcript-stack">
                      <div className="source-search-wrap">
                        <input
                          type="text"
                          className="source-search-input"
                          placeholder="Search verified transcript..."
                          value={transcriptSearch}
                          onChange={(e) => setTranscriptSearch(e.target.value)}
                        />
                      </div>
                      <div className="source-segments-list">
                        {transcriptData
                          .filter((s) => !transcriptSearch || s.text.toLowerCase().includes(transcriptSearch.toLowerCase()))
                          .map((seg, idx) => (
                            <div
                              key={seg.id || idx}
                              className="source-segment-item"
                              onClick={() => handlePlayFromTimestamp(seg.start_time || 0)}
                            >
                              <span className="source-segment-time">
                                {formatSeconds(seg.start_time || 0)}
                              </span>
                              <p className="source-segment-text">{seg.text}</p>
                            </div>
                          ))}
                        {transcriptData.length === 0 && (
                          <p className="source-empty-note">
                            Verified transcript is loading or not available for this session.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: AUDIO PLAYER */}
                  {sourceTab === 'audio' && (
                    <div className="source-audio-stack">
                      <div className="source-audio-hero">
                        <div className="source-audio-icon-wrap">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                          </svg>
                        </div>
                        <h4>Session Audio Feed</h4>
                        <p>{reportTitle}</p>
                      </div>

                      <audio
                        ref={audioPlayerRef}
                        controls
                        className="source-audio-element"
                        src={audioUrl || getApiUrl(`/api/audio/play/${sessionId}`)}
                        onTimeUpdate={(e) => setAudioCurrentTime(e.target.currentTime)}
                        onLoadedMetadata={(e) => setAudioDuration(e.target.duration)}
                      >
                        Your browser does not support audio playback.
                      </audio>

                      <div className="source-audio-controls-card">
                        <div className="source-audio-skip-row">
                          <button
                            type="button"
                            className="btn btn--small btn--secondary"
                            onClick={() => {
                              if (audioPlayerRef.current) audioPlayerRef.current.currentTime -= 10
                            }}
                          >
                            -10s
                          </button>
                          <button
                            type="button"
                            className="btn btn--small btn--secondary"
                            onClick={() => {
                              if (audioPlayerRef.current) audioPlayerRef.current.currentTime += 10
                            }}
                          >
                            +10s
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. FLOATING SELECTION CONTEXT MENU (Copy | Source | AI Edit)   */}
      {/* ------------------------------------------------------------- */}
      {floatingMenu.visible && (
        <div
          className="workspace-floating-menu"
          style={{ top: floatingMenu.y, left: floatingMenu.x }}
        >
          <button
            type="button"
            className="floating-menu-btn"
            onClick={() => {
              navigator.clipboard.writeText(floatingMenu.selectedText)
              setFloatingMenu((prev) => ({ ...prev, visible: false }))
            }}
          >
            Copy
          </button>
          <button
            type="button"
            className="floating-menu-btn"
            onClick={() => {
              setSourcePanelOpen(true)
              setSourceTab('source')
            }}
          >
            Source
          </button>
          <div className="floating-ai-wrap">
            <button
              type="button"
              className="floating-menu-btn floating-ai-btn"
              onClick={() => setAiMenuOpen(!aiMenuOpen)}
            >
              AI Edit ▾
            </button>
            {aiMenuOpen && (
              <div className="floating-ai-dropdown">
                <button
                  type="button"
                  className="floating-dropdown-item"
                  onClick={() => handleAiAction('proofread')}
                >
                  Proofread selection
                </button>
                <button
                  type="button"
                  className="floating-dropdown-item"
                  onClick={() => handleAiAction('clarify')}
                >
                  Improve clarity
                </button>
                <button
                  type="button"
                  className="floating-dropdown-item"
                  onClick={() => handleAiAction('rephrase')}
                >
                  Rephrase
                </button>
                <button
                  type="button"
                  className="floating-dropdown-item"
                  onClick={() => handleAiAction('shorten')}
                >
                  Shorten
                </button>
                <button
                  type="button"
                  className="floating-dropdown-item"
                  onClick={() => handleAiAction('expand')}
                >
                  Expand
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. AI DIFF PREVIEW MODAL                                      */}
      {/* ------------------------------------------------------------- */}
      {aiDiffPreview && (
        <div className="modal-overlay" onClick={() => setAiDiffPreview(null)}>
          <div className="workspace-diff-modal" onClick={(e) => e.stopPropagation()}>
            <div className="media-modal-header">
              <h3 className="media-modal-title">AI Editorial Suggestion</h3>
              <button
                type="button"
                className="media-modal-close-btn"
                onClick={() => setAiDiffPreview(null)}
              >
                ✕
              </button>
            </div>
            <div className="workspace-diff-body">
              <div className="diff-box diff-original">
                <span className="diff-label">Original Selection:</span>
                <p>{aiDiffPreview.original}</p>
              </div>
              <div className="diff-box diff-replacement">
                <span className="diff-label">Proposed Edit:</span>
                <p>{aiDiffPreview.replacement}</p>
              </div>
            </div>
            <div className="media-modal-footer">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setAiDiffPreview(null)}
              >
                Discard
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleApplyAiDiff}
              >
                Apply Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
