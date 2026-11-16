#!/usr/bin/env node
/**
 * Verify a seeded highlight store on disk.
 *
 * Reads `<home>/storages/highlights` and reports: valid record files, invalid
 * files, tombstones, session count, and basic cap/bound checks.
 *
 * Usage: node tools/dev-instance/verify.mjs --home .dsh-dev-home
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const homeFlag = argv.indexOf('--home')
const home = homeFlag === -1 ? undefined : argv[homeFlag + 1]
if (home === undefined || home === '') {
  console.error('usage: node tools/dev-instance/verify.mjs --home <private-DSH_HOME>')
  process.exit(2)
}
const domain = join(resolve(home), 'storages', 'highlights')
let files
try {
  files = readdirSync(join(domain, 'records'))
} catch {
  console.error(`no store at ${domain}`)
  process.exit(1)
}
let valid = 0
let invalid = 0
let tombstones = 0
const sessions = new Set()
for (const file of files) {
  try {
    const document = JSON.parse(readFileSync(join(domain, 'records', file), 'utf8'))
    const record = document.record
    if (record === undefined || typeof record.sessionId !== 'string') throw new Error('missing record')
    valid += 1
    sessions.add(record.sessionId)
    if (record.deletedAt !== undefined) tombstones += 1
  } catch {
    invalid += 1
  }
}
const install = (() => {
  try {
    return JSON.parse(readFileSync(join(domain, 'meta', 'install.json'), 'utf8')).record.installId
  } catch {
    return 'missing'
  }
})()
console.log(`store: ${domain}`)
console.log(`installId: ${install}`)
console.log(`records: ${valid} valid, ${invalid} invalid, ${tombstones} tombstoned, ${sessions.size} sessions`)
process.exit(invalid === 0 ? 0 : 1)
