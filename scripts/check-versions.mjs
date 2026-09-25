// Guards the manual ?v=N cache-busting convention, which has broken the live
// site once: css/site.css changed, the query stayed at 15, and warm caches
// paired new markup with the old stylesheet.
//
//   node scripts/check-versions.mjs          report, exit 1 on a problem
//   node scripts/check-versions.mjs --fix    bump the stale ones and report
//
// Two rules:
//   stale       an asset's bytes changed against HEAD but its ?v= did not
//   mismatched  one asset is referenced at two different ?v= in the repo,
//               which serves it twice and, for an ES module, instantiates it twice

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIX = process.argv.includes('--fix')

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  } catch {
    return null
  }
}

const htmlFiles = git('ls-files', '*.html')
  .split('\n')
  .filter(Boolean)

// href="css/site.css?v=16", src="js/site.js?v=7", from './js/scene-city.js?v=13'
// The version group is optional: an asset referenced with no ?v= at all is the
// same hazard as a stale one, and is the easier of the two to miss.
const REF = /(?:href|src|from)\s*=?\s*["']((?:\.{0,2}\/)?[\w./-]+\.(?:css|js))(\?v=(\d+))?["']/g

// A ref is either rooted at the site ("/css/site.css") or relative to the page
// that holds it — and a page in redis/ saying "viz.css" means redis/viz.css,
// not a file of that name at the root.
const canon = (raw, file) =>
  raw.startsWith('/')
    ? posix.normalize(raw.slice(1))
    : posix.normalize(posix.join(posix.dirname(file), raw))

const assets = new Map() // canonical path -> { refs: [{file, raw, v}] }
for (const file of htmlFiles) {
  const text = readFileSync(join(ROOT, file), 'utf8')
  for (const m of text.matchAll(REF)) {
    const raw = m[1]
    const v = m[3] === undefined ? null : Number(m[3])
    const key = canon(raw, file)
    if (!assets.has(key)) assets.set(key, { refs: [] })
    assets.get(key).refs.push({ file, raw, v })
  }
}

const stale = []
const mismatched = []
const unversioned = []

for (const [key, a] of assets) {
  const versioned = a.refs.filter((r) => r.v !== null)
  const versions = [...new Set(versioned.map((r) => r.v))]
  if (versions.length > 1) mismatched.push({ key, versions, refs: versioned })

  if (!existsSync(join(ROOT, key))) continue
  const head = git('show', `HEAD:${key}`)
  if (head === null) continue // new file, never committed: nothing to compare
  const now = readFileSync(join(ROOT, key), 'utf8')
  if (head === now) continue

  // The bytes moved. An asset nobody ever gave a ?v= is the worse case: there
  // is no number to compare, so a warm cache keeps the old file indefinitely
  // and no amount of bumping elsewhere helps.
  if (!versioned.length) {
    unversioned.push({ key, refs: a.refs })
    continue
  }
  a.refs = versioned

  // bytes moved; did any reference's version move with them?
  const bumped = a.refs.some((r) => {
    const headHtml = git('show', `HEAD:${r.file}`)
    if (headHtml === null) return true
    const was = headHtml.match(new RegExp(`${r.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=(\\d+)`))
    return !was || Number(was[1]) !== r.v
  })
  if (!bumped) stale.push({ key, v: versions[0], refs: a.refs })
}

const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`

if (FIX) {
  const edits = new Map()
  const bump = (refs, next) => {
    for (const r of refs) {
      const text = edits.get(r.file) ?? readFileSync(join(ROOT, r.file), 'utf8')
      edits.set(r.file, text.split(`${r.raw}?v=${r.v}`).join(`${r.raw}?v=${next}`))
    }
  }
  for (const s of stale) bump(s.refs, s.v + 1)
  for (const m of mismatched) bump(m.refs, Math.max(...m.versions))
  // An asset with no version anywhere gets one, rather than a bump.
  for (const u of unversioned) {
    for (const r of u.refs) {
      const text = edits.get(r.file) ?? readFileSync(join(ROOT, r.file), 'utf8')
      edits.set(r.file, text.split(`"${r.raw}"`).join(`"${r.raw}?v=1"`))
    }
  }
  for (const [file, text] of edits) writeFileSync(join(ROOT, file), text)
  if (edits.size) {
    console.log(`bumped ${plural(edits.size, 'file')}:`)
    for (const s of stale) console.log(`  ${s.key}  v${s.v} -> v${s.v + 1}  (${s.refs.length} refs)`)
    for (const m of mismatched)
      console.log(`  ${m.key}  ${m.versions.join('/')} -> v${Math.max(...m.versions)}  (aligned)`)
    for (const u of unversioned)
      console.log(`  ${u.key}  no version -> v1  (${u.refs.length} refs)`)
  } else {
    console.log(`${plural(assets.size, 'versioned asset')}, nothing to bump`)
  }
  process.exit(0)
}

for (const m of mismatched)
  console.error(
    `MISMATCH  ${m.key} is referenced at v${m.versions.join(' and v')}\n` +
      m.refs.map((r) => `            ${r.file}: ${r.raw}?v=${r.v}`).join('\n'),
  )
for (const s of stale)
  console.error(
    `STALE     ${s.key} changed since HEAD but is still ?v=${s.v}\n` +
      `            warm caches will pair new markup with the old file\n` +
      s.refs.map((r) => `            ${r.file}`).join('\n'),
  )

for (const u of unversioned)
  console.error(
    `UNVERSIONED  ${u.key} changed since HEAD and carries no ?v= at all\n` +
      `            there is no number to compare, so a warm cache keeps the old file\n` +
      u.refs.map((r) => `            ${r.file}`).join('\n'),
  )

if (stale.length || mismatched.length || unversioned.length) {
  console.error(`\nrun: node scripts/check-versions.mjs --fix`)
  process.exit(1)
}
console.log(`${plural(assets.size, 'versioned asset')}, all consistent and current`)
