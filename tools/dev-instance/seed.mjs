#!/usr/bin/env node
/**
 * Seed an isolated `dsh-highlights` store for the dev/perf instance.
 *
 * Writes the same on-disk shape the Host's `storage-domain` uses:
 *   <DSH_HOME>/storages/highlights/meta/install.json   { version, record: { installId, createdAt } }
 *   <DSH_HOME>/storages/highlights/records/<uuid>.json { version, record: HighlightRecord }
 *
 * Never point `--home` at the real `~/.dsh`: this tool only writes, never merges.
 *
 * Usage:
 *   node tools/dev-instance/seed.mjs --home .dsh-dev-home --count 500
 *   node tools/dev-instance/seed.mjs --home .dsh-dev-home --count 10000 --clean
 *   node tools/dev-instance/seed.mjs --home .dsh-dev-home --corrupt 1
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Parse `--flag value` arguments. */
function parseArgs(argv) {
  const args = { home: undefined, count: 500, sessions: 4, corrupt: 0, clean: false, 'message-marks': 0 }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (key === 'clean') { args.clean = true; continue }
    if (next === undefined || next.startsWith('--')) throw new Error(`missing value for --${key}`)
    args[key] = key === 'count' || key === 'sessions' || key === 'corrupt' || key === 'message-marks' ? Number(next) : next
    index += 1
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
if (typeof args.home !== 'string' || args.home === '') {
  console.error('usage: node tools/dev-instance/seed.mjs --home <private-DSH_HOME> [--count N] [--sessions N] [--corrupt N] [--clean] [--message-marks N]')
  process.exit(2)
}
const home = resolve(args.home)
const domain = join(home, 'storages', 'highlights')
const recordsDir = join(domain, 'records')
const metaDir = join(domain, 'meta')
if (args.clean) rmSync(domain, { recursive: true, force: true })
mkdirSync(recordsDir, { recursive: true })
mkdirSync(metaDir, { recursive: true })

const installId = randomUUID()
const now = Date.now()
writeFileSync(join(metaDir, 'install.json'), `${JSON.stringify({ version: 1, record: { installId, createdAt: now } }, null, 2)}\n`)

/** One deterministic record. */
function makeRecord(index) {
  const turn = Math.floor(index / 2) + 1
  const step = (index % 2) + 1
  const sessionId = `session-dev-${String(index % args.sessions).padStart(2, '0')}`
  const quote = `dev highlight ${String(index).padStart(5, '0')}`
  const prefix = 'source '
  const timestamp = now - (args.count - index) * 1000
  const messageMark = args['message-marks'] > 0 && index % 10 === 0
  const anchor = messageMark
    ? { nodeKey: `9:assistant${turn}:${step}`, groupPart: 'response', kind: 'message', sourceIndex: 0, quote: `message mark ${index}`, prefix: '', suffix: '', start: 0, end: 9 + String(index).length, projection: 1, turn, step }
    : { nodeKey: `9:assistant${turn}:${step}`, groupPart: 'response', kind: 'text', sourceIndex: 0, quote, prefix, suffix: '', start: prefix.length, end: prefix.length + quote.length, projection: 1, turn, step }
  return {
    schemaVersion: 1,
    id: randomUUID(),
    sessionId,
    origin: installId,
    anchor,
    colorId: (index % 5) + 1,
    tags: index % 7 === 0 ? ['dev'] : [],
    ...(index % 11 === 0 ? { note: `seeded note ${index}` } : {}),
    starred: index % 13 === 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  }
}

for (let index = 0; index < args.count; index += 1) {
  const record = makeRecord(index)
  writeFileSync(join(recordsDir, `${record.id}.json`), `${JSON.stringify({ version: 1, record }, null, 2)}\n`)
}
for (let index = 0; index < args.corrupt; index += 1) {
  const id = randomUUID()
  writeFileSync(join(recordsDir, `${id}.json`), '{"version":1,"record":{"schemaVersion":1,"id":"not-the-key"')
}

console.log(`seeded ${args.count} records across ${args.sessions} sessions in ${domain}`)
if (args.corrupt > 0) console.log(`wrote ${args.corrupt} corrupt record(s)`)
console.log(`installId ${installId}`)
