"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleDot, XCircle } from "lucide-react";
import { Panel, PanelHeader, Sparkline } from "@/components/ui/primitives";
import { CopyButton } from "./copy-button";
import { compact, currency, eventLabel, num, pct, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PixelConfig } from "@/lib/types";
import { BarList } from "@/components/charts";
import { stepsForDiagnostic } from "@/lib/discrepancies";
import { useDrilldown } from "./drilldown-context";

export function PixelEventsTable({ pixel, code }: { pixel: PixelConfig; code: string }) {
  const { open } = useDrilldown();
  const max = Math.max(...pixel.events.map((e) => e.count), 1);
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="bg-ink/[0.02] text-left text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-2 font-semibold">Event</th>
            <th className="px-3 py-2 text-right font-semibold">Count</th>
            <th className="px-3 py-2 text-right font-semibold">Value</th>
            <th className="px-3 py-2 text-right font-semibold">Change</th>
            <th className="px-3 py-2 font-semibold">Match quality</th>
            <th className="px-3 py-2 font-semibold">Last 14 days</th>
          </tr>
        </thead>
        <tbody>
          {pixel.events.map((e) => (
            <tr
              key={e.event}
              onClick={() => open({ kind: "event", payload: { event: e, code } })}
              className="cursor-pointer border-t border-line/60 transition hover:bg-ink/[0.02]"
              title={`Open ${e.event} analytics`}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", e.quality === "good" ? "bg-pos" : e.quality === "medium" ? "bg-warn" : "bg-neg")} />
                  <div>
                    <p className="text-[13px] font-medium">{eventLabel(e.event)}</p>
                    <p className="text-[10px] text-faint">{e.event}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right text-[13px] font-semibold num">{num(e.count)}</td>
              <td className="px-3 py-2.5 text-right text-[12px] num text-muted">{e.value ? currency(e.value, code, { compact: true }) : "—"}</td>
              <td className={cn("px-3 py-2.5 text-right text-[12px] font-medium num", e.delta >= 0 ? "text-pos" : "text-neg")}>
                {e.delta > 0 ? "+" : ""}{e.delta}%
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className={cn("h-full rounded-full", e.matched >= 92 ? "bg-pos" : e.matched >= 85 ? "bg-warn" : "bg-neg")}
                      style={{ width: `${e.matched}%` }}
                    />
                  </div>
                  <span className="text-[11px] num text-muted">{e.matched}%</span>
                </div>
              </td>
              <td className="px-3 py-2.5">
                {e.trend?.length ? <Sparkline data={e.trend} width={110} height={26} /> : <span className="text-[11px] text-faint">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!pixel.events.length ? (
        <p className="px-4 py-8 text-center text-xs text-muted">No standard events recorded in this period.</p>
      ) : null}
      <div className="sr-only">{max}</div>
    </div>
  );
}

export function PixelDiagnostics({ pixel }: { pixel: PixelConfig }) {
  const icon = {
    pass: <CheckCircle2 className="h-4 w-4 text-pos" />,
    warn: <AlertTriangle className="h-4 w-4 text-warn" />,
    fail: <XCircle className="h-4 w-4 text-neg" />,
  };
  return (
    <ul className="mt-4 space-y-2 px-5 pb-5">
      {pixel.diagnostics.map((d) => (
        <li
          key={d.id}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3",
            d.status === "pass" ? "border-pos/25 bg-pos/5" : d.status === "warn" ? "border-warn/25 bg-warn/5" : "border-neg/25 bg-neg/5",
          )}
        >
          <span className="mt-0.5">{icon[d.status]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-medium">{d.title}</p>
              {d.value ? <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-muted">{d.value}</span> : null}
            </div>
            <p className="mt-0.5 text-[11px] text-muted">{d.detail}</p>
            {d.evidence ? <p className="mt-1 text-[11px] text-faint">Evidence: {d.evidence}</p> : null}
            {d.cause ? <p className="mt-0.5 text-[11px] text-faint">Cause: {d.cause}</p> : null}
            {d.status !== "pass" ? (
              <details className="mt-2">
                <summary className="cursor-pointer select-none text-[11px] font-semibold text-brand-500 hover:underline">
                  How to fix it
                </summary>
                <ol className="mt-1.5 space-y-1">
                  {(d.resolution?.length ? d.resolution : stepsForDiagnostic(d)).map((step, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-muted">
                      <span className="text-faint">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PixelOverview({ pixel, code }: { pixel: PixelConfig; code: string }) {
  const code2 = pixel.code ?? "";
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={pixel.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="num">ID {pixel.id}</span>
            <span>·</span>
            <span>Last fired {relative(pixel.lastFiredTime)}</span>
            {pixel.automaticMatching ? <><span>·</span><span>Advanced matching on</span></> : null}
          </span>
        }
        icon={<CircleDot className="h-4 w-4" />}
        right={code2 ? <CopyButton value={code2} label="Copy pixel code" /> : null}
      />
      <div className="grid gap-4 px-5 pb-5 pt-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line/70 bg-elevated/40 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Event volume</p>
          <BarList
            rows={pixel.events.slice(0, 7).map((e) => ({
              label: eventLabel(e.event),
              value: e.count,
              sub: e.value ? currency(e.value, code, { compact: true }) : undefined,
            }))}
            type="compact"
          />
        </div>
        <div className="rounded-xl border border-line/70 bg-elevated/40 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Configuration</p>
          <dl className="space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">Created</dt><dd className="num">{pixel.creationTime ? relative(pixel.creationTime) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Advanced matching</dt><dd>{pixel.automaticMatching ? "Enabled" : "Disabled"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Domains</dt><dd className="truncate">{pixel.domains.length ? pixel.domains.join(", ") : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Events tracked</dt><dd className="num">{pixel.events.length}</dd></div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Checks passing</dt>
              <dd className="num">{pixel.diagnostics.filter((d) => d.status === "pass").length}/{pixel.diagnostics.length}</dd>
            </div>
          </dl>
        </div>
      </div>
      {code2 ? (
        <details className="border-t border-line/70">
          <summary className="cursor-pointer select-none px-5 py-3 text-[12px] font-medium text-muted hover:text-ink">
            View base pixel code
          </summary>
          <pre className="max-h-72 overflow-auto bg-ink/[0.04] px-5 py-4 text-[11px] leading-relaxed text-muted"><code>{code2}</code></pre>
        </details>
      ) : null}
    </Panel>
  );
}

export function EventFunnel({ pixel, code = "USD" }: { pixel: PixelConfig; code?: string }) {
  const rows = pixel.events
    .filter((e) => ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase", "Lead", "CompleteRegistration"].includes(e.event))
    .map((e) => ({ label: eventLabel(e.event), value: e.count }));
  return <BarList rows={rows} type="compact" className="px-5 pb-5 pt-4" interactive={false} />;
}
