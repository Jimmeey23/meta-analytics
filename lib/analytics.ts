import type { AdRow, CampaignRow, ReportData, SeriesPoint } from "./types";
import { avg, safeDiv, sum } from "./utils";

export type Evidence = { id: string; label: string; value: string; context: string };
export type Finding = {
  id: string; title: string; detail: string; action: string;
  category: "delivery" | "creative" | "budget" | "measurement";
  confidence: "high" | "medium" | "low"; evidenceIds: string[];
};
export type Experiment = { id: string; hypothesis: string; change: string; metric: string; guardrail: string; duration: string };
export type AnalyticsReport = {
  headline: string; findings: Finding[]; experiments: Experiment[]; evidence: Evidence[];
  quality: { label: string; detail: string };
  momentum: { currentDays: number; previousDays: number; spendChange: number | null; conversionChange: number | null; cpaChange: number | null; ctrChange: number | null };
  concentration: { topThreeShare: number; hhi: number; campaignCount: number };
  funnel: { clicks: number; landingViews: number; conversions: number; landingRate: number | null; conversionRate: number | null };
};
const conversions = (row: { leads?: number; purchases?: number }) => (row.leads ?? 0) + (row.purchases ?? 0);
const percent = (n: number) => `${n.toFixed(1)}%`;
const change = (a: number, b: number) => b > 0 ? (a / b - 1) * 100 : null;
const signed = (n: number | null) => n === null ? "not comparable" : `${n >= 0 ? "+" : ""}${percent(n)}`;
const confidence = (n: number): Finding["confidence"] => n >= 100 ? "high" : n >= 30 ? "medium" : "low";

function aggregate(rows: SeriesPoint[]) {
  const spend = sum(rows.map((r) => r.spend));
  const impressions = sum(rows.map((r) => r.impressions));
  const clicks = sum(rows.map((r) => r.clicks));
  const conv = sum(rows.map(conversions));
  return { spend, impressions, clicks, conv, cpa: safeDiv(spend, conv), ctr: safeDiv(clicks, impressions) * 100, cvr: safeDiv(conv, clicks) * 100, cpm: safeDiv(spend, impressions) * 1000 };
}

