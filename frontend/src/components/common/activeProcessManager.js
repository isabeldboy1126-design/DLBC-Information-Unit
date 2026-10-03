import { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl, authFetch } from '../../config'

const STORAGE_KEY = 'dlbc_active_process'
    
export function getActiveProcess() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    console.error('Failed to read active process from storage:', e)
    return null
  }
}

export function setActiveProcess(job) {
  if (!job || !job.sessionId) return
  try {
    const current = getActiveProcess()
    const isMinimized = typeof job.isMinimized === 'boolean'
      ? job.isMinimized
      : (current && current.sessionId === job.sessionId ? !!current.isMinimized : false)

    const currentDeviceUid = typeof localStorage !== 'undefined' ? localStorage.getItem('dlbc_device_uid') : null
    const payload = {
      jobType: job.jobType || current?.jobType || 'report_processing',
      sessionId: job.sessionId,
      sessionTitle: job.sessionTitle || current?.sessionTitle || 'Session',
      stageLabel: job.stageLabel || (job.jobType === 'verification' ? 'Verification in progress' : 'AI Processing'),
      isCompleted: !!job.isCompleted,
      isMinimized,
      runId: job.runId || current?.runId || null,
      uiHostDeviceId: job.uiHostDeviceId || current?.uiHostDeviceId || currentDeviceUid,
      totalItems: typeof job.totalItems === 'number' ? job.totalItems : current?.totalItems ?? 0,
      completedItems: typeof job.completedItems === 'number' ? job.completedItems : current?.completedItems ?? 0,
      updatedAt: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent('dlbc-process-update', { detail: payload }))
  } catch (e) {
    console.error('Failed to set active process:', e)
  }
}

export function minimizeActiveProcess() {
  const current = getActiveProcess()
  if (current) {
    setActiveProcess({ ...current, isMinimized: true })
  }
}

export function expandActiveProcess() {
  const current = getActiveProcess()
  if (current) {
    setActiveProcess({ ...current, isMinimized: false })
  }
}

export function clearActiveProcess() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('dlbc-process-clear'))
  } catch (e) {
    console.error('Failed to clear active process:', e)
  }
}

export function useActiveProcess() {
  const [activeProcess, setActiveProcessState] = useState(() => getActiveProcess())
  const timerRef = useRef(null)

  const syncFromStorage = useCallback(() => {
    setActiveProcessState(getActiveProcess())
  }, [])

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail) {
        setActiveProcessState(e.detail)
      } else {
        syncFromStorage()
      }
    }
    const handleClear = () => {
      setActiveProcessState(null)
    }

    window.addEventListener('dlbc-process-update', handleUpdate)
    window.addEventListener('dlbc-process-clear', handleClear)
    window.addEventListener('storage', syncFromStorage)

    return () => {
      window.removeEventListener('dlbc-process-update', handleUpdate)
      window.removeEventListener('dlbc-process-clear', handleClear)
      window.removeEventListener('storage', syncFromStorage)
    }
  }, [syncFromStorage])


  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (!activeProcess || activeProcess.isCompleted) {
      return
    }

    const pollJob = async () => {
      try {
        const { jobType, sessionId } = activeProcess
        if (!sessionId) return


        if (jobType === 'report_processing') {
          const res = await authFetch(getApiUrl('/api/report-processing/status/' + encodeURIComponent(sessionId)))
          if (res.ok) {
            const data = await res.json()
            if (data.status === 'completed') {
              const updated = {
                ...activeProcess,
                isCompleted: true,
                stageLabel: 'Report ready',
                runId: data.run_id || activeProcess.runId,
              }
              setActiveProcess(updated)
            } else if (data.status === 'failed' || data.status === 'cancelled') {
              clearActiveProcess()
            } else if (data.current_stage) {
              const stageLabels = {
                preparing_transcript: 'Preparing Transcript',
                ai_processing: 'AI Processing',
                preparing_report: 'Preparing Report',
                completed: 'Report ready',
              }
              const lbl = stageLabels[data.current_stage] || 'AI Processing'
              if (lbl !== activeProcess.stageLabel) {
                setActiveProcess({
                  ...activeProcess,
                  stageLabel: lbl,
                  runId: data.run_id || activeProcess.runId,
                })
              }
            }
          }
        } else if (jobType === 'verification') {
          const res = await fetch(getApiUrl('/api/sessions/' + encodeURIComponent(sessionId) + '/verification'))
          if (res.ok) {
            const data = await res.json()
            if (data.verification_status === 'completed' || data.status === 'completed') {
              const updated = {
                ...activeProcess,
                isCompleted: true,
                stageLabel: 'Verification complete',
              }
              setActiveProcess(updated)
            } else if (data.status === 'failed') {
              clearActiveProcess()
            }
          }
        }
      } catch (err) {
        // suppress
      }
    }

    timerRef.current = setInterval(pollJob, 2000)
    pollJob()

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [activeProcess])


  return {
    activeProcess,
    setActiveProcess,
    clearActiveProcess,
  }
}
