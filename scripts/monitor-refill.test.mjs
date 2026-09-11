import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhemexMonitorHandler } from '../server/phemexMonitor.mjs'

const legacy = { orderId: 'old-buy', side: 'buy', price: 98.8, baseSize: 0.1,
  status: 'locked-pending', lockedBySellPrice: 99.5, lockedBySellOrderId: '' }

async function run({ price = 103, quote = 20.20769997, freshQuote = quote, base = 0,
  open = [], freshOpen = open, known = [legacy], statuses = {}, journal } = {}) {
  const sent = []
  let result
  let balanceReads = 0
  let orderReads = 0
  await createPhemexMonitorHandler({
    monitorJournal: journal,
    readRequestJson: async () => ({ key: 'test', secret: 'test', botId: 'bot',
      baseAsset: 'SOL', quoteAsset: 'USDT', lower: 98.8, upper: 100.2, grids: 2,
      orderSize: 0.1, knownOrders: known }),
    sendJson: (_, code, payload) => { assert.equal(code, 200, JSON.stringify(payload)); result = payload },
    sleep: async () => {}, normalizeClientOrderId: (id) => id, toPhemexSpotSymbol: (id) => id,
    loadPhemexLastPrice: async () => price,
    loadPhemexBalance: async ({ currency }) => currency === 'SOL' ? base : balanceReads++ === 0 ? quote : freshQuote,
    loadPhemexOpenOrders: async () => orderReads++ === 0 ? open : freshOpen,
    loadPhemexOrderById: async ({ orderId }) => ({ ordStatus: statuses[orderId] ?? 'Filled' }),
    createPhemexLimitOrder: async (order) => { sent.push(order); return { orderID: `new-${sent.length}` } },
  })({}, {})
  return { sent, result }
}

test('98.80 and 99.50 are replenished with free USDT despite the legacy cycle', async () => {
  const { sent, result } = await run()
  assert.deepEqual(sent.map(({ side, price, baseSize }) => [side, price, baseSize]),
    [['buy', 99.5, 0.1], ['buy', 98.8, 0.1]])
  assert.ok(result.openOrders.some((order) => order.orderId === 'old-buy' && order.status === 'locked-pending'))
  assert.equal(sent.reduce((sum, order) => sum + order.price * order.baseSize, 0).toFixed(2), '19.83')
})

test('each refill reserves USDT, so a balance sufficient for one order cannot fund two', async () => {
  const { sent } = await run({ quote: 10 })
  assert.deepEqual(sent.map((order) => order.price), [99.5])
})

for (const quote of [0, 9, NaN]) {
  test(`asset balance is not a substitute for free USDT: ${quote}`, async () => {
    const { sent } = await run({ quote, base: 1 })
    assert.equal(sent.filter((order) => order.side === 'buy').length, 0)
  })
}

test('freshly reduced free USDT prevents spending an older balance', async () => {
  assert.equal((await run({ freshQuote: 0 })).sent.length, 0)
})

test('25 percent distance still leaves the gap near the current price', async () => {
  assert.deepEqual((await run({ price: 99.6 })).sent.map((order) => [order.side, order.price]), [['buy', 98.8]])
})

for (const side of ['buy', 'sell']) {
  test(`a ${side} appearing at a candidate level before submission prevents a duplicate`, async () => {
    const freshOpen = [{ orderId: 'manual', side, price: 99.5, baseSize: 0.2 }]
    assert.deepEqual((await run({ freshOpen })).sent.map((order) => order.price), [98.8])
  })
}

test('a refilled level remains distinct from its old cycle across restart and fill', async () => {
  let state = null
  const journal = { load: async () => structuredClone(state), save: async (_, value) => { state = structuredClone(value) } }
  const first = await run({ journal })
  const second = await run({ journal, open: first.result.created })
  assert.equal(second.sent.length, 0)
  assert.ok(state.orders.some((order) => order.orderId === 'old-buy'))
  // The new 98.80 order fills, while the 99.50 buy remains open.
  const third = await run({ journal, quote: 0, base: 0.1, price: 99,
    open: first.result.created.filter((order) => order.price === 99.5) })
  assert.ok(third.result.openOrders.some((order) => order.orderId === 'old-buy'))
  assert.ok(third.result.openOrders.some((order) => order.orderId === 'new-2' && order.status?.startsWith('locked')))
  assert.equal(third.sent.length, 0, 'No sell may cross the existing buy at the same target')
})

test('newly filled buy gets its own sell; the old pending buy is not silently completed or merged', async () => {
  const known = [legacy, { orderId: 'new-buy', side: 'buy', price: 98.8, baseSize: 0.1 }]
  const { sent, result } = await run({ known, price: 99, quote: 0, base: 0.1 })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].side, 'sell')
  assert.equal(sent[0].sourceBuyOrderId, 'new-buy')
  assert.equal(result.openOrders.find((order) => order.orderId === 'old-buy').lockedBySellOrderId, '')
  assert.equal(result.openOrders.find((order) => order.orderId === 'new-buy').lockedBySellOrderId, 'new-1')
})

test('existing sell survives replenishment without reassignment to the new buy', async () => {
  const old = { ...legacy, status: 'locked', lockedBySellPrice: 100.2, lockedBySellOrderId: 'old-sell' }
  const open = [{ orderId: 'old-sell', side: 'sell', price: 100.2, baseSize: 0.1 }]
  const { sent, result } = await run({ known: [old], open })
  assert.deepEqual(sent.map((order) => [order.side, order.price]), [['buy', 99.5], ['buy', 98.8]])
  assert.ok(result.openOrders.some((order) => order.orderId === 'old-sell'))
  assert.equal(result.openOrders.find((order) => order.orderId === 'old-buy').lockedBySellOrderId, 'old-sell')
})

test('filled replenishment cannot attach itself to an existing sell belonging to the old cycle', async () => {
  const old = { ...legacy, status: 'locked', lockedBySellOrderId: 'old-sell' }
  const { sent, result } = await run({ quote: 0, base: 0.1, price: 99,
    known: [old, { orderId: 'new-buy', side: 'buy', price: 98.8, baseSize: 0.1 }],
    open: [{ orderId: 'old-sell', side: 'sell', price: 99.5, baseSize: 0.1 }] })
  assert.equal(sent.length, 0)
  assert.equal(result.openOrders.find((order) => order.orderId === 'old-buy').lockedBySellOrderId, 'old-sell')
  assert.equal(result.openOrders.find((order) => order.orderId === 'new-buy').lockedBySellOrderId, '')
})
