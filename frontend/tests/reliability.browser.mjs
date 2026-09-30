// Requires an existing local preview and an already-installed Playwright runtime.
// All backend requests are intercepted. No backend, accounts, audio or AI calls.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const { expect } = require('playwright/test')
const base = process.env.FRONTEND_TEST_URL || 'http://127.0.0.1:5173/'
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local preview only')
const browser = await chromium.launch({ headless: true })
const fixtureSession = {
  session_id: 'frontend-fixture', title: 'Fixture session', session_name: 'Fixture session', session_title: 'Fixture session', programme: 'Test programme',
  date_created: '2026-09-30T09:00:00Z', status: 'stopped', duration_seconds: 60,
}
const contexts = []
const pageErrors = []
const requests = []
async function screenshot(page, name) {
  if (!process.env.FRONTEND_TEST_SCREENSHOTS) return
  const directory = resolve(process.env.FRONTEND_TEST_SCREENSHOTS)
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: resolve(directory, name), fullPage: true })
}

function gate() {
  let release
  const promise = new Promise(resolve => { release = resolve })
  return { promise, release }
}

async function fixturePage(hash = 'dashboard', viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport })
  contexts.push(context)
  await context.addInitScript(() => {
    window.__microphoneRequests = 0
    navigator.mediaDevices.getUserMedia = async () => {
      window.__microphoneRequests++
      throw new Error('Microphone use is forbidden in frontend regression checks')
    }
  })
  const state = { sessions: 'empty', settings: 'ok', autoValue: false, save: 'ok', savedBodies: [] }
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(base).origin) return route.continue()
    // Catch every non-preview request: fixtures never fall through to a real backend/provider.
    requests.push({ url: url.href, method: request.method() })
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '8000') {
      return route.abort('blockedbyclient')
    }
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/api/sessions') {
      if (state.sessionGate) await state.sessionGate.promise
      if (state.sessions === 'offline') return route.abort('connectionrefused')
      if (state.sessions === 'http-error') return json({ detail: 'Fixture failure' }, 503)
      if (state.sessions === 'malformed') return json({ sessions: null })
      return json({ sessions: state.sessions === 'populated' ? [fixtureSession] : [] })
    }
    if (url.pathname === '/api/report-processing/settings') {
      if (request.method() === 'POST') {
        state.savedBodies.push(request.postDataJSON())
        if (state.saveGate) await state.saveGate.promise
        if (state.save === 'offline') return route.abort('connectionrefused')
        if (state.save === 'http-error') return json({ detail: 'Fixture save rejected' }, 500)
        state.autoValue = request.postDataJSON().auto_process_after_verification
        return json({ status: 'success', settings: request.postDataJSON() })
      }
      if (state.settingsGate) await state.settingsGate.promise
      if (state.settings === 'offline') return route.abort('connectionrefused')
      if (state.settings === 'http-error') return json({ detail: 'Fixture load rejected' }, 503)
      if (state.settings === 'malformed') return json({})
      return json({ auto_process_after_verification: state.autoValue })
    }
    if (url.pathname === '/api/report-processing/instruction') return json({ instruction: 'Isolated fixture instructions' })
    if (url.pathname === '/api/programmes') return json([])
    return json({ detail: 'Not part of this frontend fixture' }, 503)
  })
  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(error.message))
  return { page, state, open: () => page.goto(`${base}#${hash}`) }
}

