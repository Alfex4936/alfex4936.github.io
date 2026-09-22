// Page backdrop: two isometric lanes, one in each gutter beside the transcript.
// Packets run down both continuously; every 9-15s a burst lands on one lane, the queue
// behind that lane's node grows where you can see it, and the node drains it back to
// baseline. The one idea: it stays level under load. Scroll travels along the lanes.

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

const NODE_MIN = 4.5 // the node's outline carries the form, so it holds the text ratio
const NODE_FLOOR = 0.72
const RAIL_MIN = 2.6 // the rail runs the whole page height: legible, never loud
const RAIL_FLOOR = 0.3

const palette = (tokens) => {
  const bg = bytes(tokens.bg)
  const dim = bytes(tokens.dim)
  const rule = bytes(tokens.rule)
  return {
    bg2: bytes(tokens['bg-2']),
    fg: bytes(tokens.fg),
    dim, // nothing in the scene is brighter than a --dim edge
    edge: blend(rule, dim, solve(rule, dim, bg, NODE_MIN, NODE_FLOOR)),
    rail: blend(rule, dim, solve(rule, dim, bg, RAIL_MIN, RAIL_FLOOR)),
  }
}

// ---- layout --------------------------------------------------------------
// u is screen-right, v is screen-depth and also pure screen-down. A lane laid along
// v is parked in a gutter by its u alone and never leaves it, however long it runs.
// Iso maps u=(x-z)/√2, v=(x+z)/√2, so a point (u,v) sits at x=(u+v)/√2, z=(v-u)/√2.

const ISQ2 = Math.SQRT1_2
const UP_Y = 0.81649658 // screen-Y per unit of world-Y
const DOWN_V = 0.5773503 // screen-Y per unit of v

// A lane that runs straight down the screen has no visible side wall in any
// projection — the view direction lies in that wall's own plane, so it collapses to
// a line. The rail is therefore a run of plates, and the joints between them are the
// only place its thickness can read.
const RAIL_W = 0.65
const RAIL_T = 0.14
const PLATE_V = 4.6
const JOINT = 0.38
const PLATES = 46 // 229 v units of rail: more than the tallest viewport plus the pan

// A packet is small against its rail on purpose: the rail is the structure and the
// packets are only the movement. 18px of cube on a 34px rail.
const CUBE = 0.24
const NODE_W = 0.58
const NODE_H = 0.42
const NODE_HALF = NODE_W * ISQ2 // the node's own half-length along v
const QGAP = 0.82 // queued cubes a few px clear of each other: bunched, still countable
const HEAD_REL = -(NODE_HALF + QGAP * 0.5) // where the head of the queue waits
const EXIT_REL = NODE_HALF + CUBE * ISQ2 + 0.04 // clear of the node's downstream face
const SPD = 7 // v per second in free flight; SPD/QGAP is the conveyor's own ceiling
const MAXP = 64 // packet slots per lane

const FACE = { px: 0, nx: 4, py: 8, ny: 12, pz: 16, nz: 20 }
// Faces are cut from the page, not lit: the darkest side sits a hair above --bg-2.
// px/nx are edge-on on the rail, so they cost nothing there.
const RAMP = {
  rail: { top: 0.075, pz: 0.05, px: 0.006, dark: 0.006 },
  node: { top: 0.17, pz: 0.08, px: 0.028, dark: 0.008 },
  packet: { top: 0.3, pz: 0.19, px: 0.13, dark: 0.07 }, // its --dim edge carries it
}
const PULSE_INK = 0.12
const PULSE_TAU = 0.34

// Packets a second at baseline, cycled one per burst so no two cycles read the same.
// Picked by eye to read quietly behind prose: 4-6 cubes in view, 145-210px apart.
const RATES = [1.45, 1, 1.25, 1.15]

// Capacity is HEADROOM over the lane's baseline and never moves inside a cycle, so the
// drain always wins. Doubled capacity against a 3.4x arrival leaves 1.4x accumulating:
// the queue peaks at 2.8 times the baseline rate in cubes, three or four of them, a
// queue you can count rather than a column, and drains in 2.8s at any rate.
const HEADROOM = 2
const BURST_MULT = 3.4 // arrival during a burst, so the queue has to form
const BURST_DUR = 2
const BURST_MIN = 9
const BURST_VAR = 6 // a burst every 9-15s
const STAGGER = 3.5 // and never within this of the other lane's
const CALM = 1 // the queue has to have been empty this long before the rate steps on
const NODE_AT = [0.38, 0.6] // screen fraction each node parks at, unpanned

