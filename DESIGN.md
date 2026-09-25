---
name: Seokwon Choi Portfolio
description: A Claude Code session rendered as a web page — mono chrome, ink prose, two signal colours.
colors:
  ink: "#141413"
  ink-raised: "#1c1b19"
  cream: "#f0eee6"
  dim: "#a3a19b"
  faint: "#817e77"
  rule: "#2b2a27"
  signal-terracotta: "#d97757"
  tool-call-green: "#4eba65"
  paper: "#f0eee6"
typography:
  display:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, IBM Plex Sans KR, monospace"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, IBM Plex Sans KR, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.7
  title:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, IBM Plex Sans KR, monospace"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.7
  body:
    fontFamily: "IBM Plex Sans KR, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, IBM Plex Sans KR, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.7
  measure:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, IBM Plex Sans KR, monospace"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.7
    fontFeature: "tabular-nums"
rounded:
  none: "0"
  hairline: "2px"
  chip: "3px"
  thumb: "4px"
  panel: "6px"
  sheet: "10px 10px 0 0"
spacing:
  xs: "4px"
  sm: "6px"
  md: "12px"
  lg: "18px"
  gutter: "24px"
  turn: "46px"
components:
  bar-control:
    textColor: "{colors.dim}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  bar-control-active:
    textColor: "{colors.cream}"
    backgroundColor: "{colors.ink-raised}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  composer-line:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    typography: "{typography.headline}"
    rounded: "{rounded.panel}"
    padding: "8px 12px"
  welcome-panel:
    rounded: "{rounded.panel}"
    padding: "14px 18px 16px"
  timeline-thumb:
    backgroundColor: "{colors.ink-raised}"
    rounded: "{rounded.thumb}"
    width: "112px"
  timeline-mark:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.thumb}"
    width: "112px"
    padding: "11.9% 19%"
  command-link:
    typography: "{typography.label}"
    textColor: "{colors.cream}"
---

# Design System: Seokwon Choi Portfolio

## Overview

**Creative North Star: "The Session Transcript"**

The page is one session with an agent, read top to bottom. Each section opens
with the question a reader would have asked — `자기소개 / who are you`,
`무엇을 쟀나 / what have you measured` — set as a prompt line. Under it comes a
tool call (`Read(measurements.md)`, `Glob(projects/**)`), and under that the
output, hung off a `⎿` gutter. Nothing on the page pretends to be a brochure.
The structure is the argument: a claim is worth what the tool call under it
returned.

The temperament is quiet and precise. Monospace carries the chrome, so the page
reads as instrument rather than advertisement, and the restraint is what makes
the two signal colours land: a reader who has scrolled past forty lines of ink
notices terracotta immediately. Density is deliberate — a 760px measure, 46px
between turns, and a 1.7 line-height throughout — because the page is read once,
carefully, by someone deciding whether to make a call.

Three WebGL scenes sit behind the page and never in front of it. They load only
when a mount nears the viewport, hold a still frame under
`prefers-reduced-motion`, and are `aria-hidden` throughout. Atmosphere is
allowed; interference is not.

**Key Characteristics:**
- Mono for chrome, sans for prose, never the reverse
- Two signal colours, each with exactly one job
- Flat by default; shadow means "this left the page"
- Every string present in both Korean and English, one hidden by CSS
- Small radii (2–6px); nothing is a pill, nothing is square by accident

## Colors

A warm near-black ground with cream text, and two accents held in reserve so
that seeing one means something.

