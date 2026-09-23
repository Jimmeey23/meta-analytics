"use client";
import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertOctagon, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, ExternalLink, Info,
  Lightbulb, MousePointerClick, Target, TrendingUp, Users,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { CreativeMedia } from "@/components/ui/creative-media";
import { DrilldownProvider, useDrilldown, type Drilldown } from "./drilldown-context";
import { Badge, Delta, Panel, Sparkline, KeyValue, ProgressBar } from "@/components/ui/primitives";
import { compact, currency, dateTime, num, pct, rankingLabel, rankingTone, relative, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pctChange, safeDiv } from "@/lib/utils";

/* ───────────────────────────── helpers ───────────────────────────── */

type Fmt = "currency" | "number" | "percent" | "ratio" | "compact";

const METRIC_DEFS: Record<string, { label: string; fmt: Fmt; better: "higher" | "lower"; formula: string; benchmark: string }> = {
  spend: { label: "Amount spent", fmt: "currency", better: "lower", formula: "Sum of all delivery cost in the selected period", benchmark: "Judge spend against budget pacing, not in isolation." },
  impressions: { label: "Impressions", fmt: "compact", better: "higher", formula: "Number of times your ads were served", benchmark: "Watch impressions together with frequency — volume without reach means saturation." },
  reach: { label: "Reach", fmt: "compact", better: "higher", formula: "Unique people who saw your ads at least once", benchmark: "Reach should grow as spend grows; flat reach means you are paying for frequency." },
  frequency: { label: "Frequency", fmt: "ratio", better: "lower", formula: "Impressions ÷ Reach", benchmark: "1.5–2.5 is healthy for conversion campaigns. Above 3 usually signals fatigue." },
  clicks: { label: "Link clicks", fmt: "compact", better: "higher", formula: "Clicks on links inside your ads", benchmark: "Compare with landing page views to spot traffic loss." },
  ctr: { label: "CTR (link)", fmt: "percent", better: "higher", formula: "Link clicks ÷ Impressions × 100", benchmark: "1.0%+ is acceptable, 1.5–2%+ is strong on Feed and Reels." },
  cpc: { label: "CPC (link)", fmt: "currency", better: "lower", formula: "Spend ÷ Link clicks", benchmark: "Rising CPC with flat CTR means auction pressure." },
  cpm: { label: "CPM", fmt: "currency", better: "lower", formula: "Spend ÷ Impressions × 1,000", benchmark: "A 15%+ jump period over period means more competition or a narrower audience." },
  cpp: { label: "Cost per 1,000 reached", fmt: "currency", better: "lower", formula: "Spend ÷ Reach × 1,000", benchmark: "Useful for reach and awareness objectives." },
  results: { label: "Results (all objectives)", fmt: "compact", better: "higher", formula: "Each campaign's objective-specific result", benchmark: "Mixed metric — read conversions for efficiency decisions." },
  conversions: { label: "Conversions", fmt: "number", better: "higher", formula: "Leads + purchases recorded in the period", benchmark: "The number your cost-per-conversion is built on." },
  costPerConversion: { label: "Cost per conversion", fmt: "currency", better: "lower", formula: "Spend ÷ (Leads + Purchases)", benchmark: "Compare with your margin or target CPL/CPA." },
  costPerResult: { label: "Cost per result", fmt: "currency", better: "lower", formula: "Spend ÷ Results", benchmark: "Objective-specific efficiency." },
  roas: { label: "ROAS", fmt: "ratio", better: "higher", formula: "Purchase conversion value ÷ Spend", benchmark: "Break-even depends on margin; 3×+ suits most ecommerce." },
  revenue: { label: "Revenue", fmt: "currency", better: "higher", formula: "Sum of purchase conversion value", benchmark: "Check it against pixel purchase value to catch tracking gaps." },
  leads: { label: "Leads", fmt: "number", better: "higher", formula: "Lead actions recorded by the pixel and instant forms", benchmark: "Reconcile with your CRM and with pixel Lead events." },
  purchases: { label: "Purchases", fmt: "number", better: "higher", formula: "Purchase actions credited to your ads", benchmark: "Compare with pixel Purchase events for attribution loss." },
  landingPageViews: { label: "Landing page views", fmt: "compact", better: "higher", formula: "Sessions where the page loaded after a click", benchmark: "Below 80% of clicks means page-speed or redirect problems." },
  videoViews: { label: "Video views", fmt: "compact", better: "higher", formula: "ThruPlays and video views recorded", benchmark: "Pair with CTR to judge creative pull." },
};

