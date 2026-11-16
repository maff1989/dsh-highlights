#!/usr/bin/env node
/**
 * Activate the built browser bundle in a fake module table and assert its
 * registrations.
 *
 * The live GUI is the real acceptance test, but this harness catches the
 * failure modes a type checker cannot: a wrong bundle id, a plugin that
 * registers nothing, slot keys that are never injected, a locale namespace that
 * is never registered, a missing stylesheet, and a transport that never primes.
 *
 * Usage: node scripts/check-bundle.mjs
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(ROOT, 'lib/client.js')

/** Assertions collected so one run reports every failure. */
const failures = []

/**
 * Record one assertion.
 * @param condition - Whether the assertion holds.
 * @param message - Failure description.
 */
function check(condition, message) {
  if (!condition) failures.push(message)
}

/** Minimal React stub: enough for module-scope imports and component refs. */
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol('Fragment'),
  memo: value => value,
  useCallback: value => value,
  useEffect: () => undefined,
  useLayoutEffect: () => undefined,
  useMemo: value => value(),
  useRef: value => ({ current: value }),
  useState: value => [typeof value === 'function' ? value() : value, () => undefined],
}

/** Module table shared by the fake require. */
const moduleTable = {
  react: reactStub,
  'react/jsx-runtime': {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: reactStub.Fragment,
  },
  'react-dom': { createPortal: (children) => children },
  'react-dom/client': {},
  '@deepseek-ai/cordis': {},
  zod: {},
  '@tanstack/react-virtual': {},
  '@deepseek-ai/dsh-client-store': {},
  '@deepseek-ai/dsh-client-ui-slots': {},
  '@deepseek-ai/dsh-client-ui-primitives': {
    Button: () => null,
    Menu: () => null,
    IconEllipsisOutlineRegular: () => null,
    IconListPenOutlineRegular: () => null,
  },
  '@deepseek-ai/dsh-client-ui-dockkit': {},
}

/** The page's fetch stub: answers the route envelope per endpoint. */
const fetchCalls = []
const sentinelHello = { protocol: 1, domainVersion: 1, installId: 'check', count: 0, maxRecords: 10000, insertionAttribution: true, pollIntervalMs: 0 }
const sentinelList = { revision: 1, records: [] }

/** Build one Response-shaped object. */
function respond(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { ok: true, value }
    },
  }
}

/** Fake `document` with the pieces the plugin touches. */
const head = []
const styleElements = []
const documentStub = {
  baseURI: 'http://localhost/',
  head: {
    append(element) {
      head.push(element)
    },
  },
  createElement(tag) {
    const element = {
      tagName: String(tag).toUpperCase(),
      dataset: {},
      textContent: '',
      remove() {
        const index = styleElements.indexOf(element)
        if (index >= 0) styleElements.splice(index, 1)
      },
    }
    if (tag === 'style') styleElements.push(element)
    return element
  },
  getSelection: () => null,
  querySelector: () => null,
  body: { appendChild() {} },
}
const storage = new Map()
const localStorageStub = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
}

/** One captured slot registration. */
const registrations = []
/** Keyboard commands registered through ctx.shortcuts. */
const shortcutRegistrations = []
/** Context-menu contributions registered through ctx.contextMenus. */
const contextMenuRegistrations = []
/** One captured locale registration. */
const localeRegistrations = []
/** Captured text-interaction registrations. */
const interactionRegistrations = []
/** Captured right-Sidebar tab-type registrations. */
const tabTypeRegistrations = []
/** Effects requested by the plugin. */
let effectCount = 0

