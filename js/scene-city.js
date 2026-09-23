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
// The river runs along world x on the j = 0 avenue, so it lies with the street grid and
// crosses the frame corner to corner: top-left gutter, behind the column, bottom-right.
const RZ = 1.4 // half-width in z; 91px across on screen
const WATER_Y = -0.14 // below the street, so the far bank shows a lit wall
const RIVER_X = 44 // long enough to leave the frame at both ends of the pan
const BRIDGE_X = [-26.4, -19.2, 19.2, 26.4] // two per gutter; the outer pair only on a wide screen

const GUT_KEEP = 0.46 // of the plots the avenues leave, out where the ink is full
const MID_KEEP = 0.18 // and a sparse ankle-high floor behind the column
const MID_H = 0.2
const TREE_KEEP = 0.72 // of the bare gutter plots in frame; a few parks, not a forest
const TREE_U = 18 // inside a 1660 frame, so a laptop sees most of them
const TREE_GAP = 3.6 // u–v distance between parks

const FACE = { px: 0, nx: 4, py: 8, ny: 12, pz: 16, nz: 20 }
// Faces are cut from the page, not lit: the darkest side sits a hair above --bg-2.
// Slots run [top, +x, +z, away] for every primitive, boxes, drums and roofs alike.
const RAMP = {
  city: { top: 0.105, pz: 0.058, px: 0.024, dark: 0.008 },
  mark: { top: 0.128, pz: 0.073, px: 0.032, dark: 0.009 }, // a landmark's own walls
  stone: { top: 0.082, pz: 0.048, px: 0.021, dark: 0.008 }, // platforms and gate bases
  roof: { top: 0.17, pz: 0.152, px: 0.086, dark: 0.016 }, // tile, and nothing else
  store: { top: 0.135, pz: 0.075, px: 0.032, dark: 0.01 },
  leaf: { top: 0.118, pz: 0.066, px: 0.028, dark: 0.009 }, // ink like the rest: green is what a message is
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
// Tile and a band running up a tower cover a large area at low contrast, and under the
// canvas's 0.66 they lost to a heart or a ring. They get more ink; point events do not.
const FX_GAIN = { glow: 0.32, climb: 0.34 }
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
const FIG_BOXES = 4
const WALK = 1.15 // half the walker's beat, in world x; keeps him inside his gutter

// One datastore per gutter, outboard of the landmarks so the inner ring is set pieces.
// Both snap to plot centres, as the figures do; every one of these lands clear of the
// water and of the set pieces' keep-outs, which the carpet pass then leaves empty.
const STORES = [
  { u: -13.8, v: 1 },
  { u: 13.6, v: 19 },
]
const FIGS = [
  { u: -12.4, v: -2.6, kind: 2 }, // taps a phone up the street from the left-hand store
  { u: -13.5, v: -10.4, kind: 0 }, // on the south bank, by the bridge
  { u: -13.6, v: 5.6, kind: 1 },
  { u: -12.8, v: 14.5, kind: 0 },
  { u: -14.2, v: 17.5, kind: 1 },
  { u: 12.6, v: -8.3, kind: 2 }, // and one sending from between the palace and the gate
  { u: 13.9, v: -3.5, kind: 0 },
  { u: 12.9, v: 0.6, kind: 1 },
  { u: 13.9, v: 5.5, kind: 0 },
  { u: 13.6, v: 17, kind: 0 },
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

  const seg = (p, q) => line(p[0], p[1], p[2], q[0], q[1], q[2])
  // (b - a) × (c - a), accumulated into n
  const crossAdd = (n, a, b, c) => {
    const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2]
    const bx = c[0] - a[0], by = c[1] - a[1], bz = c[2] - a[2]
    n[0] += ay * bz - az * by
    n[1] += az * bx - ax * bz
    n[2] += ax * by - ay * bx
  }

  // Flat quads in any orientation, one part for the lot: [p0, p1, p2, p3, slot, out].
  // Each is wound so its normal agrees with `out`, or with the camera when there is none.
  const emitQuads = (list, ramp) => {
    const v0 = cPos.length / 3
    const face = []
    const n = [0, 0, 0]
    for (const [p0, p1, p2, p3, slot, out = [1, 1, 1]] of list) {
      const b = cPos.length / 3
      for (const p of [p0, p1, p2, p3]) cPos.push(p[0], p[1], p[2])
      n[0] = n[1] = n[2] = 0
      crossAdd(n, p0, p1, p2)
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) cIdx.push(b, b + 1, b + 2, b, b + 2, b + 3)
      else cIdx.push(b, b + 2, b + 1, b, b + 3, b + 2)
      face.push(slot, slot, slot, slot)
    }
    parts.push({ v0, n: cPos.length / 3 - v0, ramp, face })
    return parts.length - 1
  }

  // A plan outline (CCW from +x toward +z) swept through profile rings [y, sx, sz, ox, oz].
  // One part per band, so a reaction can walk it bottom to top; each facet takes the slot
  // its own normal asks for, which is what lets a taper or a flare shade like one.
  const emitLoft = (cx, cz, plan, prof, ramp, o = {}) => {
    const n = plan.length
    const R = prof.map(([y, sx, sz = sx, ox = 0, oz = 0]) =>
      plan.map(([px, pz]) => [cx + ox + px * sx, y, cz + oz + pz * sz]))
    const a = parts.length
    const nm = [0, 0, 0]
    for (let r = 0; r + 1 < R.length; r++) {
      const v0 = cPos.length / 3
      const face = []
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const q = [R[r][i], R[r][j], R[r + 1][j], R[r + 1][i]]
        const b = cPos.length / 3
        for (const p of q) cPos.push(p[0], p[1], p[2])
        cIdx.push(b, b + 2, b + 1, b, b + 3, b + 2)
        nm[0] = nm[1] = nm[2] = 0
        crossAdd(nm, q[0], q[2], q[1])
        crossAdd(nm, q[0], q[3], q[2])
        const ny = nm[1] / (Math.hypot(nm[0], nm[1], nm[2]) || 1)
        const s = ny > 0.72 ? 0 : ny < -0.5 ? 3 : nm[0] >= nm[2] ? 1 : 2
        face.push(s, s, s, s)
      }
      parts.push({ v0, n: cPos.length / 3 - v0, ramp, face })
    }
    if (o.cap) {
      const top = R[R.length - 1]
      const [y, , , ox = 0, oz = 0] = prof[prof.length - 1]
      const c = [cx + ox, y, cz + oz]
      const v0 = cPos.length / 3
      for (let i = 0; i < n; i++) {
        const b = cPos.length / 3
        const pj = top[(i + 1) % n]
        for (const p of [c, top[i], pj, pj]) cPos.push(p[0], p[1], p[2])
        cIdx.push(b, b + 2, b + 1)
      }
      parts.push({ v0, n: n * 4, ramp, face: new Array(n * 4).fill(0) })
    }
    for (const r of o.rings ?? [0, R.length - 1]) for (let i = 0; i < n; i++) seg(R[r][i], R[r][(i + 1) % n])
    for (const i of o.verts ?? []) for (let r = 0; r + 1 < R.length; r++) seg(R[r][i], R[r + 1][i])
    return { a, b: parts.length }
  }
  const circle = (n) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * 2 * Math.PI), Math.sin((i / n) * 2 * Math.PI)])
  const SQUARE = [[1, 1], [-1, 1], [-1, -1], [1, -1]] // 0 faces the camera, 1 and 3 are the silhouette

  // hx, hz are the eave half-extents before the corners flare; rise is ridge over eave.
  // n perimeter samples, a multiple of four so the corners land on samples.
  // opt.alongZ turns the ridge onto world z; opt.fascia hangs a board of that depth
  // under the two eaves the camera sees, which is what gives the tile a thickness.
  const emitRoof = (cx, y, cz, hx, hz, rise, n, ribs, opt = {}) => {
    const Z = !!opt.alongZ
    const toW = (lx, ly, lz) => (Z ? [cx + lz, ly, cz + lx] : [cx + lx, ly, cz + lz])
    const slot = (s) => (Z && (s === 1 || s === 2) ? 3 - s : s)
    const seg4 = n / 4
    const rx = hx * ROOF_RIDGE
    const sm = Math.min(1, hz / 0.5) // a narrow roof cannot carry a palace's flare
    const ring = []
    const slope = new Uint8Array(n)
    for (let e = 0; e < 4; e++) {
      for (let s = 0; s < seg4; s++) {
        const t = s / seg4
        const ex = e === 1 ? hx : e === 3 ? -hx : e === 0 ? -hx + 2 * hx * t : hx - 2 * hx * t
        const ez = e === 0 ? -hz : e === 2 ? hz : e === 1 ? -hz + 2 * hz * t : hz - 2 * hz * t
        const k = Math.min(Math.abs(ex) / hx, Math.abs(ez) / hz)
        const back = ex < 0 && ez < 0 ? 0.3 : 1 // the far corner projects up past the ridge
        const out = 1 + ROOF_FLARE * sm * back * k ** 3
        const fx = ex * out
        const fz = ez * out
        const ey = rise * ROOF_TURN * sm * back * k ** 2.4 // the corner turns up
        const tx = Math.max(-rx, Math.min(rx, fx)) // and folds back onto the ridge
        const i = e * seg4 + s
        slope[i] = slot(e === 2 ? 2 : e === 1 ? 1 : 3)
        for (let r = 0; r <= ROOF_R; r++) {
          const p = r / ROOF_R
          ring[r * n + i] = toW(fx + (tx - fx) * p, y + ey + (rise - ey) * p ** 1.5, fz * (1 - p))
        }
      }
    }

    // Non-indexed quads: a fold between two slopes has to stay a fold, and a shared
    // corner vertex would smear one ramp step into the next.
    const v0 = cPos.length / 3
    const face = []
    for (let r = 0; r < ROOF_R; r++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const b = cPos.length / 3
        for (const p of [ring[r * n + i], ring[r * n + j], ring[(r + 1) * n + j], ring[(r + 1) * n + i]])
          cPos.push(p[0], p[1], p[2])
        if (Z) cIdx.push(b, b + 1, b + 2, b, b + 2, b + 3) // mirrored, so the winding flips
        else cIdx.push(b, b + 2, b + 1, b, b + 3, b + 2)
        face.push(slope[i], slope[i], slope[i], slope[i])
      }
    }
    parts.push({ v0, n: n * ROOF_R * 4, ramp: RAMP.roof, face })

    for (let i = 0; i < n; i++) seg(ring[i], ring[(i + 1) % n])
    const up = (i) => {
      for (let r = 0; r < ROOF_R; r++) seg(ring[r * n + i], ring[(r + 1) * n + i])
    }
    for (let e = 0; e < 4; e++) up(e * seg4) // the four hips
    if (ribs) for (const e of [1, 2]) for (let s = 1; s < seg4; s++) up(e * seg4 + s)
    const cap = Math.min(1, hz / 0.9) // a house-sized roof gets a house-sized 용마루
    const rh = (0.085 + 0.09 * rise) * cap
    const rw = 0.17 * cap
    if (Z) emitBox(cx, y + rise, cz, rw, rh, 2 * rx + rw, RAMP.stone) // 용마루
    else emitBox(cx, y + rise, cz, 2 * rx + rw, rh, rw, RAMP.stone) // 용마루
    if (opt.fascia) {
      const d = opt.fascia
      const q = []
      for (const e of [1, 2]) {
        const out = toW(e === 1 ? 1 : 0, 0, e === 2 ? 1 : 0).map((c, k) => c - [cx, 0, cz][k])
        for (let s = 0; s < seg4; s++) {
          const i = e * seg4 + s
          const p = ring[i]
          const pj = ring[(i + 1) % n]
          const lo = (w) => [w[0], w[1] - d, w[2]]
          q.push([p, pj, lo(pj), lo(p), slope[i], out])
          seg(lo(p), lo(pj))
        }
      }
      emitQuads(q, RAMP.mark)
    }
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

  // A wooded hill, a slender shaft, the flared deck, and a mast a third of the height:
  // those three proportions are the whole recognition. Every piece is turned, not boxed.
  const namsan = (u, v) => {
    const [x, z] = at(u, v)
    const hill = Array.from({ length: 24 }, (_, i) => {
      const t = (i / 24) * 2 * Math.PI
      const r = 1 + 0.06 * Math.sin(2 * t + 1) + 0.04 * Math.sin(3 * t + 2.3)
      return [r * Math.cos(t), r * Math.sin(t)]
    })
    const HF = [1, 0.9, 0.75, 0.56, 0.36, 0.16]
    const HY = [0, 0.3, 0.62, 0.84, 0.98, 1.06]
    emitLoft(x, z, hill, HF.map((f, k) => [HY[k], 1.9 * f, 1.65 * f]), RAMP.stone, { cap: true, rings: [0] })
    const hillY = (q) => {
      for (let k = 1; k < HF.length; k++)
        if (q >= HF[k]) return HY[k - 1] + ((HF[k - 1] - q) / (HF[k - 1] - HF[k])) * (HY[k] - HY[k - 1])
      return HY[HY.length - 1]
    }
    const C8 = circle(8)
    // Packed crowns that overlap each other and sink into the slope read as one canopy;
    // spaced out, each one reads as a part bolted on.
    let seed = 0
    for (const [q, m] of [[0.42, 9], [0.58, 12], [0.73, 15], [0.87, 18]]) {
      for (let k = 0; k < m; k++) {
        const j = (seed++ * 0.618) % 1
        const t = ((k + 0.5 * j) / m) * 2 * Math.PI + q * 3
        if (Math.cos(t) > 0.55 && Math.sin(t) > -0.2 && q < 0.6) continue // the plaza at the tower foot
        const qq = q + 0.06 * (j - 0.5)
        const r = 1 + 0.06 * Math.sin(2 * t + 1) + 0.04 * Math.sin(3 * t + 2.3)
        const s = 0.85 + 0.3 * j
        const ty = hillY(qq) - 0.08 * s
        emitLoft(x + 1.9 * qq * r * Math.cos(t), z + 1.65 * qq * r * Math.sin(t), C8,
          [[ty, 0.1 * s], [ty + 0.1 * s, 0.2 * s], [ty + 0.2 * s, 0.18 * s], [ty + 0.27 * s, 0.1 * s], [ty + 0.3 * s, 0]], RAMP.mark, { rings: [1] })
      }
    }

    const C16 = circle(16)
    emitBox(x, 1.0, z, 0.7, 0.22, 0.6, RAMP.mark) // the base building on the summit
    emitLoft(x, z, C16, [[1.22, 0.2], [2.6, 0.14]], RAMP.mark, { verts: [2, 6, 14] })
    const DY = [0, 0.12, 0.24, 0.38, 0.48, 0.56]
    const DR = [0.16, 0.5, 0.58, 0.56, 0.4, 0.2]
    emitLoft(x, z, C16, DY.map((d, k) => [2.6 + d, DR[k]]), RAMP.store, { cap: true, rings: [1, 2, 3], verts: [6, 14] })
    const m0 = 3.16
    const MS = [[0, 0.075], [0.35, 0.07], [0.35, 0.055], [0.75, 0.05], [0.75, 0.04], [1.2, 0.03], [1.3, 0]]
    const mast = emitLoft(x, z, C8, MS.map(([d, r]) => [m0 + d, r]), RAMP.mark, { rings: [0, 2, 4], verts: [3, 7] })
    roofs.push({ u, v, y: m0, kind: 'blink', ...mast, ax: x, ay: m0 + 1.3, az: z })
    keepOut.push([x, z, 2.1, 1.9])
  }

  // A rounded square that narrows on a concave curve, the seam down each face, and the
  // top split into four petals leaning in. One loft band per step, so the climb reads.
  const lotte = (u, v) => {
    const [x, z] = at(u, v)
    emitBox(x, 0, z, 2.2, 0.32, 1.9, RAMP.stone)
    const RC = 0.28
    const plan = []
    for (let q = 0; q < 4; q++) {
      const a0 = (q * Math.PI) / 2
      const rot = ([px, pz]) => [px * Math.cos(a0) - pz * Math.sin(a0), px * Math.sin(a0) + pz * Math.cos(a0)]
      plan.push(rot([1 - 0.035, 0])) // the seam, a hair inside the face
      for (let k = 0; k < 3; k++) {
        const t = (k / 2) * (Math.PI / 2)
        plan.push(rot([1 - RC + RC * Math.cos(t), 1 - RC + RC * Math.sin(t)]))
      }
    }
    const N = 26
    const y0 = 0.32
    const y1 = 5.22
    const sOf = (t) => 0.56 * (1 - 0.55 * t ** 1.7)
    const prof = Array.from({ length: N + 1 }, (_, k) => [y0 + ((y1 - y0) * k) / N, sOf(k / N)])
    const tower = emitLoft(x, z, plan, prof, RAMP.mark, { cap: true, verts: [0, 2, 4, 6, 8, 10, 12, 14] })
    const s = sOf(1)
    for (const [dx, dz] of SQUARE)
      emitLoft(x, z, SQUARE, [[y1, 0.44 * s, 0.44 * s, dx * 0.54 * s, dz * 0.54 * s], [y1 + 0.58, 0.03, 0.03, dx * 0.42 * s, dz * 0.42 * s]], RAMP.mark, { verts: [0, 1, 3] })
    roofs.push({ u, v, y: y1 + 0.58, kind: 'climb', a: tower.a, b: parts.length })
    keepOut.push([x, z, 1.2, 1.1])
  }

  // 근정전: the two-tier 월대 with its balustrade and front stair, a colonnade standing
  // off a recessed wall, then two tiers of tile, the lower one wider and deeper.
  const geunjeongjeon = (u, v) => {
    const [x, z] = at(u, v)
    emitBox(x, 0, z, 3.3, 0.24, 2.8, RAMP.stone)
    emitBox(x, 0.24, z, 2.7, 0.22, 2.25, RAMP.stone)
    // A rail and its posts, inset from each tier's edge; the front run breaks for the stair.
    const rail = (hx, hz, y0, y1) => {
      const run = (ax, az, bx, bz) => {
        seg([x + ax, y1, z + az], [x + bx, y1, z + bz])
        const L = Math.hypot(bx - ax, bz - az)
        for (let k = 0, m = Math.round(L / 0.3); k <= m; k++) {
          const px = x + ax + ((bx - ax) * k) / m
          const pz = z + az + ((bz - az) * k) / m
          seg([px, y0, pz], [px, y1, pz])
        }
      }
      run(-hx, -hz, hx, -hz)
      run(hx, -hz, hx, hz)
      run(-hx, -hz, -hx, hz)
      run(-hx, hz, -0.3, hz)
      run(0.3, hz, hx, hz)
    }
    rail(1.65 - 0.08, 1.4 - 0.08, 0.24, 0.31)
    rail(1.35 - 0.08, 1.125 - 0.08, 0.46, 0.53)
    for (let k = 0; k < 3; k++) {
      emitBox(x, 0, z + 1.4 + 0.12 * k + 0.06, 0.5, 0.24 - 0.06 * (k + 1), 0.12, RAMP.stone)
      emitBox(x, 0.24, z + 1.125 + 0.09 * k + 0.045, 0.5, 0.22 - 0.055 * (k + 1), 0.09, RAMP.stone)
    }
    const fy = 0.46
    emitBox(x, fy, z, 1.9, 0.58, 1.55, RAMP.mark)
    for (let k = -2; k <= 2; k++) emitBox(x + k * 0.56, fy, z + 0.88, 0.14, 0.66, 0.14, RAMP.mark)
    for (let k = -1; k <= 1; k++) emitBox(x + 1.12, fy, z + k * 0.56, 0.14, 0.66, 0.14, RAMP.mark)
    const tile = parts.length
    emitRoof(x, 1.12, z, 1.55, 1.24, 0.7, 32, true, { fascia: 0.08 })
    emitBox(x, 1.7, z, 1.35, 0.54, 1.1, RAMP.mark)
    emitRoof(x, 2.24, z, 1.18, 0.95, 0.62, 32, true, { fascia: 0.07 })
    roofs.push({ u, v, y: 2.86, kind: 'glow', a: tile, b: parts.length })
    keepOut.push([x, z, 2.0, 1.8])
  }

  // 숭례문: a battered granite base pierced by one 홍예 arch, the city wall running off
  // both sides, 여장 around the top, then the two-tier 문루.
  const sungnyemun = (u, v) => {
    const [x, z] = at(u, v)
    const gate = parts.length
    emitLoft(x, z, SQUARE, [[0, 1.35, 0.75], [1, 1.25, 0.65]], RAMP.stone, { cap: true, verts: [0, 1, 2, 3] })
    const fz = (y) => z + 0.75 - 0.1 * y + 0.004 // the +z face, which leans in as it rises
    const AR = 0.31
    const AS = 0.42
    const U = [[-AR, 0], [-AR, AS]]
    for (let k = 1; k < 12; k++) {
      const t = Math.PI - (k / 12) * Math.PI
      U.push([AR * Math.cos(t), AS + AR * Math.sin(t)])
    }
    U.push([AR, AS], [AR, 0])
    const P = ([dx, y]) => [x + dx, y, fz(y)]
    const c = P([0, 0.35])
    const fan = []
    for (let k = 0; k < U.length; k++) {
      const p = P(U[k])
      const q = P(U[(k + 1) % U.length])
      fan.push([c, p, q, q, 2, [0, 0.1, 1]])
    }
    emitQuads(fan, RAMP.gate)
    const glowEnd = parts.length
    for (let k = 0; k + 1 < U.length; k++) seg(P(U[k]), P(U[k + 1]))
    const VR = 0.38
    let prev = null
    for (let k = 0; k <= 16; k++) {
      const t = Math.PI - (k / 16) * Math.PI
      const o = P([VR * Math.cos(t), AS + VR * Math.sin(t)])
      if (prev) seg(prev, o)
      prev = o
      if (k % 2 === 0 && k > 0 && k < 16) seg(P([AR * Math.cos(t), AS + AR * Math.sin(t)]), o) // voussoir joints
    }
    for (const y of [0.3, 0.62]) {
      const fx = x + 1.35 - 0.1 * y
      const hz = 0.75 - 0.1 * y
      const hx = 1.35 - 0.1 * y
      seg([fx, y, z - hz], [fx, y, z + hz])
      const gap = y < AS ? AR : Math.sqrt(VR * VR - (y - AS) ** 2)
      seg(P([-hx, y]), P([-gap, y]))
      seg(P([gap, y]), P([hx, y]))
    }
    for (const sd of [-1, 1]) {
      emitBox(x + sd * 1.6, 0, z, 0.6, 0.62, 0.9, RAMP.stone) // the city wall, cut short
      for (let k = -1; k <= 1; k++) emitBox(x + sd * 1.6 + k * 0.2, 0.62, z + 0.39, 0.12, 0.1, 0.1, RAMP.stone)
    }
    for (let k = -4; k <= 4; k++)
      for (const sd of [-1, 1]) emitBox(x + k * 0.3, 1, z + sd * 0.6, 0.14, 0.1, 0.1, RAMP.stone) // 여장
    for (let k = -1.5; k <= 1.5; k++)
      for (const sd of [-1, 1]) emitBox(x + sd * 1.2, 1, z + k * 0.3, 0.1, 0.1, 0.14, RAMP.stone)
    emitBox(x, 1, z, 1.5, 0.42, 0.95, RAMP.mark)
    for (let k = -2; k <= 2; k++) emitBox(x + k * 0.36, 1, z + 0.515, 0.08, 0.42, 0.08, RAMP.mark)
    for (let k = -1; k <= 1; k++) emitBox(x + 0.79, 1, z + k * 0.3, 0.08, 0.42, 0.08, RAMP.mark)
    emitRoof(x, 1.42, z, 1.42, 0.98, 0.5, 32, true, { fascia: 0.07 })
    emitBox(x, 1.88, z, 1.2, 0.32, 0.82, RAMP.mark)
    emitRoof(x, 2.2, z, 1.16, 0.8, 0.44, 32, true, { fascia: 0.06 })
    roofs.push({ u, v, y: 2.64, kind: 'glow', a: gate, b: glowEnd })
    keepOut.push([x, z, 1.95, 1.1])
  }

  // 63: a thin slab whose roof is one slope falling toward the river, long side on z so
  // the camera gets the slope in profile. Quads, because a box cannot cut a diagonal.
  const bldg63 = (u, v) => {
    const [x, z] = at(u, v)
    emitBox(x, 0, z, 1.4, 0.26, 2.0, RAMP.stone)
    const hw = 0.31
    const hd = 0.675
    const y0 = 0.26
    const yN = 3.9 // at -z
    const yS = 2.6 // at +z
    const top = (dz) => yN + ((yS - yN) * (dz + hd)) / (2 * hd)
    const P = (dx, y, dz) => [x + dx, y, z + dz]
    emitQuads([
      [P(hw, y0, -hd), P(hw, y0, hd), P(hw, yS, hd), P(hw, yN, -hd), 1, [1, 0, 0]],
      [P(-hw, y0, hd), P(hw, y0, hd), P(hw, yS, hd), P(-hw, yS, hd), 2, [0, 0, 1]],
      [P(-hw, y0, -hd), P(-hw, y0, hd), P(-hw, yS, hd), P(-hw, yN, -hd), 3, [-1, 0, 0]],
      [P(-hw, y0, -hd), P(hw, y0, -hd), P(hw, yN, -hd), P(-hw, yN, -hd), 3, [0, 0, -1]],
    ], RAMP.mark)
    const crown = emitQuads([[P(-hw, yN, -hd), P(hw, yN, -hd), P(hw, yS, hd), P(-hw, yS, hd), 0, [0, 1, 1]]], RAMP.mark)
    for (const [dx, dz] of [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]]) seg(P(dx, y0, dz), P(dx, top(dz), dz))
    for (const dx of [hw, -hw]) seg(P(dx, yN, -hd), P(dx, yS, hd))
    for (const dz of [hd, -hd]) seg(P(-hw, top(dz), dz), P(hw, top(dz), dz))
    for (let k = 1; k <= 8; k++) {
      const dz = -hd + k * 0.15
      seg(P(hw, y0, dz), P(hw, top(dz), dz))
    }
    for (let k = 1; k <= 3; k++) seg(P(-hw + k * 0.155, y0, hd), P(-hw + k * 0.155, yS, hd))
    roofs.push({ u, v, y: yS, kind: 'blink', a: crown, b: crown + 1, ax: x, ay: yN, az: z - hd })
    keepOut.push([x, z, 0.9, 1.1])
  }

  // 한옥: a ㄷ-shaped house opening toward the camera, its yard walled in 담장 with a
  // tiled cap, and a small roofed 대문 in the front run.
  const hanok = (u, v) => {
    const [x, z] = at(u, v)
    const glow = (dx, dz, y, a) =>
      roofs.push({ u: u + (dx - dz) * ISQ2, v: v + (dx + dz) * ISQ2, y, kind: 'glow', a, b: parts.length })
    let a = parts.length
    emitBox(x, 0, z - 0.6, 1.76, 0.34, 0.64, RAMP.mark) // 안채
    emitRoof(x, 0.34, z - 0.6, 1.056, 0.384, 0.34, 40, false, { fascia: 0.05 })
    glow(0, -0.6, 0.68, a)
    for (const sd of [-1, 1]) {
      a = parts.length
      emitBox(x + sd * 0.75, 0, z + 0.26, 0.56, 0.34, 0.78, RAMP.mark)
      emitRoof(x + sd * 0.75, 0.34, z + 0.26, 0.47, 0.336, 0.28, 32, false, { alongZ: true, fascia: 0.05 })
      glow(sd * 0.75, 0.26, 0.62, a)
    }
    const wall = (cx, cz, w, d) => {
      emitBox(x + cx, 0, z + cz, w, 0.22, d, RAMP.stone)
      emitBox(x + cx, 0.22, z + cz, w + 0.06, 0.04, d + 0.06, RAMP.roof)
    }
    wall(0, -1.2, 2.98, 0.08)
    for (const sd of [-1, 1]) wall(sd * 1.45, 0.025, 0.08, 2.45)
    for (const sd of [-1, 1]) wall(sd * 0.825, 1.25, 1.25, 0.08)
    for (const sd of [-1, 1]) emitBox(x + sd * 0.2, 0, z + 1.25, 0.06, 0.3, 0.06, RAMP.mark)
    emitRoof(x, 0.3, z + 1.25, 0.3, 0.16, 0.12, 24, false)
    keepOut.push([x, z, 1.6, 1.4])
  }

  // 한강 runs along world x, so it crosses the frame on the diagonal and its banks are
  // z-Y planes, which this camera can see. The water sits below grade behind a stone
  // embankment; its far edge stops where it meets the south bank's line on screen.
  const river = () => {
    const X = RIVER_X
    const zs = RZ + 2 * WATER_Y
    // Broken lines along the flow: water with nothing on it reads as a gap in the city.
    const flow = Array.from({ length: 34 }, (_, k) => {
      const x1 = -X + 2 * X * ((k * 0.618) % 1)
      return [x1, Math.min(x1 + 1.4 + 2.6 * ((k * 0.2237) % 1), X), -RZ + 0.25 + (zs + RZ - 0.45) * ((k * 0.3719) % 1)]
    })
    // Built in three reaches so the gallery can show the middle one without the whole river.
    const cut = [-X, -19.2, -12, X]
    const surf = parts.length
    for (let k = 0; k < 3; k++) {
      const a = cut[k]
      const b = cut[k + 1]
      if (k === 1) mark()
      emitQuads([[[a, WATER_Y, -RZ], [b, WATER_Y, -RZ], [b, WATER_Y, zs], [a, WATER_Y, zs], 0, [0, 1, 0]]], RAMP.water)
      emitQuads([[[a, WATER_Y, -RZ], [b, WATER_Y, -RZ], [b, 0, -RZ], [a, 0, -RZ], 2, [0, 0, 1]]], RAMP.stone)
      parts[parts.length - 1].still = true // the embankment stays put when the water answers
      seg([a, 0, -RZ], [b, 0, -RZ])
      seg([a, WATER_Y, -RZ], [b, WATER_Y, -RZ])
      seg([a, 0, RZ], [b, 0, RZ])
      for (const [x1, x2, dz] of flow)
        if (Math.min(x2, b) > Math.max(x1, a)) seg([Math.max(x1, a), WATER_Y + 0.002, dz], [Math.min(x2, b), WATER_Y + 0.002, dz])
      if (k === 1) note('한강 · Han river', -15.6 * ISQ2, -15.6 * ISQ2, 0.3)
    }
    for (const rx of [-22.8, -15.6, 15.6, 22.8])
      roofs.push({ u: rx * ISQ2, v: rx * ISQ2, y: WATER_Y + 0.02, wet: 1, kind: 'ripple', a: surf, b: parts.length })
  }

  // A deck on piers with two bowstring trusses over the water, 한강철교 style. The span
  // runs along z, so the arches are z-Y shapes and curve on screen instead of collapsing.
  const bridge = (xb) => {
    const hw = 0.5
    const DY = 0.34
    const deckY = (z) => (Math.abs(z) <= 1.7 ? DY : DY * Math.max(0, (2.7 - Math.abs(z)) / 1.0))
    const Z = [-2.7, -2.2, -1.7]
    for (let k = 1; k <= 8; k++) Z.push(-1.7 + (3.4 * k) / 8)
    Z.push(2.2, 2.7)
    const a = parts.length
    for (let k = 0; k + 1 < Z.length; k++) {
      const z0 = Z[k]
      const z1 = Z[k + 1]
      const y0 = deckY(z0)
      const y1 = deckY(z1)
      const f0 = Math.max(0, y0 - 0.1)
      const f1 = Math.max(0, y1 - 0.1)
      emitQuads([
        [[xb - hw, y0, z0], [xb + hw, y0, z0], [xb + hw, y1, z1], [xb - hw, y1, z1], 0, [0, 1, 0]],
        [[xb + hw, y0, z0], [xb + hw, y1, z1], [xb + hw, f1, z1], [xb + hw, f0, z0], 1, [1, 0, 0]],
      ], RAMP.deck)
      for (const sd of [-1, 1]) seg([xb + sd * hw, y0, z0], [xb + sd * hw, y1, z1])
      seg([xb + hw, f0, z0], [xb + hw, f1, z1])
    }
    roofs.push({ u: xb * ISQ2, v: xb * ISQ2, y: DY, kind: 'climb', a, b: parts.length })
    for (const [pz, py] of [[-RZ + 0.1, WATER_Y], [0, WATER_Y], [RZ - 0.1, 0]])
      emitBox(xb, py, pz, 0.9, DY - 0.1 - py, 0.2, RAMP.stone)

    const RISE = 0.5
    for (const [za, zb] of [[-RZ, 0], [0, RZ]]) {
      const arch = (sx, t) => [xb + sx * hw, DY + RISE * Math.sin(Math.PI * t), za + (zb - za) * t]
      const deck = (sx, t) => [xb + sx * hw, DY, za + (zb - za) * t]
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 12; k++) seg(arch(sx, k / 12), arch(sx, (k + 1) / 12))
        for (let k = 1; k < 6; k++) seg(deck(sx, k / 6), arch(sx, k / 6)) // hangers
        for (let k = 0; k < 6; k++) seg(k % 2 ? arch(sx, k / 6) : deck(sx, k / 6), k % 2 ? deck(sx, (k + 1) / 6) : arch(sx, (k + 1) / 6))
      }
      for (const t of [1 / 3, 1 / 2, 2 / 3]) seg(arch(-1, t), arch(1, t))
    }
    keepOut.push([xb, 0, 0.7, RZ + 1.6])
  }

  river()
  for (const xb of BRIDGE_X) {
    mark()
    bridge(xb)
    note('한강 다리 · Han bridge', xb * ISQ2, xb * ISQ2, 0.84)
  }

  // The set pieces sit just outside the ink boundary, staggered side to side so no two
  // big shapes share a height; the plain carpet fills outward from behind them.
  // Built and recorded in one step: the gallery draws any one of these from its slice.
  const set = [
    ['N서울타워 · Namsan Tower', namsan, 11.5, 4.5, 4.5],
    ['경복궁 근정전 · Geunjeongjeon', geunjeongjeon, 11, -12.5, 2.8],
    ['숭례문 · Sungnyemun', sungnyemun, 10.9, -4, 2.7],
    ['롯데월드타워 · Lotte World Tower', lotte, -11, 10, 5.8],
    ['63빌딩 · 63 Building', bldg63, -11.2, -7, 3.9],
    ['한옥 · Hanok cluster', hanok, -11, 19.5, 0.9],
  ]
  for (const [name, build, bu, bv, bh] of set) {
    mark()
    build(bu, bv)
    note(name, bu, bv, bh)
  }

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
  STORES.forEach((st, k) => {
    mark()
    const box = { layer: 'disc', slot: k, r: DISC_R * 1.2 }
    note('데이터스토어 · Datastore', st.u, st.v, STACK_TOP, box)
  })

  const open = []
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
      if (Math.abs(z) < RZ + 0.3) continue // nothing stands in the water
      let blocked = false
      for (const [kx, kz, ka, kb] of keepOut)
        if (Math.abs(x - kx) < ka + CELL * 0.4 && Math.abs(z - kz) < kb + CELL * 0.4) {
          blocked = true
          break
        }
      if (blocked) continue

      const gut = Math.abs(u) > INK_U
      if (rnd(i, j, 0) > (gut ? GUT_KEEP : MID_KEEP)) {
        if (Math.abs(u) > GUTTER_U) open.push({ i, j, x, z, u, v }) // bare, so a tree may stand here
        continue
      }
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
        for (let k = 0; k < n; k++) {
          const sx = x + (k - (n - 1) / 2) * sw * 1.85
          emitBox(sx, 0, z, sw, sh, bd * 0.5)
          emitBox(sx, sh, z - bd * 0.1, sw * 0.7, 0.16, bd * 0.13, RAMP.stone) // 옥탑 lift core
        }
        top(sh)
        note('아파트 · Apartment slabs', u, v, sh)
      } else if (kind < 0.46) {
        // 기와 저층: a low hall under a tiled roof. The eave used to overhang the
        // walls by nearly 40% and the thing read as a mushroom; 15% is a roof.
        const bh = Math.max(0.44, Math.min(h, 0.72) * 0.95)
        emitBox(x, 0, z, bw * 0.8, bh, bd * 0.8, RAMP.mark)
        emitRoof(x, bh, z, bw * 0.46, bd * 0.46, 0.3, 24, false)
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

  // ---- trees -------------------------------------------------------------
  // Three trees a Seoul street really has, each told by silhouette alone: the ginkgo's
  // column, the zelkova's wide dome, the red pine's flat pads stepping up a leaning trunk.
  const TC6 = circle(6)
  const TC8 = circle(8)
  const TC10 = circle(10)
  const SU = [ISQ2, -ISQ2] // one unit of screen-u in world x/z; any other horizontal also moves it up the screen
  const trunk = (x, z, h, r, lean = 0) =>
    emitLoft(x, z, TC6, [[0, r], [h, r * 0.7, r * 0.7, lean * SU[0], lean * SU[1]]], RAMP.stone, { rings: [] })
  const crown = (x, z, plan, prof, ou, rings) =>
    emitLoft(x, z, plan, prof.map(([y, r]) => [y, r, r, ou * SU[0], ou * SU[1]]), RAMP.leaf, { rings })
  const GINKGO = [[0.2, 0.06], [0.34, 0.15], [0.54, 0.19], [0.76, 0.15], [0.92, 0.07], [1, 0]]
  const ZELKOVA = [[0.28, 0.07], [0.4, 0.2], [0.54, 0.32], [0.66, 0.38], [0.78, 0.37], [0.9, 0.3], [1.01, 0.19], [1.05, 0]] // a vase, widest high; each band steeper than 44° so only the crown takes the top shade
  const PAD = [[0, 0.6], [0.03, 1], [0.056, 0.95], [0.082, 0.5], [0.088, 0]] // underside, a short rim, a low dome
  const TREES = [
    ['은행나무 · Ginkgo', 1, (x, z, s) => {
      trunk(x, z, 0.3 * s, 0.035 * s)
      crown(x, z, TC8, GINKGO.map(([y, r]) => [y * s, r * s]), 0, [2])
    }],
    ['느티나무 · Zelkova', 1.05, (x, z, s) => {
      trunk(x, z, 0.4 * s, 0.05 * s)
      crown(x, z, TC10, ZELKOVA.map(([y, r]) => [y * s, r * s]), 0, [3])
    }],
    ['소나무 · Korean red pine', 0.76, (x, z, s, lean) => {
      const h = 0.64 * s
      trunk(x, z, h, 0.035 * s, lean)
      for (const [f, side, r] of [[0.52, -0.1, 0.19], [0.76, 0.1, 0.23], [1, 0, 0.16]]) // pads alternate either side of the lean
        crown(x, z, TC10, PAD.map(([dy, k]) => [h * f + dy * s, r * k * s]), lean * f + side * s * Math.sign(lean), [1])
    }],
  ]
  const deal = [0, 1] // each side hands out the three in turn down the page, out of step with the other
  const groves = []
  const crowded = (u, v) => groves.some((g) => Math.hypot(g.u - u, g.v - v) < TREE_GAP)
  for (const p of open.filter((q) => Math.abs(q.u) < TREE_U).sort((a, b) => a.v - b.v)) {
    if (rnd(p.i, p.j, 20) > TREE_KEEP || crowded(p.u, p.v) || crowded(-p.u, p.v)) continue // parks apart, and never a mirror of one across the column
    const side = p.u > 0 ? 1 : 0
    const kind = deal[side] % 3
    const [name, th, grow] = TREES[kind]
    const two = rnd(p.i, p.j, 24)
    const n = kind === 0 ? 2 + (two < 0.5 ? 1 : 0) : kind === 2 && two < 0.6 ? 2 : 1 // ginkgo in rows, zelkova alone
    const along = rnd(p.i, p.j, 23) < 0.5 // a ginkgo row runs with one street or the other
    const cx = p.x + (rnd(p.i, p.j, 25) - 0.5) * 0.48
    const cz = p.z + (rnd(p.i, p.j, 26) - 0.5) * 0.48
    let built = 0
    let tall = 0
    mark()
    for (let k = 0; k < n; k++) {
      const o = k - (n - 1) / 2
      const [dx, dz] = kind === 0 ? (along ? [o * 0.5, 0] : [0, o * 0.5]) : [o * 0.36, -o * 0.3]
      const tx = cx + dx
      const tz = cz + dz
      if (Math.abs(tz) < RZ + 0.55) continue // the bank stays bare
      const s = 0.85 + 0.3 * rnd(p.i, p.j, 30 + k)
      const h = th * s
      if (keepOut.some(([kx, kz, ka, kb]) => [0, 0.5, 1].some((t) => Math.abs(tx - h * t - kx) < ka + 0.5 && Math.abs(tz - h * t - kz) < kb + 0.5))) continue // (−h, −h) is h straight up the screen: no crown covers a set piece or bridge
      const lean = (0.12 + 0.1 * rnd(p.i, p.j, 40 + k)) * (n > 1 ? Math.sign(o) : rnd(p.i, p.j, 50 + k) < 0.5 ? -1 : 1) // a pair leans apart
      grow(tx, tz, s, lean)
      tall = Math.max(tall, h)
      built++
    }
    if (!built) continue
    deal[side]++
    groves.push(p)
    note(name, p.u, p.v, tall)
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
    cityCol.clearUpdateRanges()
    cityCol.addUpdateRange(0, a.length) // a landing's partial range would otherwise stand in for this whole upload
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
    note(FIG_NAME[f.kind], f.u, f.v, FIG_H, { layer: 'fig', slot: n, r: 0.17, fig: f }) // live, so a gallery can follow the walker
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
    const a = FIG_ARM[0] / 2
    const out = f.u < 0 // outboard, away from the transcript
    arm[0] = f.x + f.dx + (out ? a - FIG_TORSO[0] / 2 : FIG_TORSO[0] / 2 + a) // flush on the visible face, at its outer edge
    arm[1] = FIG_LEG[1] + FIG_TORSO[1] * 0.28 + f.bob + f.tap
    arm[2] = f.z + (out ? FIG_TORSO[2] / 2 + a : a - FIG_TORSO[2] / 2)
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
  let faceT = 0
  const face = (t) => {
    faceT = t
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
      to.store = dst.store ?? null
      to.rec = dst.store ? null : dst
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
      spawn('ring', rx, WATER_Y + 0.03, rz)
      spawn('ring', rx, WATER_Y + 0.03, rz, -0.24) // a second ring behind the first, so it reads as water
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
      const g = p.rec?.fig
      if (g) {
        p.u1 = (g.x + g.dx - g.z) * ISQ2 // a walker keeps walking, so the message homes on him
        p.v1 = (g.x + g.dx + g.z) * ISQ2
      }
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
      if (q.still) continue
      tones(q.ramp, age < 0 ? 0 : f(age, pi - r.a, span), FX_GAIN[r.kind] ?? FX_INK)
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
        if (f.kind === 2 && !hushed && age > f.sendAt) {
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

  // The gallery turns the world under the piece; undo that turn so a message still
  // crosses the frame the same way rather than wherever the spin left it.
  const unturn = (du, dv) => {
    const [ox, oz] = at(du, dv)
    const cs = Math.cos(faceT)
    const sn = Math.sin(faceT)
    const rx = ox * cs - oz * sn
    const rz = ox * sn + oz * cs
    return [(rx - rz) * ISQ2, (rx + rz) * ISQ2]
  }

  // The harness makes a message happen on demand and aims it, since a reaction only
  // exists while one is landing. hop sends one across an empty spot. The page never calls it.
  const poke = (u, v, hop) => {
    if (hop) {
      const [du, dv] = unturn(1.1, 0)
      from.u = u - du
      from.v = v - dv
      from.y = 0.1
      return !!launch(from, false, { u: u + du, v: v + dv, y: 0.1 })
    }
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
      for (const s of STORES) {
        const d = Math.hypot(s.u - u, s.v - v)
        if (d < best) {
          best = d
          dst = { u: s.u, v: s.v, y: STACK_TOP, store: s }
        }
      }
      if (!dst) return false
    }
    const [du, dv] = unturn(-3.6, -2.4) // in from the upper left
    const src = dst
      ? { u: dst.u + du, v: dst.v + dv, y: 1.1 }
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