function fmtMetric(value: number, fmt: Fmt, code: string) {
  switch (fmt) {
    case "currency": return currency(value, code, { compact: Math.abs(value) >= 10000 });
    case "percent": return pct(value);
    case "ratio": return fmt === "ratio" && value < 100 ? value.toFixed(2) : `${value.toFixed(2)}×`;
    case "compact": return compact(value);
    default: return num(value, Math.abs(value) < 100 ? 1 : 0);
  }
}

function metricOf(row: any, key: string) {
  if (key === "conversions") return (row.leads ?? 0) + (row.purchases ?? 0);
  if (key === "costPerConversion") return safeDiv(row.spend, (row.leads ?? 0) + (row.purchases ?? 0));
  return Number(row[key] ?? 0);
}

function MiniTrend({ data, color = "hsl(var(--chart-1))", height = 180 }: { data: { date: string; value: number; previous?: number }[]; color?: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="dd-trend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--line))" strokeDasharray="4 6" />
          <XAxis dataKey="date" tickFormatter={(v) => shortDate(v)} tick={{ fill: "hsl(var(--faint))", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={{ fill: "hsl(var(--faint))", fontSize: 10 }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => compact(v)} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--line))", background: "hsl(var(--surface))", fontSize: 12 }}
            labelFormatter={(v) => shortDate(String(v))}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#dd-trend)" dot={false} name="This period" />
          <Area type="monotone" dataKey="previous" stroke="hsl(var(--faint))" strokeDasharray="5 5" strokeWidth={1.5} fill="none" dot={false} name="Previous period" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatGrid({ items }: { items: { label: string; value: string; hint?: string; tone?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-2.5">
          <p className="truncate text-[10px] uppercase tracking-wide text-faint">{i.label}</p>
          <p className={cn("num mt-0.5 text-[15px] font-semibold", i.tone)}>{i.value}</p>
          {i.hint ? <p className="truncate text-[10px] text-faint">{i.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-500">
        <CheckCircle2 className="h-3.5 w-3.5" /> {title}
      </p>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-muted">
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-500 text-[9px] font-bold text-white">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{children}</p>;
}

/* ───────────────────────────── views ───────────────────────────── */

function MetricView({ p }: { p: any }) {
  const def = METRIC_DEFS[p.key] ?? { label: p.label, fmt: "number", better: "higher", formula: "", benchmark: "" };
  const value = p.kpis ? metricOf(p.kpis, p.key) : 0;
  const prev = p.prev ? metricOf(p.prev, p.key) : 0;
  const delta = pctChange(value, prev);
  const rows: any[] = (p.rows ?? []).filter((r: any) => r.spend > 0);
  const sorted = [...rows].sort((a, b) => (def.better === "lower" ? metricOf(a, p.key) - metricOf(b, p.key) : metricOf(b, p.key) - metricOf(a, p.key)));
  const best = sorted.slice(0, 5);
  const worst = def.better === "lower" ? sorted.slice(-3).reverse() : sorted.slice(-3);
  const totalForShare = rows.reduce((a, r) => a + (p.key === "spend" || p.key === "impressions" || p.key === "clicks" ? metricOf(r, p.key) : 0), 0) || 1;

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-faint">{def.label}</p>
          <p className="num mt-1 text-3xl font-semibold">{fmtMetric(value, def.fmt, p.code)}</p>
        </div>
        <Delta value={delta} invert={def.better === "lower"} />
        <span className="text-[11px] text-faint">vs previous period ({fmtMetric(prev, def.fmt, p.code)})</span>
      </div>

      {p.series?.length ? (
        <div className="mt-4">
          <SectionTitle>Daily movement</SectionTitle>
          <MiniTrend data={p.series.map((s: any, i: number) => ({ date: s.date, value: s.value, previous: p.prevSeries?.[i]?.value }))} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle>{def.better === "lower" ? "Best (lowest)" : "Top contributors"}</SectionTitle>
          <div className="space-y-1.5">
            {best.map((r: any) => (
              <div key={r.name} className="flex items-center gap-2 rounded-lg border border-line/60 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px]">{r.name}</span>
                <span className="num text-[12px] font-semibold">{fmtMetric(metricOf(r, p.key), def.fmt, p.code)}</span>
                {p.key === "spend" ? <span className="num w-10 text-right text-[10px] text-faint">{pct(safeDiv(r.spend, totalForShare) * 100, 0)}</span> : null}
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>{def.better === "lower" ? "Needs work (highest)" : "Weakest contributors"}</SectionTitle>
          <div className="space-y-1.5">
            {worst.map((r: any) => (
              <div key={r.name} className="flex items-center gap-2 rounded-lg border border-line/60 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{r.name}</span>
                <span className="num text-[12px] font-semibold">{fmtMetric(metricOf(r, p.key), def.fmt, p.code)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line/70 bg-ink/[0.02] p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold"><Info className="h-3 w-3 text-brand-500" /> How it is calculated</p>
          <p className="text-[12px] text-muted">{def.formula}</p>
        </div>
        <div className="rounded-xl border border-line/70 bg-ink/[0.02] p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold"><Target className="h-3 w-3 text-brand-500" /> What good looks like</p>
          <p className="text-[12px] text-muted">{def.benchmark}</p>
        </div>
      </div>
    </>
  );
}

function EntityView({ p }: { p: any }) {
  const row = p.row;
  const conv = (row.leads ?? 0) + (row.purchases ?? 0);
  const typeLabel = p.type === "campaign" ? "Campaign" : p.type === "adset" ? "Ad set" : "Ad";
  const quality = [row.qualityRanking, row.engagementRanking, row.conversionRanking].filter(Boolean);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={String(row.status).includes("ACTIVE") ? "pos" : String(row.status).includes("PAUSED") ? "warn" : "neutral"}>
          {String(row.status ?? "").toLowerCase()}
        </Badge>
        <Badge tone="brand">{typeLabel}</Badge>
        {row.budget > 0 ? <span className="text-[11px] text-faint num">{currency(row.budget, p.code, { compact: true })}/{row.budgetType === "lifetime" ? "total" : "day"}</span> : null}
        {row.start ? <span className="text-[11px] text-faint">from {shortDate(row.start)}</span> : null}
      </div>

      <div className="mt-4">
        <StatGrid
          items={[
            { label: "Spend", value: currency(row.spend, p.code, { compact: true }) },
            { label: "Impressions", value: compact(row.impressions) },
            { label: "Reach", value: compact(row.reach), hint: `freq ${row.frequency?.toFixed(2) ?? "—"}` },
            { label: "Clicks", value: compact(row.clicks) },
            { label: "CTR", value: pct(row.ctr), tone: row.ctr >= 1 ? "text-pos" : "text-warn" },
            { label: "CPC", value: currency(row.cpc, p.code, { compact: true }) },
            { label: "CPM", value: currency(row.cpm, p.code, { compact: true }) },
            { label: "Conversions", value: num(conv), hint: `${num(row.leads)} leads · ${num(row.purchases)} sales` },
            { label: "Cost per conversion", value: conv ? currency(row.spend / conv, p.code, { compact: true }) : "—" },
            { label: row.resultLabel || "Results", value: num(row.results) },
            { label: "Cost per result", value: currency(row.costPerResult, p.code, { compact: true }) },
            { label: "ROAS", value: row.roas > 0 ? `${row.roas.toFixed(2)}×` : "—", tone: row.roas >= 2 ? "text-pos" : undefined },
          ]}
        />
      </div>

      {row.trend?.length ? (
        <div className="mt-4">
          <SectionTitle>Last 14 days spend</SectionTitle>
          <Sparkline data={row.trend} width={760} height={56} />
        </div>
      ) : null}

      {quality.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            ["Quality ranking", row.qualityRanking],
            ["Engagement rate ranking", row.engagementRanking],
            ["Conversion rate ranking", row.conversionRanking],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-line/70 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-faint">{label}</p>
              <p className={cn("text-[13px] font-semibold", rankingTone(value as string))}>{rankingLabel(value as string)}</p>
              <p className="text-[10px] text-faint">Compared with ads competing for the same audience</p>
            </div>
          ))}
        </div>
      ) : null}

      {p.children?.length ? (
        <div className="mt-5">
          <SectionTitle>{p.type === "campaign" ? "Ad sets in this campaign" : "Ads in this ad set"} · {p.children.length}</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-line/70">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-ink/[0.02] text-left text-[10px] uppercase tracking-wide text-faint">
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 text-right font-semibold">Spend</th>
                  <th className="px-3 py-2 text-right font-semibold">Impr.</th>
                  <th className="px-3 py-2 text-right font-semibold">CTR</th>
                  <th className="px-3 py-2 text-right font-semibold">Results</th>
                  <th className="px-3 py-2 text-right font-semibold">CPA</th>
                  <th className="px-3 py-2 text-right font-semibold">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {p.children.slice(0, 12).map((c: any) => (
                  <tr key={c.id} className="border-t border-line/50">
                    <td className="max-w-[260px] truncate px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-right num">{currency(c.spend, p.code, { compact: true })}</td>
                    <td className="px-3 py-2 text-right num text-muted">{compact(c.impressions)}</td>
                    <td className="px-3 py-2 text-right num">{pct(c.ctr)}</td>
                    <td className="px-3 py-2 text-right num">{num(c.results)}</td>
                    <td className="px-3 py-2 text-right num">{currency(c.costPerResult, p.code, { compact: true })}</td>
                    <td className="px-3 py-2 text-right num">{c.roas > 0 ? `${c.roas.toFixed(2)}×` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(p.creatives ?? []).length ? (
        <div className="mt-5">
          <SectionTitle>Creatives</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {p.creatives.slice(0, 8).map((a: any) => (
              <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-line/70 px-3 py-2">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500/25 to-accent/20 text-brand-500">
                  {a.creative?.thumbnail ? <img src={a.creative.thumbnail} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <MousePointerClick className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">{a.creative?.title ?? a.name}</p>
                  <p className="truncate text-[10px] text-faint">{a.creative?.format ?? "Ad"} · CTR {pct(a.ctr)} · {num(a.results)} results</p>
                </div>
                <span className="num shrink-0 text-[12px]">{currency(a.spend, p.code, { compact: true })}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function CreativeView({ p }: { p: any }) {
  const ad = p.ad;
  const acc = p.account ?? {};
  const ctrIndex = safeDiv(ad.ctr, acc.ctr || 1) * 100;
  const cpaIndex = safeDiv(ad.costPerResult, acc.costPerResult || 1) * 100;
  const suggestions: string[] = [];
  if (ad.ctr < (acc.ctr ?? 0) * 0.7) suggestions.push("CTR is well below the account average — test a new hook in the first 3 seconds and a clearer CTA button.");
  if (ad.frequency >= 2.5) suggestions.push(`Frequency is ${ad.frequency.toFixed(1)} — rotate a fresh variation, this creative is being seen too often.`);
  if (ad.costPerResult > (acc.costPerResult ?? 0) * 1.5 && ad.results > 0) suggestions.push("Cost per result is 50%+ above account average — pause or move budget to the ad set's best performer.");
  if (ad.roas >= 2.5) suggestions.push("Strong ROAS — duplicate this creative into your prospecting ad sets to scale it.");
  if (!suggestions.length) suggestions.push("Performing in line with the account — keep it running and refresh every 10–14 days.");

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Creative mock */}
        <div className="rounded-2xl border border-line/70 bg-gradient-to-br from-brand-500/10 via-accent/5 to-transparent p-4">
          <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
            <div className="relative aspect-square w-full bg-gradient-to-br from-brand-500/30 via-accent/25 to-accent-2/20">
              <CreativeMedia ad={ad} playVideo controls />
            </div>
            <div className="space-y-1.5 p-3">
              <p className="text-[11px] font-semibold">{ad.creative?.title ?? ad.name}</p>
              <p className="line-clamp-2 text-[10px] text-muted">{ad.creative?.body ?? "—"}</p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-faint">{ad.creative?.format ?? "Ad"}</span>
                <span className="rounded-md bg-brand-500 px-2 py-1 text-[10px] font-semibold text-white">
                  {String(ad.creative?.cta ?? "LEARN_MORE").replace(/_/g, " ")}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[10px] text-faint">
            {ad.creative?.videoUrl
              ? "Live video creative"
              : ad.creative?.thumbnail
                ? "Live creative preview"
                : "Preview rendered from the ad's copy (image thumbnail not returned by the API)"}
          </p>
          {ad.creative?.permalink ? (
            <p className="mt-1 text-center text-[10px]">
              <a
                href={ad.creative.permalink.startsWith("http") ? ad.creative.permalink : `https://www.facebook.com${ad.creative.permalink}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-500 underline-offset-2 hover:underline"
              >
                Open on Facebook
              </a>
            </p>
          ) : null}
        </div>

        <div>
          <StatGrid
            items={[
              { label: "Spend", value: currency(ad.spend, p.code, { compact: true }) },
              { label: "Impressions", value: compact(ad.impressions) },
              { label: "Reach", value: compact(ad.reach), hint: `freq ${ad.frequency.toFixed(2)}` },
              { label: "Clicks", value: compact(ad.clicks) },
              { label: "CTR", value: pct(ad.ctr), hint: `${ctrIndex.toFixed(0)}% of account`, tone: ctrIndex >= 100 ? "text-pos" : "text-warn" },
              { label: "CPC", value: currency(ad.cpc, p.code, { compact: true }) },
              { label: "CPM", value: currency(ad.cpm, p.code, { compact: true }) },
              { label: "Results", value: num(ad.results) },
              { label: "Cost per result", value: currency(ad.costPerResult, p.code, { compact: true }), hint: `${cpaIndex.toFixed(0)}% of account`, tone: cpaIndex <= 100 ? "text-pos" : "text-neg" },
              { label: "Revenue", value: currency(ad.revenue, p.code, { compact: true }) },
              { label: "ROAS", value: ad.roas > 0 ? `${ad.roas.toFixed(2)}×` : "—", tone: ad.roas >= 2 ? "text-pos" : undefined },
              { label: "Quality", value: rankingLabel(ad.qualityRanking), tone: rankingTone(ad.qualityRanking) },
            ]}
          />

          {ad.trend?.length ? (
            <div className="mt-4">
              <SectionTitle>Last 14 days spend</SectionTitle>
              <Sparkline data={ad.trend} width={520} height={48} />
            </div>
          ) : null}

          <div className="mt-4">
            <SectionTitle>Recommended actions for this creative</SectionTitle>
            <Steps title="Next steps" steps={suggestions} />
          </div>
        </div>
      </div>

      {(p.siblings ?? []).length ? (
        <div className="mt-5">
          <SectionTitle>Other ads in the same ad set</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {p.siblings.slice(0, 6).map((s: any) => (
              <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-line/70 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px]">{s.creative?.title ?? s.name}</p>
                  <p className="text-[10px] text-faint num">CTR {pct(s.ctr)} · CPA {currency(s.costPerResult, p.code, { compact: true })}</p>
                </div>
                <span className="num text-[12px]">{currency(s.spend, p.code, { compact: true })}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function SegmentView({ p }: { p: any }) {
  const row = p.row;
  const acc = p.account ?? {};
  const index = (value: number, base: number) => (base ? (value / base) * 100 : 0);
  return (
    <>
      <StatGrid
        items={[
          { label: "Spend", value: currency(row.spend, p.code, { compact: true }), hint: `${pct(safeDiv(row.spend, acc.spend || 1) * 100, 1)} of account` },
          { label: "Impressions", value: compact(row.impressions) },
          { label: "Reach", value: compact(row.reach), hint: `freq ${safeDiv(row.impressions, row.reach).toFixed(2)}` },
          { label: "Clicks", value: compact(row.clicks) },
          { label: "CTR", value: pct(row.ctr), hint: `${index(row.ctr, acc.ctr).toFixed(0)}% vs account`, tone: row.ctr >= (acc.ctr ?? 0) ? "text-pos" : "text-neg" },
          { label: "CPC", value: currency(row.cpc, p.code, { compact: true }), hint: `${index(row.cpc, acc.cpc).toFixed(0)}% vs account` },
          { label: "CPM", value: currency(row.cpm, p.code, { compact: true }), hint: `${index(row.cpm, acc.cpm).toFixed(0)}% vs account` },
          { label: "Results", value: num(row.results) },
          { label: "Cost per result", value: currency(row.costPerResult, p.code, { compact: true }), tone: row.costPerResult <= (acc.costPerResult ?? Infinity) ? "text-pos" : "text-neg" },
          { label: "Revenue", value: currency(row.revenue, p.code, { compact: true }) },
          { label: "ROAS", value: row.roas > 0 ? `${row.roas.toFixed(2)}×` : "—" },
          { label: "Efficiency index", value: `${index(row.costPerResult ? acc.costPerResult / row.costPerResult : 1, 1).toFixed(0)}`, hint: "100 = account average" },
        ]}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line/70 bg-ink/[0.02] p-3">
          <p className="mb-2 text-[11px] font-semibold">Share of account</p>
          <div className="space-y-2">
            {[
              ["Spend", safeDiv(row.spend, acc.spend || 1) * 100],
              ["Impressions", safeDiv(row.impressions, acc.impressions || 1) * 100],
              ["Results", safeDiv(row.results, acc.results || 1) * 100],
            ].map(([label, v]) => (
              <div key={String(label)}>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-muted">{label}</span>
                  <span className="num">{pct(v as number, 1)}</span>
                </div>
                <ProgressBar value={v as number} />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-line/70 bg-ink/[0.02] p-3">
          <p className="mb-2 text-[11px] font-semibold">What to do</p>
          <ul className="space-y-1.5 text-[12px] text-muted">
            <li>• {row.costPerResult <= (acc.costPerResult || Infinity) ? "Cheaper than the account average — consider moving budget into this segment." : "More expensive than the account average — cap it or test a tailored creative."}</li>
            <li>• {row.ctr >= (acc.ctr || 0) ? "CTR is strong; the creative resonates here." : "CTR lags; the creative is not connecting with this audience."}</li>
            <li>• Frequency of {safeDiv(row.impressions, row.reach).toFixed(2)} {safeDiv(row.impressions, row.reach) > 3 ? "suggests saturation — broaden or refresh." : "is within a healthy range."}</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function LeadView({ p }: { p: any }) {
  const l = p.lead;
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent text-base font-semibold text-white">
          {l.fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{l.fullName}</p>
          <p className="truncate text-[11px] text-faint">{l.city}{l.company ? ` · ${l.company}` : ""}</p>
        </div>
        <Badge tone={l.intent === "Hot" ? "pos" : l.intent === "Warm" ? "warn" : "neutral"}>{l.intent} intent</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line/70 p-3">
          <SectionTitle>Contact</SectionTitle>
          <KeyValue label="Email" value={l.email || "—"} />
          <KeyValue label="Phone" value={l.phone || "—"} />
          <KeyValue label="City" value={l.city || "—"} />
          <KeyValue label="Budget" value={l.budget || "—"} />
        </div>
        <div className="rounded-xl border border-line/70 p-3">
          <SectionTitle>Attribution</SectionTitle>
          <KeyValue label="Campaign" value={<span className="max-w-[220px] truncate">{l.campaignName ?? "—"}</span>} />
          <KeyValue label="Ad set" value={<span className="max-w-[220px] truncate">{l.adSetName ?? "—"}</span>} />
          <KeyValue label="Ad" value={<span className="max-w-[220px] truncate">{l.adName ?? "—"}</span>} />
          <KeyValue label="Form" value={<span className="max-w-[220px] truncate">{l.formName}</span>} />
          <KeyValue label="Platform" value={l.platform} />
          <KeyValue label="Source" value={l.isOrganic ? "Organic (no ad)" : "Paid"} />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle>Every field submitted</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {l.fields.map((f: any) => (
            <div key={f.name} className="rounded-xl border border-line/70 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-faint">{String(f.name).replace(/_/g, " ")}</p>
              <p className="truncate text-[12px] font-medium">{f.values?.join(", ") || "—"}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-faint">
        <Clock className="h-3 w-3" /> Received {dateTime(l.createdTime)} · {relative(l.createdTime)}
      </p>
    </>
  );
}

function EventView({ p }: { p: any }) {
  const e = p.event;
  const hasMatchQuality = typeof e.matched === "number";
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="num text-3xl font-semibold">{num(e.count)}</p>
        <Delta value={e.delta} />
        <Badge tone={e.source === "pixel_stats" ? "pos" : e.source === "demo" ? "warn" : "info"}>{e.sourceLabel}</Badge>
      </div>

      <div className="mt-4">
        <StatGrid
          items={[
            { label: "Events", value: num(e.count) },
            { label: "Change", value: `${e.delta > 0 ? "+" : ""}${e.delta}%` },
            { label: "Event match quality", value: hasMatchQuality ? `${e.matched}%` : "Not provided" },
            { label: "Value", value: e.value ? currency(e.value, p.code, { compact: true }) : "—" },
          ]}
        />
      </div>

      {e.trend?.length ? (
        <div className="mt-4">
          <SectionTitle>Last 14 days</SectionTitle>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={e.trend.map((v: number, i: number) => ({ i, v }))} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--line))" strokeDasharray="4 6" />
                <XAxis dataKey="i" tick={{ fill: "hsl(var(--faint))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--faint))", fontSize: 10 }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => compact(v)} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--line))", background: "hsl(var(--surface))", fontSize: 12 }} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                  {e.trend.map((_: number, i: number) => (
                    <Cell key={i} fill={i >= e.trend.length / 2 ? "hsl(var(--chart-1))" : "hsl(var(--chart-1) / 0.45)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line/70 bg-ink/[0.02] p-3">
          <SectionTitle>Reporting details</SectionTitle>
          <dl className="space-y-2 text-[12px]">
            <div><dt className="text-faint">Exact event key</dt><dd className="font-medium">{e.event}</dd></div>
            <div><dt className="text-faint">Source</dt><dd className="font-medium">{e.sourceLabel}</dd></div>
            <div><dt className="text-faint">Selected period</dt><dd className="font-medium">{e.periodStart} to {e.periodEnd}</dd></div>
            <div><dt className="text-faint">Count basis</dt><dd className="leading-relaxed text-muted">{e.reportingBasis}</dd></div>
          </dl>
        </div>
        <div className="rounded-xl border border-line/70 bg-ink/[0.02] p-3">
          <SectionTitle>Tracking guidance</SectionTitle>
          <ul className="space-y-1.5 text-[12px] text-muted">
            <li>• Send value and currency with every {e.event} event.</li>
            <li>• Pass consented customer information such as hashed email/phone and external_id where applicable.</li>
            {!hasMatchQuality ? <li>• Event Match Quality is not exposed by this API response; verify it in Meta Events Manager.</li> : null}
            {hasMatchQuality && e.matched < 90 ? <li>• Review Automatic Advanced Matching in Events Manager.</li> : null}
            <li>• Mirror the event server-side via Conversions API using a shared event_id.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function TimeView({ p }: { p: any }) {
  const share = pct(safeDiv(p.value, p.total) * 100, 1);
  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-faint">Results in this window</p>
          <p className="num mt-1 text-3xl font-semibold">{compact(p.value)}</p>
        </div>
        <Badge tone="brand">{share} of all results</Badge>
      </div>
      <div className="mt-4 rounded-xl border border-line/70 bg-ink/[0.02] p-3 text-[12px] text-muted">
        <p>
          {p.dayName} between {p.hour}:00 and {p.hour}:59 delivers {compact(p.value)} results. Compare this with your
          weakest hours to decide whether an ad schedule or a daypart bid adjustment is worth testing.
        </p>
      </div>
      <div className="mt-4">
        <Steps
          title="How to act on this"
          steps={[
            `Add a schedule covering ${p.dayName} ${p.hour}:00–${p.hour + 1}:00 if it is consistently in your top windows.`,
            "Open the Audience → day & hour heat map and list your five strongest windows before changing anything.",
            "Apply changes to one campaign at a time and keep budgets under a 25% shift so you stay out of a fresh learning phase.",
          ]}
        />
      </div>
    </>
  );
}

function DiscrepancyView({ p }: { p: any }) {
  const d = p.d;
  return (
    <>
      <p className="text-[13px] leading-relaxed text-muted">{d.summary}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[d.left, d.right].map((side: any, i: number) => (
          <div key={i} className={cn("rounded-xl border p-3", i === 0 ? "border-line/70 bg-ink/[0.02]" : "border-brand-500/25 bg-brand-500/5")}>
            <p className="text-[10px] uppercase tracking-wide text-faint">{side.label}</p>
            <p className="num mt-0.5 text-xl font-semibold">{num(side.value)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-neg/20 bg-neg/5 px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-wide text-neg">Gap</span>
        <span className="num text-base font-semibold text-neg">{num(Math.abs(d.gap))} ({pct(Math.abs(d.gapPct), 1)})</span>
        <span className="text-[11px] text-muted">{d.impact}</span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-warn/20 bg-warn/5 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warn"><AlertOctagon className="h-3.5 w-3.5" /> Why this happens</p>
          <ul className="space-y-1.5 text-[12px] text-muted">{d.causes.map((c: string, i: number) => <li key={i}>• {c}</li>)}</ul>
        </div>
        <Steps title="Steps to correct it" steps={d.steps} />
      </div>
      <p className="mt-3 text-[11px] text-faint">Fix it in: {d.where}</p>
    </>
  );
}

function InsightView({ p }: { p: any }) {
  const i = p.insight;
  return (
    <>
      <p className="text-[13px] leading-relaxed text-muted">{i.detail}</p>
      {i.metric ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-faint">{i.metric.label}</p>
            <p className="num text-base font-semibold">{i.metric.value}</p>
          </div>
          <div className="rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-faint">Expected impact</p>
            <p className="text-base font-semibold">{i.impact}</p>
          </div>
        </div>
      ) : null}
      <div className="mt-4"><Steps title="Recommended action" steps={[i.action]} /></div>
      {i.entities?.length ? (
        <div className="mt-4">
          <SectionTitle>Affected entities</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {i.entities.map((e: string) => (
              <span key={e} className="rounded-full bg-ink/5 px-2.5 py-1 text-[11px] text-muted">{e}</span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ───────────────────────────── host ───────────────────────────── */

const TITLES: Record<string, string> = {
  metric: "Metric breakdown",
  entity: "Performance detail",
  creative: "Creative detail",
  segment: "Segment breakdown",
  lead: "Lead detail",
  event: "Event detail",
  time: "Time window",
  discrepancy: "Discrepancy detail",
  insight: "Recommendation detail",
};

export function DrilldownHost({ children }: { children: React.ReactNode }) {
  return (
    <DrilldownProvider
      children={children}
      render={(d, close) => {
        const p = d.payload ?? {};
        const title =
          d.kind === "metric" ? (METRIC_DEFS[p.key]?.label ?? p.label ?? "Metric")
            : d.kind === "entity" ? p.row?.name
              : d.kind === "creative" ? (p.ad?.creative?.title ?? p.ad?.name)
                : d.kind === "segment" ? p.label
                  : d.kind === "lead" ? p.lead?.fullName
                    : d.kind === "event" ? `${p.event?.event} events`
                      : d.kind === "time" ? `${p.dayName} · ${p.hour}:00`
                        : d.kind === "discrepancy" ? p.d?.title
                          : p.insight?.title;

        const subtitle =
          d.kind === "entity" ? `${p.type === "campaign" ? "Campaign" : p.type === "adset" ? "Ad set" : "Ad"} · ${p.row?.objective ? "" : ""}${p.row?.objective ?? ""}`
            : d.kind === "creative" ? p.ad?.adSetName
              : d.kind === "segment" ? p.dimension
                : d.kind === "event" ? "Pixel event"
                  : d.kind === "metric" ? "Selected period vs previous period"
                    : undefined;

        return (
          <Modal
            open
            onClose={close}
            title={title}
            subtitle={subtitle}
            badge={d.kind === "discrepancy" ? (
              <Badge tone={p.d?.severity === "critical" ? "neg" : p.d?.severity === "warning" ? "warn" : "info"}>
                {p.d?.severity}
              </Badge>
            ) : d.kind === "insight" ? <Badge tone="brand">{p.insight?.severity}</Badge> : undefined}
            size={d.kind === "creative" || d.kind === "entity" ? "xl" : "lg"}
            footer={
              <div className="flex items-center justify-between text-[11px] text-faint">
                <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3 w-3" /> Click any element in a report to drill down</span>
                <button onClick={close} className="rounded-lg border border-line px-3 py-1.5 font-medium text-muted transition hover:text-ink">Close</button>
              </div>
            }
          >
            {d.kind === "metric" ? <MetricView p={p} /> : null}
            {d.kind === "entity" ? <EntityView p={p} /> : null}
            {d.kind === "creative" ? <CreativeView p={p} /> : null}
            {d.kind === "segment" ? <SegmentView p={p} /> : null}
            {d.kind === "lead" ? <LeadView p={p} /> : null}
            {d.kind === "event" ? <EventView p={p} /> : null}
            {d.kind === "time" ? <TimeView p={p} /> : null}
            {d.kind === "discrepancy" ? <DiscrepancyView p={p} /> : null}
            {d.kind === "insight" ? <InsightView p={p} /> : null}
          </Modal>
        );
      }}
    />
  );
}

export { useDrilldown, TITLES };
