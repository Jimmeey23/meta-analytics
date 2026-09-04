# MetaInsight — Meta Ads Intelligence Suite

A modern, full-stack reporting app for Meta (Facebook/Instagram) ad accounts. Connect an ad account with
OAuth and get advanced reporting in seconds — performance trends, campaign/ad-set/ad drill-downs,
audience and placement intelligence, captured leads, pixel diagnostics, and a prioritised action list.

Built with **Next.js 15 (App Router) · React 19 · Tailwind CSS · Recharts · Meta Marketing API**.

> Not affiliated with, endorsed by or sponsored by Meta Platforms, Inc.

---

## ✨ Features

| Surface | What you get |
|---|---|
| **Overview** | Spend, conversions, cost per conversion, ROAS, CTR, CPM with period-over-period deltas and 14-day sparklines; **executive summary** written from the data; interactive trend explorer with 11 metrics and previous-period comparison; account health score; delivery funnel; **budget pacing & month-end projection** |
| **Campaigns** | Expandable campaign → ad set → ad hierarchy with search, status filters, sortable columns, quality/engagement/conversion rankings, creative headlines, spend-vs-CPA bubble map, objective mix |
| **Audience** | Age × gender stacked spend, platform & device donuts, placement and region breakdowns, best/worst segments, day × hour heat map for ad scheduling, weekday efficiency |
| **Leads** | Every instant-form and pixel lead with contact details, source campaign/ad, intent scoring, per-form analytics, capture funnel, leads by campaign/city/hour, CSV export |
| **Pixel & events** | Pixel ID, last-fire time, event volumes with 14-day trends and match quality, step-to-step conversion rates, automated diagnostics, copyable base code, setup guide |
| **Insights** | Rule-based recommendations (creative fatigue, budget reallocation, scaling, CPM pressure, dayparting, audience saturation, lead quality, pixel health, tracking gaps) with expected impact and a concrete action for each |
| **Global** | Dark/light/system themes, date-range presets + custom ranges, multi-account switcher, CSV export of the entire report, print/PDF-ready layout, server-side API caching, skeleton loading states and error boundaries |

### Executive summary

