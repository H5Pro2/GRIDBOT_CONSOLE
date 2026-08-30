function isGridBotOrder(order) {
  return String(order.clientOrderId || '').startsWith('gb2-')
}

function hasOpenOrder({ side, price, baseSize }, openOrders) {
  return openOrders.some((order) =>
    order.side === side
    && Math.abs(order.price - price) <= 0.0001
    && (order.baseSize <= 0 || Math.abs(order.baseSize - baseSize) <= 0.00000001),
  )
}

function sameGridOrder(left, right) {
  return left.side === right.side
    && Math.abs(left.price - right.price) <= 0.0001
    && (left.baseSize <= 0 || right.baseSize <= 0 || Math.abs(left.baseSize - right.baseSize) <= 0.00000001)
}

function hasCycleSellOrder({ price, baseSize }, gridSpacing, openOrders) {
  const sellPrice = Math.round((price + gridSpacing) * 100000000) / 100000000
  return hasOpenOrder({ side: 'sell', price: sellPrice, baseSize }, openOrders)
}

function findNextGridLevel(price, levels) {
  return levels.find((level) => level > price + 0.0001)
}

function normalizeKnownOrders(orders) {
  if (!Array.isArray(orders)) return []
  return orders
    .map((order) => ({
      orderId: String(order?.orderId || ''),
      clientOrderId: String(order?.clientOrderId || ''),
      side: String(order?.side || '').toLowerCase(),
      status: String(order?.status || ''),
      lockedBySellPrice: Number(order?.lockedBySellPrice),
      lockedBySellOrderId: String(order?.lockedBySellOrderId || ''),
      price: Number(order?.price),
      baseSize: Number(order?.baseSize),
    }))
    .filter((order) => (order.side === 'buy' || order.side === 'sell') && Number.isFinite(order.price) && order.price > 0)
}

function buildGridLevels({ lower, upper, grids }) {
  if (!Number.isFinite(lower) || lower < 0) throw new Error('Grid unten ist ungueltig.')
  if (!Number.isFinite(upper) || upper <= lower) throw new Error('Grid oben ist ungueltig.')
  if (!Number.isInteger(grids) || grids < 2) throw new Error('Anzahl Grids ist ungueltig.')
  const step = (upper - lower) / grids
  return Array.from({ length: grids + 1 }, (_, index) => Math.round((lower + step * index) * 100000000) / 100000000)
}

function buildGridOrder({ side, price, orderSize }) {
  return {
    side,
    price,
    baseSize: orderSize,
    quoteSize: Math.round(price * orderSize * 100000000) / 100000000,
  }
}

