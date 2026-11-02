#!/usr/bin/env node
/**
 * Counts the Graph API calls one report build makes.
 *
 * A stub server stands in for graph.facebook.com and tallies requests by
 * path shape, so a fan-out regression (one call per video id, a page list
 * re-read on every build) fails here instead of in production quota.
 */
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const AD_COUNT = 400
const counts = new Map()
const tally = (k) => counts.set(k, (counts.get(k) ?? 0) + 1)

function adRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `ad${i}`, name: `Ad ${i}`, adset_id: 'as1', campaign_id: 'c1',
    effective_status: 'ACTIVE',
    creative: {
      id: `cr${i}`, title: `T${i}`,
      video_id: `vid${i}`,
      object_story_spec: { video_data: { video_id: `vid_b${i}` } },
      asset_feed_spec: { videos: [{ video_id: `vid_c${i}` }] },
    },
  }))
}

function insightRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    ad_id: `ad${i}`, ad_name: `Ad ${i}`, adset_id: 'as1', adset_name: 'AS',
    campaign_id: 'c1', campaign_name: 'C', spend: String(n - i),
    impressions: '100', clicks: '5', reach: '90', date_start: '2026-08-01', date_stop: '2026-08-01',
  }))
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname.replace(/^\/v[\d.]+\//, '')
  const ids = url.searchParams.get('ids')

  if (ids) {
    tally('BATCH ids=')
    const body = {}
    for (const id of ids.split(',')) body[id] = { id, picture: 'p', ...(url.searchParams.get('fields')?.includes('source') ? { source: `https://v/${id}.mp4` } : {}) }
    res.end(JSON.stringify(body))
    return
  }
  tally(p.replace(/act_\d+/, 'act_X').replace(/^\d+/, '{id}'))

  let data = []
  if (p.endsWith('/insights')) data = url.searchParams.get('level') === 'ad' ? insightRows(AD_COUNT) : insightRows(3)
  else if (p.endsWith('/ads')) data = adRows(AD_COUNT)
  else if (p.endsWith('/adimages')) data = [{ hash: 'hash-1', url: 'https://img/full.jpg' }]
  else if (p.endsWith('/adspixels')) data = [{ id: 'px1', name: 'Pixel' }]
  else if (p === 'me/accounts') data = [{ id: 'pg1', name: 'Page', access_token: 'pgtok' }]
  res.end(JSON.stringify({ data }))
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

// Emitted inside the project so bare imports (clsx, tailwind-merge) still
// resolve through the local node_modules.
const out = mkdtempSync(path.join(process.cwd(), '.callbudget-'))
try {
  // Point the client at the stub by overriding the Graph host at import time.
  execFileSync('npx', ['tsc', 'lib/live.ts', 'lib/meta.ts', 'lib/creative.ts', 'lib/metrics.ts',
    'lib/utils.ts', 'lib/ranges.ts', 'lib/types.ts', 'lib/insights.ts', 'lib/discrepancies.ts',
    '--outDir', out, '--module', 'esnext', '--target', 'es2022', '--moduleResolution', 'bundler',
    '--skipLibCheck'], { stdio: 'inherit' })

  // The emitted ESM keeps extensionless relative imports, `server-only`
  // throws outside a React server, and the Graph host must point at the stub.
  const { readFileSync, readdirSync } = await import('node:fs')
  for (const f of readdirSync(out).filter((f) => f.endsWith('.js'))) {
    const p2 = path.join(out, f)
    writeFileSync(p2, readFileSync(p2, 'utf8')
      .replace(/import ["']server-only["'];?/g, '')
      .replace(/(from ["']\.\/[^"']+)(["'])/g, (m, a, q) => (a.endsWith('.js') ? m : `${a}.js${q}`))
      .replace(/https:\/\/graph\.facebook\.com/g, `http://127.0.0.1:${port}`))
  }

  const { buildLiveData, resolveVideoSource } = await import(path.join(out, 'live.js'))
  const account = { id: 'act_1', name: 'Acct', currency: 'INR', timezone: 'Asia/Kolkata', status: 1, amountSpent: 0 }
  const range = { key: 'last_30d', label: 'Last 30 days', since: '2026-08-01', until: '2026-08-30', days: 30 }

  const report = await buildLiveData('TESTTOKEN', account, range)
  assert.ok(report.ads.every(ad => !ad.creative?.videoUrl), 'report must not eagerly resolve video files')
  const beforeVideo = counts.get('BATCH ids=') ?? 0
  const video = await resolveVideoSource('TESTTOKEN', 'vid0')
  assert.ok(video.source)
  assert.equal(counts.get('BATCH ids='), beforeVideo + 1, 'opening a video resolves one source')
  await resolveVideoSource('TESTTOKEN', 'vid0')
  assert.equal(counts.get('BATCH ids='), beforeVideo + 1, 'repeat playback uses source cache')
  const first = new Map(counts)

  // Second build: caches must prevent a second page-list read.
  counts.clear()
  await buildLiveData('TESTTOKEN', account, range)
  const second = new Map(counts)

  const total = (m) => [...m.values()].reduce((a, b) => a + b, 0)
  console.log('\n--- build 1 ---')
  for (const [k, v] of [...first].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k)
  console.log('total', total(first))
  console.log('\n--- build 2 (warm caches) ---')
  for (const [k, v] of [...second].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k)
  console.log('total', total(second))

  const perVideo = [...first.keys()].filter((k) => /^\{id\}$/.test(k)).length
  assert.equal(perVideo, 0, 'must not issue one call per video id')
  assert.ok(first.get('BATCH ids=') <= 4, `poster lookups should batch, plus one explicit playback, got ${first.get('BATCH ids=')}`)
  assert.ok(total(first) < 40, `one report build should stay well under 40 calls, got ${total(first)}`)
  assert.equal(second.get('me/accounts'), undefined, 'page list must be served from cache on rebuild')
  assert.equal(second.get('BATCH ids='), undefined, 'video sources must be served from cache on rebuild')
  console.log('\nall call-budget checks passed')
} finally {
  rmSync(out, { recursive: true, force: true })
  server.close()
}
