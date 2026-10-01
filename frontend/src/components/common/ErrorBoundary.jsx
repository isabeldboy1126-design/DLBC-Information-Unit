import { Icon } from './Icon'
import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    } else {
      window.location.hash = '#dashboard'
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card p-5 text-center my-4" style={{ maxWidth: '600px', margin: '40px auto' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}><Icon name="alert" /></div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
            Unable to display this view
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={this.handleReset}
            >
              Return to Dashboard
            </button>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
