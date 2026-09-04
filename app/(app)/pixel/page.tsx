import * as React from "react";
import { Activity, BookOpen, CircleDot, Gauge, Radio, ShieldCheck } from "lucide-react";
import { loadReport } from "@/lib/data";
import { Badge, Callout, EmptyState, Panel, PanelHeader } from "@/components/ui/primitives";
import { EventFunnel, PixelDiagnostics, PixelEventsTable, PixelOverview } from "@/components/panels/pixel-panel";
import { compact, currency, eventLabel, num, pct, relative } from "@/lib/format";
import { safeDiv, sum } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { findDiscrepancies } from "@/lib/discrepancies";
import { DiscrepancyPanel } from "@/components/panels/discrepancy-list";

export const dynamic = "force-dynamic";

const GUIDE = [
  {
    title: "Install the base code on every page",
    body: "Paste the base pixel snippet inside the <head> of every page of your site. Use Google Tag Manager for a no-code install.",
  },
  {
    title: "Send standard events with parameters",
    body: "Fire ViewContent, AddToCart, InitiateCheckout, Purchase and Lead with value, currency and content_ids so Meta can optimise toward real outcomes.",
  },
  {
    title: "Turn on Advanced Matching",
    body: "Pass hashed email, phone and external_id on every event. This typically lifts attributed conversions by 5–10%.",
  },
  {
    title: "Add the Conversions API",
    body: "Mirror your most important events server-side with a shared event_id so Meta can deduplicate browser and server signals.",
  },
  {
    title: "Verify domain and rank 8 events",
    body: "Under Aggregated Event Measurement, verify your domain and rank the 8 events that matter most for iOS 14.5+ traffic.",
  },
];

