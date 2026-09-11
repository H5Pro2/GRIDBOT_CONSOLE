import { filledSize } from './orderSizeReconciliation.mjs'
import { openMonitorState } from './monitorState.mjs'

function isGridBotOrder(order) {
  return String(order.clientOrderId || '').startsWith('gb2-')
}

function hasOpenOrder({ side, price }, openOrders) {
  return openOrders.some((order) =>
    order.side === side
    && Math.abs(order.price - price) <= 0.0001,
  )
}

function sameGridOrder(left, right) {
  return left.side === right.side
    && Math.abs(left.price - right.price) <= 0.0001
}

function hasCycleSellOrder({ price, baseSize }, gridSpacing, openOrders) {
  const sellPrice = Math.round((price + gridSpacing) * 100000000) / 100000000
  return hasOpenOrder({ side: 'sell', price: sellPrice, baseSize }, openOrders)
}

function findNextGridLevel(price, levels) {
  return levels.find((level) => level > price + 0.0001)
}

function isFilledOrderStatus(status) {
  return String(status || '').toLowerCase() === 'filled'
}

function isCanceledOrderStatus(status) {
  return String(status || '').toLowerCase() === 'canceled'
}

function getOrderStatus(order) {
  return String(order?.ordStatus || order?.orderStatus || order?.status || '')
}

function orderLevelKey(order) {
  return [
    order.side,
    Number(order.price).toFixed(8),
    Number(order.lockedBySellPrice || 0).toFixed(8),
  ].join('|')
}

function dedupeOrdersByLevel(orders) {
  const levels = new Map()
  for (const order of orders) {
    const key = orderLevelKey(order)
    if (!levels.has(key)) levels.set(key, order)
  }
  return [...levels.values()]
}

