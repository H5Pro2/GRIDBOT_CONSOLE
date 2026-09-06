import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { MarketChart, type Candle, type ChartInterval } from './MarketChart'

type Exchange = {
  id: string
  name: string
  key: string
  secret: string
  passphrase: string
  spotValue: number
}

type Bot = {
  id: string
  name: string
  exchangeId: string
  symbol: string
  baseAsset: string
  quoteAsset: string
  lower: number
  upper: number
  grids: number
  orderSize: number
  useStartAsset: boolean
  pollIntervalSeconds: number
  created: boolean
  running: boolean
  lastRunAt?: number
  nextRunAt?: number
  balances?: {
    base: number
    quote: number
  }
  balanceError?: string
  orders?: GridOrder[]
}

type Store = {
  exchanges: Exchange[]
  bots: Bot[]
  activeBotId: string
  language?: Language
  languageUpdatedAt?: number
}

type DebugEntry = {
  id: string
  timestamp: string
  message: string
}

type SecretStatus = {
  error?: string
  hasKey: boolean
  hasSecret: boolean
  hasPassphrase: boolean
}

type SnapshotResponse = {
  error?: string
  balanceError?: string
  candles?: Candle[]
  balances?: {
    base: number
    quote: number
  }
  pair?: string
}

type GridOrder = {
  orderId: string
  side: 'buy' | 'sell'
  status?: string
  price: number
  baseSize?: number
  quoteSize?: number
  lockedBySellPrice?: number
  lockedBySellOrderId?: string
  sourceBuyPrice?: number
}

type CreateGridResponse = {
  error?: string
  message?: string
  balances?: {
    base: number
    quote: number
  }
  buyOrders?: number
  sellOrders?: number
  created?: GridOrder[]
  skipped?: unknown[]
  blocked?: unknown[]
}

type MonitorResponse = {
  error?: string
  balances?: {
    base: number
    quote: number
  }
  buyOrders?: number
  sellOrders?: number
  openOrders?: GridOrder[]
  created?: GridOrder[]
  blocked?: unknown[]
}

type CreateGridSummary = {
  orders: number
  buyOrders: number
  sellOrders: number
  blocked: number
}

const storageKey = 'gridbot-menu-2-ui-only-v2'
const languageKey = 'gridbot-menu-2-language'
const exchangeTemplates = ['Phemex', 'Binance']
const minPollIntervalSeconds = 3
type Language = 'de' | 'en'

const copy = {
  de: {
    globalSetup: 'Globales Setup',
    appTitle: 'Gridbot Menu',
    subline: 'Bots anlegen, Grid-Mechaniken konfigurieren und Borsen-Zugange im Setup-Menü verwalten.',
    botMenu: 'Bot Menu',
    bots: 'Bots',
    active: 'Aktiv',
    created: 'Erstellt',
    draft: 'Entwurf',
    deleteBot: 'Bot loschen',
    addBot: 'Bot hinzufugen',
    botConfig: 'Bot Konfiguration',
    noBot: 'Kein Bot ausgewahlt',
    openDebug: 'Debug offnen',
    openSetup: 'Setup offnen',
    botName: 'Bot Name',
    exchange: 'Borse',
    asset: 'Asset',
    quote: 'Quote',
    spotBalance: 'Spot Guthaben',
    assetBalance: 'Asset Guthaben',
    balance: 'Guthaben',
    error: 'Fehler',
    gridMechanic: 'Grid Mechanik',
    botActive: 'Bot aktiv',
    create: 'Erstellen',
    start: 'Start',
    stop: 'Stopp',
    gridLower: 'Grid unten',
    gridUpper: 'Grid oben',
    gridCount: 'Anzahl Grids',
    assetAmount: 'Asset-Menge',
    useStartAsset: 'Start-Asset verwenden',
    pollInterval: 'Grid-Abfragezeit',
    gridDistance: 'Grid Abstand',
    orders: 'Orders',
    orderNeed: 'Orderbedarf',
    query: 'Abfrage',
    orderBook: 'Orderbuch',
    orderPlan: 'Order Plan',
    ready: 'Bereit',
    openOrderList: 'Orderliste öffnen',
    programSetup: 'Programm Setup',
    exchangesSecrets: 'Borsen & Secrets',
    closeSetup: 'Setup schliessen',
    close: 'Schliessen',
    secretNote: 'Phemex API Key und Secret werden lokal in der .env Datei gespeichert.',
    exchanges: 'Borsen',
    apiKey: 'API Key',
    keyPlaceholder: 'Key eintragen',
    secret: 'Secret',
    passphrase: 'Passphrase / Zusatz',
    optional: 'Optional',
    savedPlaceholder: '•••••••• hinterlegt',
    apply: 'Ubernehmen',
    system: 'System',
    closeDebug: 'Debug schliessen',
    clear: 'Leeren',
    noEntries: 'Keine Eintraege.',
    closeOrderPlan: 'Order Plan schliessen',
    locked: 'gesperrt',
    buySell: 'Buy/Sell',
    priceRange: 'Preisbereich',
    phemexOrderId: 'Femex Order ID',
    noOpenOrders: 'Keine offenen Gridbot-Orders geladen.',
    collapse: 'Einklappen',
    expand: 'Ausklappen',
    collapseMechanic: 'Grid Mechanik einklappen',
    expandMechanic: 'Grid Mechanik ausklappen',
  },
  en: {
    globalSetup: 'Global Setup',
    appTitle: 'Gridbot Menu',
    subline: 'Create bots, configure grid mechanics and manage exchange access in setup.',
    botMenu: 'Bot Menu',
    bots: 'Bots',
    active: 'Active',
    created: 'Created',
    draft: 'Draft',
    deleteBot: 'Delete bot',
    addBot: 'Add bot',
    botConfig: 'Bot Configuration',
    noBot: 'No bot selected',
    openDebug: 'Open debug',
    openSetup: 'Open setup',
    botName: 'Bot Name',
    exchange: 'Exchange',
    asset: 'Asset',
    quote: 'Quote',
    spotBalance: 'Spot Balance',
    assetBalance: 'Asset Balance',
    balance: 'Balance',
    error: 'Error',
    gridMechanic: 'Grid Mechanic',
    botActive: 'Bot active',
    create: 'Create',
    start: 'Start',
    stop: 'Stop',
    gridLower: 'Grid lower',
    gridUpper: 'Grid upper',
    gridCount: 'Grid Count',
    assetAmount: 'Asset Amount',
    useStartAsset: 'Use start asset',
    pollInterval: 'Grid Poll Interval',
    gridDistance: 'Grid Distance',
    orders: 'Orders',
    orderNeed: 'Order Need',
    query: 'Query',
    orderBook: 'Order Book',
    orderPlan: 'Order Plan',
    ready: 'Ready',
    openOrderList: 'Open order list',
    programSetup: 'Program Setup',
    exchangesSecrets: 'Exchanges & Secrets',
    closeSetup: 'Close setup',
    close: 'Close',
    secretNote: 'Phemex API key and secret are stored locally in the .env file.',
    exchanges: 'Exchanges',
    apiKey: 'API Key',
    keyPlaceholder: 'Enter key',
    secret: 'Secret',
    passphrase: 'Passphrase / Extra',
    optional: 'Optional',
    savedPlaceholder: '•••••••• saved',
    apply: 'Apply',
    system: 'System',
    closeDebug: 'Close debug',
    clear: 'Clear',
    noEntries: 'No entries.',
    closeOrderPlan: 'Close order plan',
    locked: 'locked',
    buySell: 'Buy/Sell',
    priceRange: 'Price range',
    phemexOrderId: 'Phemex Order ID',
    noOpenOrders: 'No open gridbot orders loaded.',
    collapse: 'Collapse',
    expand: 'Expand',
    collapseMechanic: 'Collapse grid mechanic',
    expandMechanic: 'Expand grid mechanic',
  },
} as const

