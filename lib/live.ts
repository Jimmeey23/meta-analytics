import crypto from "node:crypto";
import type {
  Account, AdRow, AdSetRow, Breakdown, CampaignRow, FunnelStep, Lead, LeadForm,
  PixelConfig, PixelDiagnostic, PixelEvent, Range, ReportData, SeriesPoint,
} from "./types";
import { getAdImages, getEdgePaged, getInsights, getManyByIds, graphRequest, graphUsage, rateLimitCooldownMs } from "./meta";
import { creativeFrom, imageHashesOf, videoIdsOf } from "./creative";
import {
  costForAction, deriveKpis, emptyKpis, firstAction, pickResult, roasFrom, sumActions, sumActionValues,
  toBreakdownRows, toNumber, type Action,
} from "./metrics";
import { hourFromKey, daysInRange } from "./metrics";
import { previousRange } from "./ranges";
import { ReportCache } from "./report-cache";
import { inferStudioLocation, mapLimit, redactSecrets, safeDiv, sum } from "./utils";

const BASE_FIELDS = [
  "spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc", "cpm", "cpp",
  "actions", "action_values", "cost_per_action_type", "purchase_roas", "website_purchase_roas",
  "outbound_clicks", "inline_link_clicks", "video_thruplay_watched_actions",
].join(",");

const RANKING_FIELDS = ",quality_ranking,engagement_rate_ranking,conversion_rate_ranking";

const LEAD_TYPES = ["onsite_conversion.lead_grouped", "lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead"];
const PURCHASE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"];
const PIXEL_EVENT_MAP: Record<string, string> = {
  "offsite_conversion.fb_pixel_view_content": "ViewContent",
  "offsite_conversion.fb_pixel_add_to_cart": "AddToCart",
  "offsite_conversion.fb_pixel_initiate_checkout": "InitiateCheckout",
  "offsite_conversion.fb_pixel_purchase": "Purchase",
  "offsite_conversion.fb_pixel_lead": "Lead",
  "offsite_conversion.fb_pixel_complete_registration": "CompleteRegistration",
  "offsite_conversion.fb_pixel_search": "Search",
  "offsite_conversion.fb_pixel_add_to_wishlist": "AddToWishlist",
  "offsite_conversion.fb_pixel_page_view": "PageView",
};

type Ctx = { warnings: string[] };

async function safe<T>(ctx: Ctx, label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.warnings.push(`${label}: ${redactSecrets(msg)}`);
    return fallback;
  }
}

/* ────────────────────────── Short-lived caches ────────────────────────── */

/**
 * Memoises a per-token lookup that changes rarely, keyed on a hash of the
 * token so the token itself is never used as a map key in memory dumps.
 *
 * These reads use the user token and are not ads API calls, so each one is
 * charged against the app-level pool of 200 calls per hour per user. Caching
 * them is the difference between 6 calls an hour and one per page view.
 */
const PAGE_TTL = 30 * 60 * 1000;
const pageCache = new ReportCache<any>({ maxEntries: 64, ttlMs: PAGE_TTL });
const leadCache = new ReportCache<any>({ maxEntries: 512, ttlMs: 5 * 60 * 1000, staleMs: 25 * 60 * 1000 });
const pixelCache = new ReportCache<any>({ maxEntries: 64, ttlMs: PAGE_TTL, staleMs: 24 * 60 * 60 * 1000 });

const tokenScope = (token: string) => crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);

async function cachedByToken<T>(
  store: ReportCache<any>,
  token: string,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  return store.read(`${tokenScope(token)}:${label}`, fn);
}

/** Refresh/logout must drop derived live caches as well as the report cache. */
export function clearLiveCaches(token?: string | null) {
  if (!token) {
    pageCache.clear();
    leadCache.clear();
    pixelCache.clear();
    videoCache.clear();
    return;
  }
  const prefix = `${tokenScope(token)}:`;
  pageCache.clear(prefix);
  leadCache.clear(prefix);
  pixelCache.clear(prefix);
  videoCache.clear(prefix);
}

/* ─────────────────────── Video source resolution ─────────────────────── */

/** Warm the posters most likely to be seen; every other video resolves on click. */
const VIDEO_LOOKUP_CAP = 150;
/** Signed `source` URLs outlive this comfortably, so re-use is safe. */
const VIDEO_TTL = 20 * 60 * 1000;
const videoCache = new ReportCache<any>({ maxEntries: 1000, ttlMs: VIDEO_TTL });

/**
 * Resolves playable sources for the video creatives most worth showing.
 *
 * Previously this issued one Graph call per video id and fired them all at
 * once, which produced thousands of `GET /{video-id}` calls per report and
 * exhausted the rate limit. Ids are now ranked by ad spend, capped, served
 * from a short-lived cache, and the remainder fetched 50 at a time.
 */
