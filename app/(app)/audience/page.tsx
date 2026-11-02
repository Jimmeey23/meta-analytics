import * as React from "react";
import { Compass, Globe2, Layers, Monitor, PieChart as PieIcon, Target, Timer, Users } from "lucide-react";
import { loadReport } from "@/lib/data";
import { Panel, PanelHeader, EmptyState } from "@/components/ui/primitives";
import { BarList, DonutChart, DonutLegend, Heatmap, StackedBarChart } from "@/components/charts";
import { currency, num, pct } from "@/lib/format";
import { titleCase } from "@/lib/utils";
import { OpenDrilldown } from "@/components/panels/drilldown-context";

export const dynamic = "force-dynamic";

export default async function AudiencePage({
  searchParams,
}: { searchParams: Promise<{ range?: string; since?: string; until?: string; account?: string }> }) {
  const sp = await searchParams;
  const { data } = await loadReport({ rangeKey: sp.range, since: sp.since, until: sp.until, accountId: sp.account });
  const code = data.account.currency;
  const money = (v: number) => currency(v, code, { compact: true });

  const ageGender = data.breakdowns["age,gender"]?.rows ?? [];
  const genders = [...new Set(ageGender.map((r) => r.key.split(" · ")[0]))].slice(0, 3);
  const ages = [...new Set(ageGender.map((r) => r.key.split(" · ")[1] ?? ""))].filter(Boolean).sort();
  const stacked = ages.map((age) => {
    const row: Record<string, any> = { key: age };
    for (const g of genders) row[g] = ageGender.find((r) => r.key === `${g} · ${age}`)?.spend ?? 0;
    return row;
  });

  const platform = (data.breakdowns.publisher_platform?.rows ?? []).map((r) => ({ label: titleCase(r.key), value: r.spend, row: r }));
  const device = (data.breakdowns.impression_device?.rows ?? []).map((r) => ({ label: titleCase(r.key), value: r.spend, row: r }));
  const placement = (data.breakdowns.platform_position?.rows ?? []).slice(0, 10);
  const region = (data.breakdowns.region?.rows ?? []).slice(0, 12);

  const bestSegments = [...ageGender].filter((r) => r.results > 0).sort((a, b) => a.costPerResult - b.costPerResult).slice(0, 5);
  const worstSegments = [...ageGender].filter((r) => r.spend > 0).sort((a, b) => b.costPerResult - a.costPerResult).slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Age & gender" subtitle="Spend distribution across demographics" icon={<Users className="h-4 w-4" />} />
          <div className="px-2 pb-4 pt-3">
            {stacked.length ? <StackedBarChart data={stacked} stacks={genders.map((g) => ({ key: g, label: titleCase(g) }))} type="currency" code={code} /> : <EmptyState icon={<Users className="h-5 w-5" />} title="No demographic data" />}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Best segments" subtitle="Lowest cost per result" icon={<Target className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            {bestSegments.length ? (
              <BarList rows={bestSegments.map((r) => ({ label: titleCase(r.key), value: r.results, row: r, sub: `${money(r.costPerResult)}/res` }))} type="number" code={code} dimension="age,gender" account={data.kpis} />
            ) : (
              <EmptyState icon={<Target className="h-5 w-5" />} title="Not enough conversion data" />
            )}
            {worstSegments.length ? (
              <>
                <p className="mt-5 mb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Most expensive segments</p>
                <BarList rows={worstSegments.map((r) => ({ label: titleCase(r.key), value: r.costPerResult, row: r, sub: `${money(r.spend)} spend`, tone: "linear-gradient(90deg, hsl(var(--neg)), hsl(var(--warn)))" }))} type="currency" code={code} dimension="age,gender" account={data.kpis} />
              </>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Platform" subtitle="Facebook vs Instagram vs Audience Network" icon={<PieIcon className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-3">
            <DonutChart data={platform} type="currency" code={code} center="Spend" height={200} dimension="publisher_platform" account={data.kpis} />
            <DonutLegend data={platform} type="currency" code={code} className="mt-3" dimension="publisher_platform" account={data.kpis} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Device" subtitle="Where impressions were served" icon={<Monitor className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-3">
            <DonutChart data={device} type="currency" code={code} center="Spend" height={200} dimension="impression_device" account={data.kpis} />
            <DonutLegend data={device} type="currency" code={code} className="mt-3" dimension="impression_device" account={data.kpis} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Placements" subtitle="Spend and cost per result by slot" icon={<Layers className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            <BarList
              rows={placement.map((r) => ({ label: titleCase(r.key.replace(" · ", " · ")), value: r.spend, row: r, sub: r.results > 0 ? `${money(r.costPerResult)}/res` : undefined }))}
              type="currency"
              code={code}
              dimension="platform_position"
              account={data.kpis}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Geography" subtitle="Top regions by spend" icon={<Globe2 className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            <BarList
              rows={region.map((r) => ({ label: r.key, value: r.spend, row: r, sub: r.results > 0 ? `${money(r.costPerResult)}/res` : undefined }))}
              type="currency"
              code={code}
              dimension="region"
              account={data.kpis}
            />
          </div>
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader title="Conversions by day & hour" subtitle="Observed advertiser-timezone windows; validate with a controlled schedule test" icon={<Timer className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            {data.hourly.length ? (
              <Heatmap cells={data.hourly} days={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]} code={code} />
            ) : (
              <EmptyState icon={<Timer className="h-5 w-5" />} title="Hourly data unavailable" />
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Day of week" subtitle="Results and efficiency by weekday" icon={<Compass className="h-4 w-4" />} />
        <div className="grid gap-4 px-5 pb-5 pt-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Results</p>
            <BarList rows={data.weekday.map((w) => ({ label: w.day, value: w.results }))} type="number" />
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Spend</p>
            <BarList rows={data.weekday.map((w) => ({ label: w.day, value: w.spend, sub: w.cpa > 0 ? `${money(w.cpa)}/res` : undefined }))} type="currency" code={code} />
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Segment detail" subtitle="Every demographic Meta reported in this period" icon={<Users className="h-4 w-4" />} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-ink/[0.02] text-left text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-semibold">Segment</th>
                <th className="px-3 py-2 text-right font-semibold">Spend</th>
                <th className="px-3 py-2 text-right font-semibold">Impressions</th>
                <th className="px-3 py-2 text-right font-semibold">Reach</th>
                <th className="px-3 py-2 text-right font-semibold">CTR</th>
                <th className="px-3 py-2 text-right font-semibold">CPC</th>
                <th className="px-3 py-2 text-right font-semibold">CPM</th>
                <th className="px-3 py-2 text-right font-semibold">Results</th>
                <th className="px-3 py-2 text-right font-semibold">CPA</th>
                <th className="px-3 py-2 text-right font-semibold">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {ageGender.map((r) => (
                <OpenDrilldown
                  as="tr"
                  key={r.key}
                  className="cursor-pointer border-t border-line/60 hover:bg-ink/[0.02]"
                  drilldown={{ kind: "segment", payload: { label: titleCase(r.key), dimension: "age,gender", row: r, account: data.kpis, code } }}
                >
                  <td className="px-4 py-2.5 text-[12px] font-medium">{titleCase(r.key)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num">{money(r.spend)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num text-muted">{num(r.impressions)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num text-muted">{num(r.reach)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num">{pct(r.ctr)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num">{money(r.cpc)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num">{money(r.cpm)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num">{num(r.results)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num">{money(r.costPerResult)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] num">{r.roas > 0 ? `${r.roas.toFixed(2)}×` : "—"}</td>
                </OpenDrilldown>
              ))}
            </tbody>
          </table>
          {!ageGender.length ? <EmptyState icon={<Users className="h-5 w-5" />} title="No breakdown data" /> : null}
        </div>
      </Panel>
    </div>
  );
}
