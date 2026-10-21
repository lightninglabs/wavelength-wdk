import WalletManagerWavelength from '@lightninglabs/wdk-wallet-wavelength'

const DOC_DIR = Bare.argv[0]
const { IPC } = BareKit

// A command resolving after the app replaced this worklet writes to a
// destroyed IPC pipe; nobody is listening, so swallow it.
Bare.on('uncaughtException', (err) => {
  console.error('Uncaught exception (swallowed, worklet stays alive):', err)
})
Bare.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (swallowed, worklet stays alive):', err)
})

// 'exit' fires too late to await async work; 'beforeExit' doesn't.
Bare.on('beforeExit', () => {
  manager?.close().catch((err) => console.error('Shutdown close() failed:', err))
})

const REQUIRED_INIT_WALLET_FIELDS = [
  'seedPhrase',
  'network',
  'walletType',
  'walletEsploraUrl',
  'arkServerAddress',
  'swapServerAddress',
]

let manager = null
let seedPhrase = null

// Only one account daemon can be active at a time on this transport.
/** @type {{ index: number, account: import('@lightninglabs/wdk-wallet-wavelength').WalletAccountWavelength, unwatchActivity?: () => void } | null} */
let active = null

// Only for computing the next add-account index; not a cache of live accounts.
const knownIndices = new Set()

function respond(id, command, result = {}) {
  IPC.write(Buffer.from(JSON.stringify({ id, command, ...result }) + '\n'))
}

function respondError(id, command, error) {
  const msg = error instanceof Error ? error.message : String(error)
  IPC.write(Buffer.from(JSON.stringify({ id, command, error: msg }) + '\n'))
}

function requireManager() {
  if (!manager) throw new Error('Wallet not initialized')
  return manager
}

function requireActiveAccount() {
  if (!active) throw new Error('No active account')
  return active.account
}

function pushEvent(event, payload) {
  IPC.write(Buffer.from(JSON.stringify({ event, ...payload }) + '\n'))
}

async function closeActiveAccount() {
  if (!active) return
  const { index, unwatchActivity } = active
  active = null
  unwatchActivity?.()
  await manager.closeAccount(index)
}

async function bootAccount(index) {
  await closeActiveAccount()
  const account = await manager.getAccount(index)
  active = { index, account }
  knownIndices.add(index)
  watchActivity(index, account)
  return account
}

// Best-effort: the app still has list-activity if the stream can't open.
async function watchActivity(index, account) {
  try {
    const unwatch = await account.watchActivity((event) => {
      if (active?.account !== account) return
      if (event.type === 'activity') {
        pushEvent('activity', { index, entry: event.payload })
      } else {
        pushEvent('activity-stream', { index, ...event.payload })
      }
    })
    if (active?.account === account) {
      active.unwatchActivity = unwatch
    } else {
      unwatch()
    }
  } catch (err) {
    console.error('Activity stream failed to open:', err)
    pushEvent('activity-stream', { index, state: 'failed', message: err.message })
  }
}

