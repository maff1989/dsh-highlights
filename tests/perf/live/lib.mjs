// Shared harness helpers for the dsh-highlights perf matrix (perf-matrix, task-8).
// Reuses the raw-CDP driver from ../../perf-repro/cdp.mjs. Drives a SECOND
// headless Chromium client (CDP 9225, own profile) against the live GUI.
// READ-ONLY with respect to the shared highlights store: every measured
// action is navigation/render/selection or a client-local DOM mutation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, pageTarget } from './cdp.mjs'

export const HERE = new URL('./', import.meta.url)
export const ART = process.env.ART_DIR ?? fileURLToPath(HERE)
mkdirSync(ART, { recursive: true })
export const GUI = process.env.GUI_URL ?? 'http://172.16.2.20:3080/'

export const outPath = name => resolve(ART, name)
export const writeJson = (name, value) => {
  const path = outPath(name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
  return path
}
export const readJson = name => JSON.parse(readFileSync(outPath(name), 'utf8'))

export function cookiePair() {
  const line = readFileSync(resolve(ART, 'cookie.txt'), 'utf8').split('\n').find(l => l.includes('dsh-auth-'))
  const parts = line.split('\t')
  return { name: parts[5], value: parts[6] }
}

// ---------------------------------------------------------------------------
// In-page instrumentation, injected before any app script. Everything is
// namespaced under window.__m (matrix) to stay clear of the perf-repro names.
// ---------------------------------------------------------------------------
export const INSTRUMENT = String.raw`
(() => {
  const M = window.__m = {
    lt: [],              // long tasks >50ms
    frames: [],          // rAF timestamps
    geom: [],            // wrapped geometry calls with caller class
    marks: [],           // caller marks/timings (plugin vs dsh)
    mutations: [],       // MutationObserver batch summaries
    sel: [],             // selectionchange events
    registryWrites: [],
    renders: {},         // named render counters (observed DOM transitions)
    counters: {},        // generic counters
    errors: [],
    t0: performance.now(),
  }
  const limit = (arr, n) => { if (arr.length > n) arr.splice(0, arr.length - n) }

  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        M.lt.push({ start: Math.round(e.startTime), dur: Math.round(e.duration * 10) / 10, name: e.name })
      }
      limit(M.lt, 5000)
    }).observe({ type: 'longtask', buffered: true })
  } catch {}

  M.events = []
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        M.counters['event:' + e.name] = (M.counters['event:' + e.name] || 0) + 1
        M.counters['eventLast:' + e.name] = Math.round(e.duration * 10) / 10
        M.events.push({ name: e.name, start: Math.round(e.startTime), dur: Math.round(e.duration * 10) / 10, proc: Math.round((e.processingEnd - e.processingStart) * 10) / 10 })
        if (M.events.length > 2000) M.events.splice(0, M.events.length - 2000)
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  } catch {}

  M.boxTimeline = []
  let lastBoxes = -1
  let lastBands = -1
  const rafTick = t => {
    M.frames.push(Math.round(t))
    limit(M.frames, 8000)
    try {
      const boxes = document.querySelectorAll('.dshhl-highlight-box').length
      const bands = document.querySelectorAll('.dshhl-message-band').length
      if (boxes !== lastBoxes || bands !== lastBands) {
        M.boxTimeline.push({ t: Math.round(performance.now()), boxes, bands })
        limit(M.boxTimeline, 4000)
        lastBoxes = boxes
        lastBands = bands
      }
    } catch (e) { M.errors.push(String(e)) }
    requestAnimationFrame(rafTick)
  }
  requestAnimationFrame(rafTick)

  // Wrapped geometry with caller classification. Plugin frames first.
  const frameOf = line => line.trim().replace(/^at\s+/, '')
  const classify = frames => {
    const j = frames.join(' | ')
    if (/boxesOf/.test(j)) return 'plugin:boxesOf'
    if (/HighlightOverlay|ensureLayer|renderBand|writeStyle/.test(j)) return 'plugin:overlay'
    if (/scrollRangeIntoView|revealRecord|resolveAnchor|boxesForRange/.test(j)) return 'plugin:reveal'
    if (/SelectionAffordance|capturePosition|selectionBounds|selectionchange/.test(j)) return 'plugin:selection'
    if (/SessionBridge|aria-hidden|syncAria/.test(j)) return 'plugin:bridge'
    if (/dshhl/.test(j)) return 'plugin:other'
    if (/dsh-client|@deepseek|React|chat|conversation/i.test(j)) return 'dsh'
    return 'other'
  }
  const record = (kind, dur, stack) => {
    if (M.geom.length > 120000) return
    const frames = stack === undefined ? [] : stack.split('\n').slice(2, 7).map(frameOf)
    M.geom.push({ k: kind, d: Math.round(dur * 100) / 100, c: classify(frames), s: frames.slice(0, 3).join(' <- '), t: Math.round(performance.now()) })
  }
  const wrap = (proto, name, kind) => {
    const orig = proto[name]
    if (typeof orig !== 'function') return
    proto[name] = function (...args) {
      const s = performance.now()
      try { return orig.apply(this, args) } finally { record(kind, performance.now() - s, new Error().stack) }
    }
  }
  if (typeof Range !== 'undefined') {
    wrap(Range.prototype, 'getClientRects', 'range.getClientRects')
    wrap(Range.prototype, 'getBoundingClientRect', 'range.getBoundingClientRect')
  }
  if (typeof Element !== 'undefined') wrap(Element.prototype, 'getBoundingClientRect', 'element.getBoundingClientRect')
  if (typeof Element !== 'undefined') {
    wrap(Element.prototype, 'getClientRects', 'element.getClientRects')
    wrap(Element.prototype, 'getBoundingClientRect', 'element.getBoundingClientRect')
  }
  if (typeof Document !== 'undefined') {
    for (const n of ['elementFromPoint', 'elementsFromPoint']) {
      const o = Document.prototype[n]
      if (typeof o === 'function') Document.prototype[n] = function (...a) { const s = performance.now(); try { return o.apply(this, a) } finally { record(n, performance.now() - s, new Error().stack) } }
    }
  }

  // Scroll writes.
  M.scrolls = []
  const wrapScroll = (proto, name) => {
    const o = proto[name]
    if (typeof o !== 'function') return
    proto[name] = function (...a) { try { M.scrolls.push({ k: name, t: Math.round(performance.now()), s: new Error().stack.split('\n').slice(2, 5).join(' <- ') }) } catch {} ; return o.apply(this, a) }
  }
  wrapScroll(Element.prototype, 'scrollTo')
  wrapScroll(Element.prototype, 'scrollIntoView')
  const wrapSetter = (proto, name) => {
    const d = Object.getOwnPropertyDescriptor(proto, name)
    if (d === undefined || d.set === undefined) return
    Object.defineProperty(proto, name, { configurable: true, get: d.get, set(v) { try { M.counters['set:' + name] = (M.counters['set:' + name] || 0) + 1 } catch {} ; return d.set.call(this, v) } })
  }
  wrapSetter(Element.prototype, 'scrollTop')
  wrapSetter(Element.prototype, 'innerHTML')

  // CSS.highlights registry writes (plugin paint channel).
  try {
    const P = Object.getPrototypeOf(CSS.highlights)
    for (const n of ['set', 'delete', 'clear']) {
      const o = P[n]
      if (typeof o !== 'function') continue
      P[n] = function (...a) { try { M.registryWrites.push({ op: n, name: String(a[0] ?? ''), t: Math.round(performance.now()) }) } catch {} ; return o.apply(this, a) }
    }
  } catch {}

  // Keyboard -> composer commit latency probe (page clock, no CDP round trips).
  M.keys = []
  M.composerEdits = []
  try {
    document.addEventListener('keydown', event => {
      M.keys.push({ t: Math.round(performance.now() * 10) / 10, key: event.key })
      limit(M.keys, 500)
    }, true)
    document.addEventListener('input', event => {
      const target = event.target
      const seat = target instanceof Element ? target.closest('[data-composer-seat]') : null
      if (seat !== null) {
        M.composerEdits.push({ t: Math.round(performance.now() * 10) / 10, len: (seat.textContent || '').length })
        limit(M.composerEdits, 500)
      }
    }, true)
  } catch (e) { M.errors.push(String(e)) }

  // MutationObserver: batched, cheap summary. mut = childList; attr = attributes.
  try {
    M.mo = new MutationObserver(records => {
      let added = 0, removed = 0, attrs = 0
      for (const r of records) {
        added += r.addedNodes.length
        removed += r.removedNodes.length
        if (r.type === 'attributes') attrs += 1
      }
      M.mutations.push({ t: Math.round(performance.now()), added, removed, attrs, n: records.length })
      limit(M.mutations, 8000)
    })
    M.mo.observe(document.documentElement ?? document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden', 'aria-selected', 'open', 'data-state'] })
  } catch (e) { M.errors.push(String(e)) }

  // selectionchange events (document-level; plugin listens too).
  try {
    document.addEventListener('selectionchange', () => { M.sel.push({ t: Math.round(performance.now()) }); limit(M.sel, 2000) }, true)
  } catch {}

  window.addEventListener('error', e => M.errors.push(String(e.message)))
  return true
})()
`

export async function boot({ instrument = true, settleMs = 2500, port = 9225 } = {}) {
  const cookie = cookiePair()
  const cdp = await connect(await pageTarget(port))
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.enable')
  if (instrument) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })
  await cdp.send('Network.setCookie', { name: cookie.name, value: cookie.value, domain: '172.16.2.20', path: '/', httpOnly: true })
  const t0 = Date.now()
  await cdp.send('Page.navigate', { url: GUI })
  await cdp.waitFor('document.readyState === "complete"', 30000, 'load')
  await cdp.waitFor('document.querySelector("[data-conversation-scroll]") !== null', 30000, 'app boot')
  const domInteractiveMs = Date.now() - t0
  await cdp.sleep(settleMs)
  return { cdp, domInteractiveMs }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const evaluate = (cdp, expression) => cdp.evaluate(expression)

