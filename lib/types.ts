/* ────────────────────────────────────────────────────────────────
   Shared domain types (used by both LIVE Graph API and DEMO engine)
   ──────────────────────────────────────────────────────────────── */

export type Mode = "live" | "demo";

export type Range = {
  key: string;
  label: string;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  days: number;
};

export type Account = {
  id: string;          // act_1234567890
  name: string;
  currency: string;
  timezone: string;
  status: number;
  amountSpent: number;
  businessName?: string;
};

export type Kpis = {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpp: number;
  results: number;
  resultLabel: string;
  costPerResult: number;
  revenue: number;
  roas: number;
  leads: number;
  purchases: number;
  /** Conversions credited to ad views (omni − click-through). */
  purchasesView?: number;
  landingPageViews: number;
  videoViews: number;
  outboundClicks: number;
};

export type SeriesPoint = {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  revenue: number;
  roas: number;
  leads: number;
  purchases: number;
};

export type Ranking = "ABOVE_AVERAGE_100" | "ABOVE_AVERAGE_75" | "AVERAGE_50" | "BELOW_AVERAGE_25" | "BELOW_AVERAGE_20" | "UNKNOWN" | null;

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  objective: string;
  budget: number;
  budgetType: "daily" | "lifetime" | "—";
  start?: string | null;
  stop?: string | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  resultLabel: string;
  costPerResult: number;
  revenue: number;
  roas: number;
  leads: number;
  purchases: number;
  qualityRanking?: Ranking;
  engagementRanking?: Ranking;
  conversionRanking?: Ranking;
  trend: number[];
  /** Studio / location tag parsed from the entity name (used by the advanced analytics view). */
  location?: string;
};

export type AdSetRow = CampaignRow & { campaignId: string; campaignName: string };
export type AdRow = CampaignRow & {
  adSetId: string;
  adSetName: string;
  creative?: {
    id?: string; title?: string; body?: string; thumbnail?: string; imageUrl?: string;
    videoUrl?: string; permalink?: string; videoId?: string; cta?: string; format?: string;
  } | null;
};

export type BreakdownRow = {
  key: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  revenue: number;
  roas: number;
  costPerResult: number;
};

export type Breakdown = {
  dimension: string;
  label: string;
  rows: BreakdownRow[];
};

export type LeadField = { name: string; values: string[] };

export type Lead = {
  id: string;
  createdTime: string;
  formId: string;
  formName: string;
  campaignId?: string;
  campaignName?: string;
  adId?: string;
  adName?: string;
  adSetName?: string;
  platform: string;
  isOrganic: boolean;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  company?: string;
  budget?: string;
  intent?: "Hot" | "Warm" | "Cold";
  fields: LeadField[];
};

export type LeadForm = {
  id: string;
  name: string;
  status: string;
  leadsCount: number;
  pageId: string;
  pageName: string;
  locale?: string;
  createdTime?: string;
  questionsCount?: number;
};

export type PixelEvent = {
  event: string;
  label: string;
  count: number;
  value?: number;
  trend: number[];
  delta: number;
  /** Event match quality is not returned by every Graph endpoint. */
  matched?: number;
  quality?: "good" | "medium" | "low";
  source: "pixel_stats" | "ads_insights" | "demo";
  sourceLabel: string;
  reportingBasis: string;
  periodStart: string;
  periodEnd: string;
};

export type PixelDiagnostic = {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  value?: string;
  cause?: string;
  evidence?: string;
  resolution?: string[];
};

export type PixelConfig = {
  id: string;
  name: string;
  code?: string;
  lastFiredTime?: string | null;
  creationTime?: string | null;
  automaticMatching?: boolean;
  domains: string[];
  events: PixelEvent[];
  diagnostics: PixelDiagnostic[];
  shareInfo?: { business: string; adAccount: string; shared: boolean };
};

export type FunnelStep = { label: string; value: number; note?: string };

export type Insight = {
  id: string;
  severity: "critical" | "warning" | "opportunity" | "info";
  title: string;
  detail: string;
  impact: string;
  metric?: { label: string; value: string; delta?: number };
  action: string;
  entities: string[];
};

export type ReportData = {
  mode: Mode;
  generatedAt: string;
  account: Account;
  range: Range;
  compareRange: Range;
  kpis: Kpis;
  prevKpis: Kpis;
  series: SeriesPoint[];
  prevSeries: SeriesPoint[];
  campaigns: CampaignRow[];
  adSets: AdSetRow[];
  ads: AdRow[];
  breakdowns: Record<string, Breakdown>;
  leads: Lead[];
  leadForms: LeadForm[];
  leadFunnel: FunnelStep[];
  pixel: PixelConfig | null;
  pixels: { id: string; name: string; lastFiredTime?: string | null }[];
  hourly: { day: number; hour: number; value: number }[];
  weekday: { day: string; spend: number; results: number; cpa: number }[];
  warnings: string[];
};
