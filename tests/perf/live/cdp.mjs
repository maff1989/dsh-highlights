// Minimal CDP driver over raw WebSocket (no puppeteer needed).
export async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined) {
      const entry = pending.get(message.id)
      if (entry === undefined) return
      pending.delete(message.id)
      if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
      return
    }
    for (const listener of listeners) listener(message)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id
    pending.set(callId, { resolve, reject })
    ws.send(JSON.stringify({ id: callId, method, params }))
  })
  const evaluate = async (expression, extra = {}) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
      ...extra,
    })
    if (result.exceptionDetails !== undefined) {
      throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails))
    }
    return result.result.value
  }
  const waitFor = async (expression, timeoutMs = 30000, label = expression) => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      try {
        const value = await evaluate(expression)
        if (value) return value
      } catch { /* page navigating */ }
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`)
      await new Promise(r => setTimeout(r, 250))
    }
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  return { ws, send, evaluate, waitFor, sleep, on: fn => listeners.push(fn), close: () => ws.close() }
}

export async function pageTarget(port = 9222) {
  const response = await fetch(`http://127.0.0.1:${port}/json`)
  const targets = await response.json()
  const page = targets.find(t => t.type === 'page')
  if (page === undefined) throw new Error('no page target')
  return page.webSocketDebuggerUrl
}

export function authCookie() {
  const { readFileSync } = process.getBuiltinModule('node:fs')
  const line = readFileSync('/tmp/cj.txt', 'utf8').split('\n').find(l => l.includes('dsh-auth-'))
  const parts = line.split('\t')
  return { name: parts[5], value: parts[6] }
}