// ---------------------------------------------------------------------------
// Metric / DOM / timing helpers
// ---------------------------------------------------------------------------
export async function metricsRaw(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map(m => [m.name, m.value]))
}
const METRIC_KEYS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount', 'Nodes', 'JSEventListeners', 'JSHeapUsedSize', 'Documents', 'Timestamp']
export function metricDelta(before, after) {
  const out = {}
  for (const k of METRIC_KEYS) out[k] = Number(((after[k] ?? 0) - (before[k] ?? 0)).toFixed(4))
  out.layoutMs = Number((out.LayoutDuration * 1000).toFixed(2))
  out.recalcStyleMs = Number((out.RecalcStyleDuration * 1000).toFixed(2))
  out.scriptMs = Number((out.ScriptDuration * 1000).toFixed(2))
  out.taskMs = Number((out.TaskDuration * 1000).toFixed(2))
  out.layoutMs = Number((out.LayoutDuration * 1000).toFixed(2))
  out.recalcStyleMs = Number((out.RecalcStyleDuration * 1000).toFixed(2))
  out.scriptMs = Number((out.ScriptDuration * 1000).toFixed(2))
  out.taskMs = Number((out.TaskDuration * 1000).toFixed(2))
  return out
}
export async function metricsSnapshot(cdp, { gc = true } = {}) {
  if (gc) { try { await cdp.send('HeapProfiler.collectGarbage') } catch {} }
  const raw = await metricsRaw(cdp)
  return {
    nodes: raw.Nodes,
    documents: raw.Documents,
    listeners: raw.JSEventListeners,
    heapMB: Number((raw.JSHeapUsedSize / 1048576).toFixed(2)),
    layouts: raw.LayoutCount,
    recalcStyle: raw.RecalcStyleCount,
    layoutMs: Number(((raw.LayoutDuration ?? 0) * 1000).toFixed(1)),
    scriptMs: Number(((raw.ScriptDuration ?? 0) * 1000).toFixed(1)),
    taskMs: Number(((raw.TaskDuration ?? 0) * 1000).toFixed(1)),
  }
}

