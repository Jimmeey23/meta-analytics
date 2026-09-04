#!/usr/bin/env node
/**
 * Asserts the ad-creative flattener finds a playable video source and a
 * thumbnail in each shape the Graph API actually returns for an ad.
 *
 * lib/creative.ts has no runtime imports, so it is transpiled standalone
 * into a temp dir and imported directly.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const out = mkdtempSync(path.join(tmpdir(), 'creative-check-'))
try {
  execFileSync('npx', ['tsc', 'lib/creative.ts', '--outDir', out, '--module', 'esnext',
    '--target', 'es2022', '--moduleResolution', 'bundler'], { stdio: 'inherit' })
  const { creativeFrom, videoIdsOf } = await import(
    path.join(out, 'creative.js')
  )

  const videos = new Map([
    ['901', { id: '901', source: 'https://video.fb/901.mp4', picture: 'https://img.fb/901.jpg', permalink_url: '/v/901' }],
  ])

  const cases = [
    ['video_id on the creative', { id: 'c1', video_id: '901', thumbnail_url: 'https://t/1.jpg' }],
    ['video_id in object_story_spec', { id: 'c2', object_story_spec: { video_data: { video_id: '901', image_url: 'https://t/2.jpg', title: { text: 'Hi' } } } }],
    ['video_id in asset_feed_spec', { id: 'c3', asset_feed_spec: { videos: [{ video_id: '901', thumbnail_url: 'https://t/3.jpg' }] } }],
    ['video_id on a carousel child', { id: 'c4', object_story_spec: { link_data: { child_attachments: [{ video_id: '901', picture: 'https://t/4.jpg' }] } } }],
  ]

  for (const [label, creative] of cases) {
    const r = creativeFrom(creative, videos)
    assert.equal(r.videoId, '901', `${label}: videoId`)
    assert.equal(r.videoUrl, 'https://video.fb/901.mp4', `${label}: videoUrl`)
    assert.ok(r.thumbnail, `${label}: thumbnail`)
    assert.deepEqual(videoIdsOf(creative), ['901'], `${label}: videoIdsOf`)
    console.log(`ok  ${label} -> ${r.format}`)
  }

  // Carousel wins the format label even when it carries a video.
  assert.equal(creativeFrom(cases[3][1], videos).format, 'Carousel')
  assert.equal(creativeFrom(cases[0][1], videos).format, 'Video')
  assert.equal(creativeFrom({ id: 'c5', object_story_spec: { link_data: { picture: 'p' } } }, videos).format, 'Link')
  assert.equal(creativeFrom({ id: 'c6', image_url: 'i' }, videos).format, 'Image')
  console.log('ok  format labels')

  // An asset-feed-only creative still yields copy and a thumbnail.
  const feed = creativeFrom({ id: 'c7', asset_feed_spec: {
    titles: [{ text: 'Feed title' }], bodies: [{ text: 'Feed body' }],
    images: [{ url: 'https://t/7.jpg' }], call_to_action_types: ['SIGN_UP'],
  } }, videos)
  assert.equal(feed.title, 'Feed title')
  assert.equal(feed.body, 'Feed body')
  assert.equal(feed.thumbnail, 'https://t/7.jpg')
  assert.equal(feed.cta, 'SIGN_UP')
  console.log('ok  asset feed copy and thumbnail')

  assert.equal(creativeFrom(undefined, videos), undefined)
  assert.deepEqual(videoIdsOf(undefined), [])
  console.log('ok  missing creative')

  console.log('\nall creative mapping checks passed')
} finally {
  rmSync(out, { recursive: true, force: true })
}
