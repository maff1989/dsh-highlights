/**
 * Local slot-contract declaration for the two Settings seats this plugin fills
 * (`settings.section`, `settings.general.item`).
 *
 * The runtime declares both slots — the shipped Web composition mounts
 * `ui-settings` and `ui-settings-general` — but their TypeScript contracts live
 * in `@deepseek-ai/dsh-client-ui-settings`, a package this plugin does not
 * depend on. Adding it is a new dependency, so the published contract is
 * restated here instead: a root-scoped ordered list; a section receives the
 * shell's `close` affordance, a General row receives no owner props at all.
 *
 * // workaround: W15 — see docs/workaround-ledger.md (ask #12).
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One settings page per list entry (shell owns nav and modal state). */
    'settings.section': {
      kind: 'list'
      scope: 'root'
      owner: {
        /** Close the settings panel (the shell owns the open state). */
        readonly close: () => void
      }
    }
    /** One preference row inside the General section (owner passes nothing). */
    'settings.general.item': {
      kind: 'list'
      scope: 'root'
      owner: {
        /** Marker field: item owner props are intentionally empty. */
        readonly children?: never
      }
    }
  }
}

export {}