// Clear instrumentation buffers; returns the mark time (page clock).
export async function clearBuffers(cdp) {
  return cdp.evaluate(`(() => {
    const M = window.__m
    M.lt.length = 0; M.frames.length = 0; M.geom.length = 0; M.marks.length = 0
    M.mutations.length = 0; M.sel.length = 0; M.registryWrites.length = 0
    M.scrolls.length = 0; M.counters = {}; M.renders = {}
    M.keyCount = M.keys.length
    M.t0 = performance.now()
    return M.t0
  })()`)
}

export async function readBuffers(cdp) {
  return cdp.evaluate(`(() => {
    const M = window.__m
    return {
      t0: M.t0, now: performance.now(),
      lt: M.lt.slice(), frames: M.frames.slice(), geom: M.geom.slice(),
      marks: M.marks.slice(), mutations: M.mutations.slice(), sel: M.sel.slice(),
      registryWrites: M.registryWrites.slice(), scrolls: M.scrolls.slice(),
      events: M.events.slice(), boxTimeline: M.boxTimeline.slice(),
      counters: M.counters, renders: M.renders, errors: M.errors.slice(0, 20),
    }
  })()`)
}

/** Wait for quiet: no long task and no DOM mutation for `quiet` ms. Returns elapsed. */
export async function waitQuiet(cdp, { quiet = 600, max = 15000, poll = 60 } = {}) {
  const started = Date.now()
  let lastActivity = started
  let lastMark = 0
  for (;;) {
    const state = await cdp.evaluate(`(() => {
      const M = window.__m
      const lastLt = M.lt.length === 0 ? 0 : Math.max(...M.lt.map(e => e.start + e.dur))
      const lastMut = M.mutations.length === 0 ? 0 : M.mutations.at(-1).t
      return { now: performance.now(), lastLt, lastMut }
    })()`)
    const activityNow = Math.max(state.lastLt, state.lastMut)
    if (activityNow > lastMark) { lastMark = activityNow; lastActivity = Date.now() }
    if (Date.now() - lastActivity >= quiet) return { settled: Date.now() - started, quiet, timedOut: false }
    if (Date.now() - started > max) return { settled: Date.now() - started, quiet, timedOut: true }
    await sleep(poll)
  }
}

/** Summarize a measured window into the matrix row shape. */
export function summarizeWindow(buf, wallMs, extra = {}) {
  const mark = Math.round(buf.t0)
  const lt = buf.lt.map(e => ({ start: e.start - mark, dur: e.dur }))
  const frames = buf.frames
  const gaps = []
  for (let i = 1; i < frames.length; i += 1) gaps.push(frames[i] - frames[i - 1])
  const sorted = [...gaps].sort((a, b) => b - a)
  const geomByClass = {}
  const geomByKind = {}
  for (const c of buf.geom) {
    const b = geomByClass[c.c] ?? (geomByClass[c.c] = { count: 0, totalMs: 0, maxMs: 0 })
    b.count += 1; b.totalMs += c.d; b.maxMs = Math.max(b.maxMs, c.d)
    const k = geomByKind[c.k] ?? (geomByKind[c.k] = { count: 0, totalMs: 0, maxMs: 0, caller: c.s })
    k.count += 1; k.totalMs += c.d; k.maxMs = Math.max(k.maxMs, c.d)
  }
  for (const b of Object.values(geomByClass)) { b.totalMs = Number(b.totalMs.toFixed(2)); b.maxMs = Number(b.maxMs.toFixed(2)) }
  for (const b of Object.values(geomByKind)) { b.totalMs = Number(b.totalMs.toFixed(2)); b.maxMs = Number(b.maxMs.toFixed(2)) }
  const pluginMs = Object.entries(geomByClass).filter(([k]) => k.startsWith('plugin:')).reduce((s, [, v]) => s + v.totalMs, 0)
  const muts = buf.mutations
  const added = muts.reduce((s, m) => s + m.added, 0)
  const removed = muts.reduce((s, m) => s + m.removed, 0)
  const attrs = muts.reduce((s, m) => s + m.attrs, 0)
  return {
    wallMs: Math.round(wallMs),
    longTaskCount: lt.length,
    longTaskTotalMs: Number(lt.reduce((s, e) => s + e.dur, 0).toFixed(1)),
    longestTaskMs: Number((lt.length === 0 ? 0 : Math.max(...lt.map(e => e.dur))).toFixed(1)),
    longTasks: lt.slice(0, 40),
    geomCalls: buf.geom.length,
    geomMs: Number(buf.geom.reduce((s, c) => s + c.d, 0).toFixed(2)),
    pluginGeomMs: Number(pluginMs.toFixed(2)),
    geomByClass,
    geomByKind,
    mutationBatches: muts.length,
    domAdded: added,
    domRemoved: removed,
    attrMutations: attrs,
    frames: frames.length,
    maxFrameGapMs: sorted[0] ?? null,
    p95FrameGapMs: sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.05))],
    gapsOver100: gaps.filter(g => g > 100).length,
    registryWrites: buf.registryWrites.length,
    scrollWrites: buf.scrolls.length,
    selectionEvents: buf.sel.length,
    counters: buf.counters,
    renders: buf.renders,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// DOM helpers / surface navigation (all read-only w.r.t. the shared store)
