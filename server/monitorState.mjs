// Trading state is authoritative on the server, not in browser save snapshots.
export async function openMonitorState({ journal, account, initialOrders, auth,
  loadPhemexOrderById, createPhemexLimitOrder }) {
  let state = await journal.load(account) ?? { orders: initialOrders, pending: null }
  const save = () => journal.save(account, state)
  const accept = async (pending, orderId) => {
    const order = { ...pending, orderId }
    state.orders = state.orders.map((known) => pending.side === 'sell'
      && known.side === 'buy' && known.status?.startsWith('locked')
      && known.price === pending.sourceBuyPrice
      && (!pending.sourceBuyOrderId || known.orderId === pending.sourceBuyOrderId)
      ? { ...known, status: 'locked', lockedBySellPrice: pending.price, lockedBySellOrderId: orderId }
      : known)
    state.orders = [...state.orders.filter((known) => known.orderId !== orderId), order]
    state.pending = null
    await save()
  }
  if (state.pending) {
    const pending = state.pending
    const exact = await loadPhemexOrderById({ ...auth, clientOrderId: pending.clientOrderId })
    const id = String(exact?.orderID ?? exact?.orderId ?? '')
    const valid = id && String(exact?.clOrdID ?? exact?.clientOrderId ?? '') === pending.clientOrderId
      && String(exact?.symbol) === auth.symbol
      && String(exact?.side).toLowerCase() === pending.side
      && String(exact?.ordType).toLowerCase() === 'limit'
      && Math.abs(Number(exact?.priceEp) / 1e8 - pending.price) <= 0.0001
      && Math.abs(Number(exact?.baseQtyEv) / 1e8 - pending.baseSize) <= 1e-8
    if (!valid) throw new Error(`Orderstatus ungeklärt: ${pending.side} ${pending.price}, Client-ID ${pending.clientOrderId}. Keine erneute Order gesendet.`)
    await accept(pending, id)
  }
  await save()
  return {
    orders: state.orders,
    async checkpoint(orders) {
      state.orders = orders
      await save()
    },
    async submit(order) {
      // Persist intent before sending: a lost response must never cause a duplicate.
      const { side, price, baseSize, clientOrderId, sourceBuyPrice, sourceBuyOrderId } = order
      const pending = { side, price, baseSize, clientOrderId, sourceBuyPrice, sourceBuyOrderId }
      state.pending = pending
      await save()
      const result = await createPhemexLimitOrder(order)
      const id = String(result?.orderID ?? result?.orderId ?? result?.id ?? '')
      if (!id) throw new Error('Orderantwort ohne Order-ID; Abgleich beim nächsten Durchlauf erforderlich.')
      await accept(pending, id)
      return result
    },
  }
}
