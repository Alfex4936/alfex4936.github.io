// Page backdrop: an isometric Seoul behind the whole page. The mask holds the scene at
// full ink in the two gutters the transcript leaves and drops it to 14% behind the
// column, so everything built to be looked at — the landmarks, the figures, the
// messages — lives out in those gutters and the middle of the frame is left as ground.
// Messages leave a rooftop, arc over their own gutter and drop into a datastore, where
// one disc lights and settles. Scrolling flies the view along the city.

import { dpr } from './scene-core.js'

// ---- colour --------------------------------------------------------------
// Every mix happens on sRGB bytes and enters three through setRGB(…, SRGBColorSpace).
// A linear-space lerp of an ink ramp lands about twice as bright and breaks the budget.

const bytes = (css) => {
  const h = css.trim().slice(1)
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const chan = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const lum = (c) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2])
const ratio = (a, b) => {
  const x = lum(a) + 0.05
  const y = lum(b) + 0.05
  return x > y ? x / y : y / x
}
const blend = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

// Smallest t on a→b, at or above `from`, clearing `target` against the page
// background. Holds the value dark was signed off with, lifts it only where a theme
// needs it: on paper --rule is a 4% step off --bg and the line dies without this.
const solve = (a, b, bg, target, from) => {
  let lo = from
  let hi = 1
  if (ratio(blend(a, b, lo), bg) >= target) return lo
  if (ratio(blend(a, b, hi), bg) < target) return hi
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2
    if (ratio(blend(a, b, m), bg) >= target) hi = m
    else lo = m
  }
  return hi
}

const CITY_MIN = 2.5 // the city fills the frame behind prose: legible, never loud
const CITY_FLOOR = 0.3
const STORE_MIN = 3.2 // the datastores are the landmarks, so a step above the blocks
const STORE_FLOOR = 0.52
const FIG_MIN = 3.8 // 17px of figure has to survive on paper
const FIG_FLOOR = 0.66
const OK_MIN = 3.4 // the bubble rim, solved on --ok instead of on the ink ramp
const OK_FLOOR = 0.4
const WARM_MIN = 4.6 // a heart is an outline with no body behind it, unlike the bubble rim
const BODY_T = 0.36 // and the body is that rim pulled back toward the page

const palette = (tokens) => {
  const bg = bytes(tokens.bg)
  const dim = bytes(tokens.dim)
  const rule = bytes(tokens.rule)
  const rimT = solve(bg, bytes(tokens.ok), bg, OK_MIN, OK_FLOOR)
  return {
    bg2: bytes(tokens['bg-2']),
    fg: bytes(tokens.fg),
    dim, // nothing in the city is brighter than a --dim edge
    edge: blend(rule, dim, solve(rule, dim, bg, CITY_MIN, CITY_FLOOR)),
    store: blend(rule, dim, solve(rule, dim, bg, STORE_MIN, STORE_FLOOR)),
    fig: blend(rule, dim, solve(rule, dim, bg, FIG_MIN, FIG_FLOOR)),
    okRim: blend(bg, bytes(tokens.ok), rimT),
    okBody: blend(bg, bytes(tokens.ok), rimT * BODY_T),
    warm: blend(bg, bytes(tokens.claude), solve(bg, bytes(tokens.claude), bg, WARM_MIN, OK_FLOOR)),
    rimT,
  }
}

// ---- layout --------------------------------------------------------------
// u is screen-right, v is screen-depth and also pure screen-down. Iso maps
// u=(x-z)/√2, v=(x+z)/√2, so a point (u,v) sits at x=(u+v)/√2, z=(v-u)/√2. Blocks stay
// axis-aligned in x/z, which puts the streets on the two screen diagonals.

const ISQ2 = Math.SQRT1_2
const UP_Y = 0.81649658 // screen-Y per unit of world-Y
const DOWN_V = 0.5773503 // screen-Y per unit of v
const RX = ISQ2 // screen-right in world is (RX, 0, -RX)
const UX = -0.40824829 // and screen-up is (UX, UP_Y, UX)

const SCALE = 46 // px per world unit: the drawing does not zoom, it fits
const PAN_PX = 170 // total screen travel from scroll top to bottom
const PAN_TAU = 0.32 // so a flicked wheel arrives as a glide

const CELL = 2.4 // one plot; a block fills a third to two thirds of it, rest is street
const U_HALF = 26 // built half-width in u: covers a 2390px frame at SCALE
const V_BACK = 26 // 690px of city above centre
const V_FWD = 30 // and enough below it to outlast the pan

const AVE_I = 5 // every fifth plot one way and every seventh the other is an avenue
const AVE_J = 7
const LOW = 0.62 // most of what is left never leaves the low-rise carpet

// The mask runs the scene at 14% inside 392px of the frame centre and back to full ink
// by 448px. That boundary is INK_U out in u, and nothing meant to be looked at is
// built inside it; GUTTER_U adds the room a bubble needs for its own width.
const INK_U = 448 / SCALE
const GUTTER_U = INK_U + 0.85
// The river's own band, in v. Placed in the gap between the Gyeongbokgung and 63
// clusters so no set piece has to stand in the water.
const RIVER_V = 9.2
const RIVER_HALF = 1.75

const GUT_KEEP = 0.46 // of the plots the avenues leave, out where the ink is full
const MID_KEEP = 0.18 // and a sparse ankle-high floor behind the column
const MID_H = 0.2

const FACE = { px: 0, nx: 4, py: 8, ny: 12, pz: 16, nz: 20 }
// Faces are cut from the page, not lit: the darkest side sits a hair above --bg-2.
// Slots run [top, +x, +z, away] for every primitive, boxes, drums and roofs alike.
const RAMP = {
  city: { top: 0.105, pz: 0.058, px: 0.024, dark: 0.008 },
  mark: { top: 0.128, pz: 0.073, px: 0.032, dark: 0.009 }, // a landmark's own walls
  stone: { top: 0.082, pz: 0.048, px: 0.021, dark: 0.008 }, // platforms and gate bases
  roof: { top: 0.17, pz: 0.152, px: 0.086, dark: 0.016 }, // tile, and nothing else
  store: { top: 0.135, pz: 0.075, px: 0.032, dark: 0.01 },
  fig: { top: 0.2, pz: 0.14, px: 0.085, dark: 0.045 },
  // Flat by design: the river is one surface seen from above, so every slot is the
  // same and it sits below the carpet's 0.105 to read as water rather than ground.
  water: { top: 0.042, pz: 0.042, px: 0.042, dark: 0.042 },
  // The deck is the one horizontal surface meant to be read as a surface, so it sits
  // clear of the carpet's 0.105 rather than alongside it.
  deck: { top: 0.215, pz: 0.11, px: 0.05, dark: 0.012 },
  // An opening, not a surface. Isometric never sees through a gate, so the arch only
  // reads if what sits behind it is darker than the stone - which, like the water,
  // means the value has to flip with the theme.
  gate: { top: 0.004, pz: 0.004, px: 0.004, dark: 0.004 },
}
const LIT_INK = 0.14 // how far a landed disc lifts its top face
const LIT_TAU = 0.44
const BREATHE = 0.055 // the stack is never quite still, so it reads as in use

// What a delivery does to the thing it lands on. Every target owns a slice of `parts`,
// and the kind decides how that slice lights: a settle, a beacon, a band running up.
const FX_LIFE = 1.6 // after this the slice is painted back to rest and forgotten
const FX_INK = 0.22 // a delivery is an event; it moves further than the stack's idle breath
const BLIP_LIFE = 1.15
const NFX = 8 // rings and hearts alive at once
const FXSEG = 26 // segments in one closed loop
const RING_LIFE = 1.15
const RING_R0 = 0.16
const RING_R1 = 0.95 // any wider and the ripple climbs out of the river onto the bank
const HEART_LIFE = 1.7
const FX = {
  glow: (age) => Math.exp(-age / 0.6),
  ripple: (age) => Math.exp(-age / 0.6),
  blink: (age) => Math.max(0, Math.cos(age * 17)) * Math.max(0, 1 - age / 1.05),
  climb: (age, i, n) => Math.exp(-(((i + 0.5) / n - age / 0.85) ** 2) * 90),
}

const DISCS = 5
const DISC_R = 0.8
const DISC_H = 0.17
const DISC_GAP = 0.075
const DISC_Y = (k) => k * (DISC_H + DISC_GAP)
const STACK_TOP = DISCS * DISC_H + (DISCS - 1) * DISC_GAP
const DISC_SCALE = (k) => (k === 0 ? 1.15 : 1 - k * 0.04) // a wider base, a slight taper

// A tiled roof is the one shape here that cannot be a prism: the eave ring lofts up to
// a short ridge, the section is shallow at the eave and steep at the ridge, and the
// four corners sweep up and out. That sweep is the whole recognition.
const ROOF_R = 3 // rings from eave to ridge
const ROOF_FLARE = 0.17 // how far the corners push out in plan
const ROOF_TURN = 0.36 // and how far they lift, as a share of the ridge height
const ROOF_RIDGE = 0.44 // ridge length as a share of the roof's own length

const BW = 0.27 // the bubble, in screen units: 25px across, 17 tall
const BH = 0.19
const BR = 0.085
const MAXB = 5 // a handful in flight, never a stream
const SEND_MIN = 0.95
const SEND_VAR = 0.9
const PHONE_EVERY = 8.5 // the tapper sends on his own clock

// Narrow legs, wide shoulders, small head: at 21px tall the step in and out at the
// waist is the whole difference between a person and a stack of blocks.
const FIG_LEG = [0.1, 0.22, 0.1]
const FIG_TORSO = [0.18, 0.175, 0.12]
const FIG_HEAD = [0.095, 0.135, 0.095]
const FIG_NECK = 0.02 // the head clears the shoulders, or the pair reads as one post
const FIG_H = 0.55 // legs, torso, neck gap and head, which is 21px on the page
const FIG_ARM = [0.045, 0.2, 0.045] // raised to the chin: the one silhouette that says sending
const ARM_U = 0.115 // offset in screen-u; an equal +x+z is pure screen-down and hides behind the torso
const ARM_V = 0.04
const FIG_BOXES = 4
const WALK = 1.15 // half the walker's beat, in world x; keeps him inside his gutter

