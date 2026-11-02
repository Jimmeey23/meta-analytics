import { NextResponse } from "next/server";
import { clearReportCache, getSession } from "@/lib/data";
import { isSameOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  clearReportCache(await getSession());
  return NextResponse.redirect(new URL("/settings?cleared=1", request.url));
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  clearReportCache(await getSession());
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