const createExchange = (name: string): Exchange => ({
  id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
  name,
  key: '',
  secret: '',
  passphrase: '',
  spotValue: 0,
})

const starterBot = (index: number, exchangeId = 'phemex'): Bot => ({
  id: crypto.randomUUID(),
  name: index === 1 ? '' : `Grid Bot ${index}`,
  exchangeId,
  symbol: '',
  baseAsset: '',
  quoteAsset: '',
  lower: 0,
  upper: 0,
  grids: 0,
  orderSize: 0,
  useStartAsset: false,
  pollIntervalSeconds: minPollIntervalSeconds,
  created: false,
  running: false,
})

const initialStore: Store = {
  exchanges: [createExchange('Phemex'), createExchange('Binance')],
  bots: [starterBot(1)],
  activeBotId: '',
  language: 'de',
  languageUpdatedAt: 0,
}

function NumericInput({
  value,
  onValue,
  integer = false,
  min,
  max,
}: {
  value: number
  onValue: (value: number) => void
  integer?: boolean
  min?: number
  max?: number
}) {
  const [text, setText] = useState(String(value))
  const pattern = integer ? /^\d*$/ : /^\d*(?:[.]\d*)?$/

  useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = (raw: string) => {
    if (raw === '' || raw === '.') return
    const parsed = integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw)
    if (!Number.isFinite(parsed)) return
    onValue(Math.min(max ?? parsed, Math.max(min ?? parsed, parsed)))
  }

  return (
    <input
      inputMode={integer ? 'numeric' : 'decimal'}
      type="text"
      value={text}
      onChange={(event) => {
        const next = event.target.value
        if (!pattern.test(next)) return
        setText(next)
        commit(next)
      }}
      onBlur={() => {
        if (text === '' || text === '.') {
          setText(String(value))
          return
        }
        commit(text)
      }}
    />
  )
}

function composeSymbol(baseAsset: string, quoteAsset: string) {
  return `${baseAsset}${quoteAsset}`.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normalizePollIntervalSeconds(value: number) {
  return Number.isFinite(value) && value >= minPollIntervalSeconds ? Math.floor(value) : minPollIntervalSeconds
}

function normalizeExchanges(exchanges: Exchange[] = []) {
  return exchangeTemplates.map((name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const exchange = exchanges.find((item) => item.id === id || item.name === name)
    return {
      ...createExchange(name),
      key: exchange?.key ?? '',
      secret: exchange?.secret ?? '',
      passphrase: exchange?.passphrase ?? '',
      spotValue: exchange?.spotValue ?? 0,
    }
  })
}

function normalizeLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : 'de'
}

