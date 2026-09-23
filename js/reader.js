// The résumé, read in place: a sheet rises over the transcript and PDF.js draws
// the pages into it, so reading never costs a download or a new tab.
const CDNS = ['https://unpkg.com/pdfjs-dist@6.3.289/', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/']
const CSS_UNITS = 96 / 72
const MAX_PX = 12e6 // per page canvas; iOS refuses anything past ~16.7M pixels
const STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

const root = document.documentElement
const dialog = document.querySelector('.reader')
const head = dialog.querySelector('.reader__head')
const scroller = dialog.querySelector('.reader__scroll')
const pagesEl = dialog.querySelector('.reader__pages')
const statusEl = dialog.querySelector('.reader__status')
const pctEl = dialog.querySelector('.reader__pct')
const pageNoEl = dialog.querySelector('.reader__pageno')
const T = (ko, en) => (root.dataset.lang === 'ko' ? ko : en)
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const pdfUrl = (lang) => `resume/seokwon-resume-${lang}.pdf`

// ---- loading ----------------------------------------------------------------

let pdfjs = null
let base = CDNS[0]
let lib = null
function loadLib() {
  lib ??= CDNS.reduce(
    (prev, url) =>
      prev.catch(() =>
        import(url + 'build/pdf.min.mjs').then((m) => {
          m.GlobalWorkerOptions.workerSrc = url + 'build/pdf.worker.min.mjs'
          base = url
          return (pdfjs = m)
        }),
      ),
    Promise.reject(),
  ).catch((e) => {
    lib = null // both CDNs failed: let the next open try again
    throw e
  })
  return lib
}

const bytes = {}
const fetchBytes = (lang) =>
  (bytes[lang] ??= fetch(pdfUrl(lang))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
    .catch((e) => {
      delete bytes[lang]
      throw e
    }))

const docs = {}
let worker = null
function loadDoc(lang) {
  docs[lang] ??= Promise.all([loadLib(), fetchBytes(lang)])
    .then(async ([lib, buf]) => {
      worker ??= new lib.PDFWorker() // one worker for both languages, not one per document
      const doc = await lib.getDocument({
        worker,
        data: new Uint8Array(buf.slice(0)), // getDocument detaches what it is given
        cMapUrl: base + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: base + 'standard_fonts/',
        wasmUrl: base + 'wasm/',
      }).promise
      const pages = await Promise.all(
        Array.from({ length: doc.numPages }, async (_, i) => {
          const page = await doc.getPage(i + 1)
          const [text, notes] = await Promise.all([page.getTextContent(), page.getAnnotations()])
          return { page, text, links: notes.filter((a) => a.subtype === 'Link' && a.url) }
        }),
      )
      return { lang, size: buf.byteLength, pages }
    })
    .catch((e) => {
      delete docs[lang]
      throw e
    })
  return docs[lang]
}

// Intent is enough to start: hovering the link or typing /re warms both halves.
function warm() {
  loadLib().catch(() => {})
  fetchBytes(root.dataset.lang).catch(() => {})
}

// ---- pages ------------------------------------------------------------------

let views = []
function build(sizes) {
  views = sizes.map(([w, h], i) => {
    const fig = document.createElement('figure')
    const slot = document.createElement('div')
    const sheet = document.createElement('div')
    const canvas = document.createElement('canvas')
    const textEl = document.createElement('div')
    const linksEl = document.createElement('div')
    const cap = document.createElement('figcaption')
    fig.className = 'page'
    slot.className = 'page__slot'
    sheet.className = 'page__sheet'
    textEl.className = 'textLayer'
    linksEl.className = 'page__links'
    slot.style.setProperty('--pw', w)
    slot.style.setProperty('--ph', h)
    cap.textContent = `${i + 1} / ${sizes.length}`
    sheet.append(canvas, textEl, linksEl)
    slot.append(sheet)
    fig.append(slot, cap)
    return { fig, slot, sheet, canvas, textEl, linksEl, text: null, task: null, gen: 0 }
  })
  pagesEl.replaceChildren(...views.map((v) => v.fig))
  track()
}

const sizeOf = ({ page }) => [page.view[2] - page.view[0], page.view[3] - page.view[1]]
const viewportOf = ({ page }) => page.getViewport({ scale: zoom * CSS_UNITS })

async function paint(p, view) {
  const gen = ++view.gen
  const viewport = viewportOf(p)
  const out = Math.min(devicePixelRatio || 1, Math.sqrt(MAX_PX / (viewport.width * viewport.height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width * out)
  canvas.height = Math.floor(viewport.height * out)
  view.task?.cancel()
  const task = (view.task = p.page.render({
    canvasContext: canvas.getContext('2d', { alpha: false }),
    viewport,
    transform: out === 1 ? null : [out, 0, 0, out, 0, 0],
  }))
  try {
    await task.promise
  } catch {
    return // superseded by a newer paint
  }
  if (gen !== view.gen) return
  view.canvas.replaceWith(canvas)
  view.canvas = canvas
  view.text?.update({ viewport })
}

function write(p, view) {
  const viewport = viewportOf(p)
  view.text?.cancel()
  view.textEl.replaceChildren()
  view.text = new pdfjs.TextLayer({ textContentSource: p.text, container: view.textEl, viewport })
  view.text
    .render()
    .then(() => {
      const end = document.createElement('div')
      end.className = 'endOfContent'
      view.textEl.append(end)
    })
    .catch(() => {})

  const [x0, y0, x1, y1] = p.page.view
  const pct = (n, of) => `${((100 * n) / of).toFixed(3)}%`
  view.linksEl.replaceChildren(
    ...p.links.map(({ url, rect }) => {
      const [l, b, r, t] = pdfjs.Util.normalizeRect(rect)
      const a = document.createElement('a')
      a.href = url
      if (!/^(mailto|tel):/.test(url)) {
        a.target = '_blank'
        a.rel = 'noreferrer'
      }
      a.title = decodeURI(url.replace(/^(mailto|tel):/, ''))
      a.setAttribute('aria-label', a.title)
      a.style.cssText = `left:${pct(l - x0, x1 - x0)};top:${pct(y1 - t, y1 - y0)};width:${pct(r - l, x1 - x0)};height:${pct(t - b, y1 - y0)}`
      return a
    }),
  )
}

// The one authored motion: each page feeds out of its slot, as from a printer.
function feed() {
  views.forEach((v, i) => {
    v.slot.classList.add('is-printed')
    if (!reduced.matches)
      v.sheet.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], {
        duration: 760,
        delay: i * 120,
        easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)',
        fill: 'backwards',
      })
  })
}

