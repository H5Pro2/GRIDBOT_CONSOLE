import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'

export type Candle = {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

type MarketChartProps = {
  symbol: string
  lower: number
  upper: number
  gridLevels: number[]
  orderLines: ChartOrderLine[]
  candles: Candle[]
  interval: ChartInterval
  onInterval: (interval: ChartInterval) => void
  settings: ChartSettings
}

export type ChartOrderLine = {
  side: 'buy' | 'sell'
  price: number
  status?: string
  lockedBySellPrice?: number
}

export const intervals = ['5m', '15m', '1h', '4h', '1d'] as const
export type ChartInterval = (typeof intervals)[number]
export type ChartSettings = {
  buyLineColor: string
  buyLineOpacity: number
  sellLineColor: string
  sellLineOpacity: number
  emptyLineColor: string
  emptyLineOpacity: number
  lockedLineColor: string
  lockedLineOpacity: number
  currentPriceColor: string
  chartTextColor: string
  chartGridColor: string
  showPriceLevels: boolean
}

function clampOpacity(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1))
}

function colorWithOpacity(color: string, opacity: number) {
  const clean = color.trim()
  if (!/^#[0-9a-f]{6}$/i.test(clean)) return clean
  const red = Number.parseInt(clean.slice(1, 3), 16)
  const green = Number.parseInt(clean.slice(3, 5), 16)
  const blue = Number.parseInt(clean.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${clampOpacity(opacity)})`
}

function formatPriceLevel(price: number) {
  return price.toLocaleString('de-DE', { maximumFractionDigits: 8 })
}

export function MarketChart({
  symbol,
  gridLevels,
  orderLines,
  candles,
  interval,
  onInterval,
  settings,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const gridLineRefs = useRef<IPriceLine[]>([])
  const priceDragRef = useRef<{ startY: number; from: number; to: number; height: number } | null>(null)
  const priceScaleDragRef = useRef<{ startY: number; from: number; to: number; height: number } | null>(null)
  const [draggingPrice, setDraggingPrice] = useState(false)
  const [autoFocus, setAutoFocus] = useState(false)
  const dataKeyRef = useRef('')
  const previousCandlesRef = useRef<Candle[]>([])

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: settings.chartTextColor,
      },
      grid: {
        vertLines: { color: colorWithOpacity(settings.chartGridColor, 0.38) },
        horzLines: { color: colorWithOpacity(settings.chartGridColor, 0.45) },
      },
      rightPriceScale: {
        borderColor: settings.chartGridColor,
        autoScale: true,
      },
      timeScale: {
        borderColor: settings.chartGridColor,
        timeVisible: true,
        rightOffset: 8,
        barSpacing: 6,
        shiftVisibleRangeOnNewBar: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      crosshair: {
        mode: 1,
      },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ff7a30',
      borderUpColor: '#22c55e',
      borderDownColor: '#ff7a30',
      wickUpColor: '#22c55e',
      wickDownColor: '#ff7a30',
      priceLineColor: settings.currentPriceColor,
    })
    series.setData([])
    chartRef.current = chart
    seriesRef.current = series

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: {
        background: { color: 'transparent' },
        textColor: settings.chartTextColor,
      },
      grid: {
        vertLines: { color: colorWithOpacity(settings.chartGridColor, 0.38) },
        horzLines: { color: colorWithOpacity(settings.chartGridColor, 0.45) },
      },
      rightPriceScale: {
        borderColor: settings.chartGridColor,
      },
      timeScale: {
        borderColor: settings.chartGridColor,
      },
    })
    seriesRef.current?.applyOptions({ priceLineColor: settings.currentPriceColor })
  }, [settings])

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return
    const series = seriesRef.current
    const timeScale = chartRef.current.timeScale()
    const key = `${symbol}:${interval}`
    const firstLoad = dataKeyRef.current !== key && candles.length > 0
    const range = timeScale.getVisibleLogicalRange()
    const priceRange = series.priceScale().getVisibleRange()
    const previous = previousCandlesRef.current
    series.setData(candles)
    if (firstLoad) {
      timeScale.fitContent()
      series.priceScale().setAutoScale(true)
      dataKeyRef.current = key
    } else if (autoFocus) {
      timeScale.scrollToRealTime()
      series.priceScale().setAutoScale(true)
    } else {
      if (range && candles.length > 0) {
        // Keep the same candles on screen when the rolling history window moves.
        const anchorIndex = previous.findIndex((candle) => candle.time === candles[0].time)
        const reverseIndex = candles.findIndex((candle) => candle.time === previous[0]?.time)
        const offset = anchorIndex >= 0 ? -anchorIndex : Math.max(0, reverseIndex)
        timeScale.setVisibleLogicalRange({ from: range.from + offset, to: range.to + offset })
      }
      if (priceRange) series.priceScale().setVisibleRange(priceRange)
    }
    previousCandlesRef.current = candles
  }, [candles, symbol, interval, autoFocus])

  const visibleGridLevels = useMemo(() => gridLevels.filter(Number.isFinite).slice(0, 80), [gridLevels])
  const orderLineByPrice = useMemo(() => {
    const lines = new Map<string, ChartOrderLine>()
    const setLine = (price: number, line: ChartOrderLine) => {
      if (!Number.isFinite(price)) return
      const key = price.toFixed(8)
      const current = lines.get(key)
      const currentLocked = current?.status?.startsWith('locked') ?? false
      const incomingLocked = line.status?.startsWith('locked') ?? false
      if (!current || (currentLocked && !incomingLocked) || (currentLocked === incomingLocked && line.side === 'sell')) {
        lines.set(key, { ...line, price })
      }
    }

    for (const order of orderLines) {
      setLine(order.price, order)
      if (order.status?.startsWith('locked') && Number.isFinite(order.lockedBySellPrice)) {
        setLine(order.lockedBySellPrice!, { side: 'sell', price: order.lockedBySellPrice!, status: 'locked-target' })
      }
    }

    return lines
  }, [orderLines])

  const getGridLineOptions = (price: number) => {
    const order = orderLineByPrice.get(price.toFixed(8))
    if (!order) {
      return {
        color: colorWithOpacity(settings.emptyLineColor, settings.emptyLineOpacity),
        lineStyle: LineStyle.Dashed,
        lineWidth: 1 as const,
      }
    }
    if (order.status?.startsWith('locked')) {
      return {
        color: colorWithOpacity(settings.lockedLineColor, settings.lockedLineOpacity),
        lineStyle: LineStyle.Dashed,
        lineWidth: 1 as const,
      }
    }
    if (order.side === 'buy') {
      return {
        color: colorWithOpacity(settings.buyLineColor, settings.buyLineOpacity),
        lineStyle: LineStyle.Solid,
        lineWidth: 1 as const,
      }
    }
    return {
      color: colorWithOpacity(settings.sellLineColor, settings.sellLineOpacity),
      lineStyle: LineStyle.Solid,
      lineWidth: 1 as const,
    }
  }

  useEffect(() => {
    if (!seriesRef.current) return
    for (const line of gridLineRefs.current) {
      seriesRef.current.removePriceLine(line)
    }
    gridLineRefs.current = visibleGridLevels.map((price) => {
      const lineOptions = getGridLineOptions(price)
      return seriesRef.current!.createPriceLine({
        price,
        color: lineOptions.color,
        lineWidth: lineOptions.lineWidth,
        lineStyle: lineOptions.lineStyle,
        axisLabelVisible: settings.showPriceLevels,
        title: settings.showPriceLevels ? formatPriceLevel(price) : '',
      })
    })
  }, [visibleGridLevels, orderLineByPrice, settings])

  const zoom = (direction: 'in' | 'out') => {
    const timeScale = chartRef.current?.timeScale()
    const range = timeScale?.getVisibleLogicalRange()
    if (!timeScale || !range) return
    const center = (range.from + range.to) / 2
    const width = range.to - range.from
    const nextWidth = direction === 'in' ? width * 0.72 : width * 1.28
    timeScale.setVisibleLogicalRange({ from: center - nextWidth / 2, to: center + nextWidth / 2 })
  }

  const pan = (direction: 'left' | 'right') => {
    const timeScale = chartRef.current?.timeScale()
    const range = timeScale?.getVisibleLogicalRange()
    if (!timeScale || !range) return
    const shift = (range.to - range.from) * 0.22 * (direction === 'left' ? -1 : 1)
    timeScale.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift })
  }

  const fitChart = () => {
    chartRef.current?.timeScale().fitContent()
    seriesRef.current?.priceScale().setAutoScale(true)
  }

  const startPriceDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !seriesRef.current || !containerRef.current) return
    const priceScale = seriesRef.current.priceScale()
    const currentRange = priceScale.getVisibleRange()
    if (!currentRange) return
    priceScale.setAutoScale(false)
    priceDragRef.current = {
      startY: event.clientY,
      from: currentRange.from,
      to: currentRange.to,
      height: containerRef.current.clientHeight || 1,
    }
    setDraggingPrice(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePriceDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!priceDragRef.current || !seriesRef.current) return
    const { startY, from, to, height } = priceDragRef.current
    const rangeSize = to - from
    const deltaPrice = ((event.clientY - startY) / height) * rangeSize
    seriesRef.current.priceScale().setVisibleRange({
      from: from + deltaPrice,
      to: to + deltaPrice,
    })
  }

  const stopPriceDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!priceDragRef.current) return
    priceDragRef.current = null
    setDraggingPrice(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const startPriceScaleDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !seriesRef.current || !containerRef.current) return
    const priceScale = seriesRef.current.priceScale()
    const currentRange = priceScale.getVisibleRange()
    if (!currentRange) return
    priceScale.setAutoScale(false)
    priceScaleDragRef.current = {
      startY: event.clientY,
      from: currentRange.from,
      to: currentRange.to,
      height: containerRef.current.clientHeight || 1,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePriceScaleDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!priceScaleDragRef.current || !seriesRef.current) return
    const { startY, from, to, height } = priceScaleDragRef.current
    const center = (from + to) / 2
    const rangeSize = to - from
    const factor = Math.min(8, Math.max(0.125, Math.exp(((event.clientY - startY) / height) * 2.4)))
    const nextSize = rangeSize * factor
    seriesRef.current.priceScale().setVisibleRange({
      from: center - nextSize / 2,
      to: center + nextSize / 2,
    })
  }

  const stopPriceScaleDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!priceScaleDragRef.current) return
    priceScaleDragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="chart-panel">
      <div className="chart-head">
        <span>{symbol}</span>
        <div className="chart-actions">
          <div className="interval-group" aria-label="Chart Timeframe">
            {intervals.map((item) => (
              <button className={item === interval ? 'active' : ''} key={item} type="button" onClick={() => onInterval(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="zoom-group" aria-label="Chart Zoom">
            <button type="button" onClick={() => pan('left')}>‹</button>
            <button type="button" onClick={() => zoom('out')}>−</button>
            <button type="button" onClick={fitChart}>Fit</button>
            <button type="button" onClick={() => zoom('in')}>+</button>
            <button type="button" onClick={() => pan('right')}>›</button>
          </div>
          <button className={`autofocus-button${autoFocus ? ' active' : ''}`} type="button" aria-label="Autofokus" title="Autofokus" aria-pressed={autoFocus} onClick={() => setAutoFocus((current) => !current)}>A</button>
        </div>
      </div>
      <div
        className={`chart-canvas ${draggingPrice ? 'dragging' : ''}`}
        ref={containerRef}
        onPointerDown={startPriceDrag}
        onPointerMove={movePriceDrag}
        onPointerUp={stopPriceDrag}
        onPointerCancel={stopPriceDrag}
      />
      <div
        className="price-band"
        onPointerDown={startPriceScaleDrag}
        onPointerMove={movePriceScaleDrag}
        onPointerUp={stopPriceScaleDrag}
        onPointerCancel={stopPriceScaleDrag}
      />
    </div>
  )
}
