import "server-only";
import { cookies } from "next/headers";
import { cache as requestCache } from "react";
import crypto from "node:crypto";
import { ReportCache } from "./report-cache";
import type { Account, Mode, Range, ReportData } from "./types";
import { COOKIE_NAME, decodeSession, type Session } from "./meta";
import { metaConfig } from "./meta";
import { buildDemoData, DEMO_ACCOUNTS } from "./demo";
import { buildLiveData } from "./live";
import { resolveRange } from "./ranges";
import { getAccounts } from "./meta";
import { redactSecrets, safeDiv, sum } from "./utils";

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_NAMES_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get(COOKIE_NAME)?.value);
}

export function isDemo(session: Session | null) {
  return !session?.accessToken || metaConfig().forceDemo;
}

export type AccountResolution = {
  accounts: Account[];
  /** True only when `accounts` are the signed-in user's real ad accounts. */
  live: boolean;
  /** Why live accounts are unavailable, already redacted for display. */
  reason?: string;
};

/**
 * Resolves which ad accounts to report on.
 *
 * Falling back to the demo accounts while still holding a live token used to
 * mean every downstream request ran against a fabricated account id, so the
 * app claimed "live" and then failed every dataset. `live` now says whether
 * the accounts are real, and the caller serves demo data when they are not.
 */
export const resolveAccounts = requestCache(async (session: Session | null): Promise<AccountResolution> => {
  if (!session?.accessToken) return { accounts: DEMO_ACCOUNTS, live: false };
  if (metaConfig().forceDemo) return { accounts: DEMO_ACCOUNTS, live: false, reason: "FORCE_DEMO is set to 1." };
  try {
    const rows = await getAccounts(session.accessToken);
    const accounts: Account[] = rows.map((r) => ({
      id: r.id ?? `act_${r.account_id}`,
      name: r.name ?? "Ad account",
      currency: r.currency ?? "USD",
      timezone: r.timezone_name ?? "UTC",
      status: Number(r.account_status ?? 1),
      amountSpent: Number(r.amount_spent ?? 0) / 100,
      businessName: r.business_name,
    }));
    if (!accounts.length) {
      return {
        accounts: DEMO_ACCOUNTS,
        live: false,
        reason: "This Meta user has no ad accounts, or none were shared with the app.",
      };
    }
    return { accounts, live: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { accounts: DEMO_ACCOUNTS, live: false, reason: redactSecrets(message) };
  }
});

export async function listAccounts(session: Session | null): Promise<Account[]> {
  return (await resolveAccounts(session)).accounts;
}

/** The mode the UI should advertise — "live" only when real accounts resolved. */
export async function resolveMode(session: Session | null): Promise<Mode> {
  return (await resolveAccounts(session)).live ? "live" : "demo";
}

/** Fill in derived fields that both modes share (weekday aggregation). */
function finalize(data: ReportData): ReportData {
  if (!data.weekday?.length) {
    const buckets = DAY_NAMES_SHORT.map((day) => ({ day, spend: 0, results: 0, cpa: 0 }));
    for (const point of data.series) {
      const idx = new Date(`${point.date}T00:00:00Z`).getUTCDay();
      buckets[idx].spend += point.spend;
      buckets[idx].results += point.results;
    }
    buckets.forEach((b) => (b.cpa = safeDiv(b.spend, b.results)));
    data.weekday = buckets;
  }
  return data;
}

const reportCache = new ReportCache<ReportData>({ ttlMs: 5 * 60 * 1000, staleMs: 25 * 60 * 1000, maxEntries: 24 });
const demoCache = new ReportCache<ReportData>({ ttlMs: 5 * 60 * 1000, maxEntries: 12 });
const scopeFor = (token: string) => crypto.createHash("sha256").update(token).digest("hex").slice(0, 20);

export type ReportOptions = {
  rangeKey?: string;
  since?: string;
  until?: string;
  accountId?: string;
  session?: Session | null;
};

export async function loadReport(opts: ReportOptions = {}): Promise<{ data: ReportData; accounts: Account[]; session: Session | null; range: Range }> {
  const session = opts.session !== undefined ? opts.session : await getSession();
  const range = resolveRange(opts.rangeKey, opts.since, opts.until);
  const { accounts, live, reason } = await resolveAccounts(session);
  const accountId = opts.accountId && accounts.some((a) => a.id === opts.accountId) ? opts.accountId : accounts[0]?.id ?? DEMO_ACCOUNTS[0].id;
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0] ?? DEMO_ACCOUNTS[0];

  if (!live) {
    const key = `${accountId}:${range.since}:${range.until}`;
    const cached = await demoCache.read(key, async () => finalize(buildDemoData(accountId, range, account.name)));
    // Do not mutate the shared cached report when adding a session-specific warning.
    const data = session?.accessToken && reason
      ? { ...cached, warnings: [`Meta account: ${reason} Showing sample data instead.`, ...cached.warnings] }
      : cached;
    return { data, accounts, session, range };
  }

  const scope = scopeFor(session!.accessToken);
  const key = `${scope}:${accountId}:${range.since}:${range.until}`;
  const data = await reportCache.read(key, async () => {
    const report = finalize(await buildLiveData(session!.accessToken, account, range));
    // buildLiveData deliberately degrades individual edges. If every core
    // delivery edge failed, don't cache that empty report as a healthy zero.
    if (!report.series.length && !report.campaigns.length && report.warnings.some((w) => /insights:/i.test(w))) {
      throw new Error("Meta delivery data is temporarily unavailable. Please retry shortly.");
    }
    return report;
  });
  return { data, accounts, session, range };
}

export function clearReportCache(session?: Session | null) {
  demoCache.clear();
  reportCache.clear(session?.accessToken ? scopeFor(session.accessToken) : "");
}

export { DAY_NAMES_SHORT, DAY_NAMES_LONG };