let current = null
let shown = null
let token = 0
async function show(lang) {
  const my = ++token
  shown = lang
  status('loading')
  let d
  try {
    d = await loadDoc(lang)
  } catch {
    if (my === token) status('error')
    return
  }
  if (my !== token) return
  const sizes = d.pages.map(sizeOf)
  if (sizes.length !== views.length) build(sizes)
  else
    views.forEach((v, i) => {
      v.slot.style.setProperty('--pw', sizes[i][0])
      v.slot.style.setProperty('--ph', sizes[i][1])
    })
  current = d
  d.pages.forEach((p, i) => write(p, views[i]))
  await Promise.all(d.pages.map((p, i) => paint(p, views[i])))
  if (my !== token) return
  feed()
  status('ready')
  const other = lang === 'ko' ? 'en' : 'ko'
  ;(window.requestIdleCallback ?? setTimeout)(() => loadDoc(other).catch(() => {}))
}

// ---- status line --------------------------------------------------------------

let state = 'idle'
let hint = 0
function status(next = state) {
  state = next
  dialog.dataset.state = state
  clearTimeout(hint)
  if (state === 'loading') statusEl.textContent = T('읽는 중…', 'Reading…')
  else if (state === 'error') {
    statusEl.textContent = T('여기서 그리지 못했습니다 · ', 'Could not draw it here · ')
    const a = document.createElement('a')
    a.href = pdfUrl(shown)
    a.target = '_blank'
    a.rel = 'noreferrer'
    a.textContent = T('새 탭에서 열기', 'open in a new tab')
    statusEl.append(a)
  } else if (state === 'ready' && current) {
    const n = current.pages.length
    const a4 = current.pages.every((p) => sizeOf(p).every((v, i) => Math.abs(v - [595.28, 841.89][i]) < 2))
    const kb = Math.round(current.size / 1024)
    statusEl.textContent = `${n}${T('쪽', n === 1 ? ' page' : ' pages')}${a4 ? ' · A4' : ''} · ${kb} KB`
  }
}

function keys() {
  statusEl.textContent = T(
    '+ − 확대·축소 · 0 너비 맞춤 · l 언어 · t 테마 · esc 닫기',
    '+ − zoom · 0 fit width · l language · t theme · esc close',
  )
  clearTimeout(hint)
  hint = setTimeout(() => status(), 6000)
}

function titles() {
  const set = (sel, ko, en) => dialog.querySelector(sel)?.setAttribute('title', T(ko, en))
  set('[data-zoom="out"]', '축소 (−)', 'Zoom out (−)')
  set('[data-zoom="in"]', '확대 (+ · ctrl+휠, 핀치)', 'Zoom in (+ · ctrl+wheel, pinch)')
  set('[data-zoom="fit"]', '너비 맞춤 (0)', 'Fit width (0)')
  set('.reader__close', '닫기 (esc)', 'Close (esc)')
}

