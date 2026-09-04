import type { AdRow } from "./types";

/**
 * Every place Meta can hide a video id on an ad creative: the creative
 * itself, the story spec, and each asset-feed variation.
 */
export function videoIdsOf(creative: any): string[] {
  if (!creative) return [];
  const spec = creative.object_story_spec ?? {};
  const ids = [
    creative.video_id,
    spec.video_data?.video_id,
    ...(creative.asset_feed_spec?.videos ?? []).map((v: any) => v?.video_id),
    ...(spec.link_data?.child_attachments ?? []).map((c: any) => c?.video_id),
  ];
  return [...new Set(ids.filter(Boolean).map(String))];
}

/** Flattens an ad creative into the shape the UI consumes. */
export function creativeFrom(creative: any, videoById: Map<string, any>): AdRow["creative"] {
  if (!creative) return undefined;
  const spec = creative.object_story_spec ?? {};
  const video = spec.video_data;
  const link = spec.link_data;
  const photo = spec.template_data ?? spec.photo_data;
  const feed = creative.asset_feed_spec ?? {};
  const child = link?.child_attachments?.[0];

  const videoId = videoIdsOf(creative)[0];
  const videoMeta = videoId ? videoById.get(videoId) : undefined;

  const title = creative.title ?? video?.title?.text ?? link?.name ?? link?.title
    ?? photo?.name ?? feed.titles?.[0]?.text ?? child?.name;
  const body = creative.body ?? video?.message ?? link?.message ?? video?.description?.text
    ?? link?.description ?? feed.bodies?.[0]?.text ?? child?.description;
  const thumbnail = creative.thumbnail_url ?? creative.image_url ?? video?.image_url
    ?? link?.image_url ?? link?.picture ?? photo?.image_url
    ?? feed.images?.[0]?.url ?? feed.videos?.[0]?.thumbnail_url
    ?? child?.picture ?? child?.image_url ?? videoMeta?.picture;

  const isVideo = Boolean(videoId || video || feed.videos?.length);
  return {
    id: creative.id,
    title, body, thumbnail,
    imageUrl: creative.image_url,
    videoUrl: videoMeta?.source,
    permalink: videoMeta?.permalink_url,
    videoId,
    cta: creative.call_to_action_type ?? video?.call_to_action?.value?.type
      ?? link?.call_to_action?.value?.type ?? feed.call_to_action_types?.[0],
    format: link?.child_attachments?.length ? "Carousel" : isVideo ? "Video" : link ? "Link" : "Image",
  };
}
