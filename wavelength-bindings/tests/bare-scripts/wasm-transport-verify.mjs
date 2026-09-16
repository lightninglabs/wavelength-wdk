'use strict'

// Verifies the Bare desktop/server WASM transport against a live signet
// daemon, exercising the real wasm-host-bootstrap.js /
// BareWasmWavelengthClient paths rather than mocks.
//
// Requires a real Bare process (Bare.platform, bare-fs, bare-worker), so
// Jest can't run it directly. wasm-transport-verify.integration.test.js
// spawns `bare` on this file and asserts on its exit code.
//
// Run directly with: bare tests/bare-scripts/wasm-transport-verify.mjs [runtimeDir]
import { networkDefaults } from '@lightninglabs/wavelength-core'

import createWavelengthTransport from '../../src/wavelength-transport-bare-wasm.js'

// Bare.argv is [binaryPath, scriptPath, ...userArgs] for a CLI invocation,
// unlike a Worklet.start() load where argv holds only the user args.
const RUNTIME_DIR = Bare.argv[2] || new URL('../../.wavelength-wasm-runtime', import.meta.url).pathname
const DATA_DIR = `/tmp/wdk-wavelength-wasm-verify-${Date.now()}`

const NETWORK_CONFIG = {
  network: 'signet',
  dataDir: DATA_DIR,
  walletType: 'lwwallet',
  // REST, not gRPC: js/wasm builds have no gRPC transport, which is why
  // BareWasmWavelengthClient's serverTransport is 'rest'.
  ...networkDefaults('signet', 'rest')
}

let failures = 0

function pass (label) {
  console.log(`[PASS] ${label}`)
}

function fail (label, err) {
  failures++
  console.log(`[FAIL] ${label}:`, err && err.message ? err.message : err)
}

// Steps needing live Ark-server connectivity log their outcome but never
// fail the run.
function attempt (label) {
  console.log(`[INFO] ${label} -- best-effort, live-network-dependent, does not fail the run`)
}

async function main () {
  console.log(`Bare.platform = ${Bare.platform}, runtimeDir = ${RUNTIME_DIR}`)

  const client = createWavelengthTransport({ wasmRuntimeDir: RUNTIME_DIR })
  if (client.constructor.name !== 'BareWasmWavelengthClient') {
    fail('createWavelengthTransport() returns a BareWasmWavelengthClient', new Error(`got ${client.constructor.name}`))
  } else {
    pass('createWavelengthTransport() returns a BareWasmWavelengthClient')
  }

  try {
    await client.ready()
    pass('ready()')
  } catch (err) {
    fail('ready()', err)
    return report(client)
  }

  try {
    await client.start(NETWORK_CONFIG)
    pass('start()')
  } catch (err) {
    fail('start()', err)
    return report(client)
  }

  try {
    const result = await client.createWallet({ password: 'wasm-transport-verify-password' })
    if (!Array.isArray(result.mnemonic) || result.mnemonic.length !== 24) {
      throw new Error(`expected a 24-word mnemonic, got ${JSON.stringify(result.mnemonic)}`)
    }
    if (typeof result.identityPubKey !== 'string' || result.identityPubKey.length === 0) {
      throw new Error(`expected a non-empty identityPubKey, got ${JSON.stringify(result.identityPubKey)}`)
    }
    pass('createWallet() -> real 24-word mnemonic + identityPubKey')
  } catch (err) {
    fail('createWallet()', err)
  }

  try {
    const info = await client.getInfo()
    if (typeof info.walletState !== 'string') {
      throw new Error(`expected a walletState string, got ${JSON.stringify(info.walletState)}`)
    }
    pass(`getInfo() -> walletState=${info.walletState}`)
  } catch (err) {
    fail('getInfo()', err)
  }

  try {
    const balance = await client.balance()
    const requiredFields = ['confirmedSat', 'pendingInSat', 'pendingOutSat', 'creditAvailableSat', 'creditReservedSat']
    for (const field of requiredFields) {
      if (typeof balance[field] !== 'number') {
        throw new Error(`expected balance.${field} to be a number, got ${JSON.stringify(balance[field])}`)
      }
    }
    pass('balance() -> full breakdown shape')
  } catch (err) {
    fail('balance()', err)
  }

  // The subscribe/close contract needs no network, so it stays a hard
  // assertion even though a real 'activity' event would need one.
  try {
    const events = []
    client.subscribe((event) => events.push(event))
    await client.startActivity({ includeExisting: true })
    pass('startActivity() -- stream opened')

    client.stopActivity()
    await new Promise((resolve) => setTimeout(resolve, 500))

    const spuriousEvent = events.find((e) => e.type === 'activityStream')
    if (spuriousEvent) {
      throw new Error(`client-initiated stopActivity() must emit no activityStream event, got ${JSON.stringify(spuriousEvent)}`)
    }
    pass('client-initiated stopActivity() emits no activityStream event')
  } catch (err) {
    fail('activity streaming contract', err)
  }

  // The wallet actor only becomes ready once it can reach the Ark server, so
  // deposit() needs live signet connectivity and stays a soft check.
  attempt('deposit()')
  try {
    const deposit = await client.deposit()
    console.log(`[INFO] deposit() succeeded -> address=${deposit.address}`)
  } catch (err) {
    console.log('[INFO] deposit() did not complete (likely network-dependent):', err && err.message)
  }

  await report(client)
}

async function report (client) {
  // Each transport owns a worker and one Go/WASM runtime. Stop the daemon and
  // terminate the worker so the subprocess exits after SQLite checkpoints.
  try {
    if (await client.isRunning()) await client.stop()
  } catch (err) {
    fail('stop()', err)
  } finally {
    await client.dispose()
  }

  if (failures > 0) {
    console.log(`\n${failures} structural check(s) failed.`)
    Bare.exit(1)
  } else {
    console.log('\nAll structural checks passed.')
    Bare.exit(0)
  }
}

main().catch((err) => {
  console.log('[FAIL] uncaught error:', err && err.stack)
  Bare.exit(1)
})
