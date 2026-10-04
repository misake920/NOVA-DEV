import { useEffect, useId, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { money, type Currency } from "../lib/workspace";
import "./neon-chart.css";

export interface NeonPoint {
  label: string;
  value: number;
  position?: number;
}
export interface NeonTick {
  label: string;
  position: number;
}
interface NeonChartProps {
  points: NeonPoint[];
  currency: Currency;
  paused?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  ticks?: NeonTick[];
  ariaLabel?: string;
  className?: string;
  comparisonPoints?: NeonPoint[];
  seriesLabel?: string;
  comparisonLabel?: string;
  showPoints?: boolean;
  smooth?: boolean;
}

const LEFT = 65,
  RIGHT = 1080,
  TOP = 36,
  BASE = 310,
  HEIGHT = 355;

export default function NeonChart({
  points,
  currency,
  paused = false,
  empty = false,
  emptyTitle = "À espera da sua primeira venda.",
  emptyDescription = "Cada venda adicionada acende este gráfico.",
  ticks,
  ariaLabel = "Gráfico de faturamento acumulado",
  className = "",
  comparisonPoints = [],
  seriesLabel = "Hoje",
  comparisonLabel = "Ontem",
  showPoints = false,
  smooth = false,
}: NeonChartProps) {
  const unique = useId().replace(/:/g, ""),
    root = useRef<HTMLDivElement>(null),
    [active, setActive] = useState<number | null>(null);
  const signature =
    points.map((p) => `${p.value}:${p.position ?? ""}:${p.label}`).join("|") +
    "/" +
    comparisonPoints
      .map((p) => `${p.value}:${p.position ?? ""}:${p.label}`)
      .join("|");
  const geometry = useMemo(() => {
    const min = Math.min(
        0,
        ...points.map((p) => p.value),
        ...comparisonPoints.map((p) => p.value),
      ),
      max = Math.max(
        0,
        ...points.map((p) => p.value),
        ...comparisonPoints.map((p) => p.value),
      );
    const span = max - min || 1;
    const positions = (values: NeonPoint[]) =>
      values.map((p, i) => ({
        ...p,
        x:
          LEFT +
          Math.max(
            0,
            Math.min(1, p.position ?? i / Math.max(1, values.length - 1)),
          ) *
            (RIGHT - LEFT),
        y: BASE - ((p.value - min) / span) * (BASE - TOP),
      }));
    const coordinates = positions(points),
      comparisonCoordinates = positions(comparisonPoints);
    const path = (values: typeof coordinates) =>
      values
        .map((p, i) => {
          if (!i) return `M${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          if (!smooth) return `L${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          const previous = values[i - 1],
            delta = (p.x - previous.x) / 3;
          return `C${previous.x + delta},${previous.y} ${p.x - delta},${p.y} ${p.x},${p.y}`;
        })
        .join(" ");
    const line = path(coordinates),
      comparisonLine = path(comparisonCoordinates);
    const first = coordinates[0],
      last = coordinates[coordinates.length - 1];
    const fill =
      first && last ? `${line} L${last.x},${BASE} L${first.x},${BASE} Z` : "";
    return {
      coordinates,
      comparisonCoordinates,
      comparisonLine,
      line,
      fill,
      max,
      min,
      span,
      last,
    };
  }, [signature, smooth]);
  const point =
    active === null
      ? null
      : geometry.coordinates[Math.min(active, geometry.coordinates.length - 1)];
  const comparisonPoint =
    point && geometry.comparisonCoordinates.length
      ? geometry.comparisonCoordinates.reduce((closest, item) =>
          Math.abs(item.x - point.x) < Math.abs(closest.x - point.x)
            ? item
            : closest,
        )
      : null;

  useEffect(() => {
    if (
      !root.current ||
      paused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const context = gsap.context(() => {
      const path =
        root.current?.querySelector<SVGPathElement>(".neon-chart-stroke");
      if (path) {
        const length = path.getTotalLength();
        gsap.fromTo(
          path,
          { strokeDasharray: length, strokeDashoffset: length },
          {
            strokeDashoffset: 0,
            duration: 1.15,
            ease: "power3.out",
            clearProps: "strokeDasharray,strokeDashoffset",
          },
        );
      }
      gsap.fromTo(
        ".neon-chart-area",
        { opacity: 0 },
        { opacity: 1, duration: 1.3, ease: "power2.out" },
      );
    }, root);
    return () => context.revert();
  }, [signature, paused]);
  useEffect(() => {
    setActive(null);
  }, [currency]);

  const activateAt = (clientX: number) => {
    if (!root.current || !geometry.coordinates.length) return;
    const rect = root.current.getBoundingClientRect(),
      plotX = ((clientX - rect.left) / rect.width) * 1100;
    let closest = 0;
    geometry.coordinates.forEach((p, i) => {
      if (
        Math.abs(p.x - plotX) <
        Math.abs(geometry.coordinates[closest].x - plotX)
      )
        closest = i;
    });
    setActive(closest);
  };
  const axisMoney = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
      style: "currency",
      currency,
    }).format(value / 100);
  const defaultTicks =
    points.length > 1
      ? [
          { label: points[0].label, position: 0 },
          {
            label: points[Math.floor((points.length - 1) / 2)].label,
            position: 0.5,
          },
          { label: points[points.length - 1].label, position: 1 },
        ]
      : [];
  return (
    <div
      ref={root}
      className={`neon-chart ${className}`}
      tabIndex={0}
      aria-label={ariaLabel + ". Use as setas para consultar os valores."}
      onPointerMove={(event) => activateAt(event.clientX)}
      onPointerLeave={() => setActive(null)}
      onFocus={() => setActive(geometry.coordinates.length - 1)}
      onBlur={() => setActive(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setActive((current) =>
            Math.max(
              0,
              Math.min(
                geometry.coordinates.length - 1,
                (current ?? geometry.coordinates.length - 1) +
                  (event.key === "ArrowLeft" ? -1 : 1),
              ),
            ),
          );
        }
        if (event.key === "Escape") setActive(null);
      }}
    >
      <svg
        viewBox={`0 0 1100 ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${ariaLabel}: ${money(geometry.last?.value || 0, currency)} no último ponto.`}
      >
        <defs>
          <linearGradient
            id={`neon-area-${unique}`}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0" stopColor="#ff153e" stopOpacity=".55" />
            <stop offset=".55" stopColor="#ff003c" stopOpacity=".15" />
            <stop offset="1" stopColor="#ff003c" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={`neon-stroke-${unique}`}
            gradientUnits="userSpaceOnUse"
            x1={LEFT}
            x2={RIGHT}
            y1={BASE}
            y2={BASE}
          >
            <stop offset="0" stopColor="#c90031" />
            <stop offset=".43" stopColor="#ff003c" />
            <stop offset="1" stopColor="#ff8c76" />
          </linearGradient>
          <filter
            id={`neon-blur-${unique}`}
            x="-50%"
            y="-120%"
            width="200%"
            height="340%"
          >
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <linearGradient
            id={`neon-grid-${unique}`}
            x1="0"
            x2="0"
            y1="1"
            y2="0"
          >
            <stop offset="0" stopColor="#ff003c" stopOpacity=".045" />
            <stop offset="1" stopColor="#ff003c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x={LEFT}
          y={TOP}
          width={RIGHT - LEFT}
          height={BASE - TOP}
          fill={`url(#neon-grid-${unique})`}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = BASE - ratio * (BASE - TOP);
          return (
            <line
              key={ratio}
              x1={LEFT}
              x2={RIGHT}
              y1={y}
              y2={y}
              stroke="#ffffff"
              strokeOpacity={ratio === 0 ? ".10" : ".055"}
              strokeDasharray={ratio === 0 ? "0" : "3 7"}
            />
          );
        })}
        {(ticks || defaultTicks).map((tick) => (
          <line
            key={tick.label}
            x1={LEFT + tick.position * (RIGHT - LEFT)}
            x2={LEFT + tick.position * (RIGHT - LEFT)}
            y1={TOP}
            y2={BASE}
            stroke="#ffffff"
            strokeOpacity=".04"
            strokeDasharray="3 8"
          />
        ))}
        {geometry.comparisonLine && (
          <path
            d={geometry.comparisonLine}
            fill="none"
            stroke="#c6d4e5"
            strokeOpacity=".53"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {geometry.fill && (
          <path
            className="neon-chart-area"
            d={geometry.fill}
            fill={`url(#neon-area-${unique})`}
          />
        )}
        {geometry.line && (
          <>
            <path
              d={geometry.line}
              fill="none"
              stroke="#ff003c"
              strokeWidth="9"
              strokeOpacity=".65"
              filter={`url(#neon-blur-${unique})`}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="neon-chart-stroke"
              d={geometry.line}
              fill="none"
              stroke={`url(#neon-stroke-${unique})`}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {showPoints &&
          geometry.coordinates.map((item, index) => (
            <circle
              key={index}
              cx={item.x}
              cy={item.y}
              r="3"
              fill="#ff6380"
              stroke="#ff184a"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {geometry.last && (
          <g>
            <circle
              cx={geometry.last.x}
              cy={geometry.last.y}
              r="10"
              fill="#ff003c"
              fillOpacity=".15"
            />
            <circle
              cx={geometry.last.x}
              cy={geometry.last.y}
              r="4"
              fill="#ff7f70"
              stroke="#14060a"
              strokeWidth="2"
            />
            <circle
              cx={geometry.last.x}
              cy={geometry.last.y}
              r="4"
              fill="#ff4f59"
              filter={`url(#neon-blur-${unique})`}
            />
          </g>
        )}
        {point && (
          <g>
            <line
              x1={point.x}
              x2={point.x}
              y1={TOP}
              y2={BASE}
              stroke="#ff4765"
              strokeOpacity=".6"
              strokeDasharray="3 4"
            />
            <circle
              cx={point.x}
              cy={point.y}
              r="6"
              fill="#fff2ef"
              stroke="#ff003c"
              strokeWidth="3"
            />
          </g>
        )}
      </svg>
      <div className="neon-chart-labels" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1]
          .filter((ratio) => geometry.max !== geometry.min || ratio === 0)
          .map((ratio) => (
            <span
              className="neon-chart-y-label"
              key={ratio}
              style={{
                left: `${((LEFT - 12) / 1100) * 100}%`,
                top: `${((BASE - ratio * (BASE - TOP)) / HEIGHT) * 100}%`,
              }}
            >
              {geometry.max === geometry.min && ratio === 0
                ? "0"
                : axisMoney(geometry.min + geometry.span * ratio)}
            </span>
          ))}
        {(ticks || defaultTicks).map((tick) => (
          <span
            className={
              "neon-chart-x-label " +
              (tick.position === 0
                ? "is-first"
                : tick.position === 1
                  ? "is-last"
                  : "")
            }
            key={tick.label}
            style={{
              left: `${((LEFT + tick.position * (RIGHT - LEFT)) / 1100) * 100}%`,
            }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      {empty && (
        <div className="neon-chart-empty">
          <span className="neon-chart-empty-signal" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      )}
      {point && (
        <div
          className="neon-chart-tooltip"
          style={{
            left: `${Math.max(13, Math.min(87, (point.x / 1100) * 100))}%`,
            top: `${Math.max(7, Math.min(65, (point.y / HEIGHT) * 100 - 20))}%`,
          }}
          role="status"
        >
          <span>{point.label}</span>
          <strong>
            {comparisonPoint && seriesLabel + ": "}
            {money(point.value, currency)}
          </strong>
          {comparisonPoint && (
            <small>
              {comparisonLabel}: {money(comparisonPoint.value, currency)}
            </small>
          )}
        </div>
      )}
      <p className="sr-only">
        {points
          .map((p) => `${p.label}: ${money(p.value, currency)}`)
          .join("; ")}
        .
      </p>
    </div>
  );
}
