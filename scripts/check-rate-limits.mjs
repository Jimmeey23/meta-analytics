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
  console.log('\nthrottle + breaker checks passed')
} finally { rmSync(out,{recursive:true,force:true}); server.close() }
