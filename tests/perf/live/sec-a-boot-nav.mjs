// Section A — boot to interactive; cold and warm navigation to the Highlights page.
// 5 fresh page loads; per load: boot metrics, then cold nav, then warm nav.
import { connectInstrumented, navigateFresh, bootMetrics, READY_EXPRESSION, runAction, navToPage, navToConversation, domSnapshot, metricsSnapshot, highlightRegistry, observerCounts, writeJson, sleep, median, round } from './lib.mjs'

const ITERATIONS = Number(process.env.ITER ?? 5)
const { cdp } = await connectInstrumented()
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

const record = { section: 'A', iterations: [], startedAt: new Date().toISOString(), viewport: { width: 1440, height: 900 } }

for (let index = 1; index <= ITERATIONS; index += 1) {
  const navigatedAt = await navigateFresh(cdp)
  // Wait for interactive readiness; poll from Node so the measurement includes it.
  await cdp.waitFor(READY_EXPRESSION, 30000, 'interactive')
  const readyWallMs = Date.now() - navigatedAt
  const boot = await bootMetrics(cdp)
  await sleep(1500)

  const row = { iteration: index, boot: { ...boot, readyWallMs } }

  // --- cold nav: first ever click on the sidebar Highlights row -------------
  const cold = await runAction(cdp, async () => {
    const ok = await cdp.evaluate(`(() => {
      const cands = [...document.querySelectorAll('button')].filter(b => (b.getAttribute('aria-label') || '').trim() === 'Highlights')
      const nav = cands.find(b => /panelRow/u.test(typeof b.className === 'string' ? b.className : ''))
      if (nav === undefined) return false
      nav.click(); return true
    })()`)
    if (!ok) throw new Error('cold nav: no sidebar row')
  }, { quiet: 600, max: 20000, label: `A.cold-nav#${index}` })
  await cdp.waitFor('document.querySelectorAll("article.dshhl-row").length > 0', 15000, 'page rows')
  const coldState = await cdp.evaluate(`(() => {
    const scroller = document.querySelector('.dshhl-page__scroll')
    return {
      rows: document.querySelectorAll('article.dshhl-row').length,
      groups: document.querySelectorAll('.dshhl-page__workspace').length,
      sessions: document.querySelectorAll('.dshhl-page__session').length,
      count: document.querySelector('.dshhl-page__count')?.textContent ?? null,
      domNodes: document.querySelectorAll('*').length,
      pageScroll: scroller === null ? null : { clientHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight },
    }
  })()`)
  cold.page = coldState
  cold.metrics = await metricsSnapshot(cdp, { gc: false })

  // --- back to conversation, then warm nav (page module already loaded) -----
  await navToConversation(cdp)
  const warm = await runAction(cdp, async () => {
    const ok = await cdp.evaluate(`(() => {
      const cands = [...document.querySelectorAll('button')].filter(b => (b.getAttribute('aria-label') || '').trim() === 'Highlights')
      const nav = cands.find(b => /panelRow/u.test(typeof b.className === 'string' ? b.className : ''))
      if (nav === undefined) return false
      nav.click(); return true
    })()`)
    if (!ok) throw new Error('warm nav: no sidebar row')
  }, { quiet: 500, max: 15000, label: `A.warm-nav#${index}` })
  await cdp.waitFor('document.querySelectorAll("article.dshhl-row").length > 0', 15000, 'page rows')
  warm.page = await cdp.evaluate(`(() => ({
    rows: document.querySelectorAll('article.dshhl-row').length,
    domNodes: document.querySelectorAll('*').length,
  }))()`)
  warm.metrics = await metricsSnapshot(cdp, { gc: false })

  row.coldNav = cold
  row.warmNav = warm
  row.audit = {
    dom: await domSnapshot(cdp),
    observers: await observerCounts(cdp),
    highlights: await highlightRegistry(cdp),
  }
  record.iterations.push(row)
  console.log(JSON.stringify({
    iteration: index,
    readyWallMs,
    navDomInteractive: boot.nav?.domInteractive,
    bootLongest: boot.longestTaskMs,
    bootLongTotal: boot.longTaskTotalMs,
    bootNodes: boot.domNodes,
    bootGeometryMs: boot.geometry.totalMs,
    coldSettle: cold.settleFromActionMs,
    coldWall: cold.wallMs,
    coldFirstMut: cold.firstMutationMs,
    coldLongest: cold.longestTaskMs,
    coldLongTotal: cold.longTaskTotalMs,
    coldNodes: coldState.domNodes,
    warmSettle: warm.settleFromActionMs,
    warmWall: warm.wallMs,
    warmFirstMut: warm.firstMutationMs,
    warmLongest: warm.longestTaskMs,
    warmLongTotal: warm.longTaskTotalMs,
  }))
  // leave the tab as loaded for the next iteration (navigate resets everything)
}

