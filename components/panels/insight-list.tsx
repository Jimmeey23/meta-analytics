"use client";
import * as React from "react";
import { AlertOctagon, AlertTriangle, Info, Lightbulb, Sparkles, Zap } from "lucide-react";
import { Badge, EmptyState, Panel } from "@/components/ui/primitives";
import { useDrilldown } from "./drilldown-context";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/types";

const STYLES: Record<Insight["severity"], { icon: React.ReactNode; ring: string; bg: string; text: string; tone: "neg" | "warn" | "brand" | "info"; label: string }> = {
  critical: {
    icon: <AlertOctagon className="h-4 w-4" />, ring: "border-neg/25", bg: "bg-neg/5", text: "text-neg", tone: "neg", label: "Critical",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />, ring: "border-warn/25", bg: "bg-warn/5", text: "text-warn", tone: "warn", label: "Warning",
  },
  opportunity: {
    icon: <Lightbulb className="h-4 w-4" />, ring: "border-brand-500/25", bg: "bg-brand-500/5", text: "text-brand-500", tone: "brand", label: "Opportunity",
  },
  info: {
    icon: <Info className="h-4 w-4" />, ring: "border-line", bg: "bg-ink/[0.02]", text: "text-info", tone: "info", label: "Insight",
  },
};

export function InsightCard({ insight, drillable = true }: { insight: Insight; drillable?: boolean }) {
  const { open } = useDrilldown();
  const style = STYLES[insight.severity];
  return (
    <Panel className={cn("panel-hover border p-4", style.ring)}>
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1", style.bg, style.text, style.ring)}>
          {style.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[14px] font-semibold tracking-tight">{insight.title}</h4>
            <Badge tone={style.tone}>{style.label}</Badge>
            {drillable ? (
              <button
                onClick={() => open({ kind: "insight", payload: { insight } })}
                className="text-[10px] font-semibold uppercase tracking-wide text-brand-500 hover:underline"
              >
                Details →
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{insight.detail}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {insight.metric ? (
              <div className="rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-faint">{insight.metric.label}</p>
                <p className="num text-[13px] font-semibold">
                  {insight.metric.value}
                  {insight.metric.delta !== undefined && insight.metric.delta !== 0 ? (
                    <span className={cn("ml-1.5 text-[11px]", insight.metric.delta > 0 ? "text-pos" : "text-neg")}>
                      {insight.metric.delta > 0 ? "+" : ""}{insight.metric.delta}%
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}
            <div className="rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-faint">Expected impact</p>
              <p className="text-[13px] font-semibold">{insight.impact}</p>
            </div>
          </div>

          <div className={cn("mt-3 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed", style.ring, style.bg)}>
            <span className={cn("mr-1 font-semibold", style.text)}>Recommended action —</span>
            <span className="text-muted">{insight.action}</span>
          </div>

          {insight.entities.length ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {insight.entities.slice(0, 4).map((e) => (
                <span key={e} className="max-w-[260px] truncate rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-muted">{e}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

export function InsightList({ insights, showFilters = true }: { insights: Insight[]; showFilters?: boolean }) {
  const [filter, setFilter] = React.useState<"all" | Insight["severity"]>("all");
  const counts = React.useMemo(() => ({
    all: insights.length,
    critical: insights.filter((i) => i.severity === "critical").length,
    warning: insights.filter((i) => i.severity === "warning").length,
    opportunity: insights.filter((i) => i.severity === "opportunity").length,
    info: insights.filter((i) => i.severity === "info").length,
  }), [insights]);
  const visible = filter === "all" ? insights : insights.filter((i) => i.severity === filter);

  return (
    <div className="space-y-3">
      {showFilters ? (
        <div className="flex flex-wrap gap-1.5">
          {([
            ["all", "All", counts.all, <Sparkles key="a" className="h-3.5 w-3.5" />],
            ["critical", "Critical", counts.critical, <AlertOctagon key="c" className="h-3.5 w-3.5" />],
            ["warning", "Warnings", counts.warning, <AlertTriangle key="w" className="h-3.5 w-3.5" />],
            ["opportunity", "Opportunities", counts.opportunity, <Zap key="o" className="h-3.5 w-3.5" />],
            ["info", "Insights", counts.info, <Info key="i" className="h-3.5 w-3.5" />],
          ] as const).map(([key, label, count, icon]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition",
                filter === key ? "border-brand-500/40 bg-brand-500/10 text-brand-500" : "border-line text-muted hover:text-ink",
              )}
            >
              {icon}
              {label}
              <span className="num rounded-full bg-ink/10 px-1.5 text-[10px]">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {visible.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {visible.map((i) => <InsightCard key={i.id} insight={i} />)}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="Nothing to flag here"
          description="No recommendations match this filter — your account is running clean in this area."
        />
      )}
    </div>
  );
}
