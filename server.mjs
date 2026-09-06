import crypto from 'node:crypto'
import { createServer } from 'node:http'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { createPhemexCreateGridHandler } from './server/phemexCreateGrid.mjs'
import { createPhemexMonitorHandler } from './server/phemexMonitor.mjs'

const port = Number(process.env.PORT || 5174)
const candleLimit = 200
const intervalSeconds = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}
const phemexBaseUrl = 'https://api.phemex.com'
const storeFilePath = join(process.cwd(), 'data', 'store.json')
const envFilePath = join(process.cwd(), '.env')
const serverLogFilePath = join(process.cwd(), 'gridbot-server.log')
const requestJsonCache = new WeakMap()
const phemexOperationLocks = new Map()
const recentSubmittedOrders = new Map()
const recentSubmittedOrderTtlMs = 30_000

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function logServerError(label, error) {
  const message = error instanceof Error ? (error.stack || error.message) : String(error)
  const line = `[${new Date().toISOString()}] ${label} ${message}\n`
  void appendFile(serverLogFilePath, line, 'utf8').catch(() => undefined)
  console.error(label, error)
}

function normalizeOrderKey({ symbol, side, price, baseSize }) {
  return [
    String(symbol || '').trim().toUpperCase(),
    String(side || '').trim().toLowerCase(),
    Number(price).toFixed(8),
    Number(baseSize).toFixed(8),
  ].join('|')
}

function cleanupRecentSubmittedOrders() {
  const now = Date.now()
  for (const [key, order] of recentSubmittedOrders) {
    if (now - order.submittedAt > recentSubmittedOrderTtlMs) {
      recentSubmittedOrders.delete(key)
    }
  }
}

function rememberSubmittedOrder(order) {
  cleanupRecentSubmittedOrders()
  recentSubmittedOrders.set(normalizeOrderKey(order), {
    ...order,
    submittedAt: Date.now(),
  })
}

function mergeRecentSubmittedOrders(symbol, openOrders) {
  cleanupRecentSubmittedOrders()
  const existingKeys = new Set(openOrders.map((order) => normalizeOrderKey({ ...order, symbol })))
  const recentOrders = []
  for (const order of recentSubmittedOrders.values()) {
    if (String(order.symbol || '').toUpperCase() !== String(symbol || '').toUpperCase()) continue
    const key = normalizeOrderKey(order)
    if (existingKeys.has(key)) continue
    recentOrders.push({
      orderId: order.orderId,
      clientOrderId: order.clientOrderId,
      symbol: order.symbol,
      side: order.side,
      price: order.price,
      baseSize: order.baseSize,
    })
  }
  return [...openOrders, ...recentOrders]
}

process.on('uncaughtException', (error) => {
  logServerError('[fatal] uncaughtException', error)
})

process.on('unhandledRejection', (error) => {
  logServerError('[fatal] unhandledRejection', error)
})

function parseEnv(text) {
  return Object.fromEntries(text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
    }))
}

async function loadEnv() {
  try {
    return parseEnv(await readFile(envFilePath, 'utf8'))
  } catch {
    return {}
  }
}

async function getPhemexEnvCredentials() {
  const env = await loadEnv()
  return {
    key: String(env.PHEMEX_API_KEY || '').trim(),
    secret: String(env.PHEMEX_API_SECRET || '').trim(),
    passphrase: String(env.PHEMEX_PASSPHRASE || '').trim(),
  }
}

async function handleLoadStore(response) {
  try {
    const raw = await readFile(storeFilePath, 'utf8')
    sendJson(response, 200, JSON.parse(raw))
  } catch {
    sendJson(response, 200, {})
  }
}

async function handleSaveStore(request, response) {
  const body = await readRequestJson(request)
  let currentStore = {}
  try {
    currentStore = JSON.parse(await readFile(storeFilePath, 'utf8'))
  } catch {
    currentStore = {}
  }
  const currentLanguageUpdatedAt = Number(currentStore.languageUpdatedAt) || 0
  const nextLanguageUpdatedAt = Number(body.languageUpdatedAt) || 0
  if (currentLanguageUpdatedAt > nextLanguageUpdatedAt) {
    body.language = currentStore.language
    body.languageUpdatedAt = currentLanguageUpdatedAt
  }
  await mkdir(dirname(storeFilePath), { recursive: true })
  await writeFile(storeFilePath, JSON.stringify(body, null, 2), 'utf8')
  sendJson(response, 200, { saved: true })
}

