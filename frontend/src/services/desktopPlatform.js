/**
 * Centralized Desktop Platform Service (Tauri V2)
 *
 * Provides a clean adapter layer between web and native Windows desktop behavior:
 * - Native Save As dialog for reports & exports
 * - Windows notification support
 * - External link opener (default system browser)
 * - Window close protection during active recording
 * - Automatic signed update check & deferred relaunch
 */
import { APP_VERSION } from '../utils/version';

export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

export function isDesktop() {
  return isTauri();
}

export function getPlatformInfo() {
  if (isTauri()) {
    return {
      type: 'desktop',
      label: 'Windows Desktop',
      version: APP_VERSION,
      isNative: true,
    };
  }
  return {
    type: 'web',
    label: 'Web Application',
    version: APP_VERSION,
    isNative: false,
  };
}

/**
 * Save file using native Windows dialog in Tauri, or browser anchor download on web.
 *
 * @param {Blob|Uint8Array|ArrayBuffer} data - Binary data to save
 * @param {string} defaultFilename - Suggested filename
 * @param {Array<{name: string, extensions: string[]}>} filters - File type filters
 * @returns {Promise<{success: boolean, cancelled?: boolean, path?: string, error?: string}>}
 */
export async function saveFileWithNativeDialog(data, defaultFilename, filters = [{ name: 'Word Document', extensions: ['docx'] }]) {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');

      const selectedPath = await save({
        defaultPath: defaultFilename,
        filters,
      });

      if (!selectedPath) {
        return { success: false, cancelled: true };
      }

      let bytes;
      if (data instanceof Blob) {
        const buffer = await data.arrayBuffer();
        bytes = new Uint8Array(buffer);
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else if (data instanceof Uint8Array) {
        bytes = data;
      } else {
        bytes = new TextEncoder().encode(String(data));
      }

      await writeFile(selectedPath, bytes);
      return { success: true, path: selectedPath };
    } catch (err) {
      console.warn('[DesktopPlatform] Native save failed, falling back to browser download:', err);
    }
  }

  // Web Browser Fallback (or Tauri fallback)
  try {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return { success: true };
  } catch (err) {
    console.error('[DesktopPlatform] File download error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Open external link in default Windows system browser, preventing WebView takeover.
 */
export async function openExternalLink(url) {
  if (!url) return;
  if (isTauri()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch (err) {
      console.warn('[DesktopPlatform] Opener plugin error:', err);
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Send restrained desktop notification for task completions.
 */
export async function sendDesktopNotification(title, body) {
  if (!isTauri()) return;
  try {
    const {
      isPermissionGranted,
      requestPermission,
      sendNotification,
    } = await import('@tauri-apps/plugin-notification');

    let permission = await isPermissionGranted();
    if (!permission) {
      const res = await requestPermission();
      permission = res === 'granted';
    }

    if (permission) {
      sendNotification({ title: title || 'DLBC Information Unit', body: body || '' });
    }
  } catch (err) {
    console.warn('[DesktopPlatform] Notification error:', err);
  }
}

let cachedUpdate = null;

/**
 * Updater API wrapper
 */
export async function checkForAppUpdates() {
  if (!isTauri()) {
    return { isDesktop: false, available: false };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update && update.available) {
      cachedUpdate = update;
      return {
        isDesktop: true,
        available: true,
        version: update.version,
        body: update.body || '',
        date: update.date || '',
        updateRef: update,
      };
    }
    cachedUpdate = null;
    return { isDesktop: true, available: false };
  } catch (err) {
    console.warn('[DesktopPlatform] Updater check failed:', err);
    return { isDesktop: true, available: false, error: err.message };
  }
}

export async function downloadAndInstallUpdate(updateRef, onProgress) {
  // Support flexible argument order: if first argument is a progress callback
  if (typeof updateRef === 'function') {
    onProgress = updateRef;
    updateRef = cachedUpdate;
  }

  // If updateRef is still missing or invalid, resolve from cache or re-check
  if (!updateRef || typeof updateRef.downloadAndInstall !== 'function') {
    if (cachedUpdate && typeof cachedUpdate.downloadAndInstall === 'function') {
      updateRef = cachedUpdate;
    } else {
      const checkRes = await checkForAppUpdates();
      if (checkRes && checkRes.available && checkRes.updateRef) {
        updateRef = checkRes.updateRef;
      }
    }
  }

  if (!updateRef || typeof updateRef.downloadAndInstall !== 'function') {
    throw new Error('No update is currently available to install');
  }

  let downloaded = 0;
  let contentLength = 0;
  await updateRef.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength || 0;
        if (onProgress) onProgress({ status: 'started', contentLength, total: contentLength });
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        if (onProgress) onProgress({ status: 'progress', downloaded, contentLength, total: contentLength });
        break;
      case 'Finished':
        if (onProgress) onProgress({ status: 'finished' });
        break;
    }
  });
}

let closeProtectionInstalled = false;
let isRecordingCallback = null;
let promptCloseCallback = null;

/**
 * Window close protection for active live recording.
 * Subscribes to Tauri window close-requested event once to avoid listener leaks.
 */
export function setupWindowCloseProtection(getIsRecordingActive, onPromptClose) {
  if (!isTauri()) return () => {};

  isRecordingCallback = getIsRecordingActive;
  promptCloseCallback = onPromptClose;

  if (!closeProtectionInstalled) {
    closeProtectionInstalled = true;
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();
        await appWindow.onCloseRequested(async (event) => {
          const recording = isRecordingCallback ? Boolean(isRecordingCallback()) : false;
          if (recording) {
            event.preventDefault();
            if (promptCloseCallback) {
              promptCloseCallback();
            }
          }
        });
      } catch (err) {
        console.warn('[DesktopPlatform] Close protection listener failed:', err);
        closeProtectionInstalled = false;
      }
    })();
  }

  return () => {
    // Keep the single listener alive; callbacks are updated via references
  };
}

/**
 * Relaunch the desktop application after update installation.
 */
export async function relaunchApplication() {
  if (isTauri()) {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
      return;
    } catch (err) {
      console.warn('[DesktopPlatform] Relaunch failed:', err);
    }
  }
  window.location.reload();
}

/**
 * Force exit the application window after safe finalization.
 * Prioritizes @tauri-apps/plugin-process exit(0), falling back to window destroy and window.close.
 */
export async function forceExitApplication() {
  if (isTauri()) {
    try {
      const { exit } = await import('@tauri-apps/plugin-process');
      await exit(0);
      return;
    } catch (err) {
      console.warn('[DesktopPlatform] Process exit failed, attempting window destroy:', err);
    }
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().destroy();
      return;
    } catch (err) {
      console.warn('[DesktopPlatform] Window destroy failed:', err);
    }
  }
  window.close();
}
