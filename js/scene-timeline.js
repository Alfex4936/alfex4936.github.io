// Flight through time: the thirteen entries as cards down a corridor of years,
// scroll driving the camera forward. The world, the screenshots and the
// drifting glyphs are WebGL; every word is HTML projected onto the card it
// belongs to, because a canvas-rendered paragraph is a soft paragraph.
//
// scene-core owns the loop, the DPR cap, the hidden-tab gate, the resize and the
// theme observer. What is left here is the corridor and the one thing core does
// not watch: data-lang.
import { dpr } from './scene-core.js'
import { entries } from './timeline-data.js'

const root = document.documentElement
const isKo = () => root.dataset.lang === 'ko'
const imgFor = (e) => (e.imgKo && isKo() ? e.imgKo : e.img)

const FOV = 42
const FOCUS_D = 30 // the one distance at which a card projects to scale 1.000
const GROUND_Y = -7.5
const CEIL_Y = 11
const HALF_X = 16
const MAX_SIDE = 6.8 // holds the far card of a same-month pair clear of the rail
const SWAY = 0.22
const GAP = 26
const PAIR = 2.4
const STEP_VH = 0.86
const CLEAR = 0.62 // a logo never fills its plate; the air around it is the point
const N = entries.length

const monthOf = (s) => s.replace(/[^\d.]/g, '').slice(0, 7)
const SIDE = entries.map((_, i) => (i % 2 ? -1 : 1))
const Z = new Array(N).fill(0)

// Two things in the same month share a depth, 2.4 units apart instead of 26, so
// the pair reads as one moment seen from both sides of the corridor. That
// reading needs two sides: where the viewport is too narrow to offset a card at
// all, layout() falls the pair back to a full station each.
function assignZ(pairGap) {
  let z = 0
  for (let i = 0; i < N; i++) {
    if (i) z -= monthOf(entries[i].year) === monthOf(entries[i - 1].year) ? pairGap : GAP
    Z[i] = z
  }
}
assignZ(PAIR)

const Z_BACK = -(N - 1) * GAP - 28 // sized for the widest fallback layout
const Z_FRONT = 24

const GLYPHS = '{}()[]<>/\\;:=+-_.,*#$&|!?01379afnr'.split('')
const ACOLS = 8
const AROWS = 4
const CELL = 64
const GCOUNT = 340
const Y_MIN = GROUND_Y - 1
const Y_SPAN = 24
const HUE_BUCKETS = 24

