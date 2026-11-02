import * as React from "react";
import { AlertOctagon, Lightbulb, Sparkles, Target, TrendingUp } from "lucide-react";
import { loadReport } from "@/lib/data";
import { generateInsights, insightScore } from "@/lib/insights";
import { buildSummary, summaryToText } from "@/lib/summary";
import { ExecutiveSummary } from "@/components/panels/executive-summary";
import { Panel, PanelHeader, ScoreGauge } from "@/components/ui/primitives";
import { InsightList } from "@/components/panels/insight-list";
import { DeepInsights } from "@/components/panels/deep-insights";
import { analyzeReport } from "@/lib/analytics";
import { aiConfig } from "@/lib/ai";
import { DataQualityAlert } from "@/components/panels/data-quality-alert";
import { BarList } from "@/components/charts";
import { currency, num, pct } from "@/lib/format";
import { pctChange } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InsightsPage({
  searchParams,
}: { searchParams: Promise<{ range?: string; since?: string; until?: string; account?: string }> }) {
  const sp = await searchParams;
  const { data } = await loadReport({ rangeKey: sp.range, since: sp.since, until: sp.until, accountId: sp.account });
  const insights = generateInsights(data);
  const score = insightScore(data, insights);
  const summary = buildSummary(data, insights);
  const summaryText = summaryToText(data, summary);
  const code = data.account.currency;
  const analysis = analyzeReport(data);
  const ai = aiConfig();

  const winners = [...data.campaigns].filter((c) => c.results > 0).sort((a, b) => a.costPerResult - b.costPerResult).slice(0, 5);
  const losers = [...data.campaigns].filter((c) => c.spend > 0).sort((a, b) => b.costPerResult - a.costPerResult).slice(0, 5);

  const opportunities = insights.filter((i) => i.severity === "opportunity");
  const critical = insights.filter((i) => i.severity === "critical");
  const warnings = insights.filter((i) => i.severity === "warning");

  return (
    <div className="space-y-5">
      <DataQualityAlert warnings={data.warnings} />
      <DeepInsights analysis={analysis} aiConfigured={ai.configured} aiAllowed={data.mode === "live" || ai.allowDemo} />
      <ExecutiveSummary summary={summary} text={summaryText} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="p-5">
          <div className="flex flex-wrap items-center gap-4">
            <ScoreGauge score={score} size={140} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Account health score</p>
              <p className="mt-1 text-xs text-muted">
                Blended from CTR, ROAS, frequency, delivery stability and the severity of open issues.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-neg/20 bg-neg/5 px-2 py-1.5">
                  <p className="num text-base font-semibold text-neg">{critical.length}</p>
                  <p className="text-[9px] uppercase tracking-wide text-faint">Critical</p>
                </div>
                <div className="rounded-xl border border-warn/20 bg-warn/5 px-2 py-1.5">
                  <p className="num text-base font-semibold text-warn">{warnings.length}</p>
                  <p className="text-[9px] uppercase tracking-wide text-faint">Warning</p>
                </div>
                <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 px-2 py-1.5">
                  <p className="num text-base font-semibold text-brand-500">{opportunities.length}</p>
                  <p className="text-[9px] uppercase tracking-wide text-faint">Upside</p>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Period summary" subtitle="What changed versus the previous period" icon={<TrendingUp className="h-4 w-4" />} />
          <div className="grid gap-3 px-5 pb-5 pt-4 sm:grid-cols-3">
            {[
              { label: "Spend", value: currency(data.kpis.spend, code, { compact: true }), delta: pctChange(data.kpis.spend, data.prevKpis.spend) },
              { label: "Results", value: num(data.kpis.results), delta: pctChange(data.kpis.results, data.prevKpis.results) },
              { label: "Cost per result", value: currency(data.kpis.costPerResult, code, { compact: true }), delta: pctChange(data.kpis.costPerResult, data.prevKpis.costPerResult), invert: true },
              { label: "ROAS", value: `${data.kpis.roas.toFixed(2)}×`, delta: pctChange(data.kpis.roas, data.prevKpis.roas) },
              { label: "CTR", value: pct(data.kpis.ctr), delta: pctChange(data.kpis.ctr, data.prevKpis.ctr) },
              { label: "Frequency", value: data.kpis.frequency.toFixed(2), delta: pctChange(data.kpis.frequency, data.prevKpis.frequency), invert: true },
            ].map((row) => (
              <div key={row.label} className="rounded-xl border border-line/70 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-faint">{row.label}</p>
                <p className="num mt-0.5 text-lg font-semibold">{row.value}</p>
                <p className={`text-[11px] num ${(row.delta ?? 0) === 0 ? "text-faint" : (row.invert ? (row.delta ?? 0) < 0 : (row.delta ?? 0) > 0) ? "text-pos" : "text-neg"}`}>
                  {row.delta === null ? "—" : `${(row.delta ?? 0) > 0 ? "+" : ""}${(row.delta ?? 0).toFixed(1)}%`} vs previous
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Lowest cost per result" subtitle="Directional comparison — verify objective and audience mix" icon={<Sparkles className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            {winners.length ? (
              <BarList rows={winners.map((c) => ({ label: c.name, value: c.costPerResult, sub: `${num(c.results)} results` }))} type="currency" code={code} />
            ) : (
              <p className="px-1 py-6 text-center text-xs text-muted">No conversions recorded in this period.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Highest cost per result" subtitle="Investigate before changing budget" icon={<AlertOctagon className="h-4 w-4" />} />
          <div className="px-5 pb-5 pt-4">
            {losers.length ? (
              <BarList
                rows={losers.map((c) => ({ label: c.name, value: c.costPerResult, sub: `${currency(c.spend, code, { compact: true })} spend`, tone: "linear-gradient(90deg, hsl(var(--neg)), hsl(var(--warn)))" }))}
                type="currency"
                code={code}
              />
            ) : (
              <p className="px-1 py-6 text-center text-xs text-muted">No spend recorded in this period.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-brand-500" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">All recommendations</h2>
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-muted num">{insights.length}</span>
        </div>
        <InsightList insights={insights} />
      </div>

      <Panel>
        <PanelHeader
          title="How these recommendations are generated"
          subtitle="Deterministic heuristics, separate from optional AI synthesis"
          icon={<Target className="h-4 w-4" />}
        />
        <div className="grid gap-3 px-5 pb-5 pt-4 text-[12px] text-muted sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Creative fatigue", "Frequency above 2.1 combined with CTR below 85% of the account average."],
            ["Budget reallocation", "Cost per result gap above 1.6× between active campaigns with meaningful spend."],
            ["Scale signals", "ROAS at or above 2.5× with a daily budget that can absorb a 25% increase."],
            ["Auction pressure", "CPM rising more than 15% against the comparable previous period."],
            ["Dayparting", "Hour-of-day concentration computed from the hourly breakdown."],
            ["Pixel health", "Diagnostics, event deduplication and match-quality thresholds."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-line/70 p-3">
              <p className="text-[12px] font-semibold text-ink">{title}</p>
              <p className="mt-1 text-[11px]">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