try {
  // Dashboard: initial loading/offline, empty recovery, populated refresh failures and retry.
  const dashboard = await fixturePage()
  const { page, state } = dashboard
  state.sessionGate = gate()
  state.sessions = 'offline'
  await dashboard.open()
  await expect(page.getByRole('status')).toHaveText('Loading sessions…')
  await expect(page.getByText('No recorded sessions found.', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Mic / USB Ready')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Record live', exact: true })).toBeVisible()
  state.sessionGate.release()
  await expect(page.locator('.session-list-status').getByRole('alert')).toContainText('Sessions are unavailable')
  state.sessions = 'empty'
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('No recorded sessions found.', { exact: false })).toBeVisible()
  state.sessions = 'populated'
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  const row = page.locator('.desk-work-item')
  await expect(row).toContainText('Fixture session')
  state.sessionGate = gate()
  state.sessions = 'http-error'
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Refreshing sessions')
  await expect(row).toContainText('Fixture session')
  state.sessionGate.release()
  await expect(page.locator('.session-list-status').getByRole('alert')).toContainText('Showing previously loaded data')
  await expect(row).toContainText('Fixture session')
  state.sessions = 'malformed'
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.session-list-status').getByRole('alert')).toContainText('Could not refresh')
  await expect(row).toContainText('Fixture session')
  state.sessions = 'populated'
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Sessions are up to date.')
  await screenshot(page, 'reliability-dashboard-desktop.png')
  console.log('PASS dashboard loading, unavailable, empty, populated, refresh retention and retry')

  // History: no fabricated zero count or empty guidance while unavailable.
  const history = await fixturePage('sessions')
  history.state.sessions = 'offline'
  await history.open()
  await expect(history.page.locator('.session-list-status').getByRole('alert')).toContainText('Sessions are unavailable')
  await expect(history.page.getByText('Active sessions: Unknown')).toBeVisible()
  await expect(history.page.getByText('No Sessions Found')).toHaveCount(0)
  history.state.sessions = 'empty'
  await history.page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(history.page.getByText('No Sessions Found')).toBeVisible()
  history.state.sessions = 'populated'
  await history.page.getByRole('button', { name: /Refresh/ }).click()
  await expect(history.page.locator('.sessions-cards-grid')).toContainText('Fixture session')
  history.state.sessions = 'offline'
  await history.page.getByRole('button', { name: /Refresh/ }).click()
  await expect(history.page.locator('.session-list-status').getByRole('alert')).toContainText('Showing previously loaded data')
  await expect(history.page.locator('.sessions-cards-grid')).toContainText('Fixture session')
  history.state.sessions = 'populated'
  await history.page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(history.page.getByRole('status')).toHaveText('Sessions are up to date.')
  console.log('PASS history unavailable/empty distinction, count, populated retention and recovery')

  // Automation: unknown persisted values, independent instruction success, saving, rollback and reload.
  const settings = await fixturePage('settings')
  settings.state.settingsGate = gate()
  settings.state.settings = 'offline'
  await settings.open()
  const automation = settings.page.getByRole('checkbox', { name: 'Auto-Process After Verification' })
  const automationSwitch = settings.page.locator('.settings-auto-process-row .toggle-switch')
  const automationStatus = settings.page.locator('#automation-status')
  await expect(automationStatus).toContainText('Loading saved')
  await expect(automation).toHaveCount(0)
  settings.state.settingsGate.release()
  await expect(automationStatus).toContainText('unknown')
  await expect(settings.page.locator('#unified-instructions-textarea')).toBeEnabled()
  await expect(automation).toHaveCount(0)
  for (const failure of ['http-error', 'malformed']) {
    settings.state.settings = failure
    await settings.page.getByRole('button', { name: 'Retry automation settings' }).click()
    await expect(automationStatus).toContainText('unknown')
    await expect(automation).toHaveCount(0)
  }
  settings.state.settings = 'ok'
  settings.state.autoValue = 'false'
  await settings.page.getByRole('button', { name: 'Retry automation settings' }).click()
  await expect(automation).toBeEnabled()
  await expect(automation).not.toBeChecked()
  settings.state.saveGate = gate()
  settings.state.save = 'http-error'
  await automationSwitch.click()
  await expect(automationStatus).toContainText('Saving automation')
  await expect(automation).toBeDisabled()
  await expect(settings.page.getByRole('button', { name: /Refresh/ })).toBeDisabled()
  await expect(settings.page.getByRole('button', { name: 'Save Instructions' })).toBeDisabled()
  await automationSwitch.click({ force: true })
  settings.state.saveGate.release()
  await expect(automationStatus).toContainText('Restored the last confirmed value')
  await expect(automation).not.toBeChecked()
  settings.state.save = 'offline'
  await automationSwitch.click()
  await expect(automationStatus).toContainText('Restored the last confirmed value')
  await expect(automation).not.toBeChecked()
  settings.state.save = 'ok'
  await automation.focus()
  await settings.page.keyboard.press('Space')
  await expect(automationStatus).toHaveText('Automation setting saved.')
  await settings.page.reload()
  await expect(automation).toBeChecked()
  await automationSwitch.click()
  await expect(automationStatus).toHaveText('Automation setting saved.')
  await settings.page.reload()
  await expect(automation).not.toBeChecked()
  assert.deepEqual(settings.state.savedBodies, Array(3).fill({ auto_process_after_verification: true }).concat({ auto_process_after_verification: false }))
  console.log('PASS automation unknown/HTTP/malformed load, saving lock, HTTP/network rollback, retry and fixture persistence')

  // Native brand keyboard activation on desktop, including collapsed appearance.
  const brand = settings.page.getByRole('button', { name: 'DLBC Information Unit home' })
  await brand.focus()
  await settings.page.keyboard.press('Enter')
  await expect(settings.page).toHaveURL(/#dashboard$/)
  await settings.page.locator('#nav-link-settings').click()
  await brand.focus()
  await settings.page.keyboard.press('Space')
  await expect(settings.page).toHaveURL(/#dashboard$/)
  console.log('PASS native home control responds to Enter and Space')

  // Drawer: initial focus, both Tab directions, covered content, each exit, responsive cleanup.
  const mobile = await fixturePage('settings', { width: 390, height: 844 })
  await mobile.open()
  const opener = mobile.page.getByRole('button', { name: 'Open navigation' })
  const drawer = mobile.page.getByRole('dialog', { name: 'Main navigation' })
  await opener.focus()
  await mobile.page.keyboard.press('Enter')
  await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused()
  await screenshot(mobile.page, 'reliability-mobile-drawer.png')
  assert.equal(await mobile.page.locator('.app-main-column').evaluate(element => element.inert), true)
  await mobile.page.locator('#unified-instructions-textarea').evaluate(element => element.focus())
  assert.equal(await drawer.evaluate(element => element.contains(document.activeElement)), true)
  for (const direction of ['Tab', 'Shift+Tab']) {
    for (let index = 0; index < 12; index++) {
      await mobile.page.keyboard.press(direction)
      assert.equal(await drawer.evaluate(element => element.contains(document.activeElement)), true)
    }
  }
  await mobile.page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  assert.equal(await mobile.page.locator('.app-main-column').evaluate(element => element.inert), false)
  await opener.click()
  await drawer.getByRole('button', { name: 'Close navigation' }).click()
  await expect(opener).toBeFocused()
  await opener.click()
  await drawer.locator('#nav-link-dashboard').click()
  await expect(opener).toBeFocused()
  await expect(mobile.page).toHaveURL(/#dashboard$/)
  await expect(mobile.page.getByText('No recorded sessions found.', { exact: false })).toBeVisible()
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await screenshot(mobile.page, 'reliability-dashboard-mobile.png')
  await opener.click()
  await mobile.page.locator('.mobile-nav-backdrop').click({ position: { x: 380, y: 400 } })
  await expect(opener).toBeFocused()
  await opener.click()
  await mobile.page.setViewportSize({ width: 1440, height: 900 })
  await expect(drawer).toHaveCount(0)
  assert.equal(await mobile.page.locator('.app-main-column').evaluate(element => element.inert), false)
  console.log('PASS mobile drawer focus, Tab/Shift+Tab containment, inert background, Escape/close/navigation/backdrop restoration, desktop resize')

  for (const context of contexts) {
    for (const checkedPage of context.pages()) assert.equal(await checkedPage.evaluate(() => window.__microphoneRequests), 0)
  }
  assert.deepEqual(pageErrors, [])
  assert(requests.every(request => new URL(request.url).port === '8000'), 'Unexpected external request')
  console.log('PASS no microphone requests or uncaught browser errors; all backend traffic isolated')
} finally {
  await browser.close()
}