// ---------------------------------------------------------------------------
export const clickByLabel = (cdp, label, selector = 'button') => cdp.evaluate(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === ${JSON.stringify(label)})
  if (!el) return false
  el.click()
  return true
})()`)

/** Navigate to the global Highlights page via the sidebar nav row (not the right panel). */
export async function ensureHighlightsPage(cdp) {
  const rows = await cdp.evaluate(`document.querySelectorAll('article.dshhl-row').length`)
  if (rows > 0) return rows
  const clicked = await cdp.evaluate(`(() => {
    const cands = [...document.querySelectorAll('button')].filter(b => (b.getAttribute('aria-label') || '').trim() === 'Highlights')
    const nav = cands.find(b => /panelRow/u.test(typeof b.className === 'string' ? b.className : ''))
      ?? cands.find(b => b.closest('[role="tablist"]') === null && b.closest('.dshhl-panel') === null)
    if (nav === undefined) return false
    nav.click(); return true
  })()`)
  if (!clicked) throw new Error('no sidebar Highlights nav row')
  await cdp.waitFor('document.querySelectorAll("article.dshhl-row").length > 0', 20000, 'page rows')
  await sleep(500)
  return cdp.evaluate(`document.querySelectorAll('article.dshhl-row').length`)
}

/** Make sure the conversation surface is mounted (leave the page if needed). */
export async function ensureConversation(cdp) {
  const has = await cdp.evaluate(`document.querySelector('[data-conversation-session]') !== null`)
  if (has) return true
  // Global page has a session row: use its "Show session highlights"?? No — that
  // would open panel. Instead use the page row's session title click if present;
  // fall back to sidebar session list.  Read-only navigation only.
  const ok = await cdp.evaluate(`(() => {
    const back = [...document.querySelectorAll('button')].find(b => /back|chat/i.test(b.getAttribute('aria-label') || ''))
    if (back) { back.click(); return 'back' }
    const nav = [...document.querySelectorAll('button')].filter(b => (b.getAttribute('aria-label') || '').trim() === 'Chat')[0]
    if (nav) { nav.click(); return 'chat' }
    return false
  })()`)
  if (ok) {
    try { await cdp.waitFor('document.querySelector("[data-conversation-session]") !== null', 15000, 'conversation') } catch {}
  }
  return cdp.evaluate(`document.querySelector('[data-conversation-session]') !== null`)
}

/** Open the right-panel Highlights tab (header button aria-label from locale action.openPanel). */
export async function ensurePanel(cdp) {
  const rows = await cdp.evaluate(`document.querySelectorAll('.dshhl-panel__row').length`)
  if (rows > 0) return rows
  const opened = await clickByLabel(cdp, 'Show session highlights')
  if (!opened) throw new Error('no right-panel opener button')
  await cdp.waitFor('document.querySelectorAll(".dshhl-panel__row").length > 0', 20000, 'panel rows')
  await sleep(600)
  return cdp.evaluate(`document.querySelectorAll('.dshhl-panel__row').length`)
}

export async function domSnapshot(cdp) {
  return cdp.evaluate(`(() => {
    const count = s => document.querySelectorAll(s).length
    const scroller = document.querySelector('[data-conversation-scroll]')
    return {
      session: scroller?.dataset.conversationSession ?? document.querySelector('[data-conversation-session]')?.dataset.conversationSession,
      conversationMounted: document.querySelector('[data-conversation-session]') !== null,
      pageMounted: count('article.dshhl-row') > 0,
      flowNodes: count('[data-chat-node-key]'),
      scrollers: count('[data-conversation-scroll]'),
      highlightHosts: count('[data-dshhl-highlight-host]'),
      layers: count('[data-dshhl-highlight-layer]'),
      boxes: count('[data-dshhl-highlight-box]'),
      bands: count('.dshhl-message-band'),
      pageRows: count('article.dshhl-row'),
      pageGroups: count('.dshhl-group'),
      panelRows: count('.dshhl-panel__row'),
      panelMounted: count('.dshhl-panel') > 0,
      affordance: count('[class*="affordance"], .dshhl-selection-bar'),
      card: count('[class*="dshhl-card"], .dshhl-item-card'),
      dialog: count('[role="dialog"]'),
      menu: count('[role="menu"]'),
      domNodes: count('*'),
      scrollHeight: scroller?.scrollHeight ?? 0,
      scrollTop: scroller?.scrollTop ?? 0,
      innerHeight: innerHeight,
      innerWidth: innerWidth,
    }
  })()`)
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export const median = values => {
  const a = [...values].filter(v => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y)
  if (a.length === 0) return null
  return a[Math.floor(a.length / 2)]
}
export const p95 = values => {
  const a = [...values].filter(v => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y)
  if (a.length === 0) return null
  return a[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)]
}
export const round = (v, d = 1) => v === null || v === undefined ? null : Number(v.toFixed(d))
export function stats(values, digits = 1) {
  const med = median(values)
  const p = p95(values)
  const max = values.length === 0 ? null : Math.max(...values)
  return { n: values.length, p50: round(med, digits), p95: round(p, digits), max: round(max, digits) }
}

// ===========================================================================
// Higher-level measurement helpers (perf-matrix, task-8)
// ===========================================================================

/** One measured action window: clear buffers, run `action`, wait for quiet. */
export async function runAction(cdp, action, { quiet = 400, max = 25000, label = 'action' } = {}) {
  await cdp.evaluate(`(() => {
    const M = window.__m
    M.lt.length = 0; M.frames.length = 0; M.geom.length = 0; M.mutations.length = 0
    M.sel.length = 0; M.registryWrites.length = 0; M.scrolls.length = 0
    M.counters = {}; M.renders = {}; M.events.length = 0; M.boxTimeline.length = 0
    M.keyCount = M.keys.length
    M.t0 = performance.now()
    return M.t0
  })()`)
  const wallStart = Date.now()
  await action()
  const quietResult = await waitQuiet(cdp, { quiet, max })
  const wallMs = Date.now() - wallStart
  const buf = await readBuffers(cdp)
  const mark = buf.t0
  const lastMut = buf.mutations.length === 0 ? null : Math.round(buf.mutations.at(-1).t - mark)
  const firstMut = buf.mutations.length === 0 ? null : Math.round(buf.mutations[0].t - mark)
  const lastLt = buf.lt.length === 0 ? null : Math.round(Math.max(...buf.lt.map(e => e.start + e.dur)) - mark)
  const summary = summarizeWindow(buf, wallMs, {
    label,
    timedOut: quietResult.timedOut,
    firstMutationMs: firstMut,
    lastMutationMs: lastMut,
    lastLongTaskEndMs: lastLt,
    quietMs: quietResult.quiet,
    settleFromActionMs: Math.max(firstMut ?? 0, lastLt ?? 0),
    events: buf.events.slice(0, 60),
    keyLatencies: keyLatencies(buf),
  })
  return summary
}

/** Pair each keydown with the next composer input event (page clock, ms). */
export function keyLatencies(buf) {
  const keys = buf.keysAfter ?? []
  const edits = buf.composerEditsAfter ?? []
  return []
}

/** Read the keyboard/composer probe arrays (delta since last read). */
export async function readKeyProbe(cdp) {
  return cdp.evaluate(`(() => {
    const M = window.__m
    const out = { keys: M.keys.splice(0), edits: M.composerEdits.splice(0) }
    return out
  })()`)
}

/** Pair keyboard events with composer input commits. */
export function pairKeyLatency(probe) {
  const pairs = []
  let editIndex = 0
  for (const key of probe.keys) {
    while (editIndex < probe.edits.length && probe.edits[editIndex].t < key.t) editIndex += 1
    if (editIndex >= probe.edits.length) break
    pairs.push(Number((probe.edits[editIndex].t - key.t).toFixed(1)))
  }
  return pairs
}

// --- surface navigation -----------------------------------------------------
export async function navToPage(cdp) {
  const ok = await cdp.evaluate(`(() => {
    const cands = [...document.querySelectorAll('button')].filter(b => (b.getAttribute('aria-label') || '').trim() === 'Highlights')
    const nav = cands.find(b => /panelRow/u.test(typeof b.className === 'string' ? b.className : ''))
    if (nav === undefined) return false
    nav.click(); return true
  })()`)
  if (!ok) throw new Error('no sidebar Highlights nav row')
  await cdp.waitFor('document.querySelectorAll("article.dshhl-row").length > 0', 20000, 'page rows')
  await sleep(400)
  return cdp.evaluate('document.querySelectorAll("article.dshhl-row").length')
}

/** Return to the conversation by clicking a sidebar session row (DSH navigation). */
export async function navToConversation(cdp, match = null) {
  const clicked = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('div[class*="sessionRow"]')]
    const match = ${JSON.stringify(match)}
    const target = match === null ? rows[0] : rows.find(r => (r.textContent || '').includes(match))
    if (!target) return null
    target.click()
    return (target.textContent || '').trim().slice(0, 40)
  })()`)
  if (clicked === null) throw new Error('no sidebar session row to click')
  await cdp.waitFor('(() => { const el = document.querySelector("[data-conversation-session]"); if (el === null) return false; const r = el.getBoundingClientRect(); return r.width > 100 && r.height > 100 })()', 20000, 'conversation visible')
  await sleep(300)
  return clicked
}

