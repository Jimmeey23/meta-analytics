import type { PixelDiagnostic, PixelEvent, ReportData } from "./types";
import { currency, num, pct } from "./format";
import { safeDiv, sum } from "./utils";

export type Discrepancy = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  summary: string;
  left: { label: string; value: number };
  right: { label: string; value: number };
  gap: number;
  gapPct: number;
  causes: string[];
  steps: string[];
  impact: string;
  where: string;
};

const pctOf = (part: number, whole: number) => safeDiv(part, whole) * 100;

export function findDiscrepancies(data: ReportData): Discrepancy[] {
  const out: Discrepancy[] = [];
  const code = data.account.currency;
  const money = (v: number) => currency(v, code, { compact: true });
  const pixel = data.pixel;
  const ev = (name: string) => pixel?.events.find((e) => e.event === name);

  const adsLeads = data.kpis.leads;
  const adsPurchases = data.kpis.purchases;
  const pixelLeads = ev("Lead")?.count ?? 0;
  const pixelPurchases = ev("Purchase")?.count ?? 0;
  const pixelPurchaseValue = ev("Purchase")?.value ?? 0;
  const pageViews = ev("PageView")?.count ?? 0;

  /* 1 ── Ads-reported leads vs pixel Lead events ─────────────── */
  if (adsLeads > 0 && pixelLeads > 0) {
    const gap = pixelLeads - adsLeads;
    const gapPct = pctOf(gap, adsLeads);
    if (Math.abs(gapPct) >= 4) {
      const overReported = gap > 0;
      out.push({
        id: "lead-count-gap",
        severity: Math.abs(gapPct) >= 25 ? "critical" : "warning",
        title: `Pixel recorded ${Math.abs(gapPct).toFixed(1)}% ${overReported ? "more" : "fewer"} Lead events than your ads reported`,
        summary: `Your pixel fired ${num(pixelLeads)} Lead events while the ads interface credited ${num(adsLeads)} leads — a difference of ${num(Math.abs(gap))} conversions (${pctOf(Math.abs(gap), adsLeads).toFixed(1)}%).`,
        left: { label: "Ads-reported leads", value: adsLeads },
        right: { label: "Pixel Lead events", value: pixelLeads },
        gap, gapPct,
        causes: overReported
          ? [
              "Leads arriving from organic, email or WhatsApp traffic still fire the pixel but are not credited to an ad.",
              "Conversions happening after the attribution window (7-day click / 1-day view by default) are dropped from ad reporting.",
              "Cross-device journeys: the click happens on mobile, the conversion on desktop.",
              "Browser restrictions (ITP, ad blockers, cookie deletion) break the click-to-conversion link.",
            ]
          : [
              "The same person is being counted twice because browser and server events are not deduplicated.",
              "The pixel snippet is installed on a page that loads more than once per conversion (thank-you page refresh).",
              "Instant-form leads are being reported by Meta while a Lead event also fires on the confirmation page.",
            ],
        steps: [
          "Open Events Manager → Data sources → your pixel → Test Events and fire a real lead; confirm exactly one Lead event per submission.",
          "Send a shared event_id (or use fbp/fbc + external_id) with both the browser and the Conversions API event so Meta can deduplicate.",
          "Move the Lead event off page load and fire it once on form-success, guarding against double submits.",
          "Compare with your CRM: if the CRM count is closer to the pixel number, widen the attribution window in Ads Manager → Attribution settings.",
          "Add UTM parameters to every campaign URL so organic conversions can be separated from paid ones.",
        ],
        impact: overReported
          ? `Up to ${num(gap)} conversions (≈ ${money(safeDiv(data.kpis.spend, adsLeads) * gap)} of value) are invisible to ad optimisation.`
          : `${num(Math.abs(gap))} conversions are likely double-counted, inflating your reported results.`,
        where: "Events Manager → Data sources",
      });
    }
  }

  /* 2 ── Ads-reported purchases vs pixel Purchase events ─────── */
  if (adsPurchases > 0 && pixelPurchases > 0) {
    const gap = pixelPurchases - adsPurchases;
    const gapPct = pctOf(gap, adsPurchases);
    if (Math.abs(gapPct) >= 4) {
      out.push({
        id: "purchase-count-gap",
        severity: Math.abs(gapPct) >= 25 ? "critical" : "warning",
        title: `Purchase reporting differs by ${num(Math.abs(gap))} orders (${Math.abs(gapPct).toFixed(1)}%)`,
        summary: `The pixel recorded ${num(pixelPurchases)} purchases versus ${num(adsPurchases)} credited to your ads for the same period.`,
        left: { label: "Ads-reported purchases", value: adsPurchases },
        right: { label: "Pixel Purchase events", value: pixelPurchases },
        gap, gapPct,
        causes: [
          "Orders placed after the 7-day click window are excluded from ad reporting.",
          "Shopify/ WooCommerce app and manual pixel both firing → duplicate Purchase events.",
          "Server-side (CAPI) events without matching event_id → the same order counted twice.",
          "Orders from returning customers or other channels fire the pixel but are not ad-attributed.",
        ],
        steps: [
          "Confirm your e-commerce platform is not double-installing the pixel (check for both a theme snippet and an app integration).",
          "Send event_id with every server-side purchase and reuse the exact same value on the browser event.",
          "Check Ads Manager → Columns → Customise to compare 7-day click vs 1-day view attribution for purchases.",
          "Reconcile against the order count in your store admin for the same date range; the truth is usually in between.",
        ],
        impact: gap > 0
          ? `${num(gap)} orders (≈ ${money(safeDiv(data.kpis.revenue, adsPurchases) * gap)}) are not being fed back to Meta's optimiser.`
          : `${num(Math.abs(gap))} orders may be counted twice.`,
        where: "Events Manager → Diagnostics",
      });
    }
  }

  /* 3 ── Pixel value vs ad-reported revenue ──────────────────── */
  if (pixelPurchaseValue > 0 && data.kpis.revenue > 0) {
    const gap = pixelPurchaseValue - data.kpis.revenue;
    const gapPct = pctOf(gap, data.kpis.revenue);
    if (Math.abs(gapPct) >= 6) {
      out.push({
        id: "value-mismatch",
        severity: Math.abs(gapPct) >= 20 ? "warning" : "info",
        title: `Purchase value differs by ${money(Math.abs(gap))} (${Math.abs(gapPct).toFixed(1)}%)`,
        summary: `Your pixel reported ${money(pixelPurchaseValue)} in purchase value while ads reported ${money(data.kpis.revenue)} of revenue. ROAS is therefore understated or overstated by the same margin.`,
        left: { label: "Ads-reported revenue", value: data.kpis.revenue },
        right: { label: "Pixel purchase value", value: pixelPurchaseValue },
        gap, gapPct,
        causes: [
          "value is missing or hardcoded on some events, so Meta defaults to the catalogue price or zero.",
          "Currency is not being sent, so values are interpreted in the account currency.",
          "Tax, shipping or discounts are handled differently in the pixel than in ad reporting.",
          "Refunds and cancellations are not sent back as negative or adjusted values.",
        ],
        steps: [
          "Send value and currency as top-level parameters on every Purchase event (not nested inside custom_data only).",
          "Make the value net of tax and shipping to match ads reporting, and document the choice.",
          "Use the same currency code as your ad account everywhere.",
          "Send Purchase events for refunds with a negative value, or exclude refunded orders from the pixel.",
        ],
        impact: `ROAS is off by roughly ${Math.abs(gapPct).toFixed(0)}% — enough to mis-rank your best campaigns.`,
        where: "Events Manager → Parameters",
      });
    }
  }

  /* 4 ── Click-through vs view-through conversions ───────────── */
  const viewThrough = data.kpis.purchasesView ?? 0;
  if (viewThrough > 0 && adsPurchases > 0) {
    const share = pctOf(viewThrough, adsPurchases);
    out.push({
      id: "view-through",
      severity: "info",
      title: `${pct(share, 1)} of your purchases came from views, not clicks`,
      summary: `${num(viewThrough)} of ${num(adsPurchases)} purchases were credited to people who saw an ad but never clicked. This is normal, but it inflates last-click reporting in your analytics tool.`,
      left: { label: "Click-through purchases", value: adsPurchases - viewThrough },
      right: { label: "View-through purchases", value: viewThrough },
      gap: viewThrough, gapPct: share,
      causes: [
        "Meta credits conversions for up to 1 day after an impression (1-day view).",
        "Last-click tools (GA4, CRM) attribute the same sale to direct, organic or email.",
      ],
      steps: [
        "Compare the 7-day-click figure against your analytics tool — that is the number most tools can reconcile.",
        "Use a consistent attribution model across reporting, and state it on every report.",
        "If you need to judge creative performance, read click-through only; view-through rewards reach, not persuasion.",
      ],
      impact: "Reported CPA differs from analytics CPA by the view-through share.",
      where: "Ads Manager → Columns → Attribution setting",
    });
  }

  /* 5 ── Leads with no ad attribution ────────────────────────── */
  if (data.leads.length > 10) {
    const attributed = data.leads.filter((l) => l.adId || l.campaignId).length;
    const unattributed = data.leads.length - attributed;
    const share = pctOf(unattributed, data.leads.length);
    if (share >= 3) {
      out.push({
        id: "unattributed-leads",
        severity: share >= 20 ? "warning" : "info",
        title: `${num(unattributed)} leads (${pct(share, 1)}) have no ad attribution`,
        summary: `These leads arrived through your forms without an ad or campaign attached — usually organic traffic, a QR code, an embedded form or an expired 90-day click window.`,
        left: { label: "Attributed to ads", value: attributed },
        right: { label: "Unattributed", value: unattributed },
        gap: unattributed, gapPct: share,
        causes: [
          "The form is embedded on a page that organic visitors also reach.",
          "Meta only attributes leads for 90 days after the last click.",
          "The visitor cleared cookies or switched device between click and submit.",
        ],
        steps: [
          "Add hidden fields to the form capturing fbclid / fbp / fbc and the landing URL, then match them in your CRM.",
          "Create a separate form (and pipeline) for organic enquiries so paid leads stay clean.",
          "Report cost per lead on attributed leads only, and show organic separately.",
        ],
        impact: `Cost per lead looks ${share >= 20 ? "worse" : "slightly worse"} than it is: ${money(safeDiv(data.kpis.spend, attributed))} on attributed leads vs ${money(safeDiv(data.kpis.spend, data.leads.length))} on all leads.`,
        where: "Leads centre → Filters",
      });
    }
  }

  /* 6 ── Leads you cannot contact ────────────────────────────── */
  if (data.leads.length > 10) {
    const unreachable = data.leads.filter((l) => !l.email && !l.phone).length;
    const share = pctOf(unreachable, data.leads.length);
    if (share >= 5) {
      out.push({
        id: "uncontactable-leads",
        severity: share >= 20 ? "warning" : "info",
        title: `${num(unreachable)} leads (${pct(share, 1)}) have neither email nor phone`,
        summary: `You paid for ${num(unreachable)} leads that no one can follow up with — worth about ${money(safeDiv(data.kpis.spend, data.leads.length) * unreachable)} of spend.`,
        left: { label: "Contactable leads", value: data.leads.length - unreachable },
        right: { label: "No contact details", value: unreachable },
        gap: unreachable, gapPct: share,
        causes: [
          "The form asks for too much and people abandon the optional contact fields.",
          "Phone/email fields are not marked as required in the instant form.",
          "Pre-filled fields failed because the person was not logged into Facebook.",
        ],
        steps: [
          "Mark email and phone as required in the instant form and let Meta pre-fill them.",
          "Keep the form to 3 questions or fewer; every extra field costs roughly 10–15% of submissions.",
          "Add a short qualifying question (budget or timeline) instead of long free-text fields.",
          "Turn on a CRM follow-up rule that flags leads with missing contact data within 5 minutes.",
        ],
        impact: `${money(safeDiv(data.kpis.spend, data.leads.length) * unreachable)} of spend produced no actionable contact.`,
        where: "Page → Instant forms",
      });
    }
  }

  /* 7 ── Clicks that never reached the landing page ───────────── */
  const clicks = data.kpis.clicks;
  const lpv = data.kpis.landingPageViews;
  if (clicks > 100 && lpv > 0) {
    const lost = clicks - lpv;
    const share = pctOf(lost, clicks);
    if (share >= 12) {
      out.push({
        id: "click-lpv-drop",
        severity: share >= 35 ? "warning" : "info",
        title: `${pct(share, 0)} of clicks never became a landing page view`,
        summary: `${num(clicks)} link clicks produced only ${num(lpv)} landing page views — ${num(lost)} sessions were lost between the click and the page firing.`,
        left: { label: "Link clicks", value: clicks },
        right: { label: "Landing page views", value: lpv },
        gap: lost, gapPct: share,
        causes: [
          "Slow page load: every second beyond 3s loses roughly 10–15% of mobile visitors.",
          "The pixel or consent banner blocks the page view from firing until it is accepted.",
          "Accidental clicks, bots and instant-article/ in-app browser sessions that close immediately.",
          "Redirect chains (ad URL → shortener → page) drop sessions on mobile.",
        ],
        steps: [
          "Test your landing page on a real 3G phone; target Largest Contentful Paint under 2.5s.",
          "Remove redirect hops — point the ad directly at the final URL.",
          "Fire the PageView without waiting for consent-banner acceptance where legally permitted.",
          "If you use an in-app browser-heavy placement (Audience Network), consider excluding it for conversion objectives.",
        ],
        impact: `Recovering even a third of these would add ~${num(lost * 0.33)} sessions and, at your current rate, ~${num(lost * 0.33 * safeDiv(data.kpis.leads, lpv))} more leads.`,
        where: "Ads Manager → Columns → Landing page views",
      });
    }
  }

  /* 8 ── PageView events vs paid landing page views ───────────── */
  if (pageViews > 0 && lpv > 0) {
    const organic = pageViews - lpv;
    const share = pctOf(organic, pageViews);
    if (share >= 15) {
      out.push({
        id: "organic-pixel-noise",
        severity: "info",
        title: `${pct(share, 0)} of PageView events are not from your ads`,
        summary: `The pixel saw ${num(pageViews)} page views while ads drove ${num(lpv)} landing page views, so ${num(organic)} views came from organic, direct, social or referral traffic.`,
        left: { label: "Paid landing page views", value: lpv },
        right: { label: "All pixel page views", value: pageViews },
        gap: organic, gapPct: share,
        causes: [
          "This is expected — the pixel counts every visitor, not only ad clicks.",
          "It becomes a problem only if you build audiences off PageView without filtering by source.",
        ],
        steps: [
          "Build retargeting audiences from specific events (ViewContent, AddToCart) rather than all PageView.",
          "When analysing funnel conversion rates, use ad clicks or LPV as the denominator, never raw PageView.",
        ],
        impact: "Funnel conversion rates look worse than they are when measured from raw PageView.",
        where: "Audiences",
      });
    }
  }

  /* 9 ── Event match quality ─────────────────────────────────── */
  const weak = (pixel?.events ?? []).filter(
    (e): e is typeof e & { matched: number } => typeof e.matched === "number" && e.matched < 88 && e.count > 0,
  );
  if (weak.length) {
    const worst = weak.sort((a, b) => a.matched - b.matched)[0];
    out.push({
      id: "match-quality",
      severity: "warning",
      title: `${weak.length} event${weak.length > 1 ? "s" : ""} have weak match quality — ${worst.event} at ${worst.matched}%`,
      summary: `Meta can only match ${worst.matched}% of ${worst.event} events to a person. Unmatched events cannot be attributed to an ad, so they never appear in your results.`,
      left: { label: "Matched events", value: Math.round((worst.count * worst.matched) / 100) },
      right: { label: "Unmatched events", value: worst.count - Math.round((worst.count * worst.matched) / 100) },
      gap: worst.count - Math.round((worst.count * worst.matched) / 100),
      gapPct: 100 - worst.matched,
      causes: [
        "Hashed email, phone or external_id are not being sent with the event.",
        "Advanced matching is disabled or only partially configured.",
        "Logged-out visitors and consent rejections reduce matchable identifiers.",
      ],
      steps: [
        "Turn on Automatic Advanced Matching in Events Manager → Data sources → Settings.",
        "Send at least email or phone (SHA-256 hashed) plus external_id with every event.",
        "Add fbp and fbc cookies to your server-side events; without them CAPI matching collapses.",
        "Aim for a match quality of 8/10 or better on Purchase and Lead — it is the single biggest lever on reported conversions.",
      ],
      impact: `Raising match quality from ${worst.matched}% to 95% would recover ~${num(worst.count * ((95 - worst.matched) / 100))} ${worst.event} events.`,
      where: "Events Manager → Match quality",
    });
  }

  /* 10 ── Pixel diagnostics that are not passing ──────────────── */
  const failing = (pixel?.diagnostics ?? []).filter((d) => d.status !== "pass");
  for (const d of failing.slice(0, 3)) {
    out.push({
      id: `diag-${d.id}`,
      severity: d.status === "fail" ? "critical" : "warning",
      title: d.title,
      summary: d.detail,
      left: { label: "Checks passing", value: (pixel?.diagnostics.length ?? 0) - failing.length },
      right: { label: "Checks failing", value: failing.length },
      gap: failing.length,
      gapPct: pctOf(failing.length, pixel?.diagnostics.length || 1),
      causes: [d.detail],
      steps: stepsForDiagnostic(d),
      impact: d.status === "fail" ? "Failed checks directly break conversion tracking." : "Warnings reduce the signal Meta can optimise on.",
      where: "Events Manager → Diagnostics",
    });
  }

  /* 11 ── Frequency / reach saturation ────────────────────────── */
  if (data.kpis.frequency >= 3 && data.kpis.reach > 0) {
    const wastedImpressions = data.kpis.impressions - data.kpis.reach * 2;
    out.push({
      id: "frequency-saturation",
      severity: data.kpis.frequency >= 5 ? "warning" : "info",
      title: `Average frequency is ${data.kpis.frequency.toFixed(2)} — ${num(Math.max(0, wastedImpressions))} impressions beyond the second view`,
      summary: `You reached ${num(data.kpis.reach)} people ${data.kpis.frequency.toFixed(1)} times each. Impressions beyond roughly the second view rarely add incremental conversions.`,
      left: { label: "People reached", value: data.kpis.reach },
      right: { label: "Total impressions", value: data.kpis.impressions },
      gap: Math.max(0, wastedImpressions),
      gapPct: pctOf(Math.max(0, wastedImpressions), data.kpis.impressions),
      causes: [
        "The audience is too small for the budget you are spending.",
        "Creative has not been refreshed, so the same people keep seeing the same ad.",
        "Multiple ad sets target overlapping audiences and bid against each other.",
      ],
      steps: [
        "Widen age or geography, or add a lookalike to grow the addressable audience.",
        "Refresh creative every 10–14 days for campaigns running above 2.5 frequency.",
        "Consolidate overlapping ad sets so you stop competing with yourself in the auction.",
        "Cap frequency on awareness campaigns where it is not already capped.",
      ],
      impact: `About ${money(safeDiv(data.kpis.spend, data.kpis.impressions) * Math.max(0, wastedImpressions))} of spend went to impressions past the second view.`,
      where: "Ads Manager → Delivery insights",
    });
  }

  return out.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity] || Math.abs(b.gapPct) - Math.abs(a.gapPct);
  });
}

