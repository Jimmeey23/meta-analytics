import { NextResponse } from "next/server";
import { loadReport } from "@/lib/data";
import { resolveVideoSource } from "@/lib/live";
import { safeMediaUrl, facebookUrl } from "@/lib/creative";

export const dynamic = "force-dynamic";

/** Never accept an arbitrary Graph ID or URL from the browser. Resolve only a
 * video belonging to an ad in the signed-in user's selected account/report. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const adId = url.searchParams.get("ad");
  const videoId = url.searchParams.get("video");
  if (!adId || !videoId || adId.length > 100 || videoId.length > 100) {
    return NextResponse.json({ error: "Invalid creative request." }, { status: 400 });
  }
  try {
    const { data, session } = await loadReport({
      accountId: url.searchParams.get("account") ?? undefined,
      rangeKey: url.searchParams.get("range") ?? undefined,
      since: url.searchParams.get("since") ?? undefined,
      until: url.searchParams.get("until") ?? undefined,
    });
    const ad = data.ads.find((row) => row.id === adId);
    const ids = ad?.creative?.videoIds ?? (ad?.creative?.videoId ? [ad.creative.videoId] : []);
    if (!ad || !ids.includes(videoId)) return NextResponse.json({ error: "Creative not found in this account and period." }, { status: 404 });
    if (data.mode === "demo") {
      return NextResponse.json({ source: "/media/demo-creative.mp4", demo: true }, { headers: { "Cache-Control": "private, max-age=300" } });
    }
    const node = await resolveVideoSource(session!.accessToken, videoId);
    const source = safeMediaUrl(node.source);
    if (!source) throw new Error("No playable video source returned.");
    return NextResponse.json({ source, poster: safeMediaUrl(node.picture), permalink: facebookUrl(node.permalink_url) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "This video is unavailable or Meta permissions have changed. Try again or open the original post." }, { status: 502 });
  }
}
