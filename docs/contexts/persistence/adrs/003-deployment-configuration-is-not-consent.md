# ADR-003 — Deployment configuration is not Consent

**Status:** Accepted · **Context:** Persistence & Distribution · **Date:** 2026-11-15

## Context

The plugin needs values that differ between deployments — a live-record cap, a retention
window, whether Attribution is appended to an Insertion, an optional refresh interval — and it
separately needs the Reader's Consent: an access level, an access scope and paper-item
Visibility. These have different owners, different lifetimes and different trust. A deployment
belongs to whoever composes the profile, and the values a deployment sets can be supplied or
replaced by a higher layer and are read once when the Host activates. Consent belongs to the
Reader alone: it must be revocable by them, must take effect when they change it, and must
never depend on whoever edits a profile.

## Decision

Keep deployment configuration in the profile entry, read at activation, as a closed list of
operational knobs. Keep Reader-owned Consent as Reader-owned state in the plugin's own durable
store. Nothing may carry or override the other: no deployment field grants, widens, narrows or
revokes access, and no Consent value is written into the profile.

## Why

- **Holding Consent in the deployment configuration** was rejected. A configuration write
  would then grant the Agent access; the deployment layer could override or replace the value;
  a profile reset or reinstall could silently reset the Reader's privacy decision to the
  plugin's default; and the coupling between access level and access scope could not be
  enforced at the point of writing.
- **Making deployment configuration writable from a Reader-facing surface** was rejected for
  the mirror reason: it would fold a deployment-scoped, replaceable value into a Reader
  decision, delay a Consent change behind a restart, and blur who is allowed to set a storage
  cap.
- **One combined configuration surface** was rejected because the two kinds of value answer to
  different people; a single surface would have to explain, on every field, whose decision it
  is, and would make the ownership distinction invisible where it matters most.
- **Reading a deployment default as "the plugin's default Consent"** was rejected: the default is a
  value the plugin starts from, not a decision someone made, and conflating them would make a
  deployment appear to consent on the Reader's behalf.

## Consequences

- A deployment can never read, widen or revoke the Reader's Margin by configuring the plugin;
  the only way to remove the Agent's access entirely is the Reader's own Consent (or not
  installing the plugin).
- A Consent change takes effect when the Host next evaluates it, without an activation, because
  it is stored state rather than a process fact.
- A deployment-configuration change takes effect only at the next activation, and the Reader is
  never affected by one silently.
- Uninstalling and reinstalling the plugin restores the Reader's stored Consent along with the
  Margin, so removing the plugin is not a revocation; a Reader who wants to withdraw access
  does so through Consent.
- The plugin carries two configuration surfaces that must be explained separately: the
  profile's operational knobs, which the Reader generally cannot change from the UI, and the
  Consent decision, which only the Reader can change.
- Consent shares the store's local, single-user trust model, so anyone who can read the
  Reader's profile can read the stored Consent level as well as the Highlights.
- It becomes hard to audit Consent centrally: a deployment cannot prove what a Reader granted
  without reading their stored data, which is exactly the privacy property being preserved.

## References

- [CONTEXT_MAP](../../../CONTEXT_MAP.md);
  [Distribution and upgrade](../specs/distribution-and-upgrade.md);
  [ADR-002](002-local-first-single-user-trust.md).
- Glossary: [Consent](../../../UBIQUITOUS_LANGUAGE.md#6-consent-and-the-agent-surface),
  [Visibility](../../../UBIQUITOUS_LANGUAGE.md#2-the-core-objects).
