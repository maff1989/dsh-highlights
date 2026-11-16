# ADR-002 — Local first, single user, and the owner Peer as the whole trust boundary

**Status:** Accepted · **Context:** Persistence & Distribution · **Date:** 2026-11-15

## Context

The Margin has exactly one human actor, the Reader, on one local installation. The plugin's
two halves are separate processes joined by an authenticated channel that the harness fences
to the owner Peer, but that channel carries no actor identity and offers no per-record
authorisation. The domain has no sharing, membership or collaboration concepts, and the
stored Highlights are user content held under the Reader's profile with the same trust model
as workspace and Session data.

## Decision

Treat the authenticated owner-Peer channel as the whole access boundary — single-user local
trust. The store makes no per-record authorisation decision, records no actor, and stores
every Highlight as the Reader's own content; only the harness's authentication and owner
fence stand between the Margin and anything else.

## Why

- **Per-record authorisation** was rejected: the harness supplies no actor identity to key a
  decision on, so any scheme would either invent an actor it cannot verify or defend a
  boundary that has no people on the other side of it.
- **A per-user or per-installation encryption key managed elsewhere** was rejected: there is
  no key management, no second user to separate from, and a key stored beside the data
  protects nothing against the threat that matters, which is a process that can already read
  the profile.
- **A multi-tenant store** was rejected outright: the domain defines one Reader and no
  membership, so tenancy would be a new domain, not a storage feature.
- **Authorising per Session** was rejected: it duplicates what Consent already decides and
  would conflate "may the Agent read this" with "may a process reach the bytes", which are
  different questions with different owners.

## Consequences

- Anyone who can read the Reader's profile can read every Highlight, its Quote and its Note;
  anything that can serve a same-origin owner request can read and write every record.
- There is no audit trail of who changed what, because there is no actor to name.
- Consent remains meaningful, but only as the Reader's grant to the Agent: it is not an access
  control on the stored bytes and must not be described as one.
- A compromised or malicious page served from the same origin as the GUI is inside the trust
  boundary; the origin fence is the only defence this context owns.
- Adding multi-user support, cross-device sync or encryption at rest is a change to this trust
  decision, not a store feature, and must be decided before it is built.
- Uninstalling the plugin does not revoke anything: the data and the stored Reader decisions
  stay in the profile, so a Reader who wants the bytes gone must wait out the retention window
  and the next activation, or remove the profile's stored data themselves.
- It becomes hard to make a claim of "only you can read this": the honest statement is "only
  someone who can read your profile", and every privacy statement must say that.

## References

- [Freshness and transport](../specs/freshness-and-transport.md);
  [Record store](../specs/record-store.md).
- Glossary: [Reader](../../../UBIQUITOUS_LANGUAGE.md) §1,
  [Connection / Peer](../../../UBIQUITOUS_LANGUAGE.md) §9.