async function resolveVideos(ctx: Ctx, token: string, adMeta: any[], adRows: any[]) {
  const spendByAd = new Map<string, number>();
  for (const row of adRows) {
    const id = String(row.ad_id ?? "");
    spendByAd.set(id, (spendByAd.get(id) ?? 0) + toNumber(row.spend));
  }

  // Highest-spending ads first, so the cap keeps what the user actually sees.
  const ranked = [...adMeta].sort(
    (a, b) => (spendByAd.get(String(b.id)) ?? 0) - (spendByAd.get(String(a.id)) ?? 0),
  );

  const wanted: string[] = [];
  for (const ad of ranked) {
    for (const id of videoIdsOf(ad.creative)) {
      if (!wanted.includes(id)) wanted.push(id);
    }
    if (wanted.length >= VIDEO_LOOKUP_CAP) break;
  }
  const ids = wanted.slice(0, VIDEO_LOOKUP_CAP);

  const now = Date.now();
  const scope = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  const resolved = new Map<string, any>();
  const missing: string[] = [];
  for (const id of ids) {
    const hit = videoCache.peek(`${scope}:${id}`);
    if (hit) resolved.set(id, hit.value);
    else missing.push(id);
  }

  if (missing.length) {
    // Source files are fetched only when a user opens a video. Warming hundreds
    // of signed MP4 URLs made every report slower and most URLs were never used.
    const fetched = await safe(
      ctx, "Video posters",
      () => getManyByIds(token, missing, "id,picture,permalink_url"),
      new Map<string, any>(),
    );
    for (const [id, node] of fetched) {
      videoCache.write(`${scope}:${id}`, node);
      resolved.set(id, node);
    }
  }
  return resolved;
}

/** Authorized by the route against an ad in the current account's report. */
export async function resolveVideoSource(token: string, id: string) {
  const scope = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  const key = `${scope}:${id}`;
  const hit = videoCache.peek(key);
  if (hit?.value.source) return hit.value;
  const node = (await getManyByIds(token, [id], "id,source,picture,permalink_url")).get(id);
  if (!node?.source) throw new Error("Meta did not return a playable source for this video.");
  videoCache.write(key, { ...hit?.value, ...node });
  return node;
}

function ranking(v: unknown) {
  if (typeof v !== "string") return null;
  return v as CampaignRow["qualityRanking"];
}

function metricsFrom(row: any, objective?: string) {
  const actions = (row.actions ?? []) as Action[];
  const values = (row.action_values ?? []) as Action[];
  const costs = (row.cost_per_action_type ?? []) as Action[];
  const result = pickResult(objective, actions);
  const revenue = firstAction(values, PURCHASE_TYPES);
  const leads = firstAction(actions, LEAD_TYPES);
  const purchases = firstAction(actions, PURCHASE_TYPES);
  const landingPageViews = firstAction(actions, ["landing_page_view", "offsite_conversion.fb_pixel_page_view"]);
  const videoViews = firstAction(actions, ["video_view", "video_thruplay_watched_actions", "video_p25_watched_actions"]);
  const spend = toNumber(row.spend);
  return {
    spend,
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    frequency: toNumber(row.frequency) || safeDiv(toNumber(row.impressions), toNumber(row.reach)),
    clicks: firstAction(actions, ["link_click"]) || toNumber(row.inline_link_clicks) || toNumber(row.clicks),
    leads,
    purchases,
    revenue,
    results: result.value,
    resultLabel: result.label,
    costPerResult: costForAction(costs, result.type) || safeDiv(spend, result.value),
    roas: roasFrom(row.website_purchase_roas as Action[]) || roasFrom(row.purchase_roas as Action[]) || safeDiv(revenue, spend),
    landingPageViews,
    videoViews,
    outboundClicks: sumActions(row.outbound_clicks as Action[], ["outbound_click"]) || toNumber(row.inline_link_clicks),
    _actions: actions,
    _values: values,
  };
}

function kpiFrom(row: any, objective?: string) {
  const m = metricsFrom(row, objective);
  const { _actions, _values, ...rest } = m;
  return deriveKpis(rest);
}

function seriesFrom(rows: any[], objective?: string): SeriesPoint[] {
  return rows.map((r) => {
    const m = metricsFrom(r, objective);
    return {
      date: (r.date_start ?? r.date_stop ?? "").slice(0, 10),
      spend: m.spend,
      impressions: m.impressions,
      reach: m.reach,
      clicks: m.clicks,
      ctr: safeDiv(m.clicks, m.impressions) * 100,
      cpc: safeDiv(m.spend, m.clicks),
      cpm: safeDiv(m.spend, m.impressions) * 1000,
      results: m.results,
      revenue: m.revenue,
      roas: m.roas,
      leads: m.leads,
      purchases: m.purchases,
    };
  });
}

/* ─────────────────────────── Leads ─────────────────────────── */

function fieldData(fields: any[], keys: string[]) {
  for (const key of keys) {
    const hit = fields?.find((f) => String(f.name).toLowerCase() === key || String(f.name).toLowerCase().includes(key));
    if (hit?.values?.length) return String(hit.values[0]);
  }
  return "";
}