`lib/summary.ts` turns the report into prose: a headline sentence ("Spend rose 13% to ₹638.5K while
conversions moved up 16% to 1,140 — cost per conversion improved to ₹559.9 at 1.92× ROAS, led by …"),
supporting paragraphs (delivery momentum, top campaign, cheapest segment, channel mix, lead volume,
tracking health), a highlights strip, a risks list and three prioritised next steps. It can be copied as
plain text or printed.

### Budget pacing & projection

Compares each active campaign's daily budget (lifetime budgets are amortised across their flight dates)
with actual average daily delivery, flags under/over-pacing, and projects month-end spend against the
implied monthly budget.

### A note on metrics

Meta's account-level "Results" mixes objectives (impressions for awareness, clicks for traffic), so the
dashboard reports **Conversions** (leads + purchases) and **Cost per conversion** as the headline
efficiency numbers, while per-campaign tables keep each campaign's objective-specific result. Both are
exported to CSV.

**Demo mode** ships enabled: without credentials the app runs on a rich, deterministic sample account
(9 campaigns, 24 ad sets, 60+ ads, 300+ leads, full pixel diagnostics) so every screen is explorable.

---

## 🚀 Quick start

```bash
npm install
cp .env.example .env.local     # optional — demo mode works without it
npm run dev                    # http://localhost:3000
```

> **Note for sandboxed/workspace environments:** `node_modules/` and `.next/` are build artefacts and may
> not be preserved. If the app doesn't start, re-run `npm install` (and `npm run build` for production)
> before `npm start`.

Production:

```bash
npm run build
npm start
```

---

## 🔌 Connecting your Meta account

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App** → type **Business**.
2. Add the **Marketing API** product and note the **App ID** and **App Secret**.
3. Go to **Products → Facebook Login → Settings** and add this **Valid OAuth Redirect URI**:
   ```
   http://localhost:3000/api/meta/callback
   ```
   For a deployed app use `https://your-domain.com/api/meta/callback` — it must match **exactly**.
4. Put the values in `.env.local` (see `.env.example`):
   ```env
   META_APP_ID=1234567890123456
   META_APP_SECRET=abcdef1234567890abcdef1234567890
   META_REDIRECT_URI=http://localhost:3000/api/meta/callback
   META_API_VERSION=v23.0
   SESSION_SECRET=a-long-random-string-of-your-own
   FORCE_DEMO=0
   ```
5. Restart the server, open **Settings → Connect Meta account**.

### Permissions requested (all read-only)

`ads_read`, `read_insights`, `business_management`, `pages_show_list`, `pages_read_engagement`,
`pages_read_user_content`, `leads_retrieval`.

Nothing is ever created, edited or deleted in your ad account.

### If Meta shows "App Not Set Up"

Switch the app from **Development** to **Live** mode, or add yourself as a tester under **App Roles → Test Users**.

---

## 🧱 Project structure

```
app/
  page.tsx                     Marketing/landing page
  (app)/                       Authenticated app shell (sidebar + topbar)
    dashboard/ campaigns/ audience/ leads/ pixel/ insights/ settings/
  api/
    meta/login/                Starts the OAuth flow
    meta/callback/             Code → short token → long-lived token → signed cookie
    meta/logout/               Disconnect
    export/                    Full CSV export of the current report
    cache/                     Clear the in-memory API cache
components/
  charts/                      Recharts wrappers (trend, donut, stacked bar, funnel, scatter, heat map)
  panels/                      KPI grid, trend explorer, campaign explorer, leads, pixel, insights
  shell/                       Sidebar, topbar, theme toggle, providers
  ui/primitives.tsx            Panel, Badge, Delta, Sparkline, ScoreGauge, Avatar, Callout …
lib/
  meta.ts                      OAuth + Graph API client, signed session cookie
  live.ts                      Builds a full report from the Marketing API (parallel, fault-tolerant)
  demo.ts                      Deterministic sample-data engine
  metrics.ts                   Action-type → metric mapping, KPI derivation, breakdown parsing
  insights.ts                  15 recommendation rules + health score
  data.ts                      Orchestration, 5-minute cache, session/account resolution
  ranges.ts                    Date-range presets and previous-period maths
```

---

## ⚙️ How it works

- **Auth** — `/api/meta/login` redirects to the Facebook OAuth dialog with a random `state` stored in a
  short-lived cookie. `/api/meta/callback` verifies `state`, exchanges the code, upgrades to a long-lived
  token, and stores `{ token, user, expiry }` in an HMAC-signed **httpOnly** cookie.
- **Data** — `loadReport()` resolves the session, account and date range, then either builds a live report
  (≈16 parallel Graph API calls, each individually fault-tolerant — a failure degrades to a warning rather
  than breaking the page) or a deterministic demo report. Live responses are cached in memory for 5 minutes
  to stay well inside Meta's rate limits.
- **Metrics** — Meta returns generic `actions[]` arrays, so `lib/metrics.ts` maps action types to
  objective-aware results (`onsite_conversion.lead_grouped` → Leads, `purchase` → Purchases,
  `link_click` → Link clicks …) and derives CTR, CPC, CPM, frequency, ROAS and cost per result consistently
  across every surface.
- **Insights** — `lib/insights.ts` runs 15 deterministic rules over the loaded report. Each rule emits a
  severity, an explanation, an expected impact and one concrete action.

---

## 📤 Export

**Export** in the top bar (or `GET /api/export?range=last_30d&account=act_…`) streams a CSV containing key
metrics, daily series, campaigns, ad sets, ads, every breakdown, all leads, pixel events and diagnostics.

---

## 🛠 Troubleshooting

| Symptom | Fix |
|---|---|
| "Invalid redirect URI" | The URI in `.env.local` must match the one in Facebook Login settings byte-for-byte |
| No ad accounts listed | The logged-in user needs at least read access to an ad account in Business Manager |
| Charts empty | No delivery in the selected range — widen the date range |
| Leads missing | Reconnect and accept `pages_show_list`, `pages_read_engagement`, `leads_retrieval` |
| Pixel section empty | Share a pixel with the ad account in Events Manager |
| Old data showing | Settings → **Clear API cache** (5-minute TTL) |

Set `FORCE_DEMO=1` in `.env.local` to keep the app on sample data even while connected — handy for demos.
