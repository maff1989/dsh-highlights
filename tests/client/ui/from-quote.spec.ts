// @vitest-environment jsdom
/**
 * Quote → anchor resolution for agent proposals.
 *
 * The agent cannot compute a Chat anchor (node keys and projection offsets are
 * client-computed), so a proposal carries the verbatim quote and the client
 * resolves it here, borrowing the live selection for the duration of the
 * capture and restoring it afterwards.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { captureQuote, findQuoteRange } from '../../../src/client/anchor/from-quote'

/** Build one assistant node with a single response source. */
function assistantNode(options: {
  nodeKey?: string
  text?: string
  reasoning?: boolean
}): { node: HTMLElement; source: HTMLElement; text: Text } {
  const node = document.createElement('div')
  node.setAttribute('data-chat-node-key', options.nodeKey ?? '14:assistant-step4:2')
  node.setAttribute('data-chat-flow-kind', 'assistant-step')
  const source = document.createElement('div')
  source.setAttribute('data-text-interaction-source', '')
  const text = document.createTextNode(options.text ?? 'The migration must land before the release.')
  source.append(text)
  if (options.reasoning === true) {
    // A reasoning passage lives inside the think variant, which capture rejects.
    const think = document.createElement('div')
    think.setAttribute('data-variant', 'think')
    think.append(source)
    node.append(think)
  } else {
    node.append(source)
  }
  document.body.append(node)
  return { node, source, text }
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('findQuoteRange', () => {
  it('finds a verbatim passage in a response source', () => {
    assistantNode({})
    const match = findQuoteRange('must land before')
    expect(match).not.toBeNull()
    expect(match?.range.toString()).toBe('must land before')
  })

  it('tolerates surrounding whitespace in the proposal quote', () => {
    assistantNode({})
    const match = findQuoteRange('  migration must land  ')
    expect(match?.range.toString()).toBe('migration must land')
  })

  it('returns null when the passage is not on screen', () => {
    assistantNode({})
    expect(findQuoteRange('a sentence nobody wrote')).toBeNull()
  })

  it('returns null for an empty or whitespace-only quote', () => {
    assistantNode({})
    expect(findQuoteRange('   ')).toBeNull()
    expect(findQuoteRange('')).toBeNull()
  })

  it('prefers response text over reasoning text when both contain the passage', () => {
    const reasoning = assistantNode({ reasoning: true, text: 'the same words here' })
    // The reasoning copy is inside [data-variant="think"]; a response copy must win.
    const response = assistantNode({ text: 'prefix the same words here suffix' })
    const match = findQuoteRange('the same words here')
    expect(match?.source).toBe(response.source)
    expect(match?.source).not.toBe(reasoning.source)
  })
})

describe('captureQuote', () => {
  it('captures the same anchor shape the selection gesture produces', () => {
    const { node, text } = assistantNode({})
    void node
    const candidate = captureQuote('must land before')
    expect(candidate).not.toBeNull()
    expect(candidate?.nodeKey).toBe('14:assistant-step4:2')
    expect(candidate?.kind).toBe('text')
    expect(candidate?.anchor.nodeKey).toBe('14:assistant-step4:2')
    expect(candidate?.anchor.quote).toBe('must land before')
    expect(candidate?.anchor.end).toBeGreaterThan(candidate?.anchor.start ?? 0)
    expect(text.data).toContain(candidate?.anchor.quote ?? '')
  })

  it('restores the selection it borrowed', () => {
    const { text } = assistantNode({})
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 3)
    const selection = window.getSelection()
    if (selection === null) throw new Error('jsdom selection missing')
    selection.removeAllRanges()
    selection.addRange(range)
    const before = selection.toString()

    const candidate = captureQuote('must land before')
    expect(candidate).not.toBeNull()
    expect(selection.toString()).toBe(before)
  })

  it('returns null when the passage cannot be located', () => {
    assistantNode({})
    expect(captureQuote('not in this transcript')).toBeNull()
  })

  it('refuses a passage that only exists in reasoning text', () => {
    assistantNode({ reasoning: true, text: 'a private thought worth marking' })
    expect(findQuoteRange('private thought')).not.toBeNull()
    // Findable, but out of scope for this plugin: capture rejects reasoning.
    expect(captureQuote('private thought')).toBeNull()
  })
})
