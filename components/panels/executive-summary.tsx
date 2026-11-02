"use client";
import * as React from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, FileText, Minus, Printer, Sparkles, Star } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { CopyButton } from "./copy-button";
import { cn } from "@/lib/utils";
import type { Summary } from "@/lib/summary";

const TONES = {
  positive: { ring: "border-pos/25", bg: "from-pos/10", text: "text-pos", icon: <CheckCircle2 className="h-4 w-4" />, label: "Healthy" },
  mixed: { ring: "border-warn/25", bg: "from-warn/10", text: "text-warn", icon: <AlertTriangle className="h-4 w-4" />, label: "Mixed" },
  negative: { ring: "border-neg/25", bg: "from-neg/10", text: "text-neg", icon: <AlertTriangle className="h-4 w-4" />, label: "Needs attention" },
};

export function ExecutiveSummary({ summary, text, className }: { summary: Summary; text: string; className?: string }) {
  const tone = TONES[summary.tone];
  const iconFor = {
    up: <ArrowUp className="h-3.5 w-3.5 text-pos" />,
    down: <ArrowDown className="h-3.5 w-3.5 text-neg" />,
    flat: <Minus className="h-3.5 w-3.5 text-faint" />,
    star: <Star className="h-3.5 w-3.5 text-brand-500" />,
    alert: <AlertTriangle className="h-3.5 w-3.5 text-warn" />,
  };

  return (
    <Panel className={cn("overflow-hidden", className)}>
      <PanelHeader
        title="Executive summary"
        subtitle="Auto-written from this period's delivery data"
        icon={<FileText className="h-4 w-4" />}
        right={
          <>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", tone.bg.replace("from-", "bg-").replace("/10", "/10"), tone.text, tone.ring)}>
              {tone.icon} {tone.label}
            </span>
            <CopyButton value={text} label="Copy brief" />
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-[11px] font-medium transition hover:border-brand-500/40 print:hidden"
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </>
        }
      />

      <div className={cn("mx-5 mt-4 rounded-2xl border bg-gradient-to-r to-transparent p-4", tone.ring, tone.bg)}>
        <p className="text-[14px] font-medium leading-relaxed">{summary.headline}</p>
      </div>

      <div className="grid gap-5 px-5 pb-5 pt-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="space-y-2.5">
            {summary.paragraphs.map((p, i) => (
              <p key={i} className="text-[12.5px] leading-relaxed text-muted">{p}</p>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {summary.highlights.map((h) => (
              <div key={h.label} className="flex items-start gap-2 rounded-xl border border-line/70 bg-ink/[0.02] px-3 py-2">
                <span className="mt-0.5">{iconFor[h.icon]}</span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-faint">{h.label}</p>
                  <p className="truncate text-[12px] font-medium num" title={h.text}>{h.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {summary.risks.length ? (
            <div className="rounded-2xl border border-neg/20 bg-neg/5 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neg">
                <AlertTriangle className="h-3.5 w-3.5" /> What needs attention
              </p>
              <ul className="space-y-1.5">
                {summary.risks.map((r) => (
                  <li key={r} className="text-[12px] leading-snug text-muted">• {r}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-pos/20 bg-pos/5 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-pos">
                <CheckCircle2 className="h-3.5 w-3.5" /> No blocking issues
              </p>
              <p className="mt-1.5 text-[12px] text-muted">No critical or warning-level problems were detected in this period.</p>
            </div>
          )}

          {summary.nextSteps.length ? (
            <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-500">
                <Sparkles className="h-3.5 w-3.5" /> Do this next
              </p>
              <ol className="space-y-2.5">
                {summary.nextSteps.map((s, i) => (
                  <li key={s.title} className="flex gap-2">
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-500 text-[9px] font-bold text-white">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium leading-snug">{s.title}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">{s.action}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
