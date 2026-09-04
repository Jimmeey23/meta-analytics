#!/usr/bin/env node
/**
 * Verifies the Graph client's throttle and rate-limit breaker.
 *
 * A stub server counts in-flight requests, then starts returning code 17.
 * Asserts concurrency stays under the cap and that no further calls reach
 * Meta once the breaker opens — retrying into an active limit is what turns
 * one throttled report into an hour-long penalty.
 */
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

let live = 0, peak = 0, total = 0, mode = 'ok'
const server = createServer(async (req, res) => {
  live++; peak = Math.max(peak, live); total++
  await new Promise(r => setTimeout(r, 40))
  live--
  if (mode.startsWith('usage')) {
    const app = mode === 'usage-high'
      ? { call_count: 94, total_time: 10, total_cputime: 8 }
      : { call_count: 12, total_time: 3, total_cputime: 4 }
    const buc = mode === 'usage-regain'
      ? { 'act_1': [{ type: 'ads_insights', call_count: 99, total_time: 90, total_cputime: 80, estimated_time_to_regain_access: 15 }] }
      : { 'act_1': [{ type: 'ads_insights', call_count: 20, total_time: 5, total_cputime: 6 }] }
    res.writeHead(200, {
      'content-type': 'application/json',
      'x-app-usage': JSON.stringify(app),
      'x-business-use-case-usage': JSON.stringify(buc),
    })
    res.end(JSON.stringify({ data: [] }))
    return
  }
  if (mode === 'limit') {
    res.writeHead(400, {'content-type':'application/json'})
    res.end(JSON.stringify({ error: { message: 'User request limit reached', code: 17, type: 'OAuthException' } }))
  } else res.end(JSON.stringify({ data: [] }))
})
await new Promise(r => server.listen(0,'127.0.0.1',r))
const port = server.address().port
const out = mkdtempSync(path.join(process.cwd(), '.rl-'))
try {
  execFileSync('npx',['tsc','lib/meta.ts','--outDir',out,'--module','esnext','--target','es2022','--moduleResolution','bundler','--skipLibCheck'],{stdio:'inherit'})
  for (const f of readdirSync(out).filter(f=>f.endsWith('.js'))) {
    const p=path.join(out,f)
    writeFileSync(p, readFileSync(p,'utf8')
      .replace(/import ["']server-only["'];?/g,'')
      .replace(/(from ["']\.\/[^"']+)(["'])/g,(m,a,q)=>a.endsWith('.js')?m:`${a}.js${q}`)
      .replace(/https:\/\/graph\.facebook\.com/g, `http://127.0.0.1:${port}`))
  }
  const m = await import(path.join(out,'meta.js'))

  // 30 concurrent reads must not exceed the in-flight cap.
  await Promise.all(Array.from({length:30},(_,i)=>m.getEdge('T',`n${i}`,'edge',{}).catch(()=>{})))
  console.log('peak concurrency:', peak, '(cap 4)')
  assert.ok(peak <= 4, `concurrency cap breached: ${peak}`)

  // Once Meta reports a limit, further calls must be refused locally.
  mode = 'limit'
  await m.getEdge('T','x','edge',{}).catch(()=>{})
  const afterBreaker = total
  const errs = []
  await Promise.all(Array.from({length:25},()=>m.getEdge('T','y','edge',{}).catch(e=>errs.push(e.message))))
  console.log('network calls during cooldown:', total - afterBreaker, '(want 0)')
  console.log('cooldown remaining ms:', m.rateLimitCooldownMs())
  assert.equal(total - afterBreaker, 0, 'breaker must stop calls reaching Meta')
  assert.ok(errs.every(e=>/paused/.test(e)), 'callers should see the cooldown message')
  assert.ok(m.rateLimitCooldownMs() > 0)
  // Meta's usage headers must drive backoff before the pool is exhausted.
  mode = 'usage-low'
  await new Promise(r => setTimeout(r, 100))
  m.__resetForTests?.()
  await m.getEdge('T','z','edge',{}).catch(()=>{})
  let u = m.graphUsage()
  console.log('parsed app usage:', u.app)
  assert.deepEqual(u.app, { callCount: 12, totalTime: 3, totalCputime: 4 })
  assert.deepEqual(u.businessUseCase, { callCount: 20, totalTime: 5, totalCputime: 6 })
  assert.equal(m.rateLimitCooldownMs(), 0, 'low usage must not pause requests')

  mode = 'usage-high'
  await m.getEdge('T','z','edge',{}).catch(()=>{})
  u = m.graphUsage()
  console.log('app usage at ceiling:', u.app.callCount, '-> cooldown', m.rateLimitCooldownMs() > 0)
  assert.equal(u.app.callCount, 94)
  assert.ok(m.rateLimitCooldownMs() > 0, 'must pause before the pool is exhausted')

  // A regain estimate from Meta should win over the fixed cooldown.
  m.__resetForTests?.()
  mode = 'usage-regain'
  await m.getEdge('T','z','edge',{}).catch(()=>{})
  const wait = m.rateLimitCooldownMs()
  console.log('regain estimate honoured:', Math.round(wait/1000), 's (want ~900)')
  assert.ok(wait > 800_000 && wait <= 900_000, `expected ~15min cooldown, got ${wait}ms`)
  assert.equal(m.graphUsage().regainAccessInMinutes, 15)

  console.log('\nthrottle + breaker checks passed')
} finally { rmSync(out,{recursive:true,force:true}); server.close() }
