import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, DeviceEventEmitter, Platform } from 'react-native'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'
import { Paths } from 'expo-file-system'
import bundle from '../worklet/driver-wdk.bundle.js'
import NativeWavelength from 'wavelength-bindings/native'

import { createIpcRelay } from '../lib/ipc-relay'
import type { CommandResponse, WalletState } from '../lib/types'

// Lifecycle commands (full daemon stop+boot) can take much longer than an
// ordinary call -- iOS boots have taken minutes under a flaky network -- so
// they get their own timeout tier instead of misreporting a timeout for a
// boot that's still genuinely in progress.
const LIFECYCLE_COMMANDS = new Set(['init-wallet', 'add-account', 'switch-account'])
// The first Lightning call after switching accounts needs its own
// mailbox/swap-server connection, which isn't covered by switch-account's
// own readiness wait -- so it gets a longer timeout too.
const SLOW_FIRST_USE_COMMANDS = new Set(['create-lightning-invoice', 'pay-lightning-invoice', 'quote-pay-lightning-invoice'])
const COMMAND_TIMEOUT_MS = 30_000
const SLOW_FIRST_USE_TIMEOUT_MS = 60_000
const LIFECYCLE_TIMEOUT_MS = 180_000

/**
 * Owns the Worklet instance, its IPC transport, and sendCommand()'s
 * request/response bookkeeping. Everything about "is the daemon connection
 * alive and how do we talk to it" lives here; callers own the wallet-level
 * state (walletMeta, which account is active) that the connection responds
 * to but doesn't itself hold.
 */
