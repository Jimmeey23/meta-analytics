import * as React from "react";
import { ArrowDown, FileText, Gauge, Mail, MapPin, Phone, UserPlus } from "lucide-react";
import { loadReport } from "@/lib/data";
import { Badge, EmptyState, Panel, PanelHeader } from "@/components/ui/primitives";
import { MiniStatRow } from "@/components/panels/kpi-grid";
import { LeadsExplorer } from "@/components/panels/leads-explorer";
import { BarList, FunnelChart, TrendChart } from "@/components/charts";
import { currency, longDate, num, pct, relative } from "@/lib/format";
import { pctChange, safeDiv, sum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; since?: string; until?: string; account?: string }> }) {
  const sp = await searchParams;
  const { data } = await loadReport({ rangeKey: sp.range, since: sp.since, until: sp.until, accountId: sp.account });
  const code = data.account.currency;
  const money = (v: number) => currency(v, code, { compact: true });

  const leads = data.leads;
  const hot = leads.filter((l) => l.intent === "Hot").length;
  const warm = leads.filter((l) => l.intent === "Warm").length;
  const contactable = leads.filter((l) => l.email || l.phone).length;
  const cpl = safeDiv(data.kpis.spend, leads.length || data.kpis.leads || 1);
  const prevCpl = safeDiv(data.prevKpis.spend, data.prevKpis.leads || 1);
  const lpRate = safeDiv(leads.length || data.kpis.leads, data.kpis.landingPageViews) * 100;

  const byDay = data.series.map((s) => ({ date: s.date, leads: s.leads, purchases: s.purchases }));
  const byCampaign = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      const key = l.campaignName ?? "Unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  const byCity = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.city] = (acc[l.city] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  const byForm = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.formName] = (acc[l.formName] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const byHour = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      const h = new Date(l.createdTime).getHours();
      acc[String(h)] = (acc[String(h)] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label: `${label}:00`, value })).sort((a, b) => Number(a.label.split(":")[0]) - Number(b.label.split(":")[0]));

  const recent = leads.slice(0, 8);

  return (
    <div className="space-y-5">
      <MiniStatRow
        items={[
          { label: "Leads captured", value: num(leads.length || data.kpis.leads), icon: <UserPlus className="h-4 w-4" />, delta: pctChange(data.kpis.leads, data.prevKpis.leads) },
          { label: "Cost per lead", value: money(cpl), icon: <Gauge className="h-4 w-4" />, delta: pctChange(cpl, prevCpl), invert: true },
          { label: "High intent", value: `${hot + warm} (${pct(safeDiv(hot + warm, leads.length) * 100, 0)})`, icon: <Mail className="h-4 w-4" /> },
          { label: "View → lead rate", value: pct(lpRate, 1), icon: <ArrowDown className="h-4 w-4" /> },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Lead volume over time" subtitle="Daily leads and purchases" icon={<UserPlus className="h-4 w-4" />} />
          <div className="px-2 pb-4 pt-3">
            <TrendChart
              data={byDay}
              code={code}
              type="number"
              height={260}
              keys={[
                { key: "leads", label: "Leads", color: "hsl(var(--chart-2))" },
                { key: "purchases", label: "Purchases", color: "hsl(var(--chart-4))" },
              ]}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Capture funnel" subtitle="From impression to customer" icon={<ArrowDown className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4"><FunnelChart steps={data.leadFunnel} /></div>
        </Panel>
      </div>

      {data.leadForms.length ? (
        <Panel>
          <PanelHeader title="Lead forms" subtitle={`${data.leadForms.length} forms connected to your pages`} icon={<FileText className="h-4 w-4" />} />
          <div className="grid gap-3 px-5 pb-5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.leadForms.map((f) => {
              const captured = leads.filter((l) => l.formId === f.id).length;
              return (
                <div key={f.id} className="rounded-2xl border border-line/70 p-3.5 transition hover:border-brand-500/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-medium" title={f.name}>{f.name}</p>
                    <Badge tone={f.status?.toUpperCase().includes("ACTIVE") ? "pos" : "neutral"}>{(f.status ?? "ACTIVE").toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-faint">{f.pageName}{f.questionsCount ? ` · ${f.questionsCount} questions` : ""}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="num text-xl font-semibold">{num(captured || f.leadsCount)}</p>
                      <p className="text-[10px] text-faint">leads</p>
                    </div>
                    {captured ? <p className="text-[10px] text-muted">{money(safeDiv(data.kpis.spend * (captured / Math.max(leads.length, 1)), captured))}/lead</p> : null}
                  </div>
                  {f.createdTime ? <p className="mt-2 text-[10px] text-faint">Created {relative(f.createdTime)}</p> : null}
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Leads by campaign" icon={<UserPlus className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            {byCampaign.length ? <BarList rows={byCampaign} type="number" /> : <EmptyState icon={<UserPlus className="h-5 w-5" />} title="No attributed leads" />}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Leads by city" icon={<MapPin className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            {byCity.length ? <BarList rows={byCity} type="number" /> : <EmptyState icon={<MapPin className="h-5 w-5" />} title="No location data" />}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Leads by hour" subtitle="When your audience converts" icon={<Gauge className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            {byHour.length ? <BarList rows={byHour} type="number" /> : <EmptyState icon={<Gauge className="h-5 w-5" />} title="No timing data" />}
          </div>
        </Panel>
      </div>

      <LeadsExplorer leads={leads} forms={data.leadForms.map((f) => ({ id: f.id, name: f.name }))} ads={data.ads} code={data.account.currency} account={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Most recent leads" subtitle="Newest first — call these back today" icon={<Phone className="h-4 w-4" />} />
          <div className="space-y-2.5 px-5 pb-5 pt-4">
            {recent.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{l.fullName}</p>
                  <p className="truncate text-[10px] text-faint">{l.email || l.phone} · {l.city}</p>
                </div>
                <div className="hidden min-w-0 max-w-[220px] flex-1 sm:block">
                  <p className="truncate text-[11px] text-muted">{l.campaignName ?? "Organic"}</p>
                  <p className="truncate text-[10px] text-faint">{l.formName}</p>
                </div>
                <Badge tone={l.intent === "Hot" ? "pos" : l.intent === "Warm" ? "warn" : "neutral"}>{l.intent}</Badge>
                <span className="w-20 text-right text-[10px] text-faint">{relative(l.createdTime)}</span>
              </div>
            ))}
            {!recent.length ? <EmptyState icon={<UserPlus className="h-5 w-5" />} title="No leads in this period" description="Leads appear here as soon as your instant forms or pixel receive them." /> : null}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Lead quality" subtitle="Completeness of captured data" icon={<Mail className="h-4 w-4" />} />
          <div className="space-y-3 px-5 pb-5 pt-4">
            {[
              { label: "With email", value: leads.filter((l) => l.email).length },
              { label: "With phone", value: leads.filter((l) => l.phone).length },
              { label: "With company", value: leads.filter((l) => l.company).length },
              { label: "With budget", value: leads.filter((l) => l.budget).length },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-muted">{row.label}</span>
                  <span className="num font-medium">{pct(safeDiv(row.value, leads.length) * 100, 0)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent" style={{ width: `${safeDiv(row.value, leads.length) * 100}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-4 rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-2.5 text-[11px] text-muted">
              <span className="font-semibold text-ink">{num(contactable)}</span> of {num(leads.length)} leads can be contacted by email or phone.
            </div>
            {data.leadForms.length ? (
              <div className="rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-2.5 text-[11px] text-muted">
                {byForm.slice(0, 3).map((f) => (
                  <div key={f.label} className="flex justify-between gap-2 py-0.5">
                    <span className="truncate">{f.label}</span>
                    <span className="num">{f.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <p className="text-center text-[11px] text-faint">
        Period {longDate(data.range.since)} – {longDate(data.range.until)} · {sum(leads.map(() => 1))} leads loaded
      </p>
    </div>
  );
}