/** Fake client context carrying the services the bundle injects. */
const ctx = {
  effect(fn, _label) {
    effectCount += 1
    const disposer = fn()
    return { dispose: () => (typeof disposer === 'function' ? disposer() : undefined) }
  },
  logger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
  slots: {
    inject(key, callback) {
      const disposer = callback()
      check(typeof key === 'string' && key.length > 0, 'slots.inject received an empty key')
      return { dispose: () => (typeof disposer === 'function' ? disposer() : undefined) }
    },
    register(options, Component) {
      registrations.push({ options, Component })
      return () => undefined
    },
  },
  locale: {
    register(namespace, locale, dict) {
      localeRegistrations.push({ namespace, locale, dict })
      return () => undefined
    },
    bind: () => (key) => key,
  },
  connection: {
    rpc: { call: async () => ({ ok: true, value: null }) },
  },
  uiConversation: {
    interactions: {
      register: definition => {
        interactionRegistrations.push(definition)
        return () => undefined
      },
    },
  },
  uiWorkspace: { openSession: () => undefined, startSession: () => undefined },
  sessions: { binding: () => undefined, create: async () => 'session-check' },
  sidebarRight: { openTab: () => undefined },
  sidebarRightTabs: {
    register: definition => {
      tabTypeRegistrations.push(definition)
      return () => undefined
    },
  },
  shortcuts: {
    register(command) {
      shortcutRegistrations.push(command)
      return () => undefined
    },
  },
  // Deferred service injection: Cordis calls the callback once the services are
  // available; the harness provides them eagerly and reports failures the same way.
  inject(names, callback) {
    for (const name of names) {
      check(name in stubServices, `ctx.inject waits for "${name}", which this harness does not provide`)
    }
    const disposer = callback(ctx)
    return { dispose: () => (typeof disposer === 'function' ? disposer() : undefined) }
  },
  contextMenus: {
    register(contribution) {
      contextMenuRegistrations.push(contribution)
      return () => undefined
    },
  },
  layout: { selectPanel: () => undefined },
  workspaces: { list: () => [] },
  on: () => () => undefined,
}

/** Services this harness provides to `ctx.inject` deferrals. */
const stubServices = {
  contextMenus: ctx.contextMenus,
}

/** Fake window/global sandbox. */
const sandbox = {
  console,
  document: documentStub,
  fetch: async (url, init) => {
    fetchCalls.push({ url: String(url), init })
    const body = JSON.parse(init.body)
    if (body.endpoint === 'hello') return respond(sentinelHello)
    if (body.endpoint === 'list') return respond(sentinelList)
    return respond(null)
  },
  localStorage: localStorageStub,
  navigator: { language: 'en' },
  URL,
  URLSearchParams,
  AbortController,
  AbortSignal,
  DOMException,
  Response,
  Request,
  MessageChannel,
  setTimeout,
  clearTimeout,
  Promise,
  Map,
  Set,
  WeakMap,
  Symbol,
  Object,
  Array,
  JSON,
  Math,
  Date,
  Error,
  TypeError,
  CSS: { highlights: new Map() },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  requestAnimationFrame: callback => {
    callback(0)
    return 0
  },
  cancelAnimationFrame: () => undefined,
  getComputedStyle: () => ({ whiteSpace: 'normal' }),
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  innerWidth: 1280,
  innerHeight: 800,
  performance,
  window: undefined,
}
sandbox.window = sandbox
sandbox.globalThis = sandbox

/** Capture the module-loader registration while the bundle evaluates. */
const loaded = []
sandbox.__ModuleLoader__ = {
  load(registration) {
    loaded.push(registration)
  },
}

const source = await readFile(BUNDLE, 'utf8')
const context = vm.createContext(sandbox)
try {
  vm.runInContext(source, context, { filename: 'lib/client.js' })
} catch (error) {
  failures.push(`bundle evaluation threw: ${error instanceof Error ? error.message : String(error)}`)
}

check(loaded.length === 1, `bundle registered ${loaded.length} modules; expected exactly 1`)
const registration = loaded[0]
check(registration?.id === 'dsh-highlights', `bundle id is ${String(registration?.id)}; expected "dsh-highlights"`)