/** Open the right-panel Highlights tab via the session header button. */
export async function openPanel(cdp) {
  const ok = await cdp.evaluate(`(() => {
    const b = document.querySelector('button[aria-label="Show session highlights"]')
    if (!b) return false
    b.click(); return true
  })()`)
  if (!ok) throw new Error('no panel opener (Show session highlights)')
  await cdp.waitFor('document.querySelectorAll(".dshhl-panel__row").length > 0 || document.querySelector(".dshhl-panel") !== null', 20000, 'panel mount')
  return true
}

/** Close the right-panel Highlights tab via its tab strip Close button. */
export async function closePanel(cdp) {
  const ok = await cdp.evaluate(`(() => {
    // the tab strip close button adjacent to the active Highlights tab
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    const hl = tabs.find(t => (t.textContent || '').trim() === 'Highlights')
    if (hl === null || hl === undefined) return 'no-tab'
    const strip = hl.closest('[role="tablist"]') ?? hl.parentElement
    const close = [...strip.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === 'Close')
    if (close === undefined) return 'no-close'
    close.click(); return 'closed'
  })()`)
  if (ok !== 'closed') throw new Error('panel close failed: ' + String(ok))
  await cdp.waitFor('document.querySelector(".dshhl-panel") === null', 10000, 'panel unmount')
  await sleep(200)
}

