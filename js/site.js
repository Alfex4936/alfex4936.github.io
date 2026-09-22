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
  leaveRedis()
  root.dataset.theme = theme
  localStorage.setItem(KEY.theme, theme)
  reflectTheme()
  return true
}

// Hidden Redis mode: the first Redis command turns the accent Redis red and the
// prompt into redis-cli's. Session-only, never stored; exit or a theme change leaves.
let redisMode = false
let themeBefore = null
function enterRedis() {
  if (redisMode) return
  redisMode = true
  themeBefore = root.dataset.theme ?? null
  root.dataset.theme = 'redis'
  reflectTheme()
  caret.textContent = '127.0.0.1:6379>'
  input.placeholder = 'PING'
  refreshGhost()
}
function leaveRedis() {
  if (!redisMode) return false
  redisMode = false
  if (themeBefore) root.dataset.theme = themeBefore
  else delete root.dataset.theme
  reflectTheme()
  caret.textContent = '>'
  input.placeholder = '/help'
  refreshGhost()
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
const caret = form.querySelector('.composer__caret')

const go = (id) => {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
  return T(`#${id} 로 이동`, `Jumped to #${id}`)
}

// The same thirteen entries, as the space you fly through. Unlisted in /help.
const walk = () => {
  location.href = 'timeline.html'
  return T('타임라인을 공간으로 엽니다…', 'Opening the timeline as a space…')
}

const COMMANDS = {
  '/help': () =>
    T(
      '명령: /about /measurements /projects /redis /timeline /resume /lang ko|en /theme dark|light /clear … 그리고 목록에 없는 몇 개.',
      'Commands: /about /measurements /projects /redis /timeline /resume /lang ko|en /theme dark|light /clear … and a few that are not listed.',
    ),
  '/about': () => go('about'),
  '/measurements': () => go('measurements'),
  '/projects': () => go('projects'),
  '/redis': () => go('redis'),
  '/timeline': () => go('timeline'),
  '/walk': walk,
  '/resume': () => {
    window.open(`resume/seokwon-resume-${root.dataset.lang}.pdf`, '_blank', 'noopener')
    return T('이력서 PDF를 새 탭에서 엽니다', 'Opening the résumé PDF in a new tab')
  },
  '/lang': (arg) =>
    setLang(arg) ? T('한국어로 전환했습니다', 'Switched to English') : 'usage: /lang ko|en',
  '/theme': (arg) => {
    if (arg === 'redis') {
      enterRedis()
      return 'theme: redis'
    }
    return setTheme(arg) ? `theme: ${arg}` : 'usage: /theme dark|light'
  },
  '/clear': () => '',
}

let timer
function say(msg) {
  out.textContent = msg
  clearTimeout(timer)
  if (msg) timer = setTimeout(() => (out.textContent = ''), msg.includes('\n') ? 14000 : 7000)
}

// ---- hidden gems: the prompt also speaks shell and Redis ---------------------

const SINCE_LINE = '2025-09-01'
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso)) / 86400000)
const words = () => document.querySelector('.session').innerText.split(/\s+/).filter(Boolean).length

const KV = () => ({
  name: T('최석원', 'Choi Seokwon'),
  role: T('백엔드·플랫폼 엔지니어', 'Backend & Platform Engineer'),
  email: 'seok.engineer@gmail.com',
  github: 'github.com/Alfex4936',
  measurements: String(document.querySelectorAll('.row').length),
})

const REDIS = {
  PING: (a) => (a ? `"${a}"` : 'PONG'),
  ECHO: (a) => `"${a ?? ''}"`,
  GET: (k) => (KV()[k] ? `"${KV()[k]}"` : '(nil)'),
  KEYS: () => Object.keys(KV()).map((k, i) => `${i + 1}) "${k}"`).join('\n'),
  DBSIZE: () => `(integer) ${Object.keys(KV()).length}`,
  TTL: (k) => (KV()[k] ? '(integer) -1' : '(integer) -2'),
  TYPE: (k) => (KV()[k] ? 'string' : 'none'),
  SET: () => "(error) READONLY You can't write against a read only replica.",
  DEL: () => "(error) NOPERM this user has no permissions to run the 'del' command",
  FLUSHALL: () => "(error) NOPERM this user has no permissions to run the 'flushall' command",
  FLUSHDB: () => "(error) NOPERM this user has no permissions to run the 'flushdb' command",
  SELECT: () => '(error) ERR DB index is out of range',
  AUTH: () => '(error) ERR AUTH <password> called without any password configured',
  ACL: (sub) =>
    sub?.toUpperCase() === 'WHOAMI'
      ? '"visitor"'
      : sub?.toUpperCase() === 'LIST'
        ? '1) "user visitor on nopass ~* +@read -@dangerous"'
        : "(error) ERR unknown subcommand. Try ACL HELP.",
  QUIT: () => (leaveRedis() ? T('redis-cli 종료', 'redis-cli closed') : 'OK'),
  EXIT: () => REDIS.QUIT(),
  INFO: () =>
    [
      '# Server',
      'redis_version:7.2+',
      `uptime_in_days:${daysSince(SINCE_LINE)}`,
      'role:DBaaS DevOps',
      '# Clients',
      'connected_clients:1',
      '# Keyspace',
      `db0:keys=${Object.keys(KV()).length},expires=0`,
    ].join('\n'),
}

