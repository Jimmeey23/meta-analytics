"use client";
import * as React from "react";
import { ChevronDown, ChevronRight, Filter, Image as ImageIcon, Search, Sparkles } from "lucide-react";
import { Badge, EmptyState, Panel, PanelHeader, Sparkline } from "@/components/ui/primitives";
import { currency, num, objectiveLabel, pct, rankingLabel, rankingTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OpenDrilldown, useDrilldown } from "./drilldown-context";
import type { AdRow, AdSetRow, CampaignRow, Kpis } from "@/lib/types";
import { CreativeThumb } from "./creative-gallery";

type SortKey = "name" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "results" | "costPerResult" | "roas" | "frequency";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "spend", label: "Spend", align: "right" },
  { key: "impressions", label: "Impr.", align: "right" },
  { key: "frequency", label: "Freq", align: "right" },
  { key: "clicks", label: "Clicks", align: "right" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "cpc", label: "CPC", align: "right" },
  { key: "results", label: "Results", align: "right" },
  { key: "costPerResult", label: "CPA", align: "right" },
  { key: "roas", label: "ROAS", align: "right" },
];

function StatusPill({ status }: { status: string }) {
  const s = status?.toUpperCase() ?? "UNKNOWN";
  const tone = s.includes("ACTIVE") ? "pos" : s.includes("PAUSED") ? "warn" : "neutral";
  return <Badge tone={tone as any}>{s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ")}</Badge>;
}

export function CampaignExplorer({
  campaigns, adSets, ads, code, account, defaultSort = "spend",
}: { campaigns: CampaignRow[]; adSets: AdSetRow[]; ads: AdRow[]; code: string; account?: Kpis; defaultSort?: SortKey }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("ALL");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: defaultSort, dir: "desc" });
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [openAds, setOpenAds] = React.useState<Set<string>>(new Set());
  const { open: openDrilldown } = useDrilldown();

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns
      .filter((c) => (status === "ALL" ? true : (c.status ?? "").toUpperCase().includes(status)))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) || objectiveLabel(c.objective).toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (sort.key === "name") return sort.dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        const av = (a[sort.key] as number) ?? 0;
        const bv = (b[sort.key] as number) ?? 0;
        return sort.dir === "asc" ? av - bv : bv - av;
      });
  }, [campaigns, query, status, sort]);

  const adSetsByCampaign = React.useMemo(() => {
    const map = new Map<string, AdSetRow[]>();
    for (const a of adSets) {
      if (!map.has(a.campaignId)) map.set(a.campaignId, []);
      map.get(a.campaignId)!.push(a);
    }
    return map;
  }, [adSets]);

  const adsByAdSet = React.useMemo(() => {
    const map = new Map<string, AdRow[]>();
    for (const a of ads) {
      if (!map.has(a.adSetId)) map.set(a.adSetId, []);
      map.get(a.adSetId)!.push(a);
    }
    return map;
  }, [ads]);

  const money = (v: number) => currency(v, code, { compact: true });

  const Row = ({ row, depth, extra }: { row: CampaignRow; depth: number; extra?: React.ReactNode }) => (
    <tr className="border-t border-line/60 transition hover:bg-ink/[0.02]">
      <td className="sticky left-0 z-10 bg-surface/95 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2" style={{ paddingLeft: depth * 18 }}>
          {extra}
          <button type="button"
            className="min-w-0 cursor-pointer text-left focus-visible:outline-none focus-visible:text-brand-500"
            aria-haspopup="dialog" aria-label={`Open ${row.name} details`}
            onClick={() =>
              openDrilldown({
                kind: "entity",
                payload: {
                  row,
                  type: "campaign",
                  code, account,
                  children: adSetsByCampaign.get(row.id) ?? [],
                  creatives: ads.filter((a) => (adSetsByCampaign.get(row.id) ?? []).some((s) => s.id === a.adSetId)),
                },
              })
            }
            title={`Open ${row.name} details`}
          >
            <p className={cn("truncate text-[13px] hover:text-brand-500", depth === 0 ? "font-medium" : "text-muted")} title={row.name}>{row.name}</p>
            <p className="truncate text-[10px] text-faint">
              {objectiveLabel(row.objective)}
              {row.budget > 0 ? ` · ${money(row.budget)}/${row.budgetType === "lifetime" ? "total" : "day"}` : ""}
              {row.qualityRanking ? ` · Quality ${rankingLabel(row.qualityRanking)}` : ""}
            </p>
          </button>
        </div>
      </td>
      <td className="px-3 py-2.5"><StatusPill status={row.status} /></td>
      {COLUMNS.map((c) => (
        <td key={c.key} className={cn("whitespace-nowrap px-3 py-2.5 text-[12px] num", c.align === "right" && "text-right")}>
          {c.key === "spend" || c.key === "cpc" || c.key === "costPerResult" ? money(row[c.key] as number)
            : c.key === "ctr" ? pct(row.ctr)
            : c.key === "frequency" ? row.frequency.toFixed(2)
            : c.key === "roas" ? (row.roas > 0 ? `${row.roas.toFixed(2)}×` : "—")
            : num(row[c.key] as number)}
        </td>
      ))}
      <td className="px-3 py-2.5">
        {row.trend?.length ? <Sparkline data={row.trend} width={70} height={22} /> : <span className="text-[11px] text-faint">—</span>}
      </td>
    </tr>
  );

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Campaign hierarchy"
        subtitle="Click a campaign to drill into ad sets, then into individual ads"
        icon={<Filter className="h-4 w-4" />}
        right={
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search campaigns…"
                className="w-40 rounded-lg border border-line bg-bg py-1.5 pl-8 pr-2 text-[11px] outline-none transition focus:border-brand-500 sm:w-52"
              />
            </div>
            <div className="flex max-w-full flex-wrap rounded-lg border border-line p-0.5">
              {["ALL", "ACTIVE", "PAUSED", "ARCHIVED"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition",
                    status === s ? "bg-brand-500 text-white" : "text-faint hover:text-ink",
                  )}
                >
                  {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className="bg-ink/[0.02] text-left">
              <th className="sticky left-0 z-10 bg-surface/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-faint backdrop-blur">Campaign / ad set / ad</th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Status</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                  className={cn(
                    "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-faint transition hover:text-ink",
                    c.align === "right" && "text-right",
                  )}
                >
                  {c.label}
                  {sort.key === c.key ? <span className="ml-0.5 text-brand-500">{sort.dir === "desc" ? "↓" : "↑"}</span> : null}
                </th>
              ))}
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-faint">14d</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const isOpen = open.has(c.id);
              const children = adSetsByCampaign.get(c.id) ?? [];
              return (
                <React.Fragment key={c.id}>
                  <Row
                    row={c}
                    depth={0}
                    extra={
                      <button
                        onClick={() => setOpen(toggle(open, c.id))}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-faint transition hover:bg-ink/5 hover:text-ink"
                      >
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    }
                  />
                  {isOpen
                    ? children.map((s) => {
                        const adOpen = openAds.has(s.id);
                        const grandchildren = adsByAdSet.get(s.id) ?? [];
                        return (
                          <React.Fragment key={s.id}>
                            <tr className="border-t border-line/40 bg-ink/[0.015] transition hover:bg-ink/[0.03]">
                              <td className="sticky left-0 z-10 bg-surface/95 px-3 py-2 backdrop-blur">
                                <div className="flex items-center gap-2 pl-[18px]">
                                  <button
                                    onClick={() => setOpenAds(toggle(openAds, s.id))}
                                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-faint transition hover:bg-ink/5 hover:text-ink"
                                  >
                                    {adOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  </button>
                                  <button type="button"
                                    aria-haspopup="dialog" aria-label={`Open ${s.name} details`}
                                    className="truncate text-[12px] text-muted hover:text-brand-500"
                                    title={`Open ${s.name} details`}
                                    onClick={() =>
                                      openDrilldown({
                                        kind: "entity",
                                        payload: {
                                          row: s,
                                          type: "adset",
                                          code, account,
                                          children: adsByAdSet.get(s.id) ?? [],
                                        },
                                      })
                                    }
                                  >
                                    {s.name}
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2"><StatusPill status={s.status} /></td>
                              {COLUMNS.map((col) => (
                                <td key={col.key} className={cn("whitespace-nowrap px-3 py-2 text-[11px] num text-muted", col.align === "right" && "text-right")}>
                                  {col.key === "spend" || col.key === "cpc" || col.key === "costPerResult" ? money(s[col.key] as number)
                                    : col.key === "ctr" ? pct(s.ctr)
                                    : col.key === "frequency" ? s.frequency.toFixed(2)
                                    : col.key === "roas" ? (s.roas > 0 ? `${s.roas.toFixed(2)}×` : "—")
                                    : num(s[col.key] as number)}
                                </td>
                              ))}
                              <td className="px-3 py-2">{s.trend?.length ? <Sparkline data={s.trend} width={70} height={22} /> : null}</td>
                            </tr>
                            {adOpen
                              ? grandchildren.map((a) => (
                                  <tr key={a.id} className="border-t border-line/30 bg-ink/[0.03] transition hover:bg-ink/[0.05]">
                                    <td className="sticky left-0 z-10 bg-surface/95 px-3 py-2 backdrop-blur">
                                      <div className="flex items-center gap-2 pl-[54px]">
                                        <CreativeThumb ad={a} code={code} account={account} className="h-9 w-9" />
                                        <div
                                          className="min-w-0 cursor-pointer"
                                          onClick={() =>
                                            openDrilldown({
                                              kind: "creative",
                                              payload: {
                                                ad: a,
                                                code,
                                                siblings: (adsByAdSet.get(a.adSetId) ?? []).filter((x) => x.id !== a.id),
                                              },
                                            })
                                          }
                                          title="Open creative analysis"
                                        >
                                          <p className="truncate text-[12px] hover:text-brand-500">{a.creative?.title ?? a.name}</p>
                                          <p className="truncate text-[10px] text-faint">
                                            {a.creative?.format ?? "Ad"}
                                            {a.creative?.cta ? ` · ${a.creative.cta.replace(/_/g, " ").toLowerCase()}` : ""}
                                            {a.qualityRanking ? ` · ${rankingLabel(a.qualityRanking)}` : ""}
                                          </p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2"><StatusPill status={a.status} /></td>
                                    {COLUMNS.map((col) => (
                                      <td key={col.key} className={cn("whitespace-nowrap px-3 py-2 text-[11px] num text-muted", col.align === "right" && "text-right")}>
                                        {col.key === "spend" || col.key === "cpc" || col.key === "costPerResult" ? money(a[col.key] as number)
                                          : col.key === "ctr" ? pct(a.ctr)
                                          : col.key === "frequency" ? a.frequency.toFixed(2)
                                          : col.key === "roas" ? (a.roas > 0 ? `${a.roas.toFixed(2)}×` : "—")
                                          : num(a[col.key] as number)}
                                      </td>
                                    ))}
                                    <td className="px-3 py-2">{a.trend?.length ? <Sparkline data={a.trend} width={70} height={22} /> : null}</td>
                                  </tr>
                                ))
                              : null}
                          </React.Fragment>
                        );
                      })
                    : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {!filtered.length ? (
          <EmptyState icon={<Sparkles className="h-5 w-5" />} title="No campaigns match your filters" description="Try clearing the search box or switching the status filter back to All." />
        ) : null}
      </div>
    </Panel>
  );
}

export function TopCreatives({ ads, code, limit = 6, account }: { ads: AdRow[]; code: string; limit?: number; account?: Kpis }) {
  const { open } = useDrilldown();
  const top = [...ads].filter((a) => a.impressions > 0).sort((a, b) => b.results - a.results || b.ctr - a.ctr).slice(0, limit);
  if (!top.length) return <EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No ad creatives in this period" />;
  return (
    <div className="space-y-3 px-5 pb-5 pt-4">
      {top.map((a) => (
        <OpenDrilldown
          key={a.id}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-line/70 p-2.5 transition hover:border-brand-500/40 hover:bg-ink/[0.02]"
          title="Open creative analysis"
          drilldown={{
            kind: "creative",
            payload: { ad: a, code, account, siblings: ads.filter((x) => x.adSetId === a.adSetId && x.id !== a.id) },
          }}
        >
          <CreativeThumb ad={a} code={code} account={account} interactive={false} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{a.creative?.title ?? a.name}</p>
            <p className="truncate text-[11px] text-faint">{a.creative?.body ?? a.adSetName}</p>
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted">
              <span className="num">CTR {pct(a.ctr)}</span>
              <span className="num">CPA {currency(a.costPerResult, code, { compact: true })}</span>
              <span className="num">Results {num(a.results)}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[13px] font-semibold num">{currency(a.spend, code, { compact: true })}</p>
            <p className="text-[10px] text-faint">{a.creative?.format ?? "Ad"}</p>
          </div>
        </OpenDrilldown>
      ))}
    </div>
  );
}
