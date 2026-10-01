import { fixture, browser, expect, assert, capture, reflow, prose, errors, calls, directory, initialSession } from './fixtures/editorial-fixture.mjs'
import { resolve } from 'node:path'
import { rename, writeFile, mkdir } from 'node:fs/promises'
const motionDirectory = resolve(directory, 'motion')
await mkdir(motionDirectory, { recursive: true })
const evidence = { motion: [], fonts: [], contrast: [] }
async function renderedContrast(page, theme) {
  const result = await page.evaluate(() => {
    const rgb = color => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    const luminance = values => values.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126,.7152,.0722][index], 0)
    return ['.desk-work-copy strong','.desk-work-copy > span','.desk-nav-link[aria-current="page"]','.desk-document-prose pre','#hero-card-live','#hero-link-upload'].map(selector => {
      const el = document.querySelector(selector); const style = getComputedStyle(el)
      let current = el; let background
      while (current) { const candidate = getComputedStyle(current).backgroundColor; if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') { background = candidate; break } current = current.parentElement }
      const foreground = style.color; const a = luminance(rgb(foreground)); const b = luminance(rgb(background))
      return { selector, foreground, background, ratio: Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)) }
    })
  })
  assert(result.every(sample => sample.ratio >= 4.5), JSON.stringify(result))
  evidence.contrast.push({ theme, samples: result })
}
try {
  const delayed = await fixture('session/review-fixture/report_processing')
  let releaseStart
  delayed.state.processing = 'not_started'
  delayed.state.startGate = new Promise(resolve => { releaseStart = resolve })
  await delayed.page.reload()
  await expect.poll(() => delayed.state.startBodies.length).toBeGreaterThan(0)
  await delayed.page.getByRole('button', { name: 'Minimize', exact: true }).click()
  releaseStart()
  await expect(delayed.page.getByRole('region', { name: 'Report Processing in progress' })).toBeVisible()
  await expect.poll(() => delayed.page.evaluate(() => JSON.parse(localStorage.getItem('dlbc_active_process'))?.runId)).toBe('retry-run')
  assert.equal(await delayed.page.evaluate(() => JSON.parse(localStorage.getItem('dlbc_active_process')).isMinimized), true)
  await delayed.context.close()
  console.log('PASS delayed accepted report startup stays tracked and minimized after dialog closes')
  for (const [stage, label] of [['editing', 'Close edited report revisions'], ['proofreading', 'Close proofread report revisions']]) {
    const named = await fixture(`session/review-fixture/${stage}`)
    await named.page.getByRole('button', { name: /Revisions/ }).click()
    await expect(named.page.getByRole('button', { name: label, exact: true })).toBeVisible()
    await named.page.getByRole('button', { name: label, exact: true }).click()
    await expect(named.page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
    await named.context.close()
  }
  console.log('PASS editor and proofreader revision close controls expose descriptive accessible names')
  const first = await fixture('session/review-fixture/final_report')
  first.state.revision = null
  first.state.acceptedSource = { revision_id:'accepted-1', revision_number:1, proofread_title:'Human-reviewed proofread title', proofread_text:prose, is_accepted:true, is_active:true }
  first.state.canFinalize = true
  await first.page.reload()
  await expect(first.page.locator('.archival-doc-main-title')).toHaveText('Human-reviewed proofread title')
  const approveSource = first.page.locator('#btn-finalize-accepted')
  const sourceReview = first.page.getByRole('checkbox',{name:'I have reviewed this accepted proofread revision and its final title.'})
  await expect(approveSource).toBeDisabled()
  await sourceReview.check();await approveSource.click()
  await expect(first.page.locator('#btn-download-final-docx-card')).toBeEnabled()
  assert.deepEqual(first.state.finalizations[0],{proofread_revision_id:'accepted-1'})
  assert.equal(first.state.revision.report_title,'Human-reviewed proofread title')
  const previous = {...first.state.revision}
  first.state.acceptedSource = {...first.state.acceptedSource,revision_id:'accepted-2',proofread_title:'New accepted source title',proofread_text:'Synthetic replacement source. '+prose}
  first.state.canFinalize = true
  await first.page.reload()
  await expect(approveSource).toHaveText('Replace and approve accepted report')
  await expect(first.page.getByRole('region',{name:'Accepted proofread source'})).toContainText('New accepted source title')
  first.state.finalizeFailure = true
  await sourceReview.check();await approveSource.click()
  await expect(first.page.getByRole('alert')).toContainText('Accepted source changed')
  await expect(approveSource).toHaveCount(0);await expect(first.page.locator('#btn-download-final-docx-card')).toBeDisabled()
  assert.deepEqual(first.state.revision,previous,'Mock conflict leaves prior report unchanged; backend atomicity is separately tested')
  first.state.finalizeFailure = false
  await first.page.getByRole('button',{name:'Reload report'}).click()
  await sourceReview.check();await approveSource.click()
  await expect(first.page.locator('.archival-doc-main-title')).toHaveText('New accepted source title')
  await expect(first.page.locator('#btn-download-final-docx-card')).toBeEnabled()
  first.state.acceptedSource = {...first.state.acceptedSource,revision_id:'accepted-3',proofread_title:'Third reviewed title'};first.state.canFinalize=true
  await first.page.reload();await first.page.getByLabel('Final title override (optional)').fill('Deliberate final title')
  await sourceReview.check();await approveSource.click()
  assert.equal(first.state.finalizations.at(-1).report_title,'Deliberate final title')
  await expect(first.page.locator('.archival-doc-main-title')).toHaveText('Deliberate final title')
  await first.page.setViewportSize({width:1170,height:635});await reflow(first.page);await capture(first.page,'replacement-review-owner-viewport')
  console.log('PASS first/replacement finalization, reviewed proofread title, explicit override, exact accepted revision, 409 renewed review/export gate')

  await first.page.getByRole('button',{name:'Source context',exact:true}).click()
  const audio = first.page.getByLabel('Original source audio')
  await expect.poll(()=>audio.evaluate(el=>el.readyState)).toBeGreaterThan(0)
  assert.equal(await audio.evaluate(el=>el.duration),75)
  await audio.evaluate(el=>el.play());await expect.poll(()=>audio.evaluate(el=>el.currentTime)).toBeGreaterThan(0)
  assert.equal(new URL(await audio.getAttribute('src')).pathname,'/api/transcription/media/fixture-recording')
  await audio.evaluate(el=>el.pause())
  first.state.session.recording_id=null;first.state.session.audio_filename='synthetic source #1.wav'
  await first.page.reload();await first.page.getByRole('button',{name:'Source context',exact:true}).click()
  await expect.poll(()=>audio.evaluate(el=>el.readyState)).toBeGreaterThan(0)
  assert.equal(new URL(await audio.getAttribute('src')).pathname,'/api/transcription/media/synthetic%20source%20%231.wav')
  await audio.evaluate(el=>el.play());await expect.poll(()=>audio.evaluate(el=>el.currentTime)).toBeGreaterThan(0);await audio.evaluate(el=>el.pause())
  first.state.mediaFailure=true;await first.page.reload();await first.page.getByRole('button',{name:'Source context',exact:true}).click();await expect(first.page.getByRole('alert')).toContainText('Original source audio is unavailable')
  first.state.mediaFailure=false;first.state.session.audio_filename=null
  await first.page.reload();await first.page.getByRole('button',{name:'Source context',exact:true}).click();await expect(first.page.getByText('Original source audio is not linked to this session.')).toBeVisible()
  console.log('PASS actual synthetic WAV playback through supported encoded recording/filename URL; missing and failed media states')

  const v=await fixture('session/review-fixture/verification')
  const source=v.page.locator('audio');await expect.poll(()=>source.evaluate(el=>el.readyState)).toBeGreaterThan(0)
  await v.page.getByRole('button',{name:'Replay',exact:true}).click()
  await expect.poll(()=>source.evaluate(el=>el.paused)).toBe(false)
  await source.evaluate(el=>{el.currentTime=9.8})
  await expect.poll(()=>source.evaluate(el=>el.paused),{timeout:3000}).toBe(true)
  await v.page.getByRole('button',{name:'Replay',exact:true}).click()
  const seek=v.page.getByRole('slider',{name:'Source playback position'})
  await seek.focus();await seek.press('End');for(let i=0;i<15;i++)await seek.press('ArrowLeft')
  await expect.poll(()=>source.evaluate(el=>el.currentTime)).toBeGreaterThanOrEqual(59.5)
  await v.page.waitForTimeout(500)
  assert.equal(await source.evaluate(el=>el.paused),false,'Master seek beyond 10 seconds must clear bounded replay')
  assert((await source.evaluate(el=>el.currentTime))>60)
  await source.evaluate(el=>el.pause());console.log('PASS real bounded replay pauses at 10s; keyboard master seek to 60s keeps playback running')

  const desk=await fixture()
  desk.state.sessions=[{...initialSession,title:'The practice of faithful service'},{...initialSession,session_id:'verified-session',title:'Living with purpose',final_report_status:'not_started',report_processing_status:'not_started',verified_text:'Verified synthetic source: meaning is preserved. '+prose,verification_status:'complete',duration_seconds:3720,date_created:'2026-09-29T09:00:00Z'},{...initialSession,session_id:'raw-session',title:'A steadfast heart',final_report_status:'not_started',report_processing_status:'not_started',verified_text:null,verification_status:'not_started',raw_text:'Raw synthetic source, awaiting verification.',duration_seconds:2340,date_created:'2026-09-28T09:00:00Z'}]
  await desk.page.reload();await expect(desk.page.locator('.desk-document-prose')).toContainText('14. Synthetic')
  await desk.page.evaluate(()=>document.fonts.ready)
  evidence.fonts=await desk.page.evaluate(()=>[...document.fonts].map(font=>({family:font.family,weight:font.weight,status:font.status})))
  assert(evidence.fonts.every(font=>font.status==='loaded'))
  await renderedContrast(desk.page,'light');await capture(desk.page,'desk-desktop')
  await desk.page.setViewportSize({width:1170,height:635});await reflow(desk.page);await capture(desk.page,'desk-owner-viewport')
  desk.state.previewDelay['verified-session']=350
  await desk.page.getByRole('button',{name:/Living with purpose/}).click();await desk.page.getByRole('button',{name:/A steadfast heart/}).click()
  await expect(desk.page.locator('.desk-preview-tools')).toContainText('Raw transcript · not verified')
  await desk.page.waitForTimeout(450);await expect(desk.page.locator('.desk-document-prose')).toContainText('Raw synthetic source')
  await desk.page.getByRole('button',{name:/Living with purpose/}).click();await expect(desk.page.locator('.desk-preview-tools')).toContainText('Verified transcript')
  await expect(desk.page.locator('.desk-document-prose')).toContainText('Verified synthetic source')
  await desk.page.getByRole('button',{name:/The practice of faithful service/}).click();await expect(desk.page.locator('.desk-document-prose')).toContainText('14. Synthetic')
  await desk.page.locator('#btn-sidebar-theme-toggle').click();await renderedContrast(desk.page,'dark');await capture(desk.page,'desk-dark-owner-viewport')
  await desk.page.setViewportSize({width:390,height:844});await reflow(desk.page);await capture(desk.page,'desk-mobile-list')
  await desk.page.getByRole('button',{name:/The practice of faithful service/}).click();await expect(desk.page.locator('.desk-document-preview')).toBeFocused();await reflow(desk.page);await capture(desk.page,'desk-mobile-document')
  await desk.page.setViewportSize({width:568,height:320});await reflow(desk.page);await capture(desk.page,'desk-short-window')
  await desk.page.setViewportSize({width:720,height:450});await reflow(desk.page);await capture(desk.page,'desk-logical-zoom')
  const fontsFallback=await fixture('dashboard');await fontsFallback.context.route('**/*.woff2',route=>route.abort('failed'));await fontsFallback.page.reload();await expect(fontsFallback.page.getByRole('button',{name:'Record live'})).toBeVisible();await expect(fontsFallback.page.locator('.desk-document-prose')).toContainText('14. Synthetic');await reflow(fontsFallback.page);await capture(fontsFallback.page,'desk-font-fallback')
  console.log('PASS artifact selection/stale response reversal, raw/verified/draft labels, local font loading/fallback, real rendered contrast, owner/mobile/short/reflow/dark layouts')

  const motion=await fixture('dashboard',{width:1440,height:900},'no-preference',{recordVideo:{dir:motionDirectory,size:{width:1440,height:900}}})
  motion.state.sessions=desk.state.sessions
  await motion.page.reload();await expect(motion.page.locator('.desk-document-prose')).toBeVisible()
  await motion.page.waitForTimeout(300)
  await motion.page.evaluate(() => {
    window.__deskMotionEvents = []
    for (const type of ['animationstart', 'animationend', 'transitionrun', 'transitionend']) {
      document.addEventListener(type, event => window.__deskMotionEvents.push({type, name:event.animationName || event.propertyName, target:event.target.className, elapsed:event.elapsedTime}), true)
    }
  })
  await motion.page.locator('#nav-link-sessions').click();await motion.page.waitForTimeout(60)
  const middle=await motion.page.locator('.desk-nav-baseline').evaluate(el=>getComputedStyle(el).transform)
  await motion.page.locator('#nav-link-dashboard').click();await motion.page.waitForTimeout(230)
  const settled=await motion.page.locator('.desk-nav-baseline').evaluate(el=>getComputedStyle(el).transform)
  evidence.motion.push({effect:'navigation baseline interruption',middle,settled});assert.notEqual(middle,settled)
  await motion.page.getByRole('button',{name:/Living with purpose/}).click();await motion.page.waitForTimeout(70)
  evidence.motion.push({effect:'selected preview',animations:await motion.page.locator('.desk-document-preview').evaluate(el=>el.getAnimations().map(a=>a.animationName))})
  await motion.page.waitForTimeout(300);await motion.page.getByRole('button',{name:/The practice of faithful service/}).click();await motion.page.waitForTimeout(250)
  await motion.page.getByRole('button',{name:'Review draft',exact:true}).click();await expect(motion.page.locator('.archival-body-text')).toBeVisible()
  await motion.page.getByRole('button',{name:'Source context',exact:true}).click();await motion.page.waitForTimeout(70)
  evidence.motion.push({effect:'source reveal',animations:await motion.page.locator('.source-disclosure').evaluate(el=>el.getAnimations().map(a=>a.transitionProperty))})
  await motion.page.waitForTimeout(300);await motion.page.getByRole('button',{name:'Hide source',exact:true}).click();await motion.page.getByRole('button',{name:'Source context',exact:true}).click();await motion.page.waitForTimeout(250)
  await motion.page.getByRole('button',{name:'Hide source',exact:true}).click();await motion.page.emulateMedia({reducedMotion:'reduce'});assert.equal(await motion.page.locator('.source-disclosure').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await expect(motion.page.locator('.source-disclosure section')).toHaveAttribute('inert','')
  await motion.page.emulateMedia({reducedMotion:'no-preference'})
  await motion.page.getByRole('button',{name:'Edit new revision'}).click();await motion.page.getByLabel('Report text',{exact:true}).fill('Synthetic edited source. '+prose)
  motion.state.saveFailure=true;await motion.page.getByRole('button',{name:'Save new draft revision'}).click();await expect(motion.page.getByRole('alert')).toContainText('Synthetic save unavailable');await motion.page.waitForTimeout(400)
  motion.state.saveFailure=false;motion.state.saveDelay=100
  await motion.page.getByRole('button',{name:'Save new draft revision'}).click();await expect(motion.page.getByRole('status')).toContainText('Revision saved')
  evidence.motion.push({effect:'response save feedback',animations:await motion.page.getByRole('status').evaluate(el=>el.getAnimations().map(a=>a.animationName))})
  await motion.page.waitForTimeout(400);await motion.page.emulateMedia({reducedMotion:'reduce'});await motion.page.getByRole('button',{name:'Source context',exact:true}).click();assert.equal(await motion.page.locator('.source-disclosure').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await motion.page.waitForTimeout(300)
  evidence.motionEvents = await motion.page.evaluate(() => window.__deskMotionEvents)
  const video=motion.page.video();await motion.context.close();await rename(await video.path(),resolve(motionDirectory,'editorial-desk-interactions.webm'))
  await writeFile(resolve(motionDirectory,'evidence.json'),JSON.stringify(evidence,null,2))
  assert(evidence.motionEvents.some(event=>event.type==='animationstart'&&event.name==='desk-preview-in'&&event.target.includes('desk-document-preview')), 'Preview animation must actually run')
  assert(evidence.motionEvents.some(event=>event.type==='transitionrun'&&event.name==='grid-template-rows'&&event.target.includes('source-disclosure')), 'Source height transition must actually run')
  assert(evidence.motionEvents.some(event=>event.type==='animationstart'&&event.name==='desk-save-feedback'), 'Response feedback animation must actually run')
  console.log('PASS recorded normal baseline/preview/source/save motion, failed-save feedback, reversal and mid-transition reduced-motion snap')
  assert(calls.some(call=>call.path.startsWith('/api/transcription/media/')))
  assert.deepEqual(errors,[])
  for(const context of browser.contexts())for(const page of context.pages())assert.equal(await page.evaluate(()=>window.__mic),0)
  console.log('PASS no uncaught errors, microphone/provider calls or real audio; video and rendered evidence saved')
} finally {await browser.close()}
