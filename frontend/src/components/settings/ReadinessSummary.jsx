import React, { useEffect, useState } from 'react'
import { getApiUrl } from '../../config'

export function ReadinessSummary() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(getApiUrl('/api/readiness'))
      if (!res.ok) throw new Error('Readiness unavailable')
      const next = await res.json()
      if (typeof next.backend_available !== 'boolean' || typeof next.database_available !== 'boolean' || typeof next.ai_provider?.configured !== 'boolean' || typeof next.kjv_context?.available !== 'boolean' || typeof next.kjv_context?.complete !== 'boolean') {
        throw new Error('Invalid readiness response')
      }
      setData(next)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <section className="readiness-summary" aria-label="Service readiness">
      <h3>Service readiness</h3>
      {loading ? <p role="status">Checking local services…</p> : error ? (
        <p role="alert">Readiness unknown. {error}. Configuration and domain context are unknown. <button className="btn btn--secondary" onClick={load}>Retry readiness</button></p>
      ) : (
        <>
          <dl>
            <div><dt>Backend / database</dt><dd>{data.backend_available && data.database_available ? 'Available' : 'Unavailable'}</dd></div>
            <div><dt>AI provider configuration</dt><dd>{data.ai_provider.configured ? 'Configured • live access unverified' : 'Not configured'}</dd></div>
            <div><dt>KJV domain context</dt><dd>{data.kjv_context.complete ? 'Complete local context' : data.kjv_context.available ? 'Partial • missing domain data' : 'Unavailable'}</dd></div>
          </dl>
          <p className="card-subtitle">Configuration does not establish microphone readiness or live provider success.</p>
          <button className="btn btn--secondary" onClick={load}>Refresh readiness</button>
        </>
      )}
    </section>
  )
}
