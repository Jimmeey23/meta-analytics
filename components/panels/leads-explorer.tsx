"use client";
import * as React from "react";
import { Download, Inbox, Mail, Phone, Search } from "lucide-react";
import { Avatar, Badge, EmptyState, Panel, PanelHeader } from "@/components/ui/primitives";
import { dateTime, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDrilldown } from "./drilldown-context";
import type { AdRow, Kpis, Lead } from "@/lib/types";
import { CreativeThumb } from "./creative-gallery";

export function LeadsExplorer({ leads, forms, ads = [], code = "INR", account }: { leads: Lead[]; forms: { id: string; name: string }[]; ads?: AdRow[]; code?: string; account?: Kpis }) {
  const adById = React.useMemo(() => new Map(ads.map((ad) => [ad.id, ad])), [ads]);
  const sourceAd = (lead: Lead) => lead.adId ? adById.get(lead.adId) : ads.find((ad) => ad.name === lead.adName);
  const openLead = (lead: Lead) => open({ kind: "lead", payload: { lead, ad: sourceAd(lead), code, account } });
  const [query, setQuery] = React.useState("");
  const [form, setForm] = React.useState("ALL");
  const [intent, setIntent] = React.useState("ALL");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(40);
  const { open } = useDrilldown();

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (form !== "ALL" && l.formId !== form) return false;
      if (intent !== "ALL" && l.intent !== intent) return false;
      if (!q) return true;
      return [l.fullName, l.email, l.phone, l.city, l.campaignName, l.adName, l.company].join(" ").toLowerCase().includes(q);
    });
  }, [leads, query, form, intent]);

  React.useEffect(() => setVisible(40), [query, form, intent]);

  function exportCsv() {
    const header = "Created,Name,Email,Phone,City,Company,Budget,Intent,Form,Campaign,Ad,Platform";
    const rows = filtered.map((l) =>
      [l.createdTime, l.fullName, l.email, l.phone, l.city, l.company ?? "", l.budget ?? "", l.intent, l.formName, l.campaignName ?? "", l.adName ?? "", l.platform]
        .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v))
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const intentTone = (i?: string) => (i === "Hot" ? "pos" : i === "Warm" ? "warn" : "neutral");

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Captured leads"
        subtitle={`${filtered.length.toLocaleString()} of ${leads.length.toLocaleString()} leads · click a row to see every field`}
        icon={<Inbox className="h-4 w-4" />}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, city…"
                className="w-44 rounded-lg border border-line bg-bg py-1.5 pl-8 pr-2 text-[11px] outline-none focus:border-brand-500"
              />
            </div>
            <select
              value={form}
              onChange={(e) => setForm(e.target.value)}
              className="rounded-lg border border-line bg-bg px-2 py-1.5 text-[11px] outline-none focus:border-brand-500"
            >
              <option value="ALL">All forms</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="rounded-lg border border-line bg-bg px-2 py-1.5 text-[11px] outline-none focus:border-brand-500"
            >
              <option value="ALL">Any intent</option>
              <option value="Hot">Hot</option>
              <option value="Warm">Warm</option>
              <option value="Cold">Cold</option>
            </select>
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-[11px] font-medium hover:border-brand-500/40">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        }
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-ink/[0.02] text-left text-[10px] uppercase tracking-wide text-faint">
              <th className="px-4 py-2 font-semibold">Lead</th>
              <th className="px-3 py-2 font-semibold">Contact</th>
              <th className="px-3 py-2 font-semibold">Location</th>
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 font-semibold">Form</th>
              <th className="px-3 py-2 font-semibold">Received</th>
              <th className="px-3 py-2 font-semibold">Intent</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((l) => (
              <React.Fragment key={l.id}>
                <tr
                  role="button"
                  aria-haspopup="dialog"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLead(l); } }}
                  onClick={() => open({ kind: "lead", payload: { lead: l } })}
                  className="cursor-pointer border-t border-line/60 transition hover:bg-ink/[0.02]"
                  title="Open lead detail"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={l.fullName} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{l.fullName}</p>
                        {l.company ? <p className="truncate text-[10px] text-faint">{l.company}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-0.5 text-[11px]">
                      {l.email ? <p className="flex items-center gap-1 text-muted"><Mail className="h-3 w-3" /> {l.email}</p> : null}
                      {l.phone ? <p className="flex items-center gap-1 text-muted num"><Phone className="h-3 w-3" /> {l.phone}</p> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted">{l.city}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">{sourceAd(l) ? <CreativeThumb ad={sourceAd(l)!} code={code} account={account} interactive={false} className="h-9 w-9" /> : null}<div className="min-w-0"><p className="max-w-[220px] truncate text-[11px]" title={l.campaignName}>{l.campaignName ?? "—"}</p>
                    <p className="max-w-[220px] truncate text-[10px] text-faint" title={l.adName}>{l.adName ?? l.platform}</p></div></div>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted">{l.formName}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-muted" title={dateTime(l.createdTime)}>{relative(l.createdTime)}</td>
                  <td className="px-3 py-2.5"><Badge tone={intentTone(l.intent) as any}>{l.intent}</Badge></td>
                </tr>
                {expanded === l.id ? (
                  <tr className="border-t border-line/40 bg-ink/[0.02]">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {l.fields.map((f) => (
                          <div key={f.name} className="rounded-xl border border-line/70 bg-surface/60 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-faint">{f.name.replace(/_/g, " ")}</p>
                            <p className="mt-0.5 truncate text-[12px] font-medium">{f.values.join(", ") || "—"}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-faint">
                        <span>Lead ID {l.id}</span>
                        <span>·</span>
                        <span>Form ID {l.formId}</span>
                        <span>·</span>
                        <span>{l.isOrganic ? "Organic (no ad attribution)" : `Ad ID ${l.adId ?? "—"}`}</span>
                        <span>·</span>
                        <span className={cn("capitalize")}>{l.platform}</span>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {!filtered.length ? (
          <EmptyState icon={<Inbox className="h-5 w-5" />} title="No leads match your filters" description="Adjust the search, form or intent filter to see more results." />
        ) : null}
        {filtered.length > visible ? (
          <div className="flex items-center justify-center gap-3 border-t border-line/60 px-4 py-4">
            <span className="text-[11px] text-faint">
              Showing {visible.toLocaleString()} of {filtered.length.toLocaleString()}
            </span>
            <button
              onClick={() => setVisible((v) => v + 60)}
              className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium transition hover:border-brand-500/40"
            >
              Load 60 more
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
