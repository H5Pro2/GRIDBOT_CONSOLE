import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createOrderSizeReconciler, createReplacementJournal } from '../server/orderSizeReconciliation.mjs'
import { createPhemexMonitorHandler } from '../server/phemexMonitor.mjs'
import { createPhemexCreateGridHandler } from '../server/phemexCreateGrid.mjs'

function fixture({ side = 'buy', size = 0.05, funds = 100, afterFunds,
  status = 'New', filled = 0, cancelStatus = 'Canceled', cancelFilled = 0,
  failCancel = false, failCreate = false, price = 105, exactSize = size } = {}) {
  const source = { orderId: 'original', clientOrderId: 'manual', side, price: side === 'buy' ? 100 : 110, baseSize: size }
  let pending = null
  let canceled = false
  let replacement
  const calls = []
  const journal = {
    load: async () => structuredClone(pending),
    save: async (_, value) => { pending = structuredClone(value) },
    remove: async () => { pending = null },
  }
  const deps = {
    journal,
    loadPhemexOpenOrders: async () => canceled ? [] : [source],
    loadPhemexBalance: async () => canceled && afterFunds !== undefined ? afterFunds : funds,
    loadPhemexLastPrice: async () => price,
    loadPhemexOrderById: async ({ orderId, clientOrderId }) => {
      calls.push(['status', orderId || clientOrderId])
      if (clientOrderId) return replacement
      return { orderID: source.orderId, ordStatus: canceled ? cancelStatus : status,
        ordType: 'Limit', side, priceEp: source.price * 1e8,
        baseQtyEv: exactSize * 1e8, cumBaseQtyEv: (canceled ? cancelFilled : filled) * 1e8 }
    },
    cancelPhemexOrder: async () => {
      calls.push(['cancel'])
      assert.equal(pending.phase, 'cancel')
      if (failCancel) throw new Error('cancel timeout')
      canceled = true
    },
    createPhemexLimitOrder: async (order) => {
      calls.push(['create', order])
      assert.equal(pending.phase, 'submitting')
      replacement = { orderID: 'replacement', clOrdID: order.clientOrderId, ordStatus: 'New' }
      if (failCreate) throw new Error('POST timeout')
      return replacement
    },
  }
  const args = { key: 'test-key', secret: 'test-secret', symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT',
    levels: [90, 100, 110, 120], orderSize: 0.1, minimumPriceDistance: 2.5, openOrders: [source], knownOrders: [source] }
  return { source, args, deps, calls, journal,
    run: () => createOrderSizeReconciler(deps)(args),
    pending: () => pending }
}

for (const side of ['buy', 'sell']) {
  for (const size of [0.1, 0.2]) {
    test(`${side} size ${size} remains untouched`, async () => {
      const f = fixture({ side, size })
      assert.equal((await f.run()).handled, false)
      assert.deepEqual(f.calls, [])
    })
  }
  test(`${side} insufficient extra funds leaves smaller order untouched`, async () => {
    const f = fixture({ side, funds: 0 })
    const result = await f.run()
    assert.equal(result.handled, false)
    assert.equal(f.calls.length, 0)
    assert.match(result.debug[0].reason, /Guthaben/)
  })
  test(`${side} smaller order canceled once and replaced at same price`, async () => {
    const f = fixture({ side })
    const result = await f.run()
    const creates = f.calls.filter(([type]) => type === 'create')
    assert.equal(f.calls.filter(([type]) => type === 'cancel').length, 1)
    assert.equal(creates.length, 1)
    assert.equal(creates[0][1].price, f.source.price)
    assert.equal(creates[0][1].baseSize, 0.1)
    assert.equal(result.openOrders.some((order) => order.orderId === 'original'), false)
    assert.equal(result.openOrders[0].orderId, 'replacement')
    await f.run()
    assert.equal(f.calls.filter(([type]) => type === 'create').length, 1)
  })
}

test('only incremental funds required before cancel, full funds checked after release', async () => {
  const f = fixture({ funds: 5, afterFunds: 10 })
  await f.run()
  assert.equal(f.calls.filter(([type]) => type === 'create').length, 1)
})

for (const options of [{ status: 'PartiallyFilled', filled: 0.01 }, { filled: undefined, status: '' },
  { exactSize: 0.2 }, { price: 101 }, { funds: NaN }]) {
  test(`unsafe preflight preserves source ${JSON.stringify(options)}`, async () => {
    const f = fixture(options)
    await f.run()
    assert.equal(f.calls.some(([type]) => type === 'cancel' || type === 'create'), false)
  })
}

for (const options of [{ failCancel: true }, { cancelStatus: 'PendingCancel' },
  { cancelFilled: 0.01 }, { afterFunds: 0 }]) {
  test(`uncertain cancellation or unavailable funds prevents creation ${JSON.stringify(options)}`, async () => {
    const f = fixture(options)
    const result = await f.run()
    assert.equal(result.handled, true)
    assert.equal(f.calls.some(([type]) => type === 'create'), false)
    assert.ok(result.debug.length)
    assert.ok(f.pending())
  })
}