// One datastore per gutter, sat outboard of the landmarks so the inner ring is set
// pieces. Ten figures, spread down both sides, all of them clear of INK_U.
const STORES = [
  { u: -13.4, v: -12 },
  { u: 13.6, v: 15 },
]
const FIGS = [
  { u: -11.9, v: -10, kind: 2 }, // taps a phone up the street from the left-hand store
  { u: -13.9, v: 1.7, kind: 1 },
  { u: -11.5, v: 11, kind: 0 },
  { u: -12.8, v: -5.4, kind: 0 },
  { u: -10.6, v: 19.2, kind: 1 },
  { u: 13.9, v: -3.5, kind: 0 },
  { u: 11.9, v: 6.8, kind: 1 },
  { u: 11.5, v: 18.5, kind: 0 },
  { u: 12.7, v: -12.6, kind: 2 }, // and one sending from the right-hand side
  { u: 10.8, v: 22.4, kind: 0 },
]

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const approach = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau))

// Layout is hashed, not random: the same city every load, and no array of seeds.
const rnd = (i, j, k) => {
  let h = Math.imul(i + 1013, 374761393) ^ Math.imul(j + 2557, 668265263)
  h = Math.imul(h ^ (k + 7919), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// Low-frequency, so the taller blocks arrive in districts rather than as noise.
const district = (u, v) =>
  0.5 + 0.28 * Math.sin(u * 0.19 + v * 0.07) + 0.22 * Math.sin(v * 0.23 - u * 0.05 + 2.1)

export default function city({ THREE, canvas, width, height, tokens, still }) {
  const SRGB = THREE.SRGBColorSpace
  let P = palette(tokens)

  const _c1 = new THREE.Color()
  const _c2 = new THREE.Color()

  const put = (out, c) => out.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, SRGB)
  const ink = (t, out) => put(out, blend(P.bg2, P.fg, clamp01(Math.min(t, 0.95))))

  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setClearAlpha(0)

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900)
  camera.position.set(260, 260, 260) // normalize(1,1,1): 45° around Y, atan(1/√2) down
  camera.lookAt(0, 0, 0)

  const world = new THREE.Group() // the pan lives here
  scene.add(world)

  let W = Math.max(1, width)
  let H = Math.max(1, height)
  let sc = SCALE
  let panV = 0
  let panMax = 0
  let panTarget = 0
  let uVis = 12
  let vVis = 18

  // ---- templates ---------------------------------------------------------
  const tpl = (g, thresh) => {
    const e = new THREE.EdgesGeometry(g, thresh)
    const out = {
      pos: Float32Array.from(g.attributes.position.array),
      nrm: Float32Array.from(g.attributes.normal.array),
      idx: Array.from(g.index.array),
      edge: Float32Array.from(e.attributes.position.array),
    }
    g.dispose()
    e.dispose()
    return out
  }

  const boxT = (() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0) // base at y=0, so a height is a scale
    return tpl(g, 1)
  })()
  const BOXV = boxT.pos.length / 3
  const BOXE = boxT.edge.length / 3

  const cylT = (() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 24, 1)
    g.translate(0, 0.5, 0)
    return tpl(g, 20) // 15° between barrel facets, so only the rims survive
  })()
  const CYLV = cylT.pos.length / 3
  const CYLE = cylT.edge.length / 3

  // Which of the four ramp slots each template vertex takes. A drum gets the same
  // three-face treatment as a box: the split runs down the corner nearest the camera,
  // and the half facing away is never drawn.
  const boxFace = (() => {
    const f = new Uint8Array(BOXV).fill(3)
    for (let i = 0; i < 4; i++) {
      f[FACE.py + i] = 0
      f[FACE.px + i] = 1
      f[FACE.pz + i] = 2
    }
    return f
  })()
  const cylFace = (() => {
    const f = new Uint8Array(CYLV)
    for (let i = 0; i < CYLV; i++) {
      const nx = cylT.nrm[i * 3]
      const ny = cylT.nrm[i * 3 + 1]
      const nz = cylT.nrm[i * 3 + 2]
      f[i] = ny > 0.5 ? 0 : ny < -0.5 ? 3 : nx >= nz ? 1 : 2
    }
    return f
  })()

  // ---- painting ----------------------------------------------------------
  const tone = new Float32Array(12)
  // A disc shows its top face and little else; a mast shows two narrow sides and no
  // top at all, so a reaction that only lifts `top` is invisible on half the city.
  const tones = (r, lit = 0, k = LIT_INK) => {
    const s = lit * k
    const steps = [r.top + s, r.px + s * 0.62, r.pz + s * 0.62, r.dark + s * 0.3]
    for (let f = 0; f < 4; f++) {
      ink(steps[f], _c1)
      tone[f * 3] = _c1.r
      tone[f * 3 + 1] = _c1.g
      tone[f * 3 + 2] = _c1.b
    }
  }

  const boxRamp = (r) => {
    const out = new Float32Array(BOXV * 3)
    const face = (start, t) => {
      ink(t, _c1)
      for (let i = start; i < start + 4; i++) {
        out[i * 3] = _c1.r
        out[i * 3 + 1] = _c1.g
        out[i * 3 + 2] = _c1.b
      }
    }
    face(FACE.py, r.top)
    face(FACE.pz, r.pz)
    face(FACE.px, r.px)
    face(FACE.nx, r.dark)
    face(FACE.ny, r.dark)
    face(FACE.nz, r.dark)
    return out
  }

  const spread = (attr, src, n) => {
    for (let k = 0; k < n; k++) attr.array.set(src, k * src.length)
    attr.needsUpdate = true
  }

  // ---- the city ----------------------------------------------------------
  // Boxes, drums and roof surfaces all land in these arrays and leave as one mesh and
  // one line pass. A quarter of the buildings that used to be here, so the build is a
  // few thousand pushes and the typed-array preallocation it needed is gone.
  const cPos = []
  const cIdx = []
  const cEdge = []
  const parts = [] // { v0, n, ramp, face } — what a theme change walks

  const emitBox = (x, y, z, w, h, d, ramp = RAMP.city) => {
    const v0 = cPos.length / 3
    for (let i = 0; i < BOXV * 3; i += 3)
      cPos.push(boxT.pos[i] * w + x, boxT.pos[i + 1] * h + y, boxT.pos[i + 2] * d + z)
    for (let i = 0; i < boxT.idx.length; i++) cIdx.push(boxT.idx[i] + v0)
    for (let i = 0; i < BOXE * 3; i += 3)
      cEdge.push(boxT.edge[i] * w + x, boxT.edge[i + 1] * h + y, boxT.edge[i + 2] * d + z)
    parts.push({ v0, n: BOXV, ramp, face: boxFace })
  }

  const emitCyl = (x, y, z, r, h, ramp) => {
    const v0 = cPos.length / 3
    for (let i = 0; i < CYLV * 3; i += 3)
      cPos.push(cylT.pos[i] * r + x, cylT.pos[i + 1] * h + y, cylT.pos[i + 2] * r + z)
    for (let i = 0; i < cylT.idx.length; i++) cIdx.push(cylT.idx[i] + v0)
    for (let i = 0; i < CYLE * 3; i += 3)
      cEdge.push(cylT.edge[i] * r + x, cylT.edge[i + 1] * h + y, cylT.edge[i + 2] * r + z)
    parts.push({ v0, n: CYLV, ramp, face: cylFace })
  }

  const line = (a, b, c, d, e, f) => cEdge.push(a, b, c, d, e, f)

  // A flat quad in any orientation, which a box cannot give: boxes are axis-aligned
  // in x/z, and anything running along u is diagonal there, so a strip of boxes would
  // come out as a staircase. Four verts, two triangles, every slot the top face.
  const QUAD_FACE = [0, 0, 0, 0]
  const emitQuad = (p0, p1, p2, p3, ramp) => {
    const v0 = cPos.length / 3
    for (const p of [p0, p1, p2, p3]) cPos.push(p[0], p[1], p[2])
    cIdx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3)
    parts.push({ v0, n: 4, ramp, face: QUAD_FACE })
  }

  // hx, hz are the eave half-extents before the corners flare; rise is ridge over eave.
  // n perimeter samples, a multiple of four so the corners land on samples.
  const emitRoof = (cx, y, cz, hx, hz, rise, n, ribs) => {
    const seg = n / 4
    const rx = hx * ROOF_RIDGE
    const ring = new Float64Array((ROOF_R + 1) * n * 3)
    const slope = new Uint8Array(n)
    for (let e = 0; e < 4; e++) {
      for (let s = 0; s < seg; s++) {
        const t = s / seg
        const ex = e === 1 ? hx : e === 3 ? -hx : e === 0 ? -hx + 2 * hx * t : hx - 2 * hx * t
        const ez = e === 0 ? -hz : e === 2 ? hz : e === 1 ? -hz + 2 * hz * t : hz - 2 * hz * t
        const k = Math.min(Math.abs(ex) / hx, Math.abs(ez) / hz)
        const out = 1 + ROOF_FLARE * k ** 3
        const fx = ex * out
        const fz = ez * out
        const ey = rise * ROOF_TURN * k ** 2.4 // the corner turns up
        const tx = Math.max(-rx, Math.min(rx, fx)) // and folds back onto the ridge
        const i = e * seg + s
        slope[i] = e === 2 ? 2 : e === 1 ? 1 : 3
        for (let r = 0; r <= ROOF_R; r++) {
          const p = r / ROOF_R
          const o = (r * n + i) * 3
          ring[o] = cx + fx + (tx - fx) * p
          ring[o + 1] = y + ey + (rise - ey) * p ** 1.5 // shallow at the eave, steep at the ridge
          ring[o + 2] = cz + fz * (1 - p)
        }
      }
    }

    // Non-indexed quads: a fold between two slopes has to stay a fold, and a shared
    // corner vertex would smear one ramp step into the next.
    const v0 = cPos.length / 3
    const face = new Uint8Array(n * ROOF_R * 4)
    let fi = 0
    for (let r = 0; r < ROOF_R; r++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const q = [(r * n + i) * 3, (r * n + j) * 3, ((r + 1) * n + j) * 3, ((r + 1) * n + i) * 3]
        const b = cPos.length / 3
        for (const o of q) cPos.push(ring[o], ring[o + 1], ring[o + 2])
        cIdx.push(b, b + 2, b + 1, b, b + 3, b + 2)
        face[fi++] = slope[i]
        face[fi++] = slope[i]
        face[fi++] = slope[i]
        face[fi++] = slope[i]
      }
    }
    parts.push({ v0, n: n * ROOF_R * 4, ramp: RAMP.roof, face })

    for (let i = 0; i < n; i++) {
      const a = i * 3
      const b = ((i + 1) % n) * 3
      line(ring[a], ring[a + 1], ring[a + 2], ring[b], ring[b + 1], ring[b + 2])
    }
    const up = (i) => {
      for (let r = 0; r < ROOF_R; r++) {
        const a = (r * n + i) * 3
        const b = ((r + 1) * n + i) * 3
        line(ring[a], ring[a + 1], ring[a + 2], ring[b], ring[b + 1], ring[b + 2])
      }
    }
    for (let e = 0; e < 4; e++) up(e * seg) // the four hips
    if (ribs) for (const e of [1, 2]) for (let s = 1; s < seg; s++) up(e * seg + s)
    emitBox(cx, y + rise, cz, 2 * rx + 0.16, 0.085 + 0.09 * rise, 0.17, RAMP.stone) // 용마루
  }

  // ---- landmarks ---------------------------------------------------------
  // Each is placed by the (u, v) it should read at and built in world x/z around that
  // point, so a gutter position stays a gutter position. `keep` is the plan half-extent
  // the carpet has to leave alone.
  const roofs = []
  const keepOut = []
  const at = (u, v) => [(u + v) * ISQ2, (v - u) * ISQ2]

  // What got built and where, so harness-building.html can walk the scene piece by
  // piece instead of me hunting for one shop block in a corner of a screenshot.
  // Every primitive lands in the same two buffers in build order, so a piece is a
  // contiguous slice of each: mark() opens one, the note after the build closes it.
  // Recording only; nothing on the page reads it.
  const catalog = []
  let mi = 0
  let me = 0
  const mark = () => {
    mi = cIdx.length
    me = cEdge.length
  }
  const note = (name, u, v, h = 1, more) =>
    catalog.push({
      name, u, v, h, i0: mi, iN: cIdx.length - mi, e0: me, eN: cEdge.length - me,
      ...more,
    })

  // A wooded hill, a banded shaft out of it, the observation drum, a mast.
  // The real one is mostly mast: the antenna is about a third of everything above the
  // mountain, the deck is several floors flaring out over a slender shaft, and the
  // hill it stands on is half the silhouette. Getting those three proportions right is
  // the whole recognition; the previous drum-on-a-stick had none of them.
  const namsan = (u, v) => {
    const [x, z] = at(u, v)
    emitBox(x, 0, z, 3.4, 0.44, 2.9, RAMP.stone)
    emitBox(x + 0.12, 0.44, z - 0.06, 2.5, 0.4, 2.1, RAMP.stone)
    emitBox(x + 0.18, 0.84, z - 0.1, 1.6, 0.38, 1.35, RAMP.stone)
    const trees = [
      [-1.3, -0.95, 0.52],
      [1.25, 0.95, 0.44],
      [-0.25, 1.3, 0.48],
      [1.4, -1.05, 0.38],
      [-1.5, 0.6, 0.35],
      [0.95, -1.35, 0.42],
      [-0.9, -1.25, 0.34],
    ]
    for (const [dx, dz, th] of trees) emitBox(x + dx, 0.4, z + dz, 0.46, th, 0.46, RAMP.mark)

    const cx = x + 0.18
    const cz = z - 0.1
    emitBox(cx, 1.22, cz, 0.92, 0.26, 0.78, RAMP.mark) // the base building on the summit
    // A slender shaft, tapering, so the deck above it reads as overhanging.
    emitBox(cx, 1.48, cz, 0.36, 0.46, 0.36, RAMP.mark)
    emitBox(cx, 1.94, cz, 0.31, 0.44, 0.31, RAMP.mark)
    emitBox(cx, 2.38, cz, 0.27, 0.42, 0.27, RAMP.mark)
    // The deck flares out over it and is several floors, not one drum.
    emitCyl(cx, 2.8, cz, 0.34, 0.08, RAMP.store)
    emitCyl(cx, 2.88, cz, 0.52, 0.09, RAMP.store)
    emitCyl(cx, 2.97, cz, 0.6, 0.2, RAMP.store)
    emitCyl(cx, 3.17, cz, 0.55, 0.13, RAMP.store)
    emitCyl(cx, 3.3, cz, 0.43, 0.11, RAMP.store)
    emitCyl(cx, 3.41, cz, 0.24, 0.1, RAMP.mark)
    // And then the mast, which is the part that makes it Namsan from a long way off.
    const mast = parts.length
    emitBox(cx, 3.51, cz, 0.11, 0.62, 0.11, RAMP.mark)
    emitBox(cx, 4.13, cz, 0.07, 0.52, 0.07, RAMP.mark)
    roofs.push({ u, v, y: 3.41, kind: 'blink', a: mast, b: parts.length, ax: cx, ay: 4.7, az: cz })
    keepOut.push([x, z, 1.9, 1.65])
  }

  // Ten courses that narrow and lean, then a crown with a notch cut out of it.
  const lotte = (u, v) => {
    const [x, z] = at(u, v)
    emitBox(x, 0, z, 1.9, 0.3, 1.7, RAMP.stone)
    // Ten fat courses read as a stone pagoda, not a supertall. The profile has to be
    // smooth, so it is many thin courses instead - the steps disappear and what is
    // left is the slender concave taper the real one has, then the split crown.
    const N = 30
    const CH = 0.165
    let y = 0.3
    let b = 0
    const shaft = parts.length
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1)
      const w = 1.12 - 0.72 * Math.pow(t, 0.86)
      b = 0.2 * t * t
      emitBox(x + b, y, z + b * 0.6, w, CH, w * 0.88, RAMP.mark)
      y += CH
    }
    emitBox(x + b - 0.11, y, z + b * 0.6, 0.15, 0.62, 0.34, RAMP.mark)
    emitBox(x + b + 0.11, y, z + b * 0.6, 0.15, 0.62, 0.34, RAMP.mark)
    roofs.push({ u, v, y: y + 0.62, kind: 'climb', a: shaft, b: parts.length })
    keepOut.push([x, z, 1.15, 1.05])
  }

  // 근정전: stone platform, a colonnade standing off a recessed wall, two tiers of tile.
  const geunjeongjeon = (u, v) => {
    const [x, z] = at(u, v)
    emitBox(x, 0, z, 3.3, 0.24, 2.8, RAMP.stone)
    emitBox(x, 0.24, z, 2.7, 0.22, 2.25, RAMP.stone)
    const fy = 0.46
    emitBox(x, fy, z, 1.9, 0.58, 1.55, RAMP.mark)
    for (let k = -2; k <= 2; k++) emitBox(x + k * 0.56, fy, z + 0.88, 0.14, 0.66, 0.14, RAMP.mark)
    for (let k = -1; k <= 1; k++) emitBox(x + 1.12, fy, z + k * 0.56, 0.14, 0.66, 0.14, RAMP.mark)
    const tile = parts.length
    emitRoof(x, fy + 0.66, z, 1.55, 1.24, 0.62, 32, true)
    const uy = fy + 0.66 + 0.58
    emitBox(x, uy, z, 1.35, 0.42, 1.1, RAMP.mark)
    emitRoof(x, uy + 0.42, z, 1.18, 0.95, 0.56, 32, true)
    roofs.push({ u, v, y: uy + 0.42 + 0.56, kind: 'glow', a: tile, b: parts.length })
    keepOut.push([x, z, 2.0, 1.7])
  }

  // 숭례문: two piers with a corbelled arch between them, then the two-tier gatehouse.
  const sungnyemun = (u, v) => {
    const [x, z] = at(u, v)
    const bw = 2.5
    const bd = 1.8
    const bh = 0.92
    const pier = 0.78
    const half = bw / 2 - pier / 2
    const gate = parts.length
    emitBox(x - half, 0, z, pier, bh, bd, RAMP.stone)
    emitBox(x + half, 0, z, pier, bh, bd, RAMP.stone)
    emitBox(x, 0, z, bw - 2 * pier + 0.06, bh * 0.86, bd * 0.86, RAMP.gate) // the opening
    const gateEnd = parts.length
    const lip = bw / 2 - pier
    for (let s = 1; s <= 3; s++) {
      const inset = 0.17 * s
      const ys = 0.48 + (s - 1) * 0.1
      emitBox(x - lip + inset / 2, ys, z, inset, 0.1, bd, RAMP.stone)
      emitBox(x + lip - inset / 2, ys, z, inset, 0.1, bd, RAMP.stone)
    }
    emitBox(x, 0.78, z, bw, bh - 0.78, bd, RAMP.stone)
    emitBox(x, bh, z, bw + 0.22, 0.16, bd + 0.18, RAMP.stone) // 여장
    emitBox(x, bh + 0.16, z, 1.7, 0.42, 1.15, RAMP.mark)
    emitRoof(x, bh + 0.58, z, 1.42, 0.98, 0.5, 32, true)
    const uy = bh + 0.58 + 0.46
    emitBox(x, uy, z, 1.2, 0.32, 0.82, RAMP.mark)
    emitRoof(x, uy + 0.32, z, 1.16, 0.8, 0.44, 32, true)
    roofs.push({ u, v, y: uy + 0.32 + 0.44, kind: 'glow', a: gate, b: gateEnd })
    keepOut.push([x, z, 1.75, 1.3])
  }

  // A slab with the top edge cut on the diagonal, stepped fine enough to read as one.
  const bldg63 = (u, v) => {
    const [x, z] = at(u, v)
    emitBox(x, 0, z, 2.0, 0.26, 1.3, RAMP.stone)
    emitBox(x, 0.26, z, 1.5, 2.85, 0.9, RAMP.mark)
    // The top is one clean diagonal, not a staircase. Boxes cannot cut a slope, so
    // the wedge is quads: the sloped face and a triangle closing each end.
    const hw = 0.75
    const hd = 0.45
    const y0 = 3.11
    const y1 = 3.94
    const P = (dx, yy, dz) => [x + dx, yy, z + dz]
    const crown = parts.length
    emitQuad(P(-hw, y0, -hd), P(hw, y1, -hd), P(hw, y1, hd), P(-hw, y0, hd), RAMP.mark)
    for (const sd of [-hd, hd])
      emitQuad(P(-hw, y0, sd), P(hw, y1, sd), P(hw, y0, sd), P(hw, y0, sd), RAMP.mark)
    line(x - hw, y0, z - hd, x + hw, y1, z - hd)
    line(x - hw, y0, z + hd, x + hw, y1, z + hd)
    line(x + hw, y0, z - hd, x + hw, y1, z - hd)
    line(x + hw, y0, z + hd, x + hw, y1, z + hd)
    roofs.push({ u, v, y: y0, kind: 'blink', a: crown, b: parts.length, ax: x + hw, ay: y1, az: z })
    keepOut.push([x, z, 1.2, 0.85])
  }

  // 한옥: four small tiled roofs around a yard. Texture near the ground, not a focus.
  const hanok = (u, v) => {
    const [x, z] = at(u, v)
    const house = (dx, dz, w, d) => {
      const a = parts.length
      emitBox(x + dx, 0, z + dz, w * 0.78, 0.36, d * 0.78, RAMP.mark)
      emitRoof(x + dx, 0.36, z + dz, w * 0.6, d * 0.6, 0.28, 16, false)
      const ru = u + (dx - dz) * ISQ2
      roofs.push({ u: ru, v: v + (dx + dz) * ISQ2, y: 0.64, kind: 'glow', a, b: parts.length })
    }
    house(-0.72, -0.6, 1.4, 0.9)
    house(0.78, -0.5, 1.1, 0.85)
    house(-0.55, 0.82, 1.0, 0.95)
    house(0.85, 0.9, 0.9, 1.05)
    keepOut.push([x, z, 1.7, 1.7])
  }

  // 한강. The one thing that crosses the whole frame. It runs along u, so it projects
  // screen-horizontal, and behind the column the mask leaves it at 8% - enough to read
  // as continuing, which is what stops the two gutters looking like two cities.
  const river = () => {
    const nearV = RIVER_V - RIVER_HALF
    const farV = RIVER_V + RIVER_HALF
    const uEnd = U_HALF + 4
    const c = (uu, vv) => {
      const [xx, zz] = at(uu, vv)
      return [xx, -0.05, zz]
    }
    const surface = parts.length
    emitQuad(c(-uEnd, nearV), c(uEnd, nearV), c(uEnd, farV), c(-uEnd, farV), RAMP.water)
    const wet = { y: 0.02, wet: 1, kind: 'ripple', a: surface, b: parts.length }
    for (const uu of [-9.6, 0.6, 9.9]) roofs.push({ ...wet, u: uu, v: RIVER_V })
    for (const vv of [nearV, farV]) {
      const a = c(-uEnd, vv)
      const b = c(uEnd, vv)
      line(a[0], a[1], a[2], b[0], b[1], b[2])
    }
    // A few broken lines along the flow. Water with nothing on it reads as a gap;
    // this is the cheapest thing that says the surface is moving, and it costs no
    // colour - the river stays the same grey as everything else.
    for (let k = 0; k < 26; k++) {
      const vv = nearV + RIVER_HALF * 2 * (0.12 + 0.76 * ((k * 0.3719) % 1))
      const u1 = -uEnd + (2 * uEnd * ((k * 0.6180) % 1))
      const len = 1.4 + 2.6 * ((k * 0.2237) % 1)
      const a = c(u1, vv)
      const b = c(Math.min(u1 + len, uEnd), vv)
      line(a[0], a[1], a[2], b[0], b[1], b[2])
    }
  }

  // A bridge the isometric can actually show. The span runs along v, and in this
  // projection v and world-up are both screen-down, so anything shaped in the v-Y
  // plane - a suspension cable's sag, a fan of stays - collapses onto the deck line
  // and reads as nothing. An arch across the deck's *width* is shaped in u and Y,
  // which are different screen axes, so it curves. 한강철교 is a through-arch anyway.
  const bridge = (u0) => {
    const hw = 0.5
    const L = RIVER_HALF + 1.15
    const y = 0.5
    const drop = 0.17
    const railY = y + 0.16
    const archH = 0.78
    const c = (uu, vv, yy) => {
      const [xx, zz] = at(uu, vv)
      return [xx, yy, zz]
    }
    const seg = (a, b) => line(a[0], a[1], a[2], b[0], b[1], b[2])
    const v0 = RIVER_V - L
    const v1 = RIVER_V + L

    emitQuad(c(u0 - hw, v0, y), c(u0 + hw, v0, y), c(u0 + hw, v1, y), c(u0 - hw, v1, y), RAMP.deck)

    for (const sd of [-1, 1]) {
      const uu = u0 + sd * hw
      emitQuad(c(uu, v0, y), c(uu, v1, y), c(uu, v1, y - drop), c(uu, v0, y - drop), RAMP.stone)
      seg(c(uu, v0, y), c(uu, v1, y))
      seg(c(uu, v0, y - drop), c(uu, v1, y - drop))
      seg(c(uu, v0, railY), c(uu, v1, railY))
      for (let k = 0; k <= 22; k++) {
        const [px, pz] = at(uu, v0 + ((v1 - v0) * k) / 22)
        emitBox(px, y, pz, 0.04, 0.16, 0.04, RAMP.stone)
      }
    }

    // Three through-arches over the water, each with its hangers down to the deck.
    for (const av of [RIVER_V - RIVER_HALF * 0.72, RIVER_V, RIVER_V + RIVER_HALF * 0.72]) {
      const N = 18
      const arc = (t) => {
        const uu = u0 - hw + 2 * hw * t
        return c(uu, av, y + archH * Math.sin(Math.PI * t))
      }
      let prev = arc(0)
      for (let k = 1; k <= N; k++) {
        const next = arc(k / N)
        seg(prev, next)
        prev = next
      }
      for (let k = 1; k < 6; k++) {
        const t = k / 6
        const top = arc(t)
        if (top[1] - railY > 0.08) seg([top[0], railY, top[2]], top)
      }
      // the arch springs off a small pedestal on each side
      for (const sd of [-1, 1]) {
        const [px, pz] = at(u0 + sd * hw, av)
        emitBox(px, y, pz, 0.1, 0.16, 0.1, RAMP.mark)
      }
    }

    for (const tv of [RIVER_V - RIVER_HALF * 0.72, RIVER_V + RIVER_HALF * 0.72]) {
      const [px, pz] = at(u0, tv)
      emitBox(px, -0.05, pz, 0.34, y - drop + 0.05, 0.34, RAMP.stone)
    }
  }

  mark()
  river()
  note('한강 · Han river', 0.8, RIVER_V, 1)
  for (const bu of [-10.6, 0.8, 10.8]) {
    mark()
    bridge(bu) // the middle one is mostly behind the column, but the crossing continues
    note('한강 다리 · Han bridge', bu, RIVER_V, 1)
  }

  // Three set pieces a gutter and a datastore, staggered against the other side so no
  // two big shapes sit at the same height, and spaced so the scroll retires one and
  // brings in the next. The masked band is about 25 units of v tall, which is what
  // caps this at four objects a side.
  // Hugging the ink boundary rather than sitting out by the frame edge: the first
  // thing outside the column should be a landmark, and the plain carpet fills
  // outward from behind it. On a wide screen the old spacing put anonymous boxes
  // next to the text and the set pieces off at the margin, which is backwards.
  // Built and recorded in one step: a gallery has to be able to draw any one of these
  // on its own, and the slice it needs only exists while the piece is being built.
  const set = [
    ['N서울타워 · Namsan Tower', namsan, -10.9, -3.5, 4.7],
    ['경복궁 근정전 · Geunjeongjeon', geunjeongjeon, -10.8, 5.1, 2.2],
    ['한옥 · Hanok cluster', hanok, -11.2, 15.8, 1.2],
    ['롯데월드타워 · Lotte World Tower', lotte, 10.7, -8, 4.4],
    ['숭례문 · Sungnyemun', sungnyemun, 10.9, 2, 2],
    ['63빌딩 · 63 Building', bldg63, 11.4, 13.6, 4],
  ]
  for (const [name, build, bu, bv, bh] of set) {
    mark()
    build(bu, bv)
    note(name, bu, bv, bh)
  }
  STORES.forEach((st, k) => {
    mark()
    const box = { layer: 'disc', slot: k, r: DISC_R * 1.2 }
    note('데이터스토어 · Datastore', st.u, st.v, STACK_TOP, box)
  })

  // ---- the carpet --------------------------------------------------------
  const cellKey = (i, j) => i * 1000 + j
  const cleared = new Set()
  const snap = (a) => {
    const i = Math.round(((a.u + a.v) * ISQ2) / CELL)
    const j = Math.round(((a.v - a.u) * ISQ2) / CELL)
    const x = i * CELL
    const z = j * CELL
    return { i, j, x, z, u: (x - z) * ISQ2, v: (x + z) * ISQ2 }
  }

  for (const s of STORES) {
    Object.assign(s, snap(s))
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) cleared.add(cellKey(s.i + di, s.j + dj))
  }
  for (const f of FIGS) {
    Object.assign(f, snap(f))
    for (let di = -1; di <= 1; di++) cleared.add(cellKey(f.i + di, f.j)) // room to pace
  }

  const IMAX = Math.ceil(((U_HALF + V_FWD) * ISQ2) / CELL) + 1
  for (let i = -IMAX; i <= IMAX; i++) {
    for (let j = -IMAX; j <= IMAX; j++) {
      if (i % AVE_I === 0 || j % AVE_J === 0) continue
      if (cleared.has(cellKey(i, j))) continue
      const x = i * CELL
      const z = j * CELL
      const u = (x - z) * ISQ2
      const v = (x + z) * ISQ2
      if (Math.abs(u) > U_HALF || v < -V_BACK || v > V_FWD) continue
      if (Math.abs(v - RIVER_V) < RIVER_HALF + 0.55) continue // nothing stands in the water
      let blocked = false
      for (const [kx, kz, ka, kb] of keepOut)
        if (Math.abs(x - kx) < ka + CELL * 0.4 && Math.abs(z - kz) < kb + CELL * 0.4) {
          blocked = true
          break
        }
      if (blocked) continue

      const gut = Math.abs(u) > INK_U
      if (rnd(i, j, 0) > (gut ? GUT_KEEP : MID_KEEP)) continue
      const r1 = rnd(i, j, 1)
      const r2 = rnd(i, j, 2)
      const r3 = rnd(i, j, 3)
      let h = MID_H + 0.22 * r1 // behind the column it is a floor, not a skyline
      if (gut) {
        const d = clamp01(district(u, v))
        h = 0.34 + (0.25 + 1.5 * d * d) * (0.4 + 0.9 * r1)
        if (rnd(i, j, 5) < LOW) h = Math.min(h, 0.5 + 0.45 * r1)
        h = Math.min(1.9, h) // less than half a landmark: the set pieces stay the skyline
      }
      const bw = CELL * (0.36 + 0.26 * r2)
      const bd = CELL * (0.36 + 0.26 * r3)

      // Behind the column it stays an anonymous floor; nothing there is meant to be
      // looked at. Out in the gutters there is no plain box at all - every plot is
      // one of five Korean shapes, because a field of cuboids is what made the last
      // pass read as generic no matter how the landmarks were arranged.
      if (!gut) {
        emitBox(x, 0, z, bw, h, bd)
        continue
      }

      mark()
      const kind = rnd(i, j, 6)
      const r4 = rnd(i, j, 7)
      const top = (y) => {
        if (Math.abs(u) > GUTTER_U) roofs.push({ u, v, y })
      }

      if (kind < 0.26) {
        // 아파트: a row of matching slabs, which is the single most Korean thing a
        // city block can be. Always tall enough to read as a row.
        const n = 3 + (r4 > 0.5 ? 1 : 0)
        const sw = bw / (n * 1.85)
        const sh = Math.max(1.15, h * 1.45)
        for (let k = 0; k < n; k++)
          emitBox(x + (k - (n - 1) / 2) * sw * 1.85, 0, z, sw, sh, bd * 0.5)
        top(sh)
        note('아파트 · Apartment slabs', u, v, sh)
      } else if (kind < 0.46) {
        // 기와 저층: a low hall under a tiled roof. The eave used to overhang the
        // walls by nearly 40% and the thing read as a mushroom; 15% is a roof.
        const bh = Math.max(0.44, Math.min(h, 0.72) * 0.95)
        emitBox(x, 0, z, bw * 0.8, bh, bd * 0.8, RAMP.mark)
        emitRoof(x, bh, z, bw * 0.46, bd * 0.46, 0.2, 16, false)
        top(bh + 0.42)
        note('기와 저층 · Tiled low-rise', u, v, bh + 0.6)
      } else if (kind < 0.68) {
        // 상가: a flat roof carrying the rooftop room and the water tank on legs that
        // every one of them has, plus the parapet round the edge.
        emitBox(x, 0, z, bw, h, bd)
        emitBox(x, h, z, bw * 1.04, 0.06, bd * 1.04, RAMP.stone)
        emitBox(x - bw * 0.15, h + 0.06, z + bd * 0.12, bw * 0.42, 0.3, bd * 0.4)
        emitBox(x + bw * 0.26, h + 0.06, z - bd * 0.16, bw * 0.07, 0.16, bd * 0.07, RAMP.stone)
        emitCyl(x + bw * 0.26, h + 0.22, z - bd * 0.16, bw * 0.16, 0.22, RAMP.store)
        top(h + 0.36)
        note('상가 · Shop block with 옥탑', u, v, h + 0.5)
      } else if (kind < 0.86) {
        // 계단식: an office tower that sets back twice near the top. Every tier used
        // to be as wide as it was tall, which is a ziggurat, not an office. Narrow
        // footprint, most of the height in the shaft, small setbacks high up.
        const fw = bw * 0.6
        const fd = bd * 0.6
        const th = Math.max(1.7, h * 2.15)
        const h1 = th * 0.63
        const h2 = th * 0.23
        const h3 = th * 0.14
        emitBox(x, 0, z, fw, h1, fd)
        emitBox(x - fw * 0.04, h1, z + fd * 0.03, fw * 0.85, h2, fd * 0.85)
        emitBox(x - fw * 0.07, h1 + h2, z + fd * 0.05, fw * 0.68, h3, fd * 0.68)
        emitBox(x - fw * 0.07, th, z + fd * 0.05, 0.06, 0.3, 0.06, RAMP.stone)
        top(th)
        note('계단식 빌딩 · Stepped office', u, v, h1 + h2 + h3)
      } else {
        // 좁은 빌딩: narrow, tall, with a floor band every few storeys.
        // Thin bands close together read as storeys; three fat ones read as three
        // boxes stacked, which is what it looked like.
        const nh = Math.max(1.3, h * 1.9)
        emitBox(x, 0, z, bw * 0.46, nh, bd * 0.46)
        const bands = Math.max(5, Math.round(nh / 0.19))
        for (let k = 1; k < bands; k++)
          emitBox(x, (nh * k) / bands, z, bw * 0.5, 0.02, bd * 0.5, RAMP.stone)
        top(nh)
        note('좁은 빌딩 · Narrow tower', u, v, nh)
      }
    }
  }

  const cityGeo = new THREE.BufferGeometry()
  const CITYV = cPos.length / 3
  cityGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3))
  cityGeo.setIndex(new THREE.BufferAttribute(Uint32Array.from(cIdx), 1))
  const cityCol = new THREE.Float32BufferAttribute(new Float32Array(CITYV * 3), 3)
  cityGeo.setAttribute('color', cityCol)
  const cityEdgeGeo = new THREE.BufferGeometry()
  cityEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(cEdge, 3))
  const cityEdgeMat = new THREE.LineBasicMaterial()
  const cityMesh = new THREE.Mesh(cityGeo, new THREE.MeshBasicMaterial({ vertexColors: true }))
  const cityLines = new THREE.LineSegments(cityEdgeGeo, cityEdgeMat)
  world.add(cityMesh, cityLines)

  const paintCity = () => {
    // ink() blends bg2 toward fg, so a higher t is lighter on a dark theme and darker
    // on a light one. The water has to sit under the carpet's 0.105 either way or it
    // reads as a pale gap rather than a river, which means it flips with the theme.
    const lightBg = P.bg2[0] + P.bg2[1] + P.bg2[2] > 382
    const wt = lightBg ? 0.30 : 0.042
    RAMP.water.top = RAMP.water.pz = RAMP.water.px = RAMP.water.dark = wt
    const gt = lightBg ? 0.42 : 0.004
    RAMP.gate.top = RAMP.gate.pz = RAMP.gate.px = RAMP.gate.dark = gt

    const a = cityCol.array
    let ramp = null
    for (const p of parts) {
      if (p.ramp !== ramp) {
        ramp = p.ramp
        tones(ramp)
      }
      for (let i = 0; i < p.n; i++) {
        const f = p.face[i] * 3
        const o = (p.v0 + i) * 3
        a[o] = tone[f]
        a[o + 1] = tone[f + 1]
        a[o + 2] = tone[f + 2]
      }
    }
    cityCol.needsUpdate = true
  }

  // ---- the datastores ----------------------------------------------------
  // One buffer for every disc in the city: a landing rewrites one disc's slice, so the
  // beat costs a partial upload rather than a draw call per stack.
  const NDISC = STORES.length * DISCS
  const discPos = new Float32Array(NDISC * CYLV * 3)
  const discEdgePos = new Float32Array(NDISC * CYLE * 3)
  const discCol = new THREE.Float32BufferAttribute(new Float32Array(NDISC * CYLV * 3), 3)
  const discEdgeCol = new THREE.Float32BufferAttribute(new Float32Array(NDISC * CYLE * 3), 3)
  const discPosAttr = new THREE.BufferAttribute(discPos, 3)
  const discEdgeAttr = new THREE.BufferAttribute(discEdgePos, 3)
  discPosAttr.setUsage(THREE.DynamicDrawUsage)
  discEdgeAttr.setUsage(THREE.DynamicDrawUsage)

  const discGeo = new THREE.BufferGeometry()
  discGeo.setAttribute('position', discPosAttr)
  discGeo.setAttribute('color', discCol)
  {
    const idx = new Uint32Array(cylT.idx.length * NDISC)
    for (let k = 0; k < NDISC; k++)
      for (let i = 0; i < cylT.idx.length; i++)
        idx[k * cylT.idx.length + i] = cylT.idx[i] + k * CYLV
    discGeo.setIndex(new THREE.BufferAttribute(idx, 1))
  }
  const discEdgeGeo = new THREE.BufferGeometry()
  discEdgeGeo.setAttribute('position', discEdgeAttr)
  discEdgeGeo.setAttribute('color', discEdgeCol)
  const discMesh = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ vertexColors: true }))
  const discLines = new THREE.LineSegments(
    discEdgeGeo,
    new THREE.LineBasicMaterial({ vertexColors: true }),
  )
  world.add(discMesh, discLines)

  STORES.forEach((s, n) => {
    s.base = n * DISCS
    s.next = n % DISCS
    s.phase = n * 1.7
    s.discs = []
    for (let k = 0; k < DISCS; k++)
      s.discs.push({ r: DISC_R * DISC_SCALE(k), y: DISC_Y(k), dy: 0, lit: 0, age: -1, painted: -1 })
  })

  let discMoved = false
  const writeDisc = (s, k) => {
    const d = s.discs[k]
    const y = d.y + d.dy
    discMoved = true
    let o = (s.base + k) * CYLV * 3
    for (let i = 0; i < CYLV * 3; i += 3) {
      discPos[o + i] = cylT.pos[i] * d.r + s.x
      discPos[o + i + 1] = cylT.pos[i + 1] * DISC_H + y
      discPos[o + i + 2] = cylT.pos[i + 2] * d.r + s.z
    }
    o = (s.base + k) * CYLE * 3
    for (let i = 0; i < CYLE * 3; i += 3) {
      discEdgePos[o + i] = cylT.edge[i] * d.r + s.x
      discEdgePos[o + i + 1] = cylT.edge[i + 1] * DISC_H + y
      discEdgePos[o + i + 2] = cylT.edge[i + 2] * d.r + s.z
    }
  }

  const paintDisc = (s, k) => {
    const d = s.discs[k]
    tones(RAMP.store, d.lit)
    const a = discCol.array
    let o = (s.base + k) * CYLV * 3
    for (let i = 0; i < CYLV; i++) {
      const f = cylFace[i] * 3
      a[o + i * 3] = tone[f]
      a[o + i * 3 + 1] = tone[f + 1]
      a[o + i * 3 + 2] = tone[f + 2]
    }
    put(_c2, blend(P.store, P.dim, clamp01(d.lit)))
    const e = discEdgeCol.array
    o = (s.base + k) * CYLE * 3
    for (let i = 0; i < CYLE; i++) {
      e[o + i * 3] = _c2.r
      e[o + i * 3 + 1] = _c2.g
      e[o + i * 3 + 2] = _c2.b
    }
    d.painted = d.lit
    discCol.needsUpdate = true
    discEdgeCol.needsUpdate = true
  }

  for (const s of STORES)
    for (let k = 0; k < DISCS; k++) {
      writeDisc(s, k)
      paintDisc(s, k)
    }

  const PARK = -900 // a slot with nothing in it collapses below the frustum

  // ---- figures -----------------------------------------------------------
  // Four boxes each and no face: a shape at street level, not a character anyone owns.
  const NFB = FIGS.length * FIG_BOXES
  const figPos = new Float32Array(NFB * BOXV * 3)
  const figEdgePos = new Float32Array(NFB * BOXE * 3)
  const figPosAttr = new THREE.BufferAttribute(figPos, 3)
  const figEdgeAttr = new THREE.BufferAttribute(figEdgePos, 3)
  figPosAttr.setUsage(THREE.DynamicDrawUsage)
  figEdgeAttr.setUsage(THREE.DynamicDrawUsage)
  const figGeo = new THREE.BufferGeometry()
  figGeo.setAttribute('position', figPosAttr)
  const figCol = new THREE.Float32BufferAttribute(new Float32Array(NFB * BOXV * 3), 3)
  figGeo.setAttribute('color', figCol)
  {
    const idx = new Uint32Array(boxT.idx.length * NFB)
    for (let k = 0; k < NFB; k++)
      for (let i = 0; i < boxT.idx.length; i++)
        idx[k * boxT.idx.length + i] = boxT.idx[i] + k * BOXV
    figGeo.setIndex(new THREE.BufferAttribute(idx, 1))
  }
  const figEdgeGeo = new THREE.BufferGeometry()
  figEdgeGeo.setAttribute('position', figEdgeAttr)
  const figEdgeMat = new THREE.LineBasicMaterial()
  const figMesh = new THREE.Mesh(figGeo, new THREE.MeshBasicMaterial({ vertexColors: true }))
  const figLines = new THREE.LineSegments(figEdgeGeo, figEdgeMat)
  figMesh.frustumCulled = false
  figLines.frustumCulled = false
  world.add(figMesh, figLines)

  const FIG_NAME = [
    '선 사람 · Figure, idling',
    '걷는 사람 · Figure, walking',
    '보내는 사람 · Figure, sending',
  ]
  FIGS.forEach((f, n) => {
    f.slot = n * FIG_BOXES
    f.phase = n * 1.31
    f.dx = 0
    f.bob = 0
    f.tap = 0
    f.sendAt = PHONE_EVERY * 0.45 + n
    mark()
    note(FIG_NAME[f.kind], f.u, f.v, FIG_H, { layer: 'fig', slot: n, r: 0.17 })
  })
  for (const f of FIGS)
    if (f.kind === 2) note('말풍선 · Message bubble', f.u, f.v, BH * 2, { layer: 'bubble', r: BW })
  for (const f of FIGS) roofs.push({ u: f.u, v: f.v, y: 0.6, kind: 'heart', fig: f })

  const writeBox = (pos, edge, slot, x, y, z, w, h, d) => {
    let o = slot * BOXV * 3
    for (let i = 0; i < BOXV * 3; i += 3) {
      pos[o + i] = boxT.pos[i] * w + x
      pos[o + i + 1] = boxT.pos[i + 1] * h + y
      pos[o + i + 2] = boxT.pos[i + 2] * d + z
    }
    o = slot * BOXE * 3
    for (let i = 0; i < BOXE * 3; i += 3) {
      edge[o + i] = boxT.edge[i] * w + x
      edge[o + i + 1] = boxT.edge[i + 1] * h + y
      edge[o + i + 2] = boxT.edge[i + 2] * d + z
    }
  }

  const stepFig = (f, t) => {
    if (f.kind === 1) {
      const p = t * 0.5 + f.phase
      f.dx = Math.sin(p) * WALK
      f.bob = Math.abs(Math.sin(p * 3)) * 0.018 // three steps per half-lap, near a real stride
    } else if (f.kind === 2) {
      f.bob = Math.sin(t * 0.9 + f.phase) * 0.012
      f.tap = Math.sin(t * 5.4 + f.phase) * 0.025
    } else {
      f.bob = Math.sin(t * 0.7 + f.phase) * 0.014
    }
  }

  const arm = new Float64Array(3) // held, not returned: nothing in the frame allocates
  const armPos = (f) => {
    const s = Math.sign(f.u) || 1 // raised on the outboard side, away from the transcript
    arm[0] = f.x + f.dx + (ARM_U * s + ARM_V) * ISQ2
    arm[1] = FIG_LEG[1] + FIG_TORSO[1] * 0.28 + f.bob + f.tap
    arm[2] = f.z + (ARM_V - ARM_U * s) * ISQ2
  }

  const writeFig = (f) => {
    const x = f.x + f.dx
    writeBox(figPos, figEdgePos, f.slot, x, f.bob, f.z, FIG_LEG[0], FIG_LEG[1], FIG_LEG[2])
    const ty = FIG_LEG[1] + f.bob
    writeBox(figPos, figEdgePos, f.slot + 1, x, ty, f.z, FIG_TORSO[0], FIG_TORSO[1], FIG_TORSO[2])
    const hy = ty + FIG_TORSO[1] + FIG_NECK
    writeBox(figPos, figEdgePos, f.slot + 2, x, hy, f.z, FIG_HEAD[0], FIG_HEAD[1], FIG_HEAD[2])
    armPos(f)
    const y = f.kind === 2 ? arm[1] : PARK // everyone else has their hands down and unbuilt
    writeBox(figPos, figEdgePos, f.slot + 3, arm[0], y, arm[2], FIG_ARM[0], FIG_ARM[1], FIG_ARM[2])
  }

  // ---- bubbles -----------------------------------------------------------
  // The outline is built in the screen plane and mapped through the camera's own right
  // and up: a speech bubble is a flat symbol and stops reading as one the moment the
  // iso skews it.
  const outline = (() => {
    const pts = []
    const arc = (cx, cy, a0, a1) => {
      for (let s = 0; s <= 3; s++) {
        const a = a0 + ((a1 - a0) * s) / 3
        pts.push(cx + Math.cos(a) * BR, cy + Math.sin(a) * BR)
      }
    }
    const hw = BW - BR
    const hh = BH - BR
    arc(hw, -hh, -Math.PI / 2, 0)
    arc(hw, hh, 0, Math.PI / 2)
    arc(-hw, hh, Math.PI / 2, Math.PI)
    arc(-hw, -hh, Math.PI, Math.PI * 1.5)
    pts.push(-BW * 0.3, -BH, -BW * 0.15, -BH - 0.155, BW * 0.02, -BH) // the tail
    return pts
  })()
  const NPT = outline.length / 2
  const FILLV = NPT + 1 // a fan from the middle
  const RIMV = NPT * 2

  const bFill = new Float32Array(MAXB * FILLV * 3)
  const bRim = new Float32Array(MAXB * RIMV * 3)
  const bFillAttr = new THREE.BufferAttribute(bFill, 3)
  const bRimAttr = new THREE.BufferAttribute(bRim, 3)
  bFillAttr.setUsage(THREE.DynamicDrawUsage)
  bRimAttr.setUsage(THREE.DynamicDrawUsage)
  const bFillGeo = new THREE.BufferGeometry()
  bFillGeo.setAttribute('position', bFillAttr)
  {
    const idx = new Uint16Array(MAXB * NPT * 3)
    let n = 0
    for (let k = 0; k < MAXB; k++) {
      const b = k * FILLV
      for (let i = 0; i < NPT; i++) {
        idx[n++] = b
        idx[n++] = b + 1 + i
        idx[n++] = b + 1 + ((i + 1) % NPT)
      }
    }
    bFillGeo.setIndex(new THREE.BufferAttribute(idx, 1))
  }
  const bRimGeo = new THREE.BufferGeometry()
  bRimGeo.setAttribute('position', bRimAttr)

  // They fly above the roofs, so they draw last and never clip into a tower.
  const bFillMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthTest: false })
  const bRimMat = new THREE.LineBasicMaterial({ depthTest: false })
  const bFillMesh = new THREE.Mesh(bFillGeo, bFillMat)
  const bRimMesh = new THREE.LineSegments(bRimGeo, bRimMat)
  bFillMesh.renderOrder = 10
  bRimMesh.renderOrder = 11
  bFillMesh.frustumCulled = false
  bRimMesh.frustumCulled = false
  world.add(bFillMesh, bRimMesh)

  const park = (slot) => {
    let o = slot * FILLV * 3
    for (let i = 0; i < FILLV * 3; i += 3) {
      bFill[o + i] = 0
      bFill[o + i + 1] = PARK
      bFill[o + i + 2] = 0
    }
    o = slot * RIMV * 3
    for (let i = 0; i < RIMV * 3; i += 3) {
      bRim[o + i] = 0
      bRim[o + i + 1] = PARK
      bRim[o + i + 2] = 0
    }
  }

  // A bubble and a heart are flat symbols laid on the camera's own right and up. A
  // gallery that turns the world has to turn that pair with it or they go edge-on.
  let RGX = RX
  let RGZ = -RX
  let UGX = UX
  let UGZ = UX
  const face = (t) => {
    const c = Math.cos(t)
    const q = Math.sin(t)
    RGX = RX * (c + q)
    RGZ = RX * (q - c)
    UGX = UX * (c - q)
    UGZ = UX * (q + c)
  }

  const scratch = new Float32Array(NPT * 3)
  const writeBubble = (slot, x, y, z, sx, sy, flip) => {
    for (let i = 0; i < NPT; i++) {
      const a = outline[i * 2] * sx * flip
      const b = outline[i * 2 + 1] * sy
      scratch[i * 3] = x + RGX * a + UGX * b
      scratch[i * 3 + 1] = y + UP_Y * b
      scratch[i * 3 + 2] = z + RGZ * a + UGZ * b
    }
    let o = slot * FILLV * 3
    bFill[o] = x
    bFill[o + 1] = y
    bFill[o + 2] = z
    bFill.set(scratch, o + 3)
    o = slot * RIMV * 3
    for (let i = 0; i < NPT; i++) {
      const j = (i + 1) % NPT
      bRim[o + i * 6] = scratch[i * 3]
      bRim[o + i * 6 + 1] = scratch[i * 3 + 1]
      bRim[o + i * 6 + 2] = scratch[i * 3 + 2]
      bRim[o + i * 6 + 3] = scratch[j * 3]
      bRim[o + i * 6 + 4] = scratch[j * 3 + 1]
      bRim[o + i * 6 + 5] = scratch[j * 3 + 2]
    }
  }

  const pool = []
  for (let k = 0; k < MAXB; k++) pool.push({ slot: k })
  const live = []
  const from = { u: 0, v: 0, y: 0 } // the phone's launch point, reused
  const to = { u: 0, v: 0, y: 0, store: null, rec: null }
  let sendAt = 0.6

  const visible = (u, v) => Math.abs(u) < uVis + 1.5 && Math.abs(v - panV) < vVis + 2

  // side 0 means either side, which is what a message crossing the frame wants.
  // A message leaves any roof, but it only lands where something can answer it:
  // ninety anonymous plots would swallow all of it and nothing would ever light.
  const pick = (side, asSrc) => {
    let n = 0
    let hit = null
    for (const c of roofs) {
      if (asSrc ? c.wet || c.kind === 'heart' : !c.kind) continue
      if (side !== 0 && Math.sign(c.u) !== side) continue
      if (!visible(c.u, c.v)) continue
      n++
      if (Math.random() * n < 1) hit = c // reservoir: one pass, no array built
    }
    return hit
  }

  // Most arcs stay on their own side, where they are at full ink and worth watching.
  // Roughly a third cross the frame instead: the mask has them at 8% over the column
  // so they read as something passing behind the text rather than over it, and the
  // city stops looking like two unrelated halves.
  const CROSS = 0.32
  const launch = (src, near, dst) => {
    const p = pool.pop()
    if (!p) return null
    const home = Math.sign(src.u) || 1
    const side = Math.random() < CROSS ? -home : home
    let got = false
    if (dst) {
      to.u = dst.u
      to.v = dst.v
      to.y = dst.y
      to.store = null
      to.rec = dst
      got = true
    } else if (Math.random() < 0.3) {
      let best = Infinity
      for (const s of STORES) {
        if (Math.sign(s.u) !== side) continue
        if (near && !visible(s.u, s.v)) continue
        const d = Math.hypot(s.u - src.u, s.v - src.v)
        if (d < best && d > 1.5) {
          best = d
          to.u = s.u
          to.v = s.v
          to.y = STACK_TOP
          to.store = s
          to.rec = null
          got = true
        }
      }
    }
    if (!got) {
      const r = pick(side, false) ?? pick(0, false)
      if (!r || Math.hypot(r.u - src.u, r.v - src.v) < 2) {
        pool.push(p)
        return null
      }
      to.u = r.u
      to.v = r.v
      to.y = r.y
      to.store = null
      to.rec = r
    }
    const dist = Math.hypot(to.u - src.u, to.v - src.v)
    p.u0 = src.u
    p.v0 = src.v
    p.y0 = src.y
    p.u1 = to.u
    p.v1 = to.v
    p.y1 = to.y
    p.store = to.store
    p.rec = to.rec
    p.lift = Math.min(3.2, 1.3 + dist * 0.22)
    p.dur = Math.min(3.6, 1.6 + dist * 0.1)
    p.t = 0
    p.flip = to.u >= src.u ? 1 : -1 // the tail trails the flight
    live.push(p)
    return p
  }

  const land = (p) => {
    const s = p.store
    if (s) {
      const d = s.discs[s.next]
      s.next = (s.next + 1) % DISCS
      d.lit = 1
      d.age = 0
      return
    }
    const r = p.rec
    if (!r) return
    if (r.a !== undefined) {
      const e = lit.find((q) => q.r === r)
      if (e) e.t = 0
      else lit.push({ r, t: 0 })
    }
    if (r.kind === 'ripple') {
      const [rx, rz] = at(r.u, r.v)
      spawn('ring', rx, -0.03, rz)
      spawn('ring', rx, -0.03, rz, -0.24) // a second ring behind the first, so it reads as water
    } else if (r.kind === 'blink') {
      spawn('blip', r.ax, r.ay, r.az)
    } else if (r.kind === 'heart') {
      spawn('heart', r.fig.x + r.fig.dx, 0.78, r.fig.z)
    }
  }

  let hushed = false
  const stepBubbles = (dt) => {
    if (hushed) return stepFlight(dt)
    sendAt -= dt
    if (sendAt <= 0) {
      sendAt = SEND_MIN + Math.random() * SEND_VAR
      const r = pick(Math.random() < 0.5 ? -1 : 1, true)
      if (r) launch(r, true)
    }
    stepFlight(dt)
  }

  const stepFlight = (dt) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]
      p.t += dt
      if (p.t >= p.dur) {
        land(p)
        live.splice(i, 1)
        pool.push(p)
      }
    }
  }

  // Squash on the way out and again on the way in; the rest of the arc is clean.
  const sh = new Float64Array(3)
  const shape = (p) => {
    const k = clamp01(p.t / p.dur)
    const out = Math.exp((-k * p.dur) / 0.19)
    const inn = Math.exp((-(1 - k) * p.dur) / 0.16)
    sh[0] = k
    sh[1] = (1 + 0.38 * out + 0.5 * inn) * (0.35 + 0.65 * clamp01((k * p.dur) / 0.1))
    sh[2] = (1 - 0.32 * out - 0.4 * inn) * clamp01((1 - k) / 0.06)
  }

  const writeBubbles = () => {
    for (let s = 0; s < MAXB; s++) park(s)
    for (const p of live) {
      shape(p)
      const k = sh[0]
      const sx = sh[1]
      const sy = sh[2]
      const u = p.u0 + (p.u1 - p.u0) * k
      const v = p.v0 + (p.v1 - p.v0) * k
      const y = p.y0 + (p.y1 - p.y0) * k + p.lift * 4 * k * (1 - k) + 0.34
      writeBubble(p.slot, (u + v) * ISQ2, y, (v - u) * ISQ2, sx, sy, p.flip)
    }
    bFillAttr.needsUpdate = true
    bRimAttr.needsUpdate = true
  }

  // ---- reactions ---------------------------------------------------------
  // What the city does when a message actually arrives. Landing lights the slice of
  // `parts` the target owns; two kinds draw a line of their own on top of that, a ring
  // spreading on the water and a heart over someone's head.
  const paintSlice = (r, age) => {
    const f = FX[r.kind] ?? FX.glow
    const span = r.b - r.a
    const arr = cityCol.array
    for (let pi = r.a; pi < r.b; pi++) {
      const q = parts[pi]
      tones(q.ramp, age < 0 ? 0 : f(age, pi - r.a, span), FX_INK)
      for (let i = 0; i < q.n; i++) {
        const fc = q.face[i] * 3
        const o = (q.v0 + i) * 3
        arr[o] = tone[fc]
        arr[o + 1] = tone[fc + 1]
        arr[o + 2] = tone[fc + 2]
      }
    }
    const last = parts[r.b - 1]
    cityCol.addUpdateRange(parts[r.a].v0 * 3, (last.v0 + last.n - parts[r.a].v0) * 3)
    cityCol.needsUpdate = true
  }

  const lit = []
  const stepLit = (dt) => {
    for (let i = lit.length - 1; i >= 0; i--) {
      const e = lit[i]
      e.t += dt
      if (e.t < FX_LIFE) paintSlice(e.r, e.t)
      else {
        paintSlice(e.r, -1)
        lit.splice(i, 1)
      }
    }
  }

  // 16 sin³t against the four-cosine curve: the one closed form that reads as a heart
  // rather than as two circles over a triangle.
  const heartPts = (() => {
    const out = []
    for (let i = 0; i < FXSEG; i++) {
      const a = (i / FXSEG) * Math.PI * 2 + Math.PI
      const c = Math.cos(a)
      out.push(
        16 * Math.sin(a) ** 3 * 0.0094,
        (13 * c - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 0.0094,
      )
    }
    return out
  })()

  const FXV = FXSEG * 2
  const fxPos = new Float32Array(NFX * FXV * 3)
  const fxCol = new Float32Array(NFX * FXV * 4) // rgba: these fade out rather than to the page
  const fxPosAttr = new THREE.BufferAttribute(fxPos, 3)
  const fxColAttr = new THREE.BufferAttribute(fxCol, 4)
  fxPosAttr.setUsage(THREE.DynamicDrawUsage)
  fxColAttr.setUsage(THREE.DynamicDrawUsage)
  const fxGeo = new THREE.BufferGeometry()
  fxGeo.setAttribute('position', fxPosAttr)
  fxGeo.setAttribute('color', fxColAttr)
  const fxMesh = new THREE.LineSegments(
    fxGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false }),
  )
  fxMesh.renderOrder = 12
  fxMesh.frustumCulled = false
  world.add(fxMesh)

  let fxDirty = false
  const fxFree = []
  for (let k = 0; k < NFX; k++) fxFree.push(k)
  const fxLive = []
  const fxPark = (slot) => {
    const o = slot * FXV * 3
    for (let i = 1; i < FXV * 3; i += 3) fxPos[o + i] = PARK
  }
  for (let k = 0; k < NFX; k++) fxPark(k)

  const LIFE = { ring: RING_LIFE, heart: HEART_LIFE, blip: BLIP_LIFE }
  const spawn = (kind, x, y, z, t = 0) => {
    const slot = fxFree.pop()
    if (slot !== undefined) fxLive.push({ slot, kind, x, y, z, t })
  }

  const stepFx = (dt) => {
    for (let i = fxLive.length - 1; i >= 0; i--) {
      const e = fxLive[i]
      e.t += dt
      if (e.t < LIFE[e.kind]) continue
      fxPark(e.slot)
      fxFree.push(e.slot)
      fxLive.splice(i, 1)
    }
  }

  const writeFx = () => {
    if (!fxLive.length && !fxDirty) return
    fxDirty = fxLive.length > 0
    for (const e of fxLive) {
      const ring = e.kind === 'ring'
      const blip = e.kind === 'blip'
      const k = clamp01(e.t / LIFE[e.kind])
      put(_c1, ring ? P.okRim : blip ? P.dim : P.warm)
      const a = e.t < 0
        ? 0
        : ring
        ? (1 - k) ** 2
        : blip
          ? Math.max(0, Math.cos(k * 15)) * (1 - k)
          : Math.min(1, k * 7) * (1 - k) ** 1.5
      const r = ring
        ? RING_R0 + (RING_R1 - RING_R0) * Math.sqrt(k)
        : 0.06 + 0.3 * ((k * 3) % 1) // the halo re-opens on each flash
      const grow = 0.72 + 0.46 * Math.min(1, k * 4) // it pops, then holds its size
      const rise = 0.6 * k
      let o = e.slot * FXV * 3
      let c = e.slot * FXV * 4
      for (let i = 0; i < FXSEG; i++) {
        for (const q of [i, (i + 1) % FXSEG]) {
          const ang = (q / FXSEG) * Math.PI * 2
          if (ring) {
            fxPos[o] = e.x + Math.cos(ang) * r
            fxPos[o + 1] = e.y
            fxPos[o + 2] = e.z + Math.sin(ang) * r
          } else if (blip) {
            const pa = Math.cos(ang) * r
            const pb = Math.sin(ang) * r
            fxPos[o] = e.x + RGX * pa + UGX * pb
            fxPos[o + 1] = e.y + UP_Y * pb
            fxPos[o + 2] = e.z + RGZ * pa + UGZ * pb
          } else {
            const pa = heartPts[q * 2] * grow
            const pb = heartPts[q * 2 + 1] * grow
            fxPos[o] = e.x + RGX * pa + UGX * pb
            fxPos[o + 1] = e.y + rise + UP_Y * pb
            fxPos[o + 2] = e.z + RGZ * pa + UGZ * pb
          }
          fxCol[c] = _c1.r
          fxCol[c + 1] = _c1.g
          fxCol[c + 2] = _c1.b
          fxCol[c + 3] = a
          o += 3
          c += 4
        }
      }
    }
    fxPosAttr.needsUpdate = true
    fxColAttr.needsUpdate = true
  }
  // ---- paint -------------------------------------------------------------
  const paintAll = () => {
    paintCity()
    spread(figCol, boxRamp(RAMP.fig), NFB)
    put(cityEdgeMat.color, P.edge)
    put(figEdgeMat.color, P.fig)
    put(bFillMat.color, P.okBody)
    put(bRimMat.color, P.okRim)
    for (const s of STORES) for (let k = 0; k < DISCS; k++) paintDisc(s, k)
  }
  paintAll()

  // ---- stores ------------------------------------------------------------
  const stepStores = (t, dt) => {
    for (const s of STORES) {
      for (let k = 0; k < DISCS; k++) {
        const d = s.discs[k]
        if (d.age >= 0) {
          d.age += dt
          d.lit = Math.exp(-d.age / LIT_TAU)
          d.dy = 0.075 * Math.exp(-d.age * 6.5) * Math.cos(d.age * 15)
          writeDisc(s, k)
          if (d.age > 1.6) {
            d.age = -1
            d.lit = 0
            d.dy = 0
            writeDisc(s, k)
          }
        } else if (k === DISCS - 1) {
          d.lit = BREATHE * (0.5 + 0.5 * Math.sin(t * 0.8 + s.phase))
        }
        if (Math.abs(d.lit - d.painted) > 0.006) paintDisc(s, k)
      }
    }
  }

  // ---- frame -------------------------------------------------------------
  // scrollHeight from inside the frame forces a layout, and on this page that is 2.5ms
  // of every scrolled frame under load. The observer fires after one instead.
  let docSpan = 1
  const measureDoc = () => {
    docSpan = Math.max(1, document.documentElement.scrollHeight - innerHeight)
  }
  new ResizeObserver(measureDoc).observe(document.body)

  const resize = (w, h) => {
    W = Math.max(1, w)
    H = Math.max(1, h)
    // The city does not zoom until a frame is wider or taller than the one that was
    // built; past that, growing the scale beats running out of city at the edge.
    sc = Math.max(SCALE, W / (2 * (U_HALF - 1)), H / (2 * (V_BACK - 2) * DOWN_V))
    const fw = W / sc
    const fh = H / sc
    camera.left = -fw / 2
    camera.right = fw / 2
    camera.top = fh / 2
    camera.bottom = -fh / 2
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(dpr())
    renderer.setSize(W, H, false)
    panMax = PAN_PX / (DOWN_V * sc)
    uVis = fw / 2
    vVis = fh / (2 * DOWN_V)
    measureDoc()
  }

  resize(W, H)

  // One frame with the city at rest and two messages held mid-arc, so a reader who
  // asked for less motion still gets the idea rather than an empty grid.
  const STILL_T = 2.4
  const compose = () => {
    while (live.length) pool.push(live.pop())
    for (const s of STORES) {
      for (let k = 0; k < DISCS; k++) {
        const d = s.discs[k]
        d.lit = k === DISCS - 1 ? BREATHE : 0
        d.dy = 0
        d.age = -1
        writeDisc(s, k)
        paintDisc(s, k)
      }
    }
    // Built without launch(): nothing here may roll a die, or the frame a reduced-motion
    // reader is looking at would change under a theme switch or a window resize.
    let held = 0
    for (const s of STORES) {
      if (held >= 2 || !visible(s.u, s.v)) continue
      const side = Math.sign(s.u)
      let best = null
      let bd = Infinity
      for (const r of roofs) {
        if (r.wet || r.kind === 'heart') continue
        if (Math.sign(r.u) !== side || !visible(r.u, r.v)) continue
        const d = Math.hypot(r.u - s.u, r.v - s.v)
        if (d > 4 && d < bd) {
          bd = d
          best = r
        }
      }
      const p = best && pool.pop()
      if (!p) continue
      p.u0 = best.u
      p.v0 = best.v
      p.y0 = best.y
      p.u1 = s.u
      p.v1 = s.v
      p.y1 = STACK_TOP
      p.store = s
      p.rec = null
      p.lift = Math.min(3.2, 1.3 + bd * 0.22)
      p.dur = Math.min(3.6, 1.6 + bd * 0.1)
      p.flip = s.u >= best.u ? 1 : -1
      p.t = p.dur * (held ? 0.64 : 0.4)
      live.push(p)
      held++
    }
    const one = STORES.find((s) => visible(s.u, s.v))
    if (one) {
      const d = one.discs[1]
      d.lit = 0.55
      d.dy = 0.02
      writeDisc(one, 1)
      paintDisc(one, 1)
    }
    for (const f of FIGS) stepFig(f, STILL_T)
  }

  let t0 = -1

  const render = (t, dt) => {
    if (t0 < 0) t0 = t
    const age = t - t0
    panTarget = clamp01(scrollY / docSpan)

    if (still) {
      panV = panTarget * panMax
      compose()
    } else {
      panV = approach(panV, panTarget * panMax, dt, PAN_TAU)
      stepBubbles(dt)
      stepStores(age, dt)
      stepLit(dt)
      stepFx(dt)
      for (const f of FIGS) {
        stepFig(f, age)
        if (f.kind === 2 && age > f.sendAt) {
          f.sendAt = age + PHONE_EVERY * (0.7 + Math.random() * 0.6)
          armPos(f)
          from.u = (arm[0] - arm[2]) * ISQ2
          from.v = (arm[0] + arm[2]) * ISQ2
          from.y = arm[1] + FIG_ARM[1] // out of the phone at the top of the arm
          launch(from, false)
        }
      }
    }
    world.position.set(-panV * ISQ2, 0, -panV * ISQ2)

    for (const f of FIGS) writeFig(f)
    figPosAttr.needsUpdate = true
    figEdgeAttr.needsUpdate = true
    writeBubbles()
    writeFx()
    if (discMoved) {
      discPosAttr.needsUpdate = true
      discEdgeAttr.needsUpdate = true
      discMoved = false
    }

    renderer.render(scene, camera)
  }

  const retint = (next) => {
    P = palette(next)
    paintAll()
  }

  // The harness needs to make a message happen on demand and to aim it: a bubble is
  // in flight rather than at a fixed spot, and a landmark's reaction only exists while
  // one is landing on it. Nothing in the scene calls this.
  const poke = (u, v) => {
    let dst = null
    if (u !== undefined) {
      let best = 2.5
      for (const r of roofs) {
        if (!r.kind) continue
        const d = Math.hypot(r.u - u, r.v - v)
        if (d < best) {
          best = d
          dst = r
        }
      }
      if (!dst) return false
    }
    const src = dst
      ? { u: dst.u - 3.6, v: dst.v - 2.4, y: 1.1 }
      : (FIGS.find((q) => q.kind === 2 && visible(q.u, q.v)) ?? FIGS[0])
    from.u = src.u
    from.v = src.v
    from.y = src.y ?? 0.5
    return !!launch(from, false, dst)
  }

  // Draw one catalogued piece and nothing else. Indexed geometry counts a draw range
  // in indices, non-indexed in vertices, which is why the edge pass divides by three.
  // Messages and their reactions stay on, because an arriving one is the point.
  // Nothing on the page calls this; the gallery does.
  const ALL = Infinity
  const isolate = (c) => {
    const city = !!c && !c.layer
    cityMesh.visible = cityLines.visible = !c || city
    figMesh.visible = figLines.visible = !c || c.layer === 'fig'
    discMesh.visible = discLines.visible = !c || c.layer === 'disc'
    cityGeo.setDrawRange(city ? c.i0 : 0, city ? c.iN : ALL)
    cityEdgeGeo.setDrawRange(city ? c.e0 / 3 : 0, city ? c.eN / 3 : ALL)
    const fig = c?.layer === 'fig'
    const fi = FIG_BOXES * boxT.idx.length
    figGeo.setDrawRange(fig ? c.slot * fi : 0, fig ? fi : ALL)
    figEdgeGeo.setDrawRange(fig ? c.slot * FIG_BOXES * BOXE : 0, fig ? FIG_BOXES * BOXE : ALL)
    const disc = c?.layer === 'disc'
    const di = DISCS * cylT.idx.length
    discGeo.setDrawRange(disc ? c.slot * di : 0, disc ? di : ALL)
    discEdgeGeo.setDrawRange(disc ? c.slot * DISCS * CYLE : 0, disc ? DISCS * CYLE : ALL)
  }

  // Stop the city sending on its own. poke() still works, so a gallery can show one
  // delivery at a time instead of the whole post round crossing its frame.
  const hush = (on) => (hushed = on)

  return { render, resize, retint, world, camera, catalog, poke, isolate, hush, face }
}
