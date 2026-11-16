// @vitest-environment jsdom
/**
 * Whole-message marks must not look like a character-level text highlight.
 *
 * A `kind:'text'` record is a marker box per line; a `kind:'message'` record is
 * one rounded band behind the reply, so "this reply is bookmarked" is visually
 * distinct from "these words are highlighted".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Author, HighlightRecord } from '../../../src/shared/schema'
import { HighlightOverlay } from '../../../src/client/paint/adapters/overlay'
import { GLOBAL_STYLES } from '../../../src/client/styles'

/** One stored record for a text or message anchor. */
function makeRecord(kind: 'text' | 'message', id?: string, author?: Author): HighlightRecord {
  return {
    schemaVersion: 1,
    id: id ?? (kind === 'text' ? '11111111-2222-4333-8444-555555555555' : '99999999-8888-4777-8666-555555555555'),
    sessionId: 'session-1',
    origin: 'test',
    anchor: {
      nodeKey: '14:assistant-step4:2',
      kind,
      sourceIndex: 0,
      quote: 'The migration must land before the release.',
      prefix: '',
      suffix: '',
      start: 0,
      end: 44,
      projection: 1,
    },
    colorId: 3,
    tags: [],
    starred: false,
    createdAt: 1,
    updatedAt: 2,
    version: 1,
    ...(author === undefined ? {} : { author }),
  }
}

/** A range fixture whose client rects are the supplied lines. */
function rangeWith(rects: DOMRect[]): Range {
  const range = document.createRange()
  Object.defineProperty(range, 'getClientRects', { configurable: true, value: () => rects })
  return range
}

/** Build a DOMRect-like object without a layout engine. */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

/**
 * One instrumented paint operation: a geometry READ or a DOM/style WRITE.
 *
 * `seq` is global across both kinds, so ordering can be asserted across them.
 */
interface PaintOp {
  readonly seq: number
  readonly kind: 'read' | 'write'
  readonly label: string
}

/** Records geometry reads and DOM/style writes in one global order. */
interface LayoutProbe {
  readonly ops: PaintOp[]
  read(label: string): void
  write(label: string): void
  reset(): void
}

/** Undo hook installed by the most recent probe; runs before each test's DOM is torn down. */
let restoreProbe: (() => void) | undefined

/** Describe one element for a probe label (tag + first class is enough to identify it). */
function elementLabel(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const firstClass = element.getAttribute('class')?.split(/\s+/)[0] ?? ''
  return firstClass === '' ? tag : `${tag}.${firstClass}`
}

/** Describe an appended/inserted node for a probe label. */
function nodeLabel(node: Node | string): string {
  if (typeof node === 'string') return JSON.stringify(node)
  return node.nodeType === Node.ELEMENT_NODE ? elementLabel(node as Element) : node.nodeName
}

/**
 * Instrument the page so every geometry read and every DOM/style write receives
 * a monotonic sequence number.
 *
 * Reads are the layout reads the overlay performs: `Range.getClientRects` /
 * `getBoundingClientRect` and `Element.getBoundingClientRect` / `getClientRects`
 * (the latter covers both the layer-origin read and any hidden-viewport probe).
 * Writes are the operations that can invalidate layout: element creation,
 * insertion, removal and inline-style property writes. `style.getPropertyValue`
 * is deliberately NOT a write: `writeStyle` diffs against it and it does not
 * dirty layout.
 *
 * The hooks wrap prototypes/instance methods rather than one overlay instance,
 * so they hold for any spelling of the implementation.
 * @returns the probe, whose ordering is queried by the caller.
 */
