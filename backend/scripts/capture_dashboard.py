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
            await shot('pre_stage6_dashboard_attention.png')

            # 2. Dashboard Collapsed
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.sidebar-toggle-btn')?.click() || document.querySelector('[aria-label=\"Collapse sidebar\"]')?.click()"
            })
            await asyncio.sleep(0.8)
            await shot('dashboard_collapsed_latest.png')

            # 2b. Hover over collapsed sidebar to test overlay
            await send_cmd('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 30, 'y': 200})
            await asyncio.sleep(0.5)
            await shot('pre_stage6_sidebar_hover_overlay.png')

            # Move mouse away to retract
            await send_cmd('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 600, 'y': 200})
            await asyncio.sleep(0.4)

            # Expand sidebar back
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.sidebar-toggle-btn')?.click() || document.querySelector('[aria-label=\"Expand sidebar\"]')?.click()"
            })
            await asyncio.sleep(0.5)

            # 3. Sessions History
            await send_cmd('Runtime.evaluate', {
                'expression': "Array.from(document.querySelectorAll('.sidebar-nav-item, .sidebar-nav-btn')).find(el => el.textContent.includes('Sessions'))?.click()"
            })
            await asyncio.sleep(1.2)
            await shot('sessions_history_cards.png')
            await shot('pre_stage6_sessions_history_blue_ctas.png')

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

            print("All captures completed successfully!")
    finally:
        proc.terminate()
        proc.wait()

asyncio.run(capture_all())