// ---- zoom -------------------------------------------------------------------

let zoom = 1
let auto = true // follow the sheet's width until the reader picks a zoom themselves
const pad = () => parseFloat(getComputedStyle(pagesEl).paddingLeft) || 0
const widest = () => Math.max(...views.map((v) => +v.slot.style.getPropertyValue('--pw') || 595.28))
const fitZoom = () => (scroller.clientWidth - 2 * pad()) / (widest() * CSS_UNITS)
const autoZoom = () => Math.min(1, fitZoom())
const clamp = (z) => Math.min(3, Math.max(Math.min(0.5, fitZoom()), z))

function apply() {
  pagesEl.style.setProperty('--scale-factor', zoom * CSS_UNITS)
  pctEl.textContent = `${Math.round(zoom * 100)}%`
}

let timer = 0
function repaint() {
  clearTimeout(timer)
  timer = setTimeout(() => current?.pages.forEach((p, i) => views[i] && paint(p, views[i])), 160)
}

// Keeps the point under the cursor (or the view's centre) where it was.
function zoomTo(next, cx, cy) {
  next = clamp(next)
  auto = false
  if (Math.abs(next - zoom) < 1e-4) return
  const box = scroller.getBoundingClientRect()
  cx ??= box.left + box.width / 2
  cy ??= box.top + box.height / 2
  let anchor = null
  let gap = Infinity
  for (const v of views) {
    const r = v.slot.getBoundingClientRect()
    const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0
    if (d < gap) {
      gap = d
      anchor = { el: v.slot, fx: (cx - r.left) / r.width, fy: (cy - r.top) / r.height }
    }
  }
  zoom = next
  apply()
  if (anchor) {
    const r = anchor.el.getBoundingClientRect()
    scroller.scrollLeft += r.left + anchor.fx * r.width - cx
    scroller.scrollTop += r.top + anchor.fy * r.height - cy
  }
  repaint()
}

const step = (dir) => {
  const z = Math.round(zoom * 100) / 100
  const next = dir > 0 ? STEPS.find((s) => s > z + 0.001) : STEPS.findLast((s) => s < z - 0.001)
  zoomTo(next ?? (dir > 0 ? 3 : 0))
}

function fit() {
  zoomTo(fitZoom())
  auto = true
}

for (const b of dialog.querySelectorAll('[data-zoom]'))
  b.addEventListener('click', () => (b.dataset.zoom === 'fit' ? fit() : step(b.dataset.zoom === 'in' ? 1 : -1)))

scroller.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const dy = Math.max(-25, Math.min(25, e.deltaMode ? e.deltaY * 16 : e.deltaY))
    zoomTo(zoom * Math.exp(-dy * 0.01), e.clientX, e.clientY)
  },
  { passive: false },
)

