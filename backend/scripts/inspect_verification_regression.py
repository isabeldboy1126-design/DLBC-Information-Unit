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
    user_data = r'C:\Users\Isabel\AppData\Local\Temp\chrome_verify_debug'
    proc = subprocess.Popen([
        chrome_path,
        '--headless=new',
        '--remote-debugging-port=9244',
        f'--user-data-dir={user_data}',
        '--no-first-run',
        '--no-default-browser-check',
        'http://localhost:5173/#verification_workspace'
    ])
    try:
        time.sleep(2)
        with urllib.request.urlopen('http://127.0.0.1:9244/json') as r:
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
                'width': 1024,
                'height': 768,
                'deviceScaleFactor': 1,
                'mobile': False
            })

            # Inspect function for verification
            inspect_js = """
            (() => {
                const grid = document.querySelector('.verification-workspace-grid');
                const left = document.querySelector('.verification-left-col');
                const right = document.querySelector('.verification-right-col');
                const audio = document.querySelector('.master-audio-card');
                const active = document.querySelector('.active-segment-card');
                const tabs = Array.from(document.querySelectorAll('.segmented-tab')).map(t => t.textContent.trim());
                const btns = Array.from(document.querySelectorAll('.verification-action-buttons-row button')).map(b => b.textContent.trim().replace(/\\s+/g, ' '));
                const items = document.querySelectorAll('.flagged-item-card');
                
                let gridStyle = grid ? window.getComputedStyle(grid).gridTemplateColumns : 'NO_GRID';
                let gridDisplay = grid ? window.getComputedStyle(grid).display : 'NO_GRID';
                let leftRect = left ? left.getBoundingClientRect() : null;
                let rightRect = right ? right.getBoundingClientRect() : null;
                
                return JSON.stringify({
                    url: window.location.href,
                    gridCols: gridStyle,
                    sideBySide: leftRect && rightRect ? (Math.abs(leftRect.top - rightRect.top) < 10) : false,
                    leftWidth: leftRect ? leftRect.width : null,
                    rightWidth: rightRect ? rightRect.width : null,
                    audioFound: !!audio,
                    activeFound: !!active,
                    tabs,
                    btns,
                    itemCount: items.length
                });
            })()
            """

            # Check at 0.2s (Initial mount)
            await asyncio.sleep(0.2)
            eval02 = await send_cmd('Runtime.evaluate', {'expression': inspect_js})
            print("At 0.2s @ 1024px:", eval02.get('result', {}).get('value'))
            shot02 = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(os.path.join(SCREENSHOTS_DIR, 'verify_02s_1024.png'), 'wb') as f:
                f.write(base64.b64decode(shot02['data']))

            # Check at 0.6s
            await asyncio.sleep(0.4)
            eval06 = await send_cmd('Runtime.evaluate', {'expression': inspect_js})
            print("At 0.6s @ 1024px:", eval06.get('result', {}).get('value'))
            shot06 = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(os.path.join(SCREENSHOTS_DIR, 'verify_06s_1024.png'), 'wb') as f:
                f.write(base64.b64decode(shot06['data']))

            # Check at 1.5s (Full data loaded)
            await asyncio.sleep(0.9)
            eval15 = await send_cmd('Runtime.evaluate', {'expression': inspect_js})
            print("At 1.5s @ 1024px:", eval15.get('result', {}).get('value'))
            shot15 = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(os.path.join(SCREENSHOTS_DIR, 'verify_15s_1024.png'), 'wb') as f:
                f.write(base64.b64decode(shot15['data']))

            # Check at 1440px
            await send_cmd('Emulation.setDeviceMetricsOverride', {
                'width': 1440,
                'height': 900,
                'deviceScaleFactor': 1,
                'mobile': False
            })
            await asyncio.sleep(0.5)
            shot1440 = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(os.path.join(SCREENSHOTS_DIR, 'verify_1440_fixed.png'), 'wb') as f:
                f.write(base64.b64decode(shot1440['data']))

            # Check Dashboard at 1024px
            await send_cmd('Emulation.setDeviceMetricsOverride', {
                'width': 1024,
                'height': 768,
                'deviceScaleFactor': 1,
                'mobile': False
            })
            await send_cmd('Page.navigate', {'url': 'http://localhost:5173/'})
            await asyncio.sleep(1.2)
            dash_js = """
            (() => {
                const badge = document.querySelector('.attention-counter-badge')?.textContent?.trim();
                const docBoxes = document.querySelectorAll('.attention-doc-box').length;
                const metaRows = document.querySelectorAll('.attention-meta-row').length;
                const liveCard = document.querySelector('.creation-card--live');
                const liveBoxShadow = liveCard ? window.getComputedStyle(liveCard).boxShadow : null;
                const progLabels = Array.from(document.querySelectorAll('.attention-programme-label')).map(el => el.textContent.trim());
                const titles = Array.from(document.querySelectorAll('.attention-session-title')).map(el => el.textContent.trim());
                return JSON.stringify({ badge, docBoxes, metaRows, liveBoxShadow, progLabels, titles });
            })()
            """
            eval_dash = await send_cmd('Runtime.evaluate', {'expression': dash_js})
            print("Dashboard @ 1024px:", eval_dash.get('result', {}).get('value'))
            shot_dash = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(os.path.join(SCREENSHOTS_DIR, 'dashboard_1024_fixed.png'), 'wb') as f:
                f.write(base64.b64decode(shot_dash['data']))

            # Check Session Workspace header at 1024px
            await send_cmd('Page.navigate', {'url': 'http://localhost:5173/#sessions'})
            await asyncio.sleep(1.0)
            await send_cmd('Runtime.evaluate', {'expression': '''(() => {
                const btns = document.querySelectorAll('.session-card-action-btn');
                if (btns.length > 2) {
                    btns[2].click();
                } else if (btns.length > 0) {
                    btns[0].click();
                }
            })()'''})
            await asyncio.sleep(1.2)
            sess_js = """
            (() => {
                const metaLine = document.querySelector('.session-workspace-meta-line');
                const metaItems = Array.from(metaLine ? metaLine.querySelectorAll('.session-meta-item') : []).map(el => el.textContent.trim());
                const clockSvg = metaLine ? metaLine.querySelector('svg circle') : null;
                const eyebrow = document.querySelector('.session-programme-eyebrow')?.textContent?.trim();
                const title = document.querySelector('.session-workspace-main-title')?.textContent?.trim();
                return JSON.stringify({ eyebrow, title, metaItems, hasClockDuration: !!clockSvg });
            })()
            """
            eval_sess = await send_cmd('Runtime.evaluate', {'expression': sess_js})
            print("Session Workspace @ 1024px:", eval_sess.get('result', {}).get('value'))
            shot_sess = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(os.path.join(SCREENSHOTS_DIR, 'session_workspace_1024_fixed.png'), 'wb') as f:
                f.write(base64.b64decode(shot_sess['data']))

            # Check Sessions History at 1024px
            await send_cmd('Page.navigate', {'url': 'http://localhost:5173/#sessions'})
            await asyncio.sleep(0.8)
            hist_js = """
            (() => {
                const prog = document.querySelector('.session-card-programme');
                const title = document.querySelector('.session-card-dominant-title');
                return JSON.stringify({
                    progText: prog?.textContent?.trim(),
                    progSize: prog ? window.getComputedStyle(prog).fontSize : null,
                    progWeight: prog ? window.getComputedStyle(prog).fontWeight : null,
                    progTransform: prog ? window.getComputedStyle(prog).textTransform : null,
                    titleText: title?.textContent?.trim(),
                    titleSize: title ? window.getComputedStyle(title).fontSize : null,
                    titleWeight: title ? window.getComputedStyle(title).fontWeight : null
                });
            })()
            """
            eval_hist = await send_cmd('Runtime.evaluate', {'expression': hist_js})
            print("Sessions History @ 1024px:", eval_hist.get('result', {}).get('value'))
            shot_hist = await send_cmd('Page.captureScreenshot', {'format': 'png'})
            with open(os.path.join(SCREENSHOTS_DIR, 'sessions_history_1024_fixed.png'), 'wb') as f:
                f.write(base64.b64decode(shot_hist['data']))

    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(run())
