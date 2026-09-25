// Drives the three WebGL scenes in headless Chrome and fails on what a reader
// would see as broken. Zero dependencies: Node builtins and a Chrome binary.
//
//   node scripts/scene-check.mjs            all checks
//   CHROME_PATH=... node scripts/scene-check.mjs
//
// Headless Chrome has no GPU, so the scenes need SwiftShader to get a WebGL
// context at all. Without those flags every factory throws, scene-core marks
// the mount data-scene="unavailable", and a scene check silently passes on a
// page that never rendered.

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 4577
const CDP = 9577

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
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

function launchChrome(userDataDir) {
  return spawn(
    CHROME,
    [
      '--headless=new',
      '--no-first-run',
      '--hide-scrollbars',
      // software WebGL; --disable-gpu alone leaves no context and every scene dies
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      `--remote-debugging-port=${CDP}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: true },
  )
}

// Unlike the résumé repo's client this one keeps events: a scene that throws
// reports it as Runtime.exceptionThrown and nowhere else.
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
const ok = (what, detail) => console.log(`  ok    ${what}${detail ? `  ${detail}` : ''}`)

// ---- checks -----------------------------------------------------------------

// A mount that threw is indistinguishable from one that never scrolled into
// view unless the state is read back, so read it back.
const MOUNT_PROBE = (id) => `(async () => {
  const el = document.getElementById(${JSON.stringify(id)});
  if (!el) return JSON.stringify({ found: false });
  el.scrollIntoView({ block: 'center' });
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && el.dataset.scene !== 'ready' && el.dataset.scene !== 'unavailable')
    await new Promise(r => setTimeout(r, 200));
  const c = el.querySelector('canvas');
  return JSON.stringify({ found: true, state: el.dataset.scene ?? null,
    canvas: !!c, w: c ? c.width : 0, h: c ? c.height : 0 });
})()`

// The callout is an opaque panel over a field of labels. Anything still visible
// inside its rect is being painted on top of it.
const CALLOUT_PROBE = `(async () => {
  const el = document.getElementById('scene-terrain');
  const cv = el.querySelector('canvas');
  const co = document.querySelector('.st-callout');
  if (!cv || !co) return JSON.stringify({ ran: false });
  const fire = (x, y) => { for (const t of ['pointermove', 'mousemove'])
    cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' })); };
  const bad = [];
  let hovers = 0;
  for (let fy = 0.28; fy <= 0.78 && hovers < 8; fy += 0.04) {
    for (let fx = 0.18; fx <= 0.92 && hovers < 8; fx += 0.025) {
      const r = cv.getBoundingClientRect();
      fire(r.left + r.width * fx, r.top + r.height * fy);
      await new Promise(q => requestAnimationFrame(q));
      await new Promise(q => requestAnimationFrame(q));
      if (!co.classList.contains('st-on')) continue;
      hovers++;
      await new Promise(q => setTimeout(q, 350));
      const cr = co.getBoundingClientRect();
      const over = [...document.querySelectorAll('.st-lb')].filter(l => {
        if (getComputedStyle(l).opacity === '0') return false;
        const b = l.getBoundingClientRect();
        return b.width && cr.left < b.right && b.left < cr.right && cr.top < b.bottom && b.top < cr.bottom;
      }).map(l => l.textContent.trim());
      if (over.length) bad.push({ at: [+fx.toFixed(2), +fy.toFixed(2)], over });
    }
  }
  return JSON.stringify({ ran: true, hovers, bad, zIndex: getComputedStyle(co).zIndex });
})()`

// Product Principle #5 is that the résumé is read in place with no download.
// Slots alone do not prove that: is-printed is only set once a page has really
// painted, so an empty reader would still look like a pass without it.
const READER_PROBE = `(async () => {
  const wait = async (fn, ms = 15000) => { const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 200)); } return false };
  const link = [...document.querySelectorAll('[data-reader]')].find(a => getComputedStyle(a).display !== 'none');
  if (!link) return JSON.stringify({ ran: false });
  link.click();
  const dlg = document.querySelector('.reader');
  const opened = await wait(() => dlg.hasAttribute('open'));
  await wait(() => document.querySelectorAll('.page__slot').length > 0);
  await new Promise(r => setTimeout(r, 2500));
  const pct0 = document.querySelector('.reader__pct').textContent;
  document.querySelector('[data-zoom="in"]').click();
  await new Promise(r => setTimeout(r, 700));
  const pctIn = document.querySelector('.reader__pct').textContent;
  document.querySelector('.reader__close').click();
  await new Promise(r => setTimeout(r, 500));
  return JSON.stringify({ ran: true, opened,
    slots: document.querySelectorAll('.page__slot').length,
    printed: document.querySelectorAll('.page__slot.is-printed').length,
    pageno: document.querySelector('.reader__pageno').textContent.trim(),
    zoomed: pctIn !== pct0, closed: !dlg.hasAttribute('open') });
})()`

async function run() {
  const server = await serve(PORT)
  await waitFor(`http://127.0.0.1:${PORT}/index.html`)
  const profile = await mkdtemp(join(tmpdir(), 'scene-check-')) // never inside the repo
  const chrome = launchChrome(profile)
  await waitFor(`http://127.0.0.1:${CDP}/json/version`)
  const { send, on, close } = await connect()

  let errors = []
  await send('Runtime.enable')
  await send('Log.enable')
  on('Runtime.exceptionThrown', (p) =>
    errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'exception'),
  )
  on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') errors.push(`${p.entry.source}: ${p.entry.text}`)
  })

  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return JSON.parse(r.result.value)
  }

  // city is display:none under 900px, so the page has to be wide enough to mount it
  const PAGES = [
    { page: 'index.html', w: 1280, h: 900, scenes: ['scene-city', 'scene-terrain'] },
    { page: 'timeline.html', w: 1280, h: 900, scenes: ['scene-timeline'] },
  ]

  for (const { page, w, h, scenes } of PAGES) {
    console.log(`\n${page}`)
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    errors = []
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}?lang=ko` })
    await sleep(1500)

    for (const id of scenes) {
      const m = await evalIn(MOUNT_PROBE(id))
      if (!m.found) fail(`${page} ${id}`, 'mount element not in the page')
      else if (m.state !== 'ready')
        fail(`${page} ${id}`, `data-scene="${m.state}" (the factory threw, or three never loaded)`)
      else if (!m.canvas || !m.w || !m.h) fail(`${page} ${id}`, `canvas ${m.w}x${m.h}`)
      else ok(`${id} mounted`, `${m.w}x${m.h}`)
    }

    if (scenes.includes('scene-terrain')) {
      const c = await evalIn(CALLOUT_PROBE)
      if (!c.ran) fail('terrain callout', 'never got a canvas or a callout to test')
      else if (!c.hovers) fail('terrain callout', 'pointer sweep never hit a bar')
      else if (c.bad.length)
        fail('terrain callout', `labels painted over the callout: ${JSON.stringify(c.bad)}`)
      else ok('terrain callout clear of labels', `${c.hovers} hovers, z-index ${c.zIndex}`)
    }

    if (page === 'index.html') {
      const r = await evalIn(READER_PROBE)
      if (!r.ran) fail('résumé reader', 'no visible [data-reader] link to open')
      else if (!r.opened) fail('résumé reader', 'clicking the link did not open the dialog')
      else if (r.printed < 2)
        fail('résumé reader', `${r.printed} of ${r.slots} pages actually painted, expected 2`)
      else if (!/^1 \/ \d+$/.test(r.pageno)) fail('résumé reader', `page counter reads "${r.pageno}"`)
      else if (!r.zoomed) fail('résumé reader', 'zoom in did not change the percentage')
      else if (!r.closed) fail('résumé reader', 'close left the dialog open')
      else ok('résumé reader', `${r.printed} pages painted, ${r.pageno}, zoom and close work`)
    }

    if (errors.length) fail(`${page} console`, errors.slice(0, 4).join(' | '))
    else ok('no page errors')
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
  console.error(`\n${fails.length} failed:`)
  for (const f of fails) console.error(`  FAIL  ${f.what}\n        ${f.detail}`)
  process.exit(1)
}
console.log('\nall scene checks passed')