/**
 * Reveal one page row for the session that holds the most records, then settle
 * until the transcript stops growing. Setup only — not part of measured windows.
 */
export async function setupFullSession(cdp, { wants = 'plugin code review (1)', rounds = 3 } = {}) {
  await navToPage(cdp)
  let session = null
  for (let round = 0; round < rounds; round += 1) {
    const clicked = await cdp.evaluate(`(() => {
      const sessions = [...document.querySelectorAll('.dshhl-page__session')]
      const target = sessions.find(s => (s.textContent || '').includes(${JSON.stringify(wants)})) ?? sessions[0]
      const button = target?.querySelector('article.dshhl-row button[aria-label="Show in conversation"]')
      if (!button) return 'none'
      button.click(); return 'clicked'
    })()`)
    if (clicked !== 'clicked') throw new Error('setup reveal: no page row button')
    await sleep(300)
    await waitQuiet(cdp, { quiet: 800, max: 30000 })
    const state = await cdp.evaluate(`(() => {
      const scroller = document.querySelector('[data-conversation-scroll]')
      return {
        session: document.querySelector('[data-conversation-session]')?.dataset.conversationSession ?? null,
        flowNodes: document.querySelectorAll('[data-chat-node-key]').length,
        scrollHeight: scroller?.scrollHeight ?? 0,
        boxes: document.querySelectorAll('.dshhl-highlight-box').length,
        ranges: (() => { try { let n = 0; for (const h of CSS.highlights.values()) n += [...h].length; return n } catch { return -1 } })(),
        pageMounted: document.querySelectorAll('article.dshhl-row').length > 0,
      }
    })()`)
    session = state
    console.log('setup round', round + 1, JSON.stringify(state))
    if (state.session !== null && state.flowNodes > 400 && round >= 1) break
  }
  return session
}

/** Find a visible painted range and its viewport point (for card / reveal tests). */
export async function visiblePaintedPoint(cdp) {
  return cdp.evaluate(`(() => {
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (!scroller || typeof CSS === 'undefined' || !CSS.highlights) return null
    const vr = scroller.getBoundingClientRect()
    const out = []
    for (const [name, hl] of CSS.highlights) {
      for (const r of hl) {
        if (!/hl/i.test(name)) continue
        for (const rect of r.getClientRects()) {
          if (rect.width < 20 || rect.height < 6) continue
          const cy = rect.top + rect.height / 2
          if (cy < vr.top + 120 || cy > vr.bottom - 120) continue
          out.push({ name, x: Math.round(rect.left + Math.min(rect.width / 2, 40)), y: Math.round(cy), rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)] })
          if (out.length >= 6) return { point: out[0], all: out }
        }
      }
    }
    return out.length === 0 ? null : { point: out[0], all: out }
  })()`)
}

/** Find a visible text node inside a chat text-interaction source. */
export async function visibleTextNode(cdp) {
  return cdp.evaluate(`(() => {
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (!scroller) return null
    const vr = scroller.getBoundingClientRect()
    for (const source of document.querySelectorAll('[data-text-interaction-source]')) {
      const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        if (node.textContent.trim().length < 60) continue
        const range = document.createRange()
        range.setStart(node, 2); range.setEnd(node, Math.min(30, node.textContent.length))
        const rect = range.getBoundingClientRect()
        if (rect.width < 20 || rect.height < 6) continue
        if (rect.top < vr.top + 100 || rect.bottom > vr.bottom - 100) continue
        return { x: Math.round(rect.left + 5), y: Math.round(rect.top + rect.height / 2), text: node.textContent.slice(2, 30) }
      }
    }
    return null
  })()`)
}

// --- audits ----------------------------------------------------------------
export async function metricsSnapshotRaw(cdp) { return metricsRaw(cdp) }

export const countInstances = async (cdp, expression, label) => {
  const { result } = await cdp.send('Runtime.evaluate', { expression, objectGroup: 'leak-audit' })
  if (result.objectId === undefined) {
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'leak-audit' })
    return { label, count: null }
  }
  try {
    const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: result.objectId })
    const { result: length } = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration: 'function () { return this.length }',
      returnByValue: true,
    })
    return { label, count: length.value }
  } finally {
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'leak-audit' })
  }
}