// Aggregate medians/p95 for the report.
const pick = key => record.iterations.map(row => row[key])
const coldSettle = pick('coldNav').map(x => x.settleFromActionMs)
const warmSettle = pick('warmNav').map(x => x.settleFromActionMs)
record.aggregate = {
  readyWallMs: { median: median(record.iterations.map(r => r.boot.readyWallMs)), values: record.iterations.map(r => r.boot.readyWallMs) },
  navDomInteractive: { median: median(record.iterations.map(r => r.boot.nav?.domInteractive ?? null)), values: record.iterations.map(r => r.boot.nav?.domInteractive ?? null) },
  bootLongestMs: { median: median(record.iterations.map(r => r.boot.longestTaskMs)), values: record.iterations.map(r => r.boot.longestTaskMs) },
  bootLongTaskTotalMs: { median: median(record.iterations.map(r => r.boot.longTaskTotalMs)), values: record.iterations.map(r => r.boot.longTaskTotalMs) },
  bootLongTaskCount: record.iterations.map(r => r.boot.longTasks.length),
  bootGeometryMs: { median: median(record.iterations.map(r => r.boot.geometry.totalMs)), values: record.iterations.map(r => r.boot.geometry.totalMs) },
  coldNavSettleMs: { median: median(coldSettle), values: coldSettle },
  warmNavSettleMs: { median: median(warmSettle), values: warmSettle },
  coldNavLongestMs: { median: median(record.iterations.map(r => r.coldNav.longestTaskMs)), values: record.iterations.map(r => r.coldNav.longestTaskMs) },
  warmNavLongestMs: { median: median(record.iterations.map(r => r.warmNav.longestTaskMs)), values: record.iterations.map(r => r.warmNav.longestTaskMs) },
  coldNavLongTotalMs: { median: median(record.iterations.map(r => r.coldNav.longTaskTotalMs)), values: record.iterations.map(r => r.coldNav.longTaskTotalMs) },
  warmNavLongTotalMs: { median: median(record.iterations.map(r => r.warmNav.longTaskTotalMs)), values: record.iterations.map(r => r.warmNav.longTaskTotalMs) },
  coldPageNodes: { median: median(record.iterations.map(r => r.coldNav.page.domNodes)), values: record.iterations.map(r => r.coldNav.page.domNodes) },
  pageRows: record.iterations.map(r => r.coldNav.page.rows),
  coldFirstMutationMs: { median: median(record.iterations.map(r => r.coldNav.firstMutationMs)), values: record.iterations.map(r => r.coldNav.firstMutationMs) },
  warmFirstMutationMs: { median: median(record.iterations.map(r => r.warmNav.firstMutationMs)), values: record.iterations.map(r => r.warmNav.firstMutationMs) },
}
writeJson('sec-a-boot-nav.json', record)
console.log('AGGREGATE', JSON.stringify(record.aggregate, null, 1))
cdp.close()
