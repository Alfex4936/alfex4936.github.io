// Measurement terrain: the ten measured numbers as isometric columns, height
// = log₁₀(magnitude). Hover is where the data lives; the orbit is the quiet half.
import { dpr } from './scene-core.js'

const root = document.documentElement
const T = (ko, en) => (root.dataset.lang === 'ko' ? ko : en)

// m = magnitude. ratio -> before/after. level -> the measured level itself.
const M = [
  {
    v: '373→4',
    p: 'k8s-operator',
    y: 2026,
    k: 'ratio',
    m: 373 / 4,
    ko: '서비스 상태 평가 1회당 List 호출. 샤드 수에 비례하던 것을 상수로 바꿈(20샤드 기준), 회귀 테스트로 고정',
    en: 'List calls per service status check on a 20-shard service; now constant instead of growing with shard count, pinned by a regression test',
  },
  {
    v: '90%·50%',
    p: 'LINE Plus',
    y: 2026,
    k: 'level',
    m: 90,
    ko: '사용자 API·어드민 API를 실제 호출로 덮는 비율. 멈춰 있던 E2E 스위트를 재구축, CI 매일·PR 단위 표적 실행',
    en: 'user APIs · admin APIs covered with real calls by the E2E suite, rebuilt after it had stalled; daily in CI, targeted runs per PR',
  },
  {
    v: '27·301',
    p: 'redis-module',
    y: 2026,
    k: 'level',
    m: 27 + 301,
    ko: '감사 이벤트 종류·분류한 커맨드 수. 설계를 전담한 접근제어 모듈',
    en: 'audit event types · commands classified in the access-control module (sole designer)',
  },
  {
    v: '66×·85%',
    p: 'k-pullup',
    y: 2024,
    k: 'ratio',
    m: 66,
    ko: '공간 쿼리를 다시 짠 뒤의 MySQL 쿼리 비용 절감과 응답 시간 개선',
    en: 'MySQL spatial query cost cut, and response time improved, after reworking geospatial queries',
  },
  {
    v: '4,858ms→1.1ms',
    p: 'k-pullup',
    y: 2024,
    k: 'ratio',
    m: 4858 / 1.1,
    ko: '10KB 한글 텍스트 비속어 필터링, Double Aho-Corasick',
    en: 'profanity filtering on 10KB of Korean text, double Aho-Corasick',
  },
  {
    v: 'TPS 3,548',
    p: 'k-pullup',
    y: 2024,
    k: 'level',
    m: 3548,
    ko: 'Redis 기반 WebSocket 채팅, 동시 접속 1,000명, 5분간 100만 건',
    en: 'Redis-backed WebSocket chat, 1,000 concurrent users, 1M messages in 5 minutes',
  },
  {
    v: 'MAU 4,000',
    p: 'k-pullup',
    y: 2024,
    k: 'level',
    m: 4000,
    ko: '2024.02부터 운영 중인 k-pullup',
    en: 'k-pullup, in service since 2024.02',
  },
  {
    v: '1,677/s',
    p: 'YTChatX',
    y: 2025,
    k: 'level',
    m: 1677,
    ko: '시청자 3만 명 라이브에서 수집한 채팅 메시지',
    en: 'live-chat messages collected from a 30K-viewer stream',
  },
  {
    v: '65%↓',
    p: 'YTChatX',
    y: 2025,
    k: 'ratio',
    m: 100 / 35,
    ko: 'Playwright를 Rust + Chromiumoxide로 바꾼 뒤의 스크래퍼 메모리, 동시 크롤러 50+',
    en: 'scraper memory after replacing Playwright with Rust + Chromiumoxide, 50+ concurrent crawlers',
  },
  {
    v: '5s→2s',
    p: 'BeautyMinder',
    y: 2023,
    k: 'ratio',
    m: 5 / 2,
    ko: '동시 접속 500명에서의 검색 응답',
    en: 'search response at 500 concurrent users',
  },
]

