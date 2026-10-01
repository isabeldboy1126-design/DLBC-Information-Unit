import { useState, useEffect, useRef, useCallback } from 'react'
import { authFetch } from '../config'

export function getOrCreateDeviceUid() {
  if (typeof window === 'undefined') return 'unknown_device'
  let uid = localStorage.getItem('dlbc_device_uid')
  if (!uid) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uid = crypto.randomUUID()
    } else {
      uid = 'dev_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36)
    }
    localStorage.setItem('dlbc_device_uid', uid)
  }
  return uid
}

export function getDefaultDeviceName() {
  if (typeof window === 'undefined') return 'Media Device'
  const custom = localStorage.getItem('dlbc_device_name')
  if (custom) return custom

  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) {
    if (/Pixel 8/i.test(ua)) return 'Pixel 8 Pro'
    if (/Pixel 10/i.test(ua)) return 'Pixel 10 Pro'
    if (/SM-|Samsung/i.test(ua)) return 'Samsung Galaxy'
    return 'Android Phone'
  }
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Macintosh/i.test(ua)) return 'MacBook'
  if (/Windows/i.test(ua)) return 'Media Laptop'
  return 'Web Device'
}

export function getDevicePlatform() {
  if (typeof window === 'undefined') return 'web'
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh/i.test(ua)) return 'macos'
  return 'web'
}

