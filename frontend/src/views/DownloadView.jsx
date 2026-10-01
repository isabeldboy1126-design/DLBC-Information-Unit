import React from 'react';
import { APP_VERSION } from '../utils/version';

/**
 * Public Download Landing Page
 *
 * Clean, restrained download surface matching DLBC neutral-dark theme:
 * - Desktop: Side-by-side buttons: [ Download for Windows ] [ Download for Android ]
 * - Windows button initiates download of current Windows installer (.exe)
 * - Android button has matching visual weight and clickable appearance, but is currently inert (performs no action, no disabled styling, no tooltip)
 * - Responsive: Stacks neatly on narrow mobile screens
 */
export function DownloadView({ onBackToApp }) {
  const windowsDownloadUrl = `https://github.com/isabeldboy1126-design/DLBC-Information-Unit/releases/latest/download/DLBC.Information.Unit_${APP_VERSION}_x64-setup.exe`;

  const handleWindowsDownload = () => {
    window.location.href = windowsDownloadUrl;
  };

  const handleAndroidClick = (e) => {
    e.preventDefault();
    // Intentionally inert as requested
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0c',
      color: '#f3f4f6',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: '#121215',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
      }}>
        {/* DLBC Logo */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
          <img
            src="/dlbc-logo.png"
            alt="DLBC Logo"
            style={{ width: '72px', height: '72px', objectFit: 'contain' }}
          />
        </div>

        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '0 0 8px 0',
          color: '#ffffff',
        }}>
          DLBC Information Unit
        </h1>

        <p style={{
          fontSize: '14px',
          color: '#9ca3af',
          margin: '0 0 32px 0',
          lineHeight: '1.5',
        }}>
          Reporting, transcription verification, and editorial workflow system. Download the client application for your device.
        </p>

        {/* Side-by-side Download Buttons */}
        <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '28px',
        }}>
          {/* Windows Button */}
          <button
            type="button"
            id="download-windows-btn"
            onClick={handleWindowsDownload}
            style={{
              flex: '1 1 200px',
              maxWidth: '240px',
              padding: '14px 20px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'background-color 0.15s ease',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            <span style={{ fontSize: '18px' }}>🪟</span>
            Download for Windows
          </button>

          {/* Android Button (Matching visual weight, clickable appearance, inert) */}
          <button
            type="button"
            id="download-android-btn"
            onClick={handleAndroidClick}
            style={{
              flex: '1 1 200px',
              maxWidth: '240px',
              padding: '14px 20px',
              backgroundColor: '#1f2937',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#374151';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#1f2937';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            <span style={{ fontSize: '18px' }}>🤖</span>
            Download for Android
          </button>
        </div>

        {/* Version metadata & Return button */}
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#6b7280',
        }}>
          <span>Version {APP_VERSION} · x64</span>
          {onBackToApp && (
            <button
              type="button"
              onClick={onBackToApp}
              style={{
                background: 'none',
                border: 'none',
                color: '#60a5fa',
                cursor: 'pointer',
                fontSize: '12px',
                padding: 0,
              }}
            >
              Open Web App →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