const SHELL = {
  ls: () => 'about/  measurements/  projects/  redis/  timeline/  resume.pdf',
  pwd: () => '/LINE-Plus/DBaaS-DevOps',
  whoami: () => T('visitor (저는 seok 입니다)', 'visitor (I am seok)'),
  uptime: () => `up ${daysSince(SINCE_LINE)} days since ${SINCE_LINE}, 1 user, load average: measured`,
  cat: (f) => (f?.startsWith('resume') ? COMMANDS['/resume']() : `cat: ${f ?? ''}: No such file or directory`),
  open: () => COMMANDS['/resume'](),
  echo: (...a) => a.join(' '),
  sudo: () => 'seok is not in the sudoers file. This incident will be reported.',
  vim: () => T(':q 로 나갑니다. 농담입니다, 브라우저예요.', ':q to exit. Kidding, this is a browser.'),
  vi: () => SHELL.vim(),
  nvim: () => SHELL.vim(),
  emacs: () => 'M-x butterfly',
  ':q': () => T('vim이 아닙니다. 반사신경은 존중합니다.', 'Not vim. Respect the reflex, though.'),
  ':q!': () => SHELL[':q'](),
  ':wq': () => SHELL[':q'](),
  exit: () => (leaveRedis() ? T('redis-cli 종료', 'redis-cli closed') : T('세션은 열려 있습니다. 웹페이지예요.', 'The session stays open. It is a web page.')),
  quit: () => SHELL.exit(),
  logout: () => SHELL.exit(),
  rm: (...a) => (a.join(' ').includes('/') ? "rm: it is dangerous to operate recursively on '/'" : 'rm: read-only file system'),
  git: (sub, ...rest) =>
    sub === 'log'
      ? rest.includes('--graph')
        ? walk()
        : go('timeline')
      : 'nothing to commit, working tree clean',
  clear: () => '',
  help: () => COMMANDS['/help'](),
  man: () => COMMANDS['/help'](),
}

const SPINNER = ['Brewing…', 'Pondering…', 'Cogitating…', 'Measuring…', 'Noodling…', 'Ultrathinking…']
function ultrathink() {
  let i = 0
  clearTimeout(timer)
  const tick = setInterval(() => {
    out.textContent = `✻ ${SPINNER[i++ % SPINNER.length]}`
    if (i > 7) {
      clearInterval(tick)
      say(T('결론은 같습니다. 추정이 아니라 실측.', 'Same conclusion. Measured, not guessed.'))
    }
  }, 220)
  return null
}

Object.assign(COMMANDS, {
  '/cost': () =>
    [
      'Total cost:            $0.00 (static HTML, no build)',
      `Total duration (wall): ${new Date().getFullYear() - 2012} years of side projects`,
      `Tokens on this page:   ~${words()} words`,
    ].join('\n'),
  '/model': () => 'seok-1 · human · context window: small, sleeps nightly · knowledge cutoff: none, keeps reading',
  '/status': () =>
    [
      `✓ fonts: ${[...document.fonts].some((f) => f.status === 'loaded') ? 'IBM Plex loaded' : 'system fallback'}`,
      `✓ measurements: ${document.querySelectorAll('.row').length}`,
      `✓ redis visualizers: ${document.querySelectorAll('.viz').length}`,
      `✓ lang: ${root.dataset.lang} · theme: ${root.dataset.theme ?? 'auto'}`,
    ].join('\n'),
  '/ultrathink': ultrathink,
  '/whoami': () => SHELL.whoami(),
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const [cmd, ...args] = input.value.trim().split(/\s+/)
  input.value = ''
  if (!cmd) return
  if (cmd.startsWith('/')) {
    const run = COMMANDS[cmd.toLowerCase()]
    const result = run ? run(...args) : T(`알 수 없는 명령: ${cmd}. /help 를 입력해 보세요`, `Unknown command: ${cmd}. Try /help`)
    if (result !== null) say(result)
    return
  }
  const redis = REDIS[cmd.toUpperCase()]
  if (redis) {
    if (!['QUIT', 'EXIT'].includes(cmd.toUpperCase())) enterRedis()
    return say(redis(...args))
  }
  const shell = SHELL[cmd.toLowerCase()]
  if (shell) return say(shell(...args))
  if (/^[A-Z]+$/.test(cmd) || redisMode) {
    enterRedis()
    return say(`(error) ERR unknown command '${cmd}', with args beginning with: ${args.map((a) => `'${a}'`).join(' ')}`)
  }
  say(`zsh: command not found: ${cmd}`)
})

