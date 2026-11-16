/**
 * The plugin's own text projection of one `[data-text-interaction-source]`
 * element.
 *
 * Chat's projection function is package-internal, so the plugin owns one and
 * versions it (`PROJECTION_VERSION`). The rules mirror what a reader sees:
 * block boundaries become newlines, table cells are separated by tabs, `<br>`
 * is a newline, and the subtrees Chat excludes from selection are skipped.
 * Offsets mean nothing outside this projection, which is why every anchor
 * stores the projection version beside its offsets.
 */
import { PROJECTION_VERSION } from '../../shared/constants'

/** Elements whose boundaries read as a line break in the transcript. */
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION',
  'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'LI', 'MAIN',
  'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TFOOT', 'THEAD', 'TR', 'UL',
])

/** Cells read as a tab-separated boundary. */
const CELL_TAGS = new Set(['TD', 'TH'])

/** Subtrees that never contribute selectable text. */
const EXCLUDED_SELECTOR = '.katex-mathml, .sr-only, [hidden], [data-text-interaction-exclude]'

/** One text node's slice of the projected string. */
interface Slice {
  readonly node: Text
  /** Inclusive start offset in the projection. */
  readonly start: number
  /** Exclusive end offset in the projection. */
  readonly end: number
}

/** Projection offsets bracketing one element's content. */
interface Bounds {
  /** Offset where the element's content starts. */
  readonly start: number
  /** Offset where the element's content ends. */
  readonly end: number
}

/** A projected source: its text, its offset mapping, and its element. */
export interface SourceProjection {
  /** Projection version these offsets belong to. */
  readonly version: number
  /** The source element the projection describes. */
  readonly source: HTMLElement
  /** Projected text. */
  readonly text: string
  /**
   * Translate a DOM point into a projection offset.
   * @param node - Boundary node (text or element).
   * @param offset - Offset inside that node.
   * @returns the projection offset, or null when the point is outside the projection.
   */
  offsetOf(node: Node, offset: number): number | null
  /**
   * Build a DOM Range for a projection slice.
   * @param start - Inclusive start offset.
   * @param end - Exclusive end offset.
   * @returns the Range, or null when the slice cannot be mapped.
   */
  rangeAt(start: number, end: number): Range | null
}

/** True when an element is a non-selectable subtree Chat excludes. */
function excluded(element: Element): boolean {
  if (element.matches(EXCLUDED_SELECTOR)) return true
  if (element.getAttribute('aria-hidden') === 'true' && !element.matches('.katex-html')) return true
  return element.tagName === 'BUTTON' && element.parentElement?.tagName !== 'CODE'
}

/** True when the node is whitespace-only text. */
function whitespaceOnly(node: Node): boolean {
  return node.nodeType === 3 && /^[ \t\n\r\f]*$/u.test((node as Text).data)
}

/**
 * Project one source element.
 * @param source - The `[data-text-interaction-source]` element.
 * @returns the projection.
 */
export function projectSource(source: HTMLElement): SourceProjection {
  let text = ''
  const slices: Slice[] = []
  const bounds = new Map<Element, Bounds>()

  /** Append a separator unless the projection is empty or already ends with it. */
  const separate = (separator: string): void => {
    if (text.length === 0 || text.endsWith(separator)) return
    text = text.replace(/[ \t]+$/u, '')
    if (text.endsWith(separator)) return
    text += separator
  }

  /** Walk one node in document order. */
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const textNode = node as Text
      const data = textNode.data
      if (data.length === 0) return
      // Layout whitespace between blocks is not content.
      if (whitespaceOnly(node) && text.endsWith('\n')) return
      const start = text.length
      text += data
      slices.push({ node: textNode, start, end: text.length })
      return
    }
    if (node.nodeType !== 1) return
    const element = node as Element
    if (element !== source && excluded(element)) return
    if (element.tagName === 'BR') {
      text = `${text.replace(/[ \t]+$/u, '')}\n`
      return
    }
    const block = BLOCK_TAGS.has(element.tagName)
    const cell = CELL_TAGS.has(element.tagName)
    if (block) separate('\n')
    if (cell) separate('\t')
    const start = text.length
    for (const child of element.childNodes) visit(child)
    bounds.set(element, { start, end: text.length })
    if (block) separate('\n')
    if (cell) separate('\t')
  }

  for (const child of source.childNodes) visit(child)

  // Trim synthetic boundaries at the very start and end, shifting recorded offsets.
  const leading = text.length - text.replace(/^\n+/u, '').length
  const trailing = text.length - text.replace(/\n+$/u, '').length
  if (leading > 0 || trailing > 0) {
    const shift = (value: number): number => Math.max(0, value - leading)
    const shiftedSlices = slices.map(slice => ({ node: slice.node, start: shift(slice.start), end: shift(slice.end) }))
    slices.length = 0
    slices.push(...shiftedSlices)
    const shiftedBounds = [...bounds.entries()].map(([element, value]) => [element, { start: shift(value.start), end: shift(value.end) }] as const)
    bounds.clear()
    for (const [element, value] of shiftedBounds) bounds.set(element, value)
    text = text.replace(/^\n+/u, '').replace(/\n+$/u, '')
  }

  /** Find the slice that contains an offset. */
  const sliceAt = (offset: number): Slice | undefined => {
    let candidate: Slice | undefined
    for (const slice of slices) {
      if (offset >= slice.start && offset <= slice.end) {
        // Prefer the earliest slice that contains the offset; a zero-width
        // boundary belongs to the end of the previous slice.
        if (offset === slice.start && candidate !== undefined) return candidate
        return slice
      }
      candidate = slice
    }
    return candidate
  }

  const offsetOf = (node: Node, offset: number): number | null => {
    if (node.nodeType === 3) {
      const slice = slices.find(candidate => candidate.node === node)
      if (slice === undefined) return null
      return slice.start + Math.min(Math.max(offset, 0), slice.node.data.length)
    }
    if (node.nodeType !== 1) return null
    const element = node as Element
    const elementBounds = bounds.get(element)
    const childCount = element.childNodes.length
    if (offset <= 0) return elementBounds?.start ?? 0
    if (offset >= childCount) return elementBounds?.end ?? text.length
    // A boundary between children: use the next child's first text position.
    for (let index = offset; index < childCount; index += 1) {
      const child = element.childNodes[index]
      if (child === undefined) continue
      if (child.nodeType === 3) {
        const slice = slices.find(candidate => candidate.node === child)
        if (slice !== undefined) return slice.start
      }
      const childBounds = bounds.get(child as Element)
      if (childBounds !== undefined) return childBounds.start
    }
    return elementBounds?.end ?? null
  }

  const rangeAt = (start: number, end: number): Range | null => {
    const startSlice = sliceAt(start)
    const endSlice = sliceAt(end)
    if (startSlice === undefined || endSlice === undefined || end < start) return null
    const range = source.ownerDocument.createRange()
    try {
      range.setStart(startSlice.node, Math.min(Math.max(start - startSlice.start, 0), startSlice.node.data.length))
      range.setEnd(endSlice.node, Math.min(Math.max(end - endSlice.start, 0), endSlice.node.data.length))
    } catch {
      return null
    }
    return range
  }

  return { version: PROJECTION_VERSION, source, text, offsetOf, rangeAt }
}