export async function observerCounts(cdp) {
  const out = {}
  for (const [label, expr] of [
    ['MutationObserver', 'MutationObserver.prototype'],
    ['ResizeObserver', 'ResizeObserver.prototype'],
    ['IntersectionObserver', 'IntersectionObserver.prototype'],
    ['PerformanceObserver', 'PerformanceObserver.prototype'],
    ['Highlight', 'Highlight.prototype'],
  ]) {
    const row = await countInstances(cdp, expr, label)
    out[label] = row.count
  }
  return out
}

export async function listenerAudit(cdp, scriptUrls) {
  const audit = {}
  for (const [label, expression] of [['window', 'window'], ['document', 'document'], ['document.body', 'document.body']]) {
    const { result } = await cdp.send('Runtime.evaluate', { expression, objectGroup: 'leak-listeners' })
    if (result.objectId === undefined) { audit[label] = { count: null }; continue }
    try {
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: 0, pierce: false })
      const bySource = {}
      for (const listener of listeners) {
        const url = scriptUrls?.get(listener.scriptId) ?? ''
        const file = url.split('/').pop().split('?')[0] || (listener.scriptId === undefined ? '(native)' : `(script ${listener.scriptId})`)
        bySource[file] = (bySource[file] ?? 0) + 1
      }
      audit[label] = { count: listeners.length, bySource }
    } finally {
      await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'leak-listeners' })
    }
  }
  return audit
}

export async function highlightRegistry(cdp) {
  return cdp.evaluate(`(() => {
    if (typeof CSS === 'undefined' || CSS.highlights === undefined) return null
    const names = [...CSS.highlights.keys()]
    let ranges = 0
    for (const value of CSS.highlights.values()) ranges += [...value].length
    return { names, nameCount: names.length, ranges }
  })()`)
}

/** CPU profile one action window and attribute sampled self time to plugin vs DSH. */
export async function profileAction(cdp, action, { quiet = 600, max = 30000, sampleUs = 500 } = {}) {
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: sampleUs })
  await cdp.send('Profiler.start')
  const started = Date.now()
  await action()
  const slept = await waitQuiet(cdp, { quiet, max })
  const { profile } = await cdp.send('Profiler.stop')
  const wallMs = Date.now() - started
  const attribution = attributeProfile(profile)
  return { wallMs, quiet: slept, attribution, profile }
}

/** Attribute a V8 CPU profile to plugin / dsh / browser-native / other. */
export function attributeProfile(profile) {
  const nodesById = new Map(profile.nodes.map(node => [node.id, node]))
  const urlOf = node => (node.callFrame?.url ?? '')
  const parentOf = node => (node.parent === undefined ? undefined : nodesById.get(node.parent))
  const rootUrl = node => {
    let current = node
    let hops = 0
    while (current !== undefined && hops < 12) {
      const url = urlOf(current)
      if (url !== '') return url
      current = parentOf(current)
      hops += 1
    }
    return ''
  }
  const classify = (node, root) => {
    const name = node.callFrame?.functionName ?? ''
    const plugin = /dsh-highlights\/client\.js|dsh-highlights.*client/.test(root) || /dshhl/.test(name)
    const nativeGeom = /^(getClientRects|getBoundingClientRect|getBoundingClientRect_|scrollIntoView|scrollTo|elementFromPoint|elementsFromPoint|caretRangeFromPoint|querySelectorAll|querySelector)$/.test(name)
    if (plugin) return 'plugin'
    if (nativeGeom && /dsh-highlights/.test(rootUrl(node))) return 'plugin'
    if (/dsh-highlights/.test(root)) return 'plugin'
    if (/172\.16\.2\.20:3080|dsh-client|@deepseek|deepseek-ai|shell|_index|app/.test(root)) return 'dsh'
    if (/^((getClientRects|getBoundingClientRect|scrollIntoView|scrollTo|elementFromPoint|elementsFromPoint|caretRangeFromPoint|querySelectorAll|querySelector|focus|elementsFromPoint|createRange|getComputedStyle|offsetHeight|offsetWidth|clientHeight|clientWidth)$)/.test(name)) return 'browser-native'
    return 'other'
  }
  const totals = { plugin: 0, dsh: 0, 'browser-native': 0, other: 0, idle: 0, gc: 0, program: 0 }
  const perFunction = {}
  const samples = profile.samples ?? []
  const deltas = profile.timeDeltas ?? []
  for (let index = 0; index < samples.length; index += 1) {
    const node = nodesById.get(samples[index])
    const name = node?.callFrame?.functionName ?? ''
    const micros = deltas[index] ?? 0
    let bucket
    if (name === '(idle)') bucket = 'idle'
    else if (name === '(garbage collector)') bucket = 'gc'
    else if (name === '(program)') bucket = 'program'
    else bucket = classify(node ?? { callFrame: {} }, rootUrl(node ?? { callFrame: {} }))
    totals[bucket] = (totals[bucket] ?? 0) + micros
    if (['plugin', 'dsh', 'browser-native', 'other'].includes(bucket)) {
      const key = `${bucket} :: ${name || '(anonymous)'}`
      const row = perFunction[key] ?? (perFunction[key] = { bucket, name: name || '(anonymous)', micros: 0, samples: 0 })
      row.micros += micros
      row.samples += 1
    }
  }
  const ms = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number((v / 1000).toFixed(1))]))
  const total = Object.values(totals).reduce((s, v) => s + v, 0)
  const share = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, total === 0 ? 0 : Number((v / total * 100).toFixed(1))]))
  return {
    ms,
    share,
    totalMs: Number((total / 1000).toFixed(1)),
    top: Object.values(perFunction)
      .sort((a, b) => b.micros - a.micros)
      .slice(0, 25)
      .map(row => ({ ...row, ms: Number((row.micros / 1000).toFixed(1)) })),
  }
}