async function readJsonResponse<T extends { error?: string }>(response: Response, fallbackMessage: string) {
  const payload = await response.json().catch(() => undefined) as T | undefined
  if (!response.ok || payload?.error) throw new Error(payload?.error || fallbackMessage)
  return (payload ?? {}) as T
}

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { ...initialStore, activeBotId: initialStore.bots[0].id }
    const parsed = JSON.parse(raw) as Store
    const exchanges = normalizeExchanges(parsed.exchanges)
    const bots = parsed.bots?.length ? parsed.bots : initialStore.bots
    return {
      exchanges,
      bots: bots.map((bot, index) => ({
        ...starterBot(index + 1, exchanges[0].id),
        ...bot,
        useStartAsset: Boolean(bot.useStartAsset),
        pollIntervalSeconds: normalizePollIntervalSeconds(bot.pollIntervalSeconds),
        lastRunAt: Number.isFinite(bot.lastRunAt) ? bot.lastRunAt : undefined,
        nextRunAt: Number.isFinite(bot.nextRunAt) ? bot.nextRunAt : undefined,
        balances: bot.balances && Number.isFinite(bot.balances.base) && Number.isFinite(bot.balances.quote)
          ? bot.balances
          : undefined,
        balanceError: typeof bot.balanceError === 'string' ? bot.balanceError : '',
        orders: Array.isArray(bot.orders) ? bot.orders : undefined,
        exchangeId: exchanges.some((exchange) => exchange.id === bot.exchangeId) ? bot.exchangeId : exchanges[0].id,
      })),
      activeBotId: parsed.activeBotId || bots[0].id,
      language: normalizeLanguage(parsed.language ?? localStorage.getItem(languageKey)),
      languageUpdatedAt: Number.isFinite(parsed.languageUpdatedAt) ? parsed.languageUpdatedAt : 0,
    }
  } catch {
    return {
      ...initialStore,
      activeBotId: initialStore.bots[0].id,
      language: normalizeLanguage(localStorage.getItem(languageKey)),
      languageUpdatedAt: 0,
    }
  }
}

function normalizeStore(store: Store): Store {
  const exchanges = normalizeExchanges(store.exchanges)
  const bots = store.bots?.length ? store.bots : initialStore.bots
  return {
    exchanges,
    bots: bots.map((bot, index) => ({
      ...starterBot(index + 1, exchanges[0].id),
      ...bot,
      useStartAsset: Boolean(bot.useStartAsset),
      pollIntervalSeconds: normalizePollIntervalSeconds(bot.pollIntervalSeconds),
      lastRunAt: Number.isFinite(bot.lastRunAt) ? bot.lastRunAt : undefined,
      nextRunAt: Number.isFinite(bot.nextRunAt) ? bot.nextRunAt : undefined,
      balances: bot.balances && Number.isFinite(bot.balances.base) && Number.isFinite(bot.balances.quote)
        ? bot.balances
        : undefined,
      balanceError: typeof bot.balanceError === 'string' ? bot.balanceError : '',
      orders: Array.isArray(bot.orders) ? bot.orders : undefined,
      exchangeId: exchanges.some((exchange) => exchange.id === bot.exchangeId) ? bot.exchangeId : exchanges[0].id,
    })),
    activeBotId: store.activeBotId || bots[0].id,
    language: normalizeLanguage(store.language),
    languageUpdatedAt: Number.isFinite(store.languageUpdatedAt) ? store.languageUpdatedAt : 0,
  }
}

function stripSecrets(store: Store): Store {
  return {
    ...store,
    exchanges: store.exchanges.map((exchange) => ({
      ...exchange,
      key: '',
      secret: '',
      passphrase: '',
    })),
  }
}

function serializePublicStore(store: Store) {
  return JSON.stringify(stripSecrets(store))
}

function mergeIncomingStore(current: Store, incoming: Store): Store {
  const currentLanguageUpdatedAt = Number(current.languageUpdatedAt) || 0
  const incomingLanguageUpdatedAt = Number(incoming.languageUpdatedAt) || 0
  if (currentLanguageUpdatedAt > incomingLanguageUpdatedAt) {
    return {
      ...incoming,
      language: normalizeLanguage(current.language),
      languageUpdatedAt: currentLanguageUpdatedAt,
    }
  }
  return incoming
}

