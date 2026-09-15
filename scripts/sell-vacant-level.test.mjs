import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhemexMonitorHandler } from '../server/phemexMonitor.mjs'

async function run({ price = 96.81, balance = 0.10887, start = true, extra = [], filled = [] } = {}) {
  const sell = { orderId: 'existing-sell', side: 'sell', price: 98.1, baseSize: 0.1 }
  const lock = { orderId: 'existing-buy', side: 'buy', price: 97.4, baseSize: 0.1,
    status: 'locked', lockedBySellPrice: 98.1, lockedBySellOrderId: sell.orderId }
  let result
  const sent = []
  await createPhemexMonitorHandler({
    readRequestJson: async () => ({ key: 'test', secret: 'test', baseAsset: 'SOL', quoteAsset: 'USDT',
      lower: 96, upper: 98.1, grids: 3, orderSize: 0.1, useStartAsset: start, knownOrders: [sell, lock, ...filled] }),
    sendJson: (_, code, body) => { assert.equal(code, 200, JSON.stringify(body)); result = body },
    sleep: async () => {}, normalizeClientOrderId: (id) => id, toPhemexSpotSymbol: (id) => id,
    loadPhemexLastPrice: async () => price,
    loadPhemexBalance: async ({ currency }) => currency === 'SOL' ? balance : 0,
    loadPhemexOpenOrders: async () => [sell, ...extra],
    loadPhemexOrderById: async () => ({ ordStatus: 'Filled', cumBaseValueEv: 10000000 }),
    createPhemexLimitOrder: async (order) => { sent.push(order); return { orderID: 'new-sell' } },
  })({}, {})
  return { sent, result }
}

test('free asset can sell at 97.40 despite an old buy there linked to sell 98.10', async () => {
  const { sent, result } = await run()
  assert.deepEqual(sent.map(({ side, price, baseSize }) => [side, price, baseSize]), [['sell', 97.4, 0.1]])
  assert.equal(result.openOrders.find((o) => o.orderId === 'existing-buy').lockedBySellOrderId, 'existing-sell')
  assert.ok(result.openOrders.some((o) => o.orderId === 'existing-sell'))
})

test('overdue follow-up sell can retarget to another cycles historical buy price', async () => {
  const { sent, result } = await run({ start: false, filled: [{ orderId: 'filled-buy', side: 'buy', price: 96, baseSize: 0.1 }] })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].price, 97.4)
  assert.equal(sent[0].sourceBuyOrderId, 'filled-buy')
  assert.equal(result.openOrders.find((o) => o.orderId === 'filled-buy').lockedBySellOrderId, 'new-sell')
  assert.equal(result.openOrders.find((o) => o.orderId === 'existing-buy').lockedBySellOrderId, 'existing-sell')
})

for (const side of ['buy', 'sell']) {
  test(`actual ${side} order at 97.40 still prevents another order`, async () => {
    assert.equal((await run({ extra: [{ orderId: 'manual', side, price: 97.4, baseSize: 0.1 }] })).sent.length, 0)
  })
}

for (const options of [{ price: 97.3 }, { balance: 0.0999 }, { start: false }]) {
  test(`price distance, full quantity and start asset permission remain required: ${JSON.stringify(options)}`, async () => {
    assert.equal((await run(options)).sent.length, 0)
  })
}