function mapLead(row: any, formName: string, formId: string): Lead {
  const fd = (row.field_data ?? []) as { name: string; values: string[] }[];
  const fullName = fieldData(fd, ["full_name", "full name", "name"]) || `${fieldData(fd, ["first_name", "first name"])} ${fieldData(fd, ["last_name", "last name"])}`.trim();
  const email = fieldData(fd, ["email", "e-mail"]);
  const phone = fieldData(fd, ["phone_number", "phone", "mobile", "contact"]);
  const city = fieldData(fd, ["city", "location", "town"]);
  const company = fieldData(fd, ["company", "business", "organisation"]);
  const budget = fieldData(fd, ["budget", "investment", "ticket"]);
  const score = (email ? 1 : 0) + (phone ? 1 : 0) + (company ? 1 : 0) + (budget ? 1 : 0);
  return {
    id: String(row.id),
    createdTime: row.created_time,
    formId: String(row.form_id ?? formId),
    formName,
    campaignId: row.campaign_id ? String(row.campaign_id) : undefined,
    campaignName: row.campaign_name,
    adId: row.ad_id ? String(row.ad_id) : undefined,
    adName: row.ad_name,
    adSetName: row.adset_name,
    platform: row.platform ?? "facebook",
    isOrganic: Boolean(row.is_organic),
    fullName: fullName || "Unknown",
    email,
    phone,
    city: city || "—",
    company: company || undefined,
    budget: budget || undefined,
    intent: score >= 3 ? "Hot" : score >= 2 ? "Warm" : "Cold",
    fields: fd.map((f) => ({ name: f.name, values: f.values ?? [] })),
  };
}

async function fetchLeads(ctx: Ctx, token: string, range: Range) {
  const since = Math.floor(Date.parse(`${range.since}T00:00:00Z`) / 1000);
  const until = Math.floor(Date.parse(`${range.until}T23:59:59Z`) / 1000);

  // Page and form lists are cached, but lead rows are cached per form + range.
  // This lets a refresh resume complete lead capture without re-reading every
  // form from scratch, and it avoids the old arbitrary "12 largest forms" cap.
  const pages = await cachedByToken(pageCache, token, "Pages", () =>
    safe<any[]>(ctx, "Pages", () =>
      getEdgePaged(token, "me", "accounts", { fields: "id,name,access_token" }, { limit: 100, max: 1000, maxPages: 10 }), []));

  const pageForms = await mapLimit(pages, 2, async (page) => {
    const pageToken = (page.access_token as string) || token;
    const rows = await safe<any[]>(ctx, `Lead forms (${page.name ?? page.id})`, () =>
      cachedByToken(pageCache, token, `Forms:${page.id}`, () =>
        getEdgePaged(pageToken, String(page.id), "leadgen_forms", {
          fields: "id,name,status,leads_count,created_time,locale,questions{id,label,type}",
        }, { limit: 50, max: 1000, maxPages: 20 })), []);
    if ((rows as any)?.truncated) ctx.warnings.push(`Lead forms (${page.name ?? page.id}): Meta returned a partial form list. ${(rows as any).error ?? "Retry after the current rate-limit cooldown."}`);
    return { page, rows: rows ?? [] };
  });

  const forms: (LeadForm & { pageToken: string })[] = pageForms.flatMap(({ page, rows }) => rows.map((form: any) => ({
    id: String(form.id), name: form.name ?? "Untitled form", status: form.status ?? "ACTIVE",
    leadsCount: Number(form.leads_count ?? 0), pageId: String(page.id), pageName: page.name ?? "Page",
    pageToken: (page.access_token as string) || token,
    locale: form.locale, createdTime: form.created_time, questionsCount: form.questions?.data?.length,
  })));

  // Fetch every form that reports leads, not just the largest dozen. Keep the
  // fan-out small and stop scheduling new forms once Meta opens a cooldown.
  const candidates = forms.filter((f) => f.leadsCount > 0).sort((a, b) => b.leadsCount - a.leadsCount);
  let deferred = 0;
  let truncatedForms = 0;
  const batches = await mapLimit(candidates, 2, async (form) => {
    const cacheKey = `Leads:${form.id}:${since}:${until}`;
    if (rateLimitCooldownMs() > 0) {
      const hit = leadCache.peek(`${tokenScope(token)}:${cacheKey}`);
      if (hit?.value) return hit.value;
      deferred++;
      return [];
    }
    const rows = await safe<any[]>(ctx, `Leads (${form.name})`, () =>
      cachedByToken(leadCache, token, cacheKey, () =>
        getEdgePaged(form.pageToken!, form.id, "leads", {
          fields: "id,created_time,ad_id,ad_name,adset_name,campaign_id,campaign_name,form_id,platform,is_organic,field_data",
          filtering: [{ field: "time_created", operator: "GREATER_THAN", value: since }, { field: "time_created", operator: "LESS_THAN", value: until }],
        }, { limit: 200, max: 10000, maxPages: 50 })), []);
    if ((rows as any)?.truncated) truncatedForms++;
    return rows ?? [];
  });

  const leads = batches.flatMap((rows, i) => rows.map((row: any) => mapLead(row, candidates[i].name, candidates[i].id)));
  if (deferred > 0) ctx.warnings.push(`Lead capture: ${deferred} of ${candidates.length} lead-bearing forms were deferred while Meta requests are paused. Refresh after the cooldown to finish the sync; cached forms are retained.`);
  if (truncatedForms > 0) ctx.warnings.push(`Lead capture: ${truncatedForms} form lead lists were truncated by Meta. Narrow the date range or use Meta's lead export for a complete audit.`);
  leads.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
  return {
    forms: forms.map(({ pageToken, ...form }) => form),
    leads,
  };
}

