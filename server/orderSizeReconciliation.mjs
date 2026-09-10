import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const epsilon = 0.00000001
const sameLevel = (a, b) => a.side === b.side && Math.abs(a.price - b.price) <= 0.0001
const statusOf = (order) => String(order?.ordStatus ?? order?.status ?? '').toLowerCase()
const idOf = (order) => String(order?.orderID ?? order?.orderId ?? '')
const unchangedLimit = (exact, source) => String(exact?.ordType).toLowerCase() === 'limit'
  && String(exact?.side).toLowerCase() === source.side
  && Math.abs(Number(exact?.priceEp) / 1e8 - source.price) <= 0.0001

export function filledSize(order) {
  const value = order?.cumBaseQtyEv
  if (value !== undefined && value !== null && value !== '') return Number(value) / 1e8
  const filled = order?.filledSize
  return filled !== undefined && filled !== null ? Number(filled) : NaN
}

export function createReplacementJournal(directory) {
  const pathFor = (account) => join(directory, `${createHash('sha256').update(account).digest('hex')}.json`)
  return {
    async load(account) {
      try { return JSON.parse(await readFile(pathFor(account), 'utf8')) }
      catch (error) { if (error.code === 'ENOENT') return null; throw error }
    },
    async save(account, value) {
      await mkdir(directory, { recursive: true })
      const path = pathFor(account)
      await writeFile(`${path}.tmp`, JSON.stringify(value), 'utf8')
      await rename(`${path}.tmp`, path)
    },
    async remove(account) {
      await unlink(pathFor(account)).catch((error) => { if (error.code !== 'ENOENT') throw error })
    },
  }
}

