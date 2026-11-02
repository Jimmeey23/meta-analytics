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
const FORM_COUNT = 28
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
    const fields = url.searchParams.get('fields') ?? ''
    const body = {}
    if (fields.includes('creative')) {
      tally('BATCH ad metadata')
      for (const id of ids.split(',')) {
        const i = Number(id.replace('ad', '')) || 0
        body[id] = { id, name: `Ad ${i}`, adset_id: 'as1', campaign_id: 'c1', effective_status: 'ACTIVE', creative: { id: `cr${i}`, title: `T${i}`, video_id: `vid${i}`, object_story_spec: { video_data: { video_id: `vid_b${i}` } }, asset_feed_spec: { videos: [{ video_id: `vid_c${i}` }] } } }
      }
    } else if (fields.includes('targeting')) {
      tally('BATCH adset metadata')
      for (const id of ids.split(',')) body[id] = { id, name: 'AS', campaign_id: 'c1', effective_status: 'ACTIVE', daily_budget: '1000' }
    } else if (fields.includes('budget_remaining')) {
      tally('BATCH campaign metadata')
      for (const id of ids.split(',')) body[id] = { id, name: 'C', effective_status: 'ACTIVE', objective: 'OUTCOME_SALES', daily_budget: '1000' }
    } else {
      tally('BATCH video')
      for (const id of ids.split(',')) body[id] = { id, picture: 'p', ...(fields.includes('source') ? { source: `https://v/${id}.mp4` } : {}) }
    }
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
  else if (p === 'pg1/leadgen_forms') data = Array.from({ length: FORM_COUNT }, (_, i) => ({ id: `form${i}`, name: `Form ${i}`, status: 'ACTIVE', leads_count: 10 }))
  else if (/^form\d+\/leads$/.test(p)) data = [{ id: `${p.split('/')[0]}-lead`, created_time: '2026-08-15T00:00:00+0000', form_id: p.split('/')[0], field_data: [] }]
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
  assert.equal(report.leadForms.length, FORM_COUNT, 'all lead-bearing forms must be listed')
  assert.equal(report.leads.length, FORM_COUNT, 'leads must be loaded from every lead-bearing form, not only the 12 largest')
  assert.ok(!report.warnings.some(w => w.includes('12 largest')), 'the arbitrary 12-form cap must be gone')
  assert.equal(report.ads.length, AD_COUNT, 'all ads with delivery data must remain in the report')
  assert.ok(report.ads.every(ad => ad.creative), 'creative metadata must be batch-fetched for every ad with delivery data')
  const beforeVideo = counts.get('BATCH video') ?? 0
  const video = await resolveVideoSource('TESTTOKEN', 'vid0')
  assert.ok(video.source)
  assert.equal(counts.get('BATCH video'), beforeVideo + 1, 'opening a video resolves one source')
  await resolveVideoSource('TESTTOKEN', 'vid0')
  assert.equal(counts.get('BATCH video'), beforeVideo + 1, 'repeat playback uses source cache')
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
  assert.ok((first.get('BATCH video') ?? 0) <= 4, `poster lookups should batch, plus one explicit playback, got ${first.get('BATCH video')}`)
  assert.ok((first.get('BATCH ad metadata') ?? 0) <= Math.ceil(AD_COUNT / 50), 'ad metadata must use batched node reads')
  assert.ok(total(first) < 80, `one complete report build should stay bounded, got ${total(first)}`)
  assert.equal(second.get('me/accounts'), undefined, 'page list must be served from cache on rebuild')
  assert.equal(second.get('BATCH video'), undefined, 'video sources must be served from cache on rebuild')
  assert.equal(second.get('pg1/leadgen_forms'), undefined, 'form lists must be served from cache on rebuild')
  assert.ok(![...second.keys()].some(k => /^form\d+\/leads$/.test(k)), 'lead rows must be served from cache on rebuild')
  console.log('\nall call-budget checks passed')
} finally {
  rmSync(out, { recursive: true, force: true })
  server.close()
}
