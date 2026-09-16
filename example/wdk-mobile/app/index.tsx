import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, RefreshControl, Text, TouchableOpacity, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'

import { useWalletWorklet } from '../hooks/useWalletWorklet'
import { NETWORK_CONFIG, walletMetaFile } from '../lib/constants'
import { formatPubkey } from '../lib/format'
import type {
  ActivityEntry,
  CommandResponse,
  ExitPlanEntry,
  ExitSummaryData,
  Screen,
  SweepPreview,
  WalletData,
  WalletMeta,
  WalletVTXO,
} from '../lib/types'
import type { HomeTab } from '../components/BottomTabBar'
import { AccountTab } from '../components/AccountTab'
import { ActivityTab } from '../components/ActivityTab'
import { BalanceCard } from '../components/BalanceCard'
import { BottomTabBar } from '../components/BottomTabBar'
import { ExitScreen } from '../components/ExitScreen'
import { LightningTab } from '../components/LightningTab'
import { LogsScreen } from '../components/LogsScreen'
import { MnemonicScreen } from '../components/MnemonicScreen'
import { OnboardingScreen } from '../components/OnboardingScreen'
import { OnChainTab } from '../components/OnChainTab'
import { COLORS, HeaderLogo } from '../components/ui'
import { WalletSwitcherModal } from '../components/WalletSwitcherModal'

// A switch-account call against an index we've already successfully opened
// before is expected to be fast (its local profile already exists) -- a
// long stall there is a real problem worth surfacing quickly, unlike a
// genuine first-time import (see LIFECYCLE_TIMEOUT_MS in useWalletWorklet).
const PROVISIONED_SWITCH_TIMEOUT_MS = 60_000

// Every fresh app launch boots into account 0, regardless of which account
// was last active in a previous session -- switching mid-session still
// works and still updates walletMeta.activeAccountIndex for the UI, but the
// next cold launch always starts over at 0.
const BOOT_ACCOUNT_INDEX = 0

function isProvisioned(meta: WalletMeta, index: number) {
  return meta.provisionedAccounts?.includes(index) ?? false
}

// Pure, not a hook -- every call site already has the WalletMeta it needs
// in scope, so this just returns the merged shape for persistWalletMeta
// rather than risking a stale closure over walletMeta.
function withProvisionedAccount(meta: WalletMeta, index: number): WalletMeta {
  if (isProvisioned(meta, index)) return meta
  return { ...meta, provisionedAccounts: [...(meta.provisionedAccounts ?? []), index] }
}

