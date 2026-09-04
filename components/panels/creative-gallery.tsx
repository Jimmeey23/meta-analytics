"use client";
import * as React from "react";
import {
  Image as ImageIcon, Maximize2, MousePointerClick, Play, Search,
} from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { useDrilldown } from "./drilldown-context";
import { currency, num, pct, rankingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdRow, Kpis } from "@/lib/types";

function mediaType(ad: AdRow) {
  return ad.creative?.videoId || ad.creative?.videoUrl || /video|reel/i.test(ad.creative?.format ?? "")
    ? "Video" : "Image";
}

/**
 * Creative preview that plays the real video on hover when Meta returned a
 * playable source, and otherwise shows the thumbnail or the ad copy.
 *
 * `hovered` is driven by the card so the whole tile is the hover target; the
 * video stays muted and control-less because it sits inside the card button.
 */
function CreativePreview({ ad, hovered }: { ad: AdRow; hovered: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = React.useState(false);
  const src = ad.creative?.videoUrl;
  const poster = ad.creative?.thumbnail ?? ad.creative?.imageUrl;
  const playable = Boolean(src) && !failed;

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !playable) return;
    if (hovered) {
      el.play().catch(() => {/* autoplay refused — poster stays visible */});
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [hovered, playable]);

  if (playable) {
    return (
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }
  if (poster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={poster}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }
  return (
    <div className="grid h-full w-full place-items-center p-5 text-center">
      <div>
        <p className="text-[15px] font-semibold leading-snug text-ink">{ad.creative?.title ?? ad.name}</p>
        <p className="mt-2 line-clamp-3 text-[11px] text-muted">{ad.creative?.body}</p>
      </div>
    </div>
  );
}

export function CreativeGallery({
  ads, code, account, limit = 12, className,
}: {
  ads: AdRow[];
  code: string;
  account: Kpis;
  limit?: number;
  className?: string;
}) {
  const { open } = useDrilldown();
  const [query, setQuery] = React.useState("");
  const [format, setFormat] = React.useState("All");
  const [studio, setStudio] = React.useState("All studios");
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const items = React.useMemo(
    () => ads.filter((a) => a.spend > 0 || a.impressions > 0),
    [ads],
  );
  const studios = React.useMemo(
    () => ["All studios", ...new Set(items.map((a) => a.location ?? "Unassigned"))],
    [items],
  );
  const formats = React.useMemo(
    () => ["All", ...new Set(items.map(mediaType))],
    [items],
  );

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((ad) => {
      const haystack = `${ad.name} ${ad.adSetName} ${ad.creative?.title ?? ""} ${ad.creative?.body ?? ""}`.toLowerCase();
      return (!q || haystack.includes(q))
        && (format === "All" || mediaType(ad) === format)
        && (studio === "All studios" || (ad.location ?? "Unassigned") === studio);
    }).slice(0, limit);
  }, [items, query, format, studio, limit]);

  const filters = (
    <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
      <label className="relative min-w-[200px] flex-1">
        <span className="sr-only">Search creatives</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creative, ad or ad set"
          className="h-10 w-full rounded-xl border border-line bg-bg pl-9 pr-3 text-sm outline-none focus:border-brand-500"
        />
      </label>
      <select
        aria-label="Creative format"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="h-10 rounded-xl border border-line bg-bg px-3 text-xs outline-none focus:border-brand-500"
      >
        {formats.map((item) => <option key={item}>{item}</option>)}
      </select>
      {studios.length > 2 ? (
        <select
          aria-label="Studio location"
          value={studio}
          onChange={(e) => setStudio(e.target.value)}
          className="h-10 rounded-xl border border-line bg-bg px-3 text-xs outline-none focus:border-brand-500"
        >
          {studios.map((item) => <option key={item}>{item}</option>)}
        </select>
      ) : null}
    </div>
  );

  if (!items.length) {
    return (
      <p className="px-5 py-10 text-center text-xs text-muted">No creatives with delivery in this period.</p>
    );
  }

  return (
    <div className="pb-1">
      {filters}
      {!visible.length ? (
        <div className="px-5 py-8">
          <EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No creatives match these filters" />
        </div>
      ) : (
        <div className={cn("grid gap-4 px-5 pb-5 pt-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
          {visible.map((ad) => {
            const conv = (ad.leads ?? 0) + (ad.purchases ?? 0);
            const siblings = ads.filter((s) => s.adSetId === ad.adSetId && s.id !== ad.id);
            const isVideo = mediaType(ad) === "Video";
            const hovered = hoveredId === ad.id;
            return (
              <div
                key={ad.id}
                className="group relative z-0 hover:z-30"
                onMouseEnter={() => setHoveredId(ad.id)}
                onMouseLeave={() => setHoveredId((id) => (id === ad.id ? null : id))}
                onFocus={() => setHoveredId(ad.id)}
                onBlur={() => setHoveredId((id) => (id === ad.id ? null : id))}
              >
                <button
                  onClick={() => open({ kind: "creative", payload: { ad, code, account, siblings } })}
                  className="block w-full text-left"
                >
                  <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface transition-all duration-300 group-hover:-translate-y-1 group-hover:border-brand-500/40 group-hover:shadow-lift">
                    {/* preview */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-brand-500/25 via-accent/20 to-accent-2/20">
                      <CreativePreview ad={ad} hovered={hovered} />
                      <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
                        {ad.creative?.format ?? (isVideo ? "Video" : "Image")}
                      </span>
                      {isVideo ? (
                        <span className={cn(
                          "absolute inset-0 grid place-items-center transition-opacity duration-300",
                          hovered && ad.creative?.videoUrl ? "opacity-0" : "opacity-100",
                        )}>
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white">
                            <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                          </span>
                        </span>
                      ) : null}
                      <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-black/45 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                        <Maximize2 className="h-3.5 w-3.5" />
                      </span>

                      {/* hover overlay — expands with the full metric set */}
                      <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/80 p-3 backdrop-blur transition-transform duration-300 group-hover:translate-y-0">
                        <div className="grid grid-cols-3 gap-2 text-[10px] text-white">
                          {[
                            ["Spend", currency(ad.spend, code, { compact: true })],
                            ["Impr.", num(ad.impressions)],
                            ["Reach", num(ad.reach)],
                            ["CTR", pct(ad.ctr)],
                            ["CPC", currency(ad.cpc, code, { compact: true })],
                            ["CPM", currency(ad.cpm, code, { compact: true })],
                            ["Results", num(ad.results)],
                            ["CPA", currency(ad.costPerResult, code, { compact: true })],
                            ["ROAS", ad.roas > 0 ? `${ad.roas.toFixed(2)}×` : "—"],
                          ].map(([l, v]) => (
                            <div key={l}>
                              <p className="text-white/55">{l}</p>
                              <p className="num font-semibold">{v}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-white/80">
                          <MousePointerClick className="h-3 w-3" /> Click for full creative analysis
                        </p>
                      </div>
                    </div>

                    {/* footer */}
                    <div className="space-y-1.5 p-3">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{ad.creative?.title ?? ad.name}</p>
                        <span className="num shrink-0 text-[12px] font-semibold">{currency(ad.spend, code, { compact: true })}</span>
                      </div>
                      <p className="truncate text-[10px] text-faint">
                        {ad.location && ad.location !== "Unassigned" ? `${ad.location} · ` : ""}
                        {ad.adSetName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={ad.ctr >= account.ctr ? "pos" : "warn"}>{pct(ad.ctr)} CTR</Badge>
                        {conv > 0 ? <Badge tone="neutral">{num(conv)} conv.</Badge> : null}
                        {ad.creative?.cta ? <Badge tone="neutral">{String(ad.creative.cta).replace(/_/g, " ").toLowerCase()}</Badge> : null}
                        {ad.qualityRanking ? <Badge tone="info">Quality {rankingLabel(ad.qualityRanking)}</Badge> : null}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CreativeThumb({ ad, className }: { ad: AdRow; className?: string }) {
  return (
    <div className={cn("grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-brand-500/25 to-accent/20 text-brand-500", className)}>
      {ad.creative?.thumbnail || ad.creative?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.creative.thumbnail ?? ad.creative.imageUrl} alt="" className="h-12 w-12 object-cover" />
      ) : (
        <ImageIcon className="h-5 w-5" />
      )}
    </div>
  );
}
