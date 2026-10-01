import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '../../src/context/AuthContext'
import { AppShell } from '../../src/components/common/AppShell'
import { LiveRecordingView } from '../../src/components/recording/LiveRecordingView'

// Keep React and auth imports in one Vite module graph. No media devices are opened.
export function mountRecordingPreview({ prose, title }) {
  document.querySelector('#root').style.display = 'none'
  const host = document.createElement('div')
  document.body.append(host)
  createRoot(host).render(<AuthProvider><AppShell activeView="live_recording" screenTitle="Live recording" onNavigate={() => {}}>
    <LiveRecordingView sessionMetadata={{title,minister:'Synthetic speaker'}} elapsedTime={7215}
      audioLevel={35} hasAudioSignal liveTranscript={[{text:prose,start_time:5}]}
      onStopRecording={() => { window.__stop = true }} onMinimize={() => {}} onToggleManualFlag={() => {}} />
  </AppShell></AuthProvider>)
}
