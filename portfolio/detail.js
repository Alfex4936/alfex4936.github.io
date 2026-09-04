// Numbers are the point of these pages, so promote them out of the prose the
// same way the résumé does. Keeps the HTML free of presentational spans.
// KB/MB/GB precede the bare K so the longer unit wins the alternation.
const TOKEN =
  /(TPS\s*\d[\d,]*|\d[\d,]*(?:\.\d+)?\s*(?:만|천|억)?\s*(?:%|×|x|배|ms|TPS|KB|MB|GB|K|초|분|건|개|명)|\d{1,3}(?:,\d{3})+|[→↑↓])/g
const ARROW = /[→↑↓]/

function markMeasures(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (TOKEN.test(node.nodeValue)) targets.push(node)
    TOKEN.lastIndex = 0
  }

  for (const node of targets) {
    const frag = document.createDocumentFragment()
    node.nodeValue.split(TOKEN).forEach((part, i) => {
      if (i % 2 === 0) {
        if (part) frag.append(part)
        return
      }
      const span = document.createElement('span')
      span.className = ARROW.test(part) ? 'm-arrow' : 'm-num'
      span.textContent = part
      frag.append(span)
    })
    node.replaceWith(frag)
  }
}

function wireLightbox() {
  const dialog = document.querySelector('.lightbox')
  if (!dialog) return
  const image = dialog.querySelector('img')
  const caption = dialog.querySelector('.lightbox__caption')

  for (const shot of document.querySelectorAll('.shot')) {
    shot.addEventListener('click', () => {
      const img = shot.querySelector('img')
      image.src = img.dataset.full || img.src
      image.alt = img.alt
      caption.textContent = shot.querySelector('figcaption').textContent
      dialog.showModal()
    })
  }

  dialog.querySelector('.lightbox__close').addEventListener('click', () => dialog.close())
  // Backdrop click: the dialog element itself only receives the event outside its children.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
}

function wireNav() {
  const links = [...document.querySelectorAll('.rail__nav a')]
  if (!links.length) return
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]))

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        for (const a of links) a.removeAttribute('aria-current')
        byId.get(entry.target.id)?.setAttribute('aria-current', 'true')
      }
    },
    { rootMargin: '-10% 0px -75% 0px' },
  )

  for (const id of byId.keys()) {
    const section = document.getElementById(id)
    if (section) observer.observe(section)
  }
}

// Only where a number is a result. Team size and dates in the hero are facts,
// not measurements, and highlighting them dilutes the ones that matter.
for (const el of document.querySelectorAll('.lead, .wins, .reflection')) markMeasures(el)
wireLightbox()
wireNav()