/* ─────────────────────────── Pixel ─────────────────────────── */

function eventsFromActions(rows: any[], range: Range): PixelEvent[] {
  const counts: Record<string, { count: number; value: number; trend: number[] }> = {};
  const daily: Record<string, number[]> = {};
  for (const row of rows) {
    for (const action of (row.actions ?? []) as Action[]) {
      const name = PIXEL_EVENT_MAP[action.action_type];
      if (!name) continue;
      const value = Number(action.value) || 0;
      counts[name] ??= { count: 0, value: 0, trend: [] };
      counts[name].count += value;
      daily[name] ??= new Array(rows.length).fill(0);
    }
  }
  for (const row of rows) {
    const idx = rows.indexOf(row);
    for (const action of (row.actions ?? []) as Action[]) {
      const name = PIXEL_EVENT_MAP[action.action_type];
      if (!name) continue;
      daily[name][idx] += Number(action.value) || 0;
    }
  }
  for (const row of rows) {
    for (const a of (row.action_values ?? []) as Action[]) {
      const name = PIXEL_EVENT_MAP[a.action_type];
      if (name) counts[name].value += Number(a.value) || 0;
    }
  }
  const order = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase", "Lead", "CompleteRegistration", "Search", "AddToWishlist"];
  return Object.entries(counts)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([event, v]) => {
      const trend = (daily[event] ?? []).slice(-14);
      const half = Math.floor(trend.length / 2);
      const firstHalf = sum(trend.slice(0, half)) || 1;
      const secondHalf = sum(trend.slice(half));
      const delta = trend.length > 3 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
      return {
        event, label: event, count: v.count, value: v.value || undefined, trend,
        delta: Math.round(delta * 10) / 10,
        source: "ads_insights" as const,
        sourceLabel: "Meta Ads Insights attributed actions",
        reportingBasis: "Events attributed to ads under the account attribution settings; not total website event volume.",
        periodStart: range.since,
        periodEnd: range.until,
      };
    });
}

async function fetchPixel(ctx: Ctx, token: string, accountId: string, range: Range, dailyRows: any[]) {
  const listKey = `Pixels:${accountId}`;
  let pixels: any[] = [];

  // Pixel diagnostics are optional enrichment. If Meta has already opened a
  // cooldown, do not spend another call discovering the same limit; serve a
  // cached pixel list when possible and defer the rest until the next refresh.
  if (rateLimitCooldownMs() > 0) {
    const hit = pixelCache.peek(`${tokenScope(token)}:${listKey}`);
    if (hit?.value) pixels = hit.value;
    else {
      ctx.warnings.push("Pixels: pixel diagnostics were deferred while Meta requests are paused. Refresh after the cooldown to load them.");
      return { pixel: null, pixels: [] };
    }
  } else {
    pixels = await safe<any[]>(ctx, "Pixels", () =>
      cachedByToken(pixelCache, token, listKey, () =>
        getEdgePaged(token, accountId, "adspixels", {
          fields: "id,name,last_fired_time,code,creation_time,enable_automatic_matching,automatic_matching_fields,is_created_by_business",
        }, { limit: 25, max: 100, maxPages: 4 })), []);
  }

  const list = pixels.map((p) => ({ id: String(p.id), name: p.name ?? "Pixel", lastFiredTime: p.last_fired_time ?? null }));
  if (!pixels.length) return { pixel: null, pixels: list };

  const primary = pixels[0];
  const start = Math.floor(Date.parse(`${range.since}T00:00:00Z`) / 1000);
  const end = Math.floor(Date.parse(`${range.until}T23:59:59Z`) / 1000);

  let stats: any = null;
  if (rateLimitCooldownMs() === 0) {
    stats = await safe<any>(ctx, "Pixel stats", () =>
      cachedByToken(pixelCache, token, `PixelStats:${primary.id}:${range.since}:${range.until}`, async () => {
        const json = await graphRequest(
          `${primary.id}/stats`,
          { start_time: start, end_time: end, aggregation: "event" },
          token,
        );
        return json;
      }), null);
  }

  let events = eventsFromActions(dailyRows, range);
  if (stats?.data?.length) {
    const rows: any[] = stats.data.flatMap((bucket: any) =>
      Array.isArray(bucket?.data) ? bucket.data : [bucket],
    );
    for (const row of rows) {
      const name = row.event_name ?? row.event ?? row.value ?? row.name;
      const count = Number(row.count ?? row.total ?? 0);
      if (!name || typeof name !== "string" || !count) continue;
      const existing = events.find((e) => e.event === name);
      if (existing) {
        existing.count = count;
        existing.source = "pixel_stats";
        existing.sourceLabel = "Meta Pixel statistics";
        existing.reportingBasis = "Total events received by this Meta data source for the selected period.";
      } else events.unshift({
        event: name,
        label: name,
        count,
        trend: [],
        delta: 0,
        source: "pixel_stats",
        sourceLabel: "Meta Pixel statistics",
        reportingBasis: "Total events received by this Meta data source for the selected period.",
        periodStart: range.since,
        periodEnd: range.until,
      });
    }
  }

  let checks: any[] = [];
  if (rateLimitCooldownMs() === 0) {
    checks = await safe<any[]>(ctx, "Pixel diagnostics", () =>
      cachedByToken(pixelCache, token, `PixelChecks:${primary.id}`, async () => {
        const json = await graphRequest(`${primary.id}/da_checks`, {}, token);
        return (json?.data ?? []) as any[];
      }), []);
  }

  const diagnostics: PixelDiagnostic[] = checks.length
    ? checks.slice(0, 12).map((c: any) => ({
        id: String(c.key ?? c.id ?? c.name ?? Math.random()),
        title: String(c.title ?? c.name ?? "Check"),
        status: (String(c.status ?? c.result ?? "PASS").toLowerCase().includes("fail") ? "fail" : String(c.status ?? c.result ?? "").toLowerCase().includes("warn") || String(c.status ?? "").toLowerCase().includes("partial") ? "warn" : "pass") as PixelDiagnostic["status"],
        detail: String(c.description ?? c.detail ?? c.message ?? "—"),
        value: c.value ? String(c.value) : undefined,
      }))
    : defaultDiagnostics(primary, events);

  const pixel: PixelConfig = {
    id: String(primary.id),
    name: primary.name ?? "Pixel",
    code: primary.code,
    lastFiredTime: primary.last_fired_time ?? null,
    creationTime: primary.creation_time ?? null,
    automaticMatching: Boolean(primary.enable_automatic_matching),
    domains: [],
    events,
    diagnostics,
    shareInfo: { business: "", adAccount: "", shared: Boolean(primary.is_created_by_business) },
  };
  return { pixel, pixels: list };
}

