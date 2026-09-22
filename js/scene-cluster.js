// Hero backdrop: an isometric cluster city. Six Redis masters with their replicas,
// a slow cycle that holds one node's real measurement, and a hover read on any block.

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
// background. Holds the value dark was signed off with, lifts it only where a
// theme needs it: light's --rule is nearly --bg, so 0.72 lands at 3.6:1 there.
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

const EDGE_MIN = 4.5 // the outlines carry the form, so they are held to the text ratio
const WIRE_MIN = 3 // a 1px replication hairline only has to render
const EDGE_FLOOR = 0.72 // rule → dim at rest; hover always goes to full --dim

const palette = (tokens) => {
  const bg = bytes(tokens.bg)
  const p = {
    bg,
    bg2: bytes(tokens['bg-2']),
    fg: bytes(tokens.fg),
    dim: bytes(tokens.dim),
    faint: bytes(tokens.faint),
    rule: bytes(tokens.rule),
    claude: bytes(tokens.claude),
    dimCss: tokens.dim,
    claudeCss: tokens.claude,
  }
  p.edgeRest = solve(p.rule, p.dim, bg, EDGE_MIN, EDGE_FLOOR)
  p.wire = blend(p.faint, p.dim, solve(p.faint, p.dim, bg, WIRE_MIN, 0))
  return p
}

// ---- layout --------------------------------------------------------------
// u is screen-right, v is screen-depth. Iso maps u=(x-z)/√2, v=(x+z)/√2, so laying
// the city out in u/v keeps it wide and shallow instead of filling the diagonal.

const ISQ2 = Math.SQRT1_2
const SQ2 = Math.SQRT2
const UP_Y = 0.81649658 // world-Y per unit of screen-Y
const COL_U = 4 * SQ2
const ROW_V = 2 * SQ2
const REP_U = 2 * SQ2
const SHIFT_U = -SQ2
const MH = 2.5
const RH = 1.25
const DEPTH = 1.0
const SHARD_W = 1.5 // six equal slot ranges, so six equal footprints
const SWAY = (2 * Math.PI) / 180
const SWAY_T = 18
const GU_IN = 8.35
const GU_OUT = 9.5
const GV_IN = 2.55
const GV_OUT = 3.5

// Faces are cut from the page, not laid on it: the darkest side sits a hair above
// --bg-2 and the top never climbs past a fifth of the way to --fg.
const RAMP = {
  master: { top: 0.16, pz: 0.075, px: 0.025, dark: 0.008 },
  replica: { top: 0.125, pz: 0.058, px: 0.019, dark: 0.006 },
}
const HOVER_LIFT_INK = 0.045
const FLASH_INK = 0.13
const FACE = { px: 0, nx: 4, py: 8, ny: 12, pz: 16, nz: 20 }

const HOT_FROM = 1.1
const HOT_EVERY = 9 // was 5s in the demo; a hero backdrop should not tick
const HOT_TAU = 0.3 // and should cross-fade rather than blink on
// Half-width of the band the page masks out behind its transcript column. The page
// sets --scene-clear to match its own mask; this is the standalone fallback.
const CLEAR_FALLBACK = 404
const HOVER_TAU = 0.085 // hover stays exactly as responsive as the demo
const SHIP_MIN = 18
const SHIP_VAR = 14
const SHIP_TIME = 0.9
const STILL_AGE = 4 // load finished, M1 hot, one packet frozen mid-flight

// 16384 slots over six masters, which is the only split the owner can defend
const SHARDS = [
  { id: 'M1', from: 0, to: 2730, note: '373→4' },
  { id: 'M2', from: 2731, to: 5461, note: '4,858ms→1.1ms' },
  { id: 'M3', from: 5462, to: 8191, note: 'TPS 3,548' },
  { id: 'M4', from: 8192, to: 10922, note: '66×·85%' },
  { id: 'M5', from: 10923, to: 13652, note: '1,677/s' },
  { id: 'M6', from: 13653, to: 16383, note: '27·301' },
]

