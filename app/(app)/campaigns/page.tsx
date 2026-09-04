import * as React from "react";
import { Image as ImageIcon, Layers, Megaphone, Target, Wallet } from "lucide-react";
import { loadReport } from "@/lib/data";
import { Panel, PanelHeader, Sparkline, EmptyState } from "@/components/ui/primitives";
import { MiniStatRow } from "@/components/panels/kpi-grid";
import { CampaignExplorer, TopCreatives } from "@/components/panels/campaign-explorer";
import { CreativeGallery } from "@/components/panels/creative-gallery";
import { OpenDrilldown } from "@/components/panels/drilldown-context";
import { BubbleScatter, TrendChart } from "@/components/charts";
import { currency, num, objectiveLabel, pct, rankingLabel, rankingTone } from "@/lib/format";
import { pctChange, safeDiv, titleCase as tc } from "@/lib/utils";
import type { AdRow, AdSetRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function AdSetTable({ rows, code, ads }: { rows: AdSetRow[]; code: string; ads: AdRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="bg-ink/[0.02] text-left text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-2 font-semibold">Ad set</th>
            <th className="px-3 py-2 font-semibold">Campaign</th>
            <th className="px-3 py-2 text-right font-semibold">Spend</th>
            <th className="px-3 py-2 text-right font-semibold">Reach</th>
            <th className="px-3 py-2 text-right font-semibold">Freq</th>
            <th className="px-3 py-2 text-right font-semibold">CTR</th>
            <th className="px-3 py-2 text-right font-semibold">Results</th>
            <th className="px-3 py-2 text-right font-semibold">CPA</th>
            <th className="px-3 py-2 text-right font-semibold">ROAS</th>
            <th className="px-3 py-2 font-semibold">Quality</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <OpenDrilldown
              as="tr"
              key={r.id}
              className="cursor-pointer border-t border-line/60 transition hover:bg-ink/[0.02]"
              drilldown={{
                kind: "entity",
                payload: { row: r, type: "adset", code, children: ads.filter((a: AdRow) => a.adSetId === r.id) },
              }}
              title={`Open ${r.name} details`}
            >
              <td className="max-w-[240px] truncate px-4 py-2.5 text-[12px] font-medium" title={r.name}>{r.name}</td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-[11px] text-muted" title={r.campaignName}>{r.campaignName}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{currency(r.spend, code, { compact: true })}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num text-muted">{num(r.reach)}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num text-muted">{r.frequency.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{pct(r.ctr)}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{num(r.results)}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{currency(r.costPerResult, code, { compact: true })}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{r.roas > 0 ? `${r.roas.toFixed(2)}×` : "—"}</td>
              <td className="px-3 py-2.5 text-[11px]">
                <span className={rankingTone(r.qualityRanking)}>{rankingLabel(r.qualityRanking)}</span>
              </td>
            </OpenDrilldown>
          ))}
        </tbody>
      </table>
      {!rows.length ? <EmptyState icon={<Layers className="h-5 w-5" />} title="No ad sets in this period" /> : null}
    </div>
  );
}

function AdTable({ rows, code, ads, account }: { rows: AdRow[]; code: string; ads: AdRow[]; account: any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="bg-ink/[0.02] text-left text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-2 font-semibold">Creative</th>
            <th className="px-3 py-2 font-semibold">Ad set</th>
            <th className="px-3 py-2 text-right font-semibold">Spend</th>
            <th className="px-3 py-2 text-right font-semibold">Impr.</th>
            <th className="px-3 py-2 text-right font-semibold">CTR</th>
            <th className="px-3 py-2 text-right font-semibold">CPC</th>
            <th className="px-3 py-2 text-right font-semibold">Results</th>
            <th className="px-3 py-2 text-right font-semibold">CPA</th>
            <th className="px-3 py-2 font-semibold">14d trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <OpenDrilldown
              as="tr"
              key={r.id}
              className="cursor-pointer border-t border-line/60 transition hover:bg-ink/[0.02]"
              drilldown={{
                kind: "creative",
                payload: {
                  ad: r,
                  code,
                  account,
                  siblings: ads.filter((a: AdRow) => a.adSetId === r.adSetId && a.id !== r.id),
                },
              }}
              title="Open creative analysis"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-brand-500/25 to-accent/20 text-brand-500">
                    {r.creative?.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.creative.thumbnail} alt="" className="h-10 w-10 object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="max-w-[260px] truncate text-[12px] font-medium">{r.creative?.title ?? r.name}</p>
                    <p className="max-w-[260px] truncate text-[10px] text-faint">
                      {r.creative?.format ?? "Ad"}
                      {r.creative?.cta ? ` · ${tc(r.creative.cta.replace(/_/g, " "))}` : ""}
                    </p>
                  </div>
                </div>
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-[11px] text-muted">{r.adSetName}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{currency(r.spend, code, { compact: true })}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num text-muted">{num(r.impressions)}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{pct(r.ctr)}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{currency(r.cpc, code, { compact: true })}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{num(r.results)}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num">{currency(r.costPerResult, code, { compact: true })}</td>
              <td className="px-3 py-2.5">{r.trend?.length ? <Sparkline data={r.trend} width={70} height={22} /> : null}</td>
            </OpenDrilldown>
          ))}
        </tbody>
      </table>
      {!rows.length ? <EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No ads in this period" /> : null}
    </div>
  );
}

