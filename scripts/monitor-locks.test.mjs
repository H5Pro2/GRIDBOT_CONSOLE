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
