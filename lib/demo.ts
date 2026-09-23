import type {
  Account, AdRow, AdSetRow, Breakdown, BreakdownRow, CampaignRow, FunnelStep, Lead, LeadForm,
  PixelConfig, PixelDiagnostic, PixelEvent, Range, ReportData, SeriesPoint, Kpis, Ranking,
} from "./types";
import { deriveKpis, emptyKpis, sumActionValues } from "./metrics";
import { daysInRange } from "./metrics";
import { avg, hashString, mulberry32, safeDiv, sum } from "./utils";
import { previousRange } from "./ranges";

const FIRST = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Ayaan","Krishna","Ishaan","Rohan","Kabir","Aryan","Yash","Dhruv","Kunal","Nikhil","Siddharth","Varun","Manav","Ananya","Diya","Isha","Kavya","Meera","Nisha","Pooja","Priya","Riya","Sneha","Tara","Neha","Shreya","Simran","Tanvi","Aditi","Ritika","Farhan","Imran","Zara"];
const LAST = ["Sharma","Verma","Patel","Shah","Gupta","Mehta","Joshi","Nair","Reddy","Iyer","Kulkarni","Desai","Chopra","Malhotra","Bhatt","Rane","Kadam","More","Jadhav","Pawar","Khan","Ansari","Sheikh","Fernandes","D'Souza","Pillai","Menon","Bose","Sen","Chatterjee"];
const CITIES = [["Mumbai", 26], ["Pune", 14], ["Bengaluru", 13], ["Delhi", 12], ["Hyderabad", 9], ["Ahmedabad", 7], ["Chennai", 6], ["Kolkata", 5], ["Jaipur", 4], ["Surat", 4]] as const;
const BUDGETS = ["Under ₹50,000", "₹50,000 – ₹2L", "₹2L – ₹5L", "₹5L – ₹15L", "Above ₹15L", "Not disclosed"];

type Blueprint = {
  name: string; objective: string; status: string; budget: number; budgetType: "daily" | "lifetime";
  daily: number; cpm: number; ctr: number; cvr: number; aov: number; trend: number; q: Ranking; e: Ranking; c: Ranking;
};

const BLUEPRINTS: Blueprint[] = [
  { name: "Mumbai — High Intent Leads (Instant Forms)", objective: "OUTCOME_LEADS", status: "ACTIVE", budget: 4200, budgetType: "daily", daily: 4050, cpm: 186, ctr: 1.62, cvr: 2.6, aov: 0, trend: 0.28, q: "ABOVE_AVERAGE_100", e: "ABOVE_AVERAGE_75", c: "ABOVE_AVERAGE_100" },
  { name: "Pune — Lead Gen (Website + Pixel)", objective: "OUTCOME_LEADS", status: "ACTIVE", budget: 2600, budgetType: "daily", daily: 2480, cpm: 214, ctr: 1.18, cvr: 2.3, aov: 0, trend: -0.14, q: "AVERAGE_50", e: "AVERAGE_50", c: "BELOW_AVERAGE_25" },
  { name: "Catalog Sales — Advantage+ (Pan India)", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 6500, budgetType: "daily", daily: 6310, cpm: 142, ctr: 1.45, cvr: 1.35, aov: 2180, trend: 0.41, q: "ABOVE_AVERAGE_75", e: "ABOVE_AVERAGE_100", c: "ABOVE_AVERAGE_75" },
  { name: "Retargeting — Cart Abandoners 14d", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 1800, budgetType: "daily", daily: 1720, cpm: 190, ctr: 1.8, cvr: 3.0, aov: 2200, trend: 0.09, q: "ABOVE_AVERAGE_100", e: "ABOVE_AVERAGE_100", c: "ABOVE_AVERAGE_100" },
  { name: "Lookalike 1% — Purchasers (Broad)", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 3400, budgetType: "daily", daily: 3120, cpm: 168, ctr: 1.74, cvr: 1.1, aov: 2210, trend: -0.06, q: "AVERAGE_50", e: "AVERAGE_50", c: "AVERAGE_50" },
  { name: "Traffic — Blog & Guides (SEO assist)", objective: "OUTCOME_TRAFFIC", status: "ACTIVE", budget: 900, budgetType: "daily", daily: 860, cpm: 78, ctr: 2.86, cvr: 1.1, aov: 0, trend: 0.03, q: "AVERAGE_50", e: "BELOW_AVERAGE_25", c: "AVERAGE_50" },
  { name: "Video Views — Brand Film 30s", objective: "OUTCOME_AWARENESS", status: "PAUSED", budget: 1500, budgetType: "daily", daily: 1180, cpm: 62, ctr: 0.92, cvr: 0.4, aov: 0, trend: -0.22, q: "BELOW_AVERAGE_25", e: "AVERAGE_50", c: "BELOW_AVERAGE_20" },
  { name: "Engagement — Reels & Stories", objective: "OUTCOME_ENGAGEMENT", status: "ACTIVE", budget: 700, budgetType: "daily", daily: 640, cpm: 54, ctr: 1.42, cvr: 2.2, aov: 0, trend: 0.18, q: "ABOVE_AVERAGE_75", e: "ABOVE_AVERAGE_75", c: "AVERAGE_50" },
  { name: "Diwali Mega Offer — Evergreen (Lifetime)", objective: "OUTCOME_SALES", status: "ARCHIVED", budget: 240000, budgetType: "lifetime", daily: 940, cpm: 154, ctr: 1.96, cvr: 1.2, aov: 1980, trend: -0.62, q: "AVERAGE_50", e: "AVERAGE_50", c: "AVERAGE_50" },
];

