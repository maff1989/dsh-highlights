/**
 * Browser half of the Highlights plugin.
 *
 * Composition root: it owns the record store, the action object, the painter and
 * the insertion queue, then registers the surfaces that use them — the global
 * page with its sidebar row, the right-panel session tab, the per-message save
 * action, and the null-rendering session bridge that keeps the transcript
 * painted and hosts the selection affordance.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

import {
  BRIDGE_SLOT_ID,
  LOCALE_NAMESPACE,
  MESSAGE_ACTION_ID,
  PANEL_ID,
} from '../shared/constants'
import { captureSelection } from './anchor/capture'
import { HighlightsActionsImpl } from './data/actions-impl'
import type { HighlightDraft } from './data/actions'
import { HighlightsClient } from './data/client'
import { sessionContext } from './data/context'
import { createTransport } from './data/transport'
import { en, zh } from './locales'
import { HighlightsPainter } from './paint/adapters/css-highlights'
import { InsertService } from './services/insert'
import { createCommandController } from './commands/controller'
import { createCommandTable } from './commands/definitions'
import { createCommandSurface } from './commands/surface'
import { DEFAULT_POLICY } from './commands/policies'
import type { Command } from './contracts/commands'
import type { ShortcutCommand, ShortcutResolution } from './contracts/shortcuts'
import type { SelectionGesture } from './contracts/selection'
import { createNoticeService } from './notice/service'
import { createSelectionGesture } from './selection/gesture'
import { createObservationService, type ObservationServiceHandle } from './observation/service'
import { createComposedReveal } from './reveal/composed-adapter'
import type { RevealPort } from './contracts/reveal'
import { createRevealPort } from './reveal/port'
import { COMPONENT_STYLES, GLOBAL_STYLES } from './styles'
import { HighlightsIcon } from './ui/HighlightsIcon'
import { registerNoticeOverlay } from './ui/NoticeOverlay'
import { registerSettingsSurface } from './ui/settings/register'
import { registerHighlightToolViews } from './ui/tools/register'
import { registerSessionSurfaces } from './ui/surfaces/register'
import { registerHighlightContextMenus } from './ui/menus/register'
import { copyText } from './ui/menus/clipboard'
import { PendingInsertStrip } from './ui/PendingInsertStrip'
import { chordLabel, setCaptureChordLabel } from './ui/shortcutHint'
import type { ProposalOutcome, ToolProposal } from './ui/tools/slot-contracts'
import { captureQuote } from './anchor/from-quote'
import { MessageAction } from './ui/MessageAction'
import { SessionBridge } from './ui/SessionBridge'
import { HighlightsPage } from './ui/page/HighlightsPage'
import { PAGE_STYLES } from './ui/page/pageStyles'
import { PANEL_STYLES } from './ui/panel/panelStyles'
import { registerHighlightsTab } from './ui/panel/register'

/** Browser plugin name (matches the package name the bundle registers under). */
export const name = 'dsh-highlights'

/** Client services this plugin cannot run without. */
export const inject = ['slots', 'locale', 'connection', 'sessions', 'workspaces', 'layout', 'uiWorkspace', 'sidebarRight', 'sidebarRightTabs', 'shortcuts']

/** Panel key branded for the layout store; the string is the shared panel id. */
const PANEL_KEY = PANEL_ID as unknown as MainPanelId

/**
 * Append one plugin-owned stylesheet to the document.
 * @param css - Stylesheet text.
 * @returns the disposer that removes the element.
 */
function injectStylesheet(css: string): () => void {
  const element = document.createElement('style')
  element.dataset.pluginCss = 'dsh-highlights'
  element.textContent = css
  document.head.append(element)
  return () => {
    element.remove()
  }
}

/**
 * Register the plugin's browser contributions.
 * @param ctx - Client root context owning every contribution.
 */
