/** Sidebar icon for the global Highlights panel; the sidebar owns the row around it. */
import type { ReactNode } from 'react'
import { IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the highlights glyph at the size the sidebar asks for.
 * @param props - the sidebar's icon share: requested edge and selection state.
 * @returns the icon element.
 */
export function HighlightsIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <IconListPenOutlineRegular size={size} />
}