const ADSET_NAMES = ["Broad 25-54 · Mumbai+Thane", "Interest Stack — Home & Decor", "Lookalike 1% Purchasers", "Retargeting 30d — All Visitors", "Advantage+ Audience", "Interest — Fitness & Wellness", "Custom — CRM Match 2%"];
const AD_ANGLES = [
  { title: "Flat 40% Off — Today Only", body: "Premium collection. Free delivery across India. Limited stock.", format: "Single image" },
  { title: "Free Consultation — 15 min", body: "Talk to our experts. No obligation. Book your slot now.", format: "Video" },
  { title: "See Why 12,000+ Switched", body: "Real stories from real customers. Rated 4.8★ across 3,400 reviews.", format: "Carousel" },
  { title: "Your Cart Is Waiting", body: "Complete your order in 2 minutes. Extra 10% off applied.", format: "Collection" },
  { title: "New Arrivals — Just Landed", body: "Handpicked styles, refreshed weekly. Explore the drop.", format: "Reel" },
  { title: "EMI from ₹1,499/month", body: "No-cost EMI available. Instant approval, zero paperwork.", format: "Single image" },
];
function demoCreativeThumbnail(title: string, format: string, index: number) {
  const palettes = [
    ["#5b21b6", "#db2777", "#f59e0b"], ["#0f766e", "#0891b2", "#67e8f9"],
    ["#1d4ed8", "#7c3aed", "#c4b5fd"], ["#9f1239", "#e11d48", "#fda4af"],
  ];
  const [from, to, accent] = palettes[index % palettes.length];
  const safeTitle = title.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
  const isVideo = /video|reel/i.test(format);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><circle cx="820" cy="80" r="210" fill="${accent}" opacity=".26"/><circle cx="90" cy="520" r="250" fill="#fff" opacity=".08"/><text x="64" y="76" fill="#fff" opacity=".78" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="4">META INSIGHT • DEMO</text><foreignObject x="64" y="150" width="700" height="220"><div xmlns="http://www.w3.org/1999/xhtml" style="font:700 56px/1.08 Arial,sans-serif;color:white">${safeTitle}</div></foreignObject>${isVideo ? `<circle cx="850" cy="430" r="52" fill="#000" opacity=".55"/><path d="M835 400l46 30-46 30z" fill="#fff"/>` : ""}<rect x="64" y="430" width="190" height="48" rx="24" fill="#fff"/><text x="159" y="461" text-anchor="middle" fill="${from}" font-family="Arial,sans-serif" font-size="18" font-weight="700">LEARN MORE</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const CTAS = ["LEARN_MORE", "SIGN_UP", "SHOP_NOW", "GET_QUOTE", "BOOK_NOW", "CONTACT_US"];

function pick<T>(rnd: () => number, arr: readonly T[]) {
  return arr[Math.floor(rnd() * arr.length)];
}
function weighted<T>(rnd: () => number, entries: readonly (readonly [T, number])[]) {
  const total = sum(entries.map((e) => e[1]));
  let r = rnd() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[0][0];
}

/** Seasonality: weekends perform slightly worse for B2B leads, better for ecommerce. */
function seasonality(date: string, kind: "lead" | "sales") {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 6;
  if (kind === "lead") return weekend ? 0.72 : 1 + (day === 2 || day === 3 ? 0.08 : 0);
  return weekend ? 1.12 : 0.97;
}

export function buildDemoData(accountId: string, range: Range, accountName = "Northwind Retail · Meta Ads"): ReportData {
  const seed = hashString(`${accountId}|${range.since}|${range.until}`);
  const rnd = mulberry32(seed);
  const dates = daysInRange(range);
  const n = Math.max(dates.length, 1);

  /* ── Entity tree ─────────────────────────────────────────── */
  const campaignRows: CampaignRow[] = [];
  const adSetRows: AdSetRow[] = [];
  const adRows: AdRow[] = [];

  BLUEPRINTS.forEach((bp, ci) => {
    const kind: "lead" | "sales" = bp.objective.includes("LEADS") ? "lead" : "sales";
    const isSales = bp.objective.includes("SALES");
    const arch = bp.status === "ARCHIVED";
    const active = bp.status === "ACTIVE";

    const dailySpend = dates.map((d, i) => {
      const progress = i / Math.max(n - 1, 1);
      const trendF = 1 + bp.trend * progress;
      const season = seasonality(d, kind);
      const noise = 0.82 + rnd() * 0.36;
      const pause = !active ? (arch ? Math.max(0, 1 - i / Math.max(n * 0.4, 1)) : 0.35) : 1;
      return Math.max(0, bp.daily * trendF * season * noise * pause);
    });

    const impressionsArr = dailySpend.map((s) => (s / bp.cpm) * 1000 * (0.9 + rnd() * 0.2));
    const ctrArr = impressionsArr.map(() => bp.ctr * (0.75 + rnd() * 0.5) * (1 + (bp.trend > 0 ? 0 : -0.05)));
    const clicksArr = impressionsArr.map((im, i) => (im * ctrArr[i]) / 100);
    const cvrArr = clicksArr.map(() => bp.cvr * (0.6 + rnd() * 0.85));
    // Results follow the campaign objective: conversions for lower-funnel
    // objectives, clicks/engagements for upper-funnel ones (as Meta does).
    const resultsArr = clicksArr.map((c, i) => {
      if (bp.objective.includes("SALES") || bp.objective.includes("LEADS")) return (c * cvrArr[i]) / 100;
      if (bp.objective.includes("TRAFFIC")) return c;                       // link clicks
      if (bp.objective.includes("AWARENESS")) return impressionsArr[i] * 0.009; // video views
      if (bp.objective.includes("ENGAGEMENT")) return impressionsArr[i] * 0.016; // post engagements
      return (c * cvrArr[i]) / 100;
    });
    const revenueArr = resultsArr.map((r) => (isSales ? r * bp.aov * (0.85 + rnd() * 0.3) : 0));
    const reachArr = impressionsArr.map((im) => im / (1.15 + rnd() * 0.9));
    // Conversions are objective-specific: leads only from lead campaigns,
    // purchases only from sales campaigns (sales also generate a few leads).
    const isLeads = bp.objective.includes("LEADS");
    const leadArr = resultsArr.map((r) => (isLeads ? r : isSales ? r * 0.06 : 0));
    const purchaseArr = resultsArr.map((r) => (isSales ? r : 0));

    const spend = sum(dailySpend);
    const impressions = sum(impressionsArr);
    const reach = sum(reachArr);
    const clicks = sum(clicksArr);
    const results = sum(resultsArr);
    const revenue = sum(revenueArr);
    const leads = sum(leadArr);
    const purchases = sum(purchaseArr);

    const resultLabel = isSales
      ? "Purchases"
      : bp.objective.includes("TRAFFIC")
        ? "Link clicks"
        : bp.objective.includes("AWARENESS")
          ? "Video views"
          : bp.objective.includes("ENGAGEMENT")
            ? "Engagements"
            : "Leads";
    const k = deriveKpis({
      spend, impressions, reach, clicks, leads, purchases, revenue, results, resultLabel,
      landingPageViews: Math.round(clicks * 0.72), videoViews: Math.round(impressions * (bp.objective.includes("AWARENESS") ? 0.41 : 0.08)),
      outboundClicks: Math.round(clicks * 0.88),
    });

    const id = `${ci + 1}20${(2000000 + Math.floor(rnd() * 8999999)).toString().padStart(7, "0")}`;
    const startOffset = Math.floor(rnd() * 240) + 40;
    campaignRows.push({
      id, name: bp.name, status: bp.status, objective: bp.objective,
      budget: bp.budget, budgetType: bp.budgetType,
      start: new Date(Date.parse(`${range.since}T00:00:00Z`) - startOffset * 86400000).toISOString().slice(0, 10),
      stop: arch ? new Date(Date.parse(`${range.until}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10) : null,
      ...k, qualityRanking: bp.q, engagementRanking: bp.e, conversionRanking: bp.c,
      trend: dailySpend.slice(-14),
    });

    const adSetCount = active ? 3 : 2;
    for (let s = 0; s < adSetCount; s++) {
      const share = [0.48, 0.32, 0.2][s] ?? 0.15;
      const jitter = 0.8 + rnd() * 0.45;
      const f = share * jitter;
      const asK = deriveKpis({
        spend: spend * f, impressions: impressions * f, reach: reach * f, clicks: clicks * f,
        leads: leads * f, purchases: purchases * f, revenue: revenue * f, results: results * f * (0.85 + rnd() * 0.35),
        resultLabel, landingPageViews: Math.round(clicks * f * 0.72), videoViews: 0, outboundClicks: Math.round(clicks * f * 0.88),
      });
      const asetId = `${(ci + 1) * 7 + s}20${(5000000 + Math.floor(rnd() * 3999999)).toString().padStart(7, "0")}`;
      adSetRows.push({
        ...asK, id: asetId, campaignId: id, campaignName: bp.name, name: ADSET_NAMES[(ci + s) % ADSET_NAMES.length],
        status: bp.status, objective: bp.objective, budget: Math.round(bp.budget * f), budgetType: "daily",
        qualityRanking: bp.q, engagementRanking: bp.e, conversionRanking: bp.c,
        trend: dailySpend.slice(-14).map((v) => v * f),
      });

      const adCount = s === 0 ? 3 : 2;
      for (let a = 0; a < adCount; a++) {
        const af = (0.5 + rnd() * 0.5) / adCount;
        const angle = AD_ANGLES[(ci + s + a) % AD_ANGLES.length];
        const adK = deriveKpis({
          spend: spend * f * af, impressions: impressions * f * af, reach: reach * f * af, clicks: clicks * f * af,
          leads: leads * f * af, purchases: purchases * f * af, revenue: revenue * f * af,
          results: results * f * af * (0.7 + rnd() * 0.6), resultLabel,
          landingPageViews: Math.round(clicks * f * af * 0.72), videoViews: 0, outboundClicks: Math.round(clicks * f * af * 0.88),
        });
        adRows.push({
          ...adK,
          id: `${asetId}${a}`, adSetId: asetId, adSetName: adSetRows[adSetRows.length - 1].name,
          name: `${bp.name.split("—")[0].trim()} · ${angle.title}`, status: bp.status, objective: bp.objective,
          budget: 0, budgetType: "—", qualityRanking: bp.q, engagementRanking: bp.e, conversionRanking: bp.c,
          trend: dailySpend.slice(-14).map((v) => v * f * af),
          creative: {
            title: angle.title, body: angle.body, format: angle.format,
            cta: CTAS[(ci + s + a) % CTAS.length],
            thumbnail: demoCreativeThumbnail(angle.title, angle.format, ci + s + a),
            videoId: /video|reel/i.test(angle.format) ? `demo-video-${ci}-${s}-${a}` : undefined,
          },
        });
      }
    }
  });

  /* ── Account daily series ────────────────────────────────── */
  type Daily = {
    spend: number[]; impressions: number[]; clicks: number[]; reach: number[];
    results: number[]; revenue: number[]; leads: number[]; purchases: number[];
  };
  const perCampaignDaily: Daily[] = [];
  campaignRows.forEach((_, ci) => {
    const bp = BLUEPRINTS[ci];
    const kind: "lead" | "sales" = bp.objective.includes("LEADS") ? "lead" : "sales";
    const isSales = bp.objective.includes("SALES");
    const arch = bp.status === "ARCHIVED";
    const active = bp.status === "ACTIVE";
    const r2 = mulberry32(seed + ci * 7919);
    const spend = dates.map((d, i) => {
      const progress = i / Math.max(n - 1, 1);
      const trendF = 1 + bp.trend * progress;
      const season = seasonality(d, kind);
      const noise = 0.82 + r2() * 0.36;
      const pause = !active ? (arch ? Math.max(0, 1 - i / Math.max(n * 0.4, 1)) : 0.35) : 1;
      return Math.max(0, bp.daily * trendF * season * noise * pause);
    });
    const impressions = spend.map((s) => (s / bp.cpm) * 1000 * (0.9 + r2() * 0.2));
    const clicks = impressions.map((im) => (im * (bp.ctr * (0.75 + r2() * 0.5))) / 100);
    const cvrJitter = bp.cvr * (0.6 + r2() * 0.85);
    const results = clicks.map((c, i) => {
      if (bp.objective.includes("SALES") || bp.objective.includes("LEADS")) return (c * cvrJitter) / 100;
      if (bp.objective.includes("TRAFFIC")) return c;
      if (bp.objective.includes("AWARENESS")) return impressions[i] * 0.009;
      if (bp.objective.includes("ENGAGEMENT")) return impressions[i] * 0.016;
      return (c * cvrJitter) / 100;
    });
    const revenue = results.map((r) => (isSales ? r * bp.aov * (0.85 + r2() * 0.3) : 0));
    const reach = impressions.map((im) => im / (1.15 + r2() * 0.9));
    const isLeads2 = bp.objective.includes("LEADS");
    const leads = results.map((r) => (isLeads2 ? r : isSales ? r * 0.06 : 0));
    const purchases = results.map((r) => (isSales ? r : 0));
    perCampaignDaily.push({ spend, impressions, clicks, reach, results, revenue, leads, purchases });
  });

  const series: SeriesPoint[] = dates.map((date, i) => {
    const point = { date } as SeriesPoint;
    point.spend = sum(perCampaignDaily.map((c) => c.spend[i]));
    point.impressions = sum(perCampaignDaily.map((c) => c.impressions[i]));
    point.reach = sum(perCampaignDaily.map((c) => c.reach[i]));
    point.clicks = sum(perCampaignDaily.map((c) => c.clicks[i]));
    point.results = sum(perCampaignDaily.map((c) => c.results[i]));
    point.revenue = sum(perCampaignDaily.map((c) => c.revenue[i]));
    point.leads = sum(perCampaignDaily.map((c) => c.leads[i]));
    point.purchases = sum(perCampaignDaily.map((c) => c.purchases[i]));
    point.ctr = safeDiv(point.clicks, point.impressions) * 100;
    point.cpc = safeDiv(point.spend, point.clicks);
    point.cpm = safeDiv(point.spend, point.impressions) * 1000;
    point.roas = safeDiv(point.revenue, point.spend);
    return point;
  });

  const kpis = deriveKpis({
    spend: sum(series.map((s) => s.spend)),
    impressions: sum(series.map((s) => s.impressions)),
    reach: sum(series.map((s) => s.reach)),
    clicks: sum(series.map((s) => s.clicks)),
    leads: sum(series.map((s) => s.leads)),
    purchases: sum(series.map((s) => s.purchases)),
    revenue: sum(series.map((s) => s.revenue)),
    results: sum(series.map((s) => s.results)),
    resultLabel: "Results",
    landingPageViews: Math.round(sum(series.map((s) => s.clicks)) * 0.72),
    videoViews: Math.round(sum(series.map((s) => s.impressions)) * 0.13),
    outboundClicks: Math.round(sum(series.map((s) => s.clicks)) * 0.88),
  });

  const compareRange = previousRange(range);
  const prevSeries = series.map((s, i) => {
    const factor = 0.78 + rnd() * 0.22;
    const spend = s.spend * factor;
    const impressions = s.impressions * (0.85 + rnd() * 0.2);
    const clicks = s.clicks * (0.82 + rnd() * 0.24);
    const results = s.results * (0.7 + rnd() * 0.3);
    const revenue = s.revenue * (0.68 + rnd() * 0.3);
    return {
      date: compareRange.since === "" ? s.date : new Date(Date.parse(`${compareRange.since}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10),
      spend, impressions, reach: s.reach * (0.86 + rnd() * 0.2), clicks,
      ctr: safeDiv(clicks, impressions) * 100, cpc: safeDiv(spend, clicks), cpm: safeDiv(spend, impressions) * 1000,
      results, revenue, roas: safeDiv(revenue, spend), leads: s.leads * (0.72 + rnd() * 0.3), purchases: s.purchases * (0.7 + rnd() * 0.3),
    };
  });

  const prevKpis = deriveKpis({
    spend: sum(prevSeries.map((s) => s.spend)),
    impressions: sum(prevSeries.map((s) => s.impressions)),
    reach: sum(prevSeries.map((s) => s.reach)),
    clicks: sum(prevSeries.map((s) => s.clicks)),
    leads: sum(prevSeries.map((s) => s.leads)),
    purchases: sum(prevSeries.map((s) => s.purchases)),
    revenue: sum(prevSeries.map((s) => s.revenue)),
    results: sum(prevSeries.map((s) => s.results)),
    resultLabel: kpis.resultLabel,
    landingPageViews: Math.round(sum(prevSeries.map((s) => s.clicks)) * 0.7),
    videoViews: Math.round(sum(prevSeries.map((s) => s.impressions)) * 0.12),
    outboundClicks: Math.round(sum(prevSeries.map((s) => s.clicks)) * 0.86),
  });

  /* ── Breakdowns ──────────────────────────────────────────── */
  const totalSpend = kpis.spend || 1;
  const mkRows = (weights: [string, number, number, number][]): BreakdownRow[] => {
    // [key, spendWeight, ctrMultiplier, cvrMultiplier]
    const wSum = sum(weights.map((w) => w[1]));
    return weights
      .map(([key, w, ctrM, cvrM]) => {
        const spend = (totalSpend * w) / wSum;
        const cpm = 130 * (0.8 + rnd() * 0.5);
        const impressions = (spend / cpm) * 1000;
        const clicks = (impressions * kpis.ctr * ctrM) / 100;
        const results = (clicks * (safeDiv(kpis.results, kpis.clicks) * 100) * cvrM) / 100;
        const revenue = (spend / totalSpend) * kpis.revenue * cvrM;
        return {
          key, spend, impressions, reach: impressions / (1.2 + rnd() * 0.6), clicks,
          ctr: safeDiv(clicks, impressions) * 100, cpc: safeDiv(spend, clicks), cpm,
          results, revenue, roas: safeDiv(revenue, spend), costPerResult: safeDiv(spend, results),
        };
      })
      .sort((a, b) => b.spend - a.spend);
  };

  const breakdowns: Record<string, Breakdown> = {
    "age,gender": {
      dimension: "age,gender", label: "Age & gender",
      rows: mkRows([
        ["Female · 25-34", 24, 1.15, 1.32], ["Male · 25-34", 21, 1.02, 1.05],
        ["Female · 35-44", 14, 1.08, 1.18], ["Male · 35-44", 13, 0.94, 0.96],
        ["Female · 18-24", 9, 1.28, 0.72], ["Male · 18-24", 8, 1.12, 0.64],
        ["Female · 45-54", 5, 0.88, 1.1], ["Male · 45-54", 4, 0.82, 0.92],
        ["Unknown · 55-64", 2, 0.7, 0.8],
      ]),
    },
    publisher_platform: {
      dimension: "publisher_platform", label: "Platform",
      rows: mkRows([
        ["facebook", 46, 1.0, 1.12], ["instagram", 38, 1.24, 0.92], ["audience_network", 11, 0.62, 0.7], ["messenger", 5, 0.78, 1.05],
      ]),
    },
    platform_position: {
      dimension: "platform_position", label: "Placement",
      rows: mkRows([
        ["facebook · feed", 27, 1.05, 1.1], ["instagram · story", 19, 1.32, 0.85],
        ["instagram · reels", 14, 1.18, 0.98], ["facebook · reels", 9, 1.1, 0.9],
        ["facebook · marketplace", 7, 0.72, 1.24], ["audience_network · classic", 7, 0.6, 0.62],
        ["facebook · right_hand_column", 5, 0.48, 0.8], ["instagram · explore", 4, 0.98, 0.7],
        ["messenger · story", 3, 0.85, 0.95], ["facebook · video_feeds", 5, 0.9, 0.75],
      ]),
    },
    impression_device: {
      dimension: "impression_device", label: "Device",
      rows: mkRows([
        ["mobile", 82, 1.12, 0.94], ["desktop", 12, 0.86, 1.42], ["tablet", 4, 0.9, 1.05], ["unknown", 2, 0.5, 0.4],
      ]),
    },
    region: {
      dimension: "region", label: "Region",
      rows: mkRows([
        ["Maharashtra", 27, 1.08, 1.18], ["Karnataka", 15, 1.05, 1.1], ["Tamil Nadu", 11, 0.98, 1.0],
        ["Delhi", 10, 1.02, 0.95], ["Telangana", 9, 1.0, 1.05], ["Gujarat", 8, 0.92, 1.15],
        ["West Bengal", 6, 0.9, 0.85], ["Rajasthan", 5, 0.88, 0.9], ["Kerala", 5, 1.1, 0.95], ["Punjab", 4, 0.95, 0.88],
      ]),
    },
  };

  /* ── Hour × day heat-map ─────────────────────────────────── */
  const hourly: { day: number; hour: number; value: number }[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const peak = Math.exp(-((hour - 20) ** 2) / 18) * 1.0 + Math.exp(-((hour - 12) ** 2) / 26) * 0.6 + Math.exp(-((hour - 9) ** 2) / 20) * 0.35;
      const weekend = day === 0 || day === 6 ? 0.85 : 1;
      hourly.push({ day, hour, value: (peak * weekend * (0.7 + rnd() * 0.6) * kpis.results) / 26 });
    }
  }

  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = weekdayNames.map((name, d) => {
    const rows = series.map((s, i) => ({ day: new Date(`${s.date}T00:00:00Z`).getUTCDay(), spend: s.spend, results: s.results })).filter((r) => r.day === d);
    const spend = sum(rows.map((r) => r.spend));
    const results = sum(rows.map((r) => r.results));
    return { day: name, spend, results, cpa: safeDiv(spend, results) };
  });

  /* ── Leads ───────────────────────────────────────────────── */
  const forms: LeadForm[] = [
    { id: "1001", name: "Website — Free Consultation", status: "ACTIVE", leadsCount: 0, pageId: "pg1", pageName: "Northwind Retail", locale: "en_IN", createdTime: new Date(Date.parse(`${range.since}T00:00:00Z`) - 210 * 86400000).toISOString(), questionsCount: 5 },
    { id: "1002", name: "Instant Form — Price List (Mumbai)", status: "ACTIVE", leadsCount: 0, pageId: "pg1", pageName: "Northwind Retail", locale: "en_IN", createdTime: new Date(Date.parse(`${range.since}T00:00:00Z`) - 96 * 86400000).toISOString(), questionsCount: 3 },
    { id: "1003", name: "Instant Form — Catalogue Request", status: "ACTIVE", leadsCount: 0, pageId: "pg1", pageName: "Northwind Retail", locale: "en_IN", createdTime: new Date(Date.parse(`${range.since}T00:00:00Z`) - 54 * 86400000).toISOString(), questionsCount: 4 },
    { id: "1004", name: "WhatsApp — Diwali Offer", status: "PAUSED", leadsCount: 0, pageId: "pg2", pageName: "Northwind Outlet", locale: "en_IN", createdTime: new Date(Date.parse(`${range.since}T00:00:00Z`) - 320 * 86400000).toISOString(), questionsCount: 2 },
  ];

  const leadCampaigns = campaignRows.filter((c) => c.leads > 0);
  const leads: Lead[] = [];
  // Keep the lead list numerically identical to the reported lead KPI.
  const totalLeads = Math.min(2000, Math.round(kpis.leads * 0.94) + Math.round(rnd() * 12));
  for (let i = 0; i < totalLeads; i++) {
    const dayIndex = Math.floor(Math.pow(rnd(), 1.15) * n);
    const date = dates[Math.min(dayIndex, n - 1)];
    const hour = Math.floor(9 + Math.pow(rnd(), 0.8) * 13);
    const minute = Math.floor(rnd() * 60);
    const first = pick(rnd, FIRST);
    const last = pick(rnd, LAST);
    const campaign = leadCampaigns[Math.floor(rnd() * leadCampaigns.length)] ?? campaignRows[0];
    const adSet = adSetRows.filter((a) => a.campaignId === campaign.id);
    const ad = adRows.filter((a) => adRows.length && adSet.some((s) => s.id === a.adSetId));
    const form = forms[Math.floor(rnd() * (rnd() > 0.85 ? 4 : 3))];
    const city = weighted(rnd, CITIES);
    const intentRoll = rnd();
    const fields: Lead["fields"] = [
      { name: "full_name", values: [`${first} ${last}`] },
      { name: "email", values: [`${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(rnd() * 90 + 10)}@${rnd() > 0.5 ? "gmail.com" : "outlook.com"}`] },
      { name: "phone_number", values: [`+91 ${Math.floor(rnd() * 400000000 + 700000000).toString().slice(0, 5)} ${Math.floor(rnd() * 90000 + 10000)}`] },
      { name: "city", values: [city] },
    ];
    if (rnd() > 0.55) fields.push({ name: "budget", values: [pick(rnd, BUDGETS)] });
    if (rnd() > 0.7) fields.push({ name: "company_name", values: [`${last} ${pick(rnd, ["Enterprises", "Trading Co.", "Designs", "Logistics", "Ventures"])}`] });
    if (rnd() > 0.8) fields.push({ name: "preferred_time", values: [pick(rnd, ["Morning", "Afternoon", "Evening", "Weekend"])] });

    leads.push({
      id: `l_${(1000000 + i * 7919).toString(36)}`,
      createdTime: new Date(Date.parse(`${date}T00:00:00Z`) + hour * 3600000 + minute * 60000).toISOString(),
      formId: form.id, formName: form.name,
      campaignId: campaign.id, campaignName: campaign.name,
      adId: ad.length ? pick(rnd, ad).id : undefined,
      adName: ad.length ? pick(rnd, ad).name : undefined,
      adSetName: adSet.length ? pick(rnd, adSet).name : undefined,
      platform: rnd() > 0.45 ? "instagram" : "facebook",
      isOrganic: rnd() > 0.93,
      fullName: `${first} ${last}`,
      email: fields.find((f) => f.name === "email")!.values[0],
      phone: fields.find((f) => f.name === "phone_number")!.values[0],
      city,
      company: fields.find((f) => f.name === "company_name")?.values[0],
      budget: fields.find((f) => f.name === "budget")?.values[0],
      intent: intentRoll > 0.78 ? "Hot" : intentRoll > 0.45 ? "Warm" : "Cold",
      fields,
    });
  }
  leads.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
  forms.forEach((f) => {
    f.leadsCount = leads.filter((l) => l.formId === f.id).length + Math.floor(rnd() * 40);
  });

  const qualified = Math.round(leads.length * 0.52);
  const leadFunnel: FunnelStep[] = [
    { label: "Impressions", value: kpis.impressions, note: `Reach ${Math.round(kpis.reach).toLocaleString()}` },
    { label: "Link clicks", value: kpis.clicks },
    { label: "Landing page views", value: kpis.landingPageViews, note: "Pixel: PageView" },
    { label: "Lead form opens", value: Math.round(leads.length * 2.6), note: "Pixel: Contact/ViewContent" },
    { label: "Leads captured", value: leads.length, note: "Pixel: Lead" },
    { label: "Sales-qualified", value: qualified, note: "CRM matched" },
    { label: "Customers", value: Math.round(qualified * 0.18), note: "Pixel: Purchase" },
  ];

  /* ── Pixel ───────────────────────────────────────────────── */
  const eventDefs: [string, number, number][] = [
    ["PageView", 1, 0.94], ["ViewContent", 0.62, 0.92], ["AddToCart", 0.24, 0.88],
    ["InitiateCheckout", 0.14, 0.9], ["Purchase", 0.06, 0.86], ["Lead", 0.09, 0.95], ["CompleteRegistration", 0.03, 0.82],
  ];
  const events: PixelEvent[] = eventDefs.map(([event, ratio, match]) => {
    const base = event === "PageView" ? kpis.landingPageViews * 1.35 : event === "Lead" ? leads.length * 1.08 : event === "Purchase" ? kpis.purchases * 1.12 : kpis.clicks * ratio;
    const count = Math.max(0, Math.round(base * (0.92 + rnd() * 0.2)));
    const trend = Array.from({ length: 14 }, (_, i) => Math.round((count / 14) * (0.7 + rnd() * 0.7) * (1 + i * 0.01)));
    const quality: PixelEvent["quality"] = match > 0.92 ? "good" : match > 0.86 ? "medium" : "low";
    return {
      event, label: event, count,
      value: event === "Purchase" ? Math.round(count * 2310) : undefined,
      trend,
      delta: Math.round((rnd() * 46 - 14) * 10) / 10,
      matched: Math.round(match * 100),
      quality,
      source: "demo",
      sourceLabel: "Demonstration dataset",
      reportingBasis: "Illustrative event volume generated for product demonstration; not connected to a Meta data source.",
      periodStart: range.since,
      periodEnd: range.until,
    };
  });

  const diagnostics: PixelDiagnostic[] = [
    { id: "installed", title: "Base code installed", status: "pass", detail: "Pixel base code detected on 3/3 domains.", value: "3 domains" },
    { id: "firing", title: "Pixel firing", status: "pass", detail: `Last event received ${Math.floor(rnd() * 40) + 2} minutes ago.`, value: "Live" },
    { id: "events", title: "Standard events configured", status: "pass", detail: "7 standard events with parameters (value, currency, content_ids).", value: "7 events" },
    { id: "match", title: "Advanced matching", status: "warn", detail: "Automatic advanced matching is on, but email & phone are only sent on 2 of 3 domains.", value: "68% match quality" },
    { id: "capi", title: "Conversions API (CAPI)", status: "warn", detail: "Server-side events deduplicated for Purchase only. Add Lead and InitiateCheckout to recover ~9% signal loss.", value: "Partial" },
    { id: "aggregated", title: "Aggregated Event Measurement", status: "pass", detail: "Domain verified. 8 events ranked, Purchase set as highest priority.", value: "Verified" },
    { id: "dedupe", title: "Event deduplication", status: "fail", detail: "12% of Purchase events have mismatched event_id between browser and server.", value: "12% mismatched" },
    { id: "consent", title: "Consent / signal loss", status: "warn", detail: "Estimated 14% signal loss from iOS 14.5+ opt-outs on mobile traffic.", value: "14% loss" },
  ];

  const pixel: PixelConfig = {
    id: "1029384756102938",
    name: "Northwind Website Pixel",
    code: `<script>
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
  t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window,document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1029384756102938');
  fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=1029384756102938&ev=PageView&noscript=1"/></noscript>`,
    lastFiredTime: new Date(Date.now() - (Math.floor(rnd() * 20) + 2) * 60000).toISOString(),
    creationTime: new Date(Date.parse(`${range.since}T00:00:00Z`) - 700 * 86400000).toISOString(),
    automaticMatching: true,
    domains: ["northwindretail.com", "shop.northwindretail.com", "northwindretail.com/blog"],
    events, diagnostics,
    shareInfo: { business: "Northwind Group", adAccount: accountName, shared: true },
  };

  const account: Account = {
    id: accountId, name: accountName, currency: "INR", timezone: "Asia/Kolkata",
    status: 1, amountSpent: Math.round(kpis.spend * 8.4), businessName: "Northwind Group",
  };

  return {
    mode: "demo",
    generatedAt: new Date().toISOString(),
    account,
    range,
    compareRange,
    kpis,
    prevKpis,
    series,
    prevSeries,
    campaigns: campaignRows.sort((a, b) => b.spend - a.spend),
    adSets: adSetRows.sort((a, b) => b.spend - a.spend),
    ads: adRows.sort((a, b) => b.spend - a.spend),
    breakdowns,
    leads,
    leadForms: forms,
    leadFunnel,
    pixel,
    pixels: [
      { id: pixel.id, name: pixel.name, lastFiredTime: pixel.lastFiredTime },
      { id: "5566778899001122", name: "Northwind Legacy Pixel (unused)", lastFiredTime: new Date(Date.now() - 96 * 86400000).toISOString() },
    ],
    hourly,
    weekday,
    warnings: [],
  };
}

export const DEMO_ACCOUNTS: Account[] = [
  { id: "act_112233445566778", name: "Northwind Retail · Meta Ads", currency: "INR", timezone: "Asia/Kolkata", status: 1, amountSpent: 4820000, businessName: "Northwind Group" },
  { id: "act_998877665544332", name: "Northwind Retail — EMEA", currency: "EUR", timezone: "Europe/Berlin", status: 1, amountSpent: 1240000, businessName: "Northwind Group" },
  { id: "act_556677889900112", name: "Sable Interiors (Client)", currency: "USD", timezone: "America/New_York", status: 1, amountSpent: 310000, businessName: "Sable Agency" },
];

export { emptyKpis };