function installLayoutProbe(): LayoutProbe {
  const ops: PaintOp[] = []
  const undo: (() => void)[] = []
  let seq = 0
  const record = (kind: PaintOp['kind'], label: string): void => {
    ops.push({ seq, kind, label })
    seq += 1
  }
  const probe: LayoutProbe = {
    ops,
    read: label => { record('read', label) },
    write: label => { record('write', label) },
    reset: () => { ops.length = 0; seq = 0 },
  }

  /** Replace a prototype/instance method, recording the original for teardown. */
  const replace = <Key extends PropertyKey, Value>(target: object, key: Key, value: Value): void => {
    const holder = target as Record<Key, unknown>
    const original = holder[key]
    holder[key] = value
    undo.push(() => { holder[key] = original })
  }

  // --- Layout reads -----------------------------------------------------------
  const elementRect = Element.prototype.getBoundingClientRect
  replace(Element.prototype, 'getBoundingClientRect', function (this: Element): DOMRect {
    probe.read(`Element.getBoundingClientRect(${elementLabel(this)})`)
    return elementRect.call(this)
  })

  const elementRects = Element.prototype.getClientRects
  replace(Element.prototype, 'getClientRects', function (this: Element): DOMRectList {
    probe.read(`Element.getClientRects(${elementLabel(this)})`)
    return elementRects.call(this)
  })

  const rangeRect = Range.prototype.getBoundingClientRect
  replace(Range.prototype, 'getBoundingClientRect', function (this: Range): DOMRect {
    probe.read('Range.getBoundingClientRect()')
    return rangeRect.call(this)
  })

  // --- DOM/style writes -------------------------------------------------------
  const documentObject = document
  // Collapse the overloads to the widest signature so the wrapper can forward.
  const createElement = Document.prototype.createElement as (
    this: Document,
    tagName: string,
    options?: string | ElementCreationOptions,
  ) => HTMLElement
  replace(documentObject, 'createElement', function (this: Document, tagName: string, options?: string | ElementCreationOptions): HTMLElement {
    probe.write(`document.createElement(${tagName})`)
    return createElement.call(this, tagName, options)
  })

  const append = Element.prototype.append
  replace(Element.prototype, 'append', function (this: Element, ...nodes: (Node | string)[]): void {
    probe.write(`append(${nodes.map(nodeLabel).join(', ')})`)
    append.apply(this, nodes)
  })

  const prepend = Element.prototype.prepend
  replace(Element.prototype, 'prepend', function (this: Element, ...nodes: (Node | string)[]): void {
    probe.write(`prepend(${nodes.map(nodeLabel).join(', ')})`)
    prepend.apply(this, nodes)
  })

  const appendChild = Node.prototype.appendChild
  replace(Node.prototype, 'appendChild', function <T extends Node>(this: Node, node: T): T {
    probe.write(`appendChild(${nodeLabel(node)})`)
    return appendChild.call(this, node) as T
  })

  const insertBefore = Node.prototype.insertBefore
  replace(Node.prototype, 'insertBefore', function <T extends Node>(this: Node, node: T, child: Node | null): T {
    probe.write(`insertBefore(${nodeLabel(node)})`)
    return insertBefore.call(this, node, child) as T
  })

  const remove = Element.prototype.remove
  replace(Element.prototype, 'remove', function (this: Element): void {
    probe.write(`remove(${elementLabel(this)})`)
    remove.call(this)
  })

  const setProperty = CSSStyleDeclaration.prototype.setProperty
  replace(CSSStyleDeclaration.prototype, 'setProperty', function (this: CSSStyleDeclaration, property: string, value: string | null, priority?: string): void {
    probe.write(`style.setProperty(${property}, ${String(value)})`)
    setProperty.call(this, property, value, priority)
  })

  restoreProbe = () => {
    for (const revert of undo.reverse()) revert()
    undo.length = 0
    restoreProbe = undefined
  }
  return probe
}

/** A range fixture whose `getClientRects()` records the read on the probe. */
function probedRange(probe: LayoutProbe, source: string, rects: DOMRect[]): Range {
  const range = document.createRange()
  Object.defineProperty(range, 'getClientRects', {
    configurable: true,
    value: () => {
      probe.read(`Range.getClientRects(${source})`)
      return rects
    },
  })
  return range
}

/**
 * Explain the first read-after-write interleaving, for a fail-loud assertion
 * message that names both operations. Returns '' when the order is clean.
 */