export function createPhemexMonitorHandler({
  readRequestJson,
  sendJson,
  sleep,
  normalizeClientOrderId,
  toPhemexSpotSymbol,
  loadPhemexLastPrice,
  loadPhemexBalance,
  loadPhemexOpenOrders,
  createPhemexLimitOrder,
}) {
  return async function handlePhemexMonitor(request, response) {
    try {
      const body = await readRequestJson(request)
      const key = String(body.key || '').trim()
      const secret = String(body.secret || '').trim()
      const baseAsset = String(body.baseAsset || '').trim().toUpperCase()
      const quoteAsset = String(body.quoteAsset || '').trim().toUpperCase()
      const displaySymbol = String(body.symbol || `${baseAsset}${quoteAsset}`).trim().toUpperCase()
      const lower = Number(body.lower)
      const upper = Number(body.upper)
      const grids = Number(body.grids)
      const orderSize = Number(body.orderSize)
      const useStartAsset = Boolean(body.useStartAsset)
      const knownOrders = normalizeKnownOrders(body.knownOrders)

      if (!key || !secret) throw new Error('Phemex Key und Secret fehlen.')
      if (!baseAsset || !quoteAsset || !displaySymbol) throw new Error('Asset und Quote eintragen.')
      if (!Number.isFinite(orderSize) || orderSize <= 0) throw new Error('Asset-Menge ist ungueltig.')

      const symbol = toPhemexSpotSymbol(displaySymbol)
      const [livePrice, baseBalance, quoteBalance, openOrders] = await Promise.all([
        loadPhemexLastPrice({ symbol }),
        loadPhemexBalance({ key, secret, currency: baseAsset }),
        loadPhemexBalance({ key, secret, currency: quoteAsset }),
        loadPhemexOpenOrders({ key, secret, symbol }),
      ])
      const gridOrders = openOrders.filter(isGridBotOrder)
      const created = []
      const blocked = []
      const levels = buildGridLevels({ lower, upper, grids })
      const createIdSeed = Date.now().toString(36)
      const gridSpacing = (upper - lower) / grids
      const minimumPriceDistance = gridSpacing * 0.25
      const existingLockedCycles = knownOrders
        .filter((order) => order.side === 'buy' && (order.status === 'locked' || order.status === 'locked-pending'))
        .map((order) => ({
          ...order,
          targetSellPrice: Number.isFinite(order.lockedBySellPrice)
            ? order.lockedBySellPrice
            : findNextGridLevel(order.price, levels),
        }))
        .filter((order) => Number.isFinite(order.targetSellPrice))
        .filter((order) =>
          order.status === 'locked-pending'
          || hasOpenOrder({ side: 'sell', price: order.targetSellPrice, baseSize: order.baseSize || orderSize }, gridOrders),
        )
      const filledBuyOrders = knownOrders
        .filter((order) => order.side === 'buy' && order.status !== 'locked')
        .filter((knownOrder) => !gridOrders.some((openOrder) => sameGridOrder(knownOrder, openOrder)))
        .map((order) => ({
          ...order,
          targetSellPrice: findNextGridLevel(order.price, levels),
        }))
        .filter((order) => Number.isFinite(order.targetSellPrice))
      const lockedBuyCycles = [...existingLockedCycles, ...filledBuyOrders]

      const buyOrderBlock = {
        reservedQuote: 0,
        missingOrders: levels
          .slice(0, -1)
          .filter((price) => price < livePrice)
          .sort((left, right) => left - right)
          .map((price) => buildGridOrder({ side: 'buy', price, orderSize }))
          .filter((order) => !hasOpenOrder(order, gridOrders))
          .filter((order) => !hasCycleSellOrder(order, gridSpacing, gridOrders))
          .filter((order) => !lockedBuyCycles.some((lockedOrder) => Math.abs(lockedOrder.price - order.price) <= 0.0001)),
      }
      const sellOrderBlock = {
        reservedBase: 0,
        filledBuyTargets: lockedBuyCycles
          .map((order) => ({
            ...buildGridOrder({ side: 'sell', price: order.targetSellPrice, orderSize: order.baseSize || orderSize }),
            sourceBuyPrice: order.price,
          }))
          .filter((order) => !hasOpenOrder(order, gridOrders)),
        startAssetTargets: useStartAsset
          ? levels
            .slice(1)
            .filter((price) => price > livePrice)
            .filter((price) => !lockedBuyCycles.some((order) => Math.abs(order.price - price) <= 0.0001))
            .sort((left, right) => left - right)
            .map((price) => buildGridOrder({ side: 'sell', price, orderSize }))
            .filter((order) => !hasOpenOrder(order, gridOrders))
          : [],
      }

      // Buy-Order-Pruefblock
      const missingBuyOrders = buyOrderBlock.missingOrders
      for (let index = 0; index < missingBuyOrders.length; index += 1) {
        const order = missingBuyOrders[index]
        if (Math.abs(livePrice - order.price) < minimumPriceDistance) {
          blocked.push({ side: order.side, price: order.price, reason: 'Hold: Preis zu nah am Live-Preis.' })
          continue
        }
        if (quoteBalance - buyOrderBlock.reservedQuote + 0.00000001 < order.quoteSize) {
          blocked.push({ side: order.side, price: order.price, reason: 'Quote-Guthaben reicht nicht.' })
          continue
        }

        const clientOrderId = normalizeClientOrderId(`gb2-monitor-buy-${createIdSeed}-${index}`)
        if (created.length > 0) await sleep(600)
        const createdOrder = await createPhemexLimitOrder({
          key,
          secret,
          symbol,
          side: order.side,
          price: order.price,
          baseSize: order.baseSize,
          clientOrderId,
        })
        buyOrderBlock.reservedQuote += order.quoteSize
        created.push({
          orderId: String(createdOrder.orderID ?? createdOrder.orderId ?? createdOrder.id ?? ''),
          side: order.side,
          price: order.price,
          baseSize: order.baseSize,
          quoteSize: order.quoteSize,
          clientOrderId,
        })
      }

      // Sell-Order-Pruefblock
      const missingSellOrders = [
        ...sellOrderBlock.filledBuyTargets,
        ...sellOrderBlock.startAssetTargets.filter((order) =>
          !sellOrderBlock.filledBuyTargets.some((targetOrder) => sameGridOrder(targetOrder, order)),
        ),
      ]
      for (let index = 0; index < missingSellOrders.length; index += 1) {
        const order = missingSellOrders[index]
        if (Math.abs(livePrice - order.price) < minimumPriceDistance) {
          blocked.push({ side: order.side, price: order.price, reason: 'Hold: Preis zu nah am Live-Preis.' })
          continue
        }
        if (baseBalance - sellOrderBlock.reservedBase + 0.00000001 < order.baseSize) {
          blocked.push({ side: order.side, price: order.price, reason: 'Asset-Guthaben reicht nicht.' })
          continue
        }

        const clientOrderId = normalizeClientOrderId(`gb2-monitor-sell-${createIdSeed}-${index}`)
        if (created.length > 0) await sleep(600)
        const createdOrder = await createPhemexLimitOrder({
          key,
          secret,
          symbol,
          side: order.side,
          price: order.price,
          baseSize: order.baseSize,
          clientOrderId,
        })
        sellOrderBlock.reservedBase += order.baseSize
        created.push({
          orderId: String(createdOrder.orderID ?? createdOrder.orderId ?? createdOrder.id ?? ''),
          side: order.side,
          price: order.price,
          baseSize: order.baseSize,
          quoteSize: order.quoteSize,
          clientOrderId,
          sourceBuyPrice: order.sourceBuyPrice,
        })
      }
      const sellOrdersAfterCreate = [...gridOrders, ...created].filter((order) => order.side === 'sell')
      const lockedOrders = lockedBuyCycles
        .map((order) => ({
          orderId: '',
          clientOrderId: order.clientOrderId,
          side: 'buy',
          status: hasOpenOrder({ side: 'sell', price: order.targetSellPrice, baseSize: order.baseSize || orderSize }, sellOrdersAfterCreate)
            ? 'locked'
            : 'locked-pending',
          price: order.price,
          baseSize: order.baseSize || orderSize,
          lockedBySellPrice: order.targetSellPrice,
          lockedBySellOrderId: sellOrdersAfterCreate.find((sellOrder) =>
            sellOrder.side === 'sell'
            && Math.abs(sellOrder.price - order.targetSellPrice) <= 0.0001
            && (sellOrder.baseSize <= 0 || Math.abs(sellOrder.baseSize - (order.baseSize || orderSize)) <= 0.00000001),
          )?.orderId ?? '',
        }))
      const currentOrders = [...gridOrders, ...created, ...lockedOrders]

      sendJson(response, 200, {
        message: 'Überwachung aktualisiert',
        symbol,
        livePrice,
        balances: { base: baseBalance, quote: quoteBalance },
        openOrders: currentOrders,
        created,
        blocked,
        buyOrders: currentOrders.filter((order) => order.side === 'buy').length,
        sellOrders: currentOrders.filter((order) => order.side === 'sell').length,
      })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'Überwachung fehlgeschlagen.' })
    }
  }
}
