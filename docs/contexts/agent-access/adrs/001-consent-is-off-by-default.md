# ADR-001 — Consent is off by default
**Status:** Accepted · **Context:** Agent Access · **Date:** 2026-11-15

## Context

The Margin holds the Reader's most sensitive text, including Notes of up to two thousand
characters, and it lives outside the Session log precisely so that it is not model material. The
Agent surface is model-facing and, once registered, invisible to the Reader; the Agent runtime
also registers tools globally, so every caller the harness exposes inherits whatever is
registered. The product promises that the margin costs nothing until it is wanted: a default-on
surface would put the operation descriptions in every request and would make the Reader's saved
passages reachable
before the Reader had ever considered the question. Consent itself is a domain commitment — the
Margin belongs to the Reader, not to the Agent — so its direction has to be decided as a
principle rather than as a convenience setting.

## Decision

Consent defaults to Access level `off`, Access scope `session` and Visibility `agent`, so no Agent
surface exists until the Reader grants one. Each of the three permissions can be narrowed from
its default and none can be widened by a call.

## Why

- **Default read, rejected.** It is the friendly-looking choice, but it makes every saved Highlight
  model-reachable before the Reader made any decision, and it turns a privacy commitment into an
  opt-out buried in settings. It also costs every request the operation descriptions from the
  first launch.
- **Default scoped to the current Session, rejected.** "Only this conversation" sounds modest, but
  the current Session is exactly where the Reader is working, and its Notes are the sensitive
  part. A grant of the current Session is still a grant the Reader did not make.
- **Default proposals-only, rejected.** The write tier without the read tier cannot help: the Agent
  cannot see what it is proposing against, and it still costs the operation descriptions on every
  request. A
  read-free tier would also be a new Access level with its own consent wording.
- **A deployment flag instead of Reader Consent, rejected.** Deployment configuration is not
  Consent. An operator must not be able to grant or widen access to a Reader's Margin, and a
  deployment knob that appeared to do so would confuse the two contracts the domain keeps apart.
- **Default off, accepted.** It is the only default that expresses the Guest rule without relying
  on the Reader to discover a setting.

## Consequences

- Nothing from the Margin is reachable until the Reader acts, and an installation that never opens
  settings has exactly the model experience it would have without the plugin.
- A turn that ignores the Margin costs nothing, and the request prefix stays stable while Consent
  is unchanged.
- The Reader must find the consent page before the Agent can help, so the feature's benefit is
  paid for by one deliberate act; surfaces that mention visibility owe the Reader the truth about
  the current grant.
- Every future Agent-facing capability inherits the default-off obligation: it may not appear
  before the Reader has granted something, and the widening must be a separately specified change.
- **Hard:** revocation has to be a real removal of the surface rather than a hidden filter,
  because the default promise is "nothing" and a partly remaining surface would weaken the
  guarantee. Explaining why nothing happens is a support and copy burden the product accepts.

## References

- [Consent specification](../specs/consent.md)
- [Agent Access context](../CONTEXT.md)
- [UBIQUITOUS_LANGUAGE.md §6](../../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface)
- [CONTEXT_MAP.md](../../../CONTEXT_MAP.md)
