import type { DailyPoint } from "@/lib/admin-stats.server"
import { cn } from "@/lib/utils"

const VIEWBOX_WIDTH = 640
const VIEWBOX_HEIGHT = 170
const CHART_TOP = 16
const CHART_BOTTOM = 140
const HALF_GRIDLINE_Y = 78
const BAR_GAP = 2
const NICE_STEPS = [1, 2, 2.5, 5, 10] as const

const numberFormatter = new Intl.NumberFormat("en-US")

function shortDate(day: string) {
  return day.slice(5)
}

function niceMaxValue(max: number) {
  if (max <= 1) return 1

  const power = 10 ** Math.floor(Math.log10(max))
  for (const step of NICE_STEPS) {
    const candidate = step * power
    if (candidate >= max) return candidate
  }

  return 10 * power
}

function formatGridlineValue(value: number) {
  return numberFormatter.format(Number.isInteger(value) ? value : Math.round(value))
}

export function DailyBarChart({
  ariaLabel,
  className,
  points,
}: Readonly<{
  ariaLabel: string
  className?: string
  points: DailyPoint[]
}>) {
  const max = Math.max(...points.map((point) => point.count), 0)
  const chartHeight = CHART_BOTTOM - CHART_TOP
  const barWidth =
    points.length > 0 ? (VIEWBOX_WIDTH - BAR_GAP * Math.max(points.length - 1, 0)) / points.length : VIEWBOX_WIDTH
  const niceMax = niceMaxValue(max)
  const first = points[0]?.day ?? ""
  const last = points.at(-1)?.day ?? ""

  return (
    <svg
      aria-label={ariaLabel}
      className={cn("h-40 w-full overflow-visible", className)}
      role="img"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
    >
      <line x1={0} x2={VIEWBOX_WIDTH} y1={CHART_TOP} y2={CHART_TOP} className="stroke-border" strokeDasharray="4 4" />
      <line
        x1={0}
        x2={VIEWBOX_WIDTH}
        y1={HALF_GRIDLINE_Y}
        y2={HALF_GRIDLINE_Y}
        className="stroke-border"
        strokeDasharray="4 4"
      />
      <line x1={0} x2={VIEWBOX_WIDTH} y1={CHART_BOTTOM} y2={CHART_BOTTOM} className="stroke-border" />
      <text textAnchor="end" x={636} y={CHART_TOP - 4} className="fill-muted-foreground/75 text-[10px]">
        {formatGridlineValue(niceMax)}
      </text>
      <text textAnchor="end" x={636} y={HALF_GRIDLINE_Y - 4} className="fill-muted-foreground/75 text-[10px]">
        {formatGridlineValue(niceMax / 2)}
      </text>
      {points.map((point, index) => {
        if (point.count <= 0) return null

        const height = (point.count / niceMax) * chartHeight
        const x = index * (barWidth + BAR_GAP)
        const y = CHART_BOTTOM - height

        return (
          <rect
            key={point.day}
            className="fill-[var(--chart-1)]"
            height={height}
            rx={1.5}
            width={Math.max(barWidth, 1)}
            x={x}
            y={y}
          />
        )
      })}
      <text x={0} y={154} className="fill-muted-foreground/75 text-[10px]">
        {shortDate(first)}
      </text>
      <text textAnchor="end" x={VIEWBOX_WIDTH} y={154} className="fill-muted-foreground/75 text-[10px]">
        {shortDate(last)}
      </text>
    </svg>
  )
}