const SCALE = 52 // px per world unit: the drawing does not zoom, it fits
const PAN_PX = 190 // total screen travel from scroll top to bottom
const PAN_TAU = 0.32 // so a flicked wheel arrives as a glide

// The page's mask keeps a strip either side of its transcript and feathers away the
// middle, so the visible strips are always the ones against the window edges. Each
// lane is anchored to its own edge, which lands it in the strip at any width and means
// the scene needs to know nothing about where that band sits.
const EDGE_PAD = 24 // enough that a lane reads as placed at the margin, not clipped by it

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const approach = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau))

export default function traffic({ THREE, canvas, width, height, tokens, still }) {
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
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400)
  camera.position.set(120, 120, 120) // normalize(1,1,1): 45° around Y, atan(1/√2) down
  camera.lookAt(0, 0, 0)

  const world = new THREE.Group() // the pan lives here
  scene.add(world)

  let W = Math.max(1, width)
  let H = Math.max(1, height)
  let fh = H / SCALE
  let panV = 0 // v units the camera has travelled down the lanes
  let panMax = 0
  let panTarget = 0

  // ---- geometry ----------------------------------------------------------
  // One template, tiled: every packet in the scene is two draw calls, not two per
  // packet, and a per-face ramp still works because they all share it.
  const tile = (src, n, dz) => {
    const out = new Float32Array(src.length * n)
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * dz
      const base = k * src.length
      for (let i = 0; i < src.length; i += 3) {
        out[base + i] = src[i]
        out[base + i + 1] = src[i + 1]
        out[base + i + 2] = src[i + 2] + off
      }
    }
    return out
  }

  const tileIndex = (src, n, verts) => {
    const out = new Uint16Array(src.length * n)
    for (let k = 0; k < n; k++)
      for (let i = 0; i < src.length; i++) out[k * src.length + i] = src[i] + k * verts
    return out
  }

  const boxParts = (w, h, d, dy) => {
    const g = new THREE.BoxGeometry(w, h, d)
    g.translate(0, dy, 0)
    const e = new THREE.EdgesGeometry(g)
    return {
      pos: g.attributes.position.array,
      idx: g.index.array,
      edge: e.attributes.position.array,
    }
  }

  // both lanes share one rail: same shape, different position, one buffer
  const railMat = new THREE.MeshBasicMaterial({ vertexColors: true })
  const railEdgeMat = new THREE.LineBasicMaterial()
  const railGeo = new THREE.BufferGeometry()
  const railEdgeGeo = new THREE.BufferGeometry()
  let railCol
  {
    const p = boxParts(RAIL_W, RAIL_T, PLATE_V, -RAIL_T / 2) // plate top at y=0
    const step = PLATE_V + JOINT
    railGeo.setAttribute('position', new THREE.Float32BufferAttribute(tile(p.pos, PLATES, step), 3))
    railGeo.setIndex(new THREE.BufferAttribute(tileIndex(p.idx, PLATES, 24), 1))
    railCol = new THREE.Float32BufferAttribute(new Float32Array(PLATES * 72), 3)
    railGeo.setAttribute('color', railCol)
    railEdgeGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(tile(p.edge, PLATES, step), 3),
    )
  }

  const nodeParts = boxParts(NODE_W, NODE_H, NODE_W, NODE_H / 2) // sits on the rail
  // which edge pairs are the top rim, so the pulse is a vertex-colour write and not
  // a second draw call
  const nodeIsTop = (() => {
    const e = nodeParts.edge
    const n = e.length / 3
    const flags = new Uint8Array(n)
    for (let i = 0; i < n; i += 2) {
      const t = e[i * 3 + 1] > NODE_H - 1e-4 && e[(i + 1) * 3 + 1] > NODE_H - 1e-4 ? 1 : 0
      flags[i] = t
      flags[i + 1] = t
    }
    return flags
  })()

  // ---- packets -----------------------------------------------------------
  const SLOTS = MAXP * 2
  const cube = boxParts(CUBE, CUBE, CUBE, CUBE / 2) // sitting on the rail, which is y=0
  const pkGeo = new THREE.BufferGeometry()
  const pkEdgeGeo = new THREE.BufferGeometry()
  const pkPos = new Float32Array(SLOTS * 72)
  const pkEdgePos = new Float32Array(SLOTS * 72)
  // BufferAttribute, not Float32BufferAttribute: that subclass copies the array it is
  // handed, and every per-frame write would land in a buffer nothing draws from.
  const pkPosAttr = new THREE.BufferAttribute(pkPos, 3)
  const pkEdgeAttr = new THREE.BufferAttribute(pkEdgePos, 3)
  const pkCol = new THREE.Float32BufferAttribute(new Float32Array(SLOTS * 72), 3)
  pkPosAttr.setUsage(THREE.DynamicDrawUsage)
  pkEdgeAttr.setUsage(THREE.DynamicDrawUsage)
  pkGeo.setAttribute('position', pkPosAttr)
  pkGeo.setAttribute('color', pkCol)
  pkGeo.setIndex(new THREE.BufferAttribute(tileIndex(cube.idx, SLOTS, 24), 1))
  pkEdgeGeo.setAttribute('position', pkEdgeAttr)
  const pkMesh = new THREE.Mesh(pkGeo, new THREE.MeshBasicMaterial({ vertexColors: true }))
  const pkEdgeMat = new THREE.LineBasicMaterial()
  const pkEdges = new THREE.LineSegments(pkEdgeGeo, pkEdgeMat)
  pkMesh.frustumCulled = false
  pkEdges.frustumCulled = false
  world.add(pkMesh, pkEdges)

  const PARK = -400 // a slot with nothing in it collapses below the frustum
  const park = (slot) => {
    const o = slot * 72
    for (let i = 0; i < 72; i += 3) {
      pkPos[o + i] = 0
      pkPos[o + i + 1] = PARK
      pkPos[o + i + 2] = 0
      pkEdgePos[o + i] = 0
      pkEdgePos[o + i + 1] = PARK
      pkEdgePos[o + i + 2] = 0
    }
  }

  const writePacket = (slot, u, v) => {
    const x = (u + v) * ISQ2
    const z = (v - u) * ISQ2
    const o = slot * 72
    for (let i = 0; i < 72; i += 3) {
      pkPos[o + i] = cube.pos[i] + x
      pkPos[o + i + 1] = cube.pos[i + 1]
      pkPos[o + i + 2] = cube.pos[i + 2] + z
      pkEdgePos[o + i] = cube.edge[i] + x
      pkEdgePos[o + i + 1] = cube.edge[i + 1]
      pkEdgePos[o + i + 2] = cube.edge[i + 2] + z
    }
  }

  // ---- lanes -------------------------------------------------------------
  const lanes = [0, 1].map((i) => {
    const nodeGeo = new THREE.BufferGeometry()
    nodeGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodeParts.pos.slice(), 3))
    nodeGeo.setIndex(new THREE.BufferAttribute(nodeParts.idx.slice(), 1))
    const nodeCol = new THREE.Float32BufferAttribute(new Float32Array(72), 3)
    nodeGeo.setAttribute('color', nodeCol)
    const nodeEdgeGeo = new THREE.BufferGeometry()
    nodeEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodeParts.edge.slice(), 3))
    const nodeEdgeCol = new THREE.Float32BufferAttribute(new Float32Array(nodeParts.edge.length), 3)
    nodeEdgeGeo.setAttribute('color', nodeEdgeCol)

    const rail = new THREE.Mesh(railGeo, railMat)
    rail.rotation.y = Math.PI / 4 // local +Z onto v, so the plates run down the screen
    const railEdges = new THREE.LineSegments(railEdgeGeo, railEdgeMat)
    railEdges.rotation.y = Math.PI / 4
    const node = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ vertexColors: true }))
    node.add(
      new THREE.LineSegments(nodeEdgeGeo, new THREE.LineBasicMaterial({ vertexColors: true })),
    )
    world.add(rail, railEdges, node)

    const pool = []
    for (let k = 0; k < MAXP; k++) pool.push({ slot: i * MAXP + k, rel: 0, st: 0, past: false })

    return {
      side: i ? 1 : -1,
      at: NODE_AT[i],
      u: 0,
      nodeV: 0,
      rail,
      railEdges,
      node,
      nodeCol,
      nodeEdgeCol,
      pool,
      live: [],
      q: [],
      busy: null,
      serveT: 0,
      serveDur: 1,
      pulse: 0,
      painted: -1,
      acc: 0,
      step: i * 2, // the lanes are always two apart in the rotation, so never equal
      rate: 1,
      nextBurst: 3.4 + i * 5.5, // staggered from the first one on
      burstEnds: -1,
      calmAt: -1,
      spawn: 0,
      despawn: 0,
    }
  })

  const setRate = (L) => {
    L.rate = RATES[L.step % RATES.length]
    L.serveDur = 1 / (L.rate * HEADROOM)
  }
  for (const L of lanes) setRate(L)

  // ---- painting ----------------------------------------------------------
  const one = new Float32Array(72)

  const rampInto = (out, r) => {
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
    for (let k = 0; k < n; k++) attr.array.set(src, k * 72)
    attr.needsUpdate = true
  }

  const paintRail = () => {
    spread(railCol, rampInto(one, RAMP.rail), PLATES)
    put(railEdgeMat.color, P.rail)
  }

  const paintPackets = () => {
    spread(pkCol, rampInto(one, RAMP.packet), SLOTS)
    put(pkEdgeMat.color, P.edge)
  }

  const paintNode = (L) => {
    const a = L.nodeCol.array
    a.set(rampInto(one, RAMP.node))
    ink(RAMP.node.top + L.pulse * PULSE_INK, _c1)
    for (let i = FACE.py; i < FACE.py + 4; i++) {
      a[i * 3] = _c1.r
      a[i * 3 + 1] = _c1.g
      a[i * 3 + 2] = _c1.b
    }
    L.nodeCol.needsUpdate = true

    // the pulse rides the top rim up to full --dim, the brightest line in the scene
    put(_c1, P.edge)
    put(_c2, blend(P.edge, P.dim, L.pulse))
    const e = L.nodeEdgeCol.array
    for (let i = 0; i < nodeIsTop.length; i++) {
      const c = nodeIsTop[i] ? _c2 : _c1
      e[i * 3] = c.r
      e[i * 3 + 1] = c.g
      e[i * 3 + 2] = c.b
    }
    L.nodeEdgeCol.needsUpdate = true
    L.painted = L.pulse
  }

  paintRail()
  paintPackets()

  // ---- traffic -----------------------------------------------------------
  // no park here: every frame parks all slots before writing the live ones
  const release = (L, p) => L.pool.push(p)

  const admit = (L) => {
    const p = L.pool.pop()
    if (!p) return // the lane is saturated: skip this arrival rather than stutter
    p.rel = L.spawn
    p.st = 0
    p.past = false
    L.live.push(p)
  }

  const clearLane = (L) => {
    while (L.live.length) release(L, L.live.pop())
    L.q.length = 0
    L.busy = null
    L.pulse = 0
    L.acc = 0
  }

  const stepLane = (L, age, dt) => {
    if (age >= L.nextBurst) {
      L.burstEnds = age + BURST_DUR
      const other = lanes[L === lanes[0] ? 1 : 0]
      let next = age + BURST_MIN + Math.random() * BURST_VAR
      if (Math.abs(next - other.nextBurst) < STAGGER) next += STAGGER
      L.nextBurst = next
    }
    const bursting = age < L.burstEnds

    L.acc += L.rate * (bursting ? BURST_MULT : 1) * dt
    while (L.acc >= 1) {
      L.acc -= 1
      admit(L)
    }

    // the node: one cube at a time, capacity fixed at HEADROOM over baseline
    if (L.busy) {
      L.serveT += dt / L.serveDur
      const k = clamp01(L.serveT)
      L.busy.rel = L.busy.from + (EXIT_REL - L.busy.from) * k
      if (k >= 1) {
        L.busy.st = 0
        L.busy.past = true
        L.busy = null
        L.pulse = 1 // pulses as each one clears
      }
    }
    if (!L.busy && L.q.length && L.q[0].rel >= HEAD_REL - 0.02) {
      L.busy = L.q.shift()
      L.busy.st = 2
      L.busy.from = L.busy.rel
      L.serveT = 0
    }

    // queued cubes close up as the queue drains, never faster than they were moving
    for (let i = 0; i < L.q.length; i++) {
      const p = L.q[i]
      p.rel = Math.min(p.rel + SPD * dt, HEAD_REL - QGAP * i)
    }

    for (const p of L.live) {
      if (p.st) continue
      p.rel += SPD * dt
      if (p.past) continue
      const stop = HEAD_REL - QGAP * L.q.length
      if (p.rel >= stop) {
        p.rel = stop
        p.st = 1
        L.q.push(p)
      }
    }

    while (L.live.length && L.live[0].rel > L.despawn) release(L, L.live.shift())

    L.pulse = Math.max(0, L.pulse - dt / PULSE_TAU)

    // the drain is done: step the rotation on, so capacity only ever changes on a lane
    // with nothing queued behind it
    if (L.q.length) L.calmAt = age
    if (L.burstEnds > 0 && age > L.burstEnds && age - L.calmAt > CALM) {
      L.burstEnds = -1
      L.step += 1
      setRate(L)
    }
  }

  // One frame with both lanes at baseline and the queue empty. Phase-shifted so no
  // cube parks inside a node, where it would read as a gap in the flow.
  const compose = () => {
    for (const L of lanes) {
      clearLane(L)
      const gap = SPD / L.rate
      let start = L.spawn + gap * (L === lanes[0] ? 0.37 : 0.71)
      for (let k = 0; k < 4; k++) {
        let hit = false
        for (let r = start; r < L.despawn; r += gap) if (Math.abs(r) < NODE_HALF + 0.3) hit = true
        if (!hit) break
        start += gap * 0.24
      }
      for (let r = start; r < L.despawn && L.pool.length; r += gap) {
        const p = L.pool.pop()
        p.rel = r
        p.st = 0
        p.past = r > 0
        L.live.push(p)
      }
    }
  }

  // ---- frame -------------------------------------------------------------
  let docSpan = 1
  let readAt = -1

  const readScroll = (age) => {
    if (readAt < 0 || age - readAt > 0.5) {
      readAt = age
      docSpan = Math.max(1, document.documentElement.scrollHeight - innerHeight)
    }
    panTarget = clamp01(scrollY / docSpan)
  }

  const resize = (w, h) => {
    W = Math.max(1, w)
    H = Math.max(1, h)
    fh = H / SCALE
    const fw = W / SCALE
    camera.left = -fw / 2
    camera.right = fw / 2
    camera.top = fh / 2
    camera.bottom = -fh / 2
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(dpr())
    renderer.setSize(W, H, false)

    panMax = PAN_PX / (DOWN_V * SCALE)
    const S = fh / (2 * DOWN_V) // half the viewport, in v
    for (const L of lanes) {
      L.u = L.side * Math.max(0, (W / 2 - EDGE_PAD) / SCALE - NODE_HALF)
      L.nodeV = (fh * (L.at - 0.5)) / DOWN_V
      L.node.position.set((L.u + L.nodeV) * ISQ2, 0, (L.nodeV - L.u) * ISQ2)
      L.rail.position.set(L.u * ISQ2, 0, -L.u * ISQ2)
      L.railEdges.position.copy(L.rail.position)
      // packets are held relative to the node, so a resize moves them with it
      L.spawn = -L.nodeV - S - 1.6
      L.despawn = panMax - L.nodeV + S + 1.6
    }
  }

  resize(W, H)

  let t0 = -1

  const render = (t, dt) => {
    if (t0 < 0) t0 = t
    const age = t - t0
    readScroll(age)

    if (still) {
      panV = panTarget * panMax
      compose()
    } else {
      panV = approach(panV, panTarget * panMax, dt, PAN_TAU)
      for (const L of lanes) stepLane(L, age, dt)
    }
    world.position.set(-panV * ISQ2, 0, -panV * ISQ2)

    for (let s = 0; s < SLOTS; s++) park(s)
    for (const L of lanes) {
      for (const p of L.live) writePacket(p.slot, L.u, L.nodeV + p.rel)
      if (L.painted !== L.pulse) paintNode(L)
    }
    pkPosAttr.needsUpdate = true
    pkEdgeAttr.needsUpdate = true

    renderer.render(scene, camera)
  }

  const retint = (next) => {
    P = palette(next)
    paintRail()
    paintPackets()
    for (const L of lanes) paintNode(L)
  }

  return { render, resize, retint }
}
