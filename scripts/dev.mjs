#!/usr/bin/env node
/**
 * Dev launcher with automatic port selection.
 *
 * Starts `next dev` on the first available port, beginning at
 * PORT (or 3000) and scanning upward. Extra CLI args are passed
 * through to `next dev`.
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const NEXT_BIN = require.resolve('next/dist/bin/next')

const START_PORT = Number(process.env.PORT) || 3000
const MAX_ATTEMPTS = 50
const HOST = process.env.HOST || '0.0.0.0'

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, HOST)
  })
}

async function findPort() {
  for (let port = START_PORT; port < START_PORT + MAX_ATTEMPTS; port++) {
    if (await isPortFree(port)) return port
  }
  throw new Error(
    `No free port found in range ${START_PORT}-${START_PORT + MAX_ATTEMPTS - 1}`
  )
}

/**
 * Reads META_REDIRECT_URI out of the env files without pulling in a parser.
 * Next loads them itself, but the launcher needs the value early enough to
 * warn before the OAuth round trip fails.
 */
function redirectUriFromEnvFiles() {
  if (process.env.META_REDIRECT_URI) return process.env.META_REDIRECT_URI
  for (const file of ['.env.local', '.env']) {
    try {
      const line = readFileSync(file, 'utf8')
        .split('\n')
        .find((l) => l.trim().startsWith('META_REDIRECT_URI='))
      if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
    } catch { /* file need not exist */ }
  }
  return null
}

const port = await findPort()
if (port !== START_PORT) {
  console.log(`Port ${START_PORT} in use — using ${port} instead.`)

  // Facebook Login only redirects back to a URI registered on the app, so a
  // shifted port breaks the connect flow with no obvious cause.
  const redirect = redirectUriFromEnvFiles()
  const configuredPort = redirect && (() => {
    try { return new URL(redirect).port || (new URL(redirect).protocol === 'https:' ? '443' : '80') }
    catch { return null }
  })()
  if (configuredPort && configuredPort !== String(port)) {
    console.log(
      `\n  ⚠ META_REDIRECT_URI points at port ${configuredPort}, but this server is on ${port}.\n` +
      `    Connecting a Meta account will fail until they match. Either free port ${configuredPort}\n` +
      `    and restart, or set META_REDIRECT_URI to http://localhost:${port}/api/meta/callback and add\n` +
      `    that URI under Facebook Login → Settings → Valid OAuth Redirect URIs.\n`,
    )
  }
}

const child = spawn(
  process.execPath,
  [
    NEXT_BIN,
    'dev',
    '-H',
    HOST,
    '-p',
    String(port),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: { ...process.env, PORT: String(port) } }
)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
