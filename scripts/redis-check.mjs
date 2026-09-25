// Guards the Redis visualizers. Nothing in this repo checked redis/*.html
// before, which is how ten pages came to ship broken SVG, a JS ReferenceError
// on valid input, and a CRC64 that makes every downloaded .rdb unloadable.
//
//   node scripts/redis-check.mjs
//
// Zero dependencies. Needs Chrome; override with CHROME_PATH=…

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// Random per run: several of these can be in flight at once (one per page
// being rewritten), and fixed ports would have them colliding or, worse,
// attaching to each other's browser and reporting the wrong page.
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo))
const PORT = rnd(4600, 4999)
const CDP = rnd(9600, 9999)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function serve(port) {
  const s = createServer(async (req, res) => {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
    try {
      const body = await readFile(join(ROOT, rel))
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  return new Promise((ok) => s.listen(port, '127.0.0.1', () => ok(s)))
}

async function waitFor(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      /* not up yet */
    }
    await sleep(300)
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((ok) => (ws.onopen = ok))
  let id = 0
  const pending = new Map()
  const listeners = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) pending.get(m.id)(m.result)
    else if (m.method) for (const fn of listeners.get(m.method) ?? []) fn(m.params)
  }
  return {
    send: (method, params) =>
      new Promise((ok) => {
        const i = ++id
        pending.set(i, ok)
        ws.send(JSON.stringify({ id: i, method, params }))
      }),
    on: (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]),
    close: () => ws.close(),
  }
}

const fails = []
const fail = (what, detail) => fails.push({ what, detail })

// Redis is CRC-64/Jones, and the source ships its own check vector at
// crc64.c:135. A page that computes a checksum must reproduce it, or the .rdb
// it hands the reader is rejected by rdbReportCorruptRDB.
const CRC64_VECTOR = 'e9c6d914c4b8d9ca'

const PAGE_PROBE = `(() => {
  const ext = [...document.querySelectorAll('script[src], link[href]')]
    .map(e => e.src || e.href).filter(u => !u.startsWith(location.origin));
  const host = u => { try { return new URL(u).host } catch { return u } };
  return JSON.stringify({
    tailwind: ext.some(u => host(u).includes('tailwindcss')),
    fontAwesome: ext.some(u => /fontawesome|font-awesome/i.test(u)) ||
                 !!document.querySelector('i.fas, i.far, i.fab'),
    viz: [...document.querySelectorAll('link[rel=stylesheet]')]
      .some(l => /\\/viz\\.css(\\?|$)/.test(l.href)),  // the href carries a ?v= cache-bust
    externalHosts: [...new Set(ext.map(host))],
    hasSrcLine: !!document.querySelector('.src'),
    badViewBox: [...document.querySelectorAll('svg[viewBox]')]
      .filter(s => s.getAttribute('viewBox').trim().split(/\\s+/).length !== 4).length,
    badPath: [...document.querySelectorAll('path[d]')]
      .filter(p => /[G-Zg-z]/.test(p.getAttribute('d').replace(/[AaCcHhLlMmQqSsTtVvZz]/g, ''))).length,
    sideScroll: document.documentElement.scrollWidth > innerWidth + 1,
    crc64: (() => {
      const fn = window.crc64 || window.calculateCRC64 || null;
      if (typeof fn !== 'function') return null;
      try { return fn('123456789').toString(16).padStart(16, '0') } catch { return 'threw' }
    })(),
  });
})()`

async function run() {
  const server = await serve(PORT)
  await waitFor(`http://127.0.0.1:${PORT}/index.html`)
  const profile = await mkdtemp(join(tmpdir(), 'redis-check-'))
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--no-first-run',
      '--hide-scrollbars',
      `--remote-debugging-port=${CDP}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: true },
  )
  await waitFor(`http://127.0.0.1:${CDP}/json/version`)
  const { send, on, close } = await connect()

  let errors = []
  await send('Runtime.enable')
  await send('Log.enable')
  on('Runtime.exceptionThrown', (p) =>
    errors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception'),
  )
  on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') errors.push(`${p.entry.source}: ${p.entry.text}`)
  })

  const pages = (await readdir(join(ROOT, 'redis')))
    .filter((f) => f.endsWith('.html'))
    .sort()

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 800,
    deviceScaleFactor: 1,
    mobile: true,
  })

  for (const page of pages) {
    errors = []
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/redis/${page}` })
    await sleep(2200)
    const r = await send('Runtime.evaluate', {
      returnByValue: true,
      awaitPromise: true,
      expression: PAGE_PROBE,
    })
    if (r.exceptionDetails) {
      fail(page, `probe threw: ${r.exceptionDetails.text}`)
      continue
    }
    const p = JSON.parse(r.result.value)
    const bad = []

    if (p.tailwind) bad.push('still loads the Tailwind Play CDN')
    if (p.fontAwesome) bad.push('still loads Font Awesome')
    if (!p.viz) bad.push('does not link viz.css')
    if (!p.hasSrcLine) bad.push('no .src line naming its C source')
    if (p.badViewBox) bad.push(`${p.badViewBox} svg viewBox without 4 numbers`)
    if (p.badPath) bad.push(`${p.badPath} path d= with a stray letter (O for 0?)`)
    if (p.sideScroll) bad.push('scrolls sideways at 390px')
    if (p.crc64 && p.crc64 !== CRC64_VECTOR)
      bad.push(`crc64("123456789") = ${p.crc64}, Redis gives ${CRC64_VECTOR} (crc64.c:135)`)
    if (errors.length) bad.push(`console: ${errors.slice(0, 2).join(' | ')}`)

    if (bad.length) fail(page, bad.join('; '))
    else
      console.log(
        `  ok    ${page.padEnd(28)} ${p.externalHosts.length} external host(s)` +
          (p.crc64 ? `, crc64 vector matches` : ''),
      )
  }

  close()
  try {
    process.kill(-chrome.pid, 'SIGKILL')
  } catch {
    chrome.kill('SIGKILL')
  }
  server.close()
  await rm(profile, { recursive: true, force: true })
}

await run()

if (fails.length) {
  console.error(`\n${fails.length} of the visualizers failed:`)
  for (const f of fails) console.error(`  FAIL  ${f.what}\n        ${f.detail}`)
  process.exit(1)
}
console.log('\nall redis visualizers passed')