export function createOrderSizeReconciler({ journal, loadPhemexOrderById, loadPhemexOpenOrders,
  loadPhemexBalance, loadPhemexLastPrice, cancelPhemexOrder, createPhemexLimitOrder }) {
  return async function reconcile({ key, secret, symbol, baseAsset, quoteAsset, levels,
    orderSize, minimumPriceDistance, openOrders, knownOrders }) {
    const account = `${key}:${symbol}`
    const auth = { key, secret, symbol }
    const debug = []
    let submittedNow = false
    let pending = await journal.load(account)
    const note = (order, reason) => debug.push({ type: 'size-mismatch', side: order.side, price: order.price, reason })
    const freshFunds = (side) => loadPhemexBalance({ key, secret, currency: side === 'buy' ? quoteAsset : baseAsset })
    const priceAllows = async (order) => {
      const live = await loadPhemexLastPrice({ symbol })
      return Number.isFinite(live) && live > 0
        && (order.side === 'buy' ? live - order.price : order.price - live) >= minimumPriceDistance
    }
    const state = () => {
      const replacement = pending?.replacement
      const orders = [...openOrders]
      // Keep cycle identities until the browser has acknowledged the replacement.
      for (const known of knownOrders) {
        if (!orders.some((order) => order.orderId === known.orderId && order.side === known.side && order.price === known.price)) orders.push(known)
      }
      const mapped = orders.filter((order) => !replacement || order.orderId !== pending.source.orderId)
        .map((order) => replacement && order.lockedBySellOrderId === pending.source.orderId
          ? { ...order, lockedBySellOrderId: replacement.orderId }
          : pending && !replacement && order.orderId === pending.source.orderId
            ? { ...order, status: 'locked-size-pending' } : order)
      if (replacement && !mapped.some((order) => order.orderId === replacement.orderId)) mapped.push(replacement)
      return { handled: Boolean(pending), openOrders: mapped, created: submittedNow ? [replacement] : [], debug }
    }
    if (pending?.phase === 'done' && knownOrders.some((order) =>
      order.orderId === pending.replacement.orderId || order.lockedBySellOrderId === pending.replacement.orderId)) {
      // Also update stale lock references received with the acknowledgement.
      for (const order of knownOrders) {
        if (order.lockedBySellOrderId === pending.source.orderId) order.lockedBySellOrderId = pending.replacement.orderId
      }
      await journal.remove(account)
      pending = null
    }
    if (!pending) {
      for (const source of openOrders) {
        if (!levels.some((price) => Math.abs(price - source.price) <= 0.0001)) continue
        if (!['buy', 'sell'].includes(source.side) || !(source.baseSize > 0 && source.baseSize + epsilon < orderSize)) continue
        if (openOrders.filter((other) => sameLevel(source, other)).length !== 1) {
          note(source, 'Mehrere Orders am Preislevel: keine automatische Mengenänderung.')
          continue
        }
        const extra = (orderSize - source.baseSize) * (source.side === 'buy' ? source.price : 1)
        const funds = await freshFunds(source.side)
        if (!Number.isFinite(funds) || funds + epsilon < extra) {
          note(source, 'Guthaben für die Mehrmenge reicht nicht; bestehende Order bleibt unverändert.')
          continue
        }
        if (!source.orderId || !await priceAllows(source)) {
          note(source, 'Mengenänderung wartet: Order-ID fehlt oder Preisabstand zu klein.')
          continue
        }
        const exact = await loadPhemexOrderById({ ...auth, orderId: source.orderId })
        if (idOf(exact) !== source.orderId || statusOf(exact) !== 'new' || filledSize(exact) !== 0) {
          note(source, 'Teilfüllung oder unklarer Orderstatus: bestehende Order bleibt unverändert.')
          continue
        }
        const exactSize = Number(exact.baseQtyEv) / 1e8
        if (!unchangedLimit(exact, source) || !Number.isFinite(exactSize) || Math.abs(exactSize - source.baseSize) > epsilon) {
          note(source, 'Ordermenge wurde zwischenzeitlich geändert; erneute Prüfung im nächsten Zyklus.')
          continue
        }
        pending = { source, targetSize: orderSize, phase: 'cancel',
          clientOrderId: `gb2-size-${createHash('sha256').update(`${account}:${source.orderId}`).digest('hex').slice(0, 24)}` }
        // Persist before the first exchange mutation, never persist API credentials.
        await journal.save(account, pending)
        break
      }
    }
    if (!pending) return { handled: false, debug }
    const source = pending.source
    try {
      if (pending.phase === 'done') return state()
      if (pending.phase === 'cancel') {
        let exact = await loadPhemexOrderById({ ...auth, orderId: source.orderId })
        if (idOf(exact) !== source.orderId) throw new Error('Status der Originalorder ist nicht eindeutig.')
        if (statusOf(exact) === 'new' && filledSize(exact) === 0) {
          const size = Number(exact.baseQtyEv) / 1e8
          const extra = (pending.targetSize - size) * (source.side === 'buy' ? source.price : 1)
          const funds = await freshFunds(source.side)
          if (!unchangedLimit(exact, source) || Math.abs(size - source.baseSize) > epsilon || !Number.isFinite(size)
            || !Number.isFinite(funds) || funds + epsilon < extra || !await priceAllows(source)) {
            if (pending.cancelRequested) throw new Error('Stornierung bereits angefragt; Statusklärung bleibt aktiv.')
            await journal.remove(account)
            pending = null
            note(source, 'Mengenänderung nicht mehr möglich; bestehende Order bleibt unverändert.')
            return state()
          }
          pending.cancelRequested = true
          await journal.save(account, pending)
          await cancelPhemexOrder({ ...auth, orderId: source.orderId })
          exact = await loadPhemexOrderById({ ...auth, orderId: source.orderId })
        }
        if (idOf(exact) === source.orderId && statusOf(exact) === 'filled') {
          pending.replacement = { ...source, baseSize: filledSize(exact) || source.baseSize }
          pending.phase = 'done'
          await journal.save(account, pending)
          note(source, 'Originalorder wurde ausgeführt; kein Ersatz. Übergabe an normale Orderüberwachung.')
          return state()
        }
        if (idOf(exact) !== source.orderId || statusOf(exact) !== 'canceled' || filledSize(exact) !== 0
          || !unchangedLimit(exact, source) || !Number.isFinite(Number(exact.baseQtyEv))
          || Math.abs(Number(exact.baseQtyEv) / 1e8 - source.baseSize) > epsilon) {
          throw new Error('Ersatz gesperrt: Stornierung ohne Teilfüllung noch nicht bestätigt. Orderstatus prüfen.')
        }
        pending.phase = 'ready'
        await journal.save(account, pending)
      }
      if (pending.phase === 'ready') {
        const fresh = await loadPhemexOpenOrders(auth)
        if (fresh.some((order) => sameLevel(source, order))) throw new Error('Ersatz wartet: Preislevel ist noch belegt.')
        const funds = await freshFunds(source.side)
        const cost = pending.targetSize * (source.side === 'buy' ? source.price : 1)
        if (!Number.isFinite(funds) || funds + epsilon < cost || !await priceAllows(source)) {
          throw new Error('Ersatz wartet auf freigegebenes Guthaben und ausreichenden Preisabstand.')
        }
        pending.phase = 'submitting'
        await journal.save(account, pending)
        const result = await createPhemexLimitOrder({ ...auth, side: source.side, price: source.price,
          baseSize: pending.targetSize, clientOrderId: pending.clientOrderId })
        if (!idOf(result)) throw new Error('Ersatzorder ohne bestätigte ID; Statusabfrage erforderlich.')
        pending.replacement = { ...source, orderId: idOf(result), clientOrderId: pending.clientOrderId,
          baseSize: pending.targetSize, status: 'New' }
        pending.phase = 'done'
        await journal.save(account, pending)
        submittedNow = true
        debug.push({ type: 'size-replaced', side: source.side, price: source.price, reason: 'Order storniert und in Sollgröße neu erstellt.' })
      } else if (pending.phase === 'submitting') {
        // A timed-out POST may have succeeded. Query only; never blindly resubmit.
        const result = await loadPhemexOrderById({ ...auth, clientOrderId: pending.clientOrderId })
        if (!idOf(result) || String(result.clOrdID ?? result.clientOrderId) !== pending.clientOrderId
          || !['new', 'partiallyfilled', 'filled', 'canceled'].includes(statusOf(result))) {
          throw new Error('Ersatzorder unbestätigt: keine weitere Order; Börsenstatus prüfen.')
        }
        pending.replacement = { ...source, orderId: idOf(result), clientOrderId: pending.clientOrderId,
          baseSize: pending.targetSize, status: 'New' }
        pending.phase = 'done'
        await journal.save(account, pending)
      }
    } catch (error) {
      note(source, error instanceof Error ? error.message : 'Mengenänderung unklar; keine weitere Order.')
    }
    return state()
  }
}