export default function () {
  const {
    sendCommand,
    appendLog,
    logs,
    walletState,
    setWalletState,
    workletReady,
    restartWorklet,
    error,
    setError,
    initElapsedSec,
    initStartedRef,
    reconcileLateLifecycleResponseRef,
  } = useWalletWorklet()

  const [screen, setScreen] = useState<Screen>('home')
  const [walletData, setWalletData] = useState<WalletData>({
    balances: null,
    depositAddress: null,
    mnemonic: null,
    syncStatus: null,
  })
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  // Which account index a switch/add-wallet call is currently booting, so
  // the switcher can show a spinner on that specific row -- these calls can
  // take up to the hook's lifecycle timeout (a real cold daemon stop+boot).
  const [pendingWalletIndex, setPendingWalletIndex] = useState<number | null>(null)
  const [walletSwitcherVisible, setWalletSwitcherVisible] = useState(false)
  const [loadingAddress, setLoadingAddress] = useState(false)
  // The last balance/info refresh failure, so the balance card can show it
  // directly instead of a bare '--' with no indication anything went wrong.
  const [balanceError, setBalanceError] = useState<string | null>(null)

  // `walletMeta` is null until either a previously-persisted wallet loads
  // from disk or onboarding completes -- both paths converge on this shape.
  const [storageChecked, setStorageChecked] = useState(false)
  const [walletMeta, setWalletMeta] = useState<WalletMeta | null>(null)
  const [onboardingSeedPhrase, setOnboardingSeedPhrase] = useState<string | null>(null)
  const [importSeedInput, setImportSeedInput] = useState('')
  // index -> identity pubkey, for the switcher's display only -- not
  // persisted (cheap to re-fetch via get-info after a restart).
  const [accountIdentities, setAccountIdentities] = useState<Record<number, string>>({})

  // Lightning: receive (create invoice)
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceMemo, setInvoiceMemo] = useState('')
  const [generatedInvoice, setGeneratedInvoice] = useState<string | null>(null)

  // Lightning: send (pay invoice)
  const [payInvoiceInput, setPayInvoiceInput] = useState('')
  const [payInvoiceFee, setPayInvoiceFee] = useState<bigint | null>(null)

  // Which inline Lightning form the home screen shows -- both live inline
  // on the home screen, not as separate navigated-to screens.
  const [lightningTab, setLightningTab] = useState<'receive' | 'send'>('receive')
  // The Balance card stays visible above tab content regardless of which
  // bottom tab is active -- only the sections below it swap.
  const [homeTab, setHomeTab] = useState<HomeTab>('onchain')

  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([])
  // Which activity row has its raw JSON expanded -- one at a time.
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)

  // Which copy button most recently fired, so it can flash "Copied" briefly
  // instead of needing a toast library for something this small.
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Wallet-wide exit portfolio + live VTXO inventory, refreshed on entering the Exit screen.
  const [exitSummaryData, setExitSummaryData] = useState<ExitSummaryData | null>(null)
  const [vtxos, setVtxos] = useState<WalletVTXO[]>([])
  const [exitTargetOutpoint, setExitTargetOutpoint] = useState<string | null>(null)
  const [exitMode, setExitMode] = useState<'cooperative' | 'unilateral'>('cooperative')
  const [exitDestination, setExitDestination] = useState('')
  // Set by "Preview Plan" (unilateral only); cleared whenever the target or
  // mode changes so a stale plan is never shown against a new VTXO.
  const [exitPlan, setExitPlan] = useState<ExitPlanEntry | null>(null)

  // Sweep: preview (broadcast: false) must be shown before broadcasting --
  // cleared whenever the destination changes so a stale preview can't be
  // broadcast against a different address.
  const [sweepDestination, setSweepDestination] = useState('')
  const [sweepPreview, setSweepPreview] = useState<SweepPreview | null>(null)

  // Loads any previously-persisted wallet once, on mount. `storageChecked`
  // distinguishes "still loading" from "confirmed no wallet yet", so
  // onboarding doesn't flash before this resolves.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const file = walletMetaFile()
        if (file.exists) {
          const raw = await file.text()
          if (!cancelled) setWalletMeta(JSON.parse(raw) as WalletMeta)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        appendLog(`Failed to load stored wallet: ${msg}`)
      } finally {
        if (!cancelled) setStorageChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [appendLog])

  const persistWalletMeta = useCallback(async (meta: WalletMeta) => {
    setWalletMeta(meta)
    walletMetaFile().write(JSON.stringify(meta))
  }, [])

  // Kept fresh every render (no dep array) so the worklet hook's sendCommand
  // timeout handler can reconcile a late add-account/switch-account success
  // against current walletMeta instead of leaving it stale.
  useEffect(() => {
    reconcileLateLifecycleResponseRef.current = (command, response) => {
      if (command !== 'add-account' && command !== 'switch-account') return
      if (typeof response.index !== 'number') return
      const index = response.index

      appendLog(`Late ${command} response arrived after its own timeout -- driver actually switched to account ${index} (${response.imported ? 'first-time import' : 'existing profile'}); reconciling.`)

      if (response.identityPubKey) {
        setAccountIdentities((prev) => ({ ...prev, [index]: response.identityPubKey! }))
      }
      setWalletMeta((prev) => {
        if (!prev) return prev
        const accounts = prev.accounts.includes(index) ? prev.accounts : [...prev.accounts, index]
        const next = { ...withProvisionedAccount(prev, index), accounts, activeAccountIndex: index }
        walletMetaFile().write(JSON.stringify(next))
        return next
      })
    }
  })

  // Once the worklet is ready and a wallet (from storage or onboarding) is
  // known, drives init-wallet + switch-account -- the worklet doesn't boot
  // anything on its own, since it doesn't know the seed until told.
  //
  // Deliberately does NOT restart the worklet on a timeout. Confirmed twice
  // (via a late response hitting its now-destroyed pipe and throwing EPIPE,
  // *after* we'd already given up and restarted) that a slow switch-account
  // call keeps running and eventually succeeds on its own -- it isn't
  // wedged, it's just slower than whatever timeout we pick. Restarting on
  // timeout guarantees failure in that case: it throws away an attempt that
  // was about to succeed and starts an identically slow one from zero,
  // forever. So this is a single attempt with a generous timeout
  // (LIFECYCLE_TIMEOUT_MS), not a retry loop -- if it's still not enough,
  // the error screen's manual Retry (which does restart the worklet) is the
  // deliberate fallback for a connection that's actually dead, not this.
  useEffect(() => {
    if (!walletMeta || !workletReady || initStartedRef.current) return
    initStartedRef.current = true

    // A previous invocation's in-flight command (e.g. still awaiting a
    // response from a worklet that's about to be replaced) doesn't stop
    // just because a newer invocation started -- both would otherwise race
    // to call setWalletState on the same shared ipcRef/pendingRef.
    // `cancelled` makes a superseded invocation a no-op.
    let cancelled = false
    ;(async () => {
      try {
        await sendCommand('init-wallet', { seedPhrase: walletMeta.seedPhrase, ...NETWORK_CONFIG })
        const alreadyProvisioned = isProvisioned(walletMeta, BOOT_ACCOUNT_INDEX)
        const result = await sendCommand(
          'switch-account',
          { index: BOOT_ACCOUNT_INDEX },
          alreadyProvisioned ? { timeoutMs: PROVISIONED_SWITCH_TIMEOUT_MS } : {}
        )
        if (cancelled) return
        if (result.identityPubKey) {
          setAccountIdentities((prev) => ({ ...prev, [BOOT_ACCOUNT_INDEX]: result.identityPubKey! }))
        }
        appendLog(`Account ${BOOT_ACCOUNT_INDEX} opened (${result.imported ? 'first-time import' : 'existing profile'})`)
        await persistWalletMeta({
          ...withProvisionedAccount(walletMeta, BOOT_ACCOUNT_INDEX),
          activeAccountIndex: BOOT_ACCOUNT_INDEX,
        })
        setWalletState('unlocked')
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        appendLog(`Wallet boot sequence failed: ${msg}`)
        setWalletState('error')
        setError(msg)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [walletMeta, workletReady, sendCommand, appendLog, initStartedRef, setWalletState, setError])

  // Refreshes balance + sync status only. Deliberately does NOT touch the
  // deposit address: deposit() allocates a fresh boarding address every
  // call (standard Ark address-rotation behavior), so wiring it into a
  // repeatable "refresh" would silently mint a new address on every tap.
  const handleRefresh = useCallback(async () => {
    if (!workletReady) return
    setLoading('refresh')
    try {
      const [balance, info] = await Promise.allSettled([
        sendCommand('get-balance'),
        sendCommand('get-info'),
      ])

      setWalletData((prev) => {
        const b = balance.status === 'fulfilled' ? (balance.value as CommandResponse) : null
        return {
          ...prev,
          balances: b ? { confirmed: BigInt(b.confirmedSat ?? '0') } : prev.balances,
          syncStatus:
            info.status === 'fulfilled' ? ((info.value as CommandResponse).synced ? 'synced' : 'syncing') : prev.syncStatus,
        }
      })

      if (balance.status === 'fulfilled' && info.status === 'fulfilled') {
        setError(null)
        setBalanceError(null)
      } else {
        // Surfaced here (not just logged) so a stuck/failing get-balance
        // doesn't just look like an indefinite blank with no explanation.
        const errors = [
          balance.status === 'rejected' ? `get-balance: ${(balance.reason as Error)?.message || 'Unknown error'}` : null,
          info.status === 'rejected' ? `get-info: ${(info.reason as Error)?.message || 'Unknown error'}` : null,
        ].filter((e): e is string => e !== null)
        const combined = errors.join('; ')
        appendLog(`Partial refresh: ${combined}`)
        setBalanceError(combined)
        setError(combined)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Refresh error: ${msg}`)
      setError(msg)
      setBalanceError(msg)
    } finally {
      setLoading(null)
    }
  }, [sendCommand, appendLog, walletMeta, workletReady, setError])

  const fetchDepositAddress = useCallback(async () => {
    setLoadingAddress(true)
    try {
      const deposit = await sendCommand('get-deposit-address')
      setWalletData((prev) => ({ ...prev, depositAddress: deposit.address || null }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Fetch deposit address failed: ${msg}`)
    } finally {
      setLoadingAddress(false)
    }
  }, [sendCommand, appendLog])

  // Runs once on unlock, and again every time the active account changes.
  useEffect(() => {
    if (walletState === 'unlocked' && walletMeta) {
      fetchDepositAddress()
      handleRefresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletState, walletMeta?.activeAccountIndex])

  const resetPerAccountState = useCallback(() => {
    setWalletData((prev) => ({ ...prev, balances: null, depositAddress: null, mnemonic: null }))
    setActivityEntries([])
  }, [])

  const handleStartOver = useCallback(() => {
    const file = walletMetaFile()
    if (file.exists) file.delete()
    setWalletMeta(null)
    setAccountIdentities({})
    resetPerAccountState()
    restartWorklet()
  }, [resetPerAccountState, restartWorklet])

  // "Wallet" in the UI == a wdk account -- every one derives from the same seed via getAccount(index).
  const handleAddWallet = useCallback(async () => {
    if (!walletMeta) return
    setLoading('add-wallet')
    // Only set once add-account itself responds -- if it fails outright
    // there's no new account to target, so the restart below just replays
    // against whatever account was already active.
    let addedIndex: number | undefined
    try {
      const result = await sendCommand('add-account')
      addedIndex = result.index!
      resetPerAccountState()
      if (result.identityPubKey) {
        setAccountIdentities((prev) => ({ ...prev, [addedIndex!]: result.identityPubKey! }))
      }
      appendLog(`Account ${addedIndex} opened (${result.imported ? 'first-time import' : 'existing profile'})`)
      await persistWalletMeta({
        ...withProvisionedAccount(walletMeta, addedIndex),
        accounts: [...walletMeta.accounts, addedIndex],
        activeAccountIndex: addedIndex,
      })
      setWalletSwitcherVisible(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Add wallet failed: ${msg} -- restarting worklet to recover`)
      if (addedIndex !== undefined) {
        await persistWalletMeta({
          ...withProvisionedAccount(walletMeta, addedIndex),
          accounts: walletMeta.accounts.includes(addedIndex) ? walletMeta.accounts : [...walletMeta.accounts, addedIndex],
          activeAccountIndex: addedIndex,
        })
      }
      restartWorklet()
    } finally {
      setLoading(null)
    }
  }, [walletMeta, sendCommand, persistWalletMeta, resetPerAccountState, restartWorklet, appendLog])

  const handleSwitchWallet = useCallback(
    async (index: number) => {
      if (!walletMeta) return
      if (index === walletMeta.activeAccountIndex) {
        setWalletSwitcherVisible(false)
        return
      }

      setLoading('switch-wallet')
      setPendingWalletIndex(index)
      try {
        const alreadyProvisioned = isProvisioned(walletMeta, index)
        const result = await sendCommand(
          'switch-account',
          { index },
          alreadyProvisioned ? { timeoutMs: PROVISIONED_SWITCH_TIMEOUT_MS } : {}
        )
        resetPerAccountState()
        if (result.identityPubKey) {
          setAccountIdentities((prev) => ({ ...prev, [index]: result.identityPubKey! }))
        }
        appendLog(`Account ${index} opened (${result.imported ? 'first-time import' : 'existing profile'})`)
        await persistWalletMeta({ ...withProvisionedAccount(walletMeta, index), activeAccountIndex: index })
        setWalletSwitcherVisible(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        appendLog(`Switch wallet failed: ${msg} -- restarting worklet to recover`)
        await persistWalletMeta({ ...walletMeta, activeAccountIndex: index })
        restartWorklet()
      } finally {
        setLoading(null)
        setPendingWalletIndex(null)
      }
    },
    [walletMeta, sendCommand, persistWalletMeta, resetPerAccountState, restartWorklet, appendLog]
  )

  const handleStartCreateWallet = useCallback(async () => {
    setLoading('generate-seed')
    try {
      const result = await sendCommand('generate-seed', { wordCount: 24 })
      if (!result.seedPhrase) throw new Error('Invalid generate-seed response')
      setOnboardingSeedPhrase(result.seedPhrase)
      setScreen('onboarding-create')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Generate seed failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sendCommand, appendLog])

  const handleConfirmCreateWallet = useCallback(async () => {
    if (!onboardingSeedPhrase) return
    await persistWalletMeta({ seedPhrase: onboardingSeedPhrase, accounts: [0], activeAccountIndex: 0 })
    setOnboardingSeedPhrase(null)
    setScreen('home')
  }, [onboardingSeedPhrase, persistWalletMeta])

  const handleSubmitImportWallet = useCallback(async () => {
    const phrase = importSeedInput.trim().replace(/\s+/g, ' ')
    const wordCount = phrase ? phrase.split(' ').length : 0
    if (wordCount !== 12 && wordCount !== 24) {
      Alert.alert('Error', 'Enter a valid 12 or 24-word recovery phrase')
      return
    }
    // Real BIP-39 checksum validation happens when init-wallet reaches the
    // base WalletManager's bip39.mnemonicToSeedSync.
    await persistWalletMeta({ seedPhrase: phrase, accounts: [0], activeAccountIndex: 0 })
    setImportSeedInput('')
    setScreen('home')
  }, [importSeedInput, persistWalletMeta])

  // Actually broadcasts -- only ever called after handleSendTransaction's
  // quote+confirm step below, never directly from the Send button.
  const executeSend = useCallback(async (address: string, amount: number) => {
    setLoading('send')
    try {
      const result = await sendCommand('send-transaction', {
        address,
        satoshis: amount,
      })

      setSendTo('')
      setSendAmount('')
      Alert.alert('Success', `Transaction sent!\nHash: ${(result as CommandResponse).hash}`)
      await new Promise((r) => setTimeout(r, 1000))
      await handleRefresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Send failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sendCommand, handleRefresh, appendLog])

  // Quotes the fee first and shows it in the confirmation prompt -- an
  // on-chain send is irreversible, unlike Lightning, which already had its
  // own separate "Get Fee Quote" step.
  const handleSendTransaction = useCallback(async () => {
    if (!sendTo || !sendAmount) {
      Alert.alert('Error', 'Address and amount required')
      return
    }

    const amount = parseInt(sendAmount, 10)
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Amount must be a positive number')
      return
    }

    setLoading('quote-send')
    try {
      const result = await sendCommand('quote-send-transaction', { address: sendTo, satoshis: amount })
      const feeSat = result.feeSat ? BigInt(result.feeSat) : 0n
      Alert.alert(
        'Confirm Send',
        `Send ${amount.toLocaleString()} sats to\n${sendTo}\n\nEstimated fee: ${feeSat.toLocaleString()} sats`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send', style: 'destructive', onPress: () => executeSend(sendTo, amount) },
        ]
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Quote send failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sendTo, sendAmount, sendCommand, executeSend, appendLog])

  const handleShowActivity = useCallback(async () => {
    setHomeTab('activity')
    setLoading('activity')
    try {
      const result = await sendCommand('list-activity')
      setActivityEntries(result.entries || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`List activity failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sendCommand, appendLog])

  const handleShowMnemonic = useCallback(async () => {
    setLoading('mnemonic')
    try {
      const result = await sendCommand('get-mnemonic')
      const words = (result as CommandResponse).words
      if (!Array.isArray(words)) throw new Error('Invalid mnemonic response')
      setWalletData((prev) => ({ ...prev, mnemonic: words }))
      setScreen('mnemonic')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Get mnemonic failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sendCommand, appendLog])

  const handleCreateInvoice = useCallback(async () => {
    const amount = parseInt(invoiceAmount, 10)
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Amount must be a positive number of satoshis')
      return
    }

    setLoading('create-invoice')
    try {
      const result = await sendCommand('create-lightning-invoice', {
        amountSat: amount,
        memo: invoiceMemo,
      })
      setGeneratedInvoice(result.invoice || null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Create invoice failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [invoiceAmount, invoiceMemo, sendCommand, appendLog])

  const handleQuoteInvoice = useCallback(async () => {
    if (!payInvoiceInput) {
      Alert.alert('Error', 'Paste an invoice first')
      return
    }

    setLoading('quote-invoice')
    setPayInvoiceFee(null)
    try {
      const result = await sendCommand('quote-pay-lightning-invoice', { invoice: payInvoiceInput })
      setPayInvoiceFee(result.feeSat ? BigInt(result.feeSat) : null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Quote invoice failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [payInvoiceInput, sendCommand, appendLog])

  const handlePayInvoice = useCallback(async () => {
    if (!payInvoiceInput) {
      Alert.alert('Error', 'Paste an invoice first')
      return
    }

    setLoading('pay-invoice')
    try {
      await sendCommand('pay-lightning-invoice', { invoice: payInvoiceInput })
      setPayInvoiceInput('')
      setPayInvoiceFee(null)
      Alert.alert('Success', 'Lightning payment sent')
      await new Promise((r) => setTimeout(r, 1000))
      await handleRefresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Pay invoice failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [payInvoiceInput, sendCommand, handleRefresh, appendLog])

  // Fetches the exit-wide summary plus the live VTXO inventory for the
  // currently active account and opens the Exit screen.
  const handleOpenExit = useCallback(async () => {
    setLoading('exit-open')
    try {
      const [summary, vtxoList] = await Promise.all([
        sendCommand('exit-summary'),
        sendCommand('list-vtxos'),
      ])
      setExitSummaryData({
        totalExits: summary.totalExits ?? 0,
        totalVTXOAmountSat: summary.totalVTXOAmountSat ?? 0,
        totalEstFeeSat: summary.totalEstFeeSat ?? 0,
        totalEstNetRecoveredSat: summary.totalEstNetRecoveredSat ?? 0,
      })
      setVtxos(vtxoList.vtxos || [])
      setExitTargetOutpoint(null)
      setExitPlan(null)
      setScreen('exit')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Open exit screen failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sendCommand, appendLog])

  const handleSelectExitTarget = useCallback((outpoint: string) => {
    setExitTargetOutpoint(outpoint)
    setExitMode('cooperative')
    setExitDestination('')
    setExitPlan(null)
  }, [])

  // Unilateral-only: previews funding/feasibility before committing to
  // exit()'s unilateral branch. Always plans for exactly one outpoint here.
  const handlePreviewExitPlan = useCallback(async () => {
    if (!exitTargetOutpoint) return
    setLoading('exit-plan')
    try {
      const result = await sendCommand('get-exit-plan', { outpoints: [exitTargetOutpoint] })
      const plan = result.plans?.[0]
      if (!plan) throw new Error('Invalid exit plan response')
      setExitPlan(plan)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Get exit plan failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [exitTargetOutpoint, sendCommand, appendLog])

  // Cooperative queues into the next round; unilateral requires an already-
  // confirmed plan (via handlePreviewExitPlan), since it forces the VTXO
  // on-chain and can't be undone.
  const handleStartExit = useCallback(async () => {
    if (!exitTargetOutpoint) return

    setLoading('exit-start')
    try {
      const result = await sendCommand('exit', {
        outpoint: exitTargetOutpoint,
        mode: exitMode,
        destination: exitMode === 'cooperative' ? exitDestination || undefined : undefined,
      })
      if (result.path === 'cooperative') {
        Alert.alert('Exit queued', 'The VTXO was queued into the next cooperative round.')
      } else {
        Alert.alert('Unilateral exit started', 'This runs on-chain and can take hours or days to complete. Check its status from the VTXO list.')
      }
      setExitTargetOutpoint(null)
      setExitPlan(null)
      const [summary, vtxoList] = await Promise.all([
        sendCommand('exit-summary'),
        sendCommand('list-vtxos'),
      ])
      setExitSummaryData({
        totalExits: summary.totalExits ?? 0,
        totalVTXOAmountSat: summary.totalVTXOAmountSat ?? 0,
        totalEstFeeSat: summary.totalEstFeeSat ?? 0,
        totalEstNetRecoveredSat: summary.totalEstNetRecoveredSat ?? 0,
      })
      setVtxos(vtxoList.vtxos || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Exit failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [exitTargetOutpoint, exitMode, exitDestination, sendCommand, appendLog])

  const handleCheckExitStatus = useCallback(async (outpoint: string) => {
    setLoading(`exit-status:${outpoint}`)
    try {
      const result = await sendCommand('exit-status', { outpoint, detailed: true })
      if (!result.found) {
        Alert.alert('No exit in progress', 'This VTXO has no exit job running.')
        return
      }
      const lines = [
        `Status: ${result.status}`,
        result.phaseDetail ? result.phaseDetail : null,
        result.bestCaseBlocksRemaining ? `Best-case blocks remaining: ${result.bestCaseBlocksRemaining}` : null,
        result.sweepTxid ? `Sweep txid: ${result.sweepTxid}` : null,
        result.lastError ? `Last error: ${result.lastError}` : null,
      ].filter(Boolean)
      Alert.alert('Exit status', lines.join('\n'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Exit status failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sendCommand, appendLog])

  const handlePreviewSweep = useCallback(async () => {
    if (!sweepDestination) {
      Alert.alert('Error', 'Enter a destination address first')
      return
    }
    setLoading('sweep-preview')
    setSweepPreview(null)
    try {
      const result = await sendCommand('sweep-wallet', { destinationAddress: sweepDestination, broadcast: false })
      setSweepPreview({
        inputs: result.inputs || [],
        totalInputSat: result.totalInputSat ?? 0,
        estimatedFeeSat: result.estimatedFeeSat ?? 0,
        netAmountSat: result.netAmountSat ?? 0,
        feeRateSatPerVByte: result.feeRateSatPerVByte ?? 0,
        canBroadcast: !!result.canBroadcast,
        txid: result.txid ?? '',
        failureReason: result.failureReason ?? '',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Preview sweep failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sweepDestination, sendCommand, appendLog])

  const handleBroadcastSweep = useCallback(async () => {
    if (!sweepDestination) return
    setLoading('sweep-broadcast')
    try {
      const result = await sendCommand('sweep-wallet', { destinationAddress: sweepDestination, broadcast: true })
      Alert.alert('Sweep broadcast', `Txid: ${result.txid}`)
      setSweepPreview(null)
      setSweepDestination('')
      await handleRefresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Broadcast sweep failed: ${msg}`)
      Alert.alert('Error', msg)
    } finally {
      setLoading(null)
    }
  }, [sweepDestination, sendCommand, handleRefresh, appendLog])

  const handleCopy = useCallback(async (text: string, field: string) => {
    await Clipboard.setStringAsync(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500)
  }, [])

  if (!storageChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    )
  }

  if (walletState === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', paddingHorizontal: 20 }}>
        <Text style={{ color: COLORS.error, fontSize: 16, marginBottom: 20, textAlign: 'center' }}>
          {error || 'Wallet error'}
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.accent, padding: 12, borderRadius: 8, alignItems: 'center' }}
          onPress={restartWorklet}
        >
          <Text style={{ color: COLORS.bg, fontWeight: 'bold' }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 }}
          onPress={() => {
            Alert.alert(
              'Start over?',
              'This removes the wallet from this device. Make sure you have its recovery phrase backed up -- it cannot be recovered from this app afterward.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Start Over', style: 'destructive', onPress: handleStartOver },
              ]
            )
          }}
        >
          <Text style={{ color: COLORS.dim, fontSize: 13 }}>Start Over</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // A known wallet is booting -- shown full-screen instead of falling
  // through to the home screen, which would otherwise render every card
  // stuck in its own empty/spinning state before there's an active account.
  if (walletMeta && walletState === 'initializing') {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 }}>
          <HeaderLogo />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32 }}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={{ color: COLORS.dim, fontSize: 13, textAlign: 'center' }}>
            {isProvisioned(walletMeta, BOOT_ACCOUNT_INDEX)
              ? `Initializing... (${initElapsedSec}s)`
              : `Setting up your wallet for the first time -- this can take a few minutes (${initElapsedSec}s)`}
          </Text>
        </View>
      </View>
    )
  }

  if (!walletMeta) {
    return (
      <OnboardingScreen
        screen={screen}
        loading={loading}
        onboardingSeedPhrase={onboardingSeedPhrase}
        importSeedInput={importSeedInput}
        setImportSeedInput={setImportSeedInput}
        setScreen={setScreen}
        handleStartCreateWallet={handleStartCreateWallet}
        handleConfirmCreateWallet={handleConfirmCreateWallet}
        handleSubmitImportWallet={handleSubmitImportWallet}
      />
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 56,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <HeaderLogo />
        <Text style={{ color: COLORS.dim, fontSize: 14, marginTop: 10 }}>
          {walletState === 'initializing' ? 'Initializing...' : 'Ready'}
        </Text>
        {walletState === 'unlocked' && (
          <TouchableOpacity
            onPress={() => setWalletSwitcherVisible(true)}
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              backgroundColor: COLORS.border,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: COLORS.accent, fontSize: 12, fontWeight: '600' }}>
              Wallet {walletMeta.activeAccountIndex}
              {accountIdentities[walletMeta.activeAccountIndex]
                ? ` (${formatPubkey(accountIdentities[walletMeta.activeAccountIndex])})`
                : ''}{' '}
              ▾
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <View style={{ backgroundColor: COLORS.errorBg, padding: 12, marginHorizontal: 12, marginTop: 12, borderRadius: 8 }}>
          <Text style={{ color: COLORS.error, fontSize: 12 }}>{error}</Text>
        </View>
      )}

      <WalletSwitcherModal
        visible={walletSwitcherVisible}
        onClose={() => setWalletSwitcherVisible(false)}
        walletMeta={walletMeta}
        loading={loading}
        pendingWalletIndex={pendingWalletIndex}
        accountIdentities={accountIdentities}
        handleSwitchWallet={handleSwitchWallet}
        handleAddWallet={handleAddWallet}
      />

      {screen === 'home' && (
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 16 }}
            refreshControl={
              <RefreshControl
                refreshing={loading === 'refresh' || loading === 'activity'}
                onRefresh={() => {
                  if (homeTab === 'activity') handleShowActivity()
                  else handleRefresh()
                }}
                tintColor={COLORS.accent}
              />
            }
          >
            <BalanceCard walletData={walletData} loading={loading} balanceError={balanceError} handleRefresh={handleRefresh} />

            {homeTab === 'onchain' && (
              <OnChainTab
                walletState={walletState}
                loadingAddress={loadingAddress}
                depositAddress={walletData.depositAddress}
                fetchDepositAddress={fetchDepositAddress}
                copiedField={copiedField}
                handleCopy={handleCopy}
                sendTo={sendTo}
                setSendTo={setSendTo}
                sendAmount={sendAmount}
                setSendAmount={setSendAmount}
                loading={loading}
                handleSendTransaction={handleSendTransaction}
              />
            )}

            {homeTab === 'lightning' && (
              <LightningTab
                lightningTab={lightningTab}
                setLightningTab={setLightningTab}
                loading={loading}
                invoiceAmount={invoiceAmount}
                setInvoiceAmount={setInvoiceAmount}
                invoiceMemo={invoiceMemo}
                setInvoiceMemo={setInvoiceMemo}
                handleCreateInvoice={handleCreateInvoice}
                generatedInvoice={generatedInvoice}
                copiedField={copiedField}
                handleCopy={handleCopy}
                payInvoiceInput={payInvoiceInput}
                setPayInvoiceInput={setPayInvoiceInput}
                setPayInvoiceFee={setPayInvoiceFee}
                handleQuoteInvoice={handleQuoteInvoice}
                payInvoiceFee={payInvoiceFee}
                handlePayInvoice={handlePayInvoice}
              />
            )}

            {homeTab === 'activity' && (
              <ActivityTab
                activityEntries={activityEntries}
                expandedEntryId={expandedEntryId}
                setExpandedEntryId={setExpandedEntryId}
              />
            )}

            {homeTab === 'account' && (
              <AccountTab
                loading={loading}
                handleOpenExit={handleOpenExit}
                handleShowMnemonic={handleShowMnemonic}
                setScreen={setScreen}
              />
            )}
          </ScrollView>

          <BottomTabBar homeTab={homeTab} setHomeTab={setHomeTab} handleShowActivity={handleShowActivity} />
        </View>
      )}

      {screen === 'exit' && (
        <ExitScreen
          exitSummaryData={exitSummaryData}
          vtxos={vtxos}
          exitTargetOutpoint={exitTargetOutpoint}
          handleSelectExitTarget={handleSelectExitTarget}
          handleCheckExitStatus={handleCheckExitStatus}
          loading={loading}
          exitMode={exitMode}
          setExitMode={setExitMode}
          exitDestination={exitDestination}
          setExitDestination={setExitDestination}
          exitPlan={exitPlan}
          setExitPlan={setExitPlan}
          setExitTargetOutpoint={setExitTargetOutpoint}
          handlePreviewExitPlan={handlePreviewExitPlan}
          handleStartExit={handleStartExit}
          sweepDestination={sweepDestination}
          setSweepDestination={setSweepDestination}
          sweepPreview={sweepPreview}
          setSweepPreview={setSweepPreview}
          handlePreviewSweep={handlePreviewSweep}
          handleBroadcastSweep={handleBroadcastSweep}
          handleOpenExit={handleOpenExit}
          setScreen={setScreen}
        />
      )}

      {screen === 'mnemonic' && (
        <MnemonicScreen mnemonic={walletData.mnemonic} copiedField={copiedField} handleCopy={handleCopy} setScreen={setScreen} />
      )}

      {screen === 'logs' && <LogsScreen logs={logs} setScreen={setScreen} />}
    </View>
  )
}