function defaultDiagnostics(pixel: any, events: PixelEvent[]): PixelDiagnostic[] {
  const fired = pixel.last_fired_time ? new Date(pixel.last_fired_time).getTime() : 0;
  const stale = !fired || Date.now() - fired > 48 * 3600 * 1000;
  const hasPurchase = events.some((e) => e.event === "Purchase" || e.event === "Lead");
  return [
    { id: "installed", title: "Base code installed", status: "pass", detail: "Pixel found on this ad account.", value: `ID ${pixel.id}` },
    { id: "firing", title: "Pixel firing", status: stale ? "fail" : "pass", detail: stale ? "No events received in the last 48 hours." : `Last fired ${new Date(fired).toLocaleString()}`, value: stale ? "Stale" : "Live" },
    { id: "events", title: "Standard events", status: events.length ? "pass" : "warn", detail: events.length ? `${events.length} events receiving traffic in this period.` : "No standard events recorded in this period.", value: `${events.length} events` },
    { id: "value", title: "Value & currency parameters", status: hasPurchase ? "pass" : "warn", detail: hasPurchase ? "Purchase/Lead events detected." : "No purchase or lead event detected — value optimisation unavailable.", value: hasPurchase ? "OK" : "Missing" },
    { id: "capi", title: "Conversions API", status: "warn", detail: "Verify server-side events in Events Manager → Data sources to reduce signal loss.", value: "Check manually" },
    { id: "agg", title: "Aggregated Event Measurement", status: "warn", detail: "Verify your domain and rank 8 conversion events for iOS traffic.", value: "Check manually" },
  ];
}

/** Fetch metadata for the exact entities present in insights, in batched node reads. */
async function metadataByIds(ctx: Ctx, token: string, label: string, ids: string[], fields: string, batchSize = 25) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return [] as any[];
  const nodes = await safe(ctx, label, () => getManyByIds(token, unique, fields, batchSize), new Map<string, any>());
  const rows = unique.map((id) => nodes.get(id)).filter(Boolean) as any[];
  if (rows.length < unique.length) {
    ctx.warnings.push(`${label}: ${unique.length - rows.length} of ${unique.length} records were not returned by Meta. Confirm asset permissions and retry after any rate-limit cooldown.`);
  }
  return rows;
}

/* ─────────────────────────── Main ─────────────────────────── */

