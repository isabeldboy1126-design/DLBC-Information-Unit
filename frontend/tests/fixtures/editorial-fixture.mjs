// Local UI contract checks. Every API request is intercepted; microphone/provider use is forbidden.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const base = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173/'
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname))
const directory = resolve(process.env.FRONTEND_TEST_SCREENSHOTS || 'ux-review-screenshots/frontend-journeys')
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = []
const calls = []
const prose = Array.from({length: 14}, (_, i) => `${i + 1}. Synthetic review passage: a faithful record preserves the speaker's meaning and distinguishes a source quotation from editorial explanation. Matthew 5:7 is checked against the verified transcript; no new claim or minister is invented. This fixture exercises long prose, revision review and source context without real church material.`).join('\n\n')
const title = 'Faithfulness in daily service: preserving meaning, compassion and a dependable record for the congregation'
const syntheticWav = Buffer.alloc(44 + 75 * 8000 * 2)
syntheticWav.write('RIFF',0);syntheticWav.writeUInt32LE(syntheticWav.length-8,4);syntheticWav.write('WAVEfmt ',8);syntheticWav.writeUInt32LE(16,16);syntheticWav.writeUInt16LE(1,20);syntheticWav.writeUInt16LE(1,22);syntheticWav.writeUInt32LE(8000,24);syntheticWav.writeUInt32LE(16000,28);syntheticWav.writeUInt16LE(2,32);syntheticWav.writeUInt16LE(16,34);syntheticWav.write('data',36);syntheticWav.writeUInt32LE(syntheticWav.length-44,40)
for(let i=0;i<75*8000;i++)syntheticWav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/8000)*100),44+i*2)
const initialSession = { session_id: 'review-fixture', title, session_title: title, programme: 'Synthetic Sunday Service', minister: 'Synthetic speaker', date_created: '2026-09-30T09:00:00Z', duration_seconds: 7215, audio_filename: 'synthetic.wav', recording_id: 'fixture-recording', transcript_id: 'fixture-transcript', status: 'stopped', verified_text: prose, raw_text: prose, verification_status: 'complete', final_report_status: 'needs_review', report_processing_status: 'completed', editing_status: 'draft_ready', proofreading_status: 'not_started', segment_count: 14, flag_count: 1, segments: [{text: prose, start_time: 5, end_time: 20}] }
async function fixture(view='dashboard', viewport={width:1440,height:900}, reducedMotion='no-preference', options={}) {
 const context = await browser.newContext({ viewport, reducedMotion, ...options })
 await context.addInitScript(() => {
  window.__mic = 0
  navigator.mediaDevices.getUserMedia = async () => { window.__mic++; throw new Error('Forbidden microphone request') }
  navigator.mediaDevices.getDisplayMedia = async () => { throw new Error('Forbidden capture request') }
 })
 const state = { session: {...initialSession}, revision: {id:'revision-1', revision_number:1, report_title:title, report_text:prose, approval_status:'draft', can_export:false}, approveFailure:false, archiveFailure:false, processing:'completed', startError:null, startBodies:[], approvals:[], readiness:'partial', reportUnavailable:false, sessions:null, previewDelay:{}, acceptedSource:null, canFinalize:false, finalizeFailure:false, finalizations:[], mediaFailure:false, saveFailure:false, saveDelay:0 }
 const reportData = () => ({ session_id:'review-fixture', final_report_status: state.session.final_report_status, review_status: state.revision?.approval_status === 'approved' ? 'approved' : 'needs_review', source_proofread_report:state.acceptedSource, can_finalize:state.canFinalize, can_approve: !!state.revision && !state.session.is_archived, can_export: state.revision?.can_export, active_final_report: state.revision ? {...state.revision} : null, revisions: [{...state.revision}, {id:'revision-old', revision_number:0, approval_status:'draft', report_title:title, report_text:prose}] })
 await context.route('**/*', async route => {
  const req = route.request(); const url = new URL(req.url())
  if (url.origin === new URL(base).origin) return route.continue()
  if (!['localhost','127.0.0.1'].includes(url.hostname) || url.port !== '8000') return route.abort('blockedbyclient')
  calls.push({path:url.pathname, method:req.method()})
  const json = (data, status=200) => route.fulfill({status, contentType:'application/json', body:JSON.stringify(data)})
  const p=url.pathname
  if (p === '/api/sessions') return json({sessions:state.sessions || [{...state.session}]})
  if(p.startsWith('/api/sessions/') && p.split('/').length===4 && req.method()==='GET'){const id=decodeURIComponent(p.split('/').at(-1));const session=state.sessions?.find(s=>s.session_id===id)||state.session;if(state.previewDelay[id])await new Promise(resolve=>setTimeout(resolve,state.previewDelay[id]));return json({session:{...session}})}
  if (p.endsWith('/archive') && req.method()==='POST') { if(state.archiveFailure)return json({detail:'Fixture archive unavailable'},503); state.session.is_archived=true; return json({status:'archived',session_id:'review-fixture'}) }
  if (p.endsWith('/restore') && req.method()==='POST') {state.session.is_archived=false;return json({status:'restored',session_id:'review-fixture'})}
  if (p === '/api/final-report/sessions/review-fixture') return state.reportUnavailable ? json({detail:'Fixture refresh unavailable'},503) : json(reportData())
  if(p.endsWith('/finalize')){const body=req.postDataJSON();state.finalizations.push(body);assert.equal(body.proofread_revision_id,state.acceptedSource.revision_id);if(state.finalizeFailure)return json({detail:'Accepted source changed. Reload before reviewing again.'},409);state.revision={id:'finalized-'+state.finalizations.length,revision_number:3,report_title:body.report_title||state.acceptedSource.proofread_title,report_text:state.acceptedSource.proofread_text,approval_status:'approved',can_export:true};state.canFinalize=false;state.session.final_report_status='approved';return json({status:'approved'})}
  if (p.endsWith('/approve')) { state.approvals.push(req.postDataJSON()); if(state.approveFailure)return json({detail:'Saved revision changed. Reload before approving.'},409); assert.equal(req.postDataJSON().revision_id, state.revision.id);state.revision.approval_status='approved';state.revision.can_export=true;state.revision.approved_at='2026-09-30T10:00:00Z';state.session.final_report_status='approved';return json({status:'approved',final_report:state.revision}) }
  if (p.endsWith('/save-revision')) { if(state.saveDelay)await new Promise(resolve=>setTimeout(resolve,state.saveDelay));if(state.saveFailure)return json({detail:'Synthetic save unavailable. Your draft is unchanged.'},503);const body=req.postDataJSON();state.revision={...state.revision,...body,id:'revision-2',revision_number:2,approval_status:'draft',can_export:false,approved_at:null};state.session.final_report_status='needs_review';return json({status:'saved'}) }
  if (p.endsWith('/activate')) {state.revision={...state.revision,id:'revision-old',approval_status:'draft',can_export:false};state.session.final_report_status='needs_review';return json({status:'activated'})}
  if (p.endsWith('/download') || p.includes('/download-docx/')) {assert.equal(state.revision.can_export,true,'Export cannot bypass approval'); return route.fulfill({status:200,contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',headers:{'Content-Disposition':'attachment; filename=synthetic.docx'},body:Buffer.from('Synthetic fixture export - not a real DOCX')})}
  if(p === '/api/report-processing/status/review-fixture') return json(state.processing==='failed' ? {status:'failed',error_code:'invalid_output',error_message:'Generated output rejected: required report content is missing.'} : {status:state.processing,current_stage:state.processing==='completed'?'completed':'ai_processing',run_id:state.processingRunId || 'fixture-run',review_status:'needs_review'})
  if(p.startsWith('/api/report-processing/cancel/'))return json({detail:'Fixture cancellation unconfirmed'},503)
  if(p === '/api/report-processing/start') {state.startBodies.push(req.postDataJSON());if(state.startGate)await state.startGate;if(state.startError)return json({detail:state.startError,error_code:'provider_unavailable'},503);state.processing='in_progress';state.processingRunId='retry-run';return json({status:'in_progress',run_id:state.processingRunId,current_stage:'ai_processing'})}
  if(p.startsWith('/api/transcription/media/')){if(state.mediaFailure)return json({detail:'Synthetic source unavailable'},404);const range=req.headers()['range'];if(range){const match=/bytes=(\d+)-(\d*)/.exec(range);const start=Number(match?.[1]||0);const end=match?.[2]?Math.min(Number(match[2]),syntheticWav.length-1):syntheticWav.length-1;return route.fulfill({status:206,contentType:'audio/wav',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${syntheticWav.length}`},body:syntheticWav.subarray(start,end+1)})}return route.fulfill({status:200,contentType:'audio/wav',headers:{'Accept-Ranges':'bytes'},body:syntheticWav})}
  if(p === '/api/report-processing/archive') return json({reports:[{...state.session,...state.revision}]})
  if(p === '/api/readiness') return state.readiness==='offline' ? route.abort('connectionrefused') : json({backend_available:true,database_available:true,ai_provider:{configured:false,live_verified:false},kjv_context:{available:true,complete:false,verse_corpus_complete:true,proper_names_complete:false}})
  if(p === '/api/programmes') return json([])
  if(p === '/api/report-processing/settings') return json({auto_process_after_verification:false})
  if(p === '/api/report-processing/instruction') return json({instruction:'Synthetic instructions'})
  if(p === '/api/transcription/transcripts') return json({transcripts:[]})
  if(p === '/api/transcription/config-status') return json({is_configured:false,active_provider:'azure_speech'})
  if(p === '/api/reporting/status' || p === '/api/editing/status' || p === '/api/proofreading/status') return json({configured:false,active_standard_version:'v1'})
  if(p.endsWith('/reports')) return json({reporter_a:{report_title:title,report_text:prose,status:'ready'},reporter_b:{report_title:title,report_text:prose,status:'ready'},reporting_status:'reports_ready'})
  if(p === '/api/editing/sessions/review-fixture/report') return json({editing_status:'draft_ready',active_revision:{id:'edit-1',report_title:title,report_text:prose,status:'draft'},revisions:[],sources_available:{can_edit:true,verified_transcript:true,reporter_a:true,reporter_b:true},sources:{verified_text:prose,reporter_a:{report_text:prose},reporter_b:{report_text:prose}}})
  if(p === '/api/proofreading/sessions/review-fixture/report') return json({proofreading_status:'ready_for_review',active_revision:{id:'proof-1',proofread_title:title,proofread_text:prose,changes:[],status:'ready_for_review'},revisions:[],source_edited_report:{report_title:title,report_text:prose},can_proofread:true})
  if(p.endsWith('/verification')) return json({session_id:'review-fixture',items_total:1,items_pending:1,items_resolved:0,items:[{item_id:'flag-1',action:'pending',original_text:'Blessed are the merciful',verified_text:'',start_time:5,end_time:10,reason:'Scripture quotation',item_type:'scripture',segment_index:0}],verified_text:prose})
  return json({detail:'Unconfigured fixture endpoint'},503)
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${base}#${view}`)
 return {page,state,context}
}
async function capture(page,name) {await page.locator('.app-content-body').evaluateAll(els=>els.forEach(el=>el.scrollTop=0));await page.waitForTimeout(250);await page.screenshot({path:resolve(directory,`${name}.png`),fullPage:true})}
async function contrast(page) {
 const ratios=await page.evaluate(()=>{
  const style=getComputedStyle(document.body)
  const rgb=name=>{let hex=style.getPropertyValue(name).trim().replace('#','');if(hex.length===3)hex=[...hex].map(x=>x+x).join('');return hex.match(/.{2}/g).map(x=>parseInt(x,16)/255)}
  const lum=name=>rgb(name).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0)
  return ['--text-primary','--text-secondary','--text-muted'].flatMap(fg=>['--bg-page','--bg-surface'].map(bg=>{const a=lum(fg),b=lum(bg);return {fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}}))
 })
 assert(ratios.every(x=>x.ratio>=4.5),'Sampled semantic prose colours must meet 4.5:1')
 return Math.min(...ratios.map(x=>x.ratio)).toFixed(2)
}
async function reflow(page) {
 await page.waitForTimeout(250)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal page overflow')
 const clipped = await page.evaluate(()=>[...document.querySelectorAll('main button, main input, main textarea, main select')].filter(el=>el.getClientRects().length && !el.closest('[inert]')).map(el=>({text:el.getAttribute('aria-label') || el.textContent.slice(0,60), rect:el.getBoundingClientRect()})).filter(({rect})=>rect.width > 0 && (rect.x < -1 || rect.right > innerWidth + 1)).map(({text})=>text))
 assert.deepEqual(clipped,[], 'Interactive controls must not be clipped by shell overflow')
}
export { fixture, browser, expect, assert, capture, reflow, contrast, prose, title, errors, calls, directory, initialSession, base }
