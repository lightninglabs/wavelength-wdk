'use strict'

// Spawns a real `bare` subprocess; needs no WASM runtime assets.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VERIFY_SCRIPT = path.join(__dirname, 'bare-scripts', 'worker-threads-shim-verify.mjs')

async function bareIsAvailable () {
  try {
    await execFileAsync('npx', ['--no-install', 'bare', '--help'])
    return true
  } catch {
    return false
  }
}

let CAN_RUN = false

beforeAll(async () => {
  CAN_RUN = await bareIsAvailable()
})

describe('worker-threads-shim.cjs (standalone, no WASM daemon needed)', () => {
  test('eval-mode Worker round-trips a message and resolves node: specifiers correctly', async () => {
    if (!CAN_RUN) {
      console.log('[SKIP] no `bare` CLI reachable via `npx --no-install bare` -- run any `bare` command once (e.g. `npx bare --help`) to warm the npx cache, or install bare directly, then rerun')
      return
    }

    try {
      const { stdout } = await execFileAsync('npx', ['bare', VERIFY_SCRIPT])
      console.log(stdout)
    } catch (err) {
      console.log(err.stdout)
      console.error(err.stderr)
      throw new Error(`worker-threads-shim-verify.mjs exited with a failure (code ${err.code}) -- see logged output above for which check failed`)
    }
  }, 30_000)
})

afterAll(() => {
  if (!CAN_RUN) {
    console.log('worker-threads-shim verification skipped: bare CLI not available via npx --no-install')
  }
})