function interleavingDetail(reads: readonly PaintOp[], writes: readonly PaintOp[]): string {
  const firstWrite = writes[0]
  const lastRead = reads.at(-1)
  if (firstWrite === undefined || lastRead === undefined) return ''
  const offending = reads.filter(op => op.seq > firstWrite.seq)
  if (offending.length === 0) return ''
  const lines = [
    `Two-phase paint violated: ${String(offending.length)} geometry read(s) happened after the first DOM/style write.`,
    `  first write: seq ${String(firstWrite.seq)} — ${firstWrite.label}`,
    `  last read:   seq ${String(lastRead.seq)} — ${lastRead.label}`,
    '  offending reads:',
  ]
  for (const op of offending) {
    const priorWrite = writes.filter(write => write.seq < op.seq).at(-1)
    lines.push(
      `    seq ${String(op.seq)} — ${op.label} (after write seq ${String(priorWrite?.seq ?? -1)} — ${priorWrite?.label ?? '?'})`,
    )
  }
  return lines.join('\n')
}

beforeEach(() => {
  document.body.innerHTML = '<div data-conversation-scroll><div data-chat-node-key="14:assistant-step4:2"></div></div>'
})

afterEach(() => {
  restoreProbe?.()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('HighlightOverlay', () => {
  it('draws one rounded band for a whole-message mark, not text boxes', () => {
    const overlay = new HighlightOverlay()
    const range = rangeWith([rect(40, 120, 200, 20), rect(40, 142, 160, 20)])
    overlay.sync([makeRecord('message')], new Map([[makeRecord('message').id, range]]))

    const band = document.querySelector<HTMLElement>('.dshhl-message-band')
    expect(band).not.toBeNull()
    expect(document.querySelectorAll('.dshhl-highlight-box')).toHaveLength(0)
    // Union of both line boxes plus the band padding.
    expect(band?.style.left).toBe('35px')
    expect(band?.style.top).toBe('115px')
    expect(band?.style.width).toBe('210px')
    expect(band?.style.height).toBe('52px')
    expect(band?.style.getPropertyValue('--dshhl-band-color')).toBe('var(--dsh-hl-3)')
    overlay.dispose()
  })

  it('keeps text highlights as per-line marker boxes', () => {
    const overlay = new HighlightOverlay()
    const range = rangeWith([rect(40, 120, 120, 20)])
    overlay.sync([makeRecord('text')], new Map([[makeRecord('text').id, range]]))

    expect(document.querySelectorAll('.dshhl-highlight-box')).toHaveLength(1)
    expect(document.querySelector('.dshhl-message-band')).toBeNull()
    overlay.dispose()
  })

  it('draws the message band without a leading rail or outline', () => {
    const start = GLOBAL_STYLES.indexOf('.dshhl-message-band {')
    const rule = GLOBAL_STYLES.slice(start, GLOBAL_STYLES.indexOf('}', start) + 1)
    expect(rule).not.toContain('border-left')
    expect(rule).not.toContain('border:')
    expect(rule).not.toContain('outline')
  })

  it('re-measures after the transcript box resizes (right-panel toggle)', async () => {
    let trigger: (() => void) | undefined
    const observed: Element[] = []
    class FakeResizeObserver {
      constructor(callback: () => void) { trigger = callback }
      observe(element: Element): void { observed.push(element) }
      disconnect(): void { /* noop */ }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    const overlay = new HighlightOverlay()
    let rects = [rect(40, 120, 120, 20)]
    const range = document.createRange()
    Object.defineProperty(range, 'getClientRects', { configurable: true, value: () => rects })
    const record = makeRecord('text')
    overlay.sync([record], new Map([[record.id, range]]))
    const box = document.querySelector<HTMLElement>('.dshhl-highlight-box')
    expect(box?.style.left).toBe('38.5px')
    expect(observed).toContain(document.querySelector('[data-conversation-scroll]'))

    // The pane grew narrower, so the text reflowed; the observer must re-measure.
    rects = [rect(60, 120, 120, 20)]
    trigger?.()
    await new Promise<void>(resolve => { requestAnimationFrame(() => resolve()) })
    expect(box?.style.left).toBe('58.5px')
    overlay.dispose()
  })

  it('does not rewrite box styles when a repaint finds the same geometry', () => {
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')
    const overlay = new HighlightOverlay()
    const range = rangeWith([rect(40, 120, 120, 20)])
    const record = makeRecord('text')
    overlay.sync([record], new Map([[record.id, range]]))
    setProperty.mockClear()

    overlay.sync([record], new Map([[record.id, range]]))
    expect(setProperty).not.toHaveBeenCalled()
    overlay.dispose()
  })

  it('removes a band when its message mark no longer resolves', () => {
    const overlay = new HighlightOverlay()
    const record = makeRecord('message')
    overlay.sync([record], new Map([[record.id, rangeWith([rect(0, 0, 100, 20)])]]))
    expect(document.querySelector('.dshhl-message-band')).not.toBeNull()

    overlay.sync([record], new Map())
    expect(document.querySelector('.dshhl-message-band')).toBeNull()
    overlay.dispose()
  })

  it('measures every range before it creates or styles any box (two-phase paint)', () => {
    const probe = installLayoutProbe()
    const overlay = new HighlightOverlay()
    // Mount the host/layer first: that one-time setup writes the two container
    // elements, which is not the per-record paint pass this test pins.
    overlay.sync([], new Map())
    probe.reset()

    const textRecords = [
      makeRecord('text', '11111111-2222-4333-8444-555555555551'),
      makeRecord('text', '11111111-2222-4333-8444-555555555552'),
      makeRecord('text', '11111111-2222-4333-8444-555555555553'),
    ]
    const messageRecord = makeRecord('message', '99999999-8888-4777-8666-555555555550')
    /** Two line boxes per record, in content-space coordinates. */
    const rows = new Map<string, DOMRect[]>([
      [textRecords[0]!.id, [rect(20, 120, 120, 18), rect(20, 140, 90, 18)]],
      [textRecords[1]!.id, [rect(20, 260, 140, 18), rect(20, 280, 110, 18)]],
      [textRecords[2]!.id, [rect(20, 400, 100, 18), rect(20, 420, 130, 18)]],
      [messageRecord.id, [rect(20, 520, 200, 18), rect(20, 542, 180, 18)]],
    ])
    /** Fresh ranges per paint: the fixtures also record their geometry read. */
    const rangesFor = (): Map<string, Range> => new Map(
      [...rows].map(([id, rects]) => [id, probedRange(probe, id, rects)]),
    )

    overlay.sync([...textRecords, messageRecord], rangesFor())

    // Sanity: the paint really did paint — six line boxes and one band.
    expect(document.querySelectorAll('.dshhl-highlight-box')).toHaveLength(6)
    expect(document.querySelectorAll('.dshhl-message-band')).toHaveLength(1)

    /** Assert one paint pass measured everything before writing anything. */
    const assertReadsBeforeWrites = (pass: string): void => {
      const reads = probe.ops.filter(op => op.kind === 'read')
      const writes = probe.ops.filter(op => op.kind === 'write')
      expect(reads.length, `${pass}: no geometry read was recorded`).toBeGreaterThan(0)
      expect(writes.length, `${pass}: no DOM/style write was recorded, so the paint did not run`).toBeGreaterThan(0)

      // Pass 1 must read the layer origin and every record's range.
      expect(
        reads.some(op => op.label.includes('dshhl-highlight-layer')),
        `${pass}: the layer origin rect was never read`,
      ).toBe(true)
      for (const record of [...textRecords, messageRecord]) {
        expect(
          reads.some(op => op.label.includes(record.id)),
          `${pass}: record ${record.id} was never measured before the writes`,
        ).toBe(true)
      }

      // Fail loud: the first write must come after the last read.
      const firstWrite = writes[0]!
      const lastRead = reads.at(-1)!
      expect(firstWrite.seq, interleavingDetail(reads, writes)).toBeGreaterThan(lastRead.seq)
    }

    assertReadsBeforeWrites('first paint')

    // A repaint with changed geometry is the other path that used to interleave
    // moves and measurements: it must stay two-phase too.
    probe.reset()
    rows.set(textRecords[0]!.id, [rect(30, 120, 120, 18), rect(30, 140, 90, 18)])
    overlay.sync([...textRecords, messageRecord], rangesFor())
    expect(document.querySelectorAll('.dshhl-highlight-box')).toHaveLength(6)
    assertReadsBeforeWrites('repaint after reflow')
    overlay.dispose()
  })

  it('removes stale line boxes when a record needs fewer lines', () => {
    const overlay = new HighlightOverlay()
    const record = makeRecord('text')
    overlay.sync([record], new Map([[record.id, rangeWith([rect(0, 0, 100, 18), rect(0, 20, 80, 18), rect(0, 40, 60, 18)])]]))
    expect(document.querySelectorAll('.dshhl-highlight-box')).toHaveLength(3)

    overlay.sync([record], new Map([[record.id, rangeWith([rect(0, 0, 100, 18)])]]))
    expect(document.querySelectorAll('.dshhl-highlight-box')).toHaveLength(1)
    overlay.dispose()
  })

  it('reuses box elements across repaints instead of recreating them', () => {
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')
    const overlay = new HighlightOverlay()
    const record = makeRecord('text')
    overlay.sync([record], new Map([[record.id, rangeWith([rect(40, 120, 120, 18)])]]))
    const box = document.querySelector<HTMLElement>('.dshhl-highlight-box')
    expect(box).not.toBeNull()
    setProperty.mockClear()

    // Unchanged geometry: the same element, and nothing is rewritten.
    overlay.sync([record], new Map([[record.id, rangeWith([rect(40, 120, 120, 18)])]]))
    expect(document.querySelector<HTMLElement>('.dshhl-highlight-box')).toBe(box)
    expect(setProperty).not.toHaveBeenCalled()

    // Moved geometry: still the same element, updated in place.
    overlay.sync([record], new Map([[record.id, rangeWith([rect(60, 120, 120, 18)])]]))
    expect(document.querySelector<HTMLElement>('.dshhl-highlight-box')).toBe(box)
    expect(box?.style.left).toBe('58.5px')
    overlay.dispose()
  })

  it('marks an agent-authored whole-message band but leaves a user band unmarked', () => {
    const overlay = new HighlightOverlay()
    const user = makeRecord('message', '99999999-8888-4777-8666-555555555551')
    const agent = makeRecord('message', '99999999-8888-4777-8666-555555555552', 'agent')
    overlay.sync([user, agent], new Map([
      [user.id, rangeWith([rect(40, 120, 200, 18)])],
      [agent.id, rangeWith([rect(40, 220, 200, 18)])],
    ]))

    const bands = [...document.querySelectorAll<HTMLElement>('.dshhl-message-band')]
    expect(bands).toHaveLength(2)
    const marked = bands.filter(band => band.getAttribute('data-dshhl-author') === 'agent')
    expect(marked).toHaveLength(1)
    // The user band keeps the shipped markup: same class, no provenance attribute.
    const userBand = bands.find(band => band.getAttribute('data-dshhl-author') === null)
    expect(userBand).not.toBeUndefined()
    expect(userBand?.className).toBe('dshhl-message-band')
    overlay.dispose()
  })

  it('does not rewrite band styles when a repaint finds the same message geometry', () => {
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')
    const overlay = new HighlightOverlay()
    const record = makeRecord('message')
    const range = rangeWith([rect(40, 120, 200, 18), rect(40, 140, 160, 18)])
    overlay.sync([record], new Map([[record.id, range]]))
    expect(document.querySelector('.dshhl-message-band')).not.toBeNull()

    setProperty.mockClear()
    overlay.sync([record], new Map([[record.id, range]]))
    expect(setProperty).not.toHaveBeenCalled()
    overlay.dispose()
  })
})
