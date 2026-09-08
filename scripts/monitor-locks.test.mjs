import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhemexMonitorHandler } from '../server/phemexMonitor.mjs'

async function run(sellStatus) {
  let result
  const created = []
  const handler = createPhemexMonitorHandler({
    readRequestJson: async () => ({ key: 'test', secret: 'test', baseAsset: 'SOL', quoteAsset: 'USDT', lower: 90, upper: 110, grids: 2, orderSize: 0.1,
      knownOrders: [{ side: 'buy', price: 90, baseSize: 0.1, status: 'locked-pending', orderId: 'buy', lockedBySellPrice: 100, lockedBySellOrderId: 'sell' }] }),
    sendJson: (_, status, body) => { assert.equal(status, 200); result = body },
    sleep: async () => {}, normalizeClientOrderId: (id) => id, toPhemexSpotSymbol: (symbol) => symbol,
    loadPhemexLastPrice: async () => 110,
    loadPhemexBalance: async ({ currency }) => currency === 'USDT' ? 9 : 0,
    loadPhemexOpenOrders: async () => [],
    loadPhemexOrderById: async ({ orderId }) => ({ ordStatus: orderId === 'buy' ? 'Filled' : sellStatus }),
    createPhemexLimitOrder: async (order) => { created.push(order); return { orderID: 'new' } },
  })
  await handler({}, {})
  return { result, created }
}

test('confirmed sale releases the old buy cycle', async () => {
  const { result, created } = await run('Filled')
  assert.ok(created.some((order) => order.side === 'buy' && order.price === 90))
  assert.equal(result.openOrders.some((order) => order.status?.startsWith('locked')), false)
})

for (const status of [undefined, 'Canceled', 'PartiallyFilled']) {
  test(`uncompleted sale preserves lock and sale ID: ${status}`, async () => {
    const { result, created } = await run(status)
    assert.equal(created.length, 0)
    assert.equal(result.openOrders.find((order) => order.price === 90)?.lockedBySellOrderId, 'sell')
  })
}

async function runSell({ price = 103.85, finalPrice = price, balance = 0.1, openOrders = [], knownOrders = [{ orderId: 'buy', side: 'buy', price: 102.3, baseSize: 0.1 }] } = {}) {
  let result
  let priceReads = 0
  const created = []
  const handler = createPhemexMonitorHandler({
    readRequestJson: async () => ({ key: 'test', secret: 'test', baseAsset: 'SOL', quoteAsset: 'USDT', lower: 82, upper: 110, grids: 40, orderSize: 0.1, knownOrders }),
    sendJson: (_, status, body) => { assert.equal(status, 200); result = body },
    sleep: async () => {}, normalizeClientOrderId: (id) => id, toPhemexSpotSymbol: (symbol) => symbol,
    loadPhemexLastPrice: async () => priceReads++ === 0 ? price : finalPrice,
    loadPhemexBalance: async ({ currency }) => currency === 'SOL' ? balance : 0,
    loadPhemexOpenOrders: async () => openOrders,
    loadPhemexOrderById: async () => ({ ordStatus: 'Filled' }),
    createPhemexLimitOrder: async (order) => { created.push(order); return { orderID: 'new-sell' } },
  })
  await handler({}, {})
  return { result, created }
}

test('old sell target is raised above live price and remains linked to the buy', async () => {
  const { result, created } = await runSell()
  assert.deepEqual(created.map(({ side, price }) => ({ side, price })), [{ side: 'sell', price: 104.4 }])
  const lock = result.openOrders.find((order) => order.status === 'locked')
  assert.equal(lock.price, 102.3)
  assert.equal(lock.lockedBySellPrice, 104.4)
  assert.equal(lock.lockedBySellOrderId, 'new-sell')
})

test('occupied higher target is skipped', async () => {
  const { created } = await runSell({ openOrders: [{ side: 'sell', price: 104.4, baseSize: 0.1, clientOrderId: 'gb2-existing', orderId: 'existing' }] })
  assert.equal(created[0]?.price, 105.1)
})

for (const scenario of [{ price: 111 }, { finalPrice: 104.5 }, { balance: 0 }]) {
  test(`no sale without a valid higher price and available asset: ${JSON.stringify(scenario)}`, async () => {
    const { result, created } = await runSell(scenario)
    assert.equal(created.length, 0)
    assert.ok(result.openOrders.some((order) => order.price === 102.3 && order.status === 'locked-pending'))
  })
}

test('a target above but within the 25 percent zone stays on hold', async () => {
  const { created } = await runSell({ price: 102.9 })
  assert.equal(created.length, 0)
})
