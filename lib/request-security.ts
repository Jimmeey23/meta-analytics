/** CSRF protection for cookie-authenticated, billable mutations. */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  // Some privacy/proxy setups omit Origin on same-origin fetches. Fetch
  // Metadata and the browser-controlled Referer are safe fallbacks; a
  // cross-site page cannot set either to the target origin.
  if (!origin && site === "same-origin") return true;
  if (!origin && !referer) return false;
  try {
    const actual = new URL(origin || referer!);
    const expected = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    return actual.host === (forwardedHost || expected.host)
      && actual.protocol === `${forwardedProto || expected.protocol.replace(":", "")}:`;
  } catch { return false; }
}
