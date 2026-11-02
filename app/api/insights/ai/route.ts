import { NextResponse } from "next/server";
import { loadReport, getSession } from "@/lib/data";
import { analyzeReport } from "@/lib/analytics";
import { aiConfig, aiRateLimitKey, cachedAiBrief } from "@/lib/ai";
import { isSameOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin AI requests are not allowed." }, { status: 403 });
  const config = aiConfig();
  if (!config.configured) return NextResponse.json({ error: "Add AI_API_KEY and AI_MODEL in the server environment to enable AI synthesis. The evidence-backed analysis works without AI." }, { status: 503 });
  const session = await getSession();
  if (!session && !config.allowDemo) return NextResponse.json({ error: "Connect a Meta account before using AI, or explicitly set AI_ALLOW_DEMO=1 for a controlled demo." }, { status: 401 });
  try {
    // Never accept a report payload from the client: reload it under the
    // server session and account allow-list, then send only whitelisted context.
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    let body: Record<string, unknown>;
    try { body = raw ? JSON.parse(raw) : {}; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    if (body.consent !== true) return NextResponse.json({ error: "Explicit consent is required before sending analytics context to the AI provider." }, { status: 400 });
    const { data } = await loadReport({
      accountId: typeof body.account === "string" ? body.account : undefined,
      rangeKey: typeof body.range === "string" ? body.range : undefined,
      since: typeof body.since === "string" ? body.since : undefined,
      until: typeof body.until === "string" ? body.until : undefined,
      session,
    });
    if (data.mode === "demo" && !config.allowDemo) return NextResponse.json({ error: "AI demo mode is disabled. Connect a live account." }, { status: 403 });
    const brief = await cachedAiBrief(data, analyzeReport(data), aiRateLimitKey(session?.accessToken ?? "shared-demo"));
    return NextResponse.json(brief, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "AI_LIMIT") return NextResponse.json({ error: "AI request limit reached. Try again in 10 minutes." }, { status: 429 });
    // Do not return provider bodies: they can contain credentials or prompt data.
    return NextResponse.json({ error: "AI synthesis is temporarily unavailable. Your deterministic evidence and recommendations remain available below." }, { status: 502 });
  }
}
