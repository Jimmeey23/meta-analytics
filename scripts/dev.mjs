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

const port = await findPort()
if (port !== START_PORT) {
  console.log(`Port ${START_PORT} in use — using ${port} instead.`)
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
