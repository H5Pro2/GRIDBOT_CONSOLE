function hasOpenOrder({ side, price, baseSize }, openOrders) {
  return openOrders.some((order) =>
    order.side === side
    && Math.abs(order.price - price) <= 0.0001
    && (order.baseSize <= 0 || Math.abs(order.baseSize - baseSize) <= 0.00000001),
  )
}

function hasCycleSellOrder({ price, baseSize }, gridSpacing, openOrders) {
  const sellPrice = Math.round((price + gridSpacing) * 100000000) / 100000000
  return hasOpenOrder({ side: 'sell', price: sellPrice, baseSize }, openOrders)
}

function buildGridLevels({ lower, upper, grids }) {
  if (!Number.isFinite(lower) || lower < 0) throw new Error('Grid unten ist ungueltig.')
  if (!Number.isFinite(upper) || upper <= lower) throw new Error('Grid oben ist ungueltig.')
  if (!Number.isInteger(grids) || grids < 2) throw new Error('Anzahl Grids ist ungueltig.')
  const step = (upper - lower) / grids
  return Array.from({ length: grids + 1 }, (_, index) => Math.round((lower + step * index) * 100000000) / 100000000)
}

export function createPhemexCreateGridHandler({
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
  return async function handlePhemexCreateGrid(request, response) {
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

      if (!key || !secret) throw new Error('Phemex Key und Secret fehlen.')
      if (!baseAsset || !quoteAsset || !displaySymbol) throw new Error('Asset und Quote eintragen.')
      if (!Number.isFinite(orderSize) || orderSize <= 0) throw new Error('Asset-Menge ist ungueltig.')

      const symbol = toPhemexSpotSymbol(displaySymbol)
      const levels = buildGridLevels({ lower, upper, grids })
      const [livePrice, baseBalance, quoteBalance, openOrders] = await Promise.all([
        loadPhemexLastPrice({ symbol }),
        loadPhemexBalance({ key, secret, currency: baseAsset }),
        loadPhemexBalance({ key, secret, currency: quoteAsset }),
        loadPhemexOpenOrders({ key, secret, symbol }),
      ])

      let reservedBase = 0
      let reservedQuote = 0
      const created = []
      const blocked = []
      const skipped = []
      const createIdSeed = Date.now().toString(36)
      const gridSpacing = (upper - lower) / grids
      const minimumPriceDistance = gridSpacing * 0.25

      const plannedOrders = levels
        .filter((price) => price !== livePrice)
        .map((price) => ({
          side: price < livePrice ? 'buy' : 'sell',
          price,
          baseSize: orderSize,
          quoteSize: Math.round(price * orderSize * 100000000) / 100000000,
        }))

      for (let index = 0; index < plannedOrders.length; index += 1) {
        const order = plannedOrders[index]
        if (Math.abs(livePrice - order.price) < minimumPriceDistance) {
          blocked.push({ side: order.side, price: order.price, reason: 'Hold: Preis zu nah am Live-Preis.' })
          continue
        }
        if (hasOpenOrder(order, openOrders)) {
          skipped.push({ side: order.side, price: order.price, reason: 'Offene Order existiert bereits.' })
          continue
        }
        if (order.side === 'buy' && hasCycleSellOrder(order, gridSpacing, openOrders)) {
          skipped.push({ side: order.side, price: order.price, reason: 'Zugehoerige Sell-Order ist bereits offen.' })
          continue
        }
        if (order.side === 'buy' && quoteBalance - reservedQuote + 0.00000001 < order.quoteSize) {
          blocked.push({ side: order.side, price: order.price, reason: 'Quote-Guthaben reicht nicht.' })
          continue
        }
        if (order.side === 'sell' && !useStartAsset) {
          blocked.push({ side: order.side, price: order.price, reason: 'Start-Asset nicht aktiviert.' })
          continue
        }
        if (order.side === 'sell' && baseBalance - reservedBase + 0.00000001 < order.baseSize) {
          blocked.push({ side: order.side, price: order.price, reason: 'Asset-Guthaben reicht nicht.' })
          continue
        }

        const clientOrderId = normalizeClientOrderId(`gb2-${order.side}-${createIdSeed}-${index}`)
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
        if (order.side === 'buy') reservedQuote += order.quoteSize
        if (order.side === 'sell') reservedBase += order.baseSize
        created.push({
          orderId: String(createdOrder.orderID ?? createdOrder.orderId ?? createdOrder.id ?? ''),
          side: order.side,
          price: order.price,
          baseSize: order.baseSize,
          quoteSize: order.quoteSize,
          clientOrderId,
        })
      }

      sendJson(response, 200, {
        message: 'Grid wurde erstellt',
        symbol,
        livePrice,
        balances: { base: baseBalance, quote: quoteBalance },
        created,
        skipped,
        blocked,
        buyOrders: created.filter((order) => order.side === 'buy').length,
        sellOrders: created.filter((order) => order.side === 'sell').length,
      })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'Grid konnte nicht erstellt werden.' })
    }
  }
}
