// Open the redesigned app with disposable synthetic content. No real backend traffic.
const check = process.argv.includes('--check')
process.env.FRONTEND_FIXTURE_VISIBLE = check ? '0' : '1'
const {fixture, browser, initialSession, expect, errors, assert} = await import('./fixtures/editorial-fixture.mjs')
const preview = await fixture()
preview.state.sessions = [
  {...initialSession, title:'The practice of faithful service'},
  {...initialSession, session_id:'verified-session', title:'Living with purpose', final_report_status:'not_started', report_processing_status:'not_started', verification_status:'complete'},
  {...initialSession, session_id:'raw-session', title:'A steadfast heart', final_report_status:'not_started', report_processing_status:'not_started', verified_text:null, verification_status:'not_started'},
]
await preview.page.reload()
await expect(preview.page.locator('.desk-work-item')).toHaveCount(3)
await expect(preview.page.locator('.desk-document-prose')).toContainText('Synthetic review passage')
assert.deepEqual(errors, [])
if (check) {
  console.log('PASS disposable three-session preview fixture with intercepted auth and API requests')
  await browser.close()
  process.exit(0)
}
console.log('Synthetic review browser opened. Keep the Vite preview running. Close this browser or press Ctrl+C to finish. No microphone, external API, or real storage is used.')
await new Promise(resolve => browser.on('disconnected', resolve))