test('filled during cancellation is handed back, never repurchased', async () => {
  const f = fixture({ cancelStatus: 'Filled', cancelFilled: 0.05 })
  const result = await f.run()
  assert.equal(result.openOrders[0].orderId, 'original')
  assert.equal(f.calls.some(([type]) => type === 'create'), false)
})

test('lost POST response is recovered by client ID after restart without second POST', async () => {
  const f = fixture({ failCreate: true })
  await f.run()
  assert.equal(f.pending().phase, 'submitting')
  const result = await f.run()
  assert.equal(result.openOrders[0].orderId, 'replacement')
  assert.equal(f.calls.filter(([type]) => type === 'create').length, 1)
})

test('unknown POST result keeps recovery blocked even across repeated cycles', async () => {
  const f = fixture({ failCreate: true })
  await f.run()
  f.deps.loadPhemexOrderById = async () => undefined
  for (let i = 0; i < 3; i++) assert.equal((await f.run()).handled, true)
  assert.equal(f.calls.filter(([type]) => type === 'create').length, 1)
})

test('sell replacement rewrites linked buy lock and clears journal only after acknowledgement', async () => {
  const f = fixture({ side: 'sell' })
  f.args.knownOrders.push({ side: 'buy', price: 100, status: 'locked', lockedBySellOrderId: 'original' })
  const result = await f.run()
  assert.equal(result.openOrders.find((order) => order.status === 'locked').lockedBySellOrderId, 'replacement')
  f.args.openOrders = result.created
  f.args.knownOrders = result.openOrders
  assert.equal((await f.run()).handled, false)
  assert.equal(f.pending(), null)
})

test('persistent journal survives recreation and isolates accounts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'grid-size-test-'))
  try {
    await createReplacementJournal(directory).save('account-one', { phase: 'submitting' })
    const journal = createReplacementJournal(directory)
    assert.deepEqual(await journal.load('account-one'), { phase: 'submitting' })
    assert.equal(await journal.load('account-two'), null)
    await journal.remove('account-one')
    assert.equal(await journal.load('account-one'), null)
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    await rm(directory, { recursive: true, force: true })
  }
})

for (const factory of [createPhemexMonitorHandler, createPhemexCreateGridHandler]) {
  test(`${factory.name} integrates replacement without parallel recovery orders`, async () => {
    const f = fixture()
    let result
    const handler = factory({ ...f.deps,
      reconcileOrderSizes: createOrderSizeReconciler(f.deps),
      readRequestJson: async () => ({ ...f.args, lower: 90, upper: 120, grids: 3, useStartAsset: true }),
      sendJson: (_, code, value) => { assert.equal(code, 200); result = value },
      sleep: async () => {}, toPhemexSpotSymbol: (value) => value, normalizeClientOrderId: (value) => value,
    })
    await handler({}, {})
    assert.equal(result.created.length, 1)
    assert.equal(result.created[0].price, 100)
    assert.equal(result.created[0].baseSize, 0.1)
    assert.equal(f.calls.filter(([type]) => type === 'create').length, 1)
    assert.equal(result.openOrders.some((order) => order.orderId === 'original'), false)
  })
}

test('partial remainder of a larger original order is not topped up', async () => {
  const f = fixture({ size: 0.2, status: 'PartiallyFilled', filled: 0.19 })
  assert.equal((await f.run()).handled, false)
  assert.deepEqual(f.calls, [])
})

test('several orders at one level are not canceled or duplicated', async () => {
  const f = fixture()
  f.args.openOrders.push({ ...f.source, orderId: 'second', baseSize: 0.2 })
  assert.equal((await f.run()).handled, false)
  assert.deepEqual(f.calls, [])
})

test('order outside configured levels is untouched', async () => {
  const f = fixture()
  f.args.levels = [90, 110, 120]
  assert.equal((await f.run()).handled, false)
  assert.deepEqual(f.calls, [])
})

test('moved order is not canceled based on an old price snapshot', async () => {
  const f = fixture()
  const load = f.deps.loadPhemexOrderById
  f.deps.loadPhemexOrderById = async (args) => ({ ...await load(args), priceEp: 9900000000 })
  await f.run()
  assert.equal(f.calls.some(([type]) => type === 'cancel'), false)
})

test('uncertain cancel remains journaled if funds subsequently disappear', async () => {
  const f = fixture({ failCancel: true })
  await f.run()
  f.deps.loadPhemexBalance = async () => 0
  assert.equal((await f.run()).handled, true)
  assert.equal(f.pending().cancelRequested, true)
  assert.equal(f.calls.some(([type]) => type === 'create'), false)
})
