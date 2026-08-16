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
  const [error, setError] = useState(null)

  // Live Audio Metering
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

  // WebSocket Ref
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
          // Permissions API query for microphone not supported in some browsers
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
            updateDeviceList()
          }

          if (permStatus.addEventListener) {
            permStatus.addEventListener('change', handlePermChange)
          } else {
            permStatus.onchange = handlePermChange
          }
        } catch (e) {
          // Unsupported in this browser; fallback to standard getUserMedia handling
        }
      }
      await updateDeviceList()
    }

    setupPermissionListener()

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      const handleDeviceChange = () => {
        console.log('Audio devices changed (plugged/unplugged). Refreshing...')
        updateDeviceList()
      }
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
        if (permStatus) {
          if (permStatus.removeEventListener && handlePermChange) {
            permStatus.removeEventListener('change', handlePermChange)
          } else {
            permStatus.onchange = null
          }
        }
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

  // 3. Initialize Audio Stream & AudioContext
  const initAudioStream = useCallback(async () => {
    // Release existing stream if any
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
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
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
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

    // Set up Source & Analyser Node for Live Metering
    const sourceNode = ctx.createMediaStreamSource(stream)
    sourceNodeRef.current = sourceNode

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.8
    analyserNodeRef.current = analyser

    sourceNode.connect(analyser)

    return { ctx, stream, sourceNode, analyser, settings }
  }, [selectedDeviceId])

  // 4. Metering Loop
  const startMeteringLoop = useCallback(() => {
    const analyser = analyserNodeRef.current
    if (!analyser) return

    const dataArray = new Float32Array(analyser.fftSize)

    const updateMeter = () => {
      analyser.getFloatTimeDomainData(dataArray)

      // Calculate RMS (Root Mean Square)
      let sumSquares = 0
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sumSquares / dataArray.length)

      // Convert RMS to dBFS (-100dB to 0dB)
      const db = rms > 0 ? 20 * Math.log10(rms) : -100
      const clampedDb = Math.max(-100, Math.min(0, db))

      // Linear level percentage (0 to 100)
      const levelPercent = Math.min(100, Math.round(rms * 100 * 3.5)) // boost visibility for normal speech

      setAudioDb(Math.round(clampedDb))
      setAudioLevel(levelPercent)
      setHasAudioSignal(clampedDb > -50) // Signal detected threshold

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

  // 6. Start Real Recording (Progressive Streaming to FastAPI)
  const startRecording = useCallback(async () => {
    setError(null)
    setLatestRecording(null)
    setRecordingStats({ bytes: 0, chunks: 0 })

    try {
      // Initialize audio stream & context
      const { ctx, sourceNode, settings } = await initAudioStream()
      startMeteringLoop()

      // Load AudioWorklet module
      try {
        await ctx.audioWorklet.addModule('/pcm-recorder-processor.js')
      } catch (workletLoadErr) {
        // May already be added
        console.warn('AudioWorklet module notice:', workletLoadErr.message)
      }

      // Open WebSocket connection to FastAPI
      const ws = new WebSocket(WS_BASE_URL)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected. Initializing audio stream session...')
        const actualSampleRate = ctx.sampleRate || settings.sampleRate || 48000
        const label = settings.label || trackSettings?.label || 'Input Device'

        ws.send(
          JSON.stringify({
            type: 'init',
            sampleRate: actualSampleRate,
            channels: 1,
            deviceName: label,
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
          if (data.status === 'finalized' && data.recording) {
            console.log('Recording finalized on server:', data.recording)
            setLatestRecording(data.recording)
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
  }, [initAudioStream, startMeteringLoop, stopMeteringLoop, trackSettings])

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
      }, 500)
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
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    permissionState,
    requestPermission,
    updateDeviceList,
    trackSettings,
    isTesting,
    startAudioTest,
    stopAudioTest,
    isRecording,
    startRecording,
    stopRecording,
    elapsedTime,
    recordingStats,
    latestRecording,
    audioLevel,
    audioDb,
    hasAudioSignal,
    error,
    clearError: () => setError(null),
  }
}