export function useWalletWorklet() {
  const [walletState, setWalletState] = useState<WalletState>('initializing')
  const [workletReady, setWorkletReady] = useState(false)
  const [restartKey, setRestartKey] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // Live seconds-elapsed while walletState is 'initializing' -- with no
  // progress/heartbeat signal from the native boot call, "still genuinely
  // waiting" and "silently hung" are otherwise indistinguishable until the
  // lifecycle timeout fires.
  const [initElapsedSec, setInitElapsedSec] = useState(0)

  const workletRef = useRef<Worklet | undefined>(undefined)
  const commandIdRef = useRef(0)
  const pendingRef = useRef<Record<number, (data: CommandResponse) => void>>({})
  const bufferRef = useRef('')
  const ipcRef = useRef<any>(null)
  const relayTeardownRef = useRef<(() => void) | null>(null)
  // Gates the init-sequence effect (owned by the caller) so it only fires
  // once per worklet instance -- exposed so restartWorklet/a fresh worklet
  // can reset it.
  const initStartedRef = useRef(false)
  // add-account/switch-account aren't cancellable once sent -- a late
  // success needs reconciling against current wallet-meta state instead of
  // being silently dropped. The caller (which owns that state) populates
  // this ref; sendCommand's timeout handler below just calls it.
  const reconcileLateLifecycleResponseRef = useRef<(command: string, response: CommandResponse) => void>(() => {})
  const currentLifecycleTimeoutMsRef = useRef(LIFECYCLE_TIMEOUT_MS)

  const appendLog = useCallback((msg: string) => {
    console.log(`[wallet] ${msg}`)
    setLogs((prev) => [...prev.slice(-99), msg])
  }, [])

  const sendCommand = useCallback(
    async (
      command: string,
      params: Record<string, unknown> = {},
      options: { timeoutMs?: number } = {}
    ): Promise<CommandResponse> => {
      if (!ipcRef.current) throw new Error('IPC not available')

      const id = commandIdRef.current++
      const msg = { id, command, ...params }
      appendLog(`REQ #${id} ${command} ${JSON.stringify(params)}`)
      ipcRef.current.write(b4a.from(JSON.stringify(msg) + '\n'))

      // An explicit override (e.g. a short timeout for an account already
      // known to open fast) always wins over the command-name-based default.
      const timeoutMs = options.timeoutMs ?? (
        LIFECYCLE_COMMANDS.has(command)
          ? LIFECYCLE_TIMEOUT_MS
          : SLOW_FIRST_USE_COMMANDS.has(command)
            ? SLOW_FIRST_USE_TIMEOUT_MS
            : COMMAND_TIMEOUT_MS
      )

      if (LIFECYCLE_COMMANDS.has(command)) {
        currentLifecycleTimeoutMsRef.current = timeoutMs
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Boot/close keep running after we give up waiting -- for
          // lifecycle commands, keep the slot but redirect a late response
          // to the reconciler instead of dropping it.
          if (LIFECYCLE_COMMANDS.has(command)) {
            pendingRef.current[id] = (response: CommandResponse) => {
              if (!response.error) reconcileLateLifecycleResponseRef.current(command, response)
            }
          } else {
            delete pendingRef.current[id]
          }
          reject(new Error(`Command ${command} timed out after ${timeoutMs / 1000}s`))
        }, timeoutMs)

        pendingRef.current[id] = (response: CommandResponse) => {
          clearTimeout(timeout)
          if (response.error) {
            reject(new Error(response.error))
          } else {
            resolve(response)
          }
        }
      })
    },
    [appendLog]
  )

  // Tears down and recreates the Worklet. The embedded daemon is a
  // process-wide singleton with no way to cancel a stuck native call, so
  // this is the only recovery from a wedged worklet (used by the error
  // screen's Retry, and by a failed account switch to self-heal) -- a JS
  // reload alone doesn't kill the native Worklet, and a late in-flight
  // write from the old one throws an uncaught EPIPE (seen on a real
  // device). The caller's init-sequence effect then replays automatically
  // once initStartedRef is reset.
  const restartWorklet = useCallback(() => {
    // Settle every in-flight command before dropping it. Clearing the map
    // outright leaves those promises pending forever, so any caller's
    // finally/cleanup (loading flags, in-flight guards) never runs and the
    // UI can strand permanently. Routing through the stored handler reuses
    // sendCommand's own reject path and clears its timeout.
    for (const handler of Object.values(pendingRef.current)) {
      handler({ error: 'Worklet restarted before this command completed' })
    }
    pendingRef.current = {}
    bufferRef.current = ''
    initStartedRef.current = false
    ipcRef.current = null
    setWorkletReady(false)
    setError(null)
    setWalletState('initializing')
    setRestartKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let worklet: Worklet | undefined

    try {
      worklet = new Worklet()
      workletRef.current = worklet
      // Reset for every new worklet (not just an explicit Retry) so a
      // replacement always gets a fresh init attempt.
      initStartedRef.current = false
      const documentDir = Paths.document.uri.replace('file://', '')

      worklet.start('/app.bundle', bundle, [documentDir])
      const { IPC } = worklet as any
      ipcRef.current = IPC
      setWorkletReady(true)

      IPC.on('data', (data: unknown) => {
        bufferRef.current += b4a.toString(data as Uint8Array)
        const lines = bufferRef.current.split('\n')
        bufferRef.current = lines.pop() ?? ''

        for (const raw of lines) {
          if (!raw) continue

          try {
            const msg = JSON.parse(raw) as CommandResponse & { method?: string; ok?: boolean; type?: string }
            // On Android, this same IPC also carries
            // wavelength-transport-bare-android.js's own request/response
            // protocol and activityEvent pushes -- ignore those here rather
            // than risk an id collision; createIpcRelay handles them below.
            if (typeof msg.method === 'string' || typeof msg.ok === 'boolean' || msg.type === 'activityEvent') {
              continue
            }

            const resId = typeof msg.id === 'number' ? `#${msg.id}` : '(no id)'
            appendLog(`RES ${resId} ${msg.command || msg.status || 'unknown'} ${JSON.stringify(msg)}`)

            if (typeof msg.id === 'number' && pendingRef.current[msg.id]) {
              pendingRef.current[msg.id](msg)
              delete pendingRef.current[msg.id]
            }

            if (msg.status === 'fatal') {
              setWalletState('error')
              setError(msg.message || 'Fatal error')
            }
          } catch (err) {
            appendLog(`Parse error: ${err}`)
          }
        }
      })

      IPC.on('error', (err: Error) => {
        appendLog(`IPC error: ${err.message}`)
        setWalletState('error')
        setError(err.message)
      })

      // Android only -- reaches the daemon via the RN TurboModule relay
      // instead of in-process like iOS.
      if (Platform.OS === 'android') {
        if (NativeWavelength) {
          relayTeardownRef.current = createIpcRelay({
            ipc: IPC,
            nativeWavelength: NativeWavelength,
            activityEmitter: DeviceEventEmitter,
          })
        } else {
          // Expected until the Kotlin module is compiled and linked (see
          // wavelength-bindings/README.md) -- not fatal, but every facade
          // call will hang waiting for a relay response that never comes.
          appendLog('Wavelength native module not linked -- Android wallet calls will not work yet')
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendLog(`Failed to start: ${msg}`)
      setWalletState('error')
      setError(msg)
    }

    return () => {
      relayTeardownRef.current?.()
      relayTeardownRef.current = null
      worklet?.terminate()
    }
  }, [appendLog, restartKey])

  // Keeps the worklet's native execution in sync with foreground/background
  // state -- without this, iOS can tear down the worklet under an in-flight
  // IPC op whenever the app backgrounds (screen lock, app switch, a call).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      workletRef.current?.update(nextState)
    })
    return () => subscription.remove()
  }, [])

  // Ticks initElapsedSec while booting and logs a heartbeat every 15s so
  // there's visible progress between the request going out and either its
  // response or the timeout.
  useEffect(() => {
    if (walletState !== 'initializing') {
      setInitElapsedSec(0)
      return
    }
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000)
      setInitElapsedSec(elapsed)
      if (elapsed > 0 && elapsed % 15 === 0) {
        appendLog(`Still waiting on boot sequence (${elapsed}s elapsed, times out at ${currentLifecycleTimeoutMsRef.current / 1000}s)`)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [walletState, appendLog])

  return {
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
  }
}
