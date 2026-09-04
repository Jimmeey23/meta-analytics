"use client";
import * as React from "react";
import { Activity, Coins, Crosshair, MousePointerClick, Target, TrendingUp, Wallet } from "lucide-react";
import { Delta, Panel, Sparkline } from "@/components/ui/primitives";
import { useDrilldown } from "./drilldown-context";
import { currency, num, pct } from "@/lib/format";
import { pctChange, safeDiv } from "@/lib/utils";
import type { Kpis, SeriesPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

type Card = {
  key: string;
  code: string;
  kpis: Kpis;
  prev: Kpis;
  series: { date: string; value: number }[];
  prevSeries: { date: string; value: number }[];
  rows: any[];
  label: string;
  value: string;
  delta: number | null;
  invert?: boolean;
  icon: React.ReactNode;
  spark: number[];
  color: string;
  hint: string;
};

export function KpiCard({ card, days }: { card: Card; days: number }) {
  const { open } = useDrilldown();
  return (
    <Panel
      className="panel-hover cursor-pointer p-4"
      onClick={() =>
        open({
          kind: "metric",
          payload: {
            key: card.key,
            label: card.label,
            code: card.code,
            kpis: card.kpis,
            prev: card.prev,
            series: card.series,
            prevSeries: card.prevSeries,
            rows: card.rows,
          },
        })
      }
      title={`Open ${card.label} breakdown`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{card.label}</p>
          <p className="mt-1.5 truncate text-[26px] font-semibold leading-none num">{card.value}</p>
        </div>
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1"
          style={{ background: `hsl(var(--${card.color}) / 0.12)`, color: `hsl(var(--${card.color}))` }}
        >
          {card.icon}
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Delta value={card.delta} invert={card.invert} />
          <p className="mt-1 truncate text-[10px] text-faint">vs prev {days}d · {card.hint}</p>
        </div>
        <Sparkline data={card.spark} width={96} height={34} stroke={`hsl(var(--${card.color}))`} />
      </div>
    </Panel>
  );
}

export function KpiGrid({
  kpis, prev, series, prevSeries = [], code, days, rows = [],
}: { kpis: Kpis; prev: Kpis; series: SeriesPoint[]; prevSeries?: SeriesPoint[]; code: string; days: number; rows?: any[] }) {
  const money = (v: number) => currency(v, code, { compact: true });
  const conv = kpis.leads + kpis.purchases;
  const prevConv = prev.leads + prev.purchases;
  const metricValue = (k: Kpis, key: string) =>
    key === "conversions" ? k.leads + k.purchases
      : key === "costPerConversion" ? (k.leads + k.purchases ? k.spend / (k.leads + k.purchases) : 0)
        : (k[key as keyof Kpis] as number) ?? 0;
  const seriesFor = (key: string, arr: SeriesPoint[]) =>
    arr.map((s) => ({
      date: s.date,
      value: key === "conversions" ? s.leads + s.purchases
        : key === "costPerConversion" ? (s.leads + s.purchases ? s.spend / (s.leads + s.purchases) : 0)
          : (((s[key as keyof SeriesPoint] as number) ?? 0) as number),
    }));
  const base = { code, kpis, prev, rows };
  const cards: Card[] = [
    {
      key: "spend", ...base, series: seriesFor("spend", series), prevSeries: seriesFor("spend", prevSeries),
      label: "Amount spent", value: money(kpis.spend), delta: pctChange(kpis.spend, prev.spend), icon: <Wallet className="h-4 w-4" />,
      spark: series.map((s) => s.spend), color: "chart-1", hint: `${money(kpis.spend / Math.max(days, 1))}/day`,
    },
    {
      key: "conversions", ...base, series: seriesFor("conversions", series), prevSeries: seriesFor("conversions", prevSeries),
      label: "Conversions", value: num(conv, 0), delta: pctChange(conv, prevConv), icon: <Target className="h-4 w-4" />,
      spark: series.map((s) => s.leads + s.purchases), color: "chart-2", hint: `${num(kpis.leads, 0)} leads · ${num(kpis.purchases, 0)} purchases`,
    },
    {
      key: "costPerConversion", ...base, series: seriesFor("costPerConversion", series), prevSeries: seriesFor("costPerConversion", prevSeries),
      label: "Cost per conversion", value: conv ? money(kpis.spend / conv) : "—", delta: pctChange(safeDiv(kpis.spend, conv), safeDiv(prev.spend, prevConv)), invert: true,
      icon: <Crosshair className="h-4 w-4" />, spark: series.map((s) => { const c = s.leads + s.purchases; return c ? s.spend / c : 0; }), color: "chart-3", hint: "lower is better",
    },
    {
      key: "roas", ...base, series: seriesFor("roas", series), prevSeries: seriesFor("roas", prevSeries),
      label: "ROAS", value: `${kpis.roas.toFixed(2)}×`, delta: pctChange(kpis.roas, prev.roas), icon: <TrendingUp className="h-4 w-4" />,
      spark: series.map((s) => s.roas), color: "chart-4", hint: `${money(kpis.revenue)} revenue`,
    },
    {
      key: "ctr", ...base, series: seriesFor("ctr", series), prevSeries: seriesFor("ctr", prevSeries),
      label: "CTR (link)", value: pct(kpis.ctr), delta: pctChange(kpis.ctr, prev.ctr), icon: <MousePointerClick className="h-4 w-4" />,
      spark: series.map((s) => s.ctr), color: "chart-5", hint: `${num(kpis.clicks, 0)} clicks`,
    },
    {
      key: "cpm", ...base, series: seriesFor("cpm", series), prevSeries: seriesFor("cpm", prevSeries),
      label: "CPM", value: money(kpis.cpm), delta: pctChange(kpis.cpm, prev.cpm), invert: true, icon: <Coins className="h-4 w-4" />,
      spark: series.map((s) => s.cpm), color: "chart-6", hint: `${pct(0)} of budget pacing`,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => <KpiCard key={c.label} card={c} days={days} />)}
    </div>
  );
}

export function MiniStatRow({ items, className }: { items: { label: string; value: string; icon?: React.ReactNode; delta?: number | null; invert?: boolean }[]; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map((i) => (
        <Panel key={i.label} className="flex items-center gap-3 p-3.5">
          {i.icon ? <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-500">{i.icon}</div> : null}
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-wide text-faint">{i.label}</p>
            <div className="flex items-center gap-2">
              <p className="truncate text-lg font-semibold num">{i.value}</p>
              {i.delta !== undefined ? <Delta value={i.delta} invert={i.invert} showIcon={false} /> : null}
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

export { Activity };
