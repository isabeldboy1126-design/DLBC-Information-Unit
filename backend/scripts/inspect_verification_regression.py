import asyncio
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request
import websockets

sys.stdout.reconfigure(encoding='utf-8')

SCREENSHOTS_DIR = os.path.abspath(r'C:\Users\Isabel\.gemini\antigravity\brain\247bee94-e881-475c-b2ef-808bc6d16e8b\screenshots')
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

async def run():
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    user_data = r'C:\Users\Isabel\AppData\Local\Temp\chrome_verify_trace'
    proc = subprocess.Popen([
        chrome_path,
        '--headless=new',
        '--remote-debugging-port=9248',
        f'--user-data-dir={user_data}',
        '--no-first-run',
        '--no-default-browser-check',
        'http://localhost:5173/'
    ])
    try:
        time.sleep(3)
        with urllib.request.urlopen('http://127.0.0.1:9248/json') as r:
            tabs = json.loads(r.read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        
        async with websockets.connect(ws_url) as ws:
            mid = 1
            async def send_cmd(method, params=None):
                nonlocal mid
                mid += 1
                payload = {'id': mid, 'method': method}
                if params: payload['params'] = params
                await ws.send(json.dumps(payload))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get('id') == mid:
                        return resp.get('result', {})

            await send_cmd('Page.enable')
            await send_cmd('Network.enable')
            await send_cmd('Runtime.enable')

            # Navigate to Sessions
            print("Navigating to Sessions...")
            await send_cmd('Runtime.evaluate', {'expression': 'window.location.hash = "#sessions"'})
            await asyncio.sleep(2.0)

            # Click second session (Sunday Worship Service)
            print("Clicking Sunday Worship Service session...")
            await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const cards = Array.from(document.querySelectorAll('.refined-session-card, .session-history-card'));
                    const target = cards.find(c => c.textContent.includes('Sunday') || c.textContent.includes('072106')) || cards[0];
                    if (target) {
                        const btn = target.querySelector('.btn-refined-primary') || target;
                        btn.click();
                        return 'CLICKED_CARD';
                    }
                    return 'NO_CARD';
                })()"""
            })
            await asyncio.sleep(1.5)

            # Click step 3 (Verification) in LifecycleStepper
            print("Clicking Verification in LifecycleStepper...")
            await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const stepBtns = Array.from(document.querySelectorAll('.lifecycle-step-btn'));
                    const vBtn = stepBtns.find(b => b.textContent.includes('Verification') || b.textContent.includes('Verify'));
                    if (vBtn) {
                        vBtn.click();
                        return 'CLICKED_STEPPER_BTN';
                    }
                    if (stepBtns.length > 2) {
                        stepBtns[2].click();
                        return 'CLICKED_STEPPER_INDEX_2';
                    }
                    return 'NO_STEPPER_BTN';
                })()"""
            })
            await asyncio.sleep(2.0)

            # Capture console logs and setup fetch spy
            await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    window.__networkLogs = [];
                    window.__consoleLogs = [];
                    const origLog = console.log;
                    const origErr = console.error;
                    console.log = (...args) => { window.__consoleLogs.push({type: 'log', text: args.join(' ')}); origLog(...args); };
                    console.error = (...args) => { window.__consoleLogs.push({type: 'error', text: args.join(' ')}); origErr(...args); };
                    
                    const origFetch = window.fetch;
                    window.fetch = async (...args) => {
                        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
                        const method = (args[1] && args[1].method) || 'GET';
                        const body = args[1] && args[1].body;
                        const entry = { url, method, body, timestamp: Date.now() };
                        try {
                            const res = await origFetch(...args);
                            entry.status = res.status;
                            entry.statusText = res.statusText;
                            const clone = res.clone();
                            try { entry.responseText = await clone.text(); } catch(e) {}
                            window.__networkLogs.push(entry);
                            return res;
                        } catch(err) {
                            entry.error = err.message;
                            window.__networkLogs.push(entry);
                            throw err;
                        }
                    };
                })()"""
            })

            # Click 'Resolved' tab to show verified items
            print("Clicking 'Resolved' tab...")
            await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const resBtn = btns.find(b => b.textContent.includes('Resolved') || b.textContent.includes('All'));
                    if (resBtn) {
                        resBtn.click();
                        return 'CLICKED_RESOLVED_TAB';
                    }
                    return 'NO_RESOLVED_TAB';
                })()"""
            })
            await asyncio.sleep(1.5)

            # Scroll down and capture full page screenshot
            shot = await send_cmd('Page.captureScreenshot', {
                'format': 'png',
                'captureBeyondViewport': True
            })
            screenshot_path = os.path.join(SCREENSHOTS_DIR, 'session_verification_full_resolved_detail.png')
            with open(screenshot_path, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print("Saved screenshot to:", screenshot_path)

            # Check UI state in DOM
            dom_state = await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const statusBadge = document.querySelector('.verification-status-badge, .status-pill, .badge')?.textContent?.trim();
                    const aiNotice = document.querySelector('.ai-verify-notice-banner')?.textContent?.trim();
                    const heading = document.querySelector('h1, h2, h3')?.textContent?.trim();
                    const resolvedCount = document.querySelector('.verification-metric-resolved, .resolved-count')?.textContent?.trim();
                    const totalCount = document.querySelector('.verification-metric-total, .total-count')?.textContent?.trim();
                    return JSON.stringify({ statusBadge, aiNotice, heading, resolvedCount, totalCount });
                })()""",
                'returnByValue': True
            })
            print("DOM STATE:", dom_state.get('result', {}).get('value'))

            shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            screenshot_path = os.path.join(SCREENSHOTS_DIR, 'session_verification_completed_ui.png')
            with open(screenshot_path, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print("Saved screenshot to:", screenshot_path)
            print("Trace completed successfully.")

    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(run())
