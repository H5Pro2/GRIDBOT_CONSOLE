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
}

export type ChartOrderLine = {
  side: 'buy' | 'sell'
  price: number
  status?: string
  lockedBySellPrice?: number
}

export const intervals = ['5m', '15m', '1h', '4h', '1d'] as const
export type ChartInterval = (typeof intervals)[number]

export function MarketChart({
  symbol,
  lower,
  upper,
  gridLevels,
  orderLines,
  candles,
  interval,
  onInterval,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const gridLineRefs = useRef<IPriceLine[]>([])
  const priceDragRef = useRef<{ startY: number; from: number; to: number; height: number } | null>(null)
  const priceScaleDragRef = useRef<{ startY: number; from: number; to: number; height: number } | null>(null)
  const [draggingPrice, setDraggingPrice] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: 'rgba(52, 58, 70, 0.38)' },
        horzLines: { color: 'rgba(52, 58, 70, 0.45)' },
      },
      rightPriceScale: {
        borderColor: '#343a46',
        autoScale: true,
      },
      timeScale: {
        borderColor: '#343a46',
        timeVisible: true,
        rightOffset: 8,
        barSpacing: 6,
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
    if (!seriesRef.current || !chartRef.current) return
    seriesRef.current.setData(candles)
    if (candles.length > 0) chartRef.current.timeScale().fitContent()
  }, [candles])

  useEffect(() => {
    if (!seriesRef.current) return
    seriesRef.current.priceScale().applyOptions({ autoScale: true })
  }, [lower, upper])

  const visibleGridLevels = useMemo(() => gridLevels.filter(Number.isFinite).slice(0, 80), [gridLevels])
  const orderLineByPrice = useMemo(() => {
    const lines = new Map<string, ChartOrderLine>()
    const setLine = (price: number, line: ChartOrderLine) => {
      if (!Number.isFinite(price)) return
      const key = price.toFixed(8)
      const current = lines.get(key)
      if (!current || current.status?.startsWith('locked') || line.side === 'sell') {
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
        color: 'rgba(148, 163, 184, 0.24)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1 as const,
      }
    }
    if (order.status?.startsWith('locked')) {
      return {
        color: 'rgba(245, 158, 11, 0.72)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1 as const,
      }
    }
    if (order.side === 'buy') {
      return {
        color: 'rgba(34, 197, 94, 0.82)',
        lineStyle: LineStyle.Solid,
        lineWidth: 2 as const,
      }
    }
    return {
      color: 'rgba(239, 68, 68, 0.82)',
      lineStyle: LineStyle.Solid,
      lineWidth: 2 as const,
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
        axisLabelVisible: false,
        title: '',
      })
    })
  }, [visibleGridLevels, orderLineByPrice])

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
