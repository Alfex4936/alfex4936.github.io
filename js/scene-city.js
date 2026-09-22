// Page backdrop: an isometric city behind the whole page. Messages leave rooftops as
// speech bubbles, arc over the streets and drop into a datastore, where one disc lights
// and settles. Figures stand at street level; one taps a phone and sends. Scrolling
// flies the view along the city.

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
const U_HALF = 29 // built half-width in u: covers a 2670px frame at SCALE
const V_BACK = 32 // 850px of city above centre
const V_FWD = 40 // and enough below it to outlast the pan

const AVE_I = 5 // every fifth plot one way and every seventh the other is an avenue
const AVE_J = 7
const GAP = 0.22 // and a fifth of what is left is a yard
const LOW = 0.52 // over half of the rest never leaves the low-rise carpet

const FACE = { px: 0, nx: 4, py: 8, ny: 12, pz: 16, nz: 20 }
// Faces are cut from the page, not lit: the darkest side sits a hair above --bg-2.
const RAMP = {
  city: { top: 0.105, pz: 0.058, px: 0.024, dark: 0.008 },
  store: { top: 0.135, pz: 0.075, px: 0.032, dark: 0.01 },
  fig: { top: 0.2, pz: 0.14, px: 0.085, dark: 0.045 },
}
const LIT_INK = 0.14 // how far a landed disc lifts its top face
const LIT_TAU = 0.44
const BREATHE = 0.055 // the stack is never quite still, so it reads as in use

const DISCS = 5
const DISC_R = 0.8
const DISC_H = 0.17
const DISC_GAP = 0.075
const DISC_Y = (k) => k * (DISC_H + DISC_GAP)
const STACK_TOP = DISCS * DISC_H + (DISCS - 1) * DISC_GAP
const DISC_SCALE = (k) => (k === 0 ? 1.15 : 1 - k * 0.04) // a wider base, a slight taper

const BW = 0.27 // the bubble, in screen units: 25px across, 17 tall
const BH = 0.19
const BR = 0.085
const MAXB = 6 // a handful in flight, never a stream
const SEND_MIN = 0.85
const SEND_VAR = 0.85
const PHONE_EVERY = 8.5 // the tapper sends on his own clock

const FIG_BODY = [0.15, 0.36, 0.15]
const FIG_HEAD = [0.13, 0.15, 0.13]
const FIG_NECK = 0.045 // the head clears the shoulders, or the pair reads as one post
const FIG_HAND = [0.08, 0.07, 0.08]
const FIG_BOXES = 3

