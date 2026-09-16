'use strict'

// The Jest-visible half of the Bare desktop/server WASM transport's real
// verification. Jest only ever runs under plain Node, so it can't directly
// execute bare-scripts/wasm-transport-verify.mjs (needs Bare.platform,
// bare-fs, bare-worker, ... none of which exist there) -- this spawns a
// real `bare` subprocess to run it instead, so `npm run test:integration`
// gets a genuine pass/fail signal rather than a silent skip.
//
// Two things gate whether this can run at all:
//   - a `bare` CLI reachable via `npx --no-install` (run any `bare` command
//     once to warm the npx cache, or install bare directly)
//   - .wavelength-wasm-runtime/ actually populated (see
//     `npm run fetch:wasm-runtime` in wdk-wallet-wavelength) -- not
//     fetched/built here, since a ~130MB local build shouldn't happen on a
//     routine `npm test` run
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.join(__dirname, '..')
const REPO_ROOT = path.join(PACKAGE_ROOT, '..')
const RUNTIME_DIR = path.join(REPO_ROOT, '.wavelength-wasm-runtime')
const VERIFY_SCRIPT = path.join(__dirname, 'bare-scripts', 'wasm-transport-verify.mjs')

const REQUIRED_RUNTIME_FILES = ['wavewalletdk.wasm', 'wasm_exec.js', 'sqlite-bridge.js']

async function bareIsAvailable () {
  try {
    await execFileAsync('npx', ['--no-install', 'bare', '--help'])
    return true
  } catch {
    return false
  }
}

function runtimeIsPopulated () {
  return REQUIRED_RUNTIME_FILES.every((file) => existsSync(path.join(RUNTIME_DIR, file)))
}

let CAN_RUN = false
let skipReason = ''

beforeAll(async () => {
  const bareOk = await bareIsAvailable()
  const runtimeOk = runtimeIsPopulated()

  CAN_RUN = bareOk && runtimeOk

  if (!bareOk) {
    skipReason = "no `bare` CLI reachable via `npx --no-install bare` -- run any `bare` command once (e.g. `npx bare --help`) to warm the npx cache, or install bare directly, then rerun"
  } else if (!runtimeOk) {
    skipReason = `.wavelength-wasm-runtime/ is not populated (missing one of: ${REQUIRED_RUNTIME_FILES.join(', ')}) -- run \`npm run fetch:wasm-runtime\` first`
  }
})

describe('Bare desktop/server WASM transport (real signet daemon)', () => {
  test('boots the real WASM daemon and passes every structural check', async () => {
    if (!CAN_RUN) {
      console.log(`[SKIP] ${skipReason}`)
      return
    }

    try {
      const { stdout } = await execFileAsync('npx', ['bare', VERIFY_SCRIPT, RUNTIME_DIR], {
        maxBuffer: 16 * 1024 * 1024
      })
      console.log(stdout)
    } catch (err) {
      // execFile rejects with stdout/stderr attached when the child exits
      // non-zero -- surface both so this is debuggable from CI output.
      console.log(err.stdout)
      console.error(err.stderr)
      throw new Error(`wasm-transport-verify.mjs exited with a failure (code ${err.code}) -- see logged output above for which structural check(s) failed`)
    }
  }, 180_000) // Real daemon boot + chain sync observed at 60-100s; generous margin over the package's default 60s test:integration timeout.
})

afterAll(() => {
  if (!CAN_RUN) {
    console.log(`Bare WASM transport verification skipped: ${skipReason}`)
  }
})