export function apply(ctx: Context): void {
  const translate = ctx.locale.bind(LOCALE_NAMESPACE) as unknown as (key: string, params?: Record<string, string | number>) => string

  ctx.effect(() => injectStylesheet(`${GLOBAL_STYLES}\n${COMPONENT_STYLES}\n${PAGE_STYLES}\n${PANEL_STYLES}`), 'highlights: stylesheets')
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, 'en', en), 'highlights: en dictionary')
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, 'zh', zh), 'highlights: zh dictionary')

  const transport = createTransport()
  const client = new HighlightsClient(transport)
  const painter = new HighlightsPainter()
  const insert = new InsertService()
  ctx.effect(() => () => insert.dispose(), 'highlights: insertion queue')
  // The painter is app-scoped: its lifetime belongs to the runtime, never to a
  // per-session bridge unmount (the W2 defect).
  ctx.effect(() => () => painter.dispose(), 'highlights: painter lifetime')
  // One app-scoped observation service owns the observers, visibility and paint frames.
  const observation: ObservationServiceHandle = createObservationService({
    panelInfo: ctx.layout.panelInfo,
  })
  ctx.effect(() => () => { observation.dispose() }, 'highlights: observation')
  // One single-flight reveal port owns cancellation, supersede and quiescence.
  const reveal: RevealPort = createRevealPort({
    run: createComposedReveal({ ctx, painter }),
    onPendingChange: (pending) => { observation.setRevealPending(pending) },
  })
  ctx.effect(() => () => { reveal.dispose() }, 'highlights: reveal port')
  // One app-scoped selection state owner; surfaces project it.
  const selection: SelectionGesture = createSelectionGesture({
    revealPending: () => reveal.pending.get(),
  })
  // One notice channel for every outcome; surfaces render it instead of owning timers.
  const notice = createNoticeService()
  ctx.effect(() => () => { notice.dispose() }, 'highlights: notice channel')
  // One frame-wide overlay renders every notice; surfaces no longer own timers or copy (T1.4).
  registerNoticeOverlay(ctx, notice)
  // Settings page + the two most-touched preference rows (T1.7).
  registerSettingsSurface(ctx)
  const actions = new HighlightsActionsImpl({ ctx, client, transport, painter, insert, translate, reveal })
  const controller = createCommandController({ notice })
  const commandTable = createCommandTable(actions)
  // Surfaces call this face; every mutation is single-flight and reported through one notice.
  const commands = createCommandSurface(controller, commandTable)

  /** Session that owns a rendered conversation node, read from the nearest column. */
  const sessionOf = (node: HTMLElement | null): string | undefined =>
    node?.closest<HTMLElement>('[data-conversation-session]')?.dataset.conversationSession

  /**
   * Keep one agent proposal (Phase 3).
   *
   * The agent cannot compute a Chat anchor, so the proposal carries the verbatim
   * quote and this resolves it in the rendered transcript — the same projection
   * the selection gesture uses — before writing an agent-authored item through
   * the ordinary create path. Nothing is stored until the user keeps it.
   * @param proposal - the proposal the user kept.
   * @returns the outcome to surface on the tool row.
   */
  const keepProposal = async (proposal: ToolProposal): Promise<ProposalOutcome> => {
    const candidate = captureQuote(proposal.quote)
    if (candidate === null) return { status: 'not-found' }
    const sessionId = sessionOf(candidate.node)
    if (sessionId === undefined) return { status: 'failed' }
    try {
      const record = await actions.createFromAnchor(
        candidate.anchor,
        {
          colorId: proposal.colorId,
          tags: proposal.tags,
          note: proposal.note,
          starred: false,
          author: 'agent',
          state: 'new',
          ...(proposal.intent === undefined ? {} : { intent: proposal.intent }),
        },
        sessionContext(ctx, sessionId),
        client.getSnapshot().hello?.installId ?? 'local',
      )
      return record === null ? { status: 'failed' } : { status: 'saved' }
    } catch {
      return { status: 'failed' }
    }
  }

  // Transcript rows for the agent's highlight tools, including the
  // proposal accept/dismiss path (T2.5 + T3.4).
  registerHighlightToolViews(ctx, { keepProposal })

  // Composer dock: make the pending-insertion queue visible above the input
  // (the queue retries in the background; without this it was invisible).
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'highlights.pending-insert',
    order: 40,
    locale: LOCALE_NAMESPACE,
    inject: (sessionId: string) => ({ insert, sessionId: String(sessionId) }),
  }, PendingInsertStrip)), 'highlights: pending insert strip')

  // Right-click data actions on a Session row and on a tab (S4): copy this
  // session's annotations as Markdown, open the panel, or brief the agent.
  registerHighlightContextMenus(ctx, {
    snapshot: () => client.getSnapshot(),
    openPanel: (sessionId) => {
      ctx.uiWorkspace.openSession(sessionId as Parameters<typeof ctx.uiWorkspace.openSession>[0])
      ctx.sidebarRight.openTab('highlights', {})
    },
    brief: (sessionId, records) => actions.briefSession(sessionId, records),
    copy: copyText,
    t: key => translate(key),
  })

  // Passive resurfacing (Phase 4): the sidebar kept badge + hover preview and
  // the per-turn digest. Both read the already-loaded store and never fetch.
  registerSessionSurfaces(ctx, {
    snapshot: () => client.getSnapshot(),
    subscribe: listener => client.source.subscribe(listener),
    openPanel: () => { ctx.sidebarRight.openTab('highlights', {}) },
  })
  // Policy prototype selection (owner decision recorded in STATUS/plan §10).
  void DEFAULT_POLICY
  /** One command implementation for every create path (Chat surface + bar). */
  const createHighlightCommand: Command<{
    readonly anchor: import('../shared/schema').HighlightAnchor
    readonly draft: HighlightDraft
    readonly sessionId: string
    readonly ids: { messageId?: string; nodeSeq?: number }
  }, import('../shared/schema').HighlightRecord> = {
    id: 'create-highlight',
    capability: 'create',
    label: 'Save highlight',
    async run(args) {
      const record = await actions.createFromAnchor(
        { ...args.anchor, ...(args.ids.messageId === undefined ? {} : { messageId: args.ids.messageId }), ...(args.ids.nodeSeq === undefined ? {} : { nodeSeq: args.ids.nodeSeq }) },
        args.draft,
        sessionContext(ctx, args.sessionId),
        client.getSnapshot().hello?.installId ?? 'local',
      )
      // A failed create is an error outcome + one notice, never a silent null.
      if (record === null) throw new Error(translate('error.generic'))
      return record
    },
  }
  void commandTable
  /** One command implementation for the per-message Save action. */
  const createMarkCommand: Command<{
    readonly nodeKey: string
    readonly messageId: string
    readonly nodeSeq?: number
    readonly sessionId: string
  }, { readonly record: import('../shared/schema').HighlightRecord; readonly created: boolean }> = {
    id: 'create-message-mark',
    capability: 'create',
    label: 'Save message',
    async run(args) {
      const mark = await actions.createMessageMark(
        args.nodeKey,
        args.messageId,
        args.nodeSeq,
        sessionContext(ctx, args.sessionId),
        client.getSnapshot().hello?.installId ?? 'local',
      )
      if (mark === null) throw new Error(translate('error.generic'))
      return mark
    },
  }
  const refresh = (): void => {
    client.refresh(true)
  }
  // Prime the store; a failure is reflected in the snapshot and retried by the UI.
  refresh()

  // S4 — the session tab type and its body.
  registerHighlightsTab(ctx, { client, actions, commands })

  // S6 — save a whole message from Chat's finalised-assistant action row.
  ctx.effect(() => ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: MESSAGE_ACTION_ID,
    order: 40,
    locale: LOCALE_NAMESPACE,
    inject: (sessionId: string) => ({
      saveMark: async (nodeKey: string, messageId: string, nodeSeq?: number) => {
        const outcome = await controller.execute(
          createMarkCommand,
          {
            nodeKey,
            messageId,
            ...(nodeSeq === undefined ? {} : { nodeSeq }),
            sessionId: String(sessionId),
          },
          { recordId: messageId },
        )
        if (outcome.status !== 'ok') return null
        const mark = outcome.value
        // A second Save on the same reply opens the existing mark instead of
        // creating a duplicate; a first Save just returns the new record.
        if (!mark.created) actions.openPanelTab(mark.record)
        return mark
      },
    }),
  }, MessageAction)), 'highlights: message action')

  // Painter host, composer bridge, and click-to-edit card for the on-screen session.
  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: BRIDGE_SLOT_ID,
    order: 50,
    locale: LOCALE_NAMESPACE,
    inject: () => ({
      hooks: { snap: client.source },
      actions,
      painter,
      copy: copyText,
      insert,
      client,
      observation,
      selection,
      commands,
      notice,
      openTab: () => {
        ctx.sidebarRight.openTab('highlights', {})
      },
      createSelection: (
        anchor: Parameters<typeof actions.createFromAnchor>[0],
        sessionId: string,
        draft: HighlightDraft,
        ids: { messageId?: string; nodeSeq?: number },
      ) => {
        void controller.execute(createHighlightCommand, { anchor, draft, sessionId, ids })
      },
    }),
  }, SessionBridge)), 'highlights: session bridge')

  // S5 — the global page and its navigation row.
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_KEY,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ hooks: { snap: client.source }, actions, notice, commands }),
  }, HighlightsPage)), 'highlights: global page')

  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    locale: LOCALE_NAMESPACE,
    label: () => translate('nav.label'),
  }, HighlightsIcon)), 'highlights: sidebar row')

  // T1.6 — keyboard capture. Mod+Shift+H saves the live selection to the
  // last-used colour with no popover; Mod+Shift+K opens this session's tab.
  // `regions: ['page']` keeps both chords out of the composer.
  const webBindings = (code: string): Record<string, { code: string; modifiers: string[] }> => {
    const binding = { code, modifiers: ['primary', 'shift'] }
    return Object.fromEntries(
      ['web', 'desktop'].flatMap((runtime) => ['linux', 'windows', 'macos'].map((platform) => [`${runtime}:${platform}`, binding])),
    )
  }

  /**
   * Register one chord, trying candidates in order.
   *
   * `ctx.shortcuts.register` throws when a default binding collides with a
   * shipped command, and an uncaught throw here fails the whole plugin's
   * activation. A taken chord therefore degrades to the next candidate, and a
   * total miss logs instead of killing the plugin.
   * @param id - command id.
   * @param labelKey - locale key for the command label.
   * @param codes - physical key codes, most preferred first.
   * @param resolve - gesture resolver.
   * @returns the registration's disposer, or a no-op.
   */
  const registerChord = (
    id: string,
    labelKey: string,
    codes: readonly string[],
    resolve: () => ShortcutResolution,
  ): (() => void) => {
    for (const code of codes) {
      try {
        const dispose = ctx.shortcuts.register({
          id,
          label: () => translate(labelKey),
          aliases: [],
          regions: ['page'],
          modals: [],
          defaults: webBindings(code),
          resolve,
        } satisfies ShortcutCommand)
        // First-run guidance must show the chord that actually registered.
        if (id === 'highlights.save-selection') setCaptureChordLabel(chordLabel(code))
        return dispose
      } catch {
        // Binding taken by a shipped command; try the next candidate.
      }
    }
    ctx.logger('highlights').warn(`no free chord for ${id}; the action stays available in the UI`)
    return () => undefined
  }

  ctx.effect(() => registerChord(
    'highlights.save-selection',
    'action.highlight',
    ['KeyH', 'KeyJ', 'KeyU'],
    (): ShortcutResolution => {
      const candidate = captureSelection(window.getSelection())
      if (candidate === null) return { status: 'pass' }
      const sessionId = sessionOf(candidate.node)
      if (sessionId === undefined) return { status: 'pass' }
      return {
        status: 'handled',
        run: () => {
          const draft: HighlightDraft = {
            colorId: actions.lastColorId(),
            tags: [],
            note: undefined,
            starred: false,
          }
          void controller.execute(createHighlightCommand, { anchor: candidate.anchor, draft, sessionId, ids: {} })
          window.getSelection()?.removeAllRanges()
        },
      }
    },
  ), 'highlights: save-selection shortcut')

  ctx.effect(() => registerChord(
    'highlights.open-panel',
    'action.openPanel',
    ['KeyK', 'KeyL', 'KeyP'],
    (): ShortcutResolution => ({
      status: 'handled',
      run: () => { ctx.sidebarRight.openTab('highlights', {}) },
    }),
  ), 'highlights: open-panel shortcut')

  // Optional visibility poll, advertised by the Host through `hello`.
  ctx.effect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const sync = (): void => {
      const interval = client.getSnapshot().hello?.pollIntervalMs ?? 0
      if (interval <= 0) {
        if (timer !== undefined) clearInterval(timer)
        timer = undefined
        return
      }
      if (timer !== undefined) return
      timer = setInterval(() => {
        // Never poll while the Host is known unreachable: retry happens on a
        // connection reset, window focus or an explicit user refresh.
        if (!document.hidden && !client.getSnapshot().offline) client.refresh(true)
      }, interval)
    }
    const unsubscribe = client.source.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      if (timer !== undefined) clearInterval(timer)
    }
  }, 'highlights: visibility poll')

  // Keep lists fresh when the transport comes back or the window regains focus.
  ctx.effect(() => {
    const onReset = (): void => { client.refresh(true) }
    const onFocus = (): void => { client.refresh() }
    const disposers = [
      ctx.on('connection/reset', onReset),
      (() => {
        window.addEventListener('focus', onFocus)
        return () => { window.removeEventListener('focus', onFocus) }
      })(),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'highlights: freshness')
}
