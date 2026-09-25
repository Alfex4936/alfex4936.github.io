# Working on this site

Hand-written HTML, CSS and vanilla ES modules. No framework, no bundler, no
build step, no `package.json`. `PRODUCT.md` holds the product truth and
`DESIGN.md` the visual system; read `DESIGN.md` before changing anything that
renders.

## In a fresh clone, do this first

```bash
git config core.hooksPath .githooks
```

Without it the pre-commit hook does not exist and the `?v=` guard below never
runs. Git does not carry hook configuration across a clone.

## Before you push anything that renders

```bash
node scripts/check-versions.mjs     # instant
node scripts/scene-check.mjs        # ~30s, launches Chrome
```

Both are zero-dependency Node scripts. Override the browser with
`CHROME_PATH=… node scripts/scene-check.mjs`.

## Two things that have actually broken

**The `?v=N` cache-bust is manual, and forgetting it ships a broken page.**
`css/site.css` once changed while every page still linked `?v=15`, so warm
caches paired new markup with the old stylesheet and the timeline logos
rendered full-width and cropped. `check-versions.mjs` fails on that, and on the
same asset being referenced at two different versions in two files — which for
an ES module means two module records and two instantiations. `--fix` bumps
them. The pre-commit hook runs it; `git commit --no-verify` is the escape
hatch.

**Headless Chrome has no GPU, so a scene check without SwiftShader passes on a
page that never rendered.** Every scene factory throws when there is no WebGL
context, `scene-core.js` catches that and sets `data-scene="unavailable"`, and
the page still looks fine to a script that only reads the DOM. `scene-check.mjs`
passes `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` and
asserts `data-scene === "ready"` with a sized canvas, so an unmounted scene is
a failure rather than a silent pass.

`scene-check.mjs` also carries two regression tests. One sweeps the pointer
across the terrain bars and fails if any visible label is painted inside the
callout's rect. The other opens the résumé reader — Product Principle #5 is
that the résumé is read in place with no download — and asserts both pages
actually painted, not merely that slots exist: `is-printed` is only set once a
page has rendered, so an empty reader would pass without it.

## Shared modules carry no version on purpose

`js/scene-core.js` and `js/timeline-data.js` are imported unversioned by the
scene modules. A `?v=` on them in a page would be a second URL for the same
file, so the browser would fetch and instantiate them twice. Version the entry
modules, not the shared leaves.