const PROJ = {
  BeautyMinder: { ko: 'BeautyMinder', en: 'BeautyMinder' },
  'k-pullup': { ko: 'k-pullup', en: 'k-pullup' },
  YTChatX: { ko: 'YTChatX', en: 'YTChatX' },
  'k8s-operator': { ko: 'Kubernetes 오퍼레이터', en: 'Kubernetes operator' },
  'redis-module': { ko: 'Redis 모듈, C', en: 'Redis module, C' },
  'LINE Plus': { ko: 'LINE Plus', en: 'LINE Plus' },
}

const ORDER = ['BeautyMinder', 'k-pullup', 'YTChatX', 'k8s-operator', 'redis-module', 'LINE Plus']
const YEARS = [2026, 2025, 2024, 2023]
const SX = 1.22
const GG = 0.72
const CW = 0.66
const SZ = 2.0
const HS = 1.15
const YTICKS = [1, 2, 3]
const TD = 0.38 // tick dash; (-x,+z) projects dead horizontal
// The mount is ~710x484 inside the transcript column, which fits far fewer value
// labels than it fits columns. Show the tallest few and let hover disclose the
// rest; the axis names are what stop this being a picture of some boxes.
const RESTVALS = 4
const VHALO = [16, 10] // value labels claim more clear space than axis furniture
const THALO = [8, 3]
const EL = Math.atan(1 / Math.SQRT2) // 35.264°, true isometric
const AZ0 = Math.PI / 4
const AZA = (6 * Math.PI) / 180
const PERIOD = 22
const RAD = 120

// Every colour is a token reference, so the dark, light and hidden Redis themes
// all recolour the overlay with no JS at all.
const CSS = `
.st-layer{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none;
  font:400 11px/1.4 var(--font);letter-spacing:.01em}
.st-lb{position:absolute;top:0;left:0;white-space:nowrap;opacity:0;transition:opacity .22s linear}
.st-lb.st-in{opacity:1}
.st-lb.st-off{opacity:0}
.st-tick{font-size:11px;font-weight:400;color:var(--faint);letter-spacing:.02em}
.st-tick-y,.st-tick-axis{text-align:right;padding-right:9px}
.st-tick-axis{font-size:11px;color:var(--faint)}
.st-val{font-size:11px;font-weight:500;letter-spacing:.01em}
.st-val .st-n{color:var(--claude)}
.st-val .st-u{color:var(--dim)}
.st-val.st-hot .st-u{color:var(--fg)}
.st-legend{position:absolute;left:14px;bottom:12px;font-size:11px;color:var(--faint);
  line-height:1.75;letter-spacing:.01em;max-width:min(560px,calc(100% - 28px))}
.st-legend b{color:var(--dim);font-weight:400}
.st-legend .st-k{display:inline-block;min-width:44px;color:var(--faint)}
/* above .st-lb: the labels are appended after the callout, so without this an
   opaque panel paints under every one of them */
.st-callout{position:absolute;top:0;left:0;z-index:2;display:none;border:1px solid var(--rule);
  background:var(--bg);padding:7px 11px;font-size:11px;letter-spacing:.01em;
  max-width:calc(100% - 20px)}
.st-callout.st-on{display:block}
.st-cv{color:var(--claude);font-weight:500}
.st-cd{color:var(--dim);margin-left:12px}
.st-cm{color:var(--faint);margin-left:12px}
@media screen and (max-width:820px){
  .st-legend{font-size:9px;line-height:1.7}
  .st-legend .st-ex{display:none}
  .st-legend .st-k{min-width:36px}
  .st-tick{font-size:9px}
  .st-lb.st-tick-axis{display:none}
}
`

let styled = false
const injectCss = () => {
  if (styled) return
  styled = true
  const el = document.createElement('style')
  el.textContent = CSS
  document.head.append(el)
}

const eo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
const splitMetric = (s) =>
  s
    .split(/([\d.,]*\d)/)
    .filter(Boolean)
    .map((t) => `<span class="${/\d/.test(t) ? 'st-n' : 'st-u'}">${t}</span>`)
    .join('')