export default function timeline({ THREE, canvas, width, height, tokens, still }) {
  const page = document.getElementById('flight')
  const heroEl = document.getElementById('flight-hero')
  const spacer = document.getElementById('flight-spacer')
  const railEl = document.getElementById('flight-rail')
  const cardEls = [...document.querySelectorAll('#flight-cards > li')]
  const calm = matchMedia('(prefers-reduced-motion: reduce)')

  canvas.style.display = 'block'

  // ---- palette -------------------------------------------------------------
  // Every colour in the scene is one of the eight tokens or a mix of them, in
  // sRGB. three works in linear-light, where a 13% mix toward a saturated
  // colour off a near-black background is a perceptual leap, not a tint.
  const _a = new THREE.Color()
  const _b = new THREE.Color()
  const mix = (out, a, b, t) => {
    _a.copy(a).convertLinearToSRGB()
    _b.copy(b).convertLinearToSRGB()
    return out.copy(_a).lerp(_b, t).convertSRGBToLinear()
  }
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

  const tk = {
    bg: new THREE.Color(),
    bg2: new THREE.Color(),
    fg: new THREE.Color(),
    dim: new THREE.Color(),
    faint: new THREE.Color(),
    rule: new THREE.Color(),
  }
  const P = {
    bg: new THREE.Color(),
    fg: new THREE.Color(),
    plate: new THREE.Color(),
    line: new THREE.Color(),
    gate: new THREE.Color(),
    edge: new THREE.Color(),
    edgeH: new THREE.Color(),
    glyph: new THREE.Color(),
    paper: new THREE.Color(),
    fallback: new THREE.Color(),
  }
  let fogAtFocus = 1

  function readPalette(t) {
    tk.bg.set(t.bg)
    tk.bg2.set(t['bg-2'])
    tk.fg.set(t.fg)
    tk.dim.set(t.dim)
    tk.faint.set(t.faint)
    tk.rule.set(t.rule)

    P.bg.copy(tk.bg)
    P.fg.copy(tk.fg)
    P.plate.copy(tk.bg2)
    P.fallback.copy(tk.dim)
    // A logo sits on paper whichever theme is up, and paper is simply the
    // lighter of the two extremes: --fg on the dark themes, --bg on the light.
    P.paper.copy(lum(tk.fg) > lum(tk.bg) ? tk.fg : tk.bg)

    const light = lum(tk.bg) > 0.5
    P.light = light
    // --rule on paper is two shades off white and dies in the first ten metres
    // of haze, so on light the structure borrows its weight from --dim instead.
    mix(P.line, tk.rule, tk.dim, light ? 0.78 : 0.6)
    mix(P.gate, tk.rule, tk.dim, light ? 0.92 : 0.78)
    mix(P.edge, tk.rule, light ? tk.dim : tk.fg, light ? 0.78 : 0.4)
    mix(P.edgeH, tk.rule, tk.fg, light ? 0.95 : 0.85)
    if (light) mix(P.glyph, tk.faint, tk.fg, 0.3)
    else P.glyph.copy(tk.faint)

    // Paper loses contrast to haze far faster than ink gains it: the light
    // theme gets a thinner fog, quieter marks, and a wash pulled toward ink so
    // it lands as a stain on the page rather than an invisible highlight.
    P.fogD = light ? 0.01 : 0.0136
    P.glyphA = light ? 0.3 : 0.52
    P.lineA = light ? 0.46 : 0.82
    P.ceilA = light ? 0.14 : 0.3
    P.washA = light ? 0.17 : 0.15
    P.glowA = light ? 0.1 : 0.16
    P.fogTint = light ? 0.038 : 0.075
    P.washToward = light ? 0.34 : 0
    fogAtFocus = Math.exp(-((P.fogD * FOCUS_D) ** 2))
  }
  readPalette(tokens)

  // Every material holding a palette colour registers here at build time, so a
  // theme change has one list to walk and a material added later to this file
  // cannot be left behind on the old palette.
  const tinted = []
  const tint = (mat, key, alphaKey) => (tinted.push({ mat, key, alphaKey }), mat)

  // ---- renderer ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(dpr())
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const MAXANISO = renderer.capabilities.getMaxAnisotropy()

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(P.bg.clone(), P.fogD)
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 420)

  // ---- drifting glyphs -----------------------------------------------------
  function buildAtlas() {
    const c = document.createElement('canvas')
    c.width = ACOLS * CELL
    c.height = AROWS * CELL
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff' // a pure alpha mask; the tint is a uniform
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `500 ${Math.round(CELL * 0.72)}px "IBM Plex Mono", monospace`
    GLYPHS.forEach((ch, i) => {
      g.fillText(ch, (i % ACOLS) * CELL + CELL / 2, Math.floor(i / ACOLS) * CELL + CELL * 0.52)
    })
    const tex = new THREE.CanvasTexture(c)
    tex.flipY = false // v=0 at the canvas top, matching gl_PointCoord
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.anisotropy = MAXANISO
    return tex
  }

  let glyphs = null
  function buildGlyphs() {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(GCOUNT * 3)
    const size = new Float32Array(GCOUNT)
    const gi = new Float32Array(GCOUNT)
    const sp = new Float32Array(GCOUNT)
    const ph = new Float32Array(GCOUNT)
    for (let i = 0; i < GCOUNT; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 18
      pos[i * 3 + 1] = Y_MIN + Math.random() * Y_SPAN
      pos[i * 3 + 2] = Z_BACK + Math.random() * (Z_FRONT - Z_BACK)
      size[i] = 0.26 + Math.random() * 0.24
      gi[i] = Math.floor(Math.random() * GLYPHS.length)
      sp[i] = 0.26 + Math.random() * 0.7
      ph[i] = Math.random() * Math.PI * 2
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aGlyph', new THREE.BufferAttribute(gi, 1))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(sp, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uAtlas: { value: buildAtlas() },
        uTime: { value: 0 },
        uScale: { value: 600 },
        uColor: { value: P.glyph.clone() },
        uAlpha: { value: P.glyphA },
        uFogD: { value: P.fogD },
        uYMin: { value: Y_MIN },
        uYSpan: { value: Y_SPAN },
        uGrid: { value: new THREE.Vector2(ACOLS, AROWS) },
      },
      vertexShader: `
        attribute float aSize; attribute float aGlyph; attribute float aSpeed; attribute float aPhase;
        uniform float uTime, uScale, uFogD, uYMin, uYSpan;
        varying float vGlyph, vFog, vNear;
        void main(){
          vec3 p = position;
          float t = uTime;
          p.y = uYMin + mod(p.y - uYMin - t * aSpeed * 0.55, uYSpan);
          p.x += sin(t * 0.18 * aSpeed + aPhase) * 0.85;
          p.z += cos(t * 0.11 * aSpeed + aPhase * 1.7) * 0.45;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          gl_PointSize = min(aSize * uScale / max(d, 0.1), 64.0);
          float f = uFogD * d;
          vFog = clamp(exp(-f*f), 0.0, 1.0);
          vNear = smoothstep(1.5, 7.0, d);
          vGlyph = aGlyph;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas; uniform vec3 uColor; uniform float uAlpha; uniform vec2 uGrid;
        varying float vGlyph, vFog, vNear;
        void main(){
          vec2 cell = vec2(mod(vGlyph, uGrid.x), floor(vGlyph / uGrid.x));
          vec2 uv = (cell + gl_PointCoord) / uGrid;
          float a = texture2D(uAtlas, uv).a * uAlpha * vFog * vNear;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    })
    glyphs = new THREE.Points(g, mat)
    glyphs.frustumCulled = false
    scene.add(glyphs)
  }
  if (!still) buildGlyphs()

  // ---- ground and ceiling --------------------------------------------------
  function gridLines(y, step, xStep) {
    const v = []
    for (let x = -30; x <= 30.001; x += xStep) v.push(x, y, Z_FRONT, x, y, Z_BACK)
    for (let z = Z_FRONT; z >= Z_BACK - 0.001; z -= step) v.push(-30, y, z, 30, y, z)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    return g
  }
  const groundMat = tint(
    new THREE.LineBasicMaterial({ color: P.line.clone(), transparent: true, opacity: P.lineA, depthWrite: false }),
    'line',
    'lineA',
  )
  const ceilMat = tint(
    new THREE.LineBasicMaterial({ color: P.line.clone(), transparent: true, opacity: P.ceilA, depthWrite: false }),
    'line',
    'ceilA',
  )
  const ground = new THREE.LineSegments(gridLines(GROUND_Y, 5, 5), groundMat)
  const ceiling = new THREE.LineSegments(gridLines(CEIL_Y, 10, 10), ceilMat)
  ground.frustumCulled = false
  ceiling.frustumCulled = false
  ground.renderOrder = -2
  ceiling.renderOrder = -2
  scene.add(ground, ceiling)

  // ---- shared soft radial mask ---------------------------------------------
  const RADIAL = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.4, 'rgba(255,255,255,0.44)')
    r.addColorStop(0.74, 'rgba(255,255,255,0.09)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()

  // ---- rounded geometry ----------------------------------------------------
  function roundedShape(w, h, r) {
    const s = new THREE.Shape()
    const x = -w / 2
    const y = -h / 2
    r = Math.min(r, w / 2, h / 2)
    s.moveTo(x + r, y)
    s.lineTo(x + w - r, y)
    s.quadraticCurveTo(x + w, y, x + w, y + r)
    s.lineTo(x + w, y + h - r)
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    s.lineTo(x + r, y + h)
    s.quadraticCurveTo(x, y + h, x, y + h - r)
    s.lineTo(x, y + r)
    s.quadraticCurveTo(x, y, x + r, y)
    return s
  }
  function plateGeo(w, h, r) {
    const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 8)
    // ShapeGeometry copies raw xy into uv; renormalise so a map covers the face
    const p = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h)
    uv.needsUpdate = true
    return g
  }
  function outlineGeo(w, h, r) {
    const pts = roundedShape(w, h, r).getPoints(10)
    return new THREE.BufferGeometry().setFromPoints(pts.map((v) => new THREE.Vector3(v.x, v.y, 0)))
  }

  // ---- dominant colour of a screenshot -------------------------------------
  const _hsl = { h: 0, s: 0, l: 0 }
  function dominantColor(img) {
    try {
      const n = 44
      const c = document.createElement('canvas')
      c.width = c.height = n
      const g = c.getContext('2d', { willReadFrequently: true })
      g.drawImage(img, 0, 0, n, n)
      const d = g.getImageData(0, 0, n, n).data
      const w = new Float64Array(HUE_BUCKETS)
      const sr = new Float64Array(HUE_BUCKETS)
      const sg = new Float64Array(HUE_BUCKETS)
      const sb = new Float64Array(HUE_BUCKETS)
      const tmp = new THREE.Color()
      let total = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 180) continue
        tmp.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace)
        tmp.getHSL(_hsl, THREE.SRGBColorSpace)
        if (_hsl.s < 0.17 || _hsl.l < 0.1 || _hsl.l > 0.93) continue // skip chrome grey
        const b = Math.min(HUE_BUCKETS - 1, Math.floor(_hsl.h * HUE_BUCKETS))
        const wt = _hsl.s * (1 - Math.abs(_hsl.l - 0.5) * 0.7)
        w[b] += wt
        sr[b] += d[i] * wt
        sg[b] += d[i + 1] * wt
        sb[b] += d[i + 2] * wt
        total += wt
      }
      let best = -1
      let bw = 0
      for (let b = 0; b < HUE_BUCKETS; b++)
        if (w[b] > bw) {
          bw = w[b]
          best = b
        }
      if (best < 0 || bw < total * 0.06) return null // a grey screenshot casts no light
      const out = new THREE.Color().setRGB(sr[best] / bw / 255, sg[best] / bw / 255, sb[best] / bw / 255, THREE.SRGBColorSpace)
      out.getHSL(_hsl, THREE.SRGBColorSpace)
      // A muddy screenshot and a screaming one both have to land as usable
      // light, or one project drowns the corridor and the next says nothing.
      out.setHSL(_hsl.h, Math.min(Math.max(_hsl.s, 0.34), 0.7), 0.56, THREE.SRGBColorSpace)
      return out
    } catch {
      return null
    }
  }

  // ---- cards ---------------------------------------------------------------
  const WHITE = new THREE.Color(1, 1, 1)
  const cards = entries.map((e, i) => {
    const el = cardEls[i]
    const mark = e.kind === 'mark'
    const grp = new THREE.Group()
    grp.position.z = Z[i]
    scene.add(grp)

    const rec = {
      e,
      i,
      el,
      grp,
      mark,
      boxEl: el.querySelector('.flight-card__box'),
      edge: null,
      plate: null,
      shotPlate: null,
      shot: null,
      glow: null,
      pool: null,
      gate: null,
      tex: null,
      texUrl: null,
      wash: null,
      pending: null,
      lift: 0,
      pxW: 1,
      pxH: 1,
      boxW: 1,
      boxH: 1,
      plateA: 0,
      dist: 0,
      textA: 0,
      rect: { s: 1, w: 1, h: 1, l: 0, t: 0 },
    }

    if (mark) {
      // A logo entry is a threshold, not a screen: an inscribed panel read on
      // the way through a frame that spans the whole corridor.
      rec.plate = new THREE.Mesh(
        plateGeo(1, 1, 0.1),
        tint(new THREE.MeshBasicMaterial({ color: P.bg.clone(), transparent: true, opacity: 0, depthWrite: false }), 'bg'),
      )
      rec.edge = new THREE.LineLoop(
        outlineGeo(1, 1, 0.1),
        tint(new THREE.LineBasicMaterial({ color: P.edge.clone(), transparent: true, opacity: 0, depthWrite: false }), 'edge'),
      )
      rec.edge.position.z = 0.01
      // The wordmark is dark navy on transparent: without a paper plate under
      // it there is nothing to read on a dark theme, and both brands' own
      // guidelines ask for the clear space this leaves anyway.
      rec.shotPlate = new THREE.Mesh(
        plateGeo(1, 1, 0.05),
        tint(new THREE.MeshBasicMaterial({ color: P.paper.clone(), transparent: true, opacity: 0, depthWrite: false }), 'paper'),
      )
      rec.shotPlate.position.z = 0.012
      rec.shot = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: WHITE.clone(), transparent: true, opacity: 0, depthWrite: false }),
      )
      rec.shot.position.z = 0.02
      const yb = GROUND_Y + 0.4
      const yt = CEIL_Y - 0.6
      const gg = new THREE.BufferGeometry()
      gg.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [-HALF_X, yb, 0, HALF_X, yb, 0, -HALF_X, yt, 0, HALF_X, yt, 0, -HALF_X, yb, 0, -HALF_X, yt, 0, HALF_X, yb, 0, HALF_X, yt, 0],
          3,
        ),
      )
      rec.gate = new THREE.LineSegments(
        gg,
        tint(new THREE.LineBasicMaterial({ color: P.gate.clone(), transparent: true, opacity: 0, depthWrite: false }), 'gate'),
      )
      rec.gate.position.z = Z[i]
      rec.gate.frustumCulled = false
      rec.gate.renderOrder = -2
      scene.add(rec.gate)
      grp.add(rec.plate, rec.edge, rec.shotPlate, rec.shot)
    } else {
      rec.edge = new THREE.Mesh(
        plateGeo(1, 1, 0.1),
        tint(new THREE.MeshBasicMaterial({ color: P.edge.clone(), transparent: true, opacity: 0 }), 'edge'),
      )
      rec.plate = new THREE.Mesh(
        plateGeo(1, 1, 0.1),
        tint(new THREE.MeshBasicMaterial({ color: P.plate.clone(), transparent: true, opacity: 0 }), 'plate'),
      )
      rec.shot = new THREE.Mesh(
        plateGeo(1, 1, 0.05),
        new THREE.MeshBasicMaterial({ color: WHITE.clone(), transparent: true, opacity: 0, depthWrite: false }),
      )
      rec.glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: RADIAL, color: P.fallback.clone(), transparent: true, opacity: 0, depthWrite: false }),
      )
      rec.pool = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: RADIAL, color: P.fallback.clone(), transparent: true, opacity: 0, depthWrite: false }),
      )
      rec.pool.rotation.x = -Math.PI / 2
      rec.pool.renderOrder = -1
      rec.glow.renderOrder = -1
      rec.edge.position.z = -0.012
      rec.shot.position.z = 0.012
      rec.glow.position.z = -0.4
      grp.add(rec.glow, rec.edge, rec.plate, rec.shot)
      scene.add(rec.pool)
    }
    rec.plate.userData.card = rec
    rec.shot.userData.card = rec
    return rec
  })

  // ---- textures ------------------------------------------------------------
  const loader = new THREE.TextureLoader()
  const texCache = new Map() // the two Ajou rows share one wordmark

  function loadTexture(url) {
    let p = texCache.get(url)
    if (p) return p
    p = new Promise((res, rej) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = MAXANISO
          tex.generateMipmaps = true
          tex.minFilter = THREE.LinearMipmapLinearFilter
          tex.magFilter = THREE.LinearFilter
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
          res(tex)
        },
        undefined,
        rej,
      )
    })
    texCache.set(url, p)
    return p
  }

  function requestTexture(rec) {
    const url = imgFor(rec.e)
    if (rec.pending === url) return
    rec.pending = url
    loadTexture(url).then(
      (tex) => {
        if (rec.pending !== url) return // the language moved on while it loaded
        rec.tex = tex
        rec.texUrl = url
        if (rec.mark) {
          rec.shot.material.map = tex
          fitLogo(rec)
        } else {
          // Cover-crop into the 16:10 frame, biased up: screenshots carry their
          // content at the top and letterboxing would leave two dead bands.
          const a = tex.image.width / tex.image.height
          const target = 1.6
          if (a > target) {
            tex.repeat.set(target / a, 1)
            tex.offset.set((1 - target / a) / 2, 0)
          } else {
            tex.repeat.set(1, a / target)
            tex.offset.set(0, (1 - a / target) * 0.82)
          }
          rec.shot.material.map = tex
          // A logo is a brand, not a screen: sampling it would flood the
          // corridor with a colour the entry never earned.
          rec.wash = dominantColor(tex.image)
          applyWash(rec)
        }
        rec.shot.material.needsUpdate = true
      },
      () => {},
    )
  }

  // A logo keeps its own aspect and never crops or stretches; CLEAR is how much
  // of the plate it is allowed to take.
  function fitLogo(rec) {
    if (!rec.tex || !rec.mark) return
    const img = rec.tex.image
    const s = CLEAR * Math.min(rec.boxW / img.width, rec.boxH / img.height)
    rec.shot.scale.set(img.width * s, img.height * s, 1)
  }

  function applyWash(rec) {
    if (!rec.wash || !rec.glow) return
    const c = rec.wash.clone()
    if (P.washToward > 0) {
      // A bright wash on paper is nothing. Pull it toward ink so it reads as a
      // stain, then put back the chroma that darkening just took out.
      mix(c, rec.wash, P.fg, P.washToward)
      c.getHSL(_hsl, THREE.SRGBColorSpace)
      c.setHSL(_hsl.h, Math.min(0.78, _hsl.s * 1.55), _hsl.l, THREE.SRGBColorSpace)
    }
    rec.glow.material.color.copy(c)
    rec.pool.material.color.copy(c)
  }

  // ---- layout: the DOM is the authority ------------------------------------
  let VW = Math.max(width, 1)
  let VH = Math.max(height, 1)
  let U = 1
  let sideOffset = 0
  let stepPx = 1
  let heroW = 0
  let heroH = 0
  let heroX = 0

  function layout() {
    const cardW = Math.min(VW * 0.88, 460)
    const cardWM = Math.min(VW * 0.78, 360)
    const heroPx = Math.min(VW * 0.9, 430)
    page.style.setProperty('--flight-card-w', `${cardW}px`)
    page.style.setProperty('--flight-card-wm', `${cardWM}px`)
    page.style.setProperty('--flight-hero-w', `${heroPx}px`)
    page.style.setProperty('--flight-hero-size', `${Math.round(Math.min(Math.max(VW * 0.052, 34), 55))}px`)

    camera.aspect = VW / VH
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(dpr())
    renderer.setSize(VW, VH, false)
    // gl_PointSize is in device pixels, so the attenuation scale comes off the
    // drawing buffer; the css height would halve the glyphs on a retina panel.
    if (glyphs) glyphs.material.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan((FOV * Math.PI) / 360))

    // World units per css pixel, measured at the focus distance. A card sitting
    // at focus therefore projects to exactly its css size and draws at scale 1.
    U = (2 * FOCUS_D * Math.tan((FOV * Math.PI) / 360)) / VH
    sideOffset = Math.min(Math.max((VW / 2) * U - (cardW * U) / 2 - 1.1, 0), MAX_SIDE)
    // A pair may share a depth only if the two sides genuinely clear each other
    assignZ(sideOffset * 2 >= cardW * U + 0.6 ? PAIR : GAP)

    heroW = heroEl.offsetWidth
    heroH = heroEl.offsetHeight
    // Pushed past the left card slot: the first logo entry stands there two
    // stations back and would otherwise project through the headline.
    heroX = -Math.min(sideOffset + 3, Math.max(0, (VW / 2) * U - (heroW * U) / 2 - 0.6 - sideOffset * SWAY))

    for (const rec of cards) {
      // offset* rather than a client rect: these elements carry a live scale
      // transform and a client rect would be measured in projected pixels.
      const w = rec.el.offsetWidth
      const h = rec.el.offsetHeight
      rec.pxW = w
      rec.pxH = h
      const W = w * U
      const H = h * U
      const R = 11 * U
      rec.grp.position.x = SIDE[rec.i] * sideOffset
      rec.grp.position.z = Z[rec.i]

      rec.plate.geometry.dispose()
      rec.plate.geometry = plateGeo(W, H, R)

      const b = rec.boxEl
      rec.boxW = b.offsetWidth * U
      rec.boxH = b.offsetHeight * U
      const bx = (b.offsetLeft + b.offsetWidth / 2 - w / 2) * U
      const by = H / 2 - (b.offsetTop + b.offsetHeight / 2) * U

      if (rec.mark) {
        rec.edge.geometry.dispose()
        rec.edge.geometry = outlineGeo(W, H, R)
        rec.gate.position.z = Z[rec.i]
        rec.shotPlate.geometry.dispose()
        rec.shotPlate.geometry = plateGeo(rec.boxW, rec.boxH, 5 * U)
        rec.shotPlate.position.set(bx, by, 0.012)
        rec.shot.position.set(bx, by, 0.02)
        fitLogo(rec)
      } else {
        rec.edge.geometry.dispose()
        rec.edge.geometry = plateGeo(W + 2.6 * U, H + 2.6 * U, R + 1.3 * U)
        rec.shot.geometry.dispose()
        rec.shot.geometry = plateGeo(rec.boxW, rec.boxH, 5 * U)
        rec.shot.position.set(bx, by, 0.012)
        rec.glow.scale.set(W * 2, H * 2, 1)
        const pr = Math.max(W, 12) * 3
        rec.pool.scale.set(pr, pr, 1)
        rec.pool.position.set(SIDE[rec.i] * sideOffset * 0.5, GROUND_Y + 0.05, Z[rec.i])
      }
    }

    stepPx = VH * STEP_VH
    spacer.style.height = `${(N - 1) * stepPx + VH}px`
  }

  function zAt(fi) {
    const i = Math.min(Math.max(Math.floor(fi), 0), N - 1)
    const j = Math.min(i + 1, N - 1)
    return Z[i] + (Z[j] - Z[i]) * (fi - i)
  }
  // Instant scroll: the camera's own damping is the flight, so a click, a rail
  // tick and a keypress all arrive with exactly the authored ease. site.css
  // sets scroll-behavior:smooth for the transcript's anchor jumps, and leaving
  // it on here would ease the scrollbar into an already-eased camera.
  const goTo = (i) => scrollTo({ top: Math.min(Math.max(i, 0), N - 1) * stepPx, behavior: 'instant' })

  // ---- year rail -----------------------------------------------------------
  const ticks = entries.map((e, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'flight-rail__t'
    if (e.kind === 'mark') b.dataset.mark = '1'
    // The accessible name is composed from rendered text rather than an
    // aria-label, so the site's one-document-two-languages rule switches it.
    const year = document.createElement('u')
    year.setAttribute('aria-hidden', 'true')
    year.textContent = e.year
    const name = document.createElement('span')
    name.className = 'sr-only'
    name.append(`${e.year} — `)
    for (const l of ['ko', 'en']) {
      const s = document.createElement('span')
      s.lang = l
      s.textContent = `${e[l === 'ko' ? 'titleKo' : 'titleEn'] ?? e.title}. ${e[l]}`
      name.append(s)
    }
    const dash = document.createElement('i')
    dash.setAttribute('aria-hidden', 'true')
    b.append(year, name, dash)
    b.addEventListener('click', () => goTo(i))
    b.addEventListener('focus', () => {
      if (b.matches(':focus-visible')) goTo(i)
    })
    railEl.append(b)
    return b
  })

  addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return
    let d = 0
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight' || ev.key === 'PageDown') d = 1
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' || ev.key === 'PageUp') d = -1
    else if (ev.key === 'Home') {
      ev.preventDefault()
      goTo(0)
      return
    } else if (ev.key === 'End') {
      ev.preventDefault()
      goTo(N - 1)
      return
    }
    if (!d) return
    ev.preventDefault()
    goTo(Math.round(scrollY / stepPx) + d)
  })

  // ---- pointer -------------------------------------------------------------
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hover = null
  let downAt = null
  const pickables = cards.flatMap((r) => [r.plate, r.shot])

  function pick(cx, cy) {
    ndc.set((cx / VW) * 2 - 1, -(cy / VH) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(
      pickables.filter((o) => o.parent.visible),
      false,
    )
    return hits.length ? hits[0].object.userData.card : null
  }
  canvas.addEventListener('pointermove', (ev) => {
    const r = pick(ev.clientX, ev.clientY)
    if (r === hover) return
    hover?.el.classList.remove('is-hover')
    hover = r
    hover?.el.classList.add('is-hover')
    canvas.style.cursor = r ? 'pointer' : ''
    if (calm.matches) nudge()
  })
  canvas.addEventListener('pointerleave', () => {
    hover?.el.classList.remove('is-hover')
    hover = null
    canvas.style.cursor = ''
    if (calm.matches) nudge()
  })
  canvas.addEventListener('pointerdown', (ev) => {
    downAt = { x: ev.clientX, y: ev.clientY }
  })
  canvas.addEventListener('pointerup', (ev) => {
    if (!downAt) return
    const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y)
    downAt = null
    if (moved > 8) return
    const r = pick(ev.clientX, ev.clientY)
    if (r) goTo(r.i)
  })

  // ---- projection ----------------------------------------------------------
  const proj = new THREE.Vector3()
  const heroRect = { s: 1, w: 1, h: 1, l: 0, t: 0 }
  const visible = []
  const fogMix = P.bg.clone()
  const tintTarget = new THREE.Color()

  let camZ = zAt(0) + FOCUS_D + (still ? 0 : 16)
  let camX = 0
  let intro = still ? 0 : 1
  let active = 0

  function project(into, wx, wy, wz, pxW, pxH) {
    const dist = camZ - wz
    proj.set(wx, wy, wz).project(camera)
    const s = FOCUS_D / Math.max(dist, 0.001)
    into.s = s
    into.w = pxW * s
    into.h = pxH * s
    into.l = (proj.x * 0.5 + 0.5) * VW - into.w / 2
    into.t = (-proj.y * 0.5 + 0.5) * VH - into.h / 2
    return into
  }
  function place(el, r, opacity, zIndex) {
    if (opacity <= 0.004) {
      el.style.visibility = 'hidden'
      return
    }
    let L = r.l
    let T = r.t
    // At focus the scale is exactly 1; snapping the origin to whole pixels
    // there puts every stem of the focused card's type on the device grid.
    if (Math.abs(r.s - 1) < 0.006) {
      L = Math.round(L)
      T = Math.round(T)
    }
    el.style.visibility = 'visible'
    el.style.zIndex = zIndex
    el.style.opacity = opacity.toFixed(3)
    el.style.transform = `translate(${L.toFixed(2)}px,${T.toFixed(2)}px) scale(${r.s.toFixed(4)})`
  }
  // The DOM layer has no depth: a far card's words would otherwise read
  // straight through the opaque plate of the card standing in front of it.
  function coveredBy(a, b) {
    const ox = Math.min(a.l + a.w, b.l + b.w) - Math.max(a.l, b.l)
    if (ox <= 0) return 0
    const oy = Math.min(a.t + a.h, b.t + b.h) - Math.max(a.t, b.t)
    if (oy <= 0) return 0
    return (ox * oy) / Math.max(a.w * a.h, 1)
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
  const smooth = (x, a, b) => {
    const t = clamp01((x - a) / (b - a))
    return t * t * (3 - 2 * t)
  }

  function draw(dt) {
    const fi = Math.min(Math.max(scrollY / stepPx, 0), N - 1)
    const targetZ = zAt(fi) + FOCUS_D

    if (calm.matches) {
      camZ = targetZ
      camX = 0
      intro = 0
    } else {
      const k = 1 - Math.exp(-9.2 * dt) // ~90% of the gap closed in 250ms
      camZ += (targetZ + intro * 16 - camZ) * k
      intro *= Math.exp(-dt / 0.215) // one authored settle, ~900ms
      if (intro < 0.002) intro = 0
      camX += (SIDE[Math.round(fi)] * sideOffset * SWAY - camX) * (1 - Math.exp(-5 * dt))
    }
    camera.position.set(camX, 0, camZ)

    const planeZ = camZ - FOCUS_D
    let bestD = Infinity
    for (const rec of cards) {
      const d = Math.abs(planeZ - Z[rec.i])
      if (d < bestD) {
        bestD = d
        active = rec.i
      }
    }

    // The corridor is monochrome and blooms with the real colour of whatever
    // project you are standing in front of. A logo entry casts nothing.
    const aRec = cards[active]
    if (aRec.wash) mix(tintTarget, P.bg, aRec.wash, P.fogTint * clamp01(1 - bestD / 14))
    else tintTarget.copy(P.bg)
    fogMix.lerp(tintTarget, 1 - Math.exp(-3 * Math.max(dt, 1 / 60)))
    scene.fog.color.copy(fogMix)
    renderer.setClearColor(fogMix, 1)

    visible.length = 0
    for (const rec of cards) {
      const dist = camZ - Z[rec.i]
      const dd = dist - FOCUS_D
      const focus = dd >= 0 ? clamp01(1 - dd / 34) : clamp01(1 + dd / 17)
      if (Math.abs(rec.i - active) <= 2) requestTexture(rec)

      const f = Math.exp(-((P.fogD * Math.max(dist, 0)) ** 2))
      const fogVis = clamp01(f / fogAtFocus)
      // Dissolve well before a passing card can become a wall across the lens
      const vis = fogVis * smooth(dist, 7, 22)

      rec.grp.visible = vis > 0.004
      if (rec.gate) {
        const gv = fogVis * smooth(dist, 0.6, 5)
        rec.gate.visible = gv > 0.004
        rec.gate.material.opacity = gv * (0.15 + 0.42 * focus)
      }
      if (rec.pool) {
        // the floor keeps the wash a beat after the card itself has dissolved
        const po = P.washA * clamp01(1 - Math.abs(dd) / 44) * fogVis * (rec.wash ? 1 : 0)
        rec.pool.visible = po > 0.004
        rec.pool.material.opacity = po
      }
      if (!rec.grp.visible) {
        rec.el.style.visibility = 'hidden'
        continue
      }

      const hovered = hover === rec
      rec.lift += ((hovered ? 0.42 : 0) - rec.lift) * (calm.matches ? 1 : 1 - Math.exp(-11 * dt))
      rec.grp.position.y = rec.lift

      rec.edge.material.color.copy(hovered ? P.edgeH : P.edge)
      if (rec.mark) {
        rec.plateA = vis * 0.72
        rec.plate.material.opacity = rec.plateA
        rec.edge.material.opacity = vis * (0.36 + 0.58 * focus)
        rec.shotPlate.material.opacity = rec.tex ? vis * (0.5 + 0.5 * focus) : 0
        rec.shot.material.opacity = rec.tex ? vis * (0.5 + 0.5 * focus) : 0
      } else {
        rec.plateA = vis
        rec.plate.material.opacity = vis
        rec.edge.material.opacity = vis * (hovered ? 1 : 0.5 + 0.5 * focus)
        rec.shot.material.opacity = rec.tex ? vis * (0.34 + 0.66 * focus) : 0
        const go = P.glowA * focus * vis * (rec.wash ? 1 : 0)
        rec.glow.visible = go > 0.004
        rec.glow.material.opacity = go
      }

      rec.dist = dist
      rec.textA = vis * (0.3 + 0.7 * focus)
      project(rec.rect, rec.grp.position.x, rec.lift, Z[rec.i], rec.pxW, rec.pxH)
      visible.push(rec)
    }

    visible.sort((a, b) => a.dist - b.dist)
    for (let j = 0; j < visible.length; j++) {
      const rec = visible[j]
      let cov = 0
      for (let i = 0; i < j; i++) cov = Math.max(cov, coveredBy(rec.rect, visible[i].rect) * visible[i].plateA)
      place(rec.el, rec.rect, rec.textA * clamp01(1 - cov * 1.35), 900 - j)
    }

    // The hero stands in the empty slot opposite the first card, and is gone by
    // the time you would fly through it.
    const hd = camZ - Z[0]
    const hf = Math.exp(-((P.fogD * Math.max(hd, 0)) ** 2)) / fogAtFocus
    project(heroRect, heroX, 1.2, Z[0], heroW, heroH)
    place(heroEl, heroRect, clamp01(hf) * clamp01(1 + (hd - FOCUS_D) / 15), 901)

    for (let i = 0; i < ticks.length; i++) ticks[i].setAttribute('aria-current', String(i === active))

    renderer.render(scene, camera)
  }

  // With less motion asked for, scene-core parks the loop and the camera has to
  // follow the scrollbar itself. One frame per scroll event, coalesced.
  let pending = 0
  function nudge() {
    if (!calm.matches || pending) return
    pending = requestAnimationFrame(() => {
      pending = 0
      draw(0)
    })
  }
  addEventListener('scroll', nudge, { passive: true })

  // scene-core watches data-theme only, so the language swap is ours to catch.
  // Both languages are already in the DOM; what changes here is the measured
  // height of every card and, on the two Ajou rows, the wordmark itself.
  new MutationObserver(() => {
    for (const rec of cards) {
      if (!rec.e.imgKo) continue
      const url = imgFor(rec.e)
      if (url === rec.texUrl) continue
      rec.tex = null
      rec.texUrl = null
      rec.pending = null
      rec.shot.material.map = null
      rec.shot.material.needsUpdate = true
    }
    layout()
    nudge()
  }).observe(root, { attributeFilter: ['data-lang'] })

  page.classList.add('flight--on')
  layout()
  ;(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    layout() // the card heights need real metrics, not the fallback face
    nudge()
  })

  return {
    render(t, dt) {
      if (glyphs) glyphs.material.uniforms.uTime.value = (glyphs.material.uniforms.uTime.value + dt) % 3600
      draw(dt)
    },

    resize(w, h) {
      VW = Math.max(w, 1)
      VH = Math.max(h, 1)
      layout()
    },

    retint(t) {
      readPalette(t)
      for (const item of tinted) {
        item.mat.color.copy(P[item.key])
        if (item.alphaKey) item.mat.opacity = P[item.alphaKey]
      }
      scene.fog.color.copy(P.bg)
      scene.fog.density = P.fogD
      fogMix.copy(P.bg)
      renderer.setClearColor(fogMix, 1)
      if (glyphs) {
        const u = glyphs.material.uniforms
        u.uColor.value.copy(P.glyph)
        u.uAlpha.value = P.glyphA
        u.uFogD.value = P.fogD
      }
      for (const rec of cards) applyWash(rec)
    },
  }
}