function App() {
  const [store, setStore] = useState<Store>(() => loadStore())
  const lastServerStoreRef = useRef('')
  const [serverStoreLoaded, setServerStoreLoaded] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupExchangeId, setSetupExchangeId] = useState(() => store.exchanges[0]?.id ?? 'phemex')
  const [mechanicsOpen, setMechanicsOpen] = useState(true)
  const [debugOpen, setDebugOpen] = useState(false)
  const [orderPlanOpen, setOrderPlanOpen] = useState(false)
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([])
  const [saveNotice, setSaveNotice] = useState('')
  const [secretStatus, setSecretStatus] = useState<SecretStatus>({ hasKey: false, hasSecret: false, hasPassphrase: false })
  const [spotStatus, setSpotStatus] = useState('')
  const [chartInterval, setChartInterval] = useState<ChartInterval>('1d')
  const [chartCandles, setChartCandles] = useState<Candle[]>([])
  const [accountBalances, setAccountBalances] = useState<Record<string, { base: number; quote: number }>>({})
  const [balanceErrors, setBalanceErrors] = useState<Record<string, string>>({})
  const [createGridSummaries, setCreateGridSummaries] = useState<Record<string, CreateGridSummary>>({})
  const [gridOrders, setGridOrders] = useState<Record<string, GridOrder[]>>({})
  const [nowMs, setNowMs] = useState(Date.now())
  const activeBot = store.bots.find((bot) => bot.id === store.activeBotId) ?? store.bots[0]
  const setupExchange = store.exchanges.find((exchange) => exchange.id === setupExchangeId) ?? store.exchanges[0]
  const language = normalizeLanguage(store.language)
  const text = copy[language]

  const setLanguage = (nextLanguage: Language) => {
    setStore((current) => ({ ...current, language: nextLanguage, languageUpdatedAt: Date.now() }))
    localStorage.setItem(languageKey, nextLanguage)
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/store')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return
        if (payload?.bots?.length || payload?.exchanges?.length) {
          const nextStore = normalizeStore(payload as Store)
          setStore((current) => {
            const mergedStore = mergeIncomingStore(current, nextStore)
            lastServerStoreRef.current = serializePublicStore(mergedStore)
            return mergedStore
          })
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setServerStoreLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const publicStoreText = serializePublicStore(store)
    localStorage.setItem(storageKey, publicStoreText)
    if (!serverStoreLoaded) return
    if (publicStoreText === lastServerStoreRef.current) return
    lastServerStoreRef.current = publicStoreText
    void fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: publicStoreText,
    }).catch(() => undefined)
  }, [serverStoreLoaded, store])

  useEffect(() => {
    if (!serverStoreLoaded) return
    if (!store.bots.some((bot) => bot.running && !bot.nextRunAt)) return
    const initializedAt = Date.now()
    setStore((current) => ({
      ...current,
      bots: current.bots.map((bot) =>
        bot.running && !bot.nextRunAt
          ? {
              ...bot,
              lastRunAt: initializedAt,
              nextRunAt: initializedAt + bot.pollIntervalSeconds * 1000,
            }
          : bot,
      ),
    }))
  }, [serverStoreLoaded, store.bots])

  useEffect(() => {
    if (!serverStoreLoaded) return
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
      void fetch('/api/store')
        .then((response) => response.json())
        .then((payload) => {
          if (!payload?.bots?.length && !payload?.exchanges?.length) return
          const nextStore = normalizeStore(payload as Store)
          setStore((current) => {
            const mergedStore = mergeIncomingStore(current, nextStore)
            const nextStoreText = serializePublicStore(mergedStore)
            if (nextStoreText === lastServerStoreRef.current) return current
            lastServerStoreRef.current = nextStoreText
            return mergedStore
          })
        })
        .catch(() => undefined)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [serverStoreLoaded])

  useEffect(() => {
    if (setupExchange?.name.toLowerCase() !== 'phemex') {
      setSecretStatus({ hasKey: false, hasSecret: false, hasPassphrase: false })
      return
    }
    let cancelled = false
    fetch('/api/phemex/secrets/status')
      .then((response) => readJsonResponse<SecretStatus>(response, 'Secret-Status konnte nicht geladen werden.'))
      .then((payload) => {
        if (!cancelled) setSecretStatus(payload)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [setupExchange?.id, setupExchange?.name])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const updateVisibleClock = () => setNowMs(Date.now())
    window.addEventListener('focus', updateVisibleClock)
    document.addEventListener('visibilitychange', updateVisibleClock)

    return () => {
      window.removeEventListener('focus', updateVisibleClock)
      document.removeEventListener('visibilitychange', updateVisibleClock)
    }
  }, [])

  const gridLevels = useMemo(() => {
    if (!activeBot || activeBot.upper <= activeBot.lower || activeBot.grids < 2) return []
    const step = (activeBot.upper - activeBot.lower) / activeBot.grids
    return Array.from({ length: activeBot.grids + 1 }, (_, index) => Math.round((activeBot.lower + step * index) * 100) / 100)
  }, [activeBot])

  const gridSpacing = gridLevels.length > 1 ? gridLevels[1] - gridLevels[0] : 0
  const requiredCapital = activeBot.orderSize * Math.max(activeBot.lower, 0) * Math.max(activeBot.grids, 0)
  const activeBalances = activeBot.balances ?? accountBalances[activeBot.id] ?? { base: 0, quote: 0 }
  const activeBalanceError = activeBot.balanceError ?? balanceErrors[activeBot.id] ?? ''
  const activeCreateSummary = createGridSummaries[activeBot.id] ?? { orders: 0, buyOrders: 0, sellOrders: 0, blocked: 0 }
  const activeGridOrders = activeBot.orders ?? gridOrders[activeBot.id] ?? []
  const getBotCountdown = (bot: Bot) => {
    if (!bot.running) return bot.pollIntervalSeconds
    if (!bot.nextRunAt) return bot.pollIntervalSeconds
    return Math.min(bot.pollIntervalSeconds, Math.max(0, Math.ceil((bot.nextRunAt - nowMs) / 1000)))
  }

  const logDebug = (message: string) => {
    setDebugEntries((current) => [
      { id: crypto.randomUUID(), timestamp: new Date().toLocaleString('de-DE'), message },
      ...current,
    ].slice(0, 200))
  }

  const updateBot = (patch: Partial<Bot>) => {
    const normalizedPatch = patch.pollIntervalSeconds === undefined
      ? patch
      : { ...patch, pollIntervalSeconds: normalizePollIntervalSeconds(patch.pollIntervalSeconds) }
    setStore((current) => ({
      ...current,
      bots: current.bots.map((bot) => (bot.id === activeBot.id ? { ...bot, ...normalizedPatch } : bot)),
    }))
  }

  const updateMarket = (patch: Partial<Pick<Bot, 'baseAsset' | 'quoteAsset'>>) => {
    const baseAsset = patch.baseAsset ?? activeBot.baseAsset
    const quoteAsset = patch.quoteAsset ?? activeBot.quoteAsset
    updateBot({ baseAsset, quoteAsset, symbol: composeSymbol(baseAsset, quoteAsset) })
  }

  const addBot = () => {
    const bot = starterBot(store.bots.length + 1, store.exchanges[0]?.id)
    setStore((current) => ({ ...current, bots: [...current.bots, bot], activeBotId: bot.id }))
  }

  const deleteBot = (id: string) => {
    setStore((current) => {
      const bots = current.bots.filter((bot) => bot.id !== id)
      const nextBots = bots.length ? bots : [starterBot(1, current.exchanges[0]?.id)]
      return { ...current, bots: nextBots, activeBotId: current.activeBotId === id ? nextBots[0].id : current.activeBotId }
    })
  }

  const addExchange = (name: string) => {
    const existing = store.exchanges.find((exchange) => exchange.name === name)
    if (existing) {
      setSetupExchangeId(existing.id)
      return
    }
    const exchange = createExchange(name)
    setStore((current) => ({ ...current, exchanges: [...current.exchanges, exchange] }))
    setSetupExchangeId(exchange.id)
  }

  const updateExchange = (patch: Partial<Exchange>) => {
    if (!setupExchange) return
    setStore((current) => ({
      ...current,
      exchanges: current.exchanges.map((exchange) =>
        exchange.id === setupExchange.id ? { ...exchange, ...patch } : exchange,
      ),
    }))
  }

  const saveExchangeDraft = async () => {
    if (!setupExchange) return
    if (setupExchange.name.toLowerCase() !== 'phemex') {
      setSaveNotice('Nur Phemex .env')
      window.setTimeout(() => setSaveNotice(''), 1400)
      return
    }
    try {
      const response = await fetch('/api/phemex/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: setupExchange.key,
          secret: setupExchange.secret,
          passphrase: setupExchange.passphrase,
        }),
      })
      await readJsonResponse(response, 'Secrets konnten nicht gespeichert werden.')
      setSecretStatus({
        hasKey: Boolean(setupExchange.key.trim()),
        hasSecret: Boolean(setupExchange.secret.trim()),
        hasPassphrase: Boolean(setupExchange.passphrase.trim()),
      })
      updateExchange({ key: '', secret: '', passphrase: '' })
      setSaveNotice('.env gespeichert')
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Speichern fehlgeschlagen')
    }
    window.setTimeout(() => setSaveNotice(''), 1800)
  }

  const refreshSnapshot = async (bot = activeBot, interval = chartInterval) => {
    const exchange = store.exchanges.find((item) => item.id === bot.exchangeId)
    if (!exchange) throw new Error('Borse fehlt.')
    if (exchange.name.toLowerCase() !== 'phemex') throw new Error('Diese Abfrage ist aktuell nur fuer Phemex umgesetzt.')
    if (!bot.baseAsset.trim() || !bot.quoteAsset.trim()) throw new Error('Asset und Quote eintragen.')
    setSpotStatus('Lade Phemex Daten')
    try {
      const response = await fetch('/api/phemex/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: exchange.key,
          secret: exchange.secret,
          baseAsset: bot.baseAsset,
          quoteAsset: bot.quoteAsset,
          symbol: bot.symbol,
          interval,
        }),
      })
      const payload = await readJsonResponse<SnapshotResponse>(response, 'Phemex Abfrage fehlgeschlagen.')
      setChartCandles(payload.candles ?? [])
      setAccountBalances((current) => ({
        ...current,
        [bot.id]: payload.balances ?? { base: 0, quote: 0 },
      }))
      setBalanceErrors((current) => ({
        ...current,
        [bot.id]: payload.balanceError ?? '',
      }))
      const lastRunAt = Date.now()
      const balances = payload.balances ?? { base: 0, quote: 0 }
      updateBot({
        lastRunAt,
        nextRunAt: lastRunAt + bot.pollIntervalSeconds * 1000,
        balances,
        balanceError: payload.balanceError ?? '',
      })
      setSpotStatus(payload.balanceError || `Aktualisiert: ${new Date().toLocaleTimeString('de-DE')}`)
      logDebug(payload.balanceError || `Phemex aktualisiert: ${payload.pair ?? bot.symbol}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Phemex Abfrage fehlgeschlagen.'
      setSpotStatus(message)
      logDebug(message)
    }
  }

  const createGrid = async (bot = activeBot) => {
    const exchange = store.exchanges.find((item) => item.id === bot.exchangeId)
    if (!exchange) throw new Error('Borse fehlt.')
    if (exchange.name.toLowerCase() !== 'phemex') throw new Error('Grid erstellen ist aktuell nur fuer Phemex umgesetzt.')
    setSpotStatus('Grid wird erstellt')
    try {
      const response = await fetch('/api/phemex/create-grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: exchange.key,
          secret: exchange.secret,
          baseAsset: bot.baseAsset,
          quoteAsset: bot.quoteAsset,
          symbol: bot.symbol,
          lower: bot.lower,
          upper: bot.upper,
          grids: bot.grids,
          orderSize: bot.orderSize,
          useStartAsset: bot.useStartAsset,
        }),
      })
      const payload = await readJsonResponse<CreateGridResponse>(response, 'Grid konnte nicht erstellt werden.')
      const createdOrders = payload.created?.length ?? 0
      const summary = {
        orders: createdOrders,
        buyOrders: payload.buyOrders ?? 0,
        sellOrders: payload.sellOrders ?? 0,
        blocked: payload.blocked?.length ?? 0,
      }
      setCreateGridSummaries((current) => ({ ...current, [bot.id]: summary }))
      setGridOrders((current) => ({ ...current, [bot.id]: payload.created ?? [] }))
      if (payload.balances) {
        setAccountBalances((current) => ({ ...current, [bot.id]: payload.balances! }))
        setBalanceErrors((current) => ({ ...current, [bot.id]: '' }))
      }
      updateBot({
        created: true,
        orders: payload.created ?? [],
        ...(payload.balances ? { balances: payload.balances, balanceError: '' } : {}),
      })
      const message = `${payload.message || 'Grid wurde erstellt'}: ${summary.buyOrders} Buy, ${summary.sellOrders} Sell, ${summary.blocked} blockiert.`
      setSpotStatus(message)
      logDebug(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Grid konnte nicht erstellt werden.'
      setSpotStatus(message)
      logDebug(message)
    }
  }

  const monitorGrid = async (bot = activeBot) => {
    const exchange = store.exchanges.find((item) => item.id === bot.exchangeId)
    if (!exchange) throw new Error('Borse fehlt.')
    if (exchange.name.toLowerCase() !== 'phemex') throw new Error('Überwachung ist aktuell nur fuer Phemex umgesetzt.')
    try {
      const response = await fetch('/api/phemex/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: exchange.key,
          secret: exchange.secret,
          baseAsset: bot.baseAsset,
          quoteAsset: bot.quoteAsset,
          symbol: bot.symbol,
          lower: bot.lower,
          upper: bot.upper,
          grids: bot.grids,
          orderSize: bot.orderSize,
          useStartAsset: bot.useStartAsset,
          knownOrders: bot.orders ?? gridOrders[bot.id] ?? [],
        }),
      })
      const payload = await readJsonResponse<MonitorResponse>(response, 'Überwachung fehlgeschlagen.')
      const openOrders = payload.openOrders?.length ?? 0
      setGridOrders((current) => ({ ...current, [bot.id]: payload.openOrders ?? [] }))
      setCreateGridSummaries((current) => {
        const previous = current[bot.id] ?? { orders: 0, buyOrders: 0, sellOrders: 0, blocked: 0 }
        return {
          ...current,
          [bot.id]: {
            ...previous,
            orders: openOrders,
            buyOrders: payload.buyOrders ?? 0,
            sellOrders: payload.sellOrders ?? 0,
            blocked: payload.blocked?.length ?? previous.blocked,
          },
        }
      })
      if (payload.balances) {
        setAccountBalances((current) => ({ ...current, [bot.id]: payload.balances! }))
        setBalanceErrors((current) => ({ ...current, [bot.id]: '' }))
        updateBot({ balances: payload.balances, balanceError: '', orders: payload.openOrders ?? [] })
      } else {
        updateBot({ orders: payload.openOrders ?? [] })
      }
      const createdOrders = payload.created?.length ?? 0
      logDebug(createdOrders ? `Überwachung: ${createdOrders} Orders gesetzt.` : `Überwachung aktualisiert: ${openOrders} offene Orders.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Überwachung fehlgeschlagen.'
      setSpotStatus(message)
      logDebug(message)
    }
  }

  const runBotCycle = async (bot = activeBot) => {
    await refreshSnapshot(bot)
    await monitorGrid(bot)
  }

  const changeChartInterval = (interval: ChartInterval) => {
    setChartInterval(interval)
    void refreshSnapshot(activeBot, interval)
  }

  useEffect(() => {
    if (!activeBot.running) return
    if (!activeBot.nextRunAt || activeBot.nextRunAt > nowMs) return
    const lastRunAt = Date.now()
    updateBot({
      lastRunAt,
      nextRunAt: lastRunAt + activeBot.pollIntervalSeconds * 1000,
    })
    void runBotCycle({
      ...activeBot,
      lastRunAt,
      nextRunAt: lastRunAt + activeBot.pollIntervalSeconds * 1000,
    })
  }, [
    activeBot.id,
    activeBot.running,
    activeBot.pollIntervalSeconds,
    activeBot.nextRunAt,
    activeBot.baseAsset,
    activeBot.quoteAsset,
    activeBot.exchangeId,
    chartInterval,
    store.exchanges,
    nowMs,
  ])

  return (
    <main className="app-shell">
      <aside className="setup-panel">
        <div className="program-head">
          <p className="eyebrow">{text.globalSetup}</p>
          <h1>{text.appTitle}</h1>
          <p className="subline">{text.subline}</p>
        </div>

        <div className="sidebar-bots">
          <div className="section-head">
            <div>
              <p className="eyebrow">{text.botMenu}</p>
              <h2>{store.bots.length} {text.bots}</h2>
            </div>
          </div>

          <div className="bot-grid">
            {store.bots.map((bot) => (
              <div
                className={`bot-tile ${bot.id === activeBot.id ? 'active' : ''} ${bot.running ? 'running' : ''}`}
                key={bot.id}
                onClick={() => setStore((current) => ({ ...current, activeBotId: bot.id }))}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setStore((current) => ({ ...current, activeBotId: bot.id }))
                }}
              >
                <span>{bot.name}</span>
                <strong>{bot.symbol}</strong>
                <small>
                  {bot.running ? text.active : bot.created ? text.created : text.draft} · {bot.grids} Grids ·{' '}
                  {getBotCountdown(bot)}s
                </small>
                <button className="delete-bot" type="button" onClick={(event) => { event.stopPropagation(); deleteBot(bot.id) }} aria-label={`${text.deleteBot}: ${bot.name}`} title={text.deleteBot}>
                  ×
                </button>
              </div>
            ))}
            <button className="add-tile" type="button" onClick={addBot} aria-label={text.addBot}>+</button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <div className="toolbar">
          <div>
            <p className="eyebrow">{text.botConfig}</p>
            <h2>{activeBot?.name || text.noBot}</h2>
          </div>
          <div className="toolbar-actions">
            <div className="language-toggle" aria-label="Language">
              <button className={language === 'en' ? 'active' : ''} type="button" onClick={() => setLanguage('en')}>EN</button>
              <button className={language === 'de' ? 'active' : ''} type="button" onClick={() => setLanguage('de')}>DE</button>
            </div>
            <button className="icon-button debug-button" type="button" onClick={() => setDebugOpen(true)} aria-label={text.openDebug} title="Debug">D</button>
            <button className="icon-button" type="button" onClick={() => setSetupOpen(true)} aria-label={text.openSetup} title="Setup">⚙</button>
          </div>
        </div>

        {activeBot && (
          <section className={`bot-editor ${mechanicsOpen ? 'mechanics-open' : 'mechanics-closed'}`}>
            <div className="editor-main">
              <div className="form-grid">
                <label>{text.botName}<input value={activeBot.name} onChange={(event) => updateBot({ name: event.target.value })} /></label>
                <label>
                  {text.exchange}
                  <select value={activeBot.exchangeId} onChange={(event) => updateBot({ exchangeId: event.target.value })}>
                    {store.exchanges.map((exchange) => <option key={exchange.id} value={exchange.id}>{exchange.name}</option>)}
                  </select>
                </label>
                <label>{text.asset}<input value={activeBot.baseAsset} onChange={(event) => updateMarket({ baseAsset: event.target.value })} /></label>
                <label>{text.quote}<input value={activeBot.quoteAsset} onChange={(event) => updateMarket({ quoteAsset: event.target.value })} /></label>
                <div className="account-strip" title={activeBalanceError || spotStatus || text.balance}>
                  <span>{text.spotBalance}<b>{activeBalanceError ? text.error : activeBalances.quote.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 8 })} {activeBot.quoteAsset}</b></span>
                  <span>{text.assetBalance}<b>{activeBalanceError ? text.error : activeBalances.base.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 8 })} {activeBot.baseAsset}</b></span>
                </div>
              </div>

              <MarketChart
                symbol={activeBot.symbol}
                lower={activeBot.lower}
                upper={activeBot.upper}
                gridLevels={gridLevels}
                orderLines={activeGridOrders}
                candles={chartCandles}
                interval={chartInterval}
                onInterval={changeChartInterval}
              />
            </div>

            <button className="mechanics-toggle" type="button" onClick={() => setMechanicsOpen((open) => !open)} aria-label={mechanicsOpen ? text.collapseMechanic : text.expandMechanic} title={mechanicsOpen ? text.collapse : text.expand}>
              {mechanicsOpen ? '›' : '‹'}
            </button>

            <div className="grid-settings">
              <div className="section-head">
                <h2>{text.gridMechanic}</h2>
                <span className={`bot-status ${activeBot.running ? 'active' : ''}`}>{text.botActive}</span>
              </div>
              <div className="bot-actions">
                <button type="button" onClick={() => { void createGrid(activeBot) }}>{text.create}</button>
                <button type="button" onClick={() => {
                  const startedAt = Date.now()
                  const nextBot = { ...activeBot, created: true, running: true }
                  updateBot({
                    created: true,
                    running: true,
                    lastRunAt: startedAt,
                    nextRunAt: startedAt + activeBot.pollIntervalSeconds * 1000,
                  })
                  void runBotCycle(nextBot)
                }}>{text.start}</button>
                <button className={activeBot.running ? 'stop-action active' : 'stop-action'} type="button" onClick={() => {
                  updateBot({ running: false, nextRunAt: undefined })
                  logDebug('UI: Stopp geklickt.')
                }}>{text.stop}</button>
              </div>
              <label>{text.gridLower}<NumericInput value={activeBot.lower} min={0} onValue={(value) => updateBot({ lower: value })} /></label>
              <label>{text.gridUpper}<NumericInput value={activeBot.upper} min={0} onValue={(value) => updateBot({ upper: value })} /></label>
              <label>{text.gridCount}<NumericInput integer value={activeBot.grids} min={2} max={200} onValue={(value) => updateBot({ grids: value })} /></label>
              <label>{text.assetAmount}<NumericInput value={activeBot.orderSize} min={0} onValue={(value) => updateBot({ orderSize: value })} /></label>
              <label className="toggle"><input type="checkbox" checked={activeBot.useStartAsset} onChange={(event) => updateBot({ useStartAsset: event.target.checked })} />{text.useStartAsset}</label>
              <label>{text.pollInterval}<NumericInput integer value={activeBot.pollIntervalSeconds} min={minPollIntervalSeconds} max={3600} onValue={(value) => updateBot({ pollIntervalSeconds: value })} /></label>
              <div className="metrics">
                <span>{text.gridDistance}: <b>{gridSpacing.toLocaleString('de-DE')} {activeBot.quoteAsset}</b></span>
                <span>{text.orders}: <b>{activeCreateSummary.orders}</b></span>
                <span>Buy/Sell: <b>{activeCreateSummary.buyOrders}/{activeCreateSummary.sellOrders}</b></span>
                <span>Asset: <b>{activeBot.orderSize} {activeBot.baseAsset}</b></span>
                <span>{text.orderNeed}: <b>{requiredCapital.toLocaleString('de-DE', { maximumFractionDigits: 2 })} {activeBot.quoteAsset}</b></span>
                <span>{text.query}: <b>{activeBot.pollIntervalSeconds}s</b></span>
                <span>{text.orderBook}: <b>{activeCreateSummary.blocked}</b></span>
              </div>
              <div className="order-preview">
                <div className="section-head"><h2>{text.orderPlan}</h2><small>{text.ready}</small></div>
                <button className="open-order-plan" type="button" onClick={() => setOrderPlanOpen(true)}>{text.openOrderList}<span>{activeCreateSummary.orders} {text.orders}</span></button>
              </div>
            </div>
          </section>
        )}
      </section>

      {setupOpen && (
        <div className="setup-overlay" role="presentation" onMouseDown={() => setSetupOpen(false)}>
          <section className="setup-drawer" role="dialog" aria-modal="true" aria-labelledby="setup-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div><p className="eyebrow">{text.programSetup}</p><h2 id="setup-title">{text.exchangesSecrets}</h2></div>
              <button className="icon-button" type="button" onClick={() => setSetupOpen(false)} aria-label={text.closeSetup} title={text.close}>×</button>
            </div>
            <p className="secret-note">{text.secretNote}</p>
            <div className="section-head">
              <h2>{text.exchanges}</h2>
              <select onChange={(event) => addExchange(event.target.value)} value={setupExchange?.name ?? ''}>
                {exchangeTemplates.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            {setupExchange && (
              <div className="exchange-box" key={setupExchange.id}>
                <div className="exchange-title">
                  <strong>{setupExchange.name}</strong>
                </div>
                <label>{text.apiKey}<input type="password" value={setupExchange.key} onChange={(event) => updateExchange({ key: event.target.value })} placeholder={setupExchange.name.toLowerCase() === 'phemex' && secretStatus.hasKey ? text.savedPlaceholder : text.keyPlaceholder} autoComplete="off" /></label>
                <label>{text.secret}<input type="password" value={setupExchange.secret} onChange={(event) => updateExchange({ secret: event.target.value })} placeholder={setupExchange.name.toLowerCase() === 'phemex' && secretStatus.hasSecret ? text.savedPlaceholder : text.secret} autoComplete="off" /></label>
                <label>{text.passphrase}<input type="password" value={setupExchange.passphrase} onChange={(event) => updateExchange({ passphrase: event.target.value })} placeholder={setupExchange.name.toLowerCase() === 'phemex' && secretStatus.hasPassphrase ? text.savedPlaceholder : text.optional} autoComplete="off" /></label>
                <button className="primary save-secret" type="button" onClick={saveExchangeDraft}>{text.apply}</button>
                {saveNotice && <div className="save-toast" role="status">{saveNotice}</div>}
              </div>
            )}
          </section>
        </div>
      )}

      {debugOpen && (
        <div className="debug-overlay" role="presentation" onMouseDown={() => setDebugOpen(false)}>
          <section className="debug-drawer" role="dialog" aria-modal="true" aria-labelledby="debug-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div><p className="eyebrow">{text.system}</p><h2 id="debug-title">Debug</h2></div>
              <button className="icon-button" type="button" onClick={() => setDebugOpen(false)} aria-label={text.closeDebug} title={text.close}>×</button>
            </div>
            <button className="clear-debug" type="button" onClick={() => setDebugEntries([])}>{text.clear}</button>
            <div className="debug-log">
              {debugEntries.length === 0 && <p className="debug-empty">{text.noEntries}</p>}
              {debugEntries.map((entry) => <article className="debug-entry" key={entry.id}><time>{entry.timestamp}</time><p>{entry.message}</p></article>)}
            </div>
          </section>
        </div>
      )}

      {orderPlanOpen && (
        <div className="modal-overlay" role="presentation" onMouseDown={() => setOrderPlanOpen(false)}>
          <section className="order-plan-modal" role="dialog" aria-modal="true" aria-labelledby="order-plan-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div><p className="eyebrow">{text.orderBook}</p><h2 id="order-plan-title">{text.orderPlan}</h2></div>
              <button className="icon-button" type="button" onClick={() => setOrderPlanOpen(false)} aria-label={text.closeOrderPlan} title={text.close}>×</button>
            </div>
            <div className="order-plan-summary"><span>{text.ready}</span><span>{activeCreateSummary.blocked} {text.locked}</span><span>{activeCreateSummary.buyOrders}/{activeCreateSummary.sellOrders} {text.buySell}</span></div>
            <div className="order-list expanded">
              {activeGridOrders.length ? activeGridOrders.map((order, index) => (
                <article className={`order-row ${order.side} ${order.status ?? ''}`} key={`${order.orderId || order.price}-${index}`}>
                  <b>{order.status?.startsWith('locked') ? 'Buy gesperrt' : order.side === 'buy' ? 'Buy' : 'Sell'}</b>
                  <span>{order.price.toLocaleString('de-DE', { maximumFractionDigits: 8 })} {activeBot.quoteAsset}</span>
                  <small>{text.priceRange}</small>
                  <small>{text.phemexOrderId}: {order.orderId || order.lockedBySellOrderId || '-'}</small>
                  {order.status?.startsWith('locked') && Number.isFinite(order.lockedBySellPrice) && (
                    <small>Sell-Ziel: {order.lockedBySellPrice!.toLocaleString('de-DE', { maximumFractionDigits: 8 })} {activeBot.quoteAsset}</small>
                  )}
                </article>
              )) : (
                <p className="order-empty">{text.noOpenOrders}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
