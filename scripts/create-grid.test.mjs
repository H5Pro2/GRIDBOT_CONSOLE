import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhemexCreateGridHandler } from '../server/phemexCreateGrid.mjs'

async function run({ start = false, asset = 0, quote = 100, orders = [], known = [], status = 'Filled', statusFields = {} } = {}) {
  let result
  const created = []
  const handler = createPhemexCreateGridHandler({
    readRequestJson: async () => ({ key: 'test', secret: 'test', baseAsset: 'SOL', quoteAsset: 'USDT', lower: 90, upper: 120, grids: 3, orderSize: 0.1, useStartAsset: start, knownOrders: known }),
    sendJson: (_, code, body) => { assert.equal(code, 200); result = body },
    sleep: async () => {}, normalizeClientOrderId: (id) => id, toPhemexSpotSymbol: (symbol) => symbol,
    loadPhemexLastPrice: async () => 105,
    loadPhemexBalance: async ({ currency }) => currency === 'SOL' ? asset : quote,
    loadPhemexOpenOrders: async () => orders,
    loadPhemexOrderById: async () => ({ ordStatus: status, ...statusFields }),
    createPhemexLimitOrder: async (order) => { created.push(order); return { orderID: `new-${created.length}` } },
  })
  await handler({}, {})
  return { result, created }
}

test('first creation without start-asset permission only buys', async () => {
  const { created } = await run({ asset: 1 })
  assert.deepEqual(created.map((order) => [order.side, order.price]), [['buy', 90], ['buy', 100]])
})
test('start-asset sells reserve their buy level and do not conflict with fresh buys', async () => {
  const { result, created } = await run({ start: true, asset: 0.1 })
  assert.deepEqual(created.map((order) => [order.side, order.price]), [['buy', 90], ['buy', 100], ['sell', 120]])
  assert.ok(result.openOrders.some((order) => order.price === 110 && order.status === 'locked' && order.lockedBySellPrice === 120))
})
test('existing orders survive creation and their levels are not duplicated', async () => {
  const orders = [{ orderId: 'b', clientOrderId: 'gb2-b', side: 'buy', price: 90, baseSize: 0.1 }, { orderId: 's', clientOrderId: 'gb2-s', side: 'sell', price: 110, baseSize: 0.1 }]
  const { result, created } = await run({ orders, known: orders })
  assert.equal(created.length, 0)
  assert.ok(result.openOrders.some((order) => order.orderId === 'b'))
  assert.ok(result.openOrders.some((order) => order.orderId === 's'))
  assert.ok(result.openOrders.some((order) => order.price === 100 && order.lockedBySellOrderId === 's'))
})
test('filled bot buy can sell without start-asset permission', async () => {
  const { result, created } = await run({ asset: 0.1, quote: 0, known: [{ orderId: 'filled-buy', side: 'buy', price: 100, baseSize: 0.1 }] })
  assert.deepEqual(created.map((order) => [order.side, order.price]), [['sell', 110]])
  assert.ok(result.openOrders.some((order) => order.orderId === 'filled-buy' && order.status === 'locked'))
})
test('unknown buy status does not permit repurchase', async () => {
  const { created } = await run({ known: [{ orderId: 'unknown', side: 'buy', price: 100, baseSize: 0.1 }], status: '' })
  assert.equal(created.some((order) => order.price === 100), false)
})

for (const size of [0.1, 0.2]) {
  test(`occupied buy and sell levels stay occupied with quantity ${size}`, async () => {
    const orders = [{ orderId: 'buy', clientOrderId: 'gb2-buy', side: 'buy', price: 90, baseSize: size }, { orderId: 'sell', clientOrderId: 'gb2-sell', side: 'sell', price: 110, baseSize: size }]
    const { result, created } = await run({ orders, known: orders.map((order) => ({ ...order, baseSize: 0.1 })), asset: 1, start: true })
    assert.equal(created.some((order) => order.price === 90 || order.price === 100 || order.price === 110), false)
    assert.equal(result.openOrders.find((order) => order.orderId === 'buy')?.baseSize, size)
    assert.equal(result.debug.some((entry) => entry.type === 'size-mismatch'), size < 0.1)
  })
}

test('manual orders without bot prefix also block duplicate placements', async () => {
  const { created } = await run({ orders: [{ orderId: 'manual', side: 'buy', price: 100, baseSize: 0.2 }] })
  assert.equal(created.some((order) => order.price === 100), false)
})

test('larger filled buy uses the exchange quantity for its follow-up sell', async () => {
  const { created } = await run({ asset: 0.2, quote: 0,
    known: [{ orderId: 'larger-buy', side: 'buy', price: 100, baseSize: 0.1 }],
    statusFields: { cumBaseQtyEv: 20000000 } })
  assert.equal(created.length, 1)
  assert.equal(created[0].side, 'sell')
  assert.equal(created[0].price, 110)
  assert.equal(created[0].baseSize, 0.2)
})
