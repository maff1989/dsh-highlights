# Distribution and upgrade

**Status:** Accepted
**Context:** Persistence & Distribution
**Date:** 2026-11-15

## Definitions

- **Package** — the one installable artefact that carries both halves of the plugin.
- **Bundle** — the package as the harness installs it: one entry in the Reader's profile that
  serves the Host half and hands the browser half to the page.
- **Profile** — the installed plugin and bundle composition the GUI runs. Installation is the
  Reader's or operator's work; the plugin never edits the profile.
- **Activation** — the moment a process adopts the installed plugin set and the plugin's Host
  half opens its store.
- **Activation boundary** — the boundary at which an install, an upgrade, a rollback or a
  deployment-configuration change takes effect. A running process keeps the plugin set and
  configuration it activated with.
- **Deployment configuration field** — a value a deployment sets for the profile: the
  live-record cap, the retention window, whether Attribution is appended to an Insertion, and
  the optional refresh interval. Read at activation; fixed for the life of the process.
- **Reader-owned Consent** — Access level, Access scope and per-item Visibility, decided by
  the Reader and stored as Reader-owned state. See [Agent Access](../../agent-access/CONTEXT.md).
- **Half version** — the version of the Host half or of the browser half of the package. The
  two may differ while the same process runs.
- **Wire addition** — a field added to the exchange between the halves. Optional by
  construction.
- **Protocol number** — the number each half states at the first exchange, so both know which
  exchange they are speaking.
- **Rollback** — reinstalling an earlier package version. It takes effect at the next
  activation and does not touch stored data.
- **Uninstall** — removing the bundle from the profile. It takes effect at the next
  activation and does not touch stored data.

## Constraints

- The plugin is installed into a profile that the Reader or operator controls. It cannot add,
  remove or alter a profile row itself.
- The Host half runs inside the harness process and is composed at activation; the browser
  half is delivered to the page. They have separate update moments.
- The harness supplies no sanctioned way for an outside plugin to be reloaded into a running
  process without restarting it.
- Deployment configuration and Reader-owned Consent have different owners, different
  lifetimes and different failure modes, and the harness offers only the profile for the
  former.
- Stored Highlights outlive the plugin's presence in the profile: they are the Reader's data,
  held under the Reader's profile, not the plugin's.
- The plugin's two halves must keep working while one of them is newer than the other,
  because the browser half can be reloaded independently.

## Problem

A plugin that only works when both halves are installed, the same version, restarted together
and configured identically at every moment would be fragile in exactly the way a private
Margin cannot afford. Three forces collide. First, the deployment and the Reader own
different things: a cap or a retention window belongs to whoever composed the profile, while
whether the Agent may see anything at all belongs to the Reader — and a design that lets a
deployment field carry consent makes privacy a matter of profile editing. Second, the two
halves are updated by different acts: the Host needs a process restart, the page needs a
reload, so skew is normal rather than exceptional. Third, uninstalling a plugin is a routine
act, and the Reader's booked passages must not be a casualty of it. The distribution
specification exists to make each of those ordinary and safe.

## Solution

**One package, two halves, installed as a bundle.** The package is installed into a profile as
a bundle. Activation composes the Host half, which opens the store and joins the exchange, and
serves the browser half to the page. A profile that lacks a service the Host needs refuses
activation rather than mounting half a plugin, so the failure is loud and attributable.

**Activation is the boundary.** An install, an upgrade, a rollback and any deployment-
configuration change take effect at the next activation of the Host. A running process keeps
the plugin set and configuration it activated with. That is a bound the Reader can plan
around: the version that answers is the version that was installed when the process started.

**Deployment configuration is a closed list of knobs, read at activation.** The live-record
cap (default 10 000), the retention window (default 30 days), whether Attribution is appended
to an Insertion (enabled unless disabled), and the optional refresh interval (disabled unless
set). The Host advertises the values the browser half needs at the first exchange, so the
browser half never reads configuration itself and a configuration change is never
half-applied within a process.

**Deployment configuration is not Consent.** The cap, the retention window, attribution and
the refresh interval are deployment knobs. Access level, Access scope and per-item Visibility
are the Reader's, stored as Reader-owned state (see
[ADR-003](../adrs/003-deployment-configuration-is-not-consent.md)). No deployment field
grants, widens, narrows or revokes access; a deployment cannot read the Margin by configuring
it. A configuration change takes effect at the next activation; a Consent change takes effect
when the Host next evaluates it, because it is stored state rather than a process fact.

**Uninstall preserves the Margin.** Removing the bundle from the profile leaves every stored
Highlight and every stored Reader decision untouched. Reinstalling finds the Margin again — a
routine experiment with a plugin is not an erasure. The store is destroyed only by the
retention purge or by the operator removing the profile's stored data deliberately.

