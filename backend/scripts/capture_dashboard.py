import asyncio, json, urllib.request, subprocess, time, base64, os, websockets

SCREENSHOTS_DIR = os.path.abspath(r'C:\Users\Isabel\.gemini\antigravity\brain\247bee94-e881-475c-b2ef-808bc6d16e8b\screenshots')
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

async def capture_all():
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    user_data = r'C:\Users\Isabel\AppData\Local\Temp\chrome_final_caps_v2'
    proc = subprocess.Popen([
        chrome_path,
        '--headless=new',
        '--remote-debugging-port=9232',
        f'--user-data-dir={user_data}',
        '--no-first-run',
        '--no-default-browser-check',
        'http://localhost:5173/'
    ])
    try:
        time.sleep(3)
        with urllib.request.urlopen('http://127.0.0.1:9232/json') as r:
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
            await send_cmd('Emulation.setDeviceMetricsOverride', {
                'width': 1440,
                'height': 900,
                'deviceScaleFactor': 1,
                'mobile': False
            })

            async def shot(filename):
                res = await send_cmd('Page.captureScreenshot', {'format': 'png'})
                data = base64.b64decode(res['data'])
                p = os.path.join(SCREENSHOTS_DIR, filename)
                with open(p, 'wb') as f:
                    f.write(data)
                print(f"Captured: {filename} ({len(data)} bytes)")

            # 1. Dashboard Expanded
            await asyncio.sleep(1.0)
            await shot('dashboard_desktop_latest.png')
            await shot('sidebar_dock_icon_expanded.png')
            await shot('pre_stage6_dashboard_attention.png')

            # 2. Dashboard Collapsed
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.sidebar-desktop-collapse-btn')?.click() || document.querySelector('[aria-label=\"Collapse sidebar\"]')?.click()"
            })
            await asyncio.sleep(0.8)
            await shot('dashboard_collapsed_latest.png')
            await shot('sidebar_dock_icon_collapsed.png')

            # 2b. Hover over collapsed sidebar to test overlay
            await send_cmd('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 30, 'y': 200})
            await asyncio.sleep(0.5)
            await shot('pre_stage6_sidebar_hover_overlay.png')

            # Move mouse away to retract
            await send_cmd('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 600, 'y': 200})
            await asyncio.sleep(0.4)

            # 2c. Tablet Dashboard (1024x768)
            await send_cmd('Emulation.setDeviceMetricsOverride', {
                'width': 1024,
                'height': 768,
                'deviceScaleFactor': 1,
                'mobile': False
            })
            await asyncio.sleep(0.8)
            await shot('dashboard_tablet.png')

            # 2d. Mobile Dashboard (390x844)
            await send_cmd('Emulation.setDeviceMetricsOverride', {
                'width': 390,
                'height': 844,
                'deviceScaleFactor': 2,
                'mobile': True
            })
            await asyncio.sleep(0.8)
            await shot('dashboard_mobile.png')

            # Reset back to Desktop
            await send_cmd('Emulation.setDeviceMetricsOverride', {
                'width': 1440,
                'height': 900,
                'deviceScaleFactor': 1,
                'mobile': False
            })
            await asyncio.sleep(0.5)

            # 3. Sessions History
            # Ensure mouse is away from sidebar and cards so resting CTA style is captured
            await send_cmd('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 600, 'y': 100})
            await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const btn = document.querySelector('.sidebar-desktop-collapse-btn');
                    if (document.querySelector('.app-sidebar--collapsed') && btn) {
                        btn.click();
                    }
                    document.getElementById('nav-link-sessions')?.click() || (window.location.hash = '#sessions');
                })()"""
            })
            await asyncio.sleep(1.2)
            await shot('sessions_history_cards.png')
            await shot('sessions_history_latest.png')
            await shot('pre_stage6_sessions_history_blue_ctas.png')

            # 3b. Test hover on first session card action button
            eval_res = await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const btn = document.querySelector('.session-card-action-btn');
                    if (!btn) return null;
                    const r = btn.getBoundingClientRect();
                    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
                })()""",
                'returnByValue': True
            })
            coords = eval_res.get('result', {}).get('value')
            if coords:
                await send_cmd('Input.dispatchMouseEvent', {
                    'type': 'mouseMoved',
                    'x': coords['x'],
                    'y': coords['y']
                })
                await asyncio.sleep(0.5)
                await shot('sessions_history_hover.png')

            # 4. Open first session workspace by clicking card body
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.refined-session-card')?.click()"
            })
            await asyncio.sleep(1.2)
            await shot('session_workspace_latest.png')

            # 5. Open Edit Details modal
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.btn-workspace-edit-details')?.click()"
            })
            await asyncio.sleep(0.8)
            await shot('session_workspace_edit_modal.png')

            # Close edit modal
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.modal-close-btn, .btn-close, [aria-label=\"Close\"]')?.click()"
            })
            await asyncio.sleep(0.5)

            # 6. Navigate to Verification Workspace
            await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Verify'));
                    if (btn) btn.click();
                })()"""
            })
            await asyncio.sleep(1.2)
            await shot('stage6_verification_workspace_ai.png')

            # 7. Intercept fetch and click "Use AI to Verify"
            await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    window.__lastFetch = null;
                    const origFetch = window.fetch;
                    window.fetch = async (...args) => {
                        const [resource, config] = args;
                        const method = config?.method || 'GET';
                        const url = typeof resource === 'string' ? resource : resource?.url;
                        const postData = config?.body;
                        try {
                            const resp = await origFetch(...args);
                            const clone = resp.clone();
                            let text = '';
                            try { text = await clone.text(); } catch(e) {}
                            window.__lastFetch = { url, method, status: resp.status, statusText: resp.statusText, text, postData };
                            return resp;
                        } catch (err) {
                            window.__lastFetch = { url, method, error: err.message, postData };
                            throw err;
                        }
                    };
                })()"""
            })

            print("Clicking Use AI to Verify...")
            click_eval = await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const btn = document.querySelector('.btn-ai-verify-action');
                    if (!btn) return 'BUTTON_NOT_FOUND';
                    btn.click();
                    return 'CLICKED';
                })()""",
                'returnByValue': True
            })
            print("Click result:", click_eval.get('result', {}).get('value'))
            await asyncio.sleep(4.0)

            # Retrieve network fetch report
            fetch_report = await send_cmd('Runtime.evaluate', {
                'expression': "JSON.stringify(window.__lastFetch)",
                'returnByValue': True
            })
            print("FETCH REPORT:", fetch_report.get('result', {}).get('value'))

            # Check banner message
            banner_eval = await send_cmd('Runtime.evaluate', {
                'expression': """(() => {
                    const b = document.querySelector('.ai-verify-notice-banner');
                    return b ? b.textContent : 'NO_BANNER';
                })()""",
                'returnByValue': True
            })
            banner_val = str(banner_eval.get('result', {}).get('value', '')).encode('ascii', 'replace').decode('ascii')
            print("Banner after click:", banner_val)
            await shot('stage6_ai_verify_banner_result.png')

            print("All captures completed successfully!")
    finally:
        proc.terminate()
        proc.wait()

asyncio.run(capture_all())
