#!/usr/bin/env node
/** Regression checks for cache isolation, evidence integrity and AI boundaries. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const out = mkdtempSync(path.join(process.cwd(), '.intelligence-'))
try {
  execFileSync('npx', ['tsc', 'lib/analytics.ts', 'lib/report-cache.ts', 'lib/request-security.ts', 'lib/ai.ts',
    'lib/demo.ts', 'lib/metrics.ts', 'lib/utils.ts', 'lib/ranges.ts', 'lib/types.ts',
    '--outDir', out, '--module', 'esnext', '--target', 'es2022', '--moduleResolution', 'bundler', '--skipLibCheck'], { stdio: 'inherit' })
  writeFileSync(path.join(out, 'package.json'), '{"type":"module"}')
  for (const file of readdirSync(out).filter(f => f.endsWith('.js'))) {
    const p = path.join(out, file)
    writeFileSync(p, readFileSync(p, 'utf8').replace(/import ["']server-only["'];?/g, '')
      .replace(/(from ["']\.\/[^"']+)(["'])/g, (m, a, q) => a.endsWith('.js') ? m : `${a}.js${q}`))
  }
  const { ReportCache } = await import(path.join(out, 'report-cache.js'))
  let calls = 0
  const cache = new ReportCache({ ttlMs: 40, staleMs: 100, maxEntries: 2 })
  const load = async () => { calls++; await new Promise(r => setTimeout(r, 15)); return calls }
  assert.deepEqual(await Promise.all([cache.read('a', load), cache.read('a', load)]), [1, 1])
  assert.equal(await cache.read('a', load), 1)
  await new Promise(r => setTimeout(r, 50))
  assert.equal(await cache.read('a', async () => { throw new Error('upstream down') }), 1, 'stale fallback')
  cache.invalidate('a')
  assert.equal(await cache.read('a', load), 2)
  await cache.read('b', load); await cache.read('c', load)
  assert.ok(cache.size <= 2)
  cache.clear('b')
  assert.equal(cache.peek('c') !== undefined, true, 'prefix isolation')
  let finish
  const pending = cache.read('inflight', () => new Promise(r => { finish = r }))
  cache.clear('inflight'); finish('old')
  await pending
  assert.equal(cache.peek('inflight'), undefined, 'invalidated flight cannot repopulate')
  console.log('ok cache single-flight, TTL, stale fallback, bounds and invalidation')

  const { buildDemoData } = await import(path.join(out, 'demo.js'))
  const { resolveRange } = await import(path.join(out, 'ranges.js'))
  const { analyzeReport, modelContext } = await import(path.join(out, 'analytics.js'))
  const { firstAction } = await import(path.join(out, 'metrics.js'))
  const report = buildDemoData('act_1', resolveRange('last_30d'))
  const analysis = analyzeReport(report)
  const ids = new Set(analysis.evidence.map(e => e.id))
  assert.ok(analysis.findings.length > 0)
  for (const finding of analysis.findings) {
    assert.ok(finding.evidenceIds.length)
    assert.ok(finding.evidenceIds.every(id => ids.has(id)))
  }
  assert.equal(analysis.momentum.currentDays, 7)
  assert.ok(analysis.concentration.topThreeShare <= 100)
  assert.match(analysis.quality.detail, /Demonstration/)
  const context = JSON.stringify(modelContext(analysis, report))
  for (const lead of report.leads.slice(0, 10)) {
    assert.ok(!context.includes(lead.email)); assert.ok(!context.includes(lead.phone))
  }
  assert.ok(!context.includes('accessToken'))
  assert.ok(!context.includes('field_data'))
  assert.equal(firstAction([{ action_type: 'lead', value: '10' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '10' }], ['lead', 'offsite_conversion.fb_pixel_lead']), 10, 'overlapping action aliases must not double count')
  const empty = { ...report, series: [], campaigns: [], ads: [], leads: [], kpis: Object.fromEntries(Object.keys(report.kpis).map(k => [k, typeof report.kpis[k] === 'number' ? 0 : 'Results'])) }
  const emptyAnalysis = analyzeReport(empty)
  assert.equal(emptyAnalysis.findings.length, 0)
  assert.ok(JSON.stringify(emptyAnalysis).includes('null'), 'zero denominators are unavailable, not infinity')
  console.log('ok deterministic analytics, evidence references, privacy whitelist and empty data')

  const { parseAiBrief, aiConfig } = await import(path.join(out, 'ai.js'))
  const valid = { summary: 'Test summary', findings: [{ title: 'Test', analysis: 'Evidence', action: 'Validate', confidence: 'low', evidenceIds: ['account'] }], experiments: [] }
  assert.equal(parseAiBrief(valid, ids, 'test').findings.length, 1)
  assert.throws(() => parseAiBrief({ ...valid, findings: [{ ...valid.findings[0], evidenceIds: ['invented'] }] }, ids, 'test'), /unavailable evidence/)
  assert.throws(() => parseAiBrief({ ...valid, summary: '<script>alert(1)</script>'.repeat(200) }, ids, 'test'), /Invalid AI text/)
  process.env.AI_API_KEY = 'test-secret'; process.env.AI_BASE_URL = 'http://unsafe.example/v1'
  assert.equal(aiConfig().configured, false, 'AI endpoint must use HTTPS')
  process.env.AI_BASE_URL = 'https://provider.example/v1'
  assert.equal(aiConfig().configured, true)
  console.log('ok AI structured output, citation validation and HTTPS configuration')

  // Exercise the real provider adapter with a mocked HTTPS response: no key or
  // network access is needed, and the outgoing payload is checked for privacy.
  const { generateAiBrief, cachedAiBrief } = await import(path.join(out, 'ai.js'))
  const originalFetch = globalThis.fetch
  let providerCalls = 0
  let outgoing
  globalThis.fetch = async (_url, init) => {
    providerCalls++
    outgoing = JSON.parse(init.body)
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const brief = await generateAiBrief(report, analysis)
    assert.equal(brief.findings.length, 1)
    assert.equal(outgoing.response_format.json_schema.strict, true)
    const prompt = JSON.stringify(outgoing.messages)
    for (const lead of report.leads.slice(0, 10)) { assert.ok(!prompt.includes(lead.email)); assert.ok(!prompt.includes(lead.phone)) }
    assert.ok(!prompt.includes('test-secret'))
    await cachedAiBrief(report, analysis, 'identity-a')
    await cachedAiBrief(report, analysis, 'identity-a')
    assert.equal(providerCalls, 2, 'identical brief is cached after the first generation')
    for (let i = 0; i < 4; i++) await cachedAiBrief({ ...report, generatedAt: `variant-${i}` }, analysis, 'identity-a')
    await assert.rejects(() => cachedAiBrief({ ...report, generatedAt: 'variant-over-limit' }, analysis, 'identity-a'), /AI_LIMIT/)
  } finally { globalThis.fetch = originalFetch; delete process.env.AI_API_KEY; delete process.env.AI_BASE_URL }
  console.log('ok AI provider payload privacy, structured response, cache and rate limit')


  const { isSameOrigin } = await import(path.join(out, 'request-security.js'))
  assert.equal(isSameOrigin(new Request('https://app.example/api', { method: 'POST', headers: { Origin: 'https://app.example' } })), true)
  assert.equal(isSameOrigin(new Request('https://app.example/api', { method: 'POST', headers: { Origin: 'https://evil.example' } })), false)
  assert.equal(isSameOrigin(new Request('https://app.example/api', { method: 'POST' })), false)
  assert.equal(isSameOrigin(new Request('https://app.example/api', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } })), true)
  assert.equal(isSameOrigin(new Request('https://app.example/api', { method: 'POST', headers: { Referer: 'https://app.example/insights' } })), true)
  assert.equal(isSameOrigin(new Request('https://app.example/api', { method: 'POST', headers: { Referer: 'https://evil.example/page' } })), false)
  assert.equal(isSameOrigin(new Request('https://app.example/api', { method: 'POST', headers: { Origin: 'https://app.example', 'sec-fetch-site': 'cross-site' } })), false)
  console.log('ok same-origin CSRF checks')
  console.log('\nall intelligence checks passed')
} finally { rmSync(out, { recursive: true, force: true }) }