function normalizeKnownOrders(orders) {
  if (!Array.isArray(orders)) return []
  return dedupeOrdersByLevel(orders
    .map((order) => ({
      orderId: String(order?.orderId || ''),
      clientOrderId: String(order?.clientOrderId || ''),
      side: String(order?.side || '').toLowerCase(),
      status: String(order?.status || ''),
      lockedBySellPrice: Number(order?.lockedBySellPrice),
      lockedBySellOrderId: String(order?.lockedBySellOrderId || ''),
      sourceBuyPrice: order?.sourceBuyPrice == null ? undefined : Number(order.sourceBuyPrice),
      sourceBuyOrderId: String(order?.sourceBuyOrderId || ''),
      price: Number(order?.price),
      baseSize: Number(order?.baseSize),
    }))
    .filter((order) => (order.side === 'buy' || order.side === 'sell') && Number.isFinite(order.price) && order.price > 0))
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
  mode = 'monitor',
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
  reconcileOrderSizes,
  monitorJournal,
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
      let knownOrders = normalizeKnownOrders(body.knownOrders)
      const debug = []

      if (!key || !secret) throw new Error('Phemex Key und Secret fehlen.')
      if (!baseAsset || !quoteAsset || !displaySymbol) throw new Error('Asset und Quote eintragen.')
      if (!Number.isFinite(orderSize) || orderSize <= 0) throw new Error('Asset-Menge ist ungueltig.')

      const symbol = toPhemexSpotSymbol(displaySymbol)
      if (monitorJournal && !body.botId) throw new Error('Bot-ID fehlt. Bitte die Konsole neu laden.')
      const monitorState = monitorJournal ? await openMonitorState({
        journal: monitorJournal, account: `${key}:${symbol}:${body.botId}`,
        initialOrders: knownOrders, auth: { key, secret, symbol },
        loadPhemexOrderById, createPhemexLimitOrder,
      }) : null
      if (monitorState) knownOrders = normalizeKnownOrders(monitorState.orders)
      const submitOrder = monitorState ? monitorState.submit : createPhemexLimitOrder
      const [livePrice, baseBalance, quoteBalance, openOrders] = await Promise.all([
        loadPhemexLastPrice({ symbol }),
        loadPhemexBalance({ key, secret, currency: baseAsset }),
        loadPhemexBalance({ key, secret, currency: quoteAsset }),
        loadPhemexOpenOrders({ key, secret, symbol }),
      ])
      const levels = buildGridLevels({ lower, upper, grids })
      const gridOrders = openOrders.filter((order) => isGridBotOrder(order)
        || levels.some((price) => Math.abs(order.price - price) <= 0.0001))
      const created = []
      const blocked = []
      const createIdSeed = Date.now().toString(36)
      const gridSpacing = (upper - lower) / grids
      const minimumPriceDistance = gridSpacing * 0.25
      if (reconcileOrderSizes) {
        const resized = await reconcileOrderSizes({ key, secret, symbol, baseAsset, quoteAsset, levels,
          orderSize, minimumPriceDistance, openOrders: gridOrders, knownOrders })
        debug.push(...resized.debug)
        blocked.push(...resized.debug.filter((entry) => entry.type === 'size-mismatch'))
        if (resized.handled) {
          await monitorState?.checkpoint(resized.openOrders)
          // Do not spend stale balances or run recovery during a replacement transaction.
          const [currentBase, currentQuote] = await Promise.all([
            loadPhemexBalance({ key, secret, currency: baseAsset }),
            loadPhemexBalance({ key, secret, currency: quoteAsset }),
          ])
          sendJson(response, 200, {
            message: 'Ordergröße wird abgeglichen', symbol, livePrice,
            balances: { base: currentBase, quote: currentQuote },
            openOrders: resized.openOrders, created: resized.created, blocked, debug,
            debugSummary: { livePrice, openOrders: gridOrders.length, knownOrders: knownOrders.length,
              locked: resized.openOrders.filter((order) => order.status?.startsWith('locked')).length,
              missingKnownOrders: 0, unresolved: resized.created.length ? 0 : 1,
              created: resized.created.length, blocked: blocked.length },
            buyOrders: resized.openOrders.filter((order) => order.side === 'buy').length,
            sellOrders: resized.openOrders.filter((order) => order.side === 'sell').length,
          })
          return
        }
      }
      const missingKnownOrders = knownOrders.filter((knownOrder) =>
        knownOrder.orderId
        && !knownOrder.status.startsWith('locked')
        && !gridOrders.some((openOrder) => sameGridOrder(knownOrder, openOrder)),
      )
      const knownLockedOrders = knownOrders.filter((order) =>
        order.side === 'buy'
        && (order.status === 'locked' || order.status === 'locked-pending')
        && !gridOrders.some((sell) => sell.side === 'sell' && (order.lockedBySellOrderId
          ? sell.orderId === order.lockedBySellOrderId
          : Math.abs(sell.price - order.lockedBySellPrice) <= 0.0001)),
      )
      const statusEntries = await Promise.all(missingKnownOrders.map(async (order) => {
        try {
          return [order.orderId, await loadPhemexOrderById({
            key,
            secret,
            symbol,
            orderId: order.orderId,
            clientOrderId: order.clientOrderId,
          })]
        } catch (error) {
          debug.push({
            type: 'status-error',
            side: order.side,
            price: order.price,
            orderId: order.orderId,
            reason: error instanceof Error ? error.message : 'Phemex Status konnte nicht gelesen werden.',
          })
          return [order.orderId, undefined]
        }
      }))
      const missingOrderStatusById = new Map(statusEntries)
      const lockedStatusEntries = await Promise.all(knownLockedOrders.map(async (order) => {
        try {
          return [orderLevelKey(order), await loadPhemexOrderById({
            key,
            secret,
            symbol,
            orderId: order.orderId,
            clientOrderId: order.clientOrderId,
          })]
        } catch (error) {
          debug.push({
            type: 'status-error',
            side: order.side,
            price: order.price,
            reason: error instanceof Error ? error.message : 'Phemex Sperrstatus konnte nicht gelesen werden.',
          })
          return [orderLevelKey(order), undefined]
        }
      }))
      const lockedStatusByLevel = new Map(lockedStatusEntries)
      const sellStatusById = new Map(await Promise.all(knownLockedOrders
        .filter((order) => order.lockedBySellOrderId)
        .map(async (order) => {
          const id = order.lockedBySellOrderId
          if (missingOrderStatusById.has(id)) return [id, missingOrderStatusById.get(id)]
          try {
            return [id, await loadPhemexOrderById({ key, secret, symbol, orderId: id })]
          } catch (error) {
            debug.push({ type: 'status-error', side: 'sell', price: order.lockedBySellPrice, orderId: id, reason: error instanceof Error ? error.message : 'Sell-Status unbekannt.' })
            return [id, undefined]
          }
        })))
      const existingLockedCycles = knownOrders
        .filter((order) => order.side === 'buy' && (order.status === 'locked' || order.status === 'locked-pending'))
        .map((order) => ({
          ...order,
          targetSellPrice: Number.isFinite(order.lockedBySellPrice)
            ? order.lockedBySellPrice
            : findNextGridLevel(order.price, levels),
        }))
        .filter((order) => Number.isFinite(order.targetSellPrice))
        .filter((order) => !isFilledOrderStatus(getOrderStatus(sellStatusById.get(order.lockedBySellOrderId))))
        // An unavailable status is not proof that the purchased asset was sold.
        .filter((order) => order.orderId || order.lockedBySellOrderId)
      const filledBuyOrders = missingKnownOrders
        .filter((order) => order.side === 'buy' && !order.status.startsWith('locked'))
        .filter((order) => isFilledOrderStatus(getOrderStatus(missingOrderStatusById.get(order.orderId))))
        .map((order) => ({
          ...order,
          baseSize: filledSize(missingOrderStatusById.get(order.orderId)) > 0
            ? filledSize(missingOrderStatusById.get(order.orderId))
            : Number(missingOrderStatusById.get(order.orderId)?.baseQtyEv) > 0
              ? Number(missingOrderStatusById.get(order.orderId).baseQtyEv) / 100000000
              : order.baseSize,
          targetSellPrice: findNextGridLevel(order.price, levels),
        }))
        .filter((order) => Number.isFinite(order.targetSellPrice))
      const unresolvedBuyOrders = missingKnownOrders
        .filter((order) => order.side === 'buy')
        .filter((order) => {
          const status = getOrderStatus(missingOrderStatusById.get(order.orderId))
          return !isFilledOrderStatus(status) && !isCanceledOrderStatus(status)
        })
      for (const order of unresolvedBuyOrders) {
        debug.push({
          type: 'buy-blocked',
          side: order.side,
          price: order.price,
          status: getOrderStatus(missingOrderStatusById.get(order.orderId)) || 'unbekannt',
          reason: 'Buy nicht nachgesetzt: Status der verschwundenen Order ist nicht Filled.',
        })
      }
      const lockedBuyCycles = [...existingLockedCycles, ...filledBuyOrders]
      const cycleTargets = new Set()
      for (const cycle of lockedBuyCycles) {
        const target = cycle.targetSellPrice.toFixed(8)
        if (cycleTargets.has(target)) throw new Error(`Mehrdeutige Kaufzyklen für Sell-Level ${cycle.targetSellPrice}. Keine neuen Orders gesetzt.`)
        cycleTargets.add(target)
      }
      for (const cycle of lockedBuyCycles) {
        if (!cycle.lockedBySellOrderId && knownLockedOrders.some((order) => orderLevelKey(order) === orderLevelKey(cycle))
          && !isFilledOrderStatus(getOrderStatus(lockedStatusByLevel.get(orderLevelKey(cycle))))) {
          cycle.sellUnresolved = true
          continue
        }
        if (hasOpenOrder({ side: 'sell', price: cycle.targetSellPrice, baseSize: cycle.baseSize || orderSize }, gridOrders)) continue
        const previousSellStatus = getOrderStatus(sellStatusById.get(cycle.lockedBySellOrderId))
        cycle.sellUnresolved = Boolean(cycle.lockedBySellOrderId && !isCanceledOrderStatus(previousSellStatus))
        if (cycle.sellUnresolved || cycle.targetSellPrice > livePrice) continue
        const higherTarget = levels.find((price) => price > cycle.targetSellPrice
          && price - livePrice >= minimumPriceDistance
          && !openOrders.some((order) => Math.abs(order.price - price) <= 0.0001)
          && !lockedBuyCycles.some((other) => other !== cycle
            && (Math.abs(other.targetSellPrice - price) <= 0.0001 || Math.abs(other.price - price) <= 0.0001)))
        if (higherTarget !== undefined) {
          debug.push({ type: 'sell-retargeted', side: 'sell', price: higherTarget, reason: `Sell-Ziel von ${cycle.targetSellPrice} auf ${higherTarget} angehoben; Kaufbereich ${cycle.price} bleibt gesperrt.` })
          cycle.targetSellPrice = higherTarget
          cycle.lockedBySellOrderId = ''
        }
      }

      const cycleLocks = () => lockedBuyCycles.map((order) => ({
        orderId: order.orderId, clientOrderId: order.clientOrderId, side: 'buy',
        status: 'locked-pending', price: order.price, baseSize: order.baseSize || orderSize,
        lockedBySellPrice: order.targetSellPrice, lockedBySellOrderId: order.lockedBySellOrderId || '',
      }))
      await monitorState?.checkpoint([...gridOrders, ...unresolvedBuyOrders, ...cycleLocks()])
      for (const lock of cycleLocks()) {
        debug.push({ type: 'buy-blocked', side: 'buy', price: lock.price,
          reason: lock.lockedBySellOrderId
            ? `Kaufzyklus gesperrt bis Sell ${lock.lockedBySellPrice}, ID ${lock.lockedBySellOrderId}, bestätigt ausgeführt ist.`
            : `Kaufzyklus gesperrt: Sell-Ziel ${lock.lockedBySellPrice} hat noch keine bestätigte Order-ID.` })
      }

      const buyOrderBlock = {
        reservedQuote: 0,
        missingOrders: levels
          .slice(0, -1)
          .filter((price) => price < livePrice)
          .sort((left, right) => mode === 'create' ? left - right : right - left)
          .map((price) => buildGridOrder({ side: 'buy', price, orderSize }))
          .filter((order) => !hasOpenOrder(order, openOrders))
          .filter((order) => !hasOpenOrder({ side: 'sell', price: order.price }, openOrders))
          .filter((order) => !hasCycleSellOrder(order, gridSpacing, openOrders))
          .filter((order) => !lockedBuyCycles.some((lockedOrder) => Math.abs(lockedOrder.price - order.price) <= 0.0001))
          .filter((order) => !lockedBuyCycles.some((lockedOrder) => Math.abs(lockedOrder.targetSellPrice - order.price) <= 0.0001))
          .filter((order) => !unresolvedBuyOrders.some((missingOrder) => Math.abs(missingOrder.price - order.price) <= 0.0001)),
      }
      const sellOrderBlock = {
        reservedBase: 0,
        filledBuyTargets: lockedBuyCycles
          .filter((order) => !order.sellUnresolved)
          .map((order) => ({
            ...buildGridOrder({ side: 'sell', price: order.targetSellPrice, orderSize: order.baseSize || orderSize }),
            sourceBuyPrice: order.price,
            sourceBuyOrderId: order.orderId,
          }))
          .filter((order) => !hasOpenOrder(order, openOrders)),
        startAssetTargets: useStartAsset
          ? levels
            .slice(1)
            .filter((price) => price > livePrice)
            .filter((price) => !lockedBuyCycles.some((order) => Math.abs(order.price - price) <= 0.0001 || Math.abs(order.targetSellPrice - price) <= 0.0001))
            .sort((left, right) => left - right)
            .map((price) => buildGridOrder({ side: 'sell', price, orderSize }))
            .filter((order) => !hasOpenOrder(order, openOrders))
            .filter((order) => !hasOpenOrder({ side: 'buy', price: order.price }, openOrders))
          : [],
      }

      // Buy-Order-Pruefblock
      const missingBuyOrders = buyOrderBlock.missingOrders
      for (let index = 0; index < missingBuyOrders.length; index += 1) {
        const order = missingBuyOrders[index]
        if (created.length > 0) await sleep(600)
        const currentBuyPrice = await loadPhemexLastPrice({ symbol })
        if (!Number.isFinite(currentBuyPrice) || currentBuyPrice <= 0 || currentBuyPrice - order.price < minimumPriceDistance) {
          blocked.push({ side: order.side, price: order.price, reason: 'Hold: Preis zu nah am Live-Preis.' })
          debug.push({ type: 'buy-blocked', side: order.side, price: order.price, reason: 'Preis zu nah am Live-Preis.' })
          continue
        }
        if (quoteBalance - buyOrderBlock.reservedQuote + 0.00000001 < order.quoteSize) {
          blocked.push({ side: order.side, price: order.price, reason: 'Quote-Guthaben reicht nicht.' })
          debug.push({ type: 'buy-blocked', side: order.side, price: order.price, reason: 'Quote-Guthaben reicht nicht.' })
          continue
        }

        const clientOrderId = normalizeClientOrderId(`gb2-monitor-buy-${createIdSeed}-${index}`)
        const createdOrder = await submitOrder({
          key,
          secret,
          symbol,
          side: order.side,
          price: order.price,
          baseSize: order.baseSize,
          clientOrderId,
        })
        buyOrderBlock.reservedQuote += order.quoteSize
        debug.push({ type: 'buy-created', side: order.side, price: order.price, reason: 'Buy-Order gesetzt.' })
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
        if (!Number.isFinite(order.sourceBuyPrice) && [...openOrders, ...created].some((existing) => existing.side === 'buy' && Math.abs(existing.price - (order.price - gridSpacing)) <= 0.0001)) continue
        if (created.length > 0) await sleep(600)
        const currentSellPrice = await loadPhemexLastPrice({ symbol })
        if (!Number.isFinite(currentSellPrice) || currentSellPrice <= 0 || order.price - currentSellPrice < minimumPriceDistance) {
          blocked.push({ side: order.side, price: order.price, reason: 'Hold: Sell-Ziel liegt unter oder zu nah am aktuellen Preis.' })
          debug.push({ type: 'sell-blocked', side: order.side, price: order.price, reason: 'Sell-Ziel liegt unter oder zu nah am aktuellen Preis.' })
          continue
        }
        if (baseBalance - sellOrderBlock.reservedBase + 0.00000001 < order.baseSize) {
          blocked.push({ side: order.side, price: order.price, reason: 'Asset-Guthaben reicht nicht.' })
          debug.push({ type: 'sell-blocked', side: order.side, price: order.price, reason: 'Asset-Guthaben reicht nicht.' })
          continue
        }

        const clientOrderId = normalizeClientOrderId(`gb2-monitor-sell-${createIdSeed}-${index}`)
        const createdOrder = await submitOrder({
          key,
          secret,
          symbol,
          side: order.side,
          price: order.price,
          baseSize: order.baseSize,
          clientOrderId,
          sourceBuyPrice: order.sourceBuyPrice,
          sourceBuyOrderId: order.sourceBuyOrderId,
        })
        sellOrderBlock.reservedBase += order.baseSize
        debug.push({ type: 'sell-created', side: order.side, price: order.price, reason: 'Sell-Order gesetzt.' })
        created.push({
          orderId: String(createdOrder.orderID ?? createdOrder.orderId ?? createdOrder.id ?? ''),
          side: order.side,
          price: order.price,
          baseSize: order.baseSize,
          quoteSize: order.quoteSize,
          clientOrderId,
          sourceBuyPrice: order.sourceBuyPrice,
          sourceBuyOrderId: order.sourceBuyOrderId,
        })
      }
      const sellOrdersAfterCreate = [...gridOrders, ...created].filter((order) => order.side === 'sell')
      const sellForCycle = (cycle) => sellOrdersAfterCreate.find((sell) => cycle.lockedBySellOrderId
        ? sell.orderId === cycle.lockedBySellOrderId
          || (sell.sourceBuyOrderId && sell.sourceBuyOrderId === cycle.orderId)
        : Math.abs(sell.price - cycle.targetSellPrice) <= 0.0001)
      const lockedOrders = lockedBuyCycles
        .map((order) => ({
          orderId: order.orderId,
          clientOrderId: order.clientOrderId,
          side: 'buy',
          status: sellForCycle(order)
            ? 'locked'
            : 'locked-pending',
          price: order.price,
          baseSize: order.baseSize || orderSize,
          lockedBySellPrice: order.targetSellPrice,
          lockedBySellOrderId: sellForCycle(order)?.orderId ?? order.lockedBySellOrderId ?? '',
        }))
      const currentOrders = [...gridOrders, ...created, ...lockedOrders, ...unresolvedBuyOrders]
      for (const sell of sellOrdersAfterCreate) {
        if (lockedOrders.some((lock) => lock.lockedBySellOrderId === sell.orderId || Math.abs(lock.lockedBySellPrice - sell.price) <= 0.0001)) continue
        const index = levels.findIndex((price) => Math.abs(price - sell.price) <= 0.0001)
        if (index <= 0 || !sell.orderId) continue
        const buyPrice = levels[index - 1]
        if (currentOrders.some((order) => order.side === 'buy' && Math.abs(order.price - buyPrice) <= 0.0001)) continue
        currentOrders.push({ side: 'buy', price: buyPrice, baseSize: sell.baseSize || orderSize, status: 'locked', lockedBySellPrice: sell.price, lockedBySellOrderId: sell.orderId })
      }
      const debugSummary = {
        livePrice,
        openOrders: gridOrders.length,
        knownOrders: knownOrders.length,
        locked: lockedOrders.length,
        missingKnownOrders: missingKnownOrders.length,
        unresolved: unresolvedBuyOrders.length,
        created: created.length,
        blocked: blocked.length,
      }

      await monitorState?.checkpoint(currentOrders)

      sendJson(response, 200, {
        message: mode === 'create' ? 'Grid wurde abgeglichen und ergänzt' : 'Überwachung aktualisiert',
        symbol,
        livePrice,
        balances: { base: baseBalance, quote: quoteBalance },
        openOrders: currentOrders,
        created,
        blocked,
        debugSummary,
        debug,
        buyOrders: currentOrders.filter((order) => order.side === 'buy').length,
        sellOrders: currentOrders.filter((order) => order.side === 'sell').length,
      })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'Überwachung fehlgeschlagen.' })
    }
  }
}
