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
  const [downloadNotice, setDownloadNotice] = React.useState(null);

  const windowsDownloadUrl = 'https://github.com/isabeldboy1126-design/DLBC-Information-Unit/releases/latest/download/DLBC-Information-Unit-Setup-x64.exe';
  const androidDownloadUrl = 'https://github.com/isabeldboy1126-design/DLBC-Information-Unit/releases/latest/download/DLBC-Information-Unit-Android.apk';

  const handleWindowsDownload = () => {
    setDownloadNotice({
      platform: 'Windows',
      title: 'Windows Installer Download Started',
      detail: 'DLBC-Information-Unit-Setup-x64.exe (7.3 MB) is downloading. Check your browser downloads.',
    });
  };

  const handleAndroidDownload = () => {
    setDownloadNotice({
      platform: 'Android',
      title: 'Android APK Download Started',
      detail: 'DLBC-Information-Unit-Android.apk (14.3 MB) is downloading. Check your notification bar or downloads.',
    });
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
          margin: '0 0 24px 0',
          lineHeight: '1.5',
        }}>
          Reporting, transcription verification, and editorial workflow system. Download the client application for your device.
        </p>

        {/* Real-time Download Confirmation Notice */}
        {downloadNotice && (
          <div style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '10px',
            textAlign: 'left',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#4ade80',
              fontWeight: 600,
              fontSize: '14px',
              marginBottom: '4px',
            }}>
              <span>✓</span>
              <span>{downloadNotice.title}</span>
            </div>
            <p style={{
              margin: 0,
              fontSize: '12px',
              color: '#d1d5db',
              lineHeight: 1.4,
            }}>
              {downloadNotice.detail}
            </p>
          </div>
        )}

        {/* Side-by-side Download Buttons */}
        <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}>
          {/* Windows Button */}
          <a
            id="download-windows-btn"
            href={windowsDownloadUrl}
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
              textDecoration: 'none',
              boxSizing: 'border-box',
              transition: 'background-color 0.15s ease',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            <span style={{ fontSize: '18px' }}>🪟</span>
            Download for Windows
          </a>

          {/* Android Button */}
          <a
            id="download-android-btn"
            href={androidDownloadUrl}
            onClick={handleAndroidDownload}
            style={{
              flex: '1 1 200px',
              maxWidth: '240px',
              padding: '14px 20px',
              backgroundColor: '#1f2937',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              textDecoration: 'none',
              boxSizing: 'border-box',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#374151';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#1f2937';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            <span style={{ fontSize: '18px' }}>🤖</span>
            Download for Android
          </a>
        </div>

        {/* Android Guidance Box */}
        <div style={{
          marginBottom: '24px',
          padding: '12px 14px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#9ca3af',
          textAlign: 'left',
          lineHeight: '1.5',
        }}>
          <span style={{ color: '#e5e7eb', fontWeight: 600 }}>Android tip:</span> If prompted <em>"File might be harmful"</em>, tap <span style={{ color: '#60a5fa', fontWeight: 500 }}>Download anyway</span>. Once finished, tap the notification to install.
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
          <span>Version {APP_VERSION} · Windows & Android</span>
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
