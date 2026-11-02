import type { BreakdownRow, Kpis, Range, SeriesPoint } from "./types";
import { safeDiv, sum } from "./utils";

/* ───────────── Action-type → human metric mapping ───────────── */

const LEAD_TYPES = [
  "onsite_conversion.lead_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead",
  "onsite_conversion.messaging_conversation_started_7d",
];

const PURCHASE_TYPES = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
];

const RESULT_BY_OBJECTIVE: Record<string, string[]> = {
  OUTCOME_LEADS: [...LEAD_TYPES, "onsite_conversion.messaging_conversation_started_7d", "link_click"],
  OUTCOME_SALES: [...PURCHASE_TYPES, "offsite_conversion.fb_pixel_initiate_checkout", "link_click"],
  OUTCOME_TRAFFIC: ["link_click", "landing_page_view", "post_engagement", "impressions"],
  OUTCOME_AWARENESS: ["impressions", "reach", "video_thruplay_watched_actions", "post_engagement"],
  OUTCOME_ENGAGEMENT: ["post_engagement", "page_engagement", "onsite_conversion.post_save", "link_click"],
  OUTCOME_APP_PROMOTION: ["app_install", "omni_app_install", "mobile_app_install", "link_click"],
  LEAD_GENERATION: LEAD_TYPES,
  CONVERSIONS: PURCHASE_TYPES,
  LINK_CLICKS: ["link_click", "landing_page_view"],
  MESSAGES: ["onsite_conversion.messaging_conversation_started_7d", "link_click"],
};

const DEFAULT_RESULT = [
  "onsite_conversion.lead_grouped",
  "lead",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "link_click",
  "landing_page_view",
  "impressions",
];

export const RESULT_LABEL: Record<string, string> = {
  "onsite_conversion.lead_grouped": "Leads",
  lead: "Leads",
  "offsite_conversion.fb_pixel_lead": "Leads",
  purchase: "Purchases",
  omni_purchase: "Purchases",
  "offsite_conversion.fb_pixel_purchase": "Purchases",
  link_click: "Link clicks",
  landing_page_view: "Landing page views",
  post_engagement: "Post engagements",
  page_engagement: "Page engagements",
  impressions: "Impressions",
  reach: "Reach",
  app_install: "App installs",
  omni_app_install: "App installs",
  video_thruplay_watched_actions: "ThruPlays",
  "onsite_conversion.messaging_conversation_started_7d": "Conversations started",
};

export type Action = { action_type: string; value: string | number };

function actionValue(actions: Action[] | undefined, types: string[]) {
  if (!actions) return 0;
  const hit = actions.find((a) => types.includes(a.action_type));
  return hit ? Number(hit.value) || 0 : 0;
}

export function resultTypesFor(objective?: string) {
  return (objective && RESULT_BY_OBJECTIVE[objective]) || DEFAULT_RESULT;
}

export function pickResult(objective: string | undefined, actions: Action[] | undefined) {
  const types = resultTypesFor(objective);
  for (const type of types) {
    const value = actionValue(actions, [type]);
    if (value > 0) return { type, value, label: RESULT_LABEL[type] ?? type.split(".").pop() ?? type };
  }
  return { type: types[0], value: 0, label: RESULT_LABEL[types[0]] ?? "Results" };
}

/** Meta often returns overlapping aliases for the same conversion. Pick one
 * canonical action instead of adding lead + pixel lead + grouped lead together. */
export function firstAction(actions: Action[] | undefined, types: string[]) {
  for (const type of types) {
    const hit = actions?.find((a) => a.action_type === type);
    if (hit && Number(hit.value) > 0) return Number(hit.value);
  }
  return 0;
}

export function sumActions(actions: Action[] | undefined, types: string[]) {
  if (!actions) return 0;
  return sum(actions.filter((a) => types.includes(a.action_type)).map((a) => Number(a.value) || 0));
}

export function sumActionValues(rows: Action[] | undefined, types: string[]) {
  if (!rows) return 0;
  return sum(rows.filter((a) => types.includes(a.action_type)).map((a) => Number(a.value) || 0));
}

export function costForAction(costs: Action[] | undefined, type: string) {
  if (!costs) return 0;
  const hit = costs.find((a) => a.action_type === type);
  return hit ? Number(hit.value) || 0 : 0;
}

