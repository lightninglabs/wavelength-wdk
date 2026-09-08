'use strict'

// Interactive REPL for driving a Wavelength wallet directly under `bare` on
// darwin/linux/win32. Prompts for a seed phrase to import (or generates a
// new one) before booting account 0, then supports adding/switching
// accounts, balances, and send/receive. Each account gets its own isolated
// WASM worker, so several can stay open at once. Type "help" at the prompt.
//
// Run with (from this directory):
//   npx bare index.mjs [dataDir]
import { start } from 'bare-repl'
import inspect from 'bare-inspect'

import { networkDefaults } from '@lightninglabs/wavelength-core'

import WalletManagerWavelength, {
  wavelengthAccountDataDir
} from '../../wdk-wallet-wavelength/bare.js'
import {
  deriveWavelengthAccount
} from '../../wdk-wallet-wavelength/src/external-seed-account.js' with {
  imports: 'bare-node-runtime/imports'
}

const RUNTIME_DIR = new URL('./.wavelength-wasm-runtime', import.meta.url).pathname
const DATA_DIR = Bare.argv[2] || new URL('./.wavelength-cli-demo-data', import.meta.url).pathname
const NETWORK = 'signet'

let SEED_PHRASE = null

const NETWORK_CONFIG = {
  network: NETWORK,
  dataDir: DATA_DIR,
  walletType: 'lwwallet',
  ...networkDefaults(NETWORK, 'rest'),
  wasmRuntimeDir: RUNTIME_DIR
}

// Booting an account (SQLite migrations + initial chain tip) can genuinely
// take longer than an ordinary RPC, so it gets its own longer timeout.
const CALL_TIMEOUT_MS = 10_000
const BOOT_TIMEOUT_MS = 60_000

function withTimeout (promise, label, timeoutMs = CALL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error(
        `${label} timed out after ${timeoutMs}ms`
      )), timeoutMs)
    })
  ])
}

function accountProfile (manager, index) {
  const derived = deriveWavelengthAccount(manager.seed, NETWORK, index)
  try {
    return wavelengthAccountDataDir(DATA_DIR, derived.rootId, NETWORK, index)
  } finally {
    derived.seedEntropy.fill(0)
  }
}

let manager = null

/** @type {Map<number, import('../../wdk-wallet-wavelength/bare.js').WalletAccountWavelength>} */
const accounts = new Map()
let activeIndex = null

// Assigned once main() constructs the REPL -- COMMANDS.exit needs it.
let repl = null