// Spread in u so the gutters have something at any width and a phone still has a
// neighbour at 390px, and in v so three of the four are on screen at any scroll.
const STORES = [
  { u: -11.5, v: -13.5 },
  { u: 2.6, v: -1.5 },
  { u: -3.8, v: 11 },
  { u: 12.5, v: 21.5 },
]
const FIGS = [
  { u: -9, v: -11.6, kind: 1 },
  { u: -12.8, v: -15.4, kind: 0 },
  { u: 3.4, v: -3.8, kind: 2 }, // taps a phone beside the second store
  { u: -5.8, v: 9.2, kind: 0 },
  { u: 11, v: 19.2, kind: 1 },
  { u: 0.4, v: 3.6, kind: 0 },
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

// Low-frequency, so the tall blocks arrive in districts rather than as noise.
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
  // A disc gets the same three-face treatment as a box: the split runs down the corner
  // nearest the camera, and the half facing away is never drawn.
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
  // Room for every plot twice over, filled once and then trimmed: growing three plain
  // arrays past a hundred thousand entries is most of the mount cost.
  const IMAX = Math.ceil(((U_HALF + V_FWD) * ISQ2) / CELL) + 1
  const CAP = (2 * IMAX + 1) ** 2 * 2
  const cityPos = new Float32Array(CAP * BOXV * 3)
  const cityEdge = new Float32Array(CAP * BOXE * 3)
  const cityIdx = new Uint32Array(CAP * boxT.idx.length)
  let boxes = 0

  const emit = (x, y, z, w, h, d) => {
    const base = boxes * BOXV
    let o = boxes * BOXV * 3
    for (let i = 0; i < BOXV * 3; i += 3) {
      cityPos[o + i] = boxT.pos[i] * w + x
      cityPos[o + i + 1] = boxT.pos[i + 1] * h + y
      cityPos[o + i + 2] = boxT.pos[i + 2] * d + z
    }
    o = boxes * BOXE * 3
    for (let i = 0; i < BOXE * 3; i += 3) {
      cityEdge[o + i] = boxT.edge[i] * w + x
      cityEdge[o + i + 1] = boxT.edge[i + 1] * h + y
      cityEdge[o + i + 2] = boxT.edge[i + 2] * d + z
    }
    o = boxes * boxT.idx.length
    for (let i = 0; i < boxT.idx.length; i++) cityIdx[o + i] = boxT.idx[i] + base
    boxes++
  }

  const cleared = new Set()
  const cellKey = (i, j) => i * 1000 + j
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

  const roofs = []
  for (let i = -IMAX; i <= IMAX; i++) {
    for (let j = -IMAX; j <= IMAX; j++) {
      if (i % AVE_I === 0 || j % AVE_J === 0) continue
      if (cleared.has(cellKey(i, j))) continue
      const x = i * CELL
      const z = j * CELL
      const u = (x - z) * ISQ2
      const v = (x + z) * ISQ2
      if (Math.abs(u) > U_HALF || v < -V_BACK || v > V_FWD) continue
      if (rnd(i, j, 0) < GAP) continue

      const d = clamp01(district(u, v))
      const r1 = rnd(i, j, 1)
      const r2 = rnd(i, j, 2)
      const r3 = rnd(i, j, 3)
      const r4 = rnd(i, j, 4)
      // A low-rise carpet with towers standing out of it, rather than one mean height.
      let h = 0.3 + (0.25 + 2.2 * d ** 2) * (0.5 + 0.85 * r1)
      if (rnd(i, j, 5) < LOW) h = Math.min(h, 0.5 + 0.7 * r1)
      h = Math.min(3.7, h)
      const w = CELL * (0.34 + 0.26 * r2)
      const dp = CELL * (0.34 + 0.26 * r3)
      emit(x, 0, z, w, h, dp)
      let top = h
      if (r4 > 0.7 && h > 1.3) {
        const h2 = h * (0.14 + 0.26 * r4)
        emit(x + (r2 - 0.5) * w * 0.18, h, z + (r3 - 0.5) * dp * 0.18, w * 0.58, h2, dp * 0.58)
        top = h + h2
      }
      if (top > 0.95) roofs.push({ u, v, y: top })
    }
  }

  const cityGeo = new THREE.BufferGeometry()
  cityGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(cityPos.subarray(0, boxes * BOXV * 3), 3),
  )
  cityGeo.setIndex(new THREE.BufferAttribute(cityIdx.subarray(0, boxes * boxT.idx.length), 1))
  const cityCol = new THREE.Float32BufferAttribute(new Float32Array(boxes * BOXV * 3), 3)
  cityGeo.setAttribute('color', cityCol)
  const cityEdgeGeo = new THREE.BufferGeometry()
  cityEdgeGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(cityEdge.subarray(0, boxes * BOXE * 3), 3),
  )
  const cityEdgeMat = new THREE.LineBasicMaterial()
  world.add(
    new THREE.Mesh(cityGeo, new THREE.MeshBasicMaterial({ vertexColors: true })),
    new THREE.LineSegments(cityEdgeGeo, cityEdgeMat),
  )

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
  world.add(
    new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ vertexColors: true })),
    new THREE.LineSegments(discEdgeGeo, new THREE.LineBasicMaterial({ vertexColors: true })),
  )

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

  const tone = new Float32Array(12)
  const paintDisc = (s, k) => {
    const d = s.discs[k]
    const r = RAMP.store
    const steps = [r.top + d.lit * LIT_INK, r.px + d.lit * LIT_INK * 0.4, r.pz, r.dark]
    for (let f = 0; f < 4; f++) {
      ink(steps[f], _c1)
      tone[f * 3] = _c1.r
      tone[f * 3 + 1] = _c1.g
      tone[f * 3 + 2] = _c1.b
    }
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

  // ---- figures -----------------------------------------------------------
  // Three boxes each and no face: a shape at street level, not a character anyone owns.
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

  FIGS.forEach((f, n) => {
    f.slot = n * FIG_BOXES
    f.phase = n * 1.31
    f.dx = 0
    f.bob = 0
    f.tap = 0
    f.sendAt = PHONE_EVERY * 0.45 + n
  })

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
      f.dx = Math.sin(t * 0.26 + f.phase) * 1.35
      f.bob = Math.abs(Math.sin(t * 1.5 + f.phase)) * 0.022
    } else if (f.kind === 2) {
      f.bob = Math.sin(t * 0.9 + f.phase) * 0.012
      f.tap = Math.sin(t * 5.4 + f.phase) * 0.02
    } else {
      f.bob = Math.sin(t * 0.7 + f.phase) * 0.014
    }
  }

  const hand = new Float64Array(3) // held, not returned: nothing in the frame allocates
  const handPos = (f) => {
    hand[0] = f.x + f.dx + 0.12
    hand[1] = FIG_BODY[1] * 0.78 + f.bob + f.tap
    hand[2] = f.z + 0.12 // out in front, so the arm is not swallowed by the body
  }

  const writeFig = (f) => {
    const x = f.x + f.dx
    writeBox(figPos, figEdgePos, f.slot, x, f.bob, f.z, FIG_BODY[0], FIG_BODY[1], FIG_BODY[2])
    const y = FIG_BODY[1] + FIG_NECK + f.bob
    writeBox(figPos, figEdgePos, f.slot + 1, x, y, f.z, FIG_HEAD[0], FIG_HEAD[1], FIG_HEAD[2])
    handPos(f)
    const s = f.kind === 2 ? 1 : 0.85 // only the tapper is holding anything
    writeBox(
      figPos,
      figEdgePos,
      f.slot + 2,
      hand[0],
      hand[1],
      hand[2],
      FIG_HAND[0] * s,
      FIG_HAND[1] * s,
      FIG_HAND[2] * s,
    )
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

  const PARK = -900 // a slot with nothing in it collapses below the frustum
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

  const scratch = new Float32Array(NPT * 3)
  const writeBubble = (slot, x, y, z, sx, sy, flip) => {
    for (let i = 0; i < NPT; i++) {
      const a = outline[i * 2] * sx * flip
      const b = outline[i * 2 + 1] * sy
      scratch[i * 3] = x + RX * a + UX * b
      scratch[i * 3 + 1] = y + UP_Y * b
      scratch[i * 3 + 2] = z - RX * a + UX * b
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
  const to = { u: 0, v: 0, y: 0, store: null }
  let sendAt = 0.6

  const visible = (u, v) => Math.abs(u) < uVis + 1.5 && Math.abs(v - panV) < vVis + 2

  const pick = (list) => {
    let n = 0
    let hit = null
    for (const c of list) {
      if (!visible(c.u, c.v)) continue
      n++
      if (Math.random() * n < 1) hit = c // reservoir: one pass, no array built
    }
    return hit
  }

  // Most messages go to a store, because that is the beat worth reading; the rest go
  // roof to roof so the city is not four pilgrimages.
  const launch = (src, near) => {
    const p = pool.pop()
    if (!p) return null
    let got = false
    if (Math.random() < 0.72) {
      let best = Infinity
      for (const s of STORES) {
        if (near && !visible(s.u, s.v)) continue
        const d = Math.hypot(s.u - src.u, s.v - src.v)
        if (d < best && d > 1.5) {
          best = d
          to.u = s.u
          to.v = s.v
          to.y = STACK_TOP
          to.store = s
          got = true
        }
      }
    }
    if (!got) {
      const r = pick(roofs)
      if (!r || Math.hypot(r.u - src.u, r.v - src.v) < 2) {
        pool.push(p)
        return null
      }
      to.u = r.u
      to.v = r.v
      to.y = r.y
      to.store = null
    }
    const dist = Math.hypot(to.u - src.u, to.v - src.v)
    p.u0 = src.u
    p.v0 = src.v
    p.y0 = src.y
    p.u1 = to.u
    p.v1 = to.v
    p.y1 = to.y
    p.store = to.store
    p.lift = Math.min(3.2, 1.3 + dist * 0.22)
    p.dur = Math.min(3.6, 1.6 + dist * 0.1)
    p.t = 0
    p.flip = to.u >= src.u ? 1 : -1 // the tail trails the flight
    live.push(p)
    return p
  }

  const land = (p) => {
    const s = p.store
    if (!s) return
    const d = s.discs[s.next]
    s.next = (s.next + 1) % DISCS
    d.lit = 1
    d.age = 0
  }

  const stepBubbles = (dt) => {
    sendAt -= dt
    if (sendAt <= 0) {
      sendAt = SEND_MIN + Math.random() * SEND_VAR
      const r = pick(roofs)
      if (r) launch(r, true)
    }
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

  // ---- paint -------------------------------------------------------------
  const paintAll = () => {
    spread(cityCol, boxRamp(RAMP.city), boxes)
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
      let best = null
      let bd = Infinity
      for (const r of roofs) {
        if (!visible(r.u, r.v)) continue
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
      for (const f of FIGS) {
        stepFig(f, age)
        if (f.kind === 2 && age > f.sendAt) {
          f.sendAt = age + PHONE_EVERY * (0.7 + Math.random() * 0.6)
          handPos(f)
          from.u = (hand[0] - hand[2]) * ISQ2
          from.v = (hand[0] + hand[2]) * ISQ2
          from.y = hand[1]
          launch(from, false)
        }
      }
    }
    world.position.set(-panV * ISQ2, 0, -panV * ISQ2)

    for (const f of FIGS) writeFig(f)
    figPosAttr.needsUpdate = true
    figEdgeAttr.needsUpdate = true
    writeBubbles()
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

  return { render, resize, retint }
}