export async function buildLiveData(token: string, account: Account, range: Range): Promise<ReportData> {
  const ctx: Ctx = { warnings: [] };
  const compareRange = previousRange(range);
  const timeRange = { since: range.since, until: range.until };
  const prevTimeRange = { since: compareRange.since, until: compareRange.until };

  const [accountTotals, prevAccountTotals, dailyRows, prevRows, campaignRows, adSetRows, adRows, bAge, bPlatform, bPlacement, bDevice, bRegion, hourlyRows, leadData, campaignDaily] =
    await Promise.all([
      safe<any[]>(ctx, "Account totals", () => getInsights(token, account.id, { fields: BASE_FIELDS, time_range: timeRange, limit: 1 }), []),
      safe<any[]>(ctx, "Previous account totals", () => getInsights(token, account.id, { fields: BASE_FIELDS, time_range: prevTimeRange, limit: 1 }), []),
      safe<any[]>(ctx, "Daily insights", () => getInsights(token, account.id, { fields: BASE_FIELDS, time_range: timeRange, time_increment: 1, limit: 400 }), []),
      safe<any[]>(ctx, "Previous-period insights", () => getInsights(token, account.id, { fields: BASE_FIELDS, time_range: prevTimeRange, time_increment: 1, limit: 400 }), []),
      safe<any[]>(ctx, "Campaign insights", () => getInsights(token, account.id, { fields: `campaign_id,campaign_name,objective,${BASE_FIELDS}`, level: "campaign", time_range: timeRange, limit: 500 }), []),
      safe<any[]>(ctx, "Ad set insights", () => getInsights(token, account.id, { fields: `adset_id,adset_name,campaign_id,campaign_name,${BASE_FIELDS}${RANKING_FIELDS}`, level: "adset", time_range: timeRange, limit: 500 }), []),
      safe<any[]>(ctx, "Ad insights", () => getInsights(token, account.id, { fields: `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${BASE_FIELDS}${RANKING_FIELDS}`, level: "ad", time_range: timeRange, limit: 500 }), []),
      safe<any[]>(ctx, "Age & gender breakdown", () => getInsights(token, account.id, { fields: BASE_FIELDS, level: "account", breakdowns: "age,gender", time_range: timeRange, limit: 200 }), []),
      safe<any[]>(ctx, "Platform breakdown", () => getInsights(token, account.id, { fields: BASE_FIELDS, level: "account", breakdowns: "publisher_platform", time_range: timeRange, limit: 50 }), []),
      safe<any[]>(ctx, "Placement breakdown", () => getInsights(token, account.id, { fields: BASE_FIELDS, level: "account", breakdowns: "publisher_platform,platform_position", time_range: timeRange, limit: 200 }), []),
      safe<any[]>(ctx, "Device breakdown", () => getInsights(token, account.id, { fields: BASE_FIELDS, level: "account", breakdowns: "impression_device", time_range: timeRange, limit: 50 }), []),
      safe<any[]>(ctx, "Region breakdown", () => getInsights(token, account.id, { fields: BASE_FIELDS, level: "account", breakdowns: "region", time_range: timeRange, limit: 100 }), []),
      safe<any[]>(ctx, "Hourly breakdown", () => getInsights(token, account.id, {
        fields: "spend,impressions,clicks,actions", level: "account",
        breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
        time_range: timeRange, time_increment: 1, limit: 500,
      }), []),
      fetchLeads(ctx, token, range),
      safe<any[]>(ctx, "Campaign daily insights", () => getInsights(token, account.id, {
        fields: "campaign_id,spend,impressions,clicks,actions", level: "campaign",
        time_range: timeRange, time_increment: 1, limit: 1200,
      }), []),
    ]);

  // Metadata is fetched for the exact campaign/ad set/ad IDs returned by
  // insights, using batched node reads. This avoids account-edge page caps
  // silently dropping creatives for ads that do have delivery data.
  const [campaignMeta, adSetMeta, adMeta] = await Promise.all([
    metadataByIds(ctx, token, "Campaign metadata", campaignRows.map((r) => String(r.campaign_id ?? "")),
      "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,budget_remaining", 50),
    metadataByIds(ctx, token, "Ad set metadata", adSetRows.map((r) => String(r.adset_id ?? "")),
      "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,targeting{age_min,age_max,genders,geo_locations,publisher_platforms,facebook_positions,instagram_positions,device_platforms,interests,flexible_spec}", 50),
    metadataByIds(ctx, token, "Ad metadata", adRows.map((r) => String(r.ad_id ?? "")),
      "id,name,adset_id,campaign_id,status,effective_status,creative{id,name,title,body,image_hash,image_url,thumbnail_url,video_id,object_story_spec,call_to_action_type,asset_feed_spec,effective_object_story_id,object_story_id,instagram_permalink_url}", 50),
  ]);

  for (const [label, rows] of [
    ["Campaign", campaignRows], ["Ad set", adSetRows], ["Ad", adRows],
    ["Daily", dailyRows], ["Hourly", hourlyRows], ["Campaign daily", campaignDaily],
  ] as [string, any[]][]) {
    if ((rows as any).truncated) ctx.warnings.push(`${label} data: ${(rows as any).error ?? "source row/page limit reached"}. This report is partial; use a shorter period for a complete comparison.`);
  }
  const missingCreativeIds = adRows.map((r) => String(r.ad_id ?? "")).filter((id) => id && !adMeta.some((m) => String(m.id) === id));
  if (missingCreativeIds.length) ctx.warnings.push(`Creative metadata: ${missingCreativeIds.length} ads with delivery data did not return metadata. Their metrics remain available, but media may be missing. Confirm ads_read/asset permissions and retry after any cooldown.`);
  const imageHashes = [...new Set(adMeta.flatMap((ad) => imageHashesOf(ad.creative)))];
  const [pixelData, videoById, imageByHash] = await Promise.all([
    fetchPixel(ctx, token, account.id, range, dailyRows),
    resolveVideos(ctx, token, adMeta, adRows),
    safe(ctx, "Creative images", () => getAdImages(token, account.id, imageHashes), new Map<string, any>()),
  ]);

  // Meta reports quota consumption on every response; say so before the pool
  // runs out rather than after the first refusal.
  const quota = graphUsage();
  const quotaPeak = Math.max(quota.app?.callCount ?? 0, quota.businessUseCase?.callCount ?? 0);
  if (quotaPeak >= 75) {
    ctx.warnings.push(
      `Meta API quota: ${quotaPeak}% of the hourly call allowance is used. Refreshes are being paced; widen the date range less often or wait for the window to reset.`,
    );
  }

  const series = seriesFrom(dailyRows);
  const prevSeries = seriesFrom(prevRows);
  if (!accountTotals.length && dailyRows.length) ctx.warnings.push("Account reach: unique period totals were unavailable. Daily reach is additive and may overstate unique reach; interpret frequency cautiously.");
  const kpis = accountTotals.length ? kpiFrom(accountTotals[0]) : dailyRows.length ? kpiFrom(dailyRows.reduce((acc: any, r: any) => {
    return {
      spend: toNumber(acc.spend) + toNumber(r.spend),
      impressions: toNumber(acc.impressions) + toNumber(r.impressions),
      reach: toNumber(acc.reach) + toNumber(r.reach),
      clicks: toNumber(acc.clicks) + toNumber(r.clicks),
      actions: mergeActions((acc.actions ?? []) as Action[], (r.actions ?? []) as Action[]),
      action_values: mergeActions((acc.action_values ?? []) as Action[], (r.action_values ?? []) as Action[]),
      cost_per_action_type: [],
      video_thruplay_watched_actions: [],
      outbound_clicks: [],
    };
  }, { spend: 0, impressions: 0, reach: 0, clicks: 0, actions: [], action_values: [] })) : emptyKpis();

  const prevKpis = prevAccountTotals.length ? kpiFrom(prevAccountTotals[0]) : prevRows.length ? kpiFrom(prevRows.reduce((acc: any, r: any) => ({
    spend: toNumber(acc.spend) + toNumber(r.spend),
    impressions: toNumber(acc.impressions) + toNumber(r.impressions),
    reach: toNumber(acc.reach) + toNumber(r.reach),
    clicks: toNumber(acc.clicks) + toNumber(r.clicks),
    actions: mergeActions((acc.actions ?? []) as Action[], (r.actions ?? []) as Action[]),
    action_values: mergeActions((acc.action_values ?? []) as Action[], (r.action_values ?? []) as Action[]),
  }), { spend: 0, impressions: 0, reach: 0, clicks: 0, actions: [], action_values: [] })) : emptyKpis();

  const metaById = new Map<string, any>(campaignMeta.map((c) => [String(c.id), c]));
  const campaigns: CampaignRow[] = campaignRows.map((r) => {
    const meta = metaById.get(String(r.campaign_id));
    const k = kpiFrom(r, r.objective ?? meta?.objective);
    return {
      id: String(r.campaign_id ?? r.campaign_id),
      name: r.campaign_name ?? meta?.name ?? "Unknown campaign",
      status: meta?.effective_status ?? meta?.status ?? "UNKNOWN",
      objective: r.objective ?? meta?.objective ?? "UNKNOWN",
      budget: Number(meta?.daily_budget ?? meta?.lifetime_budget ?? 0) / 100,
      budgetType: meta?.daily_budget ? "daily" : meta?.lifetime_budget ? "lifetime" : "—",
      start: meta?.start_time?.slice(0, 10) ?? null,
      stop: meta?.stop_time?.slice(0, 10) ?? null,
      ...k,
      trend: [],
      location: inferStudioLocation(r.campaign_name, meta?.name),
    };
  });

  const adSetMetaById = new Map<string, any>(adSetMeta.map((a) => [String(a.id), a]));
  const adSets: AdSetRow[] = adSetRows.map((r) => {
    const meta = adSetMetaById.get(String(r.adset_id));
    return {
      id: String(r.adset_id),
      campaignId: String(r.campaign_id),
      campaignName: r.campaign_name,
      name: r.adset_name ?? meta?.name ?? "Ad set",
      status: meta?.effective_status ?? "UNKNOWN",
      objective: r.objective ?? "UNKNOWN",
      budget: Number(meta?.daily_budget ?? meta?.lifetime_budget ?? 0) / 100,
      budgetType: meta?.daily_budget ? "daily" : meta?.lifetime_budget ? "lifetime" : "—",
      qualityRanking: ranking(r.quality_ranking),
      engagementRanking: ranking(r.engagement_rate_ranking),
      conversionRanking: ranking(r.conversion_rate_ranking),
      ...kpiFrom(r, r.objective),
      trend: [],
      location: inferStudioLocation(r.adset_name, r.campaign_name, meta?.name),
    };
  });

  const adMetaById = new Map<string, any>(adMeta.map((a) => [String(a.id), a]));
  const ads: AdRow[] = adRows.map((r) => {
    const meta = adMetaById.get(String(r.ad_id));
    return {
      id: String(r.ad_id),
      adSetId: String(r.adset_id),
      adSetName: r.adset_name ?? "Ad set",
      name: r.ad_name ?? meta?.name ?? "Ad",
      status: meta?.effective_status ?? "UNKNOWN",
      objective: r.objective ?? "UNKNOWN",
      budget: 0,
      budgetType: "—",
      qualityRanking: ranking(r.quality_ranking),
      engagementRanking: ranking(r.engagement_rate_ranking),
      conversionRanking: ranking(r.conversion_rate_ranking),
      ...kpiFrom(r, r.objective),
      trend: [],
      location: inferStudioLocation(r.ad_name, r.adset_name, r.campaign_name, meta?.name),
      creative: creativeFrom(meta?.creative, videoById, imageByHash),
    };
  });

  // Attach 14-day spend sparklines derived from the campaign-level daily series.
  const dailyByCampaign = new Map<string, { date: string; spend: number }[]>();
  for (const row of campaignDaily) {
    const id = String(row.campaign_id);
    if (!dailyByCampaign.has(id)) dailyByCampaign.set(id, []);
    dailyByCampaign.get(id)!.push({ date: String(row.date_start), spend: toNumber(row.spend) });
  }
  for (const c of campaigns) {
    const rows = (dailyByCampaign.get(c.id) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1));
    c.trend = rows.slice(-14).map((r) => r.spend);
    // Child trends stay empty until their own daily series is available.
    // A campaign-shaped line multiplied by spend share is not observed data.
  }

  const breakdowns: Record<string, Breakdown> = {
    "age,gender": { dimension: "age,gender", label: "Age & gender", rows: toBreakdownRows(bAge) },
    publisher_platform: { dimension: "publisher_platform", label: "Platform", rows: toBreakdownRows(bPlatform) },
    platform_position: { dimension: "platform_position", label: "Placement", rows: toBreakdownRows(bPlacement) },
    impression_device: { dimension: "impression_device", label: "Device", rows: toBreakdownRows(bDevice) },
    region: { dimension: "region", label: "Region", rows: toBreakdownRows(bRegion) },
  };

  const hourly = buildHourly(hourlyRows, range);
  if (hourlyRows.length && !hourly.length) ctx.warnings.push("Daypart heatmap: source rows lack dates, so weekday timing cannot be established. No estimated heatmap is shown.");

  const leadForms = leadData.forms;
  const leads = leadData.leads;
  const leadFunnel: FunnelStep[] = [
    { label: "Impressions", value: kpis.impressions, note: `Reach ${Math.round(kpis.reach).toLocaleString()}` },
    { label: "Link clicks", value: kpis.clicks },
    { label: "Landing page views", value: kpis.landingPageViews, note: "Pixel: PageView" },
    { label: "Leads captured", value: leads.length || kpis.leads, note: "Captured form rows, otherwise attributed lead actions" },
    { label: "Customers", value: kpis.purchases, note: "Pixel: Purchase" },
  ];

  return {
    mode: "live",
    generatedAt: new Date().toISOString(),
    account,
    range,
    compareRange,
    kpis,
    prevKpis,
    series,
    prevSeries,
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    adSets: adSets.sort((a, b) => b.spend - a.spend),
    ads: ads.sort((a, b) => b.spend - a.spend),
    breakdowns,
    leads,
    leadForms,
    leadFunnel,
    pixel: pixelData.pixel,
    pixels: pixelData.pixels,
    hourly,
    weekday: [],
    warnings: ctx.warnings,
  };
}

