import asyncio, json, urllib.request, subprocess, time, base64, os, websockets

SCREENSHOTS_DIR = os.path.abspath(r'C:\Users\Isabel\.gemini\antigravity\brain\247bee94-e881-475c-b2ef-808bc6d16e8b\screenshots')
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

async def capture_stage6():
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    user_data = r'C:\Users\Isabel\AppData\Local\Temp\chrome_stage6_caps'
    proc = subprocess.Popen([
        chrome_path,
        '--headless=new',
        '--remote-debugging-port=9235',
        f'--user-data-dir={user_data}',
        '--no-first-run',
        '--no-default-browser-check',
        'http://localhost:5173/#sessions'
    ])
    try:
        time.sleep(3)
        with urllib.request.urlopen('http://127.0.0.1:9235/json') as r:
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

            # 1. Sessions History
            await asyncio.sleep(1.5)

            # 2. Click first session card to open Session Workspace
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.refined-session-card, .session-history-card')?.click()"
            })
            await asyncio.sleep(1.2)

            # 3. Open Edit Details modal
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.btn-workspace-edit-details')?.click()"
            })
            await asyncio.sleep(0.8)

            # Select [ None / Standalone ] option
            await send_cmd('Runtime.evaluate', {
                'expression': """
                    const sel = document.getElementById('edit-event-select');
                    if (sel) {
                        sel.value = '__none__';
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                """
            })
            await asyncio.sleep(0.5)
            await shot('stage6_edit_modal_standalone.png')

            # Close modal
            await send_cmd('Runtime.evaluate', {
                'expression': "document.querySelector('.btn-close')?.click()"
            })
            await asyncio.sleep(0.5)

            # 4. Open Verification Workspace
            await send_cmd('Runtime.evaluate', {
                'expression': """
                    const btn = document.getElementById('btn-review-flagged') ||
                                document.querySelector('.btn-tile-action--primary') ||
                                Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Verification'));
                    btn?.click();
                """
            })
            await asyncio.sleep(1.2)
            await shot('stage6_verification_workspace_ai.png')

            # 5. Render Compiling Screen in DOM
            print("Capturing Compiling Screen...")
            await send_cmd('Runtime.evaluate', {
                'expression': """
                    const overlay = document.createElement('div');
                    overlay.id = 'test-compiling-overlay';
                    overlay.className = 'session-completion-overlay';
                    overlay.innerHTML = `
                      <div class="card session-completion-card">
                        <div class="completion-hero-header completion-hero-header--processing">
                          <div class="completion-check-circle">
                            <span class="processing-spinner"></span>
                          </div>
                          <h2 class="completion-title">Finalizing Transcript & Preparing Verification</h2>
                          <p class="completion-subtitle">
                            Recording is safely preserved. Indexing speech text and extracting bounded audio windows.
                          </p>
                        </div>
                        <div class="card-body completion-card-body">
                          <div class="completion-meta-grid">
                            <div class="completion-meta-item">
                              <span class="meta-item-label">SERVICE NAME</span>
                              <strong class="meta-item-val">Sunday Morning Worship Service</strong>
                            </div>
                            <div class="completion-meta-item">
                              <span class="meta-item-label">DURATION</span>
                              <strong class="meta-item-val">01:14:22</strong>
                            </div>
                            <div class="completion-meta-item">
                              <span class="meta-item-label">DATE</span>
                              <strong class="meta-item-val">Sunday, Sep 28, 2026</strong>
                            </div>
                          </div>
                          <div class="completion-storage-block">
                            <div class="storage-block-title">
                              <span class="storage-icon">💾</span>
                              <span>System Storage Status</span>
                            </div>
                            <div class="storage-status-row">
                              <div class="storage-status-item">
                                <span class="status-check-circle">✓</span>
                                <div><strong>Audio Saved</strong><span class="storage-sub">Primary + Backup Lossless WAV</span></div>
                              </div>
                              <div class="storage-status-item">
                                <span class="status-check-circle">✓</span>
                                <div><strong>Raw Transcript</strong><span class="storage-sub">Indexed & Synced to Database</span></div>
                              </div>
                              <span class="badge badge--success badge--storage-ready">SYSTEM READY</span>
                            </div>
                          </div>
                          <div class="completion-processing-box compiling-box">
                            <div class="processing-header">
                              <span class="processing-tag">STAGE 1: COMPILING</span>
                              <span class="processing-subtext">Preparing audio windows & KJV doctrinal context</span>
                            </div>
                            <div class="compiling-steps-row">
                              <div class="compiling-step-item compiling-step-item--done">
                                <span class="step-icon">✓</span>
                                <span class="step-label">Recording saved</span>
                              </div>
                              <div class="compiling-step-item compiling-step-item--active">
                                <span class="step-icon">●</span>
                                <span class="step-label">Finalizing transcript</span>
                              </div>
                              <div class="compiling-step-item">
                                <span class="step-icon">○</span>
                                <span class="step-label">Preparing verification</span>
                              </div>
                            </div>
                            <div class="compiling-bars-container">
                              <div class="compiling-bar compiling-bar--1"></div>
                              <div class="compiling-bar compiling-bar--2 compiling-bar--active"></div>
                            </div>
                          </div>
                          <div class="completion-bottom-actions">
                            <button type="button" class="btn btn--outline">⊞ Finish for Now</button>
                            <button type="button" class="btn btn--secondary">📋 View Session Details</button>
                          </div>
                        </div>
                      </div>
                    `;
                    document.body.appendChild(overlay);
                """
            })
            await asyncio.sleep(0.6)
            await shot('stage6_compiling_screen.png')

            # 6. Render Verifying Screen in DOM
            print("Capturing Verifying Screen...")
            await send_cmd('Runtime.evaluate', {
                'expression': """
                    const ov = document.getElementById('test-compiling-overlay');
                    if (ov) {
                        ov.innerHTML = `
                          <div class="card session-completion-card">
                            <div class="completion-hero-header completion-hero-header--processing">
                              <div class="completion-check-circle">
                                <span class="check-icon sparkle-pulse">✦</span>
                              </div>
                              <h2 class="completion-title">Autonomous AI Verification in Progress</h2>
                              <p class="completion-subtitle">
                                Evaluating audio slices, Azure speech transcript, and King James Bible doctrinal context.
                              </p>
                            </div>
                            <div class="card-body completion-card-body">
                              <div class="completion-meta-grid">
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">SERVICE NAME</span>
                                  <strong class="meta-item-val">Sunday Morning Worship Service</strong>
                                </div>
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">DURATION</span>
                                  <strong class="meta-item-val">01:14:22</strong>
                                </div>
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">DATE</span>
                                  <strong class="meta-item-val">Sunday, Sep 28, 2026</strong>
                                </div>
                              </div>
                              <div class="completion-processing-box verifying-box">
                                <div class="processing-header">
                                  <span class="processing-tag">STAGE 2: VERIFYING</span>
                                  <span class="processing-subtext">Comparing Azure Speech, Gemini Audio & KJV Context</span>
                                </div>
                                <div class="verifying-content-row">
                                  <div class="verifying-sparkle-indicator">
                                    <span class="sparkle-pulse">✦</span>
                                  </div>
                                  <div class="verifying-details">
                                    <strong class="verifying-title">Verifying 4 flagged segments with AI...</strong>
                                    <p class="verifying-desc">
                                      Cross-referencing acoustic phonetics against 66 King James Bible books and DLBC ministry vocabulary.
                                    </p>
                                  </div>
                                </div>
                                <div class="verifying-progress-track">
                                  <div class="verifying-progress-fill"></div>
                                </div>
                              </div>
                              <div class="completion-bottom-actions">
                                <button type="button" class="btn btn--outline">⊞ Finish for Now</button>
                                <button type="button" class="btn btn--secondary">📋 View Session Details</button>
                              </div>
                            </div>
                          </div>
                        `;
                    }
                """
            })
            await asyncio.sleep(0.6)
            await shot('stage6_verifying_screen.png')

            # 7. Render Result Screen: Needs Review
            print("Capturing Result Screen (Needs Review)...")
            await send_cmd('Runtime.evaluate', {
                'expression': """
                    const ov = document.getElementById('test-compiling-overlay');
                    if (ov) {
                        ov.innerHTML = `
                          <div class="card session-completion-card">
                            <div class="completion-hero-header">
                              <div class="completion-check-circle">
                                <span class="check-icon">✓</span>
                              </div>
                              <h2 class="completion-title">Session Captured — Review Required</h2>
                              <p class="completion-subtitle">
                                AI verification resolved known passages. 2 segments require reviewer confirmation.
                              </p>
                            </div>
                            <div class="card-body completion-card-body">
                              <div class="completion-meta-grid">
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">SERVICE NAME</span>
                                  <strong class="meta-item-val">Sunday Morning Worship Service</strong>
                                </div>
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">DURATION</span>
                                  <strong class="meta-item-val">01:14:22</strong>
                                </div>
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">DATE</span>
                                  <strong class="meta-item-val">Sunday, Sep 28, 2026</strong>
                                </div>
                              </div>
                              <div class="completion-verification-card verify-card--flags">
                                <div class="verify-card-left">
                                  <span class="verify-icon">📑</span>
                                  <div class="verify-text">
                                    <strong class="verify-heading">2 Segments Require Human Review</strong>
                                    <div class="completion-stats-chips">
                                      <span class="stat-chip stat-chip--verified">✓ 2 Verified by AI</span>
                                      <span class="stat-chip stat-chip--corrected">✎ 1 Corrected by AI</span>
                                      <span class="stat-chip stat-chip--pending">● 2 Pending Review</span>
                                    </div>
                                    <p class="verify-desc">
                                      Review and confirm preacher wording, names, and scriptures. AI suggestions are pre-filled for rapid one-click approval.
                                    </p>
                                  </div>
                                </div>
                                <button type="button" class="btn btn--primary btn--begin-verify">
                                  <span>Review 2 Items</span>
                                  <span>→</span>
                                </button>
                              </div>
                              <div class="completion-bottom-actions">
                                <button type="button" class="btn btn--outline">⊞ Finish for Now</button>
                                <button type="button" class="btn btn--secondary">📋 View Session Details</button>
                              </div>
                            </div>
                          </div>
                        `;
                    }
                """
            })
            await asyncio.sleep(0.6)
            await shot('stage6_result_needs_review.png')

            # 8. Render Result Screen: All Verified (Success / 0 to Review)
            print("Capturing Result Screen (All Verified)...")
            await send_cmd('Runtime.evaluate', {
                'expression': """
                    const ov = document.getElementById('test-compiling-overlay');
                    if (ov) {
                        ov.innerHTML = `
                          <div class="card session-completion-card">
                            <div class="completion-hero-header">
                              <div class="completion-check-circle">
                                <span class="check-icon">✓</span>
                              </div>
                              <h2 class="completion-title">Session Verified Successfully</h2>
                              <p class="completion-subtitle">
                                All segments verified against King James Scripture and DLBC church vocabulary. 0 items to review.
                              </p>
                            </div>
                            <div class="card-body completion-card-body">
                              <div class="completion-meta-grid">
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">SERVICE NAME</span>
                                  <strong class="meta-item-val">Sunday Morning Worship Service</strong>
                                </div>
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">DURATION</span>
                                  <strong class="meta-item-val">01:14:22</strong>
                                </div>
                                <div class="completion-meta-item">
                                  <span class="meta-item-label">DATE</span>
                                  <strong class="meta-item-val">Sunday, Sep 28, 2026</strong>
                                </div>
                              </div>
                              <div class="completion-verification-card verify-card--clean">
                                <div class="verify-card-left">
                                  <span class="verify-icon">✓</span>
                                  <div class="verify-text">
                                    <strong class="verify-heading">All Segments Verified (0 to Review)</strong>
                                    <p class="verify-desc">
                                      All transcript sections met high-confidence doctrinal matching. Ready to proceed directly to Information Unit Reporting.
                                    </p>
                                  </div>
                                </div>
                                <button type="button" class="btn btn--primary btn--begin-verify">
                                  <span>Go to Reporting</span>
                                  <span>→</span>
                                </button>
                              </div>
                              <div class="completion-bottom-actions">
                                <button type="button" class="btn btn--outline">⊞ Finish for Now</button>
                                <button type="button" class="btn btn--secondary">📋 View Session Details</button>
                              </div>
                            </div>
                          </div>
                        `;
                    }
                """
            })
            await asyncio.sleep(0.6)
            await shot('stage6_result_verified_success.png')

            # Clean up test overlay
            await send_cmd('Runtime.evaluate', {
                'expression': "document.getElementById('test-compiling-overlay')?.remove()"
            })
            await asyncio.sleep(0.3)

            print("Stage 6 captures completed successfully!")
    finally:
        proc.terminate()
        proc.wait()

asyncio.run(capture_stage6())
