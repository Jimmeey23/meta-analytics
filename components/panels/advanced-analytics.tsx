"use client";

import * as React from "react";
import { BarChart3, Building2, Gauge, MousePointerClick, Target, Wallet } from "lucide-react";
import type { AdRow, AdSetRow, CampaignRow, Kpis } from "@/lib/types";
import { CampaignExplorer } from "./campaign-explorer";
import { EmptyState, Panel, PanelHeader } from "@/components/ui/primitives";
import { currency, num, pct } from "@/lib/format";
import { safeDiv } from "@/lib/utils";

function aggregate(rows: CampaignRow[]) {
  const spend = rows.reduce((n, r) => n + r.spend, 0);
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const reach = rows.reduce((n, r) => n + r.reach, 0);
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  const results = rows.reduce((n, r) => n + r.results, 0);
  const revenue = rows.reduce((n, r) => n + r.revenue, 0);
  return { spend, impressions, reach, clicks, results, revenue, ctr: safeDiv(clicks, impressions) * 100, cpc: safeDiv(spend, clicks), cpm: safeDiv(spend, impressions) * 1000, cpa: safeDiv(spend, results), roas: safeDiv(revenue, spend), frequency: safeDiv(impressions, reach) };
}

export function AdvancedAnalytics({ campaigns, adSets, ads, accountKpis, code }: { campaigns: CampaignRow[]; adSets: AdSetRow[]; ads: AdRow[]; accountKpis: Kpis; code: string }) {
  const locations = React.useMemo(() => ["All studios", ...new Set([...campaigns, ...adSets, ...ads].map((row) => row.location ?? "Unassigned"))], [campaigns, adSets, ads]);
  const [location, setLocation] = React.useState("All studios");
  const locationAds = location === "All studios" ? ads : ads.filter((a) => a.location === location);
  const locationAdSetIds = new Set(locationAds.map((a) => a.adSetId));
  const filteredAdSets = location === "All studios" ? adSets : adSets.filter((a) => a.location === location || locationAdSetIds.has(a.id));
  const ids = new Set(filteredAdSets.map((a) => a.campaignId));
  const filteredCampaigns = location === "All studios" ? campaigns : campaigns.filter((c) => c.location === location || ids.has(c.id));
  const adSetIds = new Set(filteredAdSets.map((a) => a.id));
  const filteredAds = location === "All studios" ? ads : ads.filter((a) => a.location === location && adSetIds.has(a.adSetId));
  const totals = aggregate(location === "All studios" ? campaigns : filteredAdSets);
  const studioRows = locations.slice(1).map((name) => ({ name, ...aggregate(adSets.filter((row) => (row.location ?? "Unassigned") === name)) })).filter((row) => row.spend > 0).sort((a, b) => b.spend - a.spend);
  const metrics = [
    ["Spend", currency(totals.spend, code, { compact: true }), Wallet], ["Results", num(totals.results), Target],
    ["Cost / result", currency(totals.cpa, code, { compact: true }), Gauge], ["ROAS", `${totals.roas.toFixed(2)}×`, BarChart3],
    ["CTR", pct(totals.ctr), MousePointerClick], ["CPM", currency(totals.cpm, code, { compact: true }), Building2],
  ] as const;

  return <div className="space-y-5">
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Studio performance filter</p><p className="mt-0.5 text-[11px] text-muted">Attribution is derived from campaign naming; Unassigned means no recognised studio tag was found.</p></div><select aria-label="Filter analytics by studio" value={location} onChange={(e) => setLocation(e.target.value)} className="h-11 min-w-[210px] rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-brand-500">{locations.map((item) => <option key={item}>{item}</option>)}</select></div>
    </Panel>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{metrics.map(([label, value, Icon]) => <Panel key={label} className="p-4"><Icon className="h-4 w-4 text-brand-500" /><p className="mt-3 text-[10px] uppercase tracking-wide text-faint">{label}</p><p className="num mt-0.5 text-xl font-semibold">{value}</p></Panel>)}</div>
    <Panel>
      <PanelHeader title="Studio comparison" subtitle="Location-level efficiency and delivery" icon={<Building2 className="h-4 w-4" />} />
      {studioRows.length ? (
      <div className="overflow-x-auto"><table className="mt-4 w-full min-w-[760px]"><thead><tr className="bg-ink/[0.02] text-[10px] uppercase text-faint"><th className="px-4 py-2 text-left">Studio</th>{["Spend","Results","CPA","ROAS","CTR","CPM"].map((h) => <th key={h} className="px-3 py-2 text-right">{h}</th>)}</tr></thead><tbody>{studioRows.map((row) => <tr key={row.name} className="border-t border-line/60 text-xs"><td className="px-4 py-3 font-medium">{row.name}</td><td className="num px-3 py-3 text-right">{currency(row.spend, code, { compact: true })}</td><td className="num px-3 py-3 text-right">{num(row.results)}</td><td className="num px-3 py-3 text-right">{currency(row.cpa, code, { compact: true })}</td><td className="num px-3 py-3 text-right">{row.roas.toFixed(2)}×</td><td className="num px-3 py-3 text-right">{pct(row.ctr)}</td><td className="num px-3 py-3 text-right">{currency(row.cpm, code, { compact: true })}</td></tr>)}</tbody></table></div>
      ) : (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No studio tags found"
          description="Studio attribution is derived from the names of your campaigns, ad sets and ads. When a name contains a recognised studio tag it appears here with its own efficiency breakdown."
        />
      )}
      {studioRows.some((row) => row.name === "Unassigned") ? (
        <p className="px-5 pb-4 pt-3 text-[11px] text-faint">
          Studio attribution is derived from entity naming. Rename unassigned Meta campaigns, ad sets or ads with Bandra, Kemps (KC), Bengaluru/BLR or Mumbai to classify them.
        </p>
      ) : null}
    </Panel>
    <CampaignExplorer campaigns={filteredCampaigns} adSets={filteredAdSets} ads={filteredAds} code={code} />
    {location !== "All studios" && totals.spend === 0 && accountKpis.spend > 0 ? <p className="text-xs text-warn">No spend is attributed to this studio in the selected period. Confirm the studio tag in Meta entity names.</p> : null}
  </div>;
}