const COMMANDS = {
  // Usable before init-wallet: needs no manager.
  'generate-seed': async (msg) => {
    const phrase = WalletManagerWavelength.getRandomSeedPhrase(msg.wordCount || 24)
    return { seedPhrase: phrase }
  },

  'init-wallet': async (msg) => {
    for (const field of REQUIRED_INIT_WALLET_FIELDS) {
      if (!msg[field]) throw new Error(`'init-wallet' requires ${field}`)
    }
    if (!manager) {
      seedPhrase = msg.seedPhrase
      manager = new WalletManagerWavelength(seedPhrase, {
        network: msg.network,
        dataDir: DOC_DIR,
        walletType: msg.walletType,
        walletEsploraUrl: msg.walletEsploraUrl,
        arkServerAddress: msg.arkServerAddress,
        swapServerAddress: msg.swapServerAddress,
        wasmRuntimeDir: msg.wasmRuntimeDir,
      })
    }
    return { initialized: true }
  },

  'add-account': async () => {
    requireManager()
    const nextIndex = knownIndices.size === 0 ? 0 : Math.max(...knownIndices) + 1
    const account = await bootAccount(nextIndex)
    const info = await account.getInfo()
    return { index: nextIndex, path: account.path, identityPubKey: info.identityPubKey, imported: account.imported }
  },

  'switch-account': async (msg) => {
    requireManager()
    if (typeof msg.index !== 'number') throw new Error("'switch-account' requires a numeric index")
    const account = active?.index === msg.index ? active.account : await bootAccount(msg.index)
    const info = await account.getInfo()
    return { index: msg.index, path: account.path, identityPubKey: info.identityPubKey, imported: account.imported }
  },

  'get-deposit-address': async () => {
    const deposit = await requireActiveAccount().getDepositAddress()
    return { address: deposit.address }
  },

  'get-balance': async () => {
    const confirmedSat = await requireActiveAccount().getBalance()
    return { confirmedSat: confirmedSat.toString() }
  },

  'get-info': async () => {
    const info = await requireActiveAccount().getInfo()
    return {
      synced: info.walletState === 'ready',
      walletState: info.walletState,
      identityPubKey: info.identityPubKey,
    }
  },

  'list-activity': async () => {
    const { activity } = await requireActiveAccount().list({ view: 'activity' })
    return { entries: activity?.entries || [] }
  },

  'get-mnemonic': async () => {
    if (!seedPhrase) throw new Error('Wallet not initialized')
    return { words: seedPhrase.split(' ') }
  },

  'quote-send-transaction': async (msg) => {
    const result = await requireActiveAccount().quoteSendTransaction({ to: msg.address, value: msg.satoshis })
    return { feeSat: result.fee.toString() }
  },

  'send-transaction': async (msg) => {
    const result = await requireActiveAccount().sendTransaction({ to: msg.address, value: msg.satoshis })
    return { hash: result.hash, fee: result.fee?.toString() }
  },

  'create-lightning-invoice': async (msg) => {
    const result = await requireActiveAccount().createLightningInvoice({ amountSat: msg.amountSat, memo: msg.memo || '' })
    return { invoice: result.invoice }
  },

  'quote-pay-lightning-invoice': async (msg) => {
    const feeSat = await requireActiveAccount().quotePayLightningInvoice({ invoice: msg.invoice })
    return { feeSat: feeSat.toString() }
  },

  'pay-lightning-invoice': async (msg) => {
    const result = await requireActiveAccount().payLightningInvoice({ invoice: msg.invoice })
    return { success: !!result }
  },

  'list-vtxos': async () => {
    const { vtxos } = await requireActiveAccount().list({ view: 'vtxos' })
    return { vtxos: vtxos?.vtxos || [] }
  },

  'exit-summary': async () => {
    return await requireActiveAccount().exitSummary()
  },

  'get-exit-plan': async (msg) => {
    return await requireActiveAccount().getExitPlan({ outpoints: msg.outpoints, confTarget: msg.confTarget })
  },

  // `mode` keeps the FORCE_UNROLL_ACK constant out of the wire protocol.
  'exit': async (msg) => {
    const req = msg.mode === 'unilateral'
      ? { outpoint: msg.outpoint, forceUnrollAck: 'I_KNOW_WHAT_I_AM_DOING' }
      : { outpoint: msg.outpoint, destination: msg.destination ?? undefined }
    return await requireActiveAccount().exit(req)
  },

  'exit-status': async (msg) => {
    return await requireActiveAccount().exitStatus({ outpoint: msg.outpoint, detailed: !!msg.detailed })
  },

  'sweep-wallet': async (msg) => {
    return await requireActiveAccount().sweepWallet({
      destinationAddress: msg.destinationAddress,
      broadcast: !!msg.broadcast,
      feeRateSatPerVByte: msg.feeRateSatPerVByte,
      confTarget: msg.confTarget,
    })
  },
}

// Only these mutate `active`/`manager`; IPC 'data' events aren't serialized.
const LIFECYCLE_COMMANDS = new Set(['init-wallet', 'add-account', 'switch-account'])

let lifecycleQueue = Promise.resolve()

function handleCommand(msg) {
  if (!LIFECYCLE_COMMANDS.has(msg.command)) return processCommand(msg)

  lifecycleQueue = lifecycleQueue
    .then(() => processCommand(msg))
    .catch((err) => console.error('Lifecycle command queue error (swallowed):', err))
  return lifecycleQueue
}

async function processCommand(msg) {
  const { id, command } = msg
  const handler = COMMANDS[command]
  if (!handler) {
    respondError(id, command, `Unknown command: ${command}`)
    return
  }

  try {
    const result = await handler(msg)
    respond(id, command, result)
  } catch (err) {
    respondError(id, command, err)
  }
}

async function main() {
  let buffer = ''

  IPC.on('data', async (data) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        // Android's stream is shared with the transport's own protocol.
        if (typeof msg.command !== 'string') continue
        await handleCommand(msg)
      } catch (err) {
        console.error('Message handling error:', err)
      }
    }
  })

  IPC.on('error', (err) => {
    console.error('IPC error:', err)
  })
}

main().catch((err) => {
  IPC.write(Buffer.from(JSON.stringify({ status: 'fatal', message: err.message, stack: err.stack }) + '\n'))
})
