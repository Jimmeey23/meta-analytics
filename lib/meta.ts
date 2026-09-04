import "server-only";
import crypto from "node:crypto";

export const SCOPES = [
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "leads_retrieval",
].join(",");

export type Session = {
  accessToken: string;
  userId: string;
  userName: string;
  picture?: string;
  issuedAt: number;
  expiresAt: number;
  scopes?: string;
  accountId?: string;
};

const PLACEHOLDERS = ["your_app_id", "your_app_secret", "changeme", "xxxx", "000000", ""];

export function metaConfig() {
  const appId = process.env.META_APP_ID?.trim() || "";
  const appSecret = process.env.META_APP_SECRET?.trim() || "";
  const redirectUri = process.env.META_REDIRECT_URI?.trim() || "http://localhost:3000/api/meta/callback";
  const version = process.env.META_API_VERSION?.trim() || "v23.0";
  return {
    appId,
    appSecret,
    redirectUri,
    version,
    configured: Boolean(appId && appSecret) && !PLACEHOLDERS.some((p) => p && (appId.toLowerCase().includes(p) || appSecret.toLowerCase().includes(p))),
    forceDemo: process.env.FORCE_DEMO === "1",
  };
}

export const COOKIE_NAME = "mi_session";

function secret() {
  return process.env.SESSION_SECRET?.trim() || "meta-insight-dev-secret-change-me";
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function encodeSession(session: Session) {
  const payload = b64url(JSON.stringify(session));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function decodeSession(value?: string | null): Session | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (expected.length !== sig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (!session?.accessToken) return null;
    return session;
  } catch {
    return null;
  }
}

export function buildAuthUrl(state: string) {
  const { appId, redirectUri, version } = metaConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: SCOPES,
    auth_type: "rerequest",
  });
  return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
}

/* ─────────────────────────── Graph API ─────────────────────────── */

export class MetaError extends Error {
  code?: number;
  status?: number;
  constructor(message: string, code?: number, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path: string, params: Record<string, unknown>, token?: string, version?: string) {
  const { version: v } = metaConfig();
  const url = new URL(`https://graph.facebook.com/${version || v}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  // The token travels in the Authorization header, never the query string:
  // a URL ends up in proxy logs, error messages and Next's dev overlay.
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers, cache: "no-store" });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    throw new MetaError(`Invalid response from Meta (${res.status})`, undefined, res.status);
  }
  if (!res.ok || json?.error) {
    const err = json?.error;
    const message = err?.message || `Meta API error ${res.status}`;
    throw new MetaError(message, err?.code, res.status);
  }
  return json;
}

export async function exchangeCode(code: string) {
  const { appId, appSecret, redirectUri } = metaConfig();
  const short = await request(
    "oauth/access_token",
    { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
  );
  if (!short?.access_token) throw new MetaError("No access token returned by Meta");
  let long = short;
  try {
    long = await request("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: short.access_token,
    });
  } catch {
    /* long-lived exchange is best-effort */
  }
  return {
    accessToken: long.access_token as string,
    expiresIn: (long.expires_in as number) ?? 0,
  };
}

export async function getTokenInfo(token: string) {
  return request("debug_token", { input_token: token }, token);
}

export async function getMe(token: string) {
  return request("me", { fields: "id,name,picture.width(120).height(120)" }, token);
}

export async function getAccounts(token: string) {
  const json = await request(
    "me/adaccounts",
    {
      fields: "id,name,account_id,currency,timezone_name,business_name,account_status,amount_spent,disable_reason",
      limit: 300,
    },
    token,
  );
  return (json?.data ?? []) as any[];
}

export async function getInsights(
  token: string,
  accountId: string,
  params: Record<string, unknown>,
) {
  const json = await request(`${accountId}/insights`, params, token);
  return (json?.data ?? []) as any[];
}

export async function getEdge(token: string, parent: string, edge: string, params: Record<string, unknown>) {
  const json = await request(`${parent}/${edge}`, params, token);
  return (json?.data ?? []) as any[];
}

/** Meta codes meaning "the response you asked for is too big to build". */
const TOO_MUCH_DATA = new Set([1, 2, 4, 17, 613]);

function isTooMuchData(err: unknown) {
  if (!(err instanceof MetaError)) return false;
  return (
    (err.code !== undefined && TOO_MUCH_DATA.has(err.code)) ||
    /reduce the amount of data/i.test(err.message)
  );
}

/**
 * Reads an edge across pages, shrinking the page size whenever Meta
 * complains that the requested payload is too large.
 *
 * `limit` is the starting page size, halved down to `minLimit` on each
 * "reduce the amount of data" error. `max` caps the total rows returned
 * and `maxPages` caps the number of round trips.
 */
export async function getEdgePaged(
  token: string,
  parent: string,
  edge: string,
  params: Record<string, unknown>,
  opts: { limit?: number; minLimit?: number; max?: number; maxPages?: number } = {},
) {
  const { minLimit = 5, max = 2000, maxPages = 25 } = opts;
  let limit = opts.limit ?? 50;
  const rows: any[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages && rows.length < max; page++) {
    let json: any;
    try {
      json = await request(`${parent}/${edge}`, { ...params, limit, after }, token);
    } catch (err) {
      if (isTooMuchData(err) && limit > minLimit) {
        limit = Math.max(minLimit, Math.floor(limit / 2));
        page--; // retry this same page with a smaller window
        continue;
      }
      // Partial data beats none: surface what we already have.
      if (rows.length) return rows.slice(0, max);
      throw err;
    }
    rows.push(...((json?.data ?? []) as any[]));
    after = json?.paging?.cursors?.after;
    if (!json?.paging?.next || !after) break;
  }
  return rows.slice(0, max);
}

export { request as graphRequest };