export function stepsForDiagnostic(d: PixelDiagnostic): string[] {
  const title = d.title.toLowerCase();
  if (title.includes("dedup")) {
    return [
      "Generate one event_id per conversion and use the identical value for the browser and server event.",
      "Send the server event within 72 hours of the browser event so deduplication can still apply.",
      "Watch Events Manager → Diagnostics → Event match & deduplication until the mismatch rate drops below 2%.",
    ];
  }
  if (title.includes("conversions api") || title.includes("capi")) {
    return [
      "Deploy the Conversions API via your platform's integration or a server-side GTM container.",
      "Start with Purchase and Lead, then add InitiateCheckout and ViewContent.",
      "Send fbp, fbc, client_ip_address and client_user_agent to maximise match quality.",
    ];
  }
  if (title.includes("aggregated")) {
    return [
      "Verify your domain under Business settings → Brand safety → Domains.",
      "Configure 8 web events and rank Purchase or Lead as the highest priority.",
    ];
  }
  if (title.includes("advanced matching") || title.includes("match")) {
    return [
      "Enable Automatic Advanced Matching in the pixel settings.",
      "Manually pass hashed email, phone, first name, last name, city and external_id.",
    ];
  }
  if (title.includes("firing") || title.includes("stale")) {
    return [
      "Use the Meta Pixel Helper browser extension to confirm the base code fires on every page.",
      "Check whether a consent banner or tag manager update broke the snippet.",
      "Re-run a test event and confirm it appears within a few minutes.",
    ];
  }
  if (title.includes("value") || title.includes("currency")) {
    return [
      "Add value and currency parameters to every Purchase event.",
      "Reconcile the pixel value against orders in your store admin for the same day.",
    ];
  }
  return [
    "Open Events Manager → Data sources → Diagnostics and follow the guided fix for this check.",
    "Re-run the Test Events tool after each change and confirm the check turns green.",
  ];
}

export function discrepancyTotal(data: ReportData, list: Discrepancy[]) {
  const spend = data.kpis.spend || 1;
  const recoverable = list.reduce((acc, d) => {
    if (d.id === "click-lpv-drop") return acc + safeDiv(data.kpis.spend, data.kpis.impressions || 1) * 0;
    if (d.id === "uncontactable-leads") return acc + safeDiv(data.kpis.spend, data.leads.length || 1) * d.gap;
    if (d.id === "frequency-saturation") return acc + safeDiv(spend, data.kpis.impressions || 1) * Math.max(0, d.gap) * 0.25;
    return acc;
  }, 0);
  return { recoverable, share: pctOf(recoverable, spend) };
}