/** Idle-window measurement: main-thread cost over `ms` with no interaction. */
export async function idleWindow(cdp, ms = 10000) {
  const before = await metricsRaw(cdp)
  await cdp.evaluate(`(() => { const M = window.__m; M.lt.length = 0; M.frames.length = 0; M.geom.length = 0; M.mutations.length = 0; M.t0 = performance.now(); return true })()`)
  await sleep(ms)
  const after = await metricsRaw(cdp)
  const buf = await readBuffers(cdp)
  const delta = metricDelta(before, after)
  const frames = buf.frames.length
  const gaps = []
  for (let i = 1; i < buf.frames.length; i += 1) gaps.push(buf.frames[i] - buf.frames[i - 1])
  const geomByClass = {}
  for (const c of buf.geom) {
    const b = geomByClass[c.c] ?? (geomByClass[c.c] = { count: 0, totalMs: 0 })
    b.count += 1; b.totalMs += c.d
  }
  return {
    windowMs: ms,
    taskMs: delta.taskMs,
    scriptMs: delta.scriptMs,
    layoutMs: delta.layoutMs,
    recalcStyleMs: delta.recalcStyleMs,
    layoutCount: delta.LayoutCount,
    frames,
    frameGapsOver50: gaps.filter(g => g > 50).length,
    maxFrameGapMs: gaps.length === 0 ? null : Math.max(...gaps),
    longTasks: buf.lt.map(e => e.dur),
    mutations: buf.mutations.length,
    geometry: { calls: buf.geom.length, byClass: geomByClass },
    events: buf.events.length,
  }
}

// --- fresh-navigation loops (Section A) -------------------------------------
/** Connect once, enable domains, install instrumentation for every navigation. */
export async function connectInstrumented({ port = 9225, cookies = true } = {}) {
  const cdp = await connect(await pageTarget(port))
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.enable')
  await cdp.send('Debugger.enable')
  const scriptUrls = new Map()
  cdp.on(message => {
    if (message.method === 'Debugger.scriptParsed') scriptUrls.set(message.params.scriptId, message.params.url)
  })
  if (cookies) {
    const cookie = cookiePair()
    await cdp.send('Network.setCookie', { name: cookie.name, value: cookie.value, domain: '172.16.2.20', path: '/', httpOnly: true })
  }
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })
  return { cdp, scriptUrls }
}

/** Fresh navigation with no measured window (Section A measures from here). */
export async function navigateFresh(cdp) {
  await cdp.send('Page.navigate', { url: GUI })
  await cdp.waitFor('document.readyState === "complete"', 30000, 'load')
  return Date.now()
}

/** Interactive readiness: transcript scroller + composer seat mounted. */
export const READY_EXPRESSION = `(() => {
  const scroller = document.querySelector('[data-conversation-scroll]')
  const composer = document.querySelector('[data-composer-seat]')
  const newSession = document.querySelector('button[aria-label="New session"]') !== null
  return scroller !== null && composer !== null && newSession
})()`

/** Boot metrics for one fresh navigation window (measured since instrumentation start). */
export async function bootMetrics(cdp) {
  return cdp.evaluate(`(async () => {
    const M = window.__m
    const nav = performance.getEntriesByType('navigation')[0]
    const paint = performance.getEntriesByType('paint').map(p => ({ name: p.name, start: Math.round(p.startTime) }))
    const ready = document.querySelector('[data-conversation-scroll]') !== null && document.querySelector('[data-composer-seat]') !== null
    const domNodes = document.querySelectorAll('*').length
    const lt = M.lt.slice()
    const frames = M.frames.slice()
    const geom = M.geom.slice()
    const byClass = {}
    for (const c of geom) { const b = byClass[c.c] ?? (byClass[c.c] = { count: 0, totalMs: 0 }); b.count += 1; b.totalMs += c.d }
    return {
      ready,
      now: Math.round(performance.now()),
      nav: nav === undefined ? null : { domInteractive: Math.round(nav.domInteractive), domContentLoaded: Math.round(nav.domContentLoadedEventEnd), loadEventEnd: Math.round(nav.loadEventEnd), responseEnd: Math.round(nav.responseEnd) },
      paint,
      longTasks: lt.map(e => ({ start: e.start, dur: e.dur })),
      longTaskTotalMs: Number(lt.reduce((s, e) => s + e.dur, 0).toFixed(1)),
      longestTaskMs: Number((lt.length === 0 ? 0 : Math.max(...lt.map(e => e.dur))).toFixed(1)),
      frames: frames.length,
      domNodes,
      geometry: { calls: geom.length, totalMs: Number(geom.reduce((s, c) => s + c.d, 0).toFixed(2)), byClass },
      session: document.querySelector('[data-conversation-session]')?.dataset.conversationSession ?? null,
      flowNodes: document.querySelectorAll('[data-chat-node-key]').length,
      pluginBoot: {
        hosts: document.querySelectorAll('[data-dshhl-highlight-host]').length,
        layers: document.querySelectorAll('[data-dshhl-highlight-layer]').length,
        navRow: [...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') || '') === 'Highlights'),
      },
    }
  })()`)
}
