"use client";
import * as React from "react";
import { AlertOctagon, ArrowRight, CheckCircle2, Info, ShieldCheck, Wrench } from "lucide-react";
import { Badge, EmptyState, Panel, PanelHeader } from "@/components/ui/primitives";
import { useDrilldown } from "./drilldown-context";
import { num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Discrepancy } from "@/lib/discrepancies";

const STYLES = {
  critical: { icon: <AlertOctagon className="h-4 w-4" />, ring: "border-neg/25", bg: "bg-neg/5", text: "text-neg", tone: "neg" as const, label: "Critical" },
  warning: { icon: <AlertOctagon className="h-4 w-4" />, ring: "border-warn/25", bg: "bg-warn/5", text: "text-warn", tone: "warn" as const, label: "Warning" },
  info: { icon: <Info className="h-4 w-4" />, ring: "border-line", bg: "bg-ink/[0.02]", text: "text-info", tone: "info" as const, label: "Note" },
};

export function DiscrepancyList({
  items, code, compact = false, emptyTitle = "No discrepancies detected",
}: { items: Discrepancy[]; code: string; compact?: boolean; emptyTitle?: string }) {
  const { open } = useDrilldown();
  if (!items.length) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-5 w-5" />}
        title={emptyTitle}
        description="Ads-reported conversions, pixel events and lead records all reconcile within normal tolerances."
      />
    );
  }
  return (
    <div className="space-y-2.5">
      {items.map((d) => {
        const s = STYLES[d.severity];
        return (
          <div key={d.id} className={cn("rounded-2xl border p-3.5 transition hover:border-brand-500/40", s.ring, s.bg)}>
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5", s.text)}>{s.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold leading-snug">{d.title}</p>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
                {!compact ? <p className="mt-1 text-[12px] leading-relaxed text-muted">{d.summary}</p> : null}

                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-lg border border-line/70 bg-surface/60 px-2 py-1 num">
                    {d.left.label}: <span className="font-semibold">{num(d.left.value)}</span>
                  </span>
                  <ArrowRight className="h-3 w-3 text-faint" />
                  <span className="rounded-lg border border-line/70 bg-surface/60 px-2 py-1 num">
                    {d.right.label}: <span className="font-semibold">{num(d.right.value)}</span>
                  </span>
                  <span className={cn("rounded-lg px-2 py-1 font-semibold num", s.text, "bg-surface/60")}>
                    gap {num(Math.abs(d.gap))} ({pct(Math.abs(d.gapPct), 1)})
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => open({ kind: "discrepancy", payload: { d } })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-[11px] font-semibold transition hover:border-brand-500/40"
                  >
                    <Wrench className="h-3.5 w-3.5" /> Exact numbers & fix steps
                  </button>
                  <span className="truncate text-[10px] text-faint">{d.where}</span>
                </div>

                {!compact ? (
                  <div className="mt-2.5 rounded-xl border border-line/60 bg-surface/50 p-2.5">
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                      <CheckCircle2 className="h-3 w-3" /> First fix
                    </p>
                    <p className="text-[11px] text-muted">{d.steps[0]}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DiscrepancyPanel({
  items, code, title = "Data discrepancies & corrective actions",
  subtitle = "Where your numbers disagree — and exactly what to do about it",
  className,
}: { items: Discrepancy[]; code: string; title?: string; subtitle?: string; className?: string }) {
  const counts = {
    critical: items.filter((i) => i.severity === "critical").length,
    warning: items.filter((i) => i.severity === "warning").length,
    info: items.filter((i) => i.severity === "info").length,
  };
  return (
    <Panel className={cn("overflow-hidden", className)}>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        icon={<Wrench className="h-4 w-4" />}
        right={
          <div className="flex gap-1.5">
            {counts.critical ? <Badge tone="neg">{counts.critical} critical</Badge> : null}
            {counts.warning ? <Badge tone="warn">{counts.warning} warning</Badge> : null}
            {counts.info ? <Badge tone="info">{counts.info} note</Badge> : null}
          </div>
        }
      />
      <div className="px-5 pb-5 pt-4">
        <DiscrepancyList items={items} code={code} />
      </div>
    </Panel>
  );
}
