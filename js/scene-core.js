// Shared plumbing for the WebGL scenes: palette read off the live stylesheet so
// the dark, light and hidden Redis themes all work, three fetched only when a
// mount is about to be seen, and one still frame when less motion was asked for.

const THREE_URL = 'https://unpkg.com/three@0.186.0/build/three.module.js'
const TOKENS = ['bg', 'bg-2', 'fg', 'dim', 'faint', 'rule', 'claude', 'ok']

const root = document.documentElement
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)')

export const dpr = () => Math.min(devicePixelRatio || 1, 2)

export function readTokens() {
  const style = getComputedStyle(root)
  const out = {}
  for (const t of TOKENS) out[t] = style.getPropertyValue(`--${t}`).trim()
  return out
}

let loading = null
function loadThree() {
  loading ??= import(THREE_URL).catch(err => {
    loading = null // a blip should not poison the second mount
    throw err
  })
  return loading
}

// factory({ THREE, canvas, width, height, tokens, still }) returns
// { render(t, dt), resize(w, h), retint(tokens) }.
export function mount(el, factory) {
  if (!el) return

  const near = new IntersectionObserver(
    entries => {
      if (!entries.some(e => e.isIntersecting)) return
      near.disconnect()
      start()
    },
    { rootMargin: '200px' },
  )
  near.observe(el)

  async function start() {
    let THREE
    try {
      THREE = await loadThree()
    } catch {
      el.dataset.scene = 'unavailable' // the CSS still frame stays
      return
    }

    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    el.append(canvas)

    let w = el.clientWidth
    let h = el.clientHeight
    let raf = 0
    let paused = true
    let onScreen = true
    let last = performance.now()

    let scene
    try {
      scene = factory({
        THREE,
        canvas,
        width: w,
        height: h,
        tokens: readTokens(),
        still: lessMotion.matches,
      })
    } catch (err) {
      canvas.remove()
      el.dataset.scene = 'unavailable'
      throw err
    }

    el.dataset.scene = 'ready'

    const once = () => scene.render(performance.now() / 1000, 0)

    const frame = now => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      scene.render(now / 1000, dt)
      raf = requestAnimationFrame(frame)
    }

    // Off-screen, a background tab, or a reduced-motion request all cost nothing
    // beyond the frame already on screen.
    const gate = () => {
      const run = !lessMotion.matches && !document.hidden && onScreen
      if (run === !paused) return
      paused = !run
      if (paused) {
        cancelAnimationFrame(raf)
        raf = 0
      } else {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    // A phone's URL bar collapsing mid-scroll changes the viewport height by a few
    // tens of pixels, and re-fitting a scene on every one of those reads as the
    // background reloading under the page. Width always counts; height only when it
    // moves enough to be a real layout change rather than browser chrome.
    const CHROME_PX = 130

    new ResizeObserver(() => {
      const nw = el.clientWidth
      const nh = el.clientHeight
      if (nw === w && Math.abs(nh - h) < CHROME_PX) return
      w = nw
      h = nh
      scene.resize(w, h)
      if (paused) once()
    }).observe(el)

    new MutationObserver(repaint).observe(root, { attributeFilter: ['data-theme'] })
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', repaint)

    function repaint() {
      scene.retint(readTokens())
      if (paused) once()
    }

    new IntersectionObserver(entries => {
      onScreen = entries.some(e => e.isIntersecting)
      gate()
    }).observe(el)

    document.addEventListener('visibilitychange', gate)
    lessMotion.addEventListener('change', () => {
      gate()
      if (paused) once()
    })

    once()
    gate()
  }
}
