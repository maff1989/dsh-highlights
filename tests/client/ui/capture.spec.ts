// @vitest-environment jsdom
/**
 * Regression tests for the assistant-node identity used by every capture path.
 *
 * Chat's `data-chat-node-key` is built from the Conversation kind (`assistant`)
 * and the id `${turn}:${step}`, so a real key reads `14:assistant-step4:2`. The
 * `assistant-step` spelling is the Chat flow kind and appears in
 * `data-chat-flow-kind` instead. An earlier build tested the key for
 * `assistant-step` and silently captured nothing; these tests pin the real
 * shape, the flow-kind fallback, and the rejection of non-assistant nodes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { captureMessageAnchor, captureSelection } from '../../../src/client/anchor/capture'

/** Build one assistant node with a single selection source. */
function assistantNode(options: {
  nodeKey: string
  flowKind?: string
  turn?: string
  text?: string
}): { node: HTMLElement; source: HTMLElement; text: Text } {
  const node = document.createElement('div')
  node.setAttribute('data-chat-node-key', options.nodeKey)
  if (options.flowKind !== undefined) node.setAttribute('data-chat-flow-kind', options.flowKind)
  if (options.turn !== undefined) node.setAttribute('data-chat-turn', options.turn)
  const source = document.createElement('div')
  source.setAttribute('data-text-interaction-source', '')
  const text = document.createTextNode(options.text ?? 'The migration must land before the release.')
  source.append(text)
  node.append(source)
  document.body.append(node)
  return { node, source, text }
}

/** Select one range and return the live selection. */
function select(text: Text, start: number, end: number): Selection {
  const range = document.createRange()
  range.setStart(text, start)
  range.setEnd(text, end)
  const selection = window.getSelection()
  if (selection === null) throw new Error('jsdom selection missing')
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})


describe('captureSelection block-boundary normalization', () => {
  /** A node whose source holds two blocks and whose chrome follows the source. */
  function blocksNode(): { node: HTMLElement; source: HTMLElement; first: Text; second: Text; footer: Text } {
    const node = document.createElement('div')
    node.setAttribute('data-chat-node-key', '14:assistant-step10:36')
    node.setAttribute('data-chat-flow-kind', 'assistant-step')
    const source = document.createElement('div')
    source.setAttribute('data-text-interaction-source', '')
    const firstBlock = document.createElement('p')
    firstBlock.textContent = 'First paragraph.'
    const secondBlock = document.createElement('p')
    secondBlock.textContent = 'Last paragraph text.'
    source.append(firstBlock, secondBlock)
    const footer = document.createElement('span')
    footer.textContent = 'actions row'
    node.append(source, footer)
    document.body.append(node)
    return {
      node,
      source,
      first: firstBlock.firstChild as Text,
      second: secondBlock.firstChild as Text,
      footer: footer.firstChild as Text,
    }
  }

  it('clamps a block selection that spills past the source end (triple-click)', () => {
    const { first, second } = blocksNode()
    const range = document.createRange()
    range.setStart(second, 0)
    // Chromium triple-click ends at the next block boundary; on the last block of
    // a source that is outside the source entirely.
    range.setEnd(second, second.data.length)
    const selection = window.getSelection()
    if (selection === null) throw new Error('jsdom selection missing')
    selection.removeAllRanges()
    selection.addRange(range)
    // Extend past the source element into the message chrome.
    range.setEnd(document.querySelector('span')?.firstChild ?? second, 0)
    selection.removeAllRanges()
    selection.addRange(range)

    const candidate = captureSelection(selection)
    expect(candidate).not.toBeNull()
    expect(candidate?.anchor.quote.trim()).toBe('Last paragraph text.')
    expect(candidate?.nodeKey).toBe('14:assistant-step10:36')
  })

  it('clamps a block selection that starts in a whitespace-only preceding node', () => {
    const { node, first } = blocksNode()
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(first, first.data.length)
    const selection = window.getSelection()
    if (selection === null) throw new Error('jsdom selection missing')
    // A block selection may start just before the source, in whitespace chrome.
    const spacer = document.createElement('span')
    spacer.textContent = '\n\n'
    node.prepend(spacer)
    range.setStart(spacer.firstChild as Text, 0)
    selection.removeAllRanges()
    selection.addRange(range)

    const candidate = captureSelection(selection)
    expect(candidate).not.toBeNull()
    expect(candidate?.anchor.quote.trim()).toBe('First paragraph.')
  })

  it('rejects a selection that drags in visible text from outside the source', () => {
    const { node, first } = blocksNode()
    const header = document.createElement('div')
    header.textContent = 'unrelated header text'
    node.prepend(header)
    const range = document.createRange()
    range.setStart(header.firstChild as Text, 0)
    range.setEnd(first, first.data.length)
    const selection = window.getSelection()
    if (selection === null) throw new Error('jsdom selection missing')
    selection.removeAllRanges()
    selection.addRange(range)
    expect(captureSelection(selection)).toBeNull()
  })

  it('still rejects a selection spanning two sources', () => {
    const { node } = blocksNode()
    const other = document.createElement('div')
    other.setAttribute('data-text-interaction-source', '')
    other.textContent = 'Other source text.'
    node.append(other)
    const range = document.createRange()
    range.setStart(node.querySelector('p')?.firstChild as Text, 2)
    range.setEnd(other.firstChild as Text, 5)
    const selection = window.getSelection()
    if (selection === null) throw new Error('jsdom selection missing')
    selection.removeAllRanges()
    selection.addRange(range)
    expect(captureSelection(selection)).toBeNull()
  })
})

