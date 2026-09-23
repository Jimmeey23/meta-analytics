"use client";

import * as React from "react";
import { ImageOff, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdRow } from "@/lib/types";

type Props = {
  ad: AdRow;
  className?: string;
  imageClassName?: string;
  playVideo?: boolean;
  controls?: boolean;
  showVideoBadge?: boolean;
};

/**
 * Renders the durable poster first. Meta video `source` URLs are signed and
 * can expire, so they are only requested in an explicitly opened detail view.
 */
export function CreativeMedia({
  ad,
  className,
  imageClassName,
  playVideo = false,
  controls = false,
  showVideoBadge = false,
}: Props) {
  const creative = ad.creative;
  const candidates = React.useMemo(
    () => [...new Set([creative?.thumbnail, creative?.imageUrl].filter(Boolean) as string[])],
    [creative?.thumbnail, creative?.imageUrl],
  );
  const [candidateIndex, setCandidateIndex] = React.useState(0);
  const [videoFailed, setVideoFailed] = React.useState(false);

  React.useEffect(() => {
    setCandidateIndex(0);
    setVideoFailed(false);
  }, [ad.id]);

  const poster = candidates[candidateIndex];
  const isVideo = Boolean(creative?.videoId || creative?.videoUrl || /video|reel/i.test(creative?.format ?? ""));
  const showVideo = playVideo && Boolean(creative?.videoUrl) && !videoFailed;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {showVideo ? (
        <video
          src={creative?.videoUrl}
          poster={poster}
          controls={controls}
          muted={!controls}
          playsInline
          preload="metadata"
          onError={(event) => {
            event.stopPropagation();
            setVideoFailed(true);
          }}
          className={cn("h-full w-full bg-black object-contain", imageClassName)}
        />
      ) : poster ? (
        // Meta's signed CDN hosts vary by account, so a native image element
        // is intentionally used instead of a fixed next/image host allow-list.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={`${creative?.title ?? ad.name} creative preview`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.stopPropagation();
            setCandidateIndex((current) => current + 1);
          }}
          className={cn("h-full w-full object-cover", imageClassName)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center p-5 text-center">
          <div>
            <ImageOff className="mx-auto h-5 w-5 text-faint" aria-hidden="true" />
            <p className="mt-2 text-[13px] font-semibold leading-snug text-ink">{creative?.title ?? ad.name}</p>
            <p className="mt-1 line-clamp-3 text-[11px] text-muted">
              {creative?.body ?? "Meta did not return an accessible media preview for this ad."}
            </p>
          </div>
        </div>
      )}

      {showVideoBadge && isVideo && !showVideo ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white shadow-soft">
            <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
          </span>
        </span>
      ) : null}
    </div>
  );
}
