# Isolated dev instance (Phase 0)

These scripts create and inspect a **private** `DSH_HOME` so write paths, large
lists and corrupt-store recovery can be exercised without touching the owner's
real store (`~/.dsh/storages/highlights`).

## Safety rules

- Always pass a private `--home` (e.g. `.dsh-dev-home/`, gitignored by the
  parent repo's rules; keep it outside `storages/`).
- `reset.mjs` refuses to remove `~/.dsh` and refuses without `--yes`.
- Never copy a real record into the dev store: ids/anchors are per-machine.

## Seed

```bash
node tools/dev-instance/seed.mjs --home .dsh-dev-home --count 500
node tools/dev-instance/seed.mjs --home .dsh-dev-home --count 10000 --sessions 8 --clean
node tools/dev-instance/seed.mjs --home .dsh-dev-home --count 100 --corrupt 1
node tools/dev-instance/verify.mjs --home .dsh-dev-home
```

The seeder writes the storage-domain's documented on-disk shape:

```text
<DSH_HOME>/storages/highlights/
├── meta/install.json              { version, record: { installId, createdAt } }
└── records/<uuid>.json            { version, record: HighlightRecord }
```

## Running a dev GUI (manual)

The seeded store is only half of the instance: a GUI needs its own Host process.
Start one with a private home and a spare port, with the plugin installed into
that profile, then load it in a separate browser profile/CDP client:

```bash
DSH_HOME="$PWD/.dsh-dev-home" dsh web --port 3081   # confirm flags with `dsh web --help`
```

Do **not** start this from an agent session without checking that the port and
profile are free; the owner's `:3080` GUI must stay untouched. The live perf
harness reads its cookie from a separately minted browser session (see
`tests/perf/README.md`).

## Corrupt-store fixture

`--corrupt N` writes `N` malformed record files. Expected behaviour after Phase
2B: the Host logs and quarantines them, activation succeeds, every valid record
still lists. Before Phase 2B it is expected to fail activation (that is the H11
defect under test).