export function roasFrom(rows: Action[] | undefined) {
  if (!rows) return 0;
  const hit = rows.find((a) => ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "website_purchase"].includes(a.action_type));
  return hit ? Number(hit.value) || 0 : 0;
}

export function toNumber(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return isFinite(n) ? n : 0;
}

/* ───────────── KPI derivation ───────────── */

export function deriveKpis(p: {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  results: number;
  resultLabel: string;
  landingPageViews: number;
  videoViews: number;
  outboundClicks: number;
}): Kpis {
  const ctr = safeDiv(p.clicks, p.impressions) * 100;
  const cpc = safeDiv(p.spend, p.clicks);
  const cpm = safeDiv(p.spend, p.impressions * 1000 === 0 ? 0 : p.impressions) * 1000;
  const cpp = safeDiv(p.spend, p.reach) * 1000;
  return {
    spend: p.spend,
    impressions: p.impressions,
    reach: p.reach,
    frequency: safeDiv(p.impressions, p.reach),
    clicks: p.clicks,
    ctr,
    cpc,
    cpm,
    cpp,
    results: p.results,
    resultLabel: p.resultLabel,
    costPerResult: safeDiv(p.spend, p.results),
    revenue: p.revenue,
    roas: safeDiv(p.revenue, p.spend),
    leads: p.leads,
    purchases: p.purchases,
    landingPageViews: p.landingPageViews,
    videoViews: p.videoViews,
    outboundClicks: p.outboundClicks,
  };
}

export function emptyKpis(resultLabel = "Results"): Kpis {
  return deriveKpis({ spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, purchases: 0, revenue: 0, results: 0, resultLabel, landingPageViews: 0, videoViews: 0, outboundClicks: 0 });
}

export function totalsFromSeries(series: SeriesPoint[]): Kpis {
  const spend = sum(series.map((s) => s.spend));
  const impressions = sum(series.map((s) => s.impressions));
  const reach = sum(series.map((s) => s.reach));
  const clicks = sum(series.map((s) => s.clicks));
  const leads = sum(series.map((s) => s.leads));
  const purchases = sum(series.map((s) => s.purchases));
  const revenue = sum(series.map((s) => s.revenue));
  const results = sum(series.map((s) => s.results));
  return deriveKpis({
    spend, impressions, reach, clicks, leads, purchases, revenue, results,
    resultLabel: "Results", landingPageViews: 0, videoViews: 0, outboundClicks: 0,
  });
}

/* ───────────── Breakdown helpers ───────────── */

export function toBreakdownRows(rows: any[], objective?: string): BreakdownRow[] {
  return rows.map((r) => {
    const spend = toNumber(r.spend);
    const impressions = toNumber(r.impressions);
    const clicks = toNumber(r.clicks);
    const actions = (r.actions ?? []) as Action[];
    const values = (r.action_values ?? []) as Action[];
    const result = pickResult(objective, actions);
    const revenue = firstAction(values, PURCHASE_TYPES);
    return {
      key: keyFor(r),
      spend,
      impressions,
      reach: toNumber(r.reach),
      clicks,
      ctr: safeDiv(clicks, impressions) * 100,
      cpc: safeDiv(spend, clicks),
      cpm: safeDiv(spend, impressions) * 1000,
      results: result.value,
      revenue,
      roas: safeDiv(revenue, spend),
      costPerResult: safeDiv(spend, result.value),
    };
  });
}

function keyFor(r: any) {
  if (r.age && r.gender) return `${r.gender === "unknown" ? "Unknown" : r.gender} · ${r.age}`;
  if (r.publisher_platform && r.platform_position) return `${r.publisher_platform} · ${r.platform_position}`;
  if (r.publisher_platform) return r.publisher_platform;
  if (r.impression_device) return r.impression_device;
  if (r.region) return r.region;
  if (r.hourly_stats_aggregated_by_advertiser_time_zone) return r.hourly_stats_aggregated_by_advertiser_time_zone;
  return Object.values(r).filter((v) => typeof v === "string" && !["account", "campaign"].includes(v as string)).slice(0, 2).join(" · ");
}

export function hourFromKey(key: string) {
  const m = key.match(/(\d{1,2}):/);
  return m ? Number(m[1]) : null;
}

export function daysInRange(range: Range) {
  const out: string[] = [];
  const start = Date.parse(`${range.since}T00:00:00Z`);
  for (let i = 0; i < range.days; i++) out.push(new Date(start + i * 86400000).toISOString().slice(0, 10));
  return out;
}
