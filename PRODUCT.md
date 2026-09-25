# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences of equal weight, confirmed by the owner: Korean hiring
managers and interviewers, and English-speaking hiring managers abroad. Neither
is the fallback for the other — the KO/EN parity written into every page is the
mechanism that serves both, not a courtesy translation.

The job is the same in both cases: decide, in one sitting and usually on the
first visit, whether this person is worth a call. Often on a phone.

A third group arrives for the Redis internals visualizers under `redis/` and
reads nothing else. Observed from what the site contains, not confirmed by the
owner as a design target.

## Product Purpose

The personal portfolio of 최석원 · Seokwon Choi, backend and platform engineer,
DBaaS DevOps at LINE Plus. One page that can be evaluated without downloading
anything, in the reader's own language: measured results, then projects, then
Redis internals, then a career timeline. The résumé opens in place over the page
rather than navigating away or handing over a file.

Success is that the reader can say what he measured, not just what he built.

## Positioning

Platform engineering is the claim: Go and Kubernetes operators and control
planes for managed databases, performance work grounded in Redis internals,
release pipeline automation. The ten measured numbers on the landing page are
the evidence underneath that claim — they are not themselves the positioning.

The owner chose this over two alternatives: measurement-as-the-thesis, and
measurement plus the Redis visualizers as equal halves.

## Operating Context

- Read in a browser, usually once, by someone deciding whether to take a call.
- Language and theme resolve before first paint, from `?lang`, then
  `localStorage`, then `navigator.language`. Nothing flashes.
- `/resume` opens the two-page A4 PDF in place via `js/reader.js`, in whichever
  language is toggled. The PDFs under `resume/` are produced by the sibling
  project `seokresume` (React + Vite, `npm run pdf`) and copied in.
- A command console: `/` from anywhere, with `/help /measurements /projects
  /redis /timeline /resume`, alongside a Redis-flavoured command line (`PING`,
  `GET name`, `KEYS *`, `ACL LIST`, …).
- Section headers are framed as tool calls (`cwd`, `Read`, `Glob`, `Search`,
  `Bash`) — the page is a Claude Code session rendered as a website.

## Capabilities and Constraints

- Static site on GitHub Pages. No framework, no bundler, no build step, no
  `package.json`: hand-written HTML, hand-written `css/site.css`, vanilla ES
  modules in `js/`.
- `scss/`, `css/style.css`, `lib/` and `min/` belong to the legacy theme behind
  `old.html` only. They do not feed the current site.
- three.js is fetched from unpkg at runtime, and only once a scene mount comes
  near the viewport. Three scenes: `scene-city` (hero), `scene-terrain`
  (measurements), `scene-timeline` (the timeline fly-through).
- **No company-internal names ship.** Product codenames, internal hostnames,
  team names, ticket prefixes and internal URLs stay out. The employer name is
  fine; the generic form is the rule for everything inside it
  ("사내 프라이빗 클라우드의 관리형 DB"). Confirmed binding by the owner.
- **Every string exists in both KO and EN.** Both are written into the DOM and
  CSS hides whichever is not current; nothing re-renders on a language change. A
  one-language string is a defect. Confirmed binding by the owner.
- Cache busting is a manual `?v=N` on entry assets. Shared leaf modules
  (`js/scene-core.js`, `js/timeline-data.js`) carry no version on purpose: the
  scene modules import them unversioned, and a second URL for the same file is a
  second module instance.
- Implemented but not declared binding by the owner: under
  `prefers-reduced-motion: reduce` the scenes park their loop and hold a still
  frame; scene canvases are `aria-hidden`; both dark and light themes ship.

## Brand Commitments

- Name 최석원 · Seokwon Choi, shortened to `seok` in the page chrome. Contact
  `seok.engineer@gmail.com`, `github.com/Alfex4936`.
- Voice: plain and declarative. No adjective asserts what a number already
  proves. The page's own framing —
  "무엇을 만들었는지보다 무엇을 쟀는지 물어보세요 / Ask what I measured, not
  what I built" — is the register to match.

## Evidence on Hand

- Eleven measured numbers on the landing page, each read off a test or a
  dashboard. **Estimates are not allowed here**, confirmed binding by the owner;
  the page states this in its own words. Examples: 373→4 List calls per service
  phase evaluation at 20 shards, pinned by a regression test; 27 audit event
  types and 301 classified commands in the access-control Redis module; 4,858ms
  →1.1ms Korean profanity filtering on 10KB via double Aho-Corasick; TPS 3,548
  on Redis-backed WebSocket chat at 1,000 concurrent users.
- Assets: `resume/seokwon-resume-{ko,en}.pdf`, `portfolio/` screenshots,
  `deck-232ebf/` slides, `img/`, ten Redis visualizers under `redis/`.
- Absences future work must not fill in: no testimonials, no named customers,
  no pricing, no employer endorsement, and no benchmark beyond the ten
  already listed.
- `css/site.css` records the contrast ratio each `--faint` value was lifted to
  clear 4.5:1 per theme. Those numbers are measured too; do not regress them.

## Product Principles

1. A number read off a test or a dashboard outranks any sentence describing it.
   If there is no number, the line gets shorter, not padded.
2. Two languages, one document. Every string ships in KO and EN together.
3. Nothing internal to the employer leaves the building — generic form only.
4. Platform engineering is the claim; the measurements are what hold it up.
5. Evaluated in one page, in the reader's language, with no download required.

## Accessibility & Inclusion

Bilingual parity is the inclusion requirement the owner confirmed. Text contrast
is held at 4.5:1 or better in both themes, with the per-theme values documented
in `css/site.css`. No external conformance standard has been set as a
requirement.
