import { useState, useEffect, useRef, useCallback } from 'react'
import { getWsUrl } from '../config'

const WS_BASE_URL = getWsUrl('/api/audio/stream')

export function useAudioCapture() {
  // Device management
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [permissionState, setPermissionState] = useState('prompt') // 'prompt' | 'granted' | 'denied'
  const [trackSettings, setTrackSettings] = useState(null)

  // Status & Mode
  const [isTesting, setIsTesting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [recordingStats, setRecordingStats] = useState({ bytes: 0, chunks: 0 })
  const [latestRecording, setLatestRecording] = useState(null)
  const [latestTranscript, setLatestTranscript] = useState(null)
  const [latestSession, setLatestSession] = useState(null)
  const [error, setError] = useState(null)

  // Live Transcription State (Phase 3)
  const [liveTranscript, setLiveTranscript] = useState({
    status: 'idle', // 'idle' | 'initializing' | 'listening' | 'recognizing' | 'reconnecting' | 'unavailable' | 'completed'
    statusMessage: '',
    interimText: '',
    segments: [],
  })
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false)

  // Live Audio Metering (Phase 1 proven RMS calculations)
  const [audioLevel, setAudioLevel] = useState(0) // 0 to 100%
  const [audioDb, setAudioDb] = useState(-100) // dBFS
  const [hasAudioSignal, setHasAudioSignal] = useState(false)

  // Web Audio Refs
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const workletNodeRef = useRef(null)
  const animationFrameRef = useRef(null)
  const silentGainNodeRef = useRef(null)

  // WebSocket & Timer Refs
  const wsRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const startTimeRef = useRef(0)
  const isStartingRef = useRef(false)
  const isRecordingRef = useRef(false)
  const activeSessionIdRef = useRef(null)

  // 1. Enumerate available audio input devices
  const updateDeviceList = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error('Audio devices API is not supported in this browser.')
      }

      // Check current permission via Permissions API if available
      let currentQueryState = null
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: 'microphone' })
          currentQueryState = status.state
          setPermissionState(status.state)
        } catch (e) {
          // Ignore if permission query not supported
        }
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = allDevices.filter((d) => d.kind === 'audioinput')

      setDevices(audioInputs)

      // Auto-select first device if none selected
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId || 'default')
      }

      // Check if labels are present (indicates permission granted)
      const hasLabels = audioInputs.some((d) => d.label && d.label.length > 0)
      if (hasLabels) {
        setPermissionState('granted')
      } else if (!currentQueryState) {
        setPermissionState((prev) => (prev === 'denied' ? 'denied' : 'prompt'))
      }
    } catch (err) {
      console.error('Error enumerating devices:', err)
      setError(`Device enumeration error: ${err.message}`)
    }
  }, [selectedDeviceId])

  // Listen to physical device additions/removals and live browser permission changes
  useEffect(() => {
    let permStatus = null
    let handlePermChange = null

    const setupPermissionListener = async () => {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          permStatus = await navigator.permissions.query({ name: 'microphone' })
          setPermissionState(permStatus.state)

          handlePermChange = () => {
            console.log('Browser microphone permission changed to:', permStatus.state)
            setPermissionState(permStatus.state)
            if (permStatus.state !== 'granted') {
              setTrackSettings(null)
              if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((t) => t.stop())
                mediaStreamRef.current = null
              }
            }
          }

          permStatus.addEventListener('change', handlePermChange)
        } catch (e) {
          // Ignore if query not supported
        }
      }
    }

    setupPermissionListener()
    updateDeviceList()

    const handleDeviceChange = () => {
      console.log('Audio hardware change detected. Refreshing inputs...')
      updateDeviceList()
    }

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange)

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange)
      if (permStatus && handlePermChange) {
        permStatus.removeEventListener('change', handlePermChange)
      }
    }
  }, [updateDeviceList])

  // 2. Request user microphone permission
  const requestPermission = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Immediately stop temporary test stream
      stream.getTracks().forEach((track) => track.stop())
      setPermissionState('granted')
      await updateDeviceList()
      return true
    } catch (err) {
      console.error('Microphone permission request failed:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
        setError('Microphone permission was denied. Please allow microphone access in your browser settings.')
      } else if (err.name === 'NotFoundError') {
        setError('No audio input devices found on this system.')
      } else {
        setError(`Failed to access microphone: ${err.message}`)
      }
      return false
    }
  }, [updateDeviceList])

  // 3. Initialize Audio Stream & AudioContext (Phase 1 master audio capture pipeline)
  const initAudioStream = useCallback(async () => {
    // Release existing stream if any
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      } catch (e) {}
      mediaStreamRef.current = null
    }

    // Close any previous AudioContext to guarantee a 100% fresh, uncorrupted audio graph
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          await audioContextRef.current.close().catch(() => {})
        }
      } catch (e) {}
      audioContextRef.current = null
    }

    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }

    if (selectedDeviceId && selectedDeviceId !== 'default') {
      audioConstraints.deviceId = { exact: selectedDeviceId }
    }

    let stream = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      setPermissionState('granted')
    } catch (err) {
      console.error('Failed to get user media stream:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
        setError('Microphone permission was denied. Please allow microphone access in your browser settings.')
      } else {
        setError(`Failed to open audio stream: ${err.message}`)
      }
      throw err
    }
    mediaStreamRef.current = stream

    // Handle track disconnection
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        setError('Selected audio input device was disconnected.')
      }
    })

    // Inspect actual applied settings
    const track = stream.getAudioTracks()[0]
    const settings = track.getSettings ? track.getSettings() : {}
    setTrackSettings({
      label: track.label || 'Audio Input',
      sampleRate: settings.sampleRate || 48000,
      channelCount: settings.channelCount || 1,
      echoCancellation: settings.echoCancellation ?? false,
      autoGainControl: settings.autoGainControl ?? false,
      noiseSuppression: settings.noiseSuppression ?? false,
    })

    // Create fresh AudioContext
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    audioContextRef.current = ctx

    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    // Set up fresh Source & Analyser Node for Live Metering
    const sourceNode = ctx.createMediaStreamSource(stream)
    sourceNodeRef.current = sourceNode

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.8
    analyserNodeRef.current = analyser

    sourceNode.connect(analyser)

    return { ctx, stream, sourceNode, analyser, settings }
  }, [selectedDeviceId])

  // 4. Live Audio Level Metering Loop (Phase 1 proven RMS calculation)
  const startMeteringLoop = useCallback(() => {
    const analyser = analyserNodeRef.current
    if (!analyser) return

    const dataArray = new Float32Array(analyser.fftSize)

    const updateMeter = () => {
      if (!analyserNodeRef.current) return
      analyserNodeRef.current.getFloatTimeDomainData(dataArray)

      // Calculate RMS (Root Mean Square)
      let sumSquares = 0
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sumSquares / dataArray.length)

      // Convert RMS to dBFS (-100dB to 0dB)
      const db = rms > 0 ? 20 * Math.log10(rms) : -100
      const clampedDb = Math.max(-100, Math.min(0, db))

      // Linear level percentage (0 to 100%) boosted for clear visual feedback
      const levelPercent = Math.min(100, Math.round(rms * 100 * 3.5))

      setAudioDb(Math.round(clampedDb))
      setAudioLevel(levelPercent)
      setHasAudioSignal(clampedDb > -50) // Audio signal detection threshold

      animationFrameRef.current = requestAnimationFrame(updateMeter)
    }

    updateMeter()
  }, [])

  const stopMeteringLoop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    setAudioLevel(0)
    setAudioDb(-100)
    setHasAudioSignal(false)
  }, [])

  // 5. Start Audio Test
  const startAudioTest = useCallback(async () => {
    if (isRecording || isRecordingRef.current || isStartingRef.current) return
    setError(null)
    try {
      await initAudioStream()
      setIsTesting(true)
      startMeteringLoop()
    } catch (err) {
      if (isRecording || isRecordingRef.current || isStartingRef.current) return
      console.error('Audio test failed:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
        setError('Microphone permission was denied. Please allow microphone access in your browser settings.')
      } else {
        setError(`Failed to start audio test: ${err.message}`)
      }
      setIsTesting(false)
    }
  }, [initAudioStream, isRecording, startMeteringLoop])

  // Stop Audio Test and release microphone hardware
  const stopAudioTest = useCallback(() => {
    setIsTesting(false)
    // CRITICAL: Never touch or tear down active stream/context if a real recording is starting or active!
    if (isRecording || isRecordingRef.current || isStartingRef.current) {
      return
    }

    stopMeteringLoop()

    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect() } catch (e) {}
      sourceNodeRef.current = null
    }
    if (analyserNodeRef.current) {
      try { analyserNodeRef.current.disconnect() } catch (e) {}
      analyserNodeRef.current = null
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      } catch (e) {}
      mediaStreamRef.current = null
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {})
        }
      } catch (e) {}
      audioContextRef.current = null
    }
  }, [isRecording, stopMeteringLoop])

  // 6. Start Real Recording (Progressive PCM Streaming to FastAPI + Live Azure Transcription + Phase 4 Session)
  const startRecording = useCallback(async (sessionTitle = null, sessionMeta = null) => {
    if (isRecording || isRecordingRef.current || isStartingRef.current) return false
    isStartingRef.current = true
    isRecordingRef.current = true
    setIsTesting(false)
    setError(null)
    setLatestRecording(null)
    setLatestTranscript(null)
    setLatestSession(null)
    setRecordingStats({ bytes: 0, chunks: 0 })
    setLiveTranscript({
      status: 'initializing',
      statusMessage: 'Connecting to Azure Speech (en-NG)...',
      interimText: '',
      segments: [],
    })

    try {
      // 1. Initialize master audio stream & context
      const { ctx, sourceNode, settings } = await initAudioStream()
      startMeteringLoop()

      // 2. Load AudioWorklet module
      try {
        await ctx.audioWorklet.addModule('/pcm-recorder-processor.js')
      } catch (workletLoadErr) {
        console.warn('AudioWorklet notice:', workletLoadErr.message)
      }

      // 3. Open WebSocket connection to FastAPI
      const ws = new WebSocket(WS_BASE_URL)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      return new Promise((resolveStart) => {
        let hasResolved = false
        const startTimeout = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true
            isStartingRef.current = false
            isRecordingRef.current = false
            setIsRecording(false)
            setError('Recording initialization timed out. Please check backend connection.')
            if (mediaStreamRef.current) {
              try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()) } catch (e) {}
              mediaStreamRef.current = null
            }
            if (audioContextRef.current) {
              try { if (audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {}) } catch (e) {}
              audioContextRef.current = null
            }
            resolveStart(false)
          }
        }, 8000)

        ws.onopen = () => {
          if (hasResolved) return
          hasResolved = true
          clearTimeout(startTimeout)

          console.log('WebSocket connected. Initializing live audio capture session...')
          const actualSampleRate = ctx.sampleRate || settings.sampleRate || 48000
          const label = settings.label || trackSettings?.label || 'Input Device'

          ws.send(
            JSON.stringify({
              type: 'init',
              sampleRate: actualSampleRate,
              channels: 1,
              deviceName: label,
              sessionTitle: sessionTitle ? sessionTitle.trim() : undefined,
              metadata: sessionMeta || undefined,
            })
          )

          // Instantiate AudioWorkletNode
          const workletNode = new AudioWorkletNode(ctx, 'pcm-recorder-processor')
          workletNodeRef.current = workletNode

          workletNode.port.onmessage = (event) => {
            if (event.data && event.data.type === 'chunk') {
              const buffer = event.data.buffer
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(buffer)
                setRecordingStats((prev) => ({
                  bytes: prev.bytes + buffer.byteLength,
                  chunks: prev.chunks + 1,
                }))
              }
            }
          }

          // Connect source to worklet
          sourceNode.connect(workletNode)

          // Silent gain node to keep WebAudio render clock continuously running into destination
          const silentGain = ctx.createGain()
          silentGain.gain.value = 0
          silentGainNodeRef.current = silentGain
          workletNode.connect(silentGain)
          silentGain.connect(ctx.destination)

          // Start elapsed timer
          startTimeRef.current = Date.now()
          setElapsedTime(0)
          setIsRecording(true)
          setIsTesting(false)
          isStartingRef.current = false

          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
          }, 200)

          resolveStart(true)
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            if (data.status === 'ready') {
              if (data.sessionId) {
                activeSessionIdRef.current = data.sessionId
              }
            } else if (data.type === 'live_transcription_status') {
              setLiveTranscript((prev) => ({
                ...prev,
                status: data.status,
                statusMessage: data.message || '',
              }))
            } else if (data.type === 'live_transcript_interim') {
              setLiveTranscript((prev) => ({
                ...prev,
                interimText: data.text || '',
              }))
            } else if (data.type === 'live_transcript_segment') {
              setLiveTranscript((prev) => ({
                ...prev,
                interimText: '',
                segments: [...prev.segments, data.segment],
              }))
            } else if (data.type === 'live_transcript_segment_updated') {
              setLiveTranscript((prev) => {
                const updated = [...prev.segments]
                if (data.index >= 0 && data.index < updated.length) {
                  updated[data.index] = data.segment
                }
                return { ...prev, segments: updated }
              })
            } else if (data.status === 'finalized') {
              if (data.recording) {
                console.log('Recording finalized on server:', data.recording)
                setLatestRecording(data.recording)
              }
              if (data.transcript) {
                console.log('Transcript finalized on server:', data.transcript)
                setLatestTranscript(data.transcript)
                setLiveTranscript((prev) => ({
                  ...prev,
                  status: 'completed',
                  statusMessage: 'Live transcription finalized',
                  segments: data.transcript.segments || prev.segments,
                }))
              }
              if (data.session) {
                console.log('Session finalized on server:', data.session)
                setLatestSession(data.session)
              }
            } else if (data.status === 'error') {
              setError(`Backend stream error: ${data.message}`)
            }
          } catch (e) {
            console.error('Non-JSON WebSocket message received:', e)
          }
        }

        ws.onerror = (err) => {
          if (!hasResolved) {
            hasResolved = true
            clearTimeout(startTimeout)
            isStartingRef.current = false
            isRecordingRef.current = false
            setIsRecording(false)
            console.error('WebSocket streaming error:', err)
            setError('Streaming connection error with FastAPI backend.')
            if (mediaStreamRef.current) {
              try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()) } catch (e) {}
              mediaStreamRef.current = null
            }
            if (audioContextRef.current) {
              try { if (audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {}) } catch (e) {}
              audioContextRef.current = null
            }
            resolveStart(false)
          }
        }

        ws.onclose = () => {
          console.log('WebSocket stream closed.')
        }
      })
    } catch (err) {
      isStartingRef.current = false
      isRecordingRef.current = false
      console.error('Failed to start recording:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
        setError('Microphone permission was denied. Please allow microphone access in your browser settings.')
      } else {
        setError(`Failed to start recording: ${err.message}`)
      }
      setIsRecording(false)
      stopMeteringLoop()
      if (mediaStreamRef.current) {
        try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()) } catch (e) {}
        mediaStreamRef.current = null
      }
      if (audioContextRef.current) {
        try { if (audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {}) } catch (e) {}
        audioContextRef.current = null
      }
      return false
    }
  }, [initAudioStream, isRecording, startMeteringLoop, trackSettings])

  // 7. Stop Recording — Stops media tracks, disconnects audio graph, and resolves with finalized session
  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      isRecordingRef.current = false
      isStartingRef.current = false
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }

      setIsRecording(false)
      setIsTesting(false)
      stopMeteringLoop()

      // Stop & disconnect AudioWorklet node and silent sink
      if (workletNodeRef.current) {
        try {
          workletNodeRef.current.port.postMessage({ command: 'stop' })
          workletNodeRef.current.disconnect()
        } catch (e) {
          console.warn('Error disconnecting workletNode:', e)
        }
        workletNodeRef.current = null
      }

      if (silentGainNodeRef.current) {
        try {
          silentGainNodeRef.current.disconnect()
        } catch (e) {}
        silentGainNodeRef.current = null
      }

      // Disconnect audio source & analyser nodes
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect()
        } catch (e) {}
        sourceNodeRef.current = null
      }

      if (analyserNodeRef.current) {
        try {
          analyserNodeRef.current.disconnect()
        } catch (e) {}
        analyserNodeRef.current = null
      }

      // CRITICAL: Stop every track on the MediaStream to release the microphone hardware in the browser
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((track) => {
            track.stop()
          })
        } catch (e) {
          console.warn('Error stopping media tracks:', e)
        }
        mediaStreamRef.current = null
      }

      // Close Web Audio AudioContext so hardware device is fully released and next session gets a clean context
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {})
          }
        } catch (e) {}
        audioContextRef.current = null
      }

      // Send stop command over WebSocket and wait for finalized payload
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        let isResolved = false
        const finalizeTimeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true
            if (wsRef.current) {
              try { wsRef.current.close() } catch (e) {}
              wsRef.current = null
            }
            resolve(null)
          }
        }, 3000)

        const originalOnMessage = ws.onmessage
        ws.onmessage = (event) => {
          if (originalOnMessage) originalOnMessage(event)
          try {
            const data = JSON.parse(event.data)
            if (data.status === 'finalized') {
              clearTimeout(finalizeTimeout)
              if (!isResolved) {
                isResolved = true
                setTimeout(() => {
                  if (wsRef.current) {
                    try { wsRef.current.close() } catch (e) {}
                    wsRef.current = null
                  }
                }, 200)
                resolve(data.session || (activeSessionIdRef.current ? { session_id: activeSessionIdRef.current } : { session_id: data.recording?.session_id || data.transcript?.recording_id }))
              }
            }
          } catch (e) {}
        }

        try {
          ws.send(JSON.stringify({ type: 'stop' }))
        } catch (e) {
          clearTimeout(finalizeTimeout)
          resolve(null)
        }
      } else {
        resolve(null)
      }
    })
  }, [stopMeteringLoop])

  // 8. Toggle Manual Flag during live recording
  const toggleManualFlag = useCallback((segmentIndex) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'toggle_flag',
          segment_idx: segmentIndex,
        })
      )
    } else {
      // Local optimistic update
      setLiveTranscript((prev) => {
        const updated = [...prev.segments]
        if (segmentIndex >= 0 && segmentIndex < updated.length) {
          const seg = { ...updated[segmentIndex] }
          const flags = seg.flags || []
          const hasManual = flags.some((f) => f.flag_type === 'manual_flag')
          if (hasManual) {
            seg.flags = flags.filter((f) => f.flag_type !== 'manual_flag')
          } else {
            seg.flags = [
              ...flags,
              {
                flag_id: `flag_man_${Date.now()}`,
                flag_type: 'manual_flag',
                confidence: seg.confidence,
                reason: 'Flagged manually by operator',
                is_verified: false,
              },
            ]
          }
          updated[segmentIndex] = seg
        }
        return { ...prev, segments: updated }
      })
    }
  }, [])

  // 9. Clear latest recording
  const clearLatestRecording = useCallback(() => {
    setLatestRecording(null)
    setLatestTranscript(null)
    setLatestSession(null)
    setRecordingStats({ bytes: 0, chunks: 0 })
    setElapsedTime(0)
    setLiveTranscript({
      status: 'idle',
      statusMessage: '',
      interimText: '',
      segments: [],
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (wsRef.current) wsRef.current.close()
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
    }
  }, [])

  return {
    // Devices & Permissions
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    permissionState,
    requestPermission,
    updateDeviceList,
    trackSettings,

    // Status
    isTesting,
    startAudioTest,
    stopAudioTest,
    isRecording,
    startRecording,
    stopRecording,
    elapsedTime,
    recordingStats,
    latestRecording,
    latestTranscript,
    latestSession,
    clearLatestRecording,

    // Live Metering
    audioLevel,
    audioDb,
    hasAudioSignal,

    // Live Transcription (Phase 3)
    liveTranscript,
    isTranscriptExpanded,
    setIsTranscriptExpanded,
    toggleManualFlag,

    // Error
    error,
    clearError: () => setError(null),
  }
}