**Version skew is normal.** The browser half may be newer than the running Host: a page
reload delivers the new browser half while the Host keeps the version it activated with.
Every wire addition is optional and every consumer tolerates an absent optional field by
applying the documented fallback. A consumer also tolerates an optional field it does not
know. The first exchange negotiates the protocol number; a mismatch is refused with a stated
outcome rather than interpreted, so a pair of halves that cannot understand each other says
so instead of misreading a record.

## User Stories

- As a **Reader**, I want installing the plugin to need one restart and no rebuild of the
  harness, so that trying it is cheap.
- As a **Reader**, I want my Highlights to survive an uninstall and reinstall, so that
  uninstalling is not a decision about my data.
- As a **Reader**, I want a deployment's configuration never to change what the Agent can
  see, so that my Consent is mine.
- As an **operator**, I want a cap, a retention window, attribution and a refresh interval I
  can set for this deployment, so that one plugin can serve different situations.
- As an **operator**, I want a configuration change to take effect at a known moment, so that
  I do not have to guess whether it applied.
- As a **maintainer**, I want the browser half to update without a Host restart, so that a UI
  fix does not require taking the GUI down.
- As a **maintainer**, I want an absent optional field to be harmless, so that a half-rolled
  deployment cannot corrupt a record set.
- As a **maintainer**, I want a protocol mismatch to be refused, so that two incompatible
  halves do not interpret each other's records.

## Acceptance Criteria

**Install takes effect at activation**
1. **Given** a package installed into a profile while a Host process is running,
   **when** that process keeps running,
   **then** it keeps the plugin set it activated with, and the next activation adopts the
   installed set.

**A configuration change waits for the next activation**
2. **Given** a running Host enforcing a live-record cap,
   **when** the deployment lowers the cap in the profile,
   **then** the running Host keeps enforcing the value it activated with until it is activated
   again.

**A configuration change is not a Consent change**
3. **Given** a stored Reader-owned Consent,
   **when** the deployment changes the cap, the retention window, the Attribution setting or
   the refresh interval,
   **then** the Access level, the Access scope and every per-item Visibility are unchanged.

**A Consent change needs no Host restart**
4. **Given** the Host is running and the Reader changes Consent in a surface,
   **when** the Host next evaluates the Agent's access,
   **then** it uses the newly stored Consent without an activation, because Consent is stored
   Reader-owned state and not deployment configuration.

**Uninstall preserves stored Highlights**
5. **Given** stored Highlights and a Host process,
   **when** the plugin is uninstalled and the Host is activated again without it,
   **then** the stored Highlights remain intact and are found again after a reinstall.

**Uninstall preserves the Reader's decision**
6. **Given** a stored Reader-owned Consent,
   **when** the plugin is uninstalled and later reinstalled,
   **then** the stored Consent is what the reinstalled plugin reads, not the plugin's default.

**A newer browser half tolerates an absent optional field**
7. **Given** a browser half newer than the running Host and a record from the Host without an
   optional field the browser half knows about,
   **when** the browser half renders that record,
   **then** it applies the documented fallback for the absent field and does not refuse or
   corrupt the record set.

**An older browser half ignores an unknown field**
8. **Given** a browser half older than the running Host and a record carrying an optional
   field the browser half does not know,
   **when** the browser half reads the record set,
   **then** it preserves the values it knows and does not fail on the extra field.

**A protocol mismatch is refused**
9. **Given** halves stating different protocol numbers,
   **when** they make their first exchange,
   **then** the exchange is refused with a stated outcome and neither half interprets the
   other's records.

**A protocol match proceeds across half versions**
10. **Given** halves stating the same protocol number and different half versions,
    **when** they make their first exchange,
    **then** the exchange proceeds and both operate on the records they understand.

**The browser half updates without a Host restart**
11. **Given** a running Host and a newly rebuilt browser half,
    **when** the page reloads,
    **then** the page runs the new browser half against the running Host, and the first
    exchange negotiates before any record is interpreted.

**Rollback preserves data**
12. **Given** a store written by the installed version,
    **when** an earlier package version is installed and the Host activated,
    **then** the store opens with the records the earlier version can read, and no record is
    rewritten to accommodate the rollback.

**A missing required capability refuses activation**
13. **Given** a profile composition that lacks a service the Host half requires,
    **when** the Host activates,
    **then** the plugin refuses activation as a whole and the refusal is attributable to the
    missing service.

**Separate installations do not share a store**
14. **Given** two installations with their own profiles and their own stored data,
    **when** each plugin instance writes a Highlight,
    **then** each record carries its own installation's Origin and neither installation reads
    the other's records.

## Implementation Decisions

- **One package serves both halves.** A single installed entry declares the Host half and the
  browser half, so there is one artefact to install, version and uninstall, and the two halves
  cannot drift into separate installation stories.