function requireIndex (arg) {
  if (arg === undefined) {
    if (activeIndex === null) throw new Error('No active account -- use "add" or "use <index>" first')
    return activeIndex
  }
  const index = Number(arg)
  if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid account index: ${arg}`)
  return index
}

function requireActiveAccount (arg) {
  const index = requireIndex(arg)
  const account = accounts.get(index)
  if (!account) throw new Error(`Account ${index} is not open -- use "use ${index}" first`)
  return account
}

async function openAccount (index) {
  let account = accounts.get(index)
  if (!account) {
    account = await withTimeout(manager.getAccount(index), `getAccount(${index})`, BOOT_TIMEOUT_MS)
    accounts.set(index, account)
  }
  return account
}

// Shown on the ready screen and by "help".
const COMMAND_GROUPS = [
  {
    title: 'Accounts',
    commands: [
      ['accounts', 'list open accounts (* marks the active one)'],
      ['add', 'derive and open the next account, making it active'],
      ['use <index>', 'open (if needed) and switch to an account'],
      ['close <index>', 'stop and close one account\'s daemon']
    ]
  },
  {
    title: 'Wallet Info',
    commands: [
      ['info [index]', 'identity + wallet state (default: active account)'],
      ['balance [index]', 'confirmed balance, in sat'],
      ['address [index]', 'current boarding address (no new allocation)'],
      ['deposit [index]', 'allocate a fresh boarding address'],
      ['activity [index]', 'recent activity entries']
    ]
  },
  {
    title: 'On-chain',
    commands: [
      ['send <addr> <sat> [note]', 'send an on-chain transaction']
    ]
  },
  {
    title: 'Lightning',
    commands: [
      ['invoice <sat> [memo]', 'create a Lightning invoice'],
      ['quote <invoice>', 'quote the fee for paying an invoice'],
      ['payinvoice <invoice>', 'pay a Lightning invoice']
    ]
  },
  {
    title: 'Misc',
    commands: [
      ['mnemonic', 'print the wallet\'s BIP-39 seed phrase'],
      ['help', 'show this command list again'],
      ['exit', 'stop every account and quit (alias: quit)']
    ]
  }
]

function formatCommandReference () {
  const allCommands = COMMAND_GROUPS.flatMap((group) => group.commands)
  const nameWidth = Math.max(...allCommands.map(([name]) => name.length))

  const lines = ['Commands:']
  for (const group of COMMAND_GROUPS) {
    lines.push(`  ${group.title}`)
    for (const [name, desc] of group.commands) {
      lines.push(`    ${name.padEnd(nameWidth)}   ${desc}`)
    }
  }
  return lines.join('\n')
}

const COMMANDS = {
  async help () {
    return formatCommandReference()
  },

  async accounts () {
    if (accounts.size === 0) return '(no accounts open -- try "add")'
    return [...accounts.keys()]
      .sort((a, b) => a - b)
      .map((index) => `${index === activeIndex ? '*' : ' '} ${index}`)
      .join('\n')
  },

  async add () {
    const nextIndex = accounts.size === 0 ? 0 : Math.max(...accounts.keys()) + 1
    await openAccount(nextIndex)
    activeIndex = nextIndex
    return `Account ${nextIndex} open and active.`
  },

  async use ([indexArg]) {
    if (indexArg === undefined) throw new Error('Usage: use <index>')
    const index = requireIndex(indexArg)
    await openAccount(index)
    activeIndex = index
    return `Account ${index} active.`
  },

  async close ([indexArg]) {
    if (indexArg === undefined) throw new Error('Usage: close <index>')
    const index = requireIndex(indexArg)
    await withTimeout(manager.closeAccount(index), `closeAccount(${index})`)
    accounts.delete(index)
    if (activeIndex === index) activeIndex = null
    return `Account ${index} closed.`
  },

  async info ([indexArg]) {
    const account = requireActiveAccount(indexArg)
    const info = await withTimeout(account.getInfo(), `account ${account.index} getInfo()`)
    return {
      index: account.index,
      path: account.path,
      profileDir: accountProfile(manager, account.index),
      walletState: info.walletState,
      identityPubKey: info.identityPubKey
    }
  },

  async balance ([indexArg]) {
    const account = requireActiveAccount(indexArg)
    const sat = await withTimeout(account.getBalance(), `account ${account.index} getBalance()`)
    return `${sat.toString()} sat`
  },

  async address ([indexArg]) {
    const account = requireActiveAccount(indexArg)
    return await withTimeout(account.getAddress(), `account ${account.index} getAddress()`)
  },

  async deposit ([indexArg]) {
    const account = requireActiveAccount(indexArg)
    const result = await withTimeout(account.getDepositAddress(), `account ${account.index} getDepositAddress()`)
    return result.address
  },

  async activity ([indexArg]) {
    const account = requireActiveAccount(indexArg)
    const { activity } = await withTimeout(account.list({ view: 'activity' }), `account ${account.index} list()`)
    return activity?.entries ?? []
  },

  async send ([to, satArg, ...noteParts]) {
    if (!to || satArg === undefined) throw new Error('Usage: send <addr> <sat> [note]')
    const account = requireActiveAccount()
    const result = await withTimeout(
      account.sendTransaction({ to, value: Number(satArg), note: noteParts.join(' ') || undefined }),
      `account ${account.index} sendTransaction()`
    )
    return { hash: result.hash, fee: result.fee?.toString() }
  },

  async invoice ([satArg, ...memoParts]) {
    if (satArg === undefined) throw new Error('Usage: invoice <sat> [memo]')
    const account = requireActiveAccount()
    const result = await withTimeout(
      account.createLightningInvoice({ amountSat: Number(satArg), memo: memoParts.join(' ') }),
      `account ${account.index} createLightningInvoice()`
    )
    return result.invoice
  },

  async quote ([invoice]) {
    if (!invoice) throw new Error('Usage: quote <invoice>')
    const account = requireActiveAccount()
    const feeSat = await withTimeout(account.quotePayLightningInvoice({ invoice }), `account ${account.index} quotePayLightningInvoice()`)
    return `${feeSat.toString()} sat`
  },

  async payinvoice ([invoice]) {
    if (!invoice) throw new Error('Usage: payinvoice <invoice>')
    const account = requireActiveAccount()
    const result = await withTimeout(account.payLightningInvoice({ invoice }), `account ${account.index} payLightningInvoice()`)
    return { hash: result.hash, fee: result.fee?.toString() }
  },

  async mnemonic () {
    return SEED_PHRASE
  },

  async exit () {
    repl.close()
  }
}
COMMANDS.quit = COMMANDS.exit

async function runCommand (line) {
  const [name, ...args] = line.trim().split(/\s+/).filter(Boolean)
  if (!name) return undefined

  const handler = COMMANDS[name]
  if (!handler) throw new Error(`Unknown command: ${name} (try "help")`)

  return handler(args)
}

// Right-pads labels to the widest one so values line up in one column.
function formatFacts (rows) {
  const labelWidth = Math.max(...rows.map(([label]) => label.length))
  return rows.map(([label, value]) => `  ${label.padEnd(labelWidth)}   ${value}`).join('\n')
}

async function formatReadyScreen () {
  const account = accounts.get(0)
  const [info, balanceSat] = await Promise.all([
    withTimeout(account.getInfo(), 'account 0 getInfo()'),
    withTimeout(account.getBalance(), 'account 0 getBalance()')
  ])

  // No side borders -- values like the identity pubkey or an absolute
  // dataDir path can easily run past any fixed width.
  const rule = '─'.repeat(60)

  return [
    '',
    rule,
    '⚡ Wavelength WDK CLI Demo',
    rule,
    formatFacts([
      ['Network', NETWORK],
      ['Data dir', DATA_DIR],
      ['Active account', `${account.index} (${account.path})`],
      ['Identity', info.identityPubKey],
      ['Wallet state', info.walletState],
      ['Balance', `${balanceSat.toString()} sat`]
    ]),
    rule,
    '',
    formatCommandReference(),
    ''
  ].join('\n')
}

// 'onboarding' (choosing/pasting a seed) -> 'booting' (account 0 starting,
// input ignored besides exit) -> 'ready' (full command set).
let stage = 'onboarding'

async function bootWallet (seedPhrase) {
  stage = 'booting'
  repl.setPrompt('(booting...)> ')

  SEED_PHRASE = seedPhrase
  manager = new WalletManagerWavelength(SEED_PHRASE, NETWORK_CONFIG)

  console.log('Booting account 0...')
  await openAccount(0)
  activeIndex = 0

  console.log(await formatReadyScreen())
  stage = 'ready'
  repl.setPrompt('wavelength> ')
}

async function runOnboarding (line) {
  const input = line.trim()
  if (/^(exit|quit)$/i.test(input)) {
    repl.close()
    return undefined
  }

  if (input === '') {
    const generated = WalletManagerWavelength.getRandomSeedPhrase()
    console.log(`Generated a new seed phrase -- write it down:\n\n  ${generated}\n`)
    await bootWallet(generated)
    return undefined
  }

  if (!WalletManagerWavelength.isValidSeedPhrase(input)) {
    throw new Error('Not a valid BIP-39 seed phrase -- paste one, or press Enter to create a new one.')
  }

  await bootWallet(input)
  return undefined
}

async function runDuringBoot (line) {
  if (/^(exit|quit)$/i.test(line.trim())) {
    repl.close()
    return undefined
  }
  return 'Still booting account 0 -- please wait for the ready screen.'
}

async function main () {
  console.log(`Bare.platform = ${Bare.platform}`)
  console.log('Paste a seed phrase to import, or press Enter to create a new wallet.')

  repl = start({
    prompt: 'seed phrase (blank = create new)> ',
    writer (value) {
      if (value instanceof Error) return `Error: ${value.message}`
      if (typeof value === 'string') return value
      return inspect(value, { colors: repl.input.isTTY })
    },
    eval (line, context, filename, cb) {
      const runner = stage === 'onboarding' ? runOnboarding
        : stage === 'booting' ? runDuringBoot
        : runCommand
      runner(line).then(
        (value) => cb(null, value),
        (err) => cb(err)
      )
    }
  })

  repl.on('exit', () => {
    console.log('\nStopping every open account...')
    ;(manager ? manager.close() : Promise.resolve())
      .catch((err) => console.error('Error while closing:', err))
      .finally(() => Bare.exit(0))
  })
}

main().catch((err) => {
  console.error('Fatal error:', err && err.stack ? err.stack : err)
  Bare.exit(1)
})
