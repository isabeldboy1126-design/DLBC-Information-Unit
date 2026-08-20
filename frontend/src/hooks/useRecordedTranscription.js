import { useState, useEffect, useRef, useCallback } from 'react'
import { getApiUrl } from '../config'

const API_BASE = getApiUrl('/api/transcription')

export function useRecordedTranscription() {
  const [fileType, setFileType] = useState('audio') // 'audio' | 'video'
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileMetadata, setFileMetadata] = useState(null)

  const [uploadStatus, setUploadStatus] = useState('idle') // 'idle' | 'uploading' | 'uploaded' | 'transcribing' | 'completed' | 'error'
  const [uploadMeta, setUploadMeta] = useState(null)

  const [jobStatus, setJobStatus] = useState(null)
  const [activeTranscript, setActiveTranscript] = useState(null)
  const [transcriptsList, setTranscriptsList] = useState([])
  const [configStatus, setConfigStatus] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState('azure_speech')

  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)

  const pollIntervalRef = useRef(null)
  const mediaElementRef = useRef(null)

  // Fetch providers config status
  const checkConfigStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/config-status`)
      if (res.ok) {
        const data = await res.json()
        setConfigStatus(data)
        if (data.active_provider) {
          setSelectedProvider(data.active_provider)
        }
      }
    } catch (e) {
      console.warn('Failed to fetch transcription config status:', e)
    }
  }, [])

  // Fetch saved raw transcripts list
  const fetchTranscriptsList = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/transcripts`)
      if (res.ok) {
        const data = await res.json()
        setTranscriptsList(data.transcripts || [])
      }
    } catch (e) {
      console.error('Failed to load transcripts list:', e)
    }
  }, [])

  useEffect(() => {
    checkConfigStatus()
    fetchTranscriptsList()
  }, [checkConfigStatus, fetchTranscriptsList])

  // Handle local file selection
  const handleFileSelect = (file) => {
    setError(null)
    setWarning(null)
    setSelectedFile(file)
    setUploadStatus('idle')
    setActiveTranscript(null)

    if (file) {
      const isVid = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4')
      if (isVid && fileType === 'audio') {
        setFileType('video')
      } else if (!isVid && fileType === 'video') {
        setFileType('audio')
      }

      setFileMetadata({
        name: file.name,
        size: file.size,
        type: file.type || (isVid ? 'video/mp4' : 'audio/mpeg'),
      })
    } else {
      setFileMetadata(null)
    }
  }

  // Upload and start transcription
  const startTranscriptionFlow = async () => {
    if (!selectedFile) {
      setError('Please select an audio or video file first.')
      return
    }

    setError(null)
    setWarning(null)
    setUploadStatus('uploading')

    try {
      // 1. Upload File
      const formData = new FormData()
      formData.append('file', selectedFile)

      const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}))
        throw new Error(errData.detail || `Upload failed with HTTP ${uploadRes.status}`)
      }

      const uploadData = await uploadRes.json()
      const upload = uploadData.upload
      setUploadMeta(upload)
      setUploadStatus('transcribing')

      // 2. Trigger Transcription Job with selected engine and en-NG language
      const queryParams = new URLSearchParams({
        language_code: 'en-NG',
        ...(selectedProvider ? { provider_id: selectedProvider } : {}),
      })
      const transcribeRes = await fetch(`${API_BASE}/transcribe/${upload.upload_id}?${queryParams}`, {
        method: 'POST',
      })

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to start transcription: ${transcribeRes.status}`)
      }

      const transcribeData = await transcribeRes.json()
      const initialJob = transcribeData.job
      setJobStatus(initialJob)

      // 3. Poll for completion
      pollJobProgress(initialJob.job_id, upload.upload_id)
    } catch (err) {
      console.error('Transcription error:', err)
      setError(err.message)
      setUploadStatus('error')
    }
  }

  // Poll Job Status
  const pollJobProgress = (jobId, uploadId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}`)
        if (!res.ok) throw new Error('Job status check failed')

        const data = await res.json()
        const job = data.job
        setJobStatus(job)

        if (job.status === 'completed') {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
          setUploadStatus('completed')

          // Load full transcript
          if (job.transcript_id) {
            loadTranscriptById(job.transcript_id)
          }
          fetchTranscriptsList()
        } else if (job.status === 'failed') {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
          setUploadStatus('error')
          setError(job.error || job.status_message || 'Transcription job failed.')
        }
      } catch (err) {
        console.error('Error polling transcription job:', err)
      }
    }, 1500)
  }

  // Load a saved transcript by ID
  const loadTranscriptById = async (transcriptId) => {
    try {
      const res = await fetch(`${API_BASE}/transcripts/${transcriptId}`)
      if (res.ok) {
        const data = await res.json()
        setActiveTranscript(data.transcript)
        setUploadStatus('completed')
      }
    } catch (err) {
      console.error('Failed to load transcript:', err)
      setError(`Failed to load transcript: ${err.message}`)
    }
  }

  // Jump audio/video player to specific timestamp in seconds
  const jumpToTime = (seconds) => {
    if (mediaElementRef.current) {
      mediaElementRef.current.currentTime = seconds
      mediaElementRef.current.play().catch(() => {})
    }
  }

  // Reset to upload new file
  const resetUpload = () => {
    setSelectedFile(null)
    setFileMetadata(null)
    setUploadStatus('idle')
    setJobStatus(null)
    setActiveTranscript(null)
    setError(null)
    setWarning(null)
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  return {
    fileType,
    setFileType,
    selectedFile,
    fileMetadata,
    handleFileSelect,
    uploadStatus,
    uploadMeta,
    jobStatus,
    activeTranscript,
    transcriptsList,
    configStatus,
    selectedProvider,
    setSelectedProvider,
    error,
    warning,
    clearError: () => setError(null),
    startTranscriptionFlow,
    loadTranscriptById,
    fetchTranscriptsList,
    jumpToTime,
    resetUpload,
    mediaElementRef,
  }
}
