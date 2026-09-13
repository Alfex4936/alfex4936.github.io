// Session controls: language, theme, the command line at the bottom, and the
// spark that spins on load the way Claude Code's spinner does.
const root = document.documentElement
const KEY = { lang: 'portfolio:lang', theme: 'portfolio:theme' }
const T = (ko, en) => (root.dataset.lang === 'ko' ? ko : en)

function setLang(lang) {
  if (lang !== 'ko' && lang !== 'en') return false
  root.dataset.lang = lang
  root.lang = lang
  localStorage.setItem(KEY.lang, lang)
  for (const b of document.querySelectorAll('[data-lang-set]'))
    b.setAttribute('aria-pressed', String(b.dataset.langSet === lang))
  return true
}

function reflectTheme() {
  const t =
    root.dataset.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  for (const b of document.querySelectorAll('[data-theme-set]'))
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === t))
}

function setTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') return false
  root.dataset.theme = theme
  localStorage.setItem(KEY.theme, theme)
  reflectTheme()
  return true
}

setLang(root.dataset.lang)
reflectTheme()
matchMedia('(prefers-color-scheme: light)').addEventListener('change', reflectTheme)
for (const b of document.querySelectorAll('[data-lang-set]'))
  b.addEventListener('click', () => setLang(b.dataset.langSet))
for (const b of document.querySelectorAll('[data-theme-set]'))
  b.addEventListener('click', () => setTheme(b.dataset.themeSet))

// ---- command line --------------------------------------------------------

const form = document.querySelector('.composer')
const input = form.querySelector('input')
const out = form.querySelector('.composer__out')

const go = (id) => {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
  return T(`#${id} 로 이동`, `Jumped to #${id}`)
}

const COMMANDS = {
  '/help': () =>
    T(
      '명령: /about /measurements /projects /redis /timeline /resume /lang ko|en /theme dark|light /clear',
      'Commands: /about /measurements /projects /redis /timeline /resume /lang ko|en /theme dark|light /clear',
    ),
  '/about': () => go('about'),
  '/measurements': () => go('measurements'),
  '/projects': () => go('projects'),
  '/redis': () => go('redis'),
  '/timeline': () => go('timeline'),
  '/resume': () => {
    window.open(`resume/seokwon-resume-${root.dataset.lang}.pdf`, '_blank', 'noopener')
    return T('이력서 PDF를 새 탭에서 엽니다', 'Opening the résumé PDF in a new tab')
  },
  '/lang': (arg) =>
    setLang(arg) ? T('한국어로 전환했습니다', 'Switched to English') : 'usage: /lang ko|en',
  '/theme': (arg) => (setTheme(arg) ? `theme: ${arg}` : 'usage: /theme dark|light'),
  '/clear': () => '',
}

let timer
function say(msg) {
  out.textContent = msg
  clearTimeout(timer)
  if (msg) timer = setTimeout(() => (out.textContent = ''), 7000)
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const [cmd, arg] = input.value.trim().split(/\s+/)
  input.value = ''
  if (!cmd) return
  const run = COMMANDS[cmd.toLowerCase()]
  if (run) return say(run(arg))
  say(
    cmd.startsWith('/')
      ? T(`알 수 없는 명령: ${cmd}. /help 를 입력해 보세요`, `Unknown command: ${cmd}. Try /help`)
      : T(
          '여기서는 슬래시 명령만 받습니다. 사람에게는 메일이 빠릅니다: seok.engineer@gmail.com',
          'Slash commands only here. For a human, email is faster: seok.engineer@gmail.com',
        ),
  )
})

for (const b of document.querySelectorAll('[data-cmd]'))
  b.addEventListener('click', () => {
    input.value = b.dataset.cmd
    form.requestSubmit()
  })

// "/" focuses the prompt from anywhere, as it does in the real thing.
addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
  const el = document.activeElement
  if (el === input || el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
  event.preventDefault()
  input.focus()
  input.value = '/'
})

// ---- lightbox ---------------------------------------------------------------

const lightbox = document.querySelector('.lightbox')
const lbImg = lightbox.querySelector('img')
const lbCaption = lightbox.querySelector('.lightbox__caption')
for (const thumb of document.querySelectorAll('.tl__thumb'))
  thumb.addEventListener('click', () => {
    const img = thumb.querySelector('img')
    lbImg.src = img.src
    lbImg.alt = img.alt
    lbCaption.textContent = `[Image] ${img.alt}`
    lightbox.showModal()
  })
lightbox.querySelector('.lightbox__close').addEventListener('click', () => lightbox.close())
// Backdrop click: the dialog itself is the target only outside its children.
lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox) lightbox.close()
})

// ---- spark ----------------------------------------------------------------

const spark = document.querySelector('.spark')
if (spark && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const glyphs = ['✢', '✳', '✶', '✻', '✽']
  let i = 0
  const spin = setInterval(() => {
    i += 1
    spark.textContent = glyphs[i % glyphs.length]
    if (i >= glyphs.length * 3 + 3) {
      clearInterval(spin)
      spark.textContent = '✻'
    }
  }, 120)
}