/** Observational decision support, not a causal attribution or forecasting model. */
export function analyzeReport(data: ReportData): AnalyticsReport {
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const experiments: Experiment[] = [];
  const add = (id: string, label: string, value: string, context: string) => { evidence.push({ id, label, value, context }); return id; };
  const k = data.kpis;
  const conv = conversions(k);
  const cpa = safeDiv(k.spend, conv);
  const money = (n: number) => `${data.account.currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  add("account", "Account delivery", `${money(k.spend)} · ${conv.toLocaleString()} conversions`, `${data.range.since}–${data.range.until}; ${data.mode} data. Conversions = reported leads + purchases, not mixed-objective results.`);

  // Exclude a possibly incomplete current day from momentum/anomaly baselines.
  const today = new Date().toISOString().slice(0, 10);
  const complete = [...data.series].filter((p) => p.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const window = Math.min(7, Math.floor(complete.length / 2));
  const recent = window ? aggregate(complete.slice(-window)) : aggregate([]);
  const prior = window ? aggregate(complete.slice(-2 * window, -window)) : aggregate([]);
  const momentum = {
    currentDays: window, previousDays: window,
    spendChange: window ? change(recent.spend, prior.spend) : null,
    conversionChange: window ? change(recent.conv, prior.conv) : null,
    cpaChange: window && recent.conv && prior.conv ? change(recent.cpa, prior.cpa) : null,
    ctrChange: window && recent.impressions && prior.impressions ? change(recent.ctr, prior.ctr) : null,
  };
  if (window >= 3) {
    add("momentum", `Latest ${window} complete days vs prior ${window}`, signed(momentum.cpaChange), `CPA change. Spend ${signed(momentum.spendChange)}; conversions ${signed(momentum.conversionChange)}; CTR ${signed(momentum.ctrChange)}. ${prior.conv} prior / ${recent.conv} recent conversions.`);
    if (momentum.cpaChange !== null && Math.abs(momentum.cpaChange) >= 15) {
      const worse = momentum.cpaChange > 0;
      findings.push({ id: "momentum", title: `Cost per conversion ${worse ? "rose" : "improved"} ${percent(Math.abs(momentum.cpaChange))}`, detail: `Like-for-like complete-day windows: ${money(prior.cpa)} → ${money(recent.cpa)}. Spend moved ${signed(momentum.spendChange)} and conversions ${signed(momentum.conversionChange)}. This is an association, not proof of causation.`, action: worse ? "Check auction costs, landing-page changes and creative mix before increasing budget." : "Validate the improvement against CRM quality, then test a small budget increase.", category: "delivery", confidence: confidence(Math.min(recent.conv, prior.conv)), evidenceIds: ["momentum", "account"] });
    }
  }

  // Robust daily anomaly detection: median/MAD, not a single fragile average.
  if (complete.length >= 10) {
    const baseline = complete.slice(-8, -1).map((p) => p.spend);
    const sorted = [...baseline].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mad = baseline.map((v) => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(baseline.length / 2)];
    const latest = complete[complete.length - 1];
    const robustZ = mad > 0 ? 0.6745 * (latest.spend - median) / mad : 0;
    if (Math.abs(robustZ) >= 3.5 && Math.abs(latest.spend - median) > median * 0.25) {
      add("anomaly", "Latest complete-day spend anomaly", money(latest.spend), `${latest.date}; prior-7-day median ${money(median)}; modified z-score ${robustZ.toFixed(1)}. Seasonality and promotions can also cause anomalies.`);
      findings.push({ id: "anomaly", title: `Unusual spend on ${latest.date}`, detail: `${money(latest.spend)} versus a typical ${money(median)} in the preceding seven complete days. Check delivery before treating this as a performance change.`, action: "Review budget edits, campaign status, billing and scheduled promotions for that date.", category: "delivery", confidence: "medium", evidenceIds: ["anomaly"] });
    }
  }

  const active = data.campaigns.filter((c) => c.status.toUpperCase().includes("ACTIVE") && c.spend > 0);
  const totalSpend = sum(active.map((c) => c.spend));
  const shares = active.map((c) => safeDiv(c.spend, totalSpend)).sort((a, b) => b - a);
  const concentration = { topThreeShare: sum(shares.slice(0, 3)) * 100, hhi: sum(shares.map((s) => s * s)) * 10000, campaignCount: active.length };
  if (active.length >= 3 && totalSpend > 0) {
    add("concentration", "Spend concentration", percent(concentration.topThreeShare), `Top 3 of ${active.length} delivering campaigns; HHI ${Math.round(concentration.hhi)}. Concentration is a dependency risk, not inherently inefficient.`);
    if (concentration.topThreeShare >= 75) findings.push({ id: "concentration", title: "Delivery depends on a small campaign set", detail: `Three campaigns account for ${percent(concentration.topThreeShare)} of delivering-campaign spend. A fatigue or tracking issue in one could affect most output.`, action: "Keep a controlled challenger campaign alive and document a backup creative for each major spender.", category: "budget", confidence: "high", evidenceIds: ["concentration"] });
  }

  // Never recommend shifting from sales to awareness just because 'results' differ.
  for (const objective of new Set(active.map((c) => c.objective))) {
    const cohort = active.filter((c) => c.objective === objective && conversions(c) >= 10 && c.spend > 0);
    if (cohort.length < 2) continue;
    const ranked = cohort.map((c) => ({ row: c, cpa: c.spend / conversions(c) })).sort((a, b) => a.cpa - b.cpa);
    const best = ranked[0], worst = ranked[ranked.length - 1];
    if (worst.cpa < best.cpa * 1.5) continue;
    const id = `budget-${objective}`;
    add(id, `Comparable ${objective} campaigns`, `${money(best.cpa)} vs ${money(worst.cpa)} CPA`, `${best.row.name}: ${conversions(best.row)} conversions; ${worst.row.name}: ${conversions(worst.row)} conversions. Observational comparison; audiences and attribution may differ.`);
    findings.push({ id, title: `Test a budget shift within ${objective.replace(/^OUTCOME_/, "").toLowerCase()}`, detail: `${best.row.name} reports ${money(best.cpa)} per conversion versus ${money(worst.cpa)} for ${worst.row.name}. The ${((worst.cpa / best.cpa - 1) * 100).toFixed(0)}% gap is not a guaranteed saving at higher spend.`, action: `Test moving 10% of the weaker campaign's daily budget to the stronger one. Hold audiences and creative constant; revert if blended CPA worsens.`, category: "budget", confidence: confidence(Math.min(conversions(best.row), conversions(worst.row))), evidenceIds: [id, "account"] });
    experiments.push({ id: `test-${objective}`, hypothesis: "A modest within-objective reallocation can improve blended conversion efficiency.", change: `Move 10% of ${worst.row.name}'s daily budget to ${best.row.name}; change nothing else.`, metric: "Blended cost per CRM-qualified conversion across both campaigns", guardrail: "Revert if blended CPA worsens by 15% after the attribution window, or delivery becomes unstable.", duration: "7–14 days, including the account's conversion lag; extend if sample size is insufficient." });
  }

  const deliveredAds = data.ads.filter((a) => a.impressions >= 1000 && a.spend > 0);
  const fatigue = deliveredAds.filter((a) => {
    const peers = deliveredAds.filter((p) => p.objective === a.objective && p.id !== a.id);
    const peerCtr = safeDiv(sum(peers.map((p) => p.clicks)), sum(peers.map((p) => p.impressions))) * 100;
    return peers.length >= 2 && a.frequency >= 3 && peerCtr > 0 && a.ctr < peerCtr * 0.75;
  }).sort((a, b) => b.spend - a.spend).slice(0, 3);
  if (fatigue.length) {
    const ids = fatigue.map((a, i) => add(`fatigue-${i}`, a.creative?.title ?? a.name, `${a.frequency.toFixed(1)} frequency · ${percent(a.ctr)} CTR`, `${money(a.spend)} spend; ${a.impressions.toLocaleString()} impressions. CTR is >25% below same-objective peers. Fatigue is a hypothesis; placement and audience mix may differ.`));
    findings.push({ id: "creative-fatigue", title: `${fatigue.length} creative${fatigue.length > 1 ? "s" : ""} worth refreshing`, detail: `${fatigue.map((a) => a.creative?.title ?? a.name).join("; ")} combine high frequency with materially weaker CTR than comparable-objective peers.`, action: "Test a new opening hook or visual against the current control, keeping the offer and audience unchanged.", category: "creative", confidence: "medium", evidenceIds: ids });
    experiments.push({ id: "creative-test", hypothesis: "A fresh opening hook will recover click-through rate without reducing lead quality.", change: "Duplicate the highest-spend flagged ad and change only its first three seconds or primary visual.", metric: "Link CTR and cost per qualified conversion", guardrail: "Keep the existing control running; do not declare a winner from fewer than 30 conversions per variant.", duration: "At least 7 days and a full weekly cycle; longer if 30 conversions are not reached." });
  }

  const landingRate = k.clicks > 0 && k.landingPageViews > 0 ? k.landingPageViews / k.clicks * 100 : null;
  const conversionRate = k.clicks > 0 && conv > 0 ? conv / k.clicks * 100 : null;
  const funnel = { clicks: k.clicks, landingViews: k.landingPageViews, conversions: conv, landingRate, conversionRate };
  add("funnel", "Reported delivery funnel", `${k.clicks.toLocaleString()} clicks → ${k.landingPageViews.toLocaleString()} landing views → ${conv.toLocaleString()} conversions`, "Ad-attributed actions, not a deduplicated user journey. Instant forms and cross-device reporting can make stages non-comparable.");
  if (landingRate !== null && landingRate < 75 && k.clicks >= 200) {
    findings.push({ id: "landing-loss", title: "Investigate click-to-landing loss", detail: `Reported landing-page views equal ${percent(landingRate)} of clicks. Redirects, consent flows, slow pages or measurement gaps could explain the difference.`, action: "Test the destination on mobile, check redirects and compare consented analytics sessions with Meta landing-page views.", category: "measurement", confidence: k.clicks >= 1000 ? "medium" : "low", evidenceIds: ["funnel"] });
  }
  if (data.leads.length >= 20) {
    const reachable = data.leads.filter((l) => Boolean(l.email || l.phone)).length;
    add("lead-quality", "Captured-lead contact coverage", percent(reachable / data.leads.length * 100), `${reachable}/${data.leads.length} sampled leads have an email or phone. Contact coverage is not a CRM qualification score.`);
    findings.push({ id: "lead-quality", title: "Measure lead quality beyond form volume", detail: `${percent(reachable / data.leads.length * 100)} of captured leads have contact details. The current intent label measures field completeness, not purchase intent.`, action: "Join lead IDs to CRM outcomes and compare qualified-lead rate and acquisition cost by campaign and creative.", category: "measurement", confidence: "medium", evidenceIds: ["lead-quality"] });
  }

  const quality = data.warnings.length
    ? { label: "Partial data", detail: `${data.warnings.length} source warning(s). Treat missing sections as unavailable, not zero.` }
    : conv < 30 || data.range.days < 7
      ? { label: "Limited sample", detail: "Fewer than 30 conversions or fewer than 7 selected days. Use findings as test ideas, not definitive winners." }
      : { label: "Usable sample", detail: "Enough reported volume for directional comparisons. Observational data still does not establish causality." };
  if (data.mode === "demo") quality.detail = `Demonstration only — no real account conclusions can be drawn. ${quality.detail}`;
  return {
    headline: findings.length ? `${findings.length} evidence-backed decision${findings.length > 1 ? "s" : ""} to investigate` : "No strong comparative signal in this period",
    findings: findings.slice(0, 8), experiments: experiments.slice(0, 3), evidence, quality, momentum, concentration, funnel,
  };
}

/** Whitelisted context for an optional model. No lead records, contact fields,
 * access tokens, creative media URLs, cookies or raw Graph responses leave here. */
export function modelContext(report: AnalyticsReport, data: ReportData) {
  return {
    mode: data.mode, currency: data.account.currency, period: data.range,
    quality: report.quality, headline: report.headline, momentum: report.momentum,
    concentration: report.concentration, funnel: report.funnel,
    findings: report.findings, experiments: report.experiments, evidence: report.evidence,
    limitations: ["Observational, not causal", "Attribution windows and reporting delays apply", "No CRM outcomes supplied", "Do not invent benchmarks, forecasts or guaranteed savings"],
  };
}