// Two fingers zoom the pages, not the viewport, so the text re-renders sharp.
let pinch = null
const spread = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
scroller.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length !== 2) return
    if (e.cancelable) e.preventDefault()
    pinch = { d: spread(e.touches), z: zoom }
  },
  { passive: false },
)
scroller.addEventListener(
  'touchmove',
  (e) => {
    if (!pinch || e.touches.length !== 2) return
    if (e.cancelable) e.preventDefault()
    const [a, b] = e.touches
    zoomTo((pinch.z * spread(e.touches)) / pinch.d, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
  },
  { passive: false },
)
scroller.addEventListener('touchend', (e) => e.touches.length < 2 && (pinch = null))

// Safari's trackpad pinch arrives as gesture events rather than ctrl+wheel.
let gesture = 1
scroller.addEventListener('gesturestart', (e) => {
  e.preventDefault()
  gesture = zoom
})
scroller.addEventListener('gesturechange', (e) => {
  e.preventDefault()
  if (!pinch) zoomTo(gesture * e.scale, e.clientX, e.clientY)
})

new ResizeObserver(() => {
  if (!dialog.open || !auto) return
  const z = autoZoom()
  if (Math.abs(z - zoom) < 1e-3) return
  zoom = z
  apply()
  repaint()
}).observe(scroller)

// ---- page indicator and selection ---------------------------------------------------

let ticking = false
function track() {
  ticking = false
  const box = scroller.getBoundingClientRect()
  const line = box.top + box.height * 0.4
  let i = 0
  views.forEach((v, k) => v.fig.getBoundingClientRect().top <= line && (i = k))
  pageNoEl.textContent = `${i + 1} / ${views.length}`
}
scroller.addEventListener('scroll', () => ticking || ((ticking = true), requestAnimationFrame(track)), { passive: true })

pagesEl.addEventListener('pointerdown', (e) => e.target.closest?.('.textLayer')?.classList.add('selecting'))
addEventListener('pointerup', () => {
  for (const t of pagesEl.querySelectorAll('.textLayer.selecting')) t.classList.remove('selecting')
})

// ---- open and close ---------------------------------------------------------------

function open({ fromHistory = false } = {}) {
  if (dialog.open) return
  dialog.classList.remove('is-closing')
  dialog.style.removeProperty('--drag')
  if (!views.length) build([[595.28, 841.89], [595.28, 841.89]])
  titles()
  dialog.showModal()
  auto = true
  zoom = autoZoom()
  apply()
  scroller.scrollTo(0, 0)
  track()
  if (!fromHistory && location.hash !== '#resume') history.pushState({ reader: true }, '', '#resume')
  if (current?.lang !== root.dataset.lang || state === 'error') show(root.dataset.lang)
}

// Back closes the sheet, so on a phone the swipe-back gesture does what it looks like.
function close() {
  if (!dialog.open || dialog.classList.contains('is-closing')) return
  if (history.state?.reader) return history.back()
  if (location.hash === '#resume') history.replaceState(null, '', location.pathname + location.search)
  dismiss()
}

function dismiss() {
  if (!dialog.open) return
  if (reduced.matches) return dialog.close()
  dialog.classList.add('is-closing')
  const done = () => {
    clearTimeout(backstop)
    dialog.removeEventListener('animationend', end)
    dialog.classList.remove('is-closing')
    dialog.close()
  }
  const end = (e) => e.animationName === 'reader-sink' && done()
  const backstop = setTimeout(done, 600)
  dialog.addEventListener('animationend', end)
}

addEventListener('popstate', () => {
  if (location.hash === '#resume') open({ fromHistory: true })
  else dismiss()
})

dialog.addEventListener('cancel', (e) => {
  e.preventDefault()
  close()
})
// Esc can close a dialog outright when the browser refuses to let cancel be held.
dialog.addEventListener('close', () => {
  if (location.hash !== '#resume') return
  if (history.state?.reader) history.back()
  else history.replaceState(null, '', location.pathname + location.search)
})
dialog.querySelector('.reader__close').addEventListener('click', close)

// Only a press that starts and ends on the backdrop closes: a text selection
// dragged out past the sheet's edge must not.
const outside = (e) => {
  const r = dialog.getBoundingClientRect()
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
}
let downOutside = false
dialog.addEventListener('pointerdown', (e) => (downOutside = e.target === dialog && outside(e)))
dialog.addEventListener('click', (e) => {
  if (downOutside && e.target === dialog && outside(e)) close()
  downOutside = false
})

// Pull the header down to put the sheet away.
let drag = null
head.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('a, button')) return
  drag = { y: e.clientY, t: e.timeStamp, dy: 0, id: e.pointerId }
  head.setPointerCapture(e.pointerId)
})
head.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return
  drag.dy = Math.max(0, e.clientY - drag.y)
  dialog.classList.add('is-dragging')
  dialog.style.setProperty('--drag', `${drag.dy}px`)
})
const release = (e) => {
  if (!drag) return
  const { dy, t } = drag
  drag = null
  dialog.classList.remove('is-dragging')
  if (dy > 120 || (dy > 36 && dy / Math.max(1, e.timeStamp - t) > 0.5)) close()
  else dialog.style.removeProperty('--drag')
}
head.addEventListener('pointerup', release)
head.addEventListener('pointercancel', release)

dialog.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === '+' || e.key === '=') step(1)
  else if (e.key === '-' || e.key === '_') step(-1)
  else if (e.key === '0') fit()
  else if (e.key === '?') keys()
  else return
  e.preventDefault()
})

// The sheet's ko/en buttons are the site's own toggles, so a change from either
// side lands here and reprints in the other language.
new MutationObserver(() => {
  titles()
  if (!dialog.open) return
  if (root.dataset.lang !== shown) show(root.dataset.lang)
  else status()
}).observe(root, { attributes: true, attributeFilter: ['data-lang'] })

// ---- entry points -------------------------------------------------------------------

addEventListener('click', (e) => {
  const a = e.target.closest?.('a[data-reader]')
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  open()
})

for (const el of document.querySelectorAll('a[data-reader], [data-cmd="/resume"]')) {
  el.addEventListener('pointerenter', warm, { once: true })
  el.addEventListener('focus', warm, { once: true })
}
document.querySelector('.composer input')?.addEventListener('input', (e) => {
  if (/^(\/re|cat r|open)/.test(e.target.value)) warm()
})

window.reader = { open, close, warm }
if (location.hash === '#resume') open({ fromHistory: true })
