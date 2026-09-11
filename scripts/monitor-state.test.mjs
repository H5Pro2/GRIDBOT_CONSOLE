import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhemexMonitorHandler } from '../server/phemexMonitor.mjs'
import { openMonitorState } from '../server/monitorState.mjs'

function memoryJournal() {
  const records = new Map()
  return {
    load: async (key) => structuredClone(records.get(key) ?? null),
    save: async (key, value) => { records.set(key, structuredClone(value)) },
  }
}

test('retargeted cycle survives stale browsers and restart, then releases only its source buy', async () => {
  const monitorJournal = memoryJournal()
  let open = []
  let quote = 0
  let base = 0.1
  let sold = false
  const sent = []
  const stale = [{ orderId: 'buy-98.8', side: 'buy', price: 98.8, baseSize: 0.1 }]
  const run = async () => {
    let result
    // A new handler models a restart. The client continues submitting the old snapshot.
    await createPhemexMonitorHandler({
      monitorJournal,
      readRequestJson: async () => ({ key: 'account', secret: 'secret', botId: 'bot',
        baseAsset: 'SOL', quoteAsset: 'USDT', lower: 98.8, upper: 100.9,
        grids: 3, orderSize: 0.1, knownOrders: stale }),
      sendJson: (_, code, body) => { assert.equal(code, 200); result = body },
      sleep: async () => {}, normalizeClientOrderId: (id) => id, toPhemexSpotSymbol: (id) => id,
      loadPhemexLastPrice: async () => 99.9,
      loadPhemexBalance: async ({ currency }) => currency === 'SOL' ? base : quote,
      loadPhemexOpenOrders: async () => open,
      loadPhemexOrderById: async ({ orderId }) => ({ ordStatus: orderId === 'buy-98.8' || sold ? 'Filled' : 'New' }),
      createPhemexLimitOrder: async (order) => { sent.push(order); return { orderID: `created-${sent.length}` } },
    })({}, {})
    return result
  }
  let result = await run()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].price, 100.2)
  assert.equal(sent[0].sourceBuyOrderId, 'buy-98.8')
  open = result.created
  base = 0
  result = await run()
  assert.equal(sent.length, 1)
  assert.equal(result.openOrders.find((o) => o.status === 'locked').price, 98.8)
  assert.equal(result.openOrders.find((o) => o.status === 'locked').lockedBySellOrderId, 'created-1')
  sold = true
  open = []
  quote = 9.88
  result = await run()
  assert.equal(sent.length, 2)
  assert.equal(sent[1].side, 'buy')
  assert.equal(sent[1].price, 98.8)
  assert.equal(result.openOrders.some((o) => o.status?.startsWith('locked')), false)
  open = result.created
  quote = 0
  result = await run()
  assert.equal(sent.length, 2)
  assert.equal(result.openOrders.some((o) => o.orderId === 'buy-98.8'), false)
})

test('lost submit response is recovered by exact client identity, never blindly resubmitted', async () => {
  const journal = memoryJournal()
  let exact
  let submits = 0
  const options = { journal, account: 'account:SOL:bot', auth: { symbol: 'sSOLUSDT' },
    initialOrders: [{ orderId: 'buy', side: 'buy', status: 'locked-pending', price: 98.8, lockedBySellPrice: 100.2 }],
    loadPhemexOrderById: async () => exact,
    createPhemexLimitOrder: async () => { submits++; throw new Error('timeout') },
  }
  const state = await openMonitorState(options)
  await assert.rejects(state.submit({ side: 'sell', price: 100.2, baseSize: 0.1,
    clientOrderId: 'pending-client', sourceBuyPrice: 98.8, sourceBuyOrderId: 'buy' }), /timeout/)
  await assert.rejects(openMonitorState(options), /ungeklärt/)
  assert.equal(submits, 1)
  exact = { orderID: 'sell', clOrdID: 'pending-client', symbol: 'sSOLUSDT', side: 'Sell',
    ordType: 'Limit', priceEp: 10020000000, baseQtyEv: 10000000, ordStatus: 'Filled' }
  const recovered = await openMonitorState(options)
  assert.equal(submits, 1)
  assert.equal(recovered.orders.find((o) => o.orderId === 'buy').lockedBySellOrderId, 'sell')
  assert.equal(recovered.orders.find((o) => o.orderId === 'sell').sourceBuyOrderId, 'buy')
})

test('a returned order with the wrong identity cannot resolve a pending submission', async () => {
  const journal = memoryJournal()
  await journal.save('account', { orders: [], pending: { side: 'buy', price: 98.8, baseSize: 0.1, clientOrderId: 'expected' } })
  await assert.rejects(openMonitorState({ journal, account: 'account', auth: { symbol: 'sSOLUSDT' },
    loadPhemexOrderById: async () => ({ orderID: 'unrelated', clOrdID: 'wrong', symbol: 'sSOLUSDT',
      side: 'Buy', ordType: 'Limit', priceEp: 9880000000, baseQtyEv: 10000000 }),
  }), /ungeklärt/)
  assert.ok((await journal.load('account')).pending)
})

test('empty authoritative state is not repopulated from old browser locks', async () => {
  const journal = memoryJournal()
  await journal.save('account', { orders: [], pending: null })
  const state = await openMonitorState({ journal, account: 'account', initialOrders: [{ orderId: 'old-lock' }] })
  assert.deepEqual(state.orders, [])
})

test('unavailable buy status cannot erase an existing lock or permit another sale', async () => {
  let result
  const lock = { orderId: 'buy', side: 'buy', status: 'locked-pending', price: 90,
    baseSize: 0.1, lockedBySellPrice: 100, lockedBySellOrderId: '' }
  await createPhemexMonitorHandler({
    readRequestJson: async () => ({ key: 'test', secret: 'test', baseAsset: 'SOL', quoteAsset: 'USDT',
      lower: 90, upper: 110, grids: 2, orderSize: 0.1, knownOrders: [lock] }),
    sendJson: (_, code, body) => { assert.equal(code, 200); result = body },
    sleep: async () => {}, normalizeClientOrderId: (id) => id, toPhemexSpotSymbol: (id) => id,
    loadPhemexLastPrice: async () => 95,
    loadPhemexBalance: async () => 100,
    loadPhemexOpenOrders: async () => [],
    loadPhemexOrderById: async () => undefined,
    createPhemexLimitOrder: async () => assert.fail('An unresolved cycle must not trade'),
  })({}, {})
  assert.equal(result.openOrders[0].orderId, 'buy')
  assert.equal(result.openOrders[0].status, 'locked-pending')
  assert.ok(result.debug.some((entry) => entry.reason.includes('keine bestätigte Order-ID')))
})
