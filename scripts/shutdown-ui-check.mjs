import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdtemp } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright')
const screenshots = await mkdtemp(join(tmpdir(), 'gridbot-shutdown-ui-'))
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname
    const file = await readFile(join(process.cwd(), 'dist', path))
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(path)] || 'application/octet-stream')
    res.end(file)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
  for (const viewport of [{ width: 1439, height: 784 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    let shutdowns = 0
    let failShutdown = true
    await page.route('**/api/**', (route) => {
      const shutdown = route.request().url().endsWith('/api/shutdown')
      if (shutdown) shutdowns++
      return route.fulfill({ status: shutdown && failShutdown ? 503 : 200,
        contentType: 'application/json', body: JSON.stringify(shutdown ? { stopped: true } : {}) })
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const button = page.getByRole('button', { name: 'Gridbot Console beenden', exact: true })
    await button.click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    const box = await dialog.boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width)
    assert.ok(box.y >= 0 && box.y + box.height <= viewport.height)
    assert.equal(await page.getByRole('button', { name: 'Nein', exact: true }).evaluate((el) => el === document.activeElement), true)
    await page.screenshot({ path: join(screenshots, `confirm-${viewport.width}.png`) })
    await page.getByRole('button', { name: 'Nein', exact: true }).click()
    assert.equal(shutdowns, 0)
    await button.click()
    await page.keyboard.press('Escape')
    assert.equal(await dialog.isVisible(), false)
    await button.click()
    await page.getByRole('button', { name: 'Ja', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.equal(await dialog.isVisible(), true)
    failShutdown = false
    await page.getByRole('button', { name: 'Ja', exact: true }).click()
    await page.getByText('Beendet / Stopped', { exact: true }).waitFor()
    assert.equal(shutdowns, 2)
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(`Shutdown UI checks passed. Screenshots: ${screenshots}`)
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
