import type { AdRow } from "./types";

type Asset = NonNullable<NonNullable<AdRow["creative"]>["assets"]>[number];
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined;
const unique = (values: unknown[]) => [...new Set(values.filter(Boolean).map(String))];

/** Video IDs can live on the creative, story, carousel card or asset feed. */
export function videoIdsOf(creative: any): string[] {
  if (!creative) return [];
  const spec = creative.object_story_spec ?? {};
  return unique([
    creative.video_id, spec.video_data?.video_id,
    ...(creative.asset_feed_spec?.videos ?? []).map((v: any) => v?.video_id),
    ...(spec.link_data?.child_attachments ?? []).map((c: any) => c?.video_id),
    ...(spec.template_data?.child_attachments ?? []).map((c: any) => c?.video_id),
    ...(creative.object_story_spec?.photo_data?.video_id ? [creative.object_story_spec.photo_data.video_id] : []),
  ]);
}

export function imageHashesOf(creative: any): string[] {
  if (!creative) return [];
  const spec = creative.object_story_spec ?? {};
  return unique([
    creative.image_hash, spec.link_data?.image_hash, spec.photo_data?.image_hash,
    spec.template_data?.image_hash,
    ...(creative.asset_feed_spec?.images ?? []).map((i: any) => i?.hash ?? i?.image_hash),
    ...(spec.link_data?.child_attachments ?? []).map((c: any) => c?.image_hash),
    ...(spec.template_data?.child_attachments ?? []).map((c: any) => c?.image_hash),
  ]);
}

export function safeMediaUrl(value: unknown): string | undefined {
  const url = text(value);
  if (!url) return undefined;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : undefined;
  } catch { return undefined; }
}

export function facebookUrl(value: unknown): string | undefined {
  const url = text(value);
  if (!url) return undefined;
  if (/^\d+(?:_\d+)?$/.test(url)) return `https://www.facebook.com/${url}`;
  return safeMediaUrl(url)?.startsWith("https://www.facebook.com/") ? url : undefined;
}

/** Flatten every supported creative shape; resolve signed video sources only on play. */
export function creativeFrom(
  creative: any,
  videoById: Map<string, any> = new Map(),
  imageByHash: Map<string, any> = new Map(),
): AdRow["creative"] {
  if (!creative) return undefined;
  const spec = creative.object_story_spec ?? {};
  const video = spec.video_data;
  const link = spec.link_data;
  const photo = spec.template_data ?? spec.photo_data;
  const feed = creative.asset_feed_spec ?? {};
  const children = link?.child_attachments ?? photo?.child_attachments ?? [];
  const child = children[0];
  const videoIds = videoIdsOf(creative);
  const videoMeta = videoById.get(videoIds[0]);
  const hashes = imageHashesOf(creative);
  const hashImage = imageByHash.get(hashes[0]);
  const title = text(creative.title) ?? text(video?.title?.text ?? video?.title) ?? text(link?.name ?? link?.title)
    ?? text(photo?.name) ?? text(feed.titles?.[0]?.text) ?? text(child?.name);
  const body = text(creative.body) ?? text(video?.message) ?? text(link?.message) ?? text(video?.description?.text ?? video?.description)
    ?? text(link?.description) ?? text(feed.bodies?.[0]?.text) ?? text(child?.description);
  const imageUrl = safeMediaUrl(creative.image_url) ?? safeMediaUrl(hashImage?.url)
    ?? safeMediaUrl(link?.image_url ?? link?.picture ?? photo?.image_url)
    ?? safeMediaUrl(feed.images?.[0]?.url ?? feed.images?.[0]?.image_url)
    ?? safeMediaUrl(child?.picture ?? child?.image_url)
    ?? safeMediaUrl(imageByHash.get(imageHashesOf({ image_hash: child?.image_hash })[0])?.url);
  const thumbnail = safeMediaUrl(creative.thumbnail_url) ?? safeMediaUrl(video?.image_url)
    ?? safeMediaUrl(feed.videos?.[0]?.thumbnail_url ?? feed.videos?.[0]?.image_url)
    ?? safeMediaUrl(videoMeta?.picture) ?? imageUrl;
  const assets: Asset[] = [];
  for (const item of children.length ? children : [...(feed.images ?? []), ...(feed.videos ?? [])]) {
    const id = text(item.video_id);
    const node = id ? videoById.get(id) : undefined;
    const image = safeMediaUrl(item.picture ?? item.image_url ?? item.url ?? item.thumbnail_url)
      ?? safeMediaUrl(imageByHash.get(item.image_hash ?? item.hash)?.url) ?? safeMediaUrl(node?.picture);
    assets.push({ imageUrl: image, thumbnail: image, videoId: id, permalink: facebookUrl(node?.permalink_url), title: text(item.name ?? item.title?.text ?? item.title), body: text(item.description ?? item.message) });
  }
  const isVideo = Boolean(videoIds.length || video || feed.videos?.length);
  return {
    id: creative.id, title, body, thumbnail, imageUrl,
    videoUrl: safeMediaUrl(videoMeta?.source),
    permalink: facebookUrl(videoMeta?.permalink_url) ?? facebookUrl(creative.instagram_permalink_url)
      ?? facebookUrl(creative.effective_object_story_id ?? creative.object_story_id),
    videoId: videoIds[0], videoIds, imageHash: hashes[0], assets,
    cta: creative.call_to_action_type ?? video?.call_to_action?.value?.type
      ?? link?.call_to_action?.value?.type ?? child?.call_to_action?.value?.type ?? feed.call_to_action_types?.[0],
    format: children.length ? "Carousel" : isVideo ? "Video" : link ? "Link" : "Image",
  };
}
