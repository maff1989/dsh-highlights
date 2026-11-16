/**
 * The per-message "save to highlights" action (S6).
 *
 * Rendered in Chat's finalised-assistant action row, which supplies the durable
 * message id. The durable node identity comes from the Chat snapshot, so the
 * saved mark anchors to the same node a text selection would.
 */
import type { ReactNode } from 'react'
import { IconListPenOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

/** The minimal Chat node-store shape this action reads at click time. */
interface ChatNodeStoreLike {
  values(): readonly {
    readonly key: string
    readonly anchorSeq?: number
    readonly data?: { readonly finalNode?: { readonly messageId?: string } }
  }[]
}

/** What the plugin injects into the action. */
export interface MessageActionInjected {
  /** Save a whole-message mark for the given node. */
  readonly saveMark: (nodeKey: string, messageId: string, nodeSeq?: number) => void
}

/** Props the renderer assembles for this registration. */
export type MessageActionProps = PropsRuntime<'conversation.chat.assistant-actions'> & PropsLocale<'highlights'> & InjectFace<MessageActionInjected>

/**
 * Render the save action for one finalised assistant message.
 * @param props - durable message id, copy, and the injected callback.
 * @returns the action button.
 */
export function MessageAction({ t, messageId, saveMark, useChat }: MessageActionProps): ReactNode {
  // Selecting the live node store is identity-stable across Chat snapshots, so
  // this action no longer re-renders once per streamed token. The node is
  // resolved at click time, when it must be current anyway.
  const store = useChat(current => current.nodes) as unknown as ChatNodeStoreLike | undefined

  /** Resolve the node identity of this message at click time. */
  const nodeOf = (): { key: string; seq?: number } | null => {
    const nodes = store?.values() ?? []
    for (const node of nodes) {
      if (node.data?.finalNode?.messageId === messageId) {
        return { key: node.key, ...(node.anchorSeq === undefined ? {} : { seq: node.anchorSeq }) }
      }
    }
    return null
  }

  return (
    // Chat's action row wraps every icon in the product `Tooltip` (bottom
    // placement); use the same primitive so the hover bubble inherits the
    // product styling instead of the browser's native `title` tooltip.
    <Tooltip label={t('action.saveMessage')} side="bottom">
      <button
        type="button"
        // The class reproduces Chat's MessageIconActions geometry (see
        // `.dshhl-message-action` in styles.ts); the row owns no button CSS the
        // plugin could inherit, so the geometry is mirrored with product tokens.
        className="dshhl-message-action"
        aria-label={t('action.saveMessage')}
        onClick={() => {
          const node = nodeOf()
          if (node === null) return
          saveMark(node.key, messageId, node.seq)
        }}
      >
        <IconListPenOutlineRegular />
      </button>
    </Tooltip>
  )
}
