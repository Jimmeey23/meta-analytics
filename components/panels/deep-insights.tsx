"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { BrainCircuit, Check, ChevronDown, FlaskConical, Loader2, ShieldCheck, Sparkles, Target } from "lucide-react";
import type { AnalyticsReport } from "@/lib/analytics";
import type { AiBrief } from "@/lib/ai";
import { Badge, Panel, PanelHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function DeepInsights({ analysis, aiConfigured, aiAllowed }: { analysis: AnalyticsReport; aiConfigured: boolean; aiAllowed: boolean }) {
  const params = useSearchParams();
  const [brief, setBrief] = React.useState<AiBrief | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const scope = params.toString();
  React.useEffect(() => { setBrief(null); setError(""); setConsent(false); }, [scope]);

  async function generate() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/insights/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(["range", "since", "until", "account"].flatMap((key) => params.has(key) ? [[key, params.get(key)]] : []))),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "AI synthesis failed.");
      setBrief(body);
    } catch (err) { setError(err instanceof Error ? err.message : "AI synthesis failed."); }
    finally { setLoading(false); }
  }

  const evidence = new Map(analysis.evidence.map((item) => [item.id, item]));
  const delta = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

  return <div className="space-y-4">
    <Panel className="border-brand-500/25">
      <PanelHeader title="Decision intelligence" subtitle="Comparable metrics, explicit evidence and controlled next tests" icon={<BrainCircuit className="h-4 w-4" />} right={<Badge tone={analysis.quality.label === "Partial data" ? "warn" : "brand"}>{analysis.quality.label}</Badge>} />
      <div className="space-y-4 p-5">
        <p className="text-xs leading-relaxed text-muted">{analysis.quality.detail}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Spend momentum", delta(analysis.momentum.spendChange), `${analysis.momentum.currentDays} complete days vs prior window`],
            ["Conversion momentum", delta(analysis.momentum.conversionChange), "Reported leads + purchases"],
            ["CPA momentum", delta(analysis.momentum.cpaChange), "Weighted spend / conversions"],
            ["Top-3 spend share", `${analysis.concentration.topThreeShare.toFixed(1)}%`, `${analysis.concentration.campaignCount} delivering campaigns`],
          ].map(([label, value, hint]) => <div key={label} className="rounded-xl border border-line bg-ink/[0.02] p-3"><p className="text-[10px] uppercase tracking-wide text-faint">{label}</p><p className="num mt-1 text-xl font-semibold">{value}</p><p className="mt-1 text-[10px] text-muted">{hint}</p></div>)}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {analysis.findings.map((finding) => <article key={finding.id} className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-2"><Target className="h-4 w-4 text-brand-500" /><h3 className="flex-1 text-sm font-semibold">{finding.title}</h3><Badge tone={finding.confidence === "high" ? "pos" : finding.confidence === "medium" ? "info" : "warn"}>{finding.confidence} confidence</Badge></div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{finding.detail}</p>
            <p className="mt-3 text-xs leading-relaxed"><span className="font-semibold text-brand-500">Next test: </span>{finding.action}</p>
            <details className="mt-3 border-t border-line pt-2"><summary className="cursor-pointer text-[11px] font-medium text-muted">View {finding.evidenceIds.length} evidence reference{finding.evidenceIds.length > 1 ? "s" : ""}</summary><div className="mt-2 space-y-2">{finding.evidenceIds.map((id) => { const item = evidence.get(id); return item ? <div key={id} className="rounded-lg bg-ink/[0.03] p-2 text-[11px]"><p className="font-semibold">{item.label}: {item.value}</p><p className="mt-1 leading-relaxed text-muted">{item.context}</p></div> : null; })}</div></details>
          </article>)}
        </div>
        {!analysis.findings.length ? <p className="rounded-xl border border-line p-4 text-sm text-muted">No strong signal met the sample and comparison thresholds. Widen the period or collect more conversions before making a budget change.</p> : null}
        {analysis.experiments.length ? <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><FlaskConical className="h-4 w-4 text-brand-500" /> Suggested experiment backlog</h3><div className="mt-3 grid gap-3 lg:grid-cols-2">{analysis.experiments.map((test, i) => <div key={test.id} className="rounded-xl border border-line bg-surface p-3 text-xs"><p className="font-semibold">{i + 1}. {test.hypothesis}</p><p className="mt-2 text-muted">{test.change}</p><p className="mt-2"><strong>Measure:</strong> {test.metric}</p><p className="mt-1 text-muted"><strong>Guardrail:</strong> {test.guardrail}</p><p className="mt-1 text-faint">{test.duration}</p></div>)}</div></div> : null}
        <p className="text-[10px] leading-relaxed text-faint">Statistical confidence labels reflect sample volume, not a causal significance test. No budget or campaign changes are made automatically.</p>
      </div>
    </Panel>

    <Panel>
      <PanelHeader title="AI analyst brief" subtitle="Optional synthesis of the evidence above — never a replacement for the source metrics" icon={<Sparkles className="h-4 w-4" />} right={<Badge tone={brief ? "pos" : "neutral"}>{brief ? "AI generated" : aiConfigured ? "On demand" : "Not configured"}</Badge>} />
      <div className="space-y-4 p-5">
        {!aiConfigured ? <div className="rounded-xl border border-line bg-ink/[0.02] p-4 text-xs leading-relaxed text-muted">The deeper analysis above is already active. To enable model-written synthesis, set <code>AI_API_KEY</code> and optionally <code>AI_MODEL</code> on the server. Keys never reach the browser. OpenAI-compatible endpoints can use <code>AI_BASE_URL</code>.</div> : !aiAllowed ? <p className="text-xs text-muted">Connect a live Meta account to enable AI. Demo synthesis requires the explicit server setting <code>AI_ALLOW_DEMO=1</code>.</p> : <>
          <div className="flex items-start gap-2 text-xs leading-relaxed text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pos" /><p>Only aggregate metrics, entity names, computed findings and evidence references are sent to the configured AI provider. Lead contacts, form answers, access tokens and media URLs are excluded. Your provider's data policy applies.</p></div>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-brand-500" />I agree to send this report's whitelisted analytics context to the configured AI provider.</label>
          <button type="button" disabled={!consent || loading} onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "Analyzing evidence…" : brief ? "Regenerate AI brief" : "Generate AI brief"}</button>
        </>}
        {error ? <p role="alert" className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs text-warn">{error}</p> : null}
        {brief ? <div className="space-y-4" aria-live="polite">
          <p className="whitespace-pre-line text-sm leading-relaxed">{brief.summary}</p>
          {brief.findings.map((finding, index) => <article key={index} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="flex-1 text-sm font-semibold">{finding.title}</h3><Badge tone="info">{finding.confidence} confidence</Badge></div><p className="mt-2 text-xs leading-relaxed text-muted">{finding.analysis}</p><p className="mt-2 text-xs"><strong className="text-brand-500">Action: </strong>{finding.action}</p><div className="mt-3 space-y-1">{finding.evidenceIds.map((id) => { const item = evidence.get(id); return item ? <p key={id} className="text-[10px] text-faint"><Check className="mr-1 inline h-3 w-3 text-pos" />{item.label}: {item.value}</p> : null; })}</div></article>)}
          {brief.experiments.map((test) => <details key={test.id} className="rounded-xl border border-line p-3 text-xs"><summary className="cursor-pointer font-semibold">{test.hypothesis}</summary><p className="mt-2 text-muted">{test.change}</p><p className="mt-2">Measure: {test.metric}</p><p className="mt-1 text-muted">Guardrail: {test.guardrail}</p><p className="mt-1 text-faint">{test.duration}</p></details>)}
          <p className="text-[10px] text-faint">Generated by {brief.model} · {new Date(brief.generatedAt).toLocaleString()} · AI can misinterpret data; verify the cited evidence before acting.</p>
        </div> : null}
      </div>
    </Panel>
  </div>;
}
