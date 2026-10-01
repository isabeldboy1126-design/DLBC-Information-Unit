import React, { useEffect, useState } from 'react'
import { getApiUrl } from '../../config'

function sourceMediaUrl(source) {
  const id = source?.recording_id || source?.audio_filename || source?.saved_filename || source?.upload_id
  return id ? getApiUrl(`/api/transcription/media/${encodeURIComponent(id)}`) : null
}

export function SourceAudio({ source }) {
  const url = sourceMediaUrl(source)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => { setUnavailable(false) }, [url])
  if (!url) return <p className="source-audio-state">Original source audio is not linked to this session.</p>
  return <div className="source-audio"><audio key={url} controls preload="metadata" src={url} aria-label="Original source audio" onError={() => setUnavailable(true)} />{unavailable && <p role="alert">Original source audio is unavailable. The transcript remains available for review.</p>}</div>
}