// ---- completion, redis-cli style ------------------------------------------

const typed = form.querySelector('.composer__typed')
const completion = form.querySelector('.composer__completion')
const REDIS_SYNTAX = {
  PING: '[message]', ECHO: 'message', GET: 'key', SET: 'key value', DEL: 'key', KEYS: 'pattern',
  DBSIZE: '', TTL: 'key', TYPE: 'key', INFO: '[section]', FLUSHALL: '', FLUSHDB: '', SELECT: 'index',
  AUTH: 'password', ACL: 'LIST|WHOAMI', QUIT: '', EXIT: '',
}
const SLASH_SYNTAX = {
  '/help': '', '/about': '', '/measurements': '', '/projects': '', '/redis': '', '/timeline': '',
  '/resume': '', '/lang': 'ko|en', '/theme': 'dark|light', '/clear': '',
}

// Returns { name, rest } for the current input, or null when nothing applies.
function suggest(value) {
  if (!value) return null
  const [head, ...args] = value.split(' ')
  // Slash completes everywhere; Redis completes in Redis mode or once the caps signal it.
  let table
  if (head.startsWith('/')) table = SLASH_SYNTAX
  else if (redisMode || /^[A-Z]+$/.test(head)) table = REDIS_SYNTAX
  else return null
  const key = table === REDIS_SYNTAX ? head.toUpperCase() : head.toLowerCase()
  const name = Object.keys(table).find((k) => k.startsWith(key))
  if (!name) return null
  if (!value.includes(' ')) return { name, rest: name.slice(head.length) + (table[name] ? ' ' + table[name] : '') }
  const tokens = table[name] ? table[name].split(' ') : []
  const typedArgs = args.filter(Boolean).length
  if (key !== name || typedArgs >= tokens.length) return null
  const trailing = value.endsWith(' ') ? '' : ' '
  return { name, rest: trailing + tokens.slice(typedArgs).join(' ') }
}

function refreshGhost() {
  const s = suggest(input.value)
  typed.textContent = input.value
  completion.textContent = s ? s.rest : ''
}
input.addEventListener('input', refreshGhost)
input.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return
  const s = suggest(input.value)
  if (!s || input.value.includes(' ')) return
  event.preventDefault()
  input.value = s.name + (s.rest.includes(' ') ? ' ' : '')
  refreshGhost()
})
form.addEventListener('submit', refreshGhost)

for (const b of document.querySelectorAll('[data-cmd]'))
  b.addEventListener('click', () => {
    input.value = b.dataset.cmd
    form.requestSubmit()
  })

// "/" focuses the prompt from anywhere, as it does in the real thing. "?" lists
// the shortcuts, "t" and "l" flip theme and language.
addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const el = document.activeElement
  if (el === input || el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
  if (event.key === '/') {
    event.preventDefault()
    input.focus()
    input.value = '/'
  } else if (event.key === '?') {
    say(T('/ 입력창 · ? 단축키 · t 테마 · l 언어 · esc 이미지 닫기', '/ prompt · ? shortcuts · t theme · l language · esc close image'))
  } else if (event.key === 't') {
    setTheme((root.dataset.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'dark' ? 'light' : 'dark')
  } else if (event.key === 'l') {
    setLang(root.dataset.lang === 'ko' ? 'en' : 'ko')
  }
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
function spinSpark() {
  if (!spark || matchMedia('(prefers-reduced-motion: reduce)').matches) return
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
spinSpark()
spark?.addEventListener('click', spinSpark)

// ---- for whoever opens the console ----------------------------------------

console.log('%c✻ seok', 'color:#d97757;font:600 22px ui-monospace,monospace')
console.log(
  '%cYou opened the console. Try %cseok.measurements%c, %cseok.resume()%c, or type PING in the prompt.',
  'color:#9c9a94', 'color:#d97757', 'color:#9c9a94', 'color:#d97757', 'color:#9c9a94',
)
window.seok = {
  get measurements() {
    // innerText, not textContent: the inactive language is display:none and must not leak in.
    return [...document.querySelectorAll('.row')].map((r) => {
      const where = r.querySelector('.row__where')?.innerText.trim() ?? ''
      return {
        result: r.querySelector('.row__num').innerText.trim(),
        what: r.querySelector('.row__what').innerText.replace(where, '').trim(),
        where,
      }
    })
  },
  resume: () => COMMANDS['/resume'](),
  lang: (l) => (l ? setLang(l) : root.dataset.lang),
  theme: (t) => (t ? setTheme(t) : root.dataset.theme ?? 'auto'),
}
