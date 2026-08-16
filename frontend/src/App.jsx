import { useState, useEffect } from 'react'
import './App.css'

const API_BASE = 'http://localhost:8000'

function App() {
  const [backendStatus, setBackendStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    checkBackendHealth()
  }, [])

  async function checkBackendHealth() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/api/health`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      setBackendStatus(data)
    } catch (err) {
      setError(err.message)
      setBackendStatus(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="app">
      <header>
        <h1>DLBC Information Unit App</h1>
        <p className="subtitle">Phase 0 — System Health Check</p>
      </header>

      <main>
        <section id="health-check">
          <h2>Backend Connection</h2>

          {loading && (
            <p className="status status--loading">Checking backend connection...</p>
          )}

          {error && (
            <div className="status status--error">
              <p><strong>Connection failed:</strong> {error}</p>
              <p className="hint">
                Make sure the FastAPI backend is running on port 8000.
              </p>
              <button type="button" onClick={checkBackendHealth}>
                Retry
              </button>
            </div>
          )}

          {backendStatus && (
            <div className="status status--healthy">
              <p><strong>Status:</strong> {backendStatus.status}</p>
              <p><strong>Application:</strong> {backendStatus.application}</p>
              <p><strong>Version:</strong> {backendStatus.version}</p>
              <p><strong>Environment:</strong> {backendStatus.environment}</p>
            </div>
          )}
        </section>
      </main>

      <footer>
        <p>DLBC Information Unit App &middot; Phase 0 &middot; Project Foundation</p>
      </footer>
    </div>
  )
}

export default App