export default async function PixelPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; since?: string; until?: string; account?: string }> }) {
  const sp = await searchParams;
  const { data } = await loadReport({ rangeKey: sp.range, since: sp.since, until: sp.until, accountId: sp.account });
  const code = data.account.currency;
  const pixel = data.pixel;
  const discrepancies = findDiscrepancies(data);

  const find = (name: string) => pixel?.events.find((e) => e.event === name);
  const pageView = find("PageView")?.count ?? 0;
  const viewContent = find("ViewContent")?.count ?? 0;
  const addToCart = find("AddToCart")?.count ?? 0;
  const checkout = find("InitiateCheckout")?.count ?? 0;
  const purchase = find("Purchase")?.count ?? 0;

  return (
    <div className="space-y-5">
      {!pixel ? (
        <Callout tone="warn" icon={<Radio className="h-4 w-4" />} title="No pixel found on this ad account">
          Pixels are created in Meta Events Manager. Once one exists and is shared with this ad account, its events and diagnostics will appear here.
        </Callout>
      ) : null}

      {data.warnings.length ? (
        <Callout tone="info" icon={<Activity className="h-4 w-4" />} title="Data notes">
          {data.warnings.slice(0, 4).join(" · ")}
        </Callout>
      ) : null}

      {pixel ? (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            {[
              { label: "Pixel ID", value: pixel.id, icon: <CircleDot className="h-4 w-4" />, sub: pixel.name },
              { label: "Last event received", value: relative(pixel.lastFiredTime), icon: <Radio className="h-4 w-4" />, sub: pixel.lastFiredTime ? new Date(pixel.lastFiredTime).toLocaleString() : "—" },
              {
                label: "Checks passing", value: `${pixel.diagnostics.filter((d) => d.status === "pass").length}/${pixel.diagnostics.length}`,
                icon: <ShieldCheck className="h-4 w-4" />,
                sub: `${pixel.diagnostics.filter((d) => d.status === "fail").length} failing`,
              },
              { label: "Events tracked", value: num(pixel.events.length), icon: <Activity className="h-4 w-4" />, sub: `${compact(pixel.events.reduce((a, e) => a + e.count, 0))} total events` },
            ].map((s) => (
              <Panel key={s.label} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-500">{s.icon}</div>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] uppercase tracking-wide text-faint">{s.label}</p>
                    <p className="truncate text-[15px] font-semibold num">{s.value}</p>
                    <p className="truncate text-[10px] text-faint">{s.sub}</p>
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <PixelOverview pixel={pixel} code={code} />
            </div>

            <div className="space-y-4">
              <Panel>
                <PanelHeader title="Event funnel" subtitle="Drop-off between steps" icon={<Gauge className="h-4 w-4" />} />
                <EventFunnel pixel={pixel} />
              </Panel>

              <Panel>
                <PanelHeader title="Conversion rates" subtitle="Step-to-step performance" icon={<Gauge className="h-4 w-4" />} />
                <div className="space-y-2 px-5 pb-5 pt-4 text-[12px]">
                  {[
                    ["View content → Add to cart", safeDiv(addToCart, viewContent) * 100],
                    ["Add to cart → Checkout", safeDiv(checkout, addToCart) * 100],
                    ["Checkout → Purchase", safeDiv(purchase, checkout) * 100],
                    ["Page view → Purchase", safeDiv(purchase, pageView) * 100],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between gap-3">
                      <span className="text-muted">{label}</span>
                      <span className="num font-semibold">{(value as number).toFixed(2)}%</span>
                    </div>
                  ))}
                  <div className="mt-3 rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-2.5 text-[11px] text-muted">
                    Purchase value tracked: <span className="font-semibold text-ink">{currency(find("Purchase")?.value ?? 0, code, { compact: true })}</span>
                  </div>
                </div>
              </Panel>

              <Panel>
                <PanelHeader title="Diagnostics" subtitle="Automated pixel health checks" icon={<ShieldCheck className="h-4 w-4" />} />
                <PixelDiagnostics pixel={pixel} />
              </Panel>
            </div>
          </div>
        </>
      ) : (
        <Panel>
          <EmptyState icon={<Radio className="h-5 w-5" />} title="Pixel data will appear here" description="Connect a live ad account that has a pixel shared with it, or explore the demo account to see a full diagnostics report." />
        </Panel>
      )}

      {data.pixels.length > 1 ? (
        <Panel>
          <PanelHeader title="Pixels on this account" subtitle="All pixels shared with the selected ad account" icon={<CircleDot className="h-4 w-4" />} />
          <div className="space-y-2 px-5 pb-5 pt-4">
            {data.pixels.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{p.name}</p>
                  <p className="text-[10px] text-faint num">ID {p.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={p.id === pixel?.id ? "brand" : "neutral"}>{p.id === pixel?.id ? "Primary" : "Inactive"}</Badge>
                  <span className="text-[11px] text-muted">{relative(p.lastFiredTime)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {pixel ? (
        <>
          <Panel>
            <PanelHeader
              title="Ads ↔ pixel reconciliation"
              subtitle="What your ads reported versus what the pixel actually recorded"
              icon={<ShieldCheck className="h-4 w-4" />}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12px]">
                <thead>
                  <tr className="bg-ink/[0.02] text-left text-[10px] uppercase tracking-wide text-faint">
                    <th className="px-4 py-2 font-semibold">Metric</th>
                    <th className="px-3 py-2 text-right font-semibold">Ads reporting</th>
                    <th className="px-3 py-2 text-right font-semibold">Pixel</th>
                    <th className="px-3 py-2 text-right font-semibold">Difference</th>
                    <th className="px-3 py-2 text-right font-semibold">Gap %</th>
                    <th className="px-3 py-2 font-semibold">Reading</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Leads", ads: data.kpis.leads, pixel: find("Lead")?.count ?? 0, money: false },
                    { label: "Purchases", ads: data.kpis.purchases, pixel: find("Purchase")?.count ?? 0, money: false },
                    { label: "Revenue", ads: data.kpis.revenue, pixel: find("Purchase")?.value ?? 0, money: true },
                    { label: "Landing page views", ads: data.kpis.landingPageViews, pixel: find("PageView")?.count ?? 0, money: false },
                    { label: "Add to cart", ads: data.kpis.clicks * 0.22, pixel: find("AddToCart")?.count ?? 0, money: false },
                  ].map((r) => {
                    const gap = r.pixel - r.ads;
                    const gapPct = r.ads ? (gap / r.ads) * 100 : 0;
                    const reading =
                      Math.abs(gapPct) < 5 ? "Reconciled"
                        : gap > 0 ? "Pixel sees more (attribution or tracking loss)"
                          : "Ads see more (possible double counting)";
                    return (
                      <tr key={r.label} className="border-t border-line/60">
                        <td className="px-4 py-2.5 font-medium">{r.label}</td>
                        <td className="px-3 py-2.5 text-right num">{r.money ? currency(r.ads, code, { compact: true }) : num(r.ads)}</td>
                        <td className="px-3 py-2.5 text-right num">{r.money ? currency(r.pixel, code, { compact: true }) : num(r.pixel)}</td>
                        <td className={cn("px-3 py-2.5 text-right num font-semibold", gap >= 0 ? "text-neg" : "text-pos")}>
                          {gap > 0 ? "+" : ""}{r.money ? currency(gap, code, { compact: true }) : num(gap)}
                        </td>
                        <td className="px-3 py-2.5 text-right num">{pct(Math.abs(gapPct), 1)}</td>
                        <td className="px-3 py-2.5 text-[11px] text-muted">{reading}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-5 pb-4 pt-3 text-[11px] text-faint">
              Differences under 5% are normal. Anything larger is a tracking, attribution or deduplication problem — the panel below gives the exact fix for each one.
            </p>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel>
              <PanelHeader title="Signal quality" subtitle="How much of your data Meta can actually use" icon={<Gauge className="h-4 w-4" />} />
              <div className="space-y-3 px-5 pb-5 pt-4">
                {(() => {
                  const totalEvents = sum(pixel.events.map((e) => e.count));
                  const weighted = sum(pixel.events.map((e) => e.count * e.matched)) / Math.max(totalEvents, 1);
                  const unmatched = totalEvents - sum(pixel.events.map((e) => (e.count * e.matched) / 100));
                  return (
                    <>
                      <div>
                        <div className="mb-1 flex justify-between text-[11px]">
                          <span className="text-muted">Weighted match quality</span>
                          <span className="num font-semibold">{weighted.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className={cn("h-full rounded-full", weighted >= 90 ? "bg-pos" : weighted >= 80 ? "bg-warn" : "bg-neg")}
                            style={{ width: `${Math.min(100, weighted)}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-xl border border-line/70 px-3 py-2">
                          <p className="text-faint">Total events</p>
                          <p className="num text-base font-semibold">{compact(totalEvents)}</p>
                        </div>
                        <div className="rounded-xl border border-line/70 px-3 py-2">
                          <p className="text-faint">Unmatched</p>
                          <p className="num text-base font-semibold text-neg">{compact(unmatched)}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted">
                        {num(Math.round(unmatched))} events cannot be tied to a person, so they never show up as results. Advanced matching and Conversions API are the two biggest levers.
                      </p>
                    </>
                  );
                })()}
              </div>
            </Panel>

            <Panel className="lg:col-span-2">
              <PanelHeader
                title="Event performance"
                subtitle="Volume, value and trend per standard event — click any row for detail"
                icon={<Activity className="h-4 w-4" />}
              />
              <PixelEventsTable pixel={pixel} code={code} />
            </Panel>
          </div>

          <DiscrepancyPanel
            items={discrepancies}
            code={code}
            subtitle="Exact numbers, why each gap happens, and the steps to correct it"
          />
        </>
      ) : null}

      <Panel>
        <PanelHeader title="Setup guide" subtitle="How to get the most signal out of your pixel" icon={<BookOpen className="h-4 w-4" />} />
        <ol className="space-y-3 px-5 pb-5 pt-4">
          {GUIDE.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[11px] font-semibold text-brand-500">{i + 1}</span>
              <div>
                <p className="text-[13px] font-medium">{step.title}</p>
                <p className="mt-0.5 text-[12px] text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      {pixel?.events.length ? (
        <Panel>
          <PanelHeader title="Event reference" subtitle="What Meta uses each event for" icon={<Activity className="h-4 w-4" />} />
          <div className="grid gap-3 px-5 pb-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {pixel.events.map((e) => (
              <div key={e.event} className="rounded-xl border border-line/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-medium">{eventLabel(e.event)}</p>
                  <Badge tone={e.quality === "good" ? "pos" : e.quality === "medium" ? "warn" : "neg"}>{e.quality ?? "n/a"}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-faint">
                  {num(e.count)} events · {e.matched}% match quality
                </p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