- **Configuration is read once, at activation, and advertised onwards.** The Host reads its
  deployment configuration when it activates; the browser half receives the values it needs
  through the first exchange and treats the Host as the authority. This is deliberate: a
  configuration value the browser half read independently could be applied to a process the
  Host had not configured.
- **Deployment configuration and Reader-owned Consent are stored in different places, on
  purpose.** The former lives in the profile row; the latter is Reader-owned state in the
  record store. The ownership difference is the whole reason for the split, not an
  implementation detail.
- **Required capabilities are declared and checked as a set.** The Host half needs the
  harness's connection service and durable storage facility to be useful; the plugin refuses
  activation if either is absent instead of offering a surface over a channel that
  cannot answer.
- **The wire is additive and negotiable.** A new optional field may be added to the exchange
  in a browser-half-only release; an old consumer applies a fallback and a new consumer
  tolerates absence. A change that cannot be expressed additively is a protocol-number change,
  which is refused rather than guessed.
- **The store is not rewritten for a version.** Neither upgrade nor rollback edits stored
  records to fit the running version. The record shape is validated where it is read, and a
  record a version cannot validate is isolated and reported rather than repaired in place.
- **Uninstall is a profile act only.** No part of the plugin deletes stored data when it is
  removed, and the Reader is told where the data lives rather than having a deletion
  performed on their behalf.

### Deferred Decisions

| Decision | Seam |
|---|---|
| Publishing the package and its browser-artefact contract | The package is one installable artefact; the build and publication story sits outside the plugin's runtime contracts |
| Writing deployment configuration from a Reader-facing surface | Deployment configuration is deliberately a profile input; making it writable would fold deployment and Reader ownership together and needs [ADR-003](../adrs/003-deployment-configuration-is-not-consent.md) revisited |
| Record-shape migration across versions | Each record carries the shape marker it was written with, so a future open can distinguish shapes |
| Export, import and cross-device sync | Identity, version, timestamps, deletion moment and Origin are stored; no transport exists |
| Whether uninstalling should revoke Consent or offer to erase stored data | Uninstall is stated as data-preserving; changing that is a product and privacy decision, not a packaging detail |
| A second stored collection or a renamed store | The stored data is identified by one installation and one store; a second store would be a new package or profile decision |

## Testing Strategy

- **Installation tests** run against a private profile with its own stored data: install,
  activate, write a Highlight, uninstall, activate again, reinstate, and assert that the
  stored Highlights and the stored Consent are unchanged.
- **Configuration tests** activate with one set of values, change the profile, activate again,
  and assert that the old values governed the first process and the new values the second,
  while Consent is untouched throughout.
- **Version-skew tests** pair a browser half and a Host half at different versions and assert
  tolerant reads in both directions, with a fallback for an absent optional field and no
  failure on an unknown one.
- **Protocol tests** present matching and mismatching protocol numbers and assert that a
  mismatch is refused before any record is interpreted.
- **Capability tests** activate in a composition missing a required service and assert that
  the plugin refuses activation rather than half-mounting.
- **Isolation tests** run two installations and assert that neither sees the other's records
  and that Origin distinguishes them.
- **Artefact tests** assert that both halves come from one installed package and that the
  build carries the same identity into each half.

## Out of Scope

- The commands an operator runs, the package build and the bundling mechanics.
- The development loop, hot reloading and how a page picks up a new browser half.
- The exact shape of the exchange beyond its versioning and optional-field rules (see
  [freshness and transport](freshness-and-transport.md)).
- The record store's durability, retention and cap guarantees (see
  [record store](record-store.md)).
- What Consent means and how it is enforced (see [Agent Access](../../agent-access/CONTEXT.md)).
- Backup of the Reader's profile and the operating system's file permissions.

## Open Questions

None outstanding. The four questions this specification raised are resolved:

1. **Uninstall and private content.** Uninstall does not erase, and the Reader must be told: the
   installation-facing documentation and the uninstall step state that stored Highlights, including
   private Notes, remain on disk until the store is removed or the retention purge runs. A warning is
   an obligation on installation copy, not a new store behaviour.
2. **Live-tunable cap and retention.** No. Both are activation-time facts; changing either needs an
   activation. A live-tunable knob would break the single boundary the rest of the contract relies
   on, so it stays deferred.
3. **A much newer browser half.** Degrade rather than refuse: an absent optional field uses its
   documented fallback. Where the absent value is needed for a decision with a privacy consequence,
   the fallback is the safe default (Consent absent reads as `off`), so a degraded view can never
   widen access.
4. **Rollback over a newer stored shape.** Open, isolate the records this version cannot read, report
   them and leave the bytes untouched. Refusing to open would take the whole Margin away from the
   Reader, which is strictly worse than a partial view that says what is missing.
