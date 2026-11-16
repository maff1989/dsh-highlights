#!/usr/bin/env node
/**
 * Reset an isolated dev instance's highlight store.
 *
 * Only removes `<home>/storages/highlights` after validating that `--home` is
 * a real path and that the caller passed `--yes`. Never touches `~/.dsh` unless
 * that path is explicitly passed (and then the same guards apply).
 *
 * Usage: node tools/dev-instance/reset.mjs --home .dsh-dev-home --yes
 */
import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const homeFlag = argv.indexOf('--home')
const home = homeFlag === -1 ? undefined : argv[homeFlag + 1]
const yes = argv.includes('--yes')
if (home === undefined || home === '') {
  console.error('usage: node tools/dev-instance/reset.mjs --home <private-DSH_HOME> --yes')
  process.exit(2)
}
const absolute = resolve(home)
if (!yes) {
  console.error(`refusing to delete ${join(absolute, 'storages', 'highlights')} without --yes`)
  process.exit(2)
}
if (absolute === resolve(homedir()) || absolute === resolve(homedir(), '.dsh')) {
  console.error('refusing to reset the real ~/.dsh store; use a private DSH_HOME')
  process.exit(2)
}
const domain = join(absolute, 'storages', 'highlights')
if (!existsSync(domain)) {
  console.log(`nothing to reset: ${domain} does not exist`)
  process.exit(0)
}
rmSync(domain, { recursive: true, force: true })
console.log(`removed ${domain}`)