function mergeActions(a: Action[], b: Action[]) {
  const map = new Map<string, number>();
  for (const x of a) map.set(x.action_type, (map.get(x.action_type) ?? 0) + Number(x.value || 0));
  for (const x of b) map.set(x.action_type, (map.get(x.action_type) ?? 0) + Number(x.value || 0));
  return [...map.entries()].map(([action_type, value]) => ({ action_type, value }));
}

function buildHourly(rows: any[], range: Range) {
  if (!rows.length) return [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hasDate = Boolean(rows[0].date_start);
  if (hasDate) {
    const grid: { day: number; hour: number; value: number }[] = [];
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid.push({ day: d, hour: h, value: 0 });
    const index = new Map(grid.map((g) => [`${g.day}-${g.hour}`, g]));
    for (const row of rows) {
      const hour = hourFromKey(row.hourly_stats_aggregated_by_advertiser_time_zone ?? "");
      if (hour === null) continue;
      const day = new Date(`${row.date_start}T00:00:00Z`).getUTCDay();
      const cell = index.get(`${day}-${hour}`);
      if (cell) cell.value += (firstAction(row.actions as Action[], LEAD_TYPES) + firstAction(row.actions as Action[], PURCHASE_TYPES));
    }
    return grid;
  }
  // Do not invent a weekday distribution when the source lacks dates.
  return [];
}

export { daysInRange };