export default function terrain({ THREE, canvas, width, height, tokens, still }) {
  injectCss()

  const host = canvas.parentElement
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
  canvas.style.display = 'block'

  // ---- layout --------------------------------------------------------------
  // Projects run oldest-left. Project and year are near 1:1 in this data, so the
  // X order decides the spread: ordering X against Z fills the frame instead of
  // collapsing the columns onto the depth axis.
  const data = M.map((d) => ({ ...d }))
  const zOf = (y) => (YEARS.indexOf(y) - 1.5) * SZ

  const groups = []
  let cursor = 0
  for (const p of ORDER) {
    const items = data.filter((d) => d.p === p)
    items.forEach((d, i) => {
      d.xr = cursor + i * SX
    })
    groups.push({
      p,
      items,
      cr: cursor + ((items.length - 1) * SX) / 2,
      a: cursor - SX / 2 - GG / 2,
      b: cursor + (items.length - 1) * SX + SX / 2 + GG / 2,
    })
    cursor += items.length * SX + GG
  }

  const OX = (groups[0].a + groups[groups.length - 1].b) / 2
  const GX0 = groups[0].a - OX
  const GX1 = groups[groups.length - 1].b - OX
  const GZ0 = zOf(2026) - SZ / 2 - 0.5
  const GZ1 = zOf(2023) + SZ / 2 + 0.5

  for (const g of groups) {
    g.cr -= OX
    g.a -= OX
    g.b -= OX
  }
  for (const d of data) {
    d.x = d.xr - OX
    d.z = zOf(d.y)
    d.mag = Math.log10(d.m)
    d.h = Math.max(d.mag * HS, 0.24)
  }

  const AX = GX0 // the Y axis rises from the plate's near-left corner
  const AZ = GZ1
  const AYTOP = YTICKS[YTICKS.length - 1] * HS + 0.55

  // ---- renderer ------------------------------------------------------------
  let vw = Math.max(width, 1)
  let vh = Math.max(height, 1)

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
  renderer.setPixelRatio(dpr())

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
  camera.up.set(0, 1, 0)
  const TARGET = new THREE.Vector3(0, 1.1, 0)

  const place = (az) => {
    camera.position.set(
      TARGET.x + RAD * Math.cos(EL) * Math.sin(az),
      TARGET.y + RAD * Math.sin(EL),
      TARGET.z + RAD * Math.cos(EL) * Math.cos(az),
    )
    camera.lookAt(TARGET)
    camera.updateMatrixWorld()
  }

  // ---- palette -------------------------------------------------------------
  // The ink ramp is token-relative, never pinned: --rule cap and screen-left
  // wall, --bg-2 screen-right, --bg on the faces the camera never sees. On light
  // the tokens invert, so the same three steps read as darker-than-paper.
  const C = {
    bg: new THREE.Color(),
    bg2: new THREE.Color(),
    rule: new THREE.Color(),
    dim: new THREE.Color(),
    claude: new THREE.Color(),
  }
  const readPalette = (tk) => {
    C.bg.set(tk.bg)
    C.bg2.set(tk['bg-2'])
    C.rule.set(tk.rule)
    C.dim.set(tk.dim)
    C.claude.set(tk.claude)
  }
  readPalette(tokens)
  renderer.setClearColor(C.bg, 1)

  // ---- floor grid + axes ---------------------------------------------------
  const seg = []
  const line = (x1, y1, z1, x2, y2, z2) => seg.push(x1, y1, z1, x2, y2, z2)

  line(GX0, 0, GZ0, GX1, 0, GZ0)
  line(GX0, 0, GZ1, GX1, 0, GZ1)
  line(GX0, 0, GZ0, GX0, 0, GZ1)
  line(GX1, 0, GZ0, GX1, 0, GZ1)
  for (const y of YEARS) line(GX0, 0, zOf(y), GX1, 0, zOf(y))
  for (let i = 0; i < groups.length - 1; i++) line(groups[i].b, 0, GZ0, groups[i].b, 0, GZ1)
  for (const d of data) line(d.x, 0, GZ1, d.x, 0, GZ1 + 0.28)
  line(AX, 0, AZ, AX, AYTOP, AZ)
  for (const t of YTICKS) line(AX, t * HS, AZ, AX - TD, t * HS, AZ + TD)

  const gridGeo = new THREE.BufferGeometry()
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
  const gridMat = new THREE.LineBasicMaterial({ color: C.rule.clone() })
  scene.add(new THREE.LineSegments(gridGeo, gridMat))

  // ---- columns -------------------------------------------------------------
  // Two shared materials; every per-column difference lives in vertex colours,
  // so rims animate, hover fills and retint recolours without extra draw calls.
  const bodyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true })

  const unitBox = new THREE.BoxGeometry(CW, 1, CW)
  unitBox.translate(0, 0.5, 0)
  const unitEdges = new THREE.EdgesGeometry(unitBox)

  // the four cap edges: both endpoints sit on the top plane of the unit box
  const RIM = []
  {
    const p = unitEdges.attributes.position
    for (let i = 0; i < p.count; i += 2)
      if (p.getY(i) > 0.99 && p.getY(i + 1) > 0.99) RIM.push(i, i + 1)
  }

  let hover = null

  const paintFace = (arr, face, color) => {
    for (let i = face * 4; i < face * 4 + 4; i++) {
      arr[i * 3] = color.r
      arr[i * 3 + 1] = color.g
      arr[i * 3 + 2] = color.b
    }
  }

  // solid --claude on the cap is hover only; at rest the cap stays in the ramp
  const paintBody = (d) => {
    const a = d.cattr.array
    paintFace(a, 0, C.bg2)
    paintFace(a, 1, C.bg)
    paintFace(a, 2, hover === d ? C.claude : C.rule)
    paintFace(a, 3, C.bg)
    paintFace(a, 4, C.rule)
    paintFace(a, 5, C.bg)
    d.cattr.needsUpdate = true
  }

  const paintEdges = (d, rim, rest) => {
    const a = d.eattr.array
    for (let i = 0; i < a.length; i += 3) {
      a[i] = rest.r
      a[i + 1] = rest.g
      a[i + 2] = rest.b
    }
    for (const i of RIM) {
      a[i * 3] = rim.r
      a[i * 3 + 1] = rim.g
      a[i * 3 + 2] = rim.b
    }
    d.eattr.needsUpdate = true
  }

  const bodies = []
  for (const d of data) {
    const geo = unitBox.clone()
    const cattr = new THREE.BufferAttribute(new Float32Array(24 * 3), 3)
    geo.setAttribute('color', cattr)

    const mesh = new THREE.Mesh(geo, bodyMat)
    mesh.position.set(d.x, 0, d.z)
    mesh.scale.y = still ? d.h : 0.0001
    mesh.userData.d = d
    scene.add(mesh)

    const egeo = unitEdges.clone()
    const eattr = new THREE.BufferAttribute(new Float32Array(egeo.attributes.position.count * 3), 3)
    egeo.setAttribute('color', eattr)
    const edges = new THREE.LineSegments(egeo, edgeMat)
    edges.position.copy(mesh.position)
    edges.scale.y = mesh.scale.y
    scene.add(edges)

    d.mesh = mesh
    d.edges = edges
    d.cattr = cattr
    d.eattr = eattr
    d.rimT = still ? 1 : 0
    d.rimC = (still ? C.claude : C.rule).clone()
    paintBody(d)
    paintEdges(d, d.rimC, C.rule)
    bodies.push(mesh)
  }

  // rise order: year ascending, then project left to right
  ;[...data]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((d, i) => {
      d.t0 = i * 0.045
      d.t1 = d.t0 + 0.55
      d.c0 = d.t1 + 0.08
      d.c1 = d.c0 + 0.26
    })

  // ---- overlay -------------------------------------------------------------
  const layer = document.createElement('div')
  layer.className = 'st-layer'
  layer.setAttribute('aria-hidden', 'true')
  host.append(layer)

  const legend = document.createElement('div')
  legend.className = 'st-legend'
  layer.append(legend)

  const legendHtml = () => {
    const row = (k, body, ex) =>
      `<div><span class="st-k">${k}</span>${body}` +
      (ex ? `<span class="st-ex"> &nbsp;·&nbsp; ${ex}</span>` : '') +
      '</div>'
    return (
      `<div><b>${T('높이 = log₁₀(크기)', 'height = log₁₀(magnitude)')}</b>, ` +
      `${T('10배마다 1.15 월드 유닛', '1.15 world units per decade')}</div>` +
      row(
        T('비율', 'ratio'),
        T('크기 = 개선 전 / 개선 후', 'magnitude = before / after'),
        '4,858ms→1.1ms = 4,417',
      ) +
      row(T('수준', 'level'), T('크기 = 측정값 그 자체', 'magnitude = the level itself')) +
      row(
        T('범위', 'span'),
        T('측정 11건, 2.5부터 4,417까지', '2.5 to 4,417 across 11 measurements'),
        T('Y축 눈금 10 / 100 / 1,000', 'Y ticks at 10 / 100 / 1,000'),
      )
    )
  }

  const callout = document.createElement('div')
  callout.className = 'st-callout'
  callout.innerHTML = '<span class="st-cv"></span><span class="st-cd"></span><span class="st-cm"></span>'
  layer.append(callout)
  const coV = callout.querySelector('.st-cv')
  const coD = callout.querySelector('.st-cd')
  const coM = callout.querySelector('.st-cm')

  const writeCallout = (d) => {
    coV.textContent = d.v
    coD.textContent = T(d.ko, d.en)
    coM.textContent = `${T(PROJ[d.p].ko, PROJ[d.p].en)} · ${d.y} · log₁₀ ${d.mag.toFixed(2)}`
  }

  // ---- projected labels ----------------------------------------------------
  // pri orders the collision thinner: the axis outranks the values, because a
  // terrain with no project name on it stops being a chart
  const marks = []
  const mark = (cls, text, anchor, xa, ya, pri) => {
    const el = document.createElement('div')
    el.className = 'st-lb ' + cls
    layer.append(el)
    const m = { el, text, anchor, xa, ya, pri, w: 0, h: 0, px: 0, py: 0 }
    marks.push(m)
    return m
  }

  const vals = []
  for (const d of data) {
    const m = mark(
      'st-val',
      () => splitMetric(d.v),
      new THREE.Vector3(d.x, d.h + 0.3, d.z),
      -0.5,
      -1,
      10 + d.mag,
    )
    m.d = d
    d.vlabel = m
    vals.push(m)
  }
  for (const g of groups)
    mark(
      'st-tick',
      () => T(PROJ[g.p].ko, PROJ[g.p].en),
      new THREE.Vector3(g.cr, 0, GZ1 + 0.95),
      -0.5,
      -0.5,
      30,
    ).fixed = true
  for (const y of YEARS)
    mark('st-tick', () => String(y), new THREE.Vector3(GX1 + 0.95, 0, zOf(y)), -0.5, -0.5, 20).fixed = true

  const YLAB = (y) => new THREE.Vector3(AX - TD - 0.22, y, AZ + TD + 0.22)
  for (const t of YTICKS)
    mark('st-tick st-tick-y', () => (t === 1 ? '10' : t === 2 ? '100' : '1,000'), YLAB(t * HS), -1, -0.5, 40).fixed = true
  // clear of the top Y tick: 0.55 world units above it projects to less than one
  // line height at this mount size, so the caption anchors above the axis cap
  const cap = mark('st-tick-axis', () => T('크기 log₁₀', 'magnitude log₁₀'), YLAB(AYTOP + 0.35), -1, -0.5, 40)
  cap.fixed = true
  cap.clamp = true // right-aligned off the axis, so the long form runs off the left edge

  const thinOrder = [...marks].sort((a, b) => b.pri - a.pri)

  const writeMarks = () => {
    for (const m of marks) m.el.innerHTML = m.text()
  }

  // The legend is static furniture the projection knows nothing about, and the
  // project axis runs diagonally into the bottom-centre, so the ticks have to be
  // laid out around it. Per line, not one block: the legend's divs are as wide as
  // the layer, and the diagonal slips between the short lines.
  let legendRects = []
  const measureLegend = () => {
    const base = layer.getBoundingClientRect()
    const range = document.createRange()
    legendRects = []
    for (const lineEl of legend.children) {
      range.selectNodeContents(lineEl)
      for (const c of range.getClientRects()) {
        if (c.width < 1) continue
        legendRects.push({
          x: c.left - base.left,
          y: c.top - base.top,
          w: c.width,
          h: c.height,
          hx: THALO[0],
          hy: THALO[1],
        })
      }
    }
  }

  let measured = false
  const measure = () => {
    for (const m of marks) {
      m.w = m.el.offsetWidth
      m.h = m.el.offsetHeight
    }
    measureLegend()
    measured = true
  }

  // ---- camera fit ----------------------------------------------------------
  // The plate decides where the scene is centred. Everything else only decides
  // how far out we zoom, and a label's claim on the frame is measured in pixels,
  // so each fit point can carry the mark whose text hangs off it.
  const plate = [
    new THREE.Vector3(GX0, 0, GZ0),
    new THREE.Vector3(GX1, 0, GZ0),
    new THREE.Vector3(GX0, 0, GZ1),
    new THREE.Vector3(GX1, 0, GZ1),
  ]
  const fitPts = []
  for (const p of plate) fitPts.push({ p, m: null })
  fitPts.push({ p: new THREE.Vector3(AX, AYTOP + 0.4, AZ), m: null })
  for (const m of marks) fitPts.push({ p: m.anchor, m })

  const fitCamera = () => {
    renderer.setSize(vw, vh)
    const aspect = vw / vh

    const cam = []
    const pl = []
    const inv = new THREE.Matrix4()
    const v = new THREE.Vector3()
    for (const az of [AZ0 - AZA, AZ0, AZ0 + AZA]) {
      place(az)
      inv.copy(camera.matrixWorld).invert()
      for (const f of fitPts) {
        v.copy(f.p).applyMatrix4(inv)
        cam.push({ x: v.x, y: v.y, m: f.m })
      }
      for (const p of plate) {
        v.copy(p).applyMatrix4(inv)
        pl.push({ x: v.x, y: v.y })
      }
    }

    // fixed-px labels need world room that depends on the zoom: fit on the
    // anchors, convert the text halo at that scale, fit again
    const A = [0, 0, 0, 0]
    let viewH = 1
    let k = 1
    for (let pass = 0; pass < 3; pass++) {
      A[0] = Infinity
      A[1] = -Infinity
      A[2] = Infinity
      A[3] = -Infinity
      for (const c of cam) {
        const m = pass && c.m ? c.m : null
        const l = m ? (m.w * -m.xa) / k : 0
        const r = m ? (m.w * (1 + m.xa)) / k : 0
        const t = m ? (m.h * -m.ya) / k : 0
        const b = m ? (m.h * (1 + m.ya)) / k : 0
        if (c.x - l < A[0]) A[0] = c.x - l
        if (c.x + r > A[1]) A[1] = c.x + r
        if (c.y - b < A[2]) A[2] = c.y - b
        if (c.y + t > A[3]) A[3] = c.y + t
      }
      viewH = Math.max((A[3] - A[2]) / 0.9, (A[1] - A[0]) / 0.97 / aspect)
      k = vh / viewH
    }
    const viewW = viewH * aspect

    const P = [Infinity, -Infinity, Infinity, -Infinity]
    for (const c of pl) {
      if (c.x < P[0]) P[0] = c.x
      if (c.x > P[1]) P[1] = c.x
      if (c.y < P[2]) P[2] = c.y
      if (c.y > P[3]) P[3] = c.y
    }
    const mg = 0.01 * viewH
    const cl = (t, lo, hi) => (lo > hi ? (lo + hi) / 2 : t < lo ? lo : t > hi ? hi : t)
    // optical centre: the plate carries the weight, the label overhang half of it
    const cx = cl(
      (0.5 * (P[0] + P[1])) / 2 + (0.5 * (A[0] + A[1])) / 2,
      A[1] - viewW / 2 + mg,
      A[0] + viewW / 2 - mg,
    )
    // a tall narrow mount leaves vertical slack once the width binds; cap the
    // gap above the scene instead of floating it in the middle
    const cy = cl(
      Math.min(
        (0.5 * (P[2] + P[3])) / 2 + (0.5 * (A[2] + A[3])) / 2,
        A[3] - viewH / 2 + 0.08 * viewH,
      ),
      A[3] - viewH / 2 + mg,
      A[2] + viewH / 2 - mg,
    )
    camera.left = cx - viewW / 2
    camera.right = cx + viewW / 2
    camera.top = cy + viewH / 2
    camera.bottom = cy - viewH / 2
    camera.updateProjectionMatrix()
  }

  // ---- hover ---------------------------------------------------------------
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  // the callout follows the cursor, so it thins labels the way the legend does
  let coRect = null
  let px = -1
  let py = -1
  let pointerDirty = false

  const setHover = (d) => {
    if (hover === d) return
    const was = hover
    hover = d
    lastThin = -1 // thin against the new callout this frame, not up to 160ms later
    if (was) {
      paintBody(was)
      paintEdges(was, was.rimC, C.rule)
      was.vlabel.el.classList.remove('st-hot')
    }
    if (!d) {
      callout.classList.remove('st-on')
      coRect = null
      return
    }
    paintBody(d)
    paintEdges(d, d.rimC, C.dim)
    d.vlabel.el.classList.add('st-hot')
    writeCallout(d)
    callout.classList.add('st-on')
  }

  const raycast = () => {
    if (px < 0) {
      setHover(null)
      return
    }
    const r = host.getBoundingClientRect()
    const lx = px - r.left
    const ly = py - r.top
    ndc.set((lx / vw) * 2 - 1, -(ly / vh) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(bodies, false)[0]
    setHover(hit ? hit.object.userData.d : null)
    if (!hover) return
    const cw = callout.offsetWidth
    const ch = callout.offsetHeight
    const cx = Math.max(10, Math.min(lx + 16, vw - cw - 10))
    const cy = Math.max(10, Math.min(ly + 18, vh - ch - 10))
    callout.style.transform = `translate3d(${cx}px,${cy}px,0)`
    coRect = { x: cx, y: cy, w: cw, h: ch, hx: THALO[0], hy: THALO[1] }
  }

  // ---- label projection + thinning -----------------------------------------
  const pv = new THREE.Vector3()
  let lastThin = -1

  const layout = (t) => {
    for (const m of marks) {
      pv.copy(m.anchor).project(camera)
      m.px = (pv.x * 0.5 + 0.5) * vw
      m.py = (-pv.y * 0.5 + 0.5) * vh
      if (m.clamp) {
        // the mount clips, so keep the whole string in frame rather than tracking
        const lo = 4 - m.xa * m.w
        m.px = Math.min(Math.max(m.px, lo), Math.max(lo, vw - 4 - m.w - m.xa * m.w))
        const top = 4 - m.ya * m.h
        m.py = Math.min(Math.max(m.py, top), Math.max(top, vh - 4 - m.h - m.ya * m.h))
      }
      m.el.style.transform = `translate3d(${m.px}px,${m.py}px,0) translate(${m.xa * 100}%,${m.ya * 100}%)`
      if (m.fixed && !m.el.classList.contains('st-in') && (still || t > 0.35))
        m.el.classList.add('st-in')
    }
    for (const m of vals) {
      const live = still || t >= m.d.c0
      if (live !== m.el.classList.contains('st-in')) m.el.classList.toggle('st-in', live)
    }
    if (!measured) return
    if (!still && lastThin >= 0 && t - lastThin < 0.16) return
    lastThin = t
    const taken = [...legendRects] // legend outranks everything; it never thins
    if (coRect) taken.push(coRect) // so does the callout, for as long as it is up
    let shown = 0
    for (const m of thinOrder) {
      const hot = m.d && hover === m.d
      const [hx, hy] = m.d ? VHALO : THALO
      const r = { x: m.px + m.xa * m.w, y: m.py + m.ya * m.h, w: m.w, h: m.h, hx, hy }
      let ok = !(m.d && shown >= RESTVALS)
      if (ok && !hot) {
        for (const q of taken) {
          const px = Math.max(hx, q.hx)
          const py = Math.max(hy, q.hy)
          if (
            r.x < q.x + q.w + px &&
            q.x < r.x + r.w + px &&
            r.y < q.y + q.h + py &&
            q.y < r.y + r.h + py
          ) {
            ok = false
            break
          }
        }
      }
      if (ok || hot) {
        taken.push(r)
        if (m.d) shown++
      }
      m.el.classList.toggle('st-off', !(ok || hot))
    }
  }

  // ---- loop ----------------------------------------------------------------
  const grow = (t) => {
    for (const d of data) {
      const r = eo(clamp01((t - d.t0) / (d.t1 - d.t0)))
      const sy = Math.max(d.h * r, 0.0001)
      d.mesh.scale.y = sy
      d.edges.scale.y = sy
      const c = clamp01((t - d.c0) / (d.c1 - d.c0))
      if (c !== d.rimT) {
        // the rims arrive last
        d.rimT = c
        d.rimC.copy(C.rule).lerp(C.claude, c)
        paintEdges(d, d.rimC, hover === d ? C.dim : C.rule)
      }
    }
  }

  let elapsed = still ? 99 : 0

  const draw = () => {
    place(still ? AZ0 : AZ0 + AZA * Math.sin((2 * Math.PI * elapsed) / PERIOD))
    // the camera drifts, so re-cast every frame the pointer is over the scene or
    // the highlight goes stale under a cursor that never moved
    if (pointerDirty || px >= 0) {
      pointerDirty = false
      raycast()
    }
    renderer.render(scene, camera)
    layout(elapsed)
  }

  host.addEventListener(
    'pointermove',
    (e) => {
      px = e.clientX
      py = e.clientY
      pointerDirty = true
      if (still) draw()
    },
    { passive: true },
  )
  host.addEventListener(
    'pointerleave',
    () => {
      px = -1
      py = -1
      pointerDirty = true
      if (still) draw()
    },
    { passive: true },
  )

  // scene-core only watches data-theme, so the language swap is ours to catch
  new MutationObserver(() => {
    writeMarks()
    legend.innerHTML = legendHtml()
    if (hover) writeCallout(hover)
    measure()
    lastThin = -1
    fitCamera()
    draw()
  }).observe(root, { attributeFilter: ['data-lang'] })

  writeMarks()
  legend.innerHTML = legendHtml()
  fitCamera()
  ;(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    measure()
    lastThin = -1
    fitCamera() // the fit needs real label sizes
    draw()
  })

  return {
    render(t, dt) {
      if (!still) {
        elapsed += dt
        if (elapsed < 1.5) grow(elapsed)
      }
      draw()
    },

    resize(w, h) {
      vw = Math.max(w, 1)
      vh = Math.max(h, 1)
      renderer.setPixelRatio(dpr())
      lastThin = -1
      fitCamera()
      if (measured) measure() // the legend reflows, and the mobile rules change tick sizes
    },

    retint(tk) {
      readPalette(tk)
      renderer.setClearColor(C.bg, 1)
      gridMat.color.copy(C.rule)
      for (const d of data) {
        paintBody(d)
        d.rimC.copy(C.rule).lerp(C.claude, d.rimT)
        paintEdges(d, d.rimC, hover === d ? C.dim : C.rule)
      }
    },
  }
}
