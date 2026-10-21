'use strict'

// Needs a real Bare process; worker-threads-shim-verify.integration.test.js
// spawns it for Jest.
//
// Run directly with: bare tests/bare-scripts/worker-threads-shim-verify.mjs
import { createRequire } from 'bare-module'
import fs from 'bare-fs'
import path from 'bare-path'

const require = createRequire(import.meta.url)
const { Worker } = require('../../src/transports/wasm/worker-threads-shim.cjs')

let failures = 0

function pass (label) {
  console.log(`[PASS] ${label}`)
}

function fail (label, err) {
  failures++
  console.log(`[FAIL] ${label}:`, err && err.message ? err.message : err)
}

// Eval mode takes raw source text, as sqlite-bridge.js's createNodeWorker
// passes it.
async function testEvalModeRoundTrip () {
  const source = `
    const { parentPort } = require('bare-worker')
    // Also confirms node: resolution works inside the spawned thread.
    const workerThreads = require('node:worker_threads')
    parentPort.postMessage({
      hello: 'from eval worker',
      hasNodeWorkerThreads: typeof workerThreads.Worker === 'function'
    })
  `

  const worker = new Worker(source, { eval: true })

  try {
    const message = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for a message from the eval worker')), 15_000)
      worker.on('message', (msg) => {
        clearTimeout(timeout)
        resolve(msg)
      })
      worker.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    if (message.hello !== 'from eval worker') {
      throw new Error(`unexpected message payload: ${JSON.stringify(message)}`)
    }
    pass('eval-mode Worker runs raw source text and posts a message back')

    if (!message.hasNodeWorkerThreads) {
      throw new Error('node:worker_threads did not resolve to a usable Worker inside the spawned thread')
    }
    pass('spawned thread\'s own require("node:worker_threads") resolves correctly')
  } catch (err) {
    fail('eval-mode Worker round trip', err)
  } finally {
    await worker.terminate()
  }
}

// The eval worker gets a new bare-fs instance, so constants installed in the
// outer worker don't carry over. Without O_EXCL, bare-fs opens "wx" with
// truncating "w" flags and destroys an existing database.
async function testExclusiveCreateDoesNotTruncate () {
  const dir = path.join(
    new URL('.', import.meta.url).pathname,
    '..',
    '..',
    '..',
    `.worker-shim-persistence-${Bare.pid}-${Date.now()}`
  )
  const file = path.join(dir, 'existing.db')
  const probeModule = path.join(dir, 'worker-fs-child.cjs')
  const sentinel = 'existing database contents'
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, sentinel, 'utf8')
  fs.writeFileSync(
    probeModule,
    [
      "'use strict'",
      "const fs = require('node:fs')",
      'module.exports = function probeExclusiveCreate (file) {',
      '  let openErrorCode = null',
      '  let fd = -1',
      '  try {',
      "    fd = fs.openSync(file, 'wx', 0o600)",
      '  } catch (err) {',
      '    openErrorCode = err && err.code',
      '  } finally {',
      '    if (fd >= 0) fs.closeSync(fd)',
      '  }',
      '  return {',
      '    openErrorCode,',
      "    contents: fs.readFileSync(file, 'utf8')",
      '  }',
      '}'
    ].join('\n'),
    'utf8'
  )

  const source = `
    const { parentPort, workerData } = require('node:worker_threads')
    const probeExclusiveCreate = require(workerData.probeModule)
    parentPort.postMessage(probeExclusiveCreate(workerData.file))
  `

  const worker = new Worker(source, {
    eval: true,
    workerData: {
      file,
      probeModule
    }
  })

  try {
    const message = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for the exclusive-create probe')), 15_000)
      worker.on('message', (msg) => {
        clearTimeout(timeout)
        resolve(msg)
      })
      worker.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    if (message.openErrorCode !== 'EEXIST') {
      throw new Error(`opening an existing file with "wx" returned ${JSON.stringify(message.openErrorCode)} instead of EEXIST`)
    }
    pass('eval worker preserves exclusive-create semantics for an existing file')

    if (message.contents !== sentinel || fs.readFileSync(file, 'utf8') !== sentinel) {
      throw new Error('opening an existing file with "wx" truncated its contents')
    }
    pass('eval worker does not truncate an existing SQLite file during its create probe')
  } catch (err) {
    fail('eval worker exclusive-create persistence', err)
  } finally {
    await worker.terminate()
    try {
      fs.unlinkSync(file)
      fs.unlinkSync(probeModule)
      fs.rmdirSync(dir)
    } catch (_) {}
  }
}

async function main () {
  await testEvalModeRoundTrip()
  await testExclusiveCreateDoesNotTruncate()

  if (failures > 0) {
    console.log(`\n${failures} check(s) failed.`)
    Bare.exit(1)
  } else {
    console.log('\nAll checks passed.')
    Bare.exit(0)
  }
}

main().catch((err) => {
  console.log('[FAIL] uncaught error:', err && err.stack)
  Bare.exit(1)
})
