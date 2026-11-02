import * as React from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, Facebook, Layers, MousePointerClick, PieChart as PieIcon, Radio,
  Sparkles, Target, UserPlus, Wallet, Wrench,
} from "lucide-react";
import { loadReport } from "@/lib/data";
import { generateInsights, insightScore } from "@/lib/insights";
import { buildSummary, summaryToText } from "@/lib/summary";
import { findDiscrepancies } from "@/lib/discrepancies";
import { DiscrepancyList } from "@/components/panels/discrepancy-list";
import { DataQualityAlert } from "@/components/panels/data-quality-alert";
import { ExecutiveSummary } from "@/components/panels/executive-summary";
import { BudgetPacing } from "@/components/panels/budget-pacing";
import { Panel, PanelHeader, ScoreGauge, Callout, Avatar, Badge, Sparkline, EmptyState } from "@/components/ui/primitives";
import { KpiGrid } from "@/components/panels/kpi-grid";
import { TrendExplorer } from "@/components/panels/trend-explorer";
import { CampaignExplorer, TopCreatives } from "@/components/panels/campaign-explorer";
import { InsightCard } from "@/components/panels/insight-list";
import {
  BarList, BubbleScatter, DonutChart, DonutLegend, FunnelChart, Heatmap, StackedBarChart,
} from "@/components/charts";
import { currency, longDate, num, relative } from "@/lib/format";
import { titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; since?: string; until?: string; account?: string }>;
}) {
  const sp = await searchParams;
  const { data } = await loadReport({
    rangeKey: sp.range, since: sp.since, until: sp.until, accountId: sp.account,
  });
  const insights = generateInsights(data);
  const score = insightScore(data, insights);
  const summary = buildSummary(data, insights);
  const summaryText = summaryToText(data, summary);
  const code = data.account.currency;
  const money = (v: number) => currency(v, code, { compact: true });

  const platformRows = (data.breakdowns.publisher_platform?.rows ?? []).map((r) => ({
    label: titleCase(r.key), value: r.spend, row: r,
  }));
  const deviceRows = (data.breakdowns.impression_device?.rows ?? []).map((r) => ({
    label: titleCase(r.key), value: r.spend, row: r,
  }));
  const placementRows = (data.breakdowns.platform_position?.rows ?? []).slice(0, 6).map((r) => ({
    label: titleCase(r.key.replace(" · ", " · ")), value: r.spend, row: r,
    sub: r.results > 0 ? `${money(r.costPerResult)}/result` : undefined,
  }));
  const regionRows = (data.breakdowns.region?.rows ?? []).slice(0, 6).map((r) => ({
    label: r.key, value: r.spend, row: r,
    sub: r.results > 0 ? `${money(r.costPerResult)}/result` : undefined,
  }));
  const discrepancies = findDiscrepancies(data);

  const ageGender = data.breakdowns["age,gender"]?.rows ?? [];
  const genders = [...new Set(ageGender.map((r) => r.key.split(" · ")[0]))].slice(0, 3);
  const ages = [...new Set(ageGender.map((r) => r.key.split(" · ")[1]))].sort();
  const stacked = ages.map((age) => {
    const row: Record<string, any> = { key: age };
    for (const g of genders) {
      const hit = ageGender.find((r) => r.key === `${g} · ${age}`);
      row[g] = hit?.spend ?? 0;
    }
    return row;
  });

  const scatter = data.campaigns
    .filter((c) => c.results > 0 && c.spend > 0)
    .map((c) => ({ name: c.name, spend: c.spend, cpa: c.costPerResult, results: c.results }));

  return (
    <div className="space-y-5">
      {data.mode === "demo" ? (
        <Callout
          tone="brand"
          icon={<Facebook className="h-4 w-4" />}
          title="You're exploring MetaInsight with sample data"
          action={
            <a
              href="/api/meta/login"
              className="rounded-lg bg-gradient-to-r from-brand-500 to-accent px-3 py-2 text-xs font-semibold text-white shadow-glow transition hover:opacity-90"
            >
              Connect your Meta account
            </a>
          }
        >
          Every number, chart, lead and pixel diagnostic below is generated from a realistic demo account. Connect an ad account to replace it with live data.
        </Callout>
      ) : null}

      <DataQualityAlert warnings={data.warnings} />

      {/* KPIs */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{data.account.name}</h2>
            <p className="text-xs text-faint">
              {longDate(data.range.since)} – {longDate(data.range.until)} · compared with the previous {data.range.days} days · {data.account.currency} · {data.account.timezone}
            </p>
          </div>
          <Link href="/insights" className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline">
            View all {insights.length} insights <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <KpiGrid
          kpis={data.kpis}
          prev={data.prevKpis}
          series={data.series}
          prevSeries={data.prevSeries}
          code={code}
          days={data.range.days}
          rows={data.campaigns.map((c) => ({
            name: c.name, spend: c.spend, impressions: c.impressions, reach: c.reach, clicks: c.clicks,
            ctr: c.ctr, cpc: c.cpc, cpm: c.cpm, frequency: c.frequency, results: c.results,
            costPerResult: c.costPerResult, revenue: c.revenue, roas: c.roas,
            leads: c.leads, purchases: c.purchases,
          }))}
        />
      </section>

      <ExecutiveSummary summary={summary} text={summaryText} />

      {/* Trend + health */}
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendExplorer series={data.series} prevSeries={data.prevSeries} code={code} />
        </div>
        <Panel className="p-5">
          <div className="flex items-center gap-4">
            <ScoreGauge score={score} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Account health</p>
              <p className="mt-1 text-xs text-muted">
                Weighted from CTR, ROAS, frequency, spend stability and open issues.
              </p>
              <div className="mt-3 space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-2"><span className="text-faint">Critical issues</span><span className="num font-medium">{insights.filter((i) => i.severity === "critical").length}</span></div>
                <div className="flex justify-between gap-2"><span className="text-faint">Warnings</span><span className="num font-medium">{insights.filter((i) => i.severity === "warning").length}</span></div>
                <div className="flex justify-between gap-2"><span className="text-faint">Opportunities</span><span className="num font-medium">{insights.filter((i) => i.severity === "opportunity").length}</span></div>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-faint">Delivery funnel</p>
            <FunnelChart steps={data.leadFunnel.slice(0, 6)} />
          </div>
        </Panel>
      </section>

      <BudgetPacing data={data} />

      {/* Campaigns */}
      <CampaignExplorer campaigns={data.campaigns} adSets={data.adSets} ads={data.ads} code={code} account={data.kpis} />

      {/* Audience snapshot */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Spend by age & gender"
            subtitle="Where budget went across demographic segments"
            icon={<Target className="h-4 w-4" />}
          />
          <div className="px-2 pb-4 pt-3">
            {stacked.length ? (
              <StackedBarChart
                data={stacked}
                stacks={genders.map((g) => ({ key: g, label: titleCase(g) }))}
                type="currency"
                code={code}
              />
            ) : (
              <EmptyState icon={<Target className="h-5 w-5" />} title="No demographic data in this period" />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Platform mix" subtitle="Spend split by publisher" icon={<PieIcon className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-3">
            <DonutChart data={platformRows} type="currency" code={code} center="Total spend" height={200} dimension="publisher_platform" account={data.kpis} />
            <DonutLegend data={platformRows} type="currency" code={code} className="mt-3" dimension="publisher_platform" account={data.kpis} />
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Device</p>
              <BarList rows={deviceRows} type="currency" code={code} dimension="impression_device" account={data.kpis} />
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Top placements" subtitle="Spend and cost per result by placement" icon={<Layers className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4"><BarList rows={placementRows} type="currency" code={code} dimension="platform_position" account={data.kpis} /></div>
        </Panel>
        <Panel>
          <PanelHeader title="Top regions" subtitle="Geographic distribution of spend" icon={<Radio className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4"><BarList rows={regionRows} type="currency" code={code} dimension="region" account={data.kpis} /></div>
        </Panel>
      </section>

      {/* Timing */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Results by day & hour"
            subtitle="Best time-of-day windows across the week"
            icon={<Activity className="h-4 w-4" />}
          />
          <div className="px-5 pb-5 pt-4">
            {data.hourly.length ? (
              <Heatmap cells={data.hourly} days={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]} code={code} />
            ) : (
              <EmptyState icon={<Activity className="h-5 w-5" />} title="Hourly breakdown unavailable" description="Meta did not return hourly data for this range." />
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Day of week" subtitle="Results and cost per result" icon={<MousePointerClick className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            <BarList
              rows={data.weekday.map((w) => ({ label: w.day, value: w.results, sub: w.cpa > 0 ? `${money(w.cpa)}/res` : undefined }))}
              type="number"
            />
          </div>
        </Panel>
      </section>

      {/* Efficiency + creatives */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Spend vs cost per result"
            subtitle="Bubble size = number of results. Lower and further right is better."
            icon={<Wallet className="h-4 w-4" />}
          />
          <div className="px-3 pb-4 pt-3">
            {scatter.length ? <BubbleScatter data={scatter} code={code} height={320} /> : <EmptyState icon={<Wallet className="h-5 w-5" />} title="Not enough conversion data" />}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Top creatives" subtitle="Best performing ads" icon={<Sparkles className="h-4 w-4" />} />
          <TopCreatives ads={data.ads} code={code} limit={5} account={data.kpis} />
        </Panel>
      </section>

      {/* Insights + leads + pixel */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">Priority actions</h2>
            <Link href="/insights" className="text-xs font-medium text-brand-500 hover:underline">See all</Link>
          </div>
          {insights.slice(0, 2).map((i) => <InsightCard key={i.id} insight={i} />)}
          {!insights.length ? (
            <Panel className="p-5 text-sm text-muted">No issues detected for this period — your account looks healthy.</Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          {discrepancies.length ? (
            <Panel>
              <PanelHeader
                title="Data discrepancies"
                subtitle={`${discrepancies.length} gap${discrepancies.length === 1 ? "" : "s"} between your ads, pixel and leads`}
                icon={<Wrench className="h-4 w-4" />}
              />
              <div className="px-4 pb-4 pt-3">
                <DiscrepancyList items={discrepancies.slice(0, 3)} code={code} compact />
                <Link href="/pixel#discrepancies" className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:underline">
                  See all discrepancies & fixes <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Latest leads" subtitle={`${num(data.leads.length)} in this period`} icon={<UserPlus className="h-4 w-4" />} />
            <div className="space-y-2 px-5 pb-5 pt-4">
              {data.leads.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center gap-2.5">
                  <Avatar name={l.fullName} className="h-7 w-7 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">{l.fullName}</p>
                    <p className="truncate text-[10px] text-faint">{l.city} · {relative(l.createdTime)}</p>
                  </div>
                  <Badge tone={l.intent === "Hot" ? "pos" : l.intent === "Warm" ? "warn" : "neutral"}>{l.intent}</Badge>
                </div>
              ))}
              {!data.leads.length ? <p className="text-xs text-muted">No leads captured in this period.</p> : null}
              <Link href="/leads" className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-brand-500 hover:underline">
                Open lead centre <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Pixel status"
              subtitle={data.pixel ? `${data.pixel.events.length} events tracked` : "No pixel found"}
              icon={<Activity className="h-4 w-4" />}
            />
            <div className="space-y-3 px-5 pb-5 pt-4">
              {data.pixel ? (
                <>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">Last event</span>
                    <span className="font-medium">{relative(data.pixel.lastFiredTime)}</span>
                  </div>
                  {data.pixel.events.slice(0, 4).map((e) => (
                    <div key={e.event} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium">{e.event}</p>
                        <p className="text-[10px] text-faint">{num(e.count)} events</p>
                      </div>
                      <Sparkline data={e.trend} width={70} height={20} />
                    </div>
                  ))}
                  <Link href="/pixel" className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-brand-500 hover:underline">
                    Pixel & events <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              ) : (
                <p className="text-xs text-muted">Connect an ad account with a pixel to see event diagnostics.</p>
              )}
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}