async function readRequestJson(request) {
  if (requestJsonCache.has(request)) return requestJsonCache.get(request)
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (!chunks.length) {
    requestJsonCache.set(request, {})
    return {}
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
  if (url.pathname === '/api/phemex/secrets') {
    requestJsonCache.set(request, body)
    return body
  }
  if (url.pathname.startsWith('/api/phemex/')) {
    const credentials = await getPhemexEnvCredentials()
    const mergedBody = {
      ...body,
      key: String(body.key || credentials.key || '').trim(),
      secret: String(body.secret || credentials.secret || '').trim(),
      passphrase: String(body.passphrase || credentials.passphrase || '').trim(),
    }
    requestJsonCache.set(request, mergedBody)
    return mergedBody
  }
  requestJsonCache.set(request, body)
  return body
}

function buildPhemexOperationKey(body) {
  const baseAsset = String(body.baseAsset || '').trim().toUpperCase()
  const quoteAsset = String(body.quoteAsset || '').trim().toUpperCase()
  const symbol = String(body.symbol || `${baseAsset}${quoteAsset}`).trim().toUpperCase()
  return `phemex:${symbol || 'unknown'}`
}

async function withPhemexOperationLock(key, task) {
  const previous = phemexOperationLocks.get(key) ?? Promise.resolve()
  const current = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (phemexOperationLocks.get(key) === current) {
        phemexOperationLocks.delete(key)
      }
    })
  phemexOperationLocks.set(key, current)
  return current
}

async function handleSavePhemexSecrets(request, response) {
  const body = await readRequestJson(request)
  const key = String(body.key || '').trim()
  const secret = String(body.secret || '').trim()
  const passphrase = String(body.passphrase || '').trim()

  if (!key || !secret) {
    sendJson(response, 400, { error: 'API Key und Secret fehlen.' })
    return
  }

  await writeFile(envFilePath, [
    `PHEMEX_API_KEY=${key}`,
    `PHEMEX_API_SECRET=${secret}`,
    `PHEMEX_PASSPHRASE=${passphrase}`,
    '',
  ].join('\n'), 'utf8')
  sendJson(response, 200, { saved: true })
}

async function handlePhemexSecretsStatus(response) {
  const credentials = await getPhemexEnvCredentials()
  sendJson(response, 200, {
    hasKey: Boolean(credentials.key),
    hasSecret: Boolean(credentials.secret),
    hasPassphrase: Boolean(credentials.passphrase),
  })
}

function decodePhemexSecret(secret) {
  const normalizedSecret = String(secret || '').trim().replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalizedSecret.length % 4
  return Buffer.from(padding ? normalizedSecret.padEnd(normalizedSecret.length + (4 - padding), '=') : normalizedSecret, 'base64')
}

function signPhemexRequest({ path, query = '', expiry, body = '', secret }) {
  return crypto.createHmac('sha256', decodePhemexSecret(secret)).update(`${path}${query}${expiry}${body}`).digest('hex')
}

function normalizeRows(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.rows)) return data.rows
  if (Array.isArray(data?.data?.rows)) return data.data.rows
  if (Array.isArray(data?.result?.rows)) return data.result.rows
  return []
}

