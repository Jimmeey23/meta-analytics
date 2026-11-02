import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deterministic PRNG so demo data is stable between server renders. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

/** Keep expensive edge fan-out bounded while preserving result order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

export function avg(arr: number[]) {
  return arr.length ? sum(arr) / arr.length : 0;
}

export function safeDiv(a: number, b: number, fallback = 0) {
  return b === 0 || !isFinite(b) ? fallback : a / b;
}

export function pctChange(current: number, previous: number) {
  if (!previous) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

export function movingAverage(values: number[], window = 7) {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return sum(slice) / slice.length;
  });
}

export function linearTrend(values: number[]) {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const mx = avg(xs);
  const my = avg(values);
  const num = sum(xs.map((x, i) => (x - mx) * (values[i] - my)));
  const den = sum(xs.map((x) => (x - mx) ** 2)) || 1;
  return (num / den) * n; // total change across the window
}

export function titleCase(s: string) {
  return s
    .replace(/[_.]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Derive a P57 studio from the naming convention used on Meta entities. */
export function inferStudioLocation(...values: Array<string | undefined | null>) {
  const value = values.filter(Boolean).join(" ").toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\b(bandra|bdra)\b/i, "Bandra"],
    [/\b(kemps(?:\s+corner)?|kc)\b/i, "Kemps Corner"],
    [/\b(bengaluru|bangalore|blr)\b/i, "Bengaluru"],
    [/\b(mumbai|bom)\b/i, "Mumbai — multi-studio"],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? "Unassigned";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Strips credentials out of text that reaches the UI or a log.
 *
 * Meta echoes the offending value back in some errors ("Malformed access
 * token EAAG..."), so an unfiltered warning would render the token on the
 * page. Long opaque tokens, `access_token=` query values and app secrets
 * are replaced with a marker.
 */
export function redactSecrets(text: string) {
  return text
    .replace(/(access_token|client_secret|appsecret_proof)=[^&\s]+/gi, "$1=[redacted]")
    .replace(/\bEAA[A-Za-z0-9_-]{8,}/g, "[redacted token]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}
