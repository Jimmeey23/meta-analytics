"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ImageOff, Loader2, Play, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdRow } from "@/lib/types";

type Props = {
  ad: AdRow;
  className?: string;
  imageClassName?: string;
  playVideo?: boolean;
  controls?: boolean;
  showVideoBadge?: boolean;
  compact?: boolean;
  priority?: boolean;
  videoId?: string;
  posterUrl?: string;
};

// Share only in this browser tab; never put signed media URLs in localStorage.
const sourceCache = new Map<string, { at: number; source: string }>();
const sourceRequests = new Map<string, Promise<string>>();

/** Posters render everywhere. Bytes for a video are requested only in detail. */
export function CreativeMedia({
  ad, className, imageClassName, playVideo = false, controls = false,
  showVideoBadge = false, compact = false, priority = false, videoId, posterUrl,
}: Props) {
  const creative = ad.creative;
  const params = useSearchParams();
  const selectedVideo = videoId ?? creative?.videoId;
  const candidates = React.useMemo(
    () => [...new Set([posterUrl, creative?.thumbnail, creative?.imageUrl].filter(Boolean) as string[])],
    [posterUrl, creative?.thumbnail, creative?.imageUrl],
  );
  const [candidateIndex, setCandidateIndex] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [source, setSource] = React.useState<string | undefined>(
    playVideo && !selectedVideo ? creative?.videoUrl : undefined,
  );
  const scope = params.toString();
  const cacheKey = `${scope}:${ad.id}:${selectedVideo}`;

  React.useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
    setSource(playVideo && !selectedVideo ? creative?.videoUrl : undefined);
  }, [ad.id, selectedVideo, playVideo, creative?.videoUrl, attempt]);

  React.useEffect(() => {
    if (!playVideo || !selectedVideo) return;
    const hit = sourceCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 5 * 60_000) { setSource(hit.source); return; }
    // A local demo asset needs no API round trip.
    if (creative?.videoUrl?.startsWith("/media/")) { setSource(creative.videoUrl); return; }
    let active = true;
    setLoading(true);
    setFailed(false);
    let promise = sourceRequests.get(cacheKey);
    if (!promise) {
      const query = new URLSearchParams(scope);
      query.set("ad", ad.id);
      query.set("video", selectedVideo);
      promise = fetch(`/api/creative/video?${query}`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok || typeof body.source !== "string") throw new Error(body.error ?? "Video unavailable");
          sourceCache.set(cacheKey, { at: Date.now(), source: body.source });
          if (sourceCache.size > 80) sourceCache.delete(sourceCache.keys().next().value!);
          return body.source as string;
        }).finally(() => sourceRequests.delete(cacheKey));
      sourceRequests.set(cacheKey, promise);
    }
    promise.then((url) => { if (active) setSource(url); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ad.id, selectedVideo, playVideo, cacheKey, scope, creative?.videoUrl, attempt]);

  const poster = candidates[candidateIndex];
  const isVideo = Boolean(selectedVideo || creative?.videoUrl || /video|reel/i.test(creative?.format ?? ""));
  const showVideo = playVideo && Boolean(source) && !failed;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {showVideo ? (
        <video key={source} src={source} poster={poster} controls={controls} muted={!controls}
          playsInline preload="metadata" autoPlay={controls}
          onError={() => { setFailed(true); sourceCache.delete(cacheKey); }}
          className={cn("h-full w-full bg-black object-contain", imageClassName)}
          aria-label={`${creative?.title ?? ad.name} video`}
        />
      ) : poster ? (
        // Meta's signed CDN hosts vary by account; native images avoid leaking
        // signed URLs to a third-party image optimizer and support fallbacks.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt={compact ? "" : `${creative?.title ?? ad.name} creative preview`}
          loading={priority ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
          width={640} height={480}
          onError={() => setCandidateIndex((current) => current + 1)}
          className={cn("h-full w-full object-cover", imageClassName)}
        />
      ) : (
        <div className={cn("grid h-full w-full place-items-center text-center", compact ? "p-0.5" : "p-5")}>
          <div className="min-w-0 w-full">
            <ImageOff className={cn("mx-auto text-faint", compact ? "h-4 w-4" : "h-5 w-5")} aria-hidden="true" />
            {!compact ? <>
              <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{creative?.title ?? ad.name}</p>
              <p className="mt-1 line-clamp-3 text-[11px] text-muted">{creative?.body ?? "No image was returned. Open this creative to try the original preview."}</p>
            </> : null}
          </div>
        </div>
      )}
      {showVideo && source?.startsWith("/media/demo-") ? <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">DEMO MOTION PREVIEW</span> : null}
      {playVideo && loading && !source ? <span className="absolute inset-0 grid place-items-center bg-black/30" role="status" aria-label="Loading video"><Loader2 className="h-6 w-6 animate-spin text-white" /></span> : null}
      {showVideoBadge && isVideo && !showVideo ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
          <span className={cn("grid place-items-center rounded-full bg-black/65 text-white shadow-soft", compact ? "h-5 w-5" : "h-11 w-11")}>
            <Play className={compact ? "ml-px h-2.5 w-2.5" : "ml-0.5 h-4 w-4"} fill="currentColor" />
          </span>
        </span>
      ) : null}
      {playVideo && failed ? <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-center text-xs text-white">
        Video unavailable. <button type="button" onClick={() => setAttempt((n) => n + 1)} className="inline-flex items-center gap-1 font-semibold underline"><RotateCw className="h-3 w-3" /> Retry</button>
      </div> : null}
    </div>
  );
}