async function signedPhemexFetch({ method = 'GET', path, query = '', body = '', key, secret }) {
  const expiry = String(Math.floor(Date.now() / 1000) + 60)
  const signature = signPhemexRequest({ path, query, expiry, body, secret })
  const response = await fetch(`${phemexBaseUrl}${path}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      'x-phemex-access-token': key,
      'x-phemex-request-expiry': expiry,
      'x-phemex-request-signature': signature,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body || undefined,
  })
  const text = await response.text()
  const payload = text.trim() ? JSON.parse(text) : undefined
  if (!payload) throw new Error(`Phemex leere Antwort ${response.status} fuer ${path}.`)
  if (response.ok && payload.code === undefined) return { data: payload }
  if (!response.ok || payload.code !== 0) throw new Error(payload.msg || `Phemex Fehler ${payload.code ?? response.status}`)
  return payload
}

function evToDecimal(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return numeric / 100_000_000
}

function epToDecimal(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return numeric / 100_000_000
}

function decimalToEv(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.round(numeric * 100_000_000)
}

function decimalToEp(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.round(numeric * 100_000_000)
}

function firstPositiveDecimal(...values) {
  for (const value of values) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }
  return 0
}

function normalizePhemexSide(value) {
  const side = String(value || '').toLowerCase()
  if (side.includes('buy')) return 'buy'
  if (side.includes('sell')) return 'sell'
  return ''
}

function toPhemexSpotSymbol(symbol) {
  const raw = String(symbol || '').trim()
  const normalized = raw.toUpperCase()
  if (!normalized) return ''
  if (raw.startsWith('s')) return `s${raw.slice(1).toUpperCase()}`
  return `s${normalized}`
}

function normalizeClientOrderId(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40)
}

async function loadPhemexCandles({ symbol, interval }) {
  const phemexSymbol = toPhemexSpotSymbol(symbol)
  const resolution = intervalSeconds[interval] ?? intervalSeconds['1d']
  const to = Math.floor(Date.now() / 1000)
  const from = to - resolution * candleLimit * 2
  const query = new URLSearchParams({
    symbol: phemexSymbol,
    resolution: String(resolution),
    from: String(from),
    to: String(to),
  })

  const [klineResponse, tickerResponse] = await Promise.all([
    fetch(`${phemexBaseUrl}/exchange/public/md/kline?${query.toString()}`),
    fetch(`${phemexBaseUrl}/md/spot/ticker/24hr?symbol=${encodeURIComponent(phemexSymbol)}`),
  ])
  const [klinePayload, tickerPayload] = await Promise.all([klineResponse.json(), tickerResponse.json()])

  if (!klineResponse.ok || klinePayload.code !== 0) throw new Error(klinePayload.msg || 'Phemex Kerzen konnten nicht geladen werden.')
  if (!tickerResponse.ok || tickerPayload.error) throw new Error(tickerPayload.error?.message || 'Phemex Ticker konnte nicht geladen werden.')

  const candles = normalizeRows(klinePayload.data).slice(-candleLimit).map((row) => ({
    time: Number(row[0]),
    open: epToDecimal(row[3]),
    high: epToDecimal(row[4]),
    low: epToDecimal(row[5]),
    close: epToDecimal(row[6]),
  }))
  const ticker = tickerPayload.result ?? {}
  const latestCandle = candles.at(-1)
  const last = epToDecimal(ticker.lastEp)
  const tickerHigh = epToDecimal(ticker.highEp)
  const tickerLow = epToDecimal(ticker.lowEp)
  const tickerOpen = epToDecimal(ticker.openEp)

  if (latestCandle && interval === '1d') {
    if (tickerOpen > 0) latestCandle.open = tickerOpen
    if (last > 0) latestCandle.close = last
    latestCandle.high = Math.max(latestCandle.high, tickerHigh, last)
    latestCandle.low = Math.min(...[latestCandle.low, tickerLow, last].filter((value) => Number.isFinite(value) && value > 0))
  }

  return { pair: phemexSymbol, candles }
}

async function loadPhemexLastPrice({ symbol }) {
  const phemexSymbol = toPhemexSpotSymbol(symbol)
  const response = await fetch(`${phemexBaseUrl}/md/spot/ticker/24hr?symbol=${encodeURIComponent(phemexSymbol)}`)
  const payload = await response.json()
  if (!response.ok || payload.error) throw new Error(payload.error?.message || 'Phemex Preis konnte nicht geladen werden.')
  const last = epToDecimal(payload.result?.lastEp)
  if (!Number.isFinite(last) || last <= 0) throw new Error('Phemex Preis ist ungueltig.')
  return last
}

async function loadPhemexBalance({ key, secret, currency }) {
  if (!key || !secret) return 0
  const path = '/spot/wallets'
  const normalizedCurrency = String(currency || '').toUpperCase()
  const query = `currency=${encodeURIComponent(normalizedCurrency)}`
  const payload = await signedPhemexFetch({ method: 'GET', path, query, key, secret })
  const wallets = normalizeRows(payload.data)
  const wallet = wallets.find((item) => String(item?.currency || '').toUpperCase() === normalizedCurrency)
    ?? wallets[0]
    ?? payload.data
  const balance = evToDecimal(wallet?.balanceEv)
  const locked = evToDecimal(wallet?.lockedTradingBalanceEv) + evToDecimal(wallet?.lockedWithdrawEv)
  return Math.max(0, balance - locked)
}

function normalizeOpenSpotOrder(row) {
  const price = firstPositiveDecimal(
    epToDecimal(row.priceEp),
    epToDecimal(row.stopPxEp),
    row.price,
    row.priceRp,
    row.orderPrice,
  )
  const baseSize = firstPositiveDecimal(
    evToDecimal(row.baseQtyEv),
    evToDecimal(row.qtyEv),
    evToDecimal(row.orderQtyEv),
    row.baseQty,
    row.qty,
    row.orderQty,
    row.size,
  )
  return {
    orderId: String(row.orderID ?? row.orderId ?? row.id ?? ''),
    clientOrderId: String(row.clOrdID ?? row.clOrdId ?? row.clientOrderId ?? row.clientOrderID ?? ''),
    symbol: String(row.symbol ?? ''),
    side: normalizePhemexSide(row.side),
    price,
    baseSize,
  }
}

async function loadPhemexOpenOrders({ key, secret, symbol }) {
  const query = symbol ? `symbol=${encodeURIComponent(symbol)}` : ''
  const payload = await signedPhemexFetch({ method: 'GET', path: '/spot/orders', query, key, secret })
  const openOrders = normalizeRows(payload.data).map(normalizeOpenSpotOrder).filter((order) => order.price > 0 && order.side)
  return mergeRecentSubmittedOrders(symbol, openOrders)
}

async function loadPhemexOrderById({ key, secret, symbol, orderId, clientOrderId }) {
  if (!orderId && !clientOrderId) return undefined
  const buildQuery = (orderIdKey) => new URLSearchParams({
    symbol,
    ...(orderId ? { [orderIdKey]: orderId } : {}),
    ...(clientOrderId ? { clOrdID: clientOrderId } : {}),
  }).toString()

  let payload = await signedPhemexFetch({
    method: 'GET',
    path: '/api-data/spots/orders/by-order-id',
    query: buildQuery('orderID'),
    key,
    secret,
  })
  let rows = normalizeRows(payload.data)
  if (!rows.length && orderId) {
    payload = await signedPhemexFetch({
      method: 'GET',
      path: '/api-data/spots/orders/by-order-id',
      query: buildQuery('oderId'),
      key,
      secret,
    })
    rows = normalizeRows(payload.data)
  }
  if (rows.length) return rows[0]
  if (payload.data && typeof payload.data === 'object') return payload.data
  return undefined
}

async function createPhemexLimitOrder({ key, secret, symbol, side, price, baseSize, clientOrderId }) {
  const body = JSON.stringify({
    symbol,
    clOrdID: clientOrderId,
    side: side === 'sell' ? 'Sell' : 'Buy',
    qtyType: 'ByBase',
    quoteQtyEv: '0',
    baseQtyEv: String(decimalToEv(baseSize)),
    priceEp: String(decimalToEp(price)),
    stopPxEp: '0',
    execInst: '',
    ordType: 'Limit',
    timeInForce: 'GoodTillCancel',
    text: side === 'sell' ? 'gridbot-create-sell' : 'gridbot-create-buy',
  })
  const payload = await signedPhemexFetch({ method: 'POST', path: '/spot/orders', body, key, secret })
  const result = payload.data ?? payload.result ?? {}
  if (Number(result.bizError ?? 0) !== 0) {
    throw new Error(result.bizErrorMsg || result.msg || `Phemex bizError ${result.bizError}`)
  }
  rememberSubmittedOrder({
    orderId: String(result.orderID ?? result.orderId ?? result.id ?? ''),
    clientOrderId,
    symbol,
    side,
    price,
    baseSize,
  })
  return result
}

const handlePhemexCreateGrid = createPhemexCreateGridHandler({
  readRequestJson,
  sendJson,
  sleep,
  normalizeClientOrderId,
  toPhemexSpotSymbol,
  loadPhemexLastPrice,
  loadPhemexBalance,
  loadPhemexOpenOrders,
  createPhemexLimitOrder,
})

async function handlePhemexSnapshot(request, response) {
  const body = await readRequestJson(request)
  const key = String(body.key || '').trim()
  const secret = String(body.secret || '').trim()
  const baseAsset = String(body.baseAsset || '').trim().toUpperCase()
  const quoteAsset = String(body.quoteAsset || '').trim().toUpperCase()
  const symbol = String(body.symbol || `${baseAsset}${quoteAsset}`).trim().toUpperCase()

  if (!baseAsset || !quoteAsset || !symbol) {
    sendJson(response, 400, { error: 'Asset und Quote eintragen.' })
    return
  }

  const market = await loadPhemexCandles({ symbol, interval: body.interval })
  const [baseBalanceResult, quoteBalanceResult] = await Promise.allSettled([
    loadPhemexBalance({ key, secret, currency: baseAsset }),
    loadPhemexBalance({ key, secret, currency: quoteAsset }),
  ])
  const balanceError = [baseBalanceResult, quoteBalanceResult]
    .find((result) => result.status === 'rejected')
    ?.reason

  sendJson(response, 200, {
    pair: market.pair,
    candles: market.candles,
    balances: {
      base: baseBalanceResult.status === 'fulfilled' ? baseBalanceResult.value : 0,
      quote: quoteBalanceResult.status === 'fulfilled' ? quoteBalanceResult.value : 0,
    },
    balanceError: balanceError instanceof Error ? balanceError.message : undefined,
  })
}

const handlePhemexMonitor = createPhemexMonitorHandler({
  readRequestJson,
  sendJson,
  sleep,
  normalizeClientOrderId,
  toPhemexSpotSymbol,
  loadPhemexLastPrice,
  loadPhemexBalance,
  loadPhemexOpenOrders,
  loadPhemexOrderById,
  createPhemexLimitOrder,
})

async function serveStatic(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname
  const filePath = normalize(join(process.cwd(), 'dist', requestedPath))
  const distPath = normalize(join(process.cwd(), 'dist'))
  if (!filePath.startsWith(distPath)) {
    response.writeHead(403)
    response.end()
    return
  }
  try {
    const file = await readFile(filePath)
    response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream' })
    response.end(file)
  } catch {
    const index = await readFile(join(process.cwd(), 'dist', 'index.html'))
    response.writeHead(200, { 'content-type': mimeTypes['.html'] })
    response.end(index)
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
    if (request.method === 'GET' && url.pathname === '/api/store') {
      await handleLoadStore(response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/store') {
      await handleSaveStore(request, response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/phemex/secrets') {
      await handleSavePhemexSecrets(request, response)
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/phemex/secrets/status') {
      await handlePhemexSecretsStatus(response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/phemex/snapshot') {
      await handlePhemexSnapshot(request, response)
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/phemex/create-grid') {
      const body = await readRequestJson(request)
      await withPhemexOperationLock(buildPhemexOperationKey(body), () => handlePhemexCreateGrid(request, response))
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/phemex/monitor') {
      const body = await readRequestJson(request)
      await withPhemexOperationLock(buildPhemexOperationKey(body), () => handlePhemexMonitor(request, response))
      return
    }
    await serveStatic(request, response)
  } catch (error) {
    logServerError(`[request] ${request.method || 'UNKNOWN'} ${request.url || '/'}`, error)
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Unbekannter Fehler' })
  }
})

server.on('error', (error) => {
  logServerError('[server]', error)
})

server.listen(port, () => {
  console.log(`Gridbot Menu 2 server listening on http://127.0.0.1:${port}`)
})