if (registration !== undefined) {
  let exported
  try {
    exported = registration.factory(id => {
      const value = moduleTable[id]
      if (value === undefined) throw new Error(`unexpected platform module requested: ${id}`)
      return value
    })
  } catch (error) {
    failures.push(`bundle factory threw: ${error instanceof Error ? error.message : String(error)}`)
  }
  check(typeof exported?.apply === 'function', 'bundle exports no apply()')
  check(Array.isArray(exported?.inject), 'bundle exports no inject array')
  check(exported?.name === 'dsh-highlights', `bundle name is ${String(exported?.name)}`)

  if (typeof exported?.apply === 'function') {
    try {
      exported.apply(ctx)
    } catch (error) {
      failures.push(`apply() threw: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// Give the priming refresh a turn to issue its requests.
await new Promise(resolveTurn => setTimeout(resolveTurn, 25))

const slotKeys = registrations.map(entry => entry.options?.name)
check(slotKeys.includes('main'), 'no "main" panel registration')
check(slotKeys.includes('sidebar.panellist'), 'no "sidebar.panellist" row registration')
check(!slotKeys.includes('conversation.chat.text-interaction'), 'still registers a Chat-hosted selection surface')
check(slotKeys.includes('conversation.chat.assistant-actions'), 'no per-message save action registration')
check(slotKeys.includes('conversation.session.header.utilities'), 'no session bridge registration')
check(interactionRegistrations.length === 0, 'still claims a Chat text-interaction gesture')
check(tabTypeRegistrations.some(entry => entry.kind === 'highlights'), 'no right-Sidebar tab type registered')
check(slotKeys.includes('sidebar.right.pane.tab'), 'no right-Sidebar tab body registration')

const main = registrations.find(entry => entry.options?.name === 'main')
check(main?.options?.key === 'highlights', `main panel key is ${String(main?.options?.key)}`)
check(main?.options?.locale === 'highlights', 'main panel declares no locale namespace')
const row = registrations.find(entry => entry.options?.name === 'sidebar.panellist')
check(row?.options?.id === 'highlights', `sidebar row id is ${String(row?.options?.id)}`)
check(typeof row?.options?.label === 'function', 'sidebar row has no label thunk')

check(localeRegistrations.length === 2, `expected 2 locale registrations, saw ${localeRegistrations.length}`)
check(localeRegistrations.every(entry => entry.namespace === 'highlights'), 'locale registrations use a different namespace')
check(localeRegistrations.some(entry => entry.locale === 'en'), 'no English dictionary registered')
check(localeRegistrations.some(entry => entry.locale === 'zh'), 'no Chinese dictionary registered')

check(shortcutRegistrations.length === 2, `expected 2 shortcut registrations, saw ${shortcutRegistrations.length}`)
check(contextMenuRegistrations.length === 2, `expected 2 context-menu contributions, saw ${contextMenuRegistrations.length}`)
check(
  contextMenuRegistrations.every(entry => typeof entry.resolve === 'function'),
  'a context-menu contribution has no resolve()',
)
check(
  shortcutRegistrations.every(command => typeof command.label === 'function'),
  'a shortcut registration has no label thunk',
)
check(styleElements.length >= 1, 'no stylesheet injected into document.head')
check(styleElements.some(element => element.dataset.pluginCss === 'dsh-highlights'), 'stylesheet is not marked as plugin-owned')
check(
  styleElements.some(element => String(element.textContent).includes('::highlight(dsh-hl-1)')),
  'global stylesheet has no ::highlight rules',
)

const bundleText = await readFile(BUNDLE, 'utf8')
check(bundleText.includes('contextmenu'), 'bundle has no contextmenu listener')
check(bundleText.includes('dshhl-affordance__menuList'), 'bundle has no right-click More menu')
check(bundleText.includes('action.copySelection'), 'bundle has no Copy selection action')
check(!bundleText.includes('data-dshhl-surface'), 'bundle still renders the removed Chat-hosted surface')

check(fetchCalls.length >= 2, `transport issued ${fetchCalls.length} requests; expected hello + list`)
check(
  fetchCalls.some(call => String(call.url).includes('api/highlights')),
  'transport did not call the /api/highlights route',
)
check(fetchCalls.every(call => call.init?.credentials === 'same-origin'), 'route calls are not same-origin credentialed')

if (failures.length > 0) {
  console.error(`bundle check FAILED (${failures.length}):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`bundle check OK: ${registrations.length} slot registrations, ${shortcutRegistrations.length} shortcuts, ${contextMenuRegistrations.length} context menus, ${localeRegistrations.length} dictionaries, ${fetchCalls.length} route calls, ${styleElements.length} stylesheet(s)`)
