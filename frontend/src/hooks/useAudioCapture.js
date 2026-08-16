import { useState, useEffect, useRef, useCallback } from 'react'

const WS_BASE_URL = 'ws://localhost:8000/api/audio/stream'

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

  // WebSocket & Timer Refs
  const wsRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const startTimeRef = useRef(0)

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

  // 2. Request microphone permission explicitly
  const requestPermission = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
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
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
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
        stopRecording()
        stopAudioTest()
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

    // Create or resume AudioContext
    let ctx = audioContextRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = ctx
    }

    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    // Set up fresh Source & Analyser Node for Live Metering
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect()
      } catch (e) {}
    }
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
    setError(null)
    try {
      await initAudioStream()
      setIsTesting(true)
      startMeteringLoop()
    } catch (err) {
      console.error('Audio test failed:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
        setError('Microphone permission was denied. Please allow microphone access in your browser settings.')
      } else {
        setError(`Failed to start audio test: ${err.message}`)
      }
      setIsTesting(false)
    }
  }, [initAudioStream, startMeteringLoop])

  // Stop Audio Test
  const stopAudioTest = useCallback(() => {
    if (!isRecording) {
      stopMeteringLoop()
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
      }
    }
    setIsTesting(false)
  }, [isRecording, stopMeteringLoop])

  // 6. Start Real Recording (Progressive PCM Streaming to FastAPI + Live Azure Transcription + Phase 4 Session)
  const startRecording = useCallback(async (sessionTitle = null) => {
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

      ws.onopen = () => {
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

        sourceNode.connect(workletNode)

        // Start elapsed timer
        startTimeRef.current = Date.now()
        setElapsedTime(0)
        setIsRecording(true)
        setIsTesting(false)

        timerIntervalRef.current = setInterval(() => {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }, 200)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Live Transcription Event Handlers
          if (data.type === 'live_transcription_status') {
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
        console.error('WebSocket streaming error:', err)
        setError('Streaming connection error with FastAPI backend.')
      }

      ws.onclose = () => {
        console.log('WebSocket stream closed.')
      }
    } catch (err) {
      console.error('Failed to start recording:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
        setError('Microphone permission was denied. Please allow microphone access in your browser settings.')
      } else {
        setError(`Failed to start recording: ${err.message}`)
      }
      setIsRecording(false)
      stopMeteringLoop()
    }
  }, [initAudioStream, startMeteringLoop, trackSettings])

  // 7. Stop Recording
  const stopRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    setIsRecording(false)

    // Stop worklet
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.postMessage({ command: 'stop' })
        workletNodeRef.current.disconnect()
      } catch (e) {
        console.error('Error stopping worklet:', e)
      }
      workletNodeRef.current = null
    }

    // Send stop message to WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }))
      setTimeout(() => {
        if (wsRef.current) {
          wsRef.current.close()
          wsRef.current = null
        }
      }, 1000)
    }

    // Stop live mic and metering if not in testing mode
    if (!isTesting) {
      stopMeteringLoop()
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
      }
    }
  }, [isTesting, stopMeteringLoop])

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