### Primary
- **Signal Terracotta** (#d97757; #b25936 on light): the page's only attention
  colour. It appears on the spinning `✻` spark, on measured numbers, on the
  composer caret, on link and focus states, and on the border a control reveals
  when hovered. It marks nothing decorative.

### Secondary
- **Tool-Call Green** (#4eba65; #2c7a39 on light): reserved entirely for the
  name of a tool call — `Read`, `Glob`, `Search`, `Bash`. It never appears on
  prose, links, or controls, so its presence identifies a line's kind before
  the word is read.

### Neutral
- **Ink** (#141413): the ground. Warm, not pure black.
- **Ink Raised** (#1c1b19): the one step up — control backgrounds, thumb plates.
- **Cream** (#f0eee6): body text on dark, and the ground on light.
- **Dim** (#a3a19b): secondary text — tool arguments, output lines, metadata.
- **Faint** (#817e77): the `⎿` gutter glyphs, stack labels, placeholders, hints.
- **Rule** (#2b2a27): hairlines and dividers.
- **Paper** (#f0eee6): the plate a logo sits on, whichever theme is up.

Three themes ship: dark (default), light, and a hidden `redis` theme on Redis
midnight (#091a23) with Redis red (#ff4438), entered by typing a Redis command
into the composer.

### Named Rules

**The Two-Signal Rule.** Terracotta means "a human should look here"; green
means "this line is a tool call". Nothing else in the system is allowed a
colour. A third accent would cost both of them their meaning.

**The Contrast Floor Rule.** `--faint` carries real text — the cwd and loc
lines, the IPA line, stack labels, the composer placeholder — so each theme's
value is the minimum lift that clears 4.5:1 on that theme's own background. It
was 3.12:1 on dark and 2.54:1 on light before being raised. Never darken a
neutral without re-checking it.

## Typography

**Display / Chrome Font:** IBM Plex Mono (falling back through ui-monospace,
SFMono-Regular, Menlo)
**Body Font:** IBM Plex Sans KR (falling back through -apple-system, Apple SD
Gothic Neo)

**Character:** Mono is the terminal furniture — prompts, tool lines, numbers,
dates, the input. Prose reads in the sans, which keeps Korean and English on
the same footing. The pairing is what sells the session conceit without a
single skeuomorphic touch.

### Hierarchy
- **Display** (600, 26px, 1.25, −0.01em): the name block, once per page.
- **Headline** (500, 14px, 1.7, mono): the section prompt — the question posed
  as an `h2`. Small on purpose; it is a line of dialogue, not a banner.
- **Title** (600, 16px, 1.7): project names.
- **Body** (400, 15px, 1.7, sans): all prose, inside a 760px measure.
- **Measure** (600, 13.5px, tabular-nums, mono): the measured numbers.
- **Label** (400, 12px, 1.7, mono, dim or faint): dates, stack lines, where-tags,
  hints, bar controls.

### Named Rules

**The Mono-First Rule.** Mono is chrome; the sans is for reading. The mono
stack lists IBM Plex Sans KR before `monospace` on purpose: Plex Mono has no
Hangul, and without that entry every Korean word in a mono run would fall to a
different face mid-line.

**The Tabular Rule.** Anything a reader might compare down a column —
measurements, years, page counts, zoom percentages — carries
`font-variant-numeric: tabular-nums`.

## Layout

A single 760px column, centred, `40px 24px 170px` of padding — the deep bottom
reserve clears the fixed composer. Sections ("turns") are separated by 46px,
dropping to 38px under 720px.

Output blocks share one gutter: `padding-left: 4ch` with a `⎿` glyph absolutely
placed at `left: 2ch`. Measurement rows are a `140px / 1fr` grid on a baseline;
timeline entries are `84px / 112px / 1fr`, with text pinned to the third column
so entries without a picture still line up.

Two breakpoints only: 900px drops the hero city scene, 720px collapses every
multi-column grid to a single column and lets thumbnails go full width to a
320px cap.

**The Own-Column Rule.** A timeline or ledger row's text always occupies its
own grid column rather than flowing around an image, so a missing picture
leaves alignment untouched.

## Elevation & Depth

Flat by default. Within the page there are no shadows at all: depth comes from
one tonal step (`ink` to `ink-raised`) and from hairline rules. Every shadow in
the system belongs to something that has left the page — the résumé reader
overlay, its page sheets, and its floating dock.

### Shadow Vocabulary
- **Overlay lift** (`box-shadow: 0 -18px 60px -30px rgb(0 0 0 / 0.55)`): the
  reader dialog rising from the bottom edge.
- **Sheet edge** (`box-shadow: inset 0 0 0 1px var(--rule)`): a PDF page slot
  before it has rendered.
- **Printed sheet** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.16), 0 16px 36px -20px rgb(0 0 0 / 0.55)`):
  the same slot once a page has painted, so paper reads as paper.
- **Floating control** (`box-shadow: 0 12px 30px -16px rgb(0 0 0 / 0.5)`): the
  zoom dock hovering over the pages.

### Named Rules

**The Flat-By-Default Rule.** A shadow is a statement that an element is not
part of the document. If it scrolls with the page, it gets a rule or a tonal
step, never a shadow.

## Shapes

Small radii, used as a scale rather than a style: 2px on focus rings, 3px on
bar controls, 4px on thumbnails, 6px on panels and the composer, and
`10px 10px 0 0` on the reader sheet that slides up from the bottom. Nothing is
fully rounded and nothing is deliberately sharp-cornered.

Borders are always exactly 1px in `rule`, and most of them are invisible until
needed — controls carry `1px solid transparent` at rest so that revealing a
border on hover costs no layout shift.

## Components

### Buttons
- **Shape:** barely rounded (3px), no fill at rest.
- **Default:** `dim` text, `1px solid transparent`, `2px 8px` padding.
- **Hover:** text lifts to `cream`; the transition runs 0.15s on colour, border
  and background together.
- **Pressed / active** (`aria-pressed="true"`): `cream` text, `rule` border,
  `ink-raised` fill — the only state that fills.
- **Command links** (`/projects`, `/redis`): underlined in `faint`, 3px
  underline offset, both text and underline going terracotta on hover.

### Cards / Containers
- **Corner Style:** 6px on panels.
- **Background:** transparent. The welcome panel is a `1px solid` terracotta
  outline with no fill at all — the only place the accent draws a border.
- **Shadow Strategy:** none; see Elevation.
- **Internal Padding:** `14px 18px 16px`.
- Project entries are not boxed at all. They are separated by the `⎿` gutter,
  18px of rhythm, and a baseline-aligned head row.

### Inputs / Fields
- **Style:** the composer is a fixed bar over a blurred `color-mix` of the
  background (92% ground, `backdrop-filter: blur(8px)`). The field itself has
  no box, no padding and no outline — only a caret in terracotta inside a 6px
  `rule` line.
- **Focus:** the enclosing line shifts its border from `rule` to `dim`. The
  input never draws its own focus ring.
- **Ghost completion:** the inline suggestion renders in `faint` behind the
  typed text, which is held `visibility: hidden` to keep the two in register.

### Navigation
- A sticky top bar, 12px mono, `dim`, over a `color-mix` background, holding the
  language and theme toggles as bar controls. It never grows a shadow on scroll.

### Timeline Marks
The signature component. Timeline entries take a 112px thumbnail in the second
column — screenshots crop to a 16/10 box with `object-fit: cover`, but an
institution's logo is treated as a *mark* instead: `object-fit: contain`, a
`paper` plate underneath, and padding that leaves the logo at 62% of its plate.
The same 62% figure governs the marks in the WebGL timeline scene.

**The Clear-Space Rule.** A logo never bleeds and never crops. It sits on paper
whichever theme is up, at 62% of its plate, because the air around a wordmark is
part of the wordmark.

### Focus
Global `:focus-visible` is a `2px solid` terracotta outline at `2px` offset with
a 2px radius. It is never removed, only overridden where an inset ring reads
better (the reader's scroll region uses a 1px `dim` inset outline).

## Do's and Don'ts

### Do:
- **Do** spend terracotta on the spark, measured numbers, the caret, and
  interaction states — and nothing else.
- **Do** set every numeric run in mono with `tabular-nums`.
- **Do** write both the Korean and the English string into the markup and let
  `[data-lang]` hide the inactive one. Nothing re-renders on a language change.
- **Do** keep new colours out of the token set; compose from the nine that exist.
- **Do** check a new neutral against 4.5:1 on each theme's own background before
  shipping it.
- **Do** bump the `?v=N` in every page that links a changed asset. The
  pre-commit hook runs `scripts/check-versions.mjs`, which fails on a stale or
  mismatched version and bumps them with `--fix`.

### Don't:
- **Don't** add a shadow to anything that scrolls with the document.
- **Don't** put prose in the mono face or chrome in the sans.
- **Don't** let a WebGL scene animate under `prefers-reduced-motion`, take focus,
  or drop its `aria-hidden`.
- **Don't** crop or bleed an institution's logo; it is a mark, not a screenshot.
- **Don't** introduce a third accent colour. Two signals is the whole system.
- **Don't** ship a string in one language only.