describe('captureSelection', () => {
  it('captures a selection in the real conversation-kind key format', () => {
    const { text } = assistantNode({ nodeKey: '14:assistant-step4:2', turn: '4' })
    const candidate = captureSelection(select(text, 4, 21))
    expect(candidate).not.toBeNull()
    expect(candidate?.nodeKey).toBe('14:assistant-step4:2')
    expect(candidate?.anchor.quote).toBe('migration must la')
    expect(candidate?.anchor.turn).toBe(4)
    expect(candidate?.anchor.step).toBe(2)
    expect(candidate?.sourceIndex).toBe(0)
  })

  it('falls back to the Chat flow kind when the key carries no kind', () => {
    const { text } = assistantNode({ nodeKey: 'node-7', flowKind: 'assistant-step' })
    const candidate = captureSelection(select(text, 4, 9))
    expect(candidate).not.toBeNull()
    expect(candidate?.anchor.quote).toBe('migra')
    // No turn:step in this key, so the position hints stay absent rather than wrong.
    expect(candidate?.anchor.turn).toBeUndefined()
    expect(candidate?.anchor.step).toBeUndefined()
  })

  it('rejects a user-message node', () => {
    const { text } = assistantNode({ nodeKey: '4:user3:1', flowKind: 'user' })
    expect(captureSelection(select(text, 0, 5))).toBeNull()
  })

  it('rejects a collapsed selection', () => {
    const { text } = assistantNode({ nodeKey: '14:assistant-step4:2' })
    const selection = select(text, 3, 3)
    expect(captureSelection(selection)).toBeNull()
  })

  it('rejects reasoning text', () => {
    const { text } = assistantNode({ nodeKey: '14:assistant-step4:2' })
    const thinking = document.createElement('div')
    thinking.setAttribute('data-variant', 'think')
    const body = document.createElement('div')
    body.setAttribute('data-text-interaction-source', '')
    const reasoningText = document.createTextNode('Considering the migration order.')
    body.append(reasoningText)
    thinking.append(body)
    document.body.append(thinking)
    expect(captureSelection(select(reasoningText, 0, 10))).toBeNull()
    void text
  })
})

describe('captureMessageAnchor', () => {
  it('builds a whole-message anchor for an assistant node', () => {
    const { node } = assistantNode({ nodeKey: '14:assistant-step4:2', turn: '4' })
    const anchor = captureMessageAnchor(node, 'message-1', 42)
    expect(anchor?.kind).toBe('message')
    expect(anchor?.nodeKey).toBe('14:assistant-step4:2')
    expect(anchor?.turn).toBe(4)
    expect(anchor?.step).toBe(2)
    expect(anchor?.messageId).toBe('message-1')
    expect(anchor?.nodeSeq).toBe(42)
    expect(anchor?.quote.startsWith('The migration must land')).toBe(true)
  })

  it('returns null for a non-assistant node', () => {
    const { node } = assistantNode({ nodeKey: '4:user3:1', flowKind: 'user' })
    expect(captureMessageAnchor(node)).toBeNull()
  })
})
