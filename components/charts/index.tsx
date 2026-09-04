"use client";

import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, ComposedChart,
} from "recharts";
import { cn } from "@/lib/utils";
import { useDrilldown } from "@/components/panels/drilldown-context";
import type { BreakdownRow, Kpis } from "@/lib/types";
import { compact, currency, num, pct, shortDate } from "@/lib/format";

type ValueType = "currency" | "number" | "percent" | "compact" | "ratio";

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
];

export function chartColor(i: number) {
  return CHART_COLORS[i % CHART_COLORS.length];
}

function fmt(value: number, type: ValueType, code = "USD") {
  switch (type) {
    case "currency": return currency(value, code, { compact: Math.abs(value) >= 10000 });
    case "percent": return pct(value);
    case "ratio": return `${value.toFixed(2)}×`;
    case "compact": return compact(value);
    default: return num(value, Math.abs(value) < 100 ? 1 : 0);
  }
}

function Tip({
  active, payload, label, type, code, labelFormatter,
}: {
  active?: boolean; payload?: any[]; label?: any; type?: ValueType; code?: string;
  labelFormatter?: (label: any) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 shadow-lift backdrop-blur">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {labelFormatter ? labelFormatter(label) : typeof label === "string" && label.includes("-") ? shortDate(label) : label}
      </p>
      <div className="space-y-0.5">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.fill }} />
            <span className="text-muted">{p.name ?? p.payload?.key}</span>
            <span className="num ml-auto font-semibold">{fmt(Number(p.value ?? 0), (p?.payload?.valueType as ValueType) ?? type ?? "number", code)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const axisProps = {
  stroke: "hsl(var(--line))",
  tick: { fill: "hsl(var(--faint))", fontSize: 11 },
  tickLine: false,
  axisLine: false,
};

/* ───────────────────────── Area / line trend ───────────────────────── */

export function TrendChart({
  data, keys, height = 300, type = "number", code = "USD", showGrid = true, compare,
}: {
  data: any[];
  keys: { key: string; label: string; color?: string; type?: ValueType; area?: boolean; dashed?: boolean }[];
  height?: number;
  type?: ValueType;
  code?: string;
  showGrid?: boolean;
  compare?: { key: string; label: string; color?: string };
}) {
  const gradientId = React.useId().replace(/[:]/g, "");
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            {keys.map((k, i) => (
              <linearGradient key={k.key} id={`${gradientId}-${k.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={k.color ?? chartColor(i)} stopOpacity={0.32} />
                <stop offset="100%" stopColor={k.color ?? chartColor(i)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {showGrid ? <CartesianGrid vertical={false} stroke="hsl(var(--line))" strokeDasharray="4 6" /> : null}
          <XAxis dataKey="date" {...axisProps} minTickGap={24} tickFormatter={(v) => shortDate(v)} />
          <YAxis {...axisProps} width={54} tickFormatter={(v) => (type === "currency" ? currency(v, code, { compact: true }) : type === "percent" ? `${v.toFixed(1)}%` : compact(v))} />
          <Tooltip content={<Tip type={type} code={code} />} cursor={{ stroke: "hsl(var(--brand-500))", strokeWidth: 1, strokeDasharray: "4 4" }} />
          <Legend
            verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8}
            formatter={(v) => <span className="text-[11px] text-muted">{v}</span>}
          />
          {keys.map((k, i) =>
            k.area === false ? (
              <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color ?? chartColor(i)} strokeWidth={2} dot={false} strokeDasharray={k.dashed ? "5 5" : undefined} />
            ) : (
              <Area key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color ?? chartColor(i)} strokeWidth={2} fill={`url(#${gradientId}-${k.key})`} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} />
            ),
          )}
          {compare ? (
            <Line type="monotone" dataKey={compare.key} name={compare.label} stroke={compare.color ?? "hsl(var(--faint))"} strokeWidth={1.6} strokeDasharray="5 5" dot={false} />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────── Bar list (pure DOM) ───────────────────────── */

export type BarListRow = {
  label: string;
  value: number;
  sub?: string;
  tone?: string;
  /** Full breakdown row, supplied when the bar should open a drill-down. */
  row?: BreakdownRow;
};

export function BarList({
  rows, type = "currency", code = "USD", max, className, color,
  dimension, account, interactive = true,
}: {
  rows: BarListRow[];
  type?: ValueType;
  code?: string;
  max?: number;
  className?: string;
  color?: string;
  dimension?: string;
  account?: Kpis;
  interactive?: boolean;
}) {
  const { open } = useDrilldown();
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  const canDrill = interactive && Boolean(dimension && account && rows.some((r) => r.row));

  return (
    <div className={cn("space-y-2.5", className)}>
      {rows.map((r, i) => {
        const body = (
          <div className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className={cn("truncate font-medium", canDrill && r.row && "group-hover:text-brand-500")} title={r.label}>
                {r.label}
              </span>
              <span className="num shrink-0 text-muted">
                <span className="font-semibold text-ink">{fmt(r.value, type, code)}</span>
                {r.sub ? <span className="ml-1.5 text-faint">{r.sub}</span> : null}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(2, (r.value / top) * 100)}%`,
                  background: r.tone ?? color ?? `linear-gradient(90deg, ${chartColor(i)}, ${chartColor(i + 1)})`,
                }}
              />
            </div>
          </div>
        );

        if (canDrill && r.row) {
          return (
            <button
              key={r.label}
              onClick={() =>
                open({ kind: "segment", payload: { label: r.label, dimension, row: r.row, account, code } })
              }
              className="block w-full rounded-lg text-left transition hover:bg-ink/[0.03]"
              title={`Open ${r.label} breakdown`}
            >
              {body}
            </button>
          );
        }
        return <div key={r.label}>{body}</div>;
      })}
    </div>
  );
}

/* ───────────────────────── Donut ───────────────────────── */

export function DonutChart({
  data, height = 260, type = "currency", code = "USD", center, dimension, account, interactive = true,
}: {
  data: ({ label: string; value: number; row?: BreakdownRow })[];
  height?: number;
  type?: ValueType;
  code?: string;
  center?: React.ReactNode;
  dimension?: string;
  account?: Kpis;
  interactive?: boolean;
}) {
  const { open } = useDrilldown();
  const total = data.reduce((a, b) => a + b.value, 0);
  const canDrill = interactive && Boolean(dimension && account);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="88%"
            paddingAngle={2} stroke="hsl(var(--surface))" strokeWidth={2}
            onClick={(entry: any) => {
              if (!canDrill) return;
              const payload = entry?.payload ?? entry;
              if (payload?.row) {
                open({ kind: "segment", payload: { label: payload.label, dimension, row: payload.row, account, code } });
              }
            }}
            className={canDrill ? "cursor-pointer" : undefined}
          >
            {data.map((_, i) => <Cell key={i} fill={chartColor(i)} />)}
          </Pie>
          <Tooltip content={<Tip type={type} code={code} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-faint">{center ?? "Total"}</p>
          <p className="num text-lg font-semibold">{fmt(total, type, code)}</p>
        </div>
      </div>
    </div>
  );
}

export function DonutLegend({
  data, type = "currency", code = "USD", className, dimension, account,
}: {
  data: ({ label: string; value: number; row?: BreakdownRow })[];
  type?: ValueType; code?: string; className?: string; dimension?: string; account?: Kpis;
}) {
  const { open } = useDrilldown();
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const canDrill = Boolean(dimension && account);
  return (
    <ul className={cn("space-y-1.5", className)}>
      {data.map((d, i) => (
        <li
          key={d.label}
          onClick={() => {
            if (canDrill && d.row) open({ kind: "segment", payload: { label: d.label, dimension, row: d.row, account, code } });
          }}
          className={cn("flex items-center gap-2 rounded-md px-1 py-0.5 text-xs transition", canDrill && d.row && "cursor-pointer hover:bg-ink/5 hover:text-brand-500")}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: chartColor(i) }} />
          <span className="truncate">{d.label}</span>
          <span className="num ml-auto shrink-0 text-muted">{pct((d.value / total) * 100, 1)}</span>
          <span className="num w-16 shrink-0 text-right font-medium">{fmt(d.value, type, code)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── Stacked bar (age × gender) ───────────────────────── */

export function StackedBarChart({
  data, stacks, height = 280, type = "number", code = "USD",
}: { data: any[]; stacks: { key: string; label: string; color?: string }[]; height?: number; type?: ValueType; code?: string }) {
  const gid = React.useId().replace(/[:]/g, "");
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="hsl(var(--line))" strokeDasharray="4 6" />
          <XAxis dataKey="key" {...axisProps} />
          <YAxis {...axisProps} width={54} tickFormatter={(v) => (type === "currency" ? currency(v, code, { compact: true }) : compact(v))} />
          <Tooltip content={<Tip type={type} code={code} />} cursor={{ fill: "hsl(var(--ink) / 0.04)" }} />
          <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} formatter={(v) => <span className="text-[11px] text-muted">{v}</span>} />
          {stacks.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color ?? chartColor(i)} radius={i === stacks.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} barSize={26} />
          ))}
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.9} />
              <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────── Funnel ───────────────────────── */

export function FunnelChart({ steps, className }: { steps: { label: string; value: number; note?: string }[]; className?: string }) {
  const top = steps[0]?.value || 1;
  return (
    <div className={cn("space-y-2", className)}>
      {steps.map((s, i) => {
        const width = Math.max(6, (s.value / top) * 100);
        const drop = i === 0 ? null : 1 - s.value / (steps[i - 1].value || 1);
        return (
          <div key={s.label} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium">{s.label}</span>
              <span className="num text-muted">
                <span className="font-semibold text-ink">{compact(s.value)}</span>
                {drop !== null ? <span className="ml-1.5 text-neg">−{pct(drop * 100, 0)}</span> : null}
              </span>
            </div>
            <div className="relative h-8 overflow-hidden rounded-lg bg-ink/5">
              <div
                className="h-full rounded-lg transition-all duration-700"
                style={{ width: `${width}%`, background: `linear-gradient(90deg, hsl(var(--chart-1) / 0.85), hsl(var(--chart-2) / 0.85))` }}
              />
              <div className="absolute inset-0 flex items-center px-3">
                <span className="text-[11px] font-medium text-white/90 mix-blend-luminosity">{s.note}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Heatmap (day × hour) ───────────────────────── */

export function Heatmap({
  cells, days, className, code = "USD", interactive = true,
}: { cells: { day: number; hour: number; value: number }[]; days: string[]; className?: string; code?: string; interactive?: boolean }) {
  const { open } = useDrilldown();
  const [hover, setHover] = React.useState<{ day: number; hour: number; value: number } | null>(null);
  const max = Math.max(...cells.map((c) => c.value), 1);
  const grid = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cells) map.set(`${c.day}-${c.hour}`, c.value);
    return map;
  }, [cells]);

  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-1.5">
        <div className="flex w-8 flex-col gap-[3px] pt-4">
          {days.map((d) => (
            <div key={d} className="flex h-[14px] items-center text-[10px] text-faint">{d}</div>
          ))}
        </div>
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="mb-1 flex gap-[3px]">
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-faint">{h % 3 === 0 ? h : ""}</div>
              ))}
            </div>
            {days.map((_, d) => (
              <div key={d} className="mb-[3px] flex gap-[3px]">
                {Array.from({ length: 24 }).map((__, h) => {
                  const v = grid.get(`${d}-${h}`) ?? 0;
                  const alpha = Math.pow(v / max, 0.75);
                  return (
                    <div
                      key={h}
                      onMouseEnter={() => setHover({ day: d, hour: h, value: v })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() =>
                        interactive &&
                        open({
                          kind: "time",
                          payload: {
                            day: d, hour: h, value: v, dayName: days[d],
                            total: cells.reduce((a, c) => a + c.value, 0), code,
                          },
                        })
                      }
                      className={cn("h-[14px] flex-1 rounded-[3px] transition-transform", interactive ? "cursor-pointer hover:scale-125" : "hover:scale-110")}
                      style={{
                        background: v > 0
                          ? `hsl(var(--chart-1) / ${0.08 + alpha * 0.85})`
                          : "hsl(var(--ink) / 0.05)",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] text-faint">
          <span>Low</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((a) => (
            <span key={a} className="h-3 w-5 rounded-[3px]" style={{ background: `hsl(var(--chart-1) / ${a})` }} />
          ))}
          <span>High</span>
        </div>
        <div className="h-5 text-[11px] text-muted">
          {hover ? `${days[hover.day]} · ${hover.hour}:00–${hover.hour}:59 · ${compact(hover.value)} results · click to drill down` : (interactive ? "Click any cell for the time-window breakdown" : "")}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Scatter (spend vs CPA) ───────────────────────── */

export function BubbleScatter({
  data, code = "USD", height = 320,
}: { data: { name: string; spend: number; cpa: number; results: number }[]; code?: string; height?: number }) {
  const maxResults = Math.max(...data.map((d) => d.results), 1);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 12, left: -8, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--line))" strokeDasharray="4 6" />
          <XAxis type="number" dataKey="spend" name="Spend" {...axisProps} tickFormatter={(v) => currency(v, code, { compact: true })} />
          <YAxis type="number" dataKey="cpa" name="CPA" {...axisProps} width={54} tickFormatter={(v) => currency(v, code, { compact: true })} />
          <ZAxis type="number" dataKey="results" range={[40, 480]} domain={[0, maxResults]} />
          <Tooltip
            cursor={{ strokeDasharray: "4 4" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as any;
              return (
                <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-lift">
                  <p className="mb-1 max-w-[220px] font-semibold">{d.name}</p>
                  <p className="text-muted">Spend <span className="num text-ink">{currency(d.spend, code, { compact: true })}</span></p>
                  <p className="text-muted">CPA <span className="num text-ink">{currency(d.cpa, code, { compact: true })}</span></p>
                  <p className="text-muted">Results <span className="num text-ink">{num(d.results)}</span></p>
                </div>
              );
            }}
          />
          <Scatter data={data} fill="hsl(var(--chart-1))" fillOpacity={0.55} stroke="hsl(var(--chart-1))" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────── Mini area (sparkline via recharts) ───────────────────────── */

export function MiniArea({ data, color = "hsl(var(--chart-1))", height = 40 }: { data: { i: number; v: number }[]; color?: string; height?: number }) {
  const gid = React.useId().replace(/[:]/g, "");
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#${gid})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
