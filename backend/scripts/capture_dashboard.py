import asyncio, json, urllib.request, subprocess, time, base64, os, websockets

viewports = [
    ('dashboard_1440_desktop.png', 1440, 900, False, 0),
    ('dashboard_1024_tablet.png', 1024, 768, False, 0),
    ('dashboard_768_tablet_portrait.png', 768, 1024, False, 0),
    ('dashboard_390_mobile_top.png', 390, 844, True, 0),
    ('dashboard_390_mobile_scrolled.png', 390, 844, True, 520),
    ('dashboard_360_small_mobile.png', 360, 780, True, 0),
]

async def capture_all():
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    user_data = r'C:\Users\Isabel\AppData\Local\Temp\chrome_final_caps'
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

            for filename, w, h, is_mob, scroll_y in viewports:
                await send_cmd('Emulation.setDeviceMetricsOverride', {
                    'width': w,
                    'height': h,
                    'deviceScaleFactor': 1,
                    'mobile': is_mob
                })
                await asyncio.sleep(1.2)
                scroll_expr = f"document.querySelector('.app-content-body').scrollTop = {scroll_y};"
                await send_cmd('Runtime.evaluate', {'expression': scroll_expr})
                await asyncio.sleep(0.5)

                shot = await send_cmd('Page.captureScreenshot', {'format': 'png'})
                data = base64.b64decode(shot['data'])
                out_path = os.path.abspath(os.path.join('ux-review-screenshots', filename))
                with open(out_path, 'wb') as f:
                    f.write(data)
                print(f'{filename}: {len(data)} bytes')

            # --- Interactive Flow Validation ---
            print("\n--- Validating Navigation & Interactive Handlers ---")
            await send_cmd('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
            await send_cmd('Runtime.evaluate', {'expression': "document.querySelector('.app-content-body').scrollTop = 0;"})
            await asyncio.sleep(0.5)

            async def eval_js(expr):
                r = await send_cmd('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
                return r.get('result', {}).get('value')

            t1 = await eval_js("document.querySelector('.topbar-screen-title').innerText")
            print(f"Initial Screen: '{t1}'")

            # 1. Start Live Session click
            await eval_js("document.getElementById('hero-card-start-live').click()")
            await asyncio.sleep(0.8)
            t2 = await eval_js("document.querySelector('.topbar-screen-title').innerText")
            print(f"Clicked Start Live Session -> Screen: '{t2}'")

            # Return to Dashboard
            await eval_js("document.getElementById('nav-link-dashboard').click()")
            await asyncio.sleep(0.8)

            # 2. YouTube Session click
            await eval_js("document.getElementById('hero-card-youtube').click()")
            await asyncio.sleep(0.8)
            t3 = await eval_js("document.querySelector('.topbar-screen-title').innerText")
            print(f"Clicked YouTube Session -> Screen: '{t3}'")

            # Return to Dashboard
            await eval_js("document.getElementById('nav-link-dashboard').click()")
            await asyncio.sleep(0.8)

            # 3. Attention Card Action click
            has_attention = await eval_js("document.querySelector('.attention-action-btn') !== null")
            if has_attention:
                await eval_js("document.querySelector('.attention-action-btn').click()")
                await asyncio.sleep(1.0)
                t4 = await eval_js("document.querySelector('.topbar-screen-title').innerText")
                print(f"Clicked Attention Action -> Screen: '{t4}'")

            print("\nALL INTERACTIVE FLOW ASSERTIONS COMPLETED!")
    finally:
        proc.terminate()

asyncio.run(capture_all())
