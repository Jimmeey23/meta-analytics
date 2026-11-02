"use client";
import * as React from "react";
import {
  Image as ImageIcon, Maximize2, MousePointerClick, Search,
} from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { CreativeMedia } from "@/components/ui/creative-media";
import { useDrilldown } from "./drilldown-context";
import { currency, num, pct, rankingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdRow, Kpis } from "@/lib/types";

function mediaType(ad: AdRow) {
  return ad.creative?.videoId || ad.creative?.videoUrl || /video|reel/i.test(ad.creative?.format ?? "")
    ? "Video" : "Image";
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
  const [visibleCount, setVisibleCount] = React.useState(limit);
  React.useEffect(() => setVisibleCount(limit), [query, format, studio, limit, ads]);

  const items = React.useMemo(
    () => ads,
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

  const matching = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((ad) => {
      const haystack = `${ad.name} ${ad.adSetName} ${ad.creative?.title ?? ""} ${ad.creative?.body ?? ""}`.toLowerCase();
      return (!q || haystack.includes(q))
        && (format === "All" || mediaType(ad) === format)
        && (studio === "All studios" || (ad.location ?? "Unassigned") === studio);
    });
  }, [items, query, format, studio]);
  const visible = matching.slice(0, visibleCount);

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
      <p className="px-5 py-10 text-center text-xs text-muted">No creatives returned in this period.</p>
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
            return (
              <div
                key={ad.id}
                className="group relative z-0 hover:z-30"
              >
                <button
                  onClick={() => open({ kind: "creative", payload: { ad, code, account, siblings } })}
                  aria-label={`Open ${ad.creative?.title ?? ad.name} creative analysis`}
                  className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface transition-all duration-300 group-hover:-translate-y-1 group-hover:border-brand-500/40 group-hover:shadow-lift">
                    {/* preview */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-brand-500/25 via-accent/20 to-accent-2/20">
                      <CreativeMedia
                        ad={ad}
                        priority={visible.indexOf(ad) < 3}
                        showVideoBadge
                        imageClassName="object-contain"
                      />
                      <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
                        {ad.creative?.format ?? (isVideo ? "Video" : "Image")}
                      </span>
                      <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-black/45 text-white opacity-100 backdrop-blur transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
      {matching.length > visibleCount ? <div className="flex flex-wrap items-center justify-center gap-3 px-5 pb-5">
        <span className="text-xs text-muted">Showing {visible.length} of {matching.length} creatives</span>
        <button type="button" onClick={() => setVisibleCount((n) => n + limit)} className="rounded-xl border border-line px-4 py-2 text-xs font-semibold hover:border-brand-500">Load {Math.min(limit, matching.length - visibleCount)} more</button>
      </div> : null}
    </div>
  );
}

export function CreativeThumb({ ad, className, code = "INR", account, interactive = true }: {
  ad: AdRow; className?: string; code?: string; account?: Kpis; interactive?: boolean;
}) {
  const { open } = useDrilldown();
  const classes = cn("relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-brand-500/25 to-accent/20 text-brand-500", interactive && "transition hover:ring-2 hover:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", className);
  const media = <CreativeMedia ad={ad} compact showVideoBadge />;
  return interactive ? (
    <button type="button" className={classes} aria-label={`Preview ${ad.creative?.title ?? ad.name}`}
      onClick={(event) => { event.stopPropagation(); open({ kind: "creative", payload: { ad, code, account } }); }}>
      {media}
    </button>
  ) : <div className={classes} aria-hidden="true">{media}</div>;
}