export function getDeviceType() {
  if (typeof window === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/Mobile|Android.*Mobile|iPhone/i.test(ua)) return 'mobile'
  if (/Tablet|iPad|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
  return 'desktop'
}

/**
 * useRemoteControl hook
 * Handles multi-device registration, heartbeats, active recording sync,
 * command queueing and execution, and synchronized workflow updates.
 */
export function useRemoteControl({
  isRecording = false,
  onRemoteStopRequested = null,
  isAuthenticated = false,
} = {}) {
  const [deviceUid] = useState(() => getOrCreateDeviceUid())
  const [deviceName, setDeviceNameState] = useState(() => getDefaultDeviceName())
  const [activeRecording, setActiveRecording] = useState(null)
  const [activeWorkflow, setActiveWorkflow] = useState(null)
  const [registeredDevices, setRegisteredDevices] = useState([])
  const [isRemoteStopPending, setIsRemoteStopPending] = useState(false)
  const [remoteStopMessage, setRemoteStopMessage] = useState('')
  const [error, setError] = useState(null)

  const isStoppingRef = useRef(false)
  const lastActiveCmdRef = useRef(null)

  // Update custom device name
  const updateDeviceName = useCallback((newName) => {
    if (!newName || !newName.trim()) return
    const trimmed = newName.trim()
    localStorage.setItem('dlbc_device_name', trimmed)
    setDeviceNameState(trimmed)
  }, [])

  // 1. Device Registration & Heartbeat
  const registerDevice = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const payload = {
        device_uid: deviceUid,
        display_name: deviceName,
        platform: getDevicePlatform(),
        device_type: getDeviceType(),
      }
      await authFetch('/api/remote/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (e) {
      // Non-fatal device registration failure
    }
  }, [deviceUid, deviceName, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    registerDevice()
    // Heartbeat: 20s when idle, 3s when recording
    const intervalMs = isRecording ? 3000 : 20000
    const timer = setInterval(registerDevice, intervalMs)
    return () => clearInterval(timer)
  }, [registerDevice, isRecording, isAuthenticated])

  // 2. Poll Remote Status
  const pollStatus = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await authFetch(`/api/remote/status?device_uid=${encodeURIComponent(deviceUid)}`)
      if (res.ok) {
        const data = await res.json()
        setActiveRecording(data.active_recording || null)
        setActiveWorkflow(data.active_workflow || null)
        setRegisteredDevices(data.devices || [])

        // If a remote stop was in progress and the recording ended or workflow started, clear pending stop
        if (isRemoteStopPending && (!data.active_recording || data.active_workflow)) {
          setIsRemoteStopPending(false)
          setRemoteStopMessage('')
        }
      }
    } catch (e) {
      // Non-fatal status poll failure
    }
  }, [deviceUid, isAuthenticated, isRemoteStopPending])

  useEffect(() => {
    if (!isAuthenticated) return
    pollStatus()
    // Poll every 2 seconds when observing or recording
    const intervalMs = (activeRecording || isRecording || isRemoteStopPending) ? 2000 : 5000
    const timer = setInterval(pollStatus, intervalMs)
    return () => clearInterval(timer)
  }, [pollStatus, isAuthenticated, activeRecording, isRecording, isRemoteStopPending])

  // 3. Recording Owner: Start & Heartbeat
  const startRecordingSync = useCallback(async ({ title, minister, eventType, sessionId }) => {
    try {
      await authFetch('/api/remote/recording/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_uid: deviceUid,
          session_id: sessionId || 'live-pending',
          session_title: title || 'Live Worship Service',
          minister: minister || '',
          event_type: eventType || 'Sunday Worship Service',
        }),
      })
      isStoppingRef.current = false
      pollStatus()
    } catch (e) {
      console.warn('Failed to sync recording start:', e)
    }
  }, [deviceUid, pollStatus])

  const stopRecordingSync = useCallback(async (finalSessionId) => {
    try {
      await authFetch('/api/remote/recording/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_uid: deviceUid,
          final_session_id: finalSessionId || null,
        }),
      })
      pollStatus()
    } catch (e) {
      console.warn('Failed to sync recording stop:', e)
    }
  }, [deviceUid, pollStatus])

  // 4. Recording Owner: Poll Pending Commands (STOP_RECORDING)
  useEffect(() => {
    if (!isRecording || !isAuthenticated) return

    const pollCommands = async () => {
      try {
        const res = await authFetch(`/api/remote/commands/pending?device_uid=${encodeURIComponent(deviceUid)}`)
        if (res.ok) {
          const commands = await res.json()
          for (const cmd of commands) {
            if (cmd.command_type === 'STOP_RECORDING') {
              // Acknowledge command immediately
              await authFetch(`/api/remote/commands/${cmd.id}/acknowledge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_uid: deviceUid }),
              })

              lastActiveCmdRef.current = cmd.id

              // Trigger local stop only once
              if (!isStoppingRef.current) {
                isStoppingRef.current = true
                if (typeof onRemoteStopRequested === 'function') {
                  const result = await onRemoteStopRequested()
                  const finalSessionId = result?.session_id || result?.session?.session_id || null
                  // Mark command complete
                  await authFetch(`/api/remote/commands/${cmd.id}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      device_uid: deviceUid,
                      result: { session_id: finalSessionId, status: 'stopped' },
                    }),
                  })
                }
              } else {
                // If already stopping, mark this duplicate complete
                await authFetch(`/api/remote/commands/${cmd.id}/complete`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    device_uid: deviceUid,
                    result: { status: 'already_stopping' },
                  }),
                })
              }
            }
          }
        }
      } catch (e) {
        // Non-fatal command poll failure
      }
    }

    const timer = setInterval(pollCommands, 1000)
    return () => clearInterval(timer)
  }, [isRecording, isAuthenticated, deviceUid, onRemoteStopRequested])

  // 5. Remote Device: Issue STOP_RECORDING Command
  const requestRemoteStop = useCallback(async () => {
    if (!activeRecording || !activeRecording.owner_device_id) return
    setIsRemoteStopPending(true)
    const ownerName = activeRecording.owner_device_name || 'Media Device'
    setRemoteStopMessage(`Stopping on ${ownerName}...`)

    try {
      const res = await authFetch('/api/remote/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_device_uid: activeRecording.owner_device_id,
          command_type: 'STOP_RECORDING',
          payload: { initiated_by: deviceName },
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.detail || 'Failed to issue remote stop command')
        setIsRemoteStopPending(false)
        setRemoteStopMessage('')
      }
    } catch (e) {
      setError('Network error while issuing stop command')
      setIsRemoteStopPending(false)
      setRemoteStopMessage('')
    }
  }, [activeRecording, deviceName])

  // 6. Workflow Synchronization (Designated UI host updates progress)
  const updateWorkflowSync = useCallback(async ({
    sessionId,
    workflowStage,
    status = 'in_progress',
    totalItems = 0,
    completedItems = 0,
    message = '',
  }) => {
    try {
      await authFetch('/api/remote/workflow/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_uid: deviceUid,
          session_id: sessionId,
          workflow_stage: workflowStage,
          status,
          total_items: totalItems,
          completed_items: completedItems,
          message,
        }),
      })
      pollStatus()
    } catch (e) {
      console.warn('Failed to update workflow sync:', e)
    }
  }, [deviceUid, pollStatus])

  // 7. Cross-Device Cancellation
  const cancelWorkflowSync = useCallback(async (sessionId, processType = 'verification') => {
    try {
      await authFetch('/api/remote/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_uid: deviceUid,
          session_id: sessionId,
          process_type: processType,
        }),
      })
      pollStatus()
    } catch (e) {
      console.warn('Failed to cancel workflow sync:', e)
    }
  }, [deviceUid, pollStatus])

  // Derived states
  const isOwnerOfRecording = Boolean(
    activeRecording && activeRecording.owner_device_id === deviceUid
  )
  const isRemoteRecordingActive = Boolean(
    activeRecording && activeRecording.owner_device_id !== deviceUid
  )
  const ownerDevice = registeredDevices.find(
    (d) => d.device_uid === activeRecording?.owner_device_id
  )

  return {
    deviceUid,
    deviceName,
    updateDeviceName,
    activeRecording,
    activeWorkflow,
    registeredDevices,
    isOwnerOfRecording,
    isRemoteRecordingActive,
    ownerDevice,
    isRemoteStopPending,
    remoteStopMessage,
    error,
    clearError: () => setError(null),
    startRecordingSync,
    stopRecordingSync,
    requestRemoteStop,
    updateWorkflowSync,
    cancelWorkflowSync,
    refreshStatus: pollStatus,
  }
}