const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))
const approach = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau))
const clamp01 = (v) => Math.max(0, Math.min(1, v))

export default function cluster({ THREE, canvas, width, height, tokens, still }) {
  const SRGB = THREE.SRGBColorSpace
  let P = palette(tokens)

  const _c1 = new THREE.Color()
  const _c2 = new THREE.Color()
  const _c3 = new THREE.Color()
  const _p = new THREE.Vector3()

  const put = (out, c) => out.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, SRGB)
  const ink = (t, out) => put(out, blend(P.bg2, P.fg, clamp01(Math.min(t, 0.95))))

  const mount = canvas.parentNode
  // the label layer is absolute inside the mount, so the mount has to be its origin
  if (getComputedStyle(mount).position === 'static') mount.style.position = 'relative'
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'

  const labelLayer = document.createElement('div')
  labelLayer.setAttribute('aria-hidden', 'true')
  Object.assign(labelLayer.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  mount.append(labelLayer)

  // measures a hot label off-screen, so the cycle can tell which nodes have room
  const probe = document.createElement('div')
  Object.assign(probe.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    visibility: 'hidden',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font)',
    fontSize: '11.5px',
    letterSpacing: '.01em',
    fontWeight: '500',
  })
  labelLayer.append(probe)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setClearAlpha(0)

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 120)
  camera.position.set(30, 30, 30) // normalize(1,1,1): 45° around Y, atan(1/√2) down
  camera.lookAt(0, 0, 0)

  const city = new THREE.Group()
  scene.add(city)

  let W = Math.max(1, width)
  let H = Math.max(1, height)
  let fh = 10
  let clear = CLEAR_FALLBACK

  // inherited, so the page can set --scene-clear on :root or on the mount itself
  const readClear = () => {
    const v = parseFloat(getComputedStyle(mount).getPropertyValue('--scene-clear'))
    return Number.isFinite(v) ? v : CLEAR_FALLBACK
  }

  // ---- floor -------------------------------------------------------------
  // Diagonal 1px lines on the x/z axes (the iso read), trimmed and faded to a u/v
  // rectangle so the floor ends where the city does.
  let floorCol
  {
    const pos = []
    const col = []
    const falloff = (x, z) => {
      const u = Math.abs((x - z) * ISQ2)
      const v = Math.abs((x + z) * ISQ2)
      const a = 1 - clamp01((u - GU_IN) / (GU_OUT - GU_IN))
      const b = 1 - clamp01((v - GV_IN) / (GV_OUT - GV_IN))
      return Math.min(a, b) ** 0.8
    }
    const push = (x, z, a) => {
      pos.push(x, -0.002, z)
      col.push(0, 0, 0, a)
    }
    const STEP = 0.5
    const SPAN = 15
    for (let axis = 0; axis < 2; axis++) {
      for (let i = -10; i <= 10; i++) {
        for (let t = -SPAN; t < SPAN - 1e-9; t += STEP) {
          const x0 = axis ? i : t
          const z0 = axis ? t : i
          const x1 = axis ? i : t + STEP
          const z1 = axis ? t + STEP : i
          const a0 = falloff(x0, z0)
          const a1 = falloff(x1, z1)
          if (a0 < 0.006 && a1 < 0.006) continue
          push(x0, z0, a0)
          push(x1, z1, a1)
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    floorCol = new THREE.Float32BufferAttribute(col, 4)
    g.setAttribute('color', floorCol)
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    })
    city.add(new THREE.LineSegments(g, mat))
  }

  // ---- blocks ------------------------------------------------------------
  const blocks = []
  const masters = []
  const meshes = []

  const mark = (s) =>
    s.replace(/[0-9][0-9,.]*/g, (m, off) => {
      const prev = off > 0 ? s[off - 1] : ''
      if (/[A-Za-z0-9]/.test(prev)) return m
      return `<span style="color:${P.claudeCss}">${m}</span>`
    })

  const makeBlock = (role, w, h, u, v) => {
    const geo = new THREE.BoxGeometry(w, h, DEPTH)
    geo.translate(0, h / 2, 0)
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3), 3))
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }))

    const eg = new THREE.EdgesGeometry(geo)
    const ep = eg.attributes.position
    const n = ep.count
    const isTop = new Uint8Array(n)
    for (let i = 0; i < n; i += 2) {
      const t = ep.getY(i) > h - 1e-4 && ep.getY(i + 1) > h - 1e-4 ? 1 : 0
      isTop[i] = t
      isTop[i + 1] = t
    }
    eg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors: true }))

    const group = new THREE.Group()
    group.position.set((u + v) * ISQ2, 0, (v - u) * ISQ2)
    group.scale.y = 0.0001
    group.add(mesh, edges)
    city.add(group)

    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      whiteSpace: 'nowrap',
      // the page reads prose in the sans; these are readouts, so mono like the rest
      fontFamily: 'var(--font)',
      fontSize: '11.5px',
      letterSpacing: '.01em',
      opacity: '0',
      transition: 'opacity 170ms linear',
      color: P.dimCss,
    })
    labelLayer.append(el)

    const b = {
      role,
      w,
      h,
      u,
      group,
      mesh,
      edges,
      isTop,
      el,
      ramp: RAMP[role],
      hoverT: 0,
      hotT: 0,
      flash: 0,
      rise: 0,
      halfScreen: ISQ2 * (w + DEPTH) * 0.5,
      state: '',
      width: 0,
      vis: false,
    }
    mesh.userData.block = b
    meshes.push(mesh)
    blocks.push(b)
    return b
  }

  SHARDS.forEach((s, i) => {
    const slots = s.to - s.from + 1
    const u = ((i % 3) - 1) * COL_U + SHIFT_U
    const v = (Math.floor(i / 3) - 0.5) * ROW_V

    const m = makeBlock('master', SHARD_W, MH, u, v)
    const r = makeBlock('replica', SHARD_W, RH, u + REP_U, v)
    const range = `[${s.from}-${s.to}]`
    const count = slots.toLocaleString('en-US')

    m.hotText = `${s.id} ${range}  ${s.note}`
    m.hoverText = `${s.id} ${range} · ${count} slots`
    r.hoverText = `R${s.id.slice(1)} replica of ${s.id} · ${count} slots`
    m.replica = r
    // anchored on the facing top-face corners: a centre-to-centre run dives inside
    // the master and grazes the replica's top, leaving a stub dash on each
    const half = SHARD_W / 2
    m.wireA = new THREE.Vector3(m.group.position.x + half, MH + 0.1, m.group.position.z - DEPTH / 2)
    m.wireB = new THREE.Vector3(r.group.position.x - half, RH + 0.1, r.group.position.z + DEPTH / 2)
    m.nextShip = 3 + i * 3.5 + Math.random() * 2
    masters.push(m)
  })

  const measureHot = () => {
    for (const m of masters) {
      probe.innerHTML = mark(m.hotText)
      m.hotWidth = probe.offsetWidth
    }
  }
  measureHot()

  // staggered load order runs left to right across the city
  blocks
    .slice()
    .sort((a, b) => a.u - b.u)
    .forEach((b, i) => {
      b.riseAt = 0.08 + i * 0.042
    })

  // ---- fit envelope ------------------------------------------------------
  // Worst-case screen-space box over the full sway, floor plate included. Fitting
  // the blocks alone leaves the floor hanging off the left edge.
  const FIT = (() => {
    const pts = []
    for (const b of blocks) {
      const p = b.group.position
      for (const ex of [-1, 1])
        for (const ez of [-1, 1])
          for (const ey of [0, 1]) pts.push(p.x + (ex * b.w) / 2, ey * b.h, p.z + (ez * DEPTH) / 2)
    }
    for (const su of [-1, 1])
      for (const sv of [-1, 1])
        pts.push((su * GU_OUT + sv * GV_OUT) * ISQ2, 0, (sv * GV_OUT - su * GU_OUT) * ISQ2)

    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const th of [-SWAY, 0, SWAY]) {
      const c = Math.cos(th)
      const s = Math.sin(th)
      for (let i = 0; i < pts.length; i += 3) {
        const rx = pts[i] * c + pts[i + 2] * s
        const rz = -pts[i] * s + pts[i + 2] * c
        const px = (rx - rz) * ISQ2
        const py = UP_Y * pts[i + 1] - 0.40824829 * (rx + rz)
        if (px < x0) x0 = px
        if (px > x1) x1 = px
        if (py < y0) y0 = py
        if (py > y1) y1 = py
      }
    }
    return { ex: Math.max(-x0, x1), y0, y1, cy: (y0 + y1) / 2, h: y1 - y0 }
  })()

  // ---- replication wires + packets ---------------------------------------
  const wireMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0 })
  put(wireMat.color, P.wire)
  {
    const pts = []
    for (const m of masters) pts.push(m.wireA, m.wireB)
    city.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), wireMat))
  }

  const packets = []
  const packetGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2)
  const packetCol = new THREE.BufferAttribute(new Float32Array(24 * 3), 3)
  packetGeo.setAttribute('color', packetCol)
  const packetEdgeMat = new THREE.LineBasicMaterial()
  {
    const eg = new THREE.EdgesGeometry(packetGeo)
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true })
    // one packet object is the whole in-flight budget: occasional, not a conveyor belt
    const g = new THREE.Group()
    g.add(new THREE.Mesh(packetGeo, mat), new THREE.LineSegments(eg, packetEdgeMat))
    g.visible = false
    city.add(g)
    packets.push({
      obj: g,
      active: false,
      t: 0,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      to: null,
    })
  }

  // ---- painting ----------------------------------------------------------
  const paintPackets = () => {
    const face = (start, t) => {
      ink(t, _c1)
      for (let i = start; i < start + 4; i++) packetCol.setXYZ(i, _c1.r, _c1.g, _c1.b)
    }
    // still the brightest thing in the scene, but rescaled against the darkened faces
    face(FACE.py, 0.55)
    face(FACE.pz, 0.34)
    face(FACE.px, 0.22)
    face(FACE.nx, 0.14)
    face(FACE.ny, 0.14)
    face(FACE.nz, 0.14)
    packetCol.needsUpdate = true
    put(packetEdgeMat.color, P.dim)
  }

  const paintFloor = () => {
    put(_c1, P.rule)
    const arr = floorCol.array
    for (let i = 0; i < arr.length; i += 4) {
      arr[i] = _c1.r
      arr[i + 1] = _c1.g
      arr[i + 2] = _c1.b
    }
    floorCol.needsUpdate = true
  }

  const paintFaces = (b) => {
    const a = b.mesh.geometry.attributes.color
    const r = b.ramp
    const hov = b.hoverT * HOVER_LIFT_INK
    const face = (start, t) => {
      ink(t, _c1)
      for (let i = start; i < start + 4; i++) a.setXYZ(i, _c1.r, _c1.g, _c1.b)
    }
    face(FACE.py, r.top + hov + b.flash * FLASH_INK)
    face(FACE.pz, r.pz + hov)
    face(FACE.px, r.px + hov)
    face(FACE.nx, r.dark)
    face(FACE.ny, r.dark)
    face(FACE.nz, r.dark)
    a.needsUpdate = true
  }

  const paintEdges = (b) => {
    const a = b.edges.geometry.attributes.color
    const t = P.edgeRest + (1 - P.edgeRest) * b.hoverT
    const base = blend(P.rule, P.dim, t)
    put(_c2, base)
    let tr = _c2.r
    let tg = _c2.g
    let tb = _c2.b
    if (b.hotT > 0.003) {
      put(_c3, blend(base, P.claude, b.hotT))
      tr = _c3.r
      tg = _c3.g
      tb = _c3.b
    }
    for (let i = 0; i < b.isTop.length; i++) {
      if (b.isTop[i]) a.setXYZ(i, tr, tg, tb)
      else a.setXYZ(i, _c2.r, _c2.g, _c2.b)
    }
    a.needsUpdate = true
  }

  paintFloor()
  paintPackets()

  // ---- interaction -------------------------------------------------------
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let pointerIn = false
  let hovered = null
  let cursor = ''

  if (!still) {
    mount.addEventListener('pointermove', (e) => {
      const r = mount.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      pointerIn = true
    })
    mount.addEventListener('pointerleave', () => {
      pointerIn = false
      hovered = null
    })
  }

  // ---- frame -------------------------------------------------------------
  let hotBlock = null
  let hotSlot = -1
  let hotIndex = -1
  let sizeDirty = false

  // Where a label of width w may sit, or null when it has nowhere to go. It grows
  // outboard, the side taken from which half the anchor is in rather than from what
  // fits, and it has to land wholly clear of the band the page masks out.
  const place = (b, w) => {
    _p.set(0, b.h, 0)
    b.group.localToWorld(_p)
    _p.project(camera)
    const x = (_p.x * 0.5 + 0.5) * W
    const y = (-_p.y * 0.5 + 0.5) * H
    const off = b.halfScreen / (fh / H) + 14
    const top = Math.max(10, Math.min(y, H - 10))
    const mid = W / 2
    const outLeft = x < mid
    const pin = (cand) => Math.max(8, Math.min(cand, W - w - 8))

    const out = pin(outLeft ? x - off - w : x + off)
    if (clear <= 0) return { left: out, top }

    const fits = (l) => l + w <= mid - clear || l >= mid + clear
    if (fits(out)) return { left: out, top }
    const inb = pin(outLeft ? x + off : x - off - w)
    return fits(inb) ? { left: inb, top } : null
  }

  // The cycle steps one master per slot but walks past any node whose label has
  // nowhere to go, so a highlight is not left standing unexplained. When nothing
  // fits — a phone, where the whole scene is masked — it falls back to plain
  // rotation and only the rim moves.
  const pickHot = (age) => {
    if (age < HOT_FROM) return null
    const slot = Math.floor((age - HOT_FROM) / HOT_EVERY)
    if (slot === hotSlot) return masters[hotIndex]
    hotSlot = slot
    let next = (hotIndex + 1) % 6
    for (let n = 0; n < 6; n++) {
      const k = (hotIndex + 1 + n) % 6
      if (place(masters[k], masters[k].hotWidth)) {
        next = k
        break
      }
    }
    hotIndex = next
    return masters[next]
  }

  const step = (age, dt, snap) => {
    const lift = (6 * (fh / H)) / UP_Y

    city.rotation.y = snap ? 0 : SWAY * Math.sin(age * ((Math.PI * 2) / SWAY_T))
    city.updateMatrixWorld(true)

    // a resize changes what fits; hand over only if the node on air lost its label
    if (sizeDirty) {
      sizeDirty = false
      if (hotIndex >= 0 && !place(masters[hotIndex], masters[hotIndex].hotWidth)) hotSlot = -1
    }
    hotBlock = pickHot(age)

    for (const b of blocks) {
      b.rise = easeOutExpo(clamp01((age - b.riseAt) / 0.36))
      const wantHover = b === hovered ? 1 : 0
      const wantHot = b === hotBlock ? 1 : 0
      b.hoverT = snap ? wantHover : approach(b.hoverT, wantHover, dt, HOVER_TAU)
      b.hotT = snap ? wantHot : approach(b.hotT, wantHot, dt, HOT_TAU)
      b.flash = Math.max(0, b.flash - dt / 0.4)
      b.group.scale.y = Math.max(0.0001, b.rise)
      b.group.position.y = b.hoverT * lift
      paintFaces(b)
      paintEdges(b)
    }

    wireMat.opacity = clamp01((age - 0.85) / 0.35)

    for (const p of packets) {
      if (!p.active) continue
      p.t += dt / SHIP_TIME
      if (p.t >= 1) {
        p.active = false
        p.obj.visible = false
        p.to.flash = 1
        continue
      }
      p.obj.position.lerpVectors(p.a, p.b, easeOutExpo(p.t))
    }
    if (!still && age > 1.25) {
      for (const m of masters) {
        if (age < m.nextShip) continue
        const free = packets.find((p) => !p.active)
        if (!free) {
          m.nextShip = age + 1.5 // the line is busy; ask again shortly
          continue
        }
        free.active = true
        free.t = 0
        free.to = m.replica
        free.a.copy(m.wireA)
        free.b.copy(m.wireB)
        free.obj.position.copy(m.wireA)
        free.obj.visible = true
        m.nextShip = age + SHIP_MIN + Math.random() * SHIP_VAR
      }
    }

    city.updateMatrixWorld(true)

    if (pointerIn) {
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(meshes, false)
      hovered = hit.length ? hit[0].object.userData.block : null
    }
    const want = hovered ? 'pointer' : ''
    if (want !== cursor) {
      cursor = want
      mount.style.cursor = want
    }
  }

  const fillLabel = (b) => {
    b.el.innerHTML = b.state === 'hot' ? mark(b.hotText) : b.hoverText
    b.width = b.el.offsetWidth
  }

  const updateLabels = () => {
    for (const b of blocks) {
      const state = b === hotBlock ? 'hot' : b === hovered ? 'hover' : ''
      if (state !== b.state) {
        b.state = state
        if (state) {
          b.el.style.fontWeight = state === 'hot' ? '500' : '400'
          fillLabel(b)
        }
      }
      const at = state ? place(b, b.width) : null
      if (!at) {
        if (b.vis) {
          b.vis = false
          b.el.style.opacity = '0'
        }
        continue
      }

      const x = at.left.toFixed(1)
      const y = at.top.toFixed(1)
      b.el.style.transform = `translate(${x}px,${y}px) translateY(-50%)`

      if (!b.vis) {
        b.vis = true
        b.el.style.opacity = '1'
      }
    }
  }

  // the web font lands after the first label is measured; re-measure once
  document.fonts.ready.then(() => {
    measureHot()
    for (const b of blocks) if (b.state) fillLabel(b)
    updateLabels()
  })

  const resize = (w, h) => {
    W = Math.max(1, w)
    H = Math.max(1, h)
    clear = readClear()
    sizeDirty = true
    const aspect = W / H
    fh = Math.max(FIT.h / 0.88, (2 * FIT.ex) / 0.9 / aspect) // 10%/12% margin
    // bottom-anchored while the plate is tall enough to fill the lower band,
    // centred low once it goes small on a narrow viewport
    const cf = Math.min(0.93 - FIT.h / fh / 2, 0.74)
    const top = FIT.cy + cf * fh
    camera.left = (-fh * aspect) / 2
    camera.right = (fh * aspect) / 2
    camera.top = top
    camera.bottom = top - fh
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(dpr())
    renderer.setSize(W, H, false)
  }

  resize(W, H)

  let t0 = -1

  const render = (t, dt) => {
    if (t0 < 0) t0 = t
    if (still) {
      step(STILL_AGE, 0, true)
      // one packet composed mid-flight so the replication link reads without motion
      const p = packets[0]
      const m = masters[3]
      p.obj.position.lerpVectors(m.wireA, m.wireB, 0.58)
      p.obj.visible = true
      m.replica.flash = 0.7
      paintFaces(m.replica)
    } else {
      step(t - t0, dt, false)
    }
    renderer.render(scene, camera)
    updateLabels()
  }

  const retint = (next) => {
    P = palette(next)
    paintFloor()
    paintPackets()
    put(wireMat.color, P.wire)
    for (const b of blocks) {
      paintFaces(b)
      paintEdges(b)
      b.el.style.color = P.dimCss
      if (b.state) fillLabel(b) // the accent inside the hot label is inline
    }
  }

  return { render, resize, retint }
}