export default async function CampaignsPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; since?: string; until?: string; account?: string }> }) {
  const sp = await searchParams;
  const { data } = await loadReport({ rangeKey: sp.range, since: sp.since, until: sp.until, accountId: sp.account });
  const code = data.account.currency;
  const active = data.campaigns.filter((c) => (c.status ?? "").toUpperCase().includes("ACTIVE"));
  const spendData = data.series.map((s) => ({ date: s.date, spend: s.spend, results: s.results }));

  return (
    <div className="space-y-5">
      <MiniStatRow
        items={[
          { label: "Campaigns", value: num(data.campaigns.length), icon: <Megaphone className="h-4 w-4" /> },
          { label: "Active now", value: num(active.length), icon: <Target className="h-4 w-4" /> },
          {
            label: "Spend", value: currency(data.kpis.spend, code, { compact: true }), icon: <Wallet className="h-4 w-4" />,
            delta: pctChange(data.kpis.spend, data.prevKpis.spend),
          },
          {
            label: "Cost per result", value: currency(data.kpis.costPerResult, code, { compact: true }), icon: <Target className="h-4 w-4" />,
            delta: pctChange(data.kpis.costPerResult, data.prevKpis.costPerResult), invert: true,
          },
        ]}
      />

      <CampaignExplorer campaigns={data.campaigns} adSets={data.adSets} ads={data.ads} code={code} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Spend vs results" subtitle="Daily delivery across all campaigns" icon={<Wallet className="h-4 w-4" />} />
          <div className="px-2 pb-4 pt-3">
            <TrendChart
              data={spendData}
              code={code}
              type="currency"
              height={280}
              keys={[{ key: "spend", label: "Spend", color: "hsl(var(--chart-1))" }]}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Top creatives" subtitle="Ranked by results then CTR" icon={<ImageIcon className="h-4 w-4" />} />
          <TopCreatives ads={data.ads} code={code} limit={6} account={data.kpis} />
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Ad sets" subtitle={`${data.adSets.length} ad sets · ranked by spend`} icon={<Layers className="h-4 w-4" />} />
        <AdSetTable rows={data.adSets.slice(0, 25)} code={code} ads={data.ads} />
      </Panel>

      <Panel>
        <PanelHeader title="Ads & creatives" subtitle={`${data.ads.length} ads · ranked by spend`} icon={<ImageIcon className="h-4 w-4" />} />
        <AdTable rows={data.ads.slice(0, 30)} code={code} ads={data.ads} account={data.kpis} />
      </Panel>

      <Panel>
        <PanelHeader
          title="Creative library"
          subtitle="Hover a creative to expand its metrics · click to open the full analysis"
          icon={<ImageIcon className="h-4 w-4" />}
        />
        <CreativeGallery ads={data.ads} code={code} account={data.kpis} limit={12} />
      </Panel>

      <Panel>
        <PanelHeader title="Efficiency map" subtitle="Bubble size = results. Lower and further right is better." icon={<Target className="h-4 w-4" />} />
        <div className="px-3 pb-4 pt-3">
          <BubbleScatter
            data={data.campaigns.filter((c) => c.results > 0 && c.spend > 0).map((c) => ({ name: c.name, spend: c.spend, cpa: c.costPerResult, results: c.results }))}
            code={code}
            height={340}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Objective mix" subtitle="Spend distribution by campaign objective" icon={<Megaphone className="h-4 w-4" />} />
        <div className="grid gap-2 px-5 pb-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(
            data.campaigns.reduce<Record<string, { spend: number; results: number; count: number }>>((acc, c) => {
              const key = objectiveLabel(c.objective);
              acc[key] ??= { spend: 0, results: 0, count: 0 };
              acc[key].spend += c.spend;
              acc[key].results += c.results;
              acc[key].count += 1;
              return acc;
            }, {}),
          )
            .sort((a, b) => b[1].spend - a[1].spend)
            .map(([label, v]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">{label}</p>
                  <p className="text-[10px] text-faint">{v.count} campaigns</p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-semibold num">{currency(v.spend, code, { compact: true })}</p>
                  <p className="text-[10px] text-faint num">{currency(safeDiv(v.spend, v.results), code, { compact: true })}/result</p>
                </div>
              </div>
            ))}
        </div>
      </Panel>
    </div>
  );
}
