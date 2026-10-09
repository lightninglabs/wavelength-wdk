import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, DeviceEventEmitter, Platform } from 'react-native'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'
import { Paths } from 'expo-file-system'
import bundle from '../worklet/driver-wdk.bundle.js'
import NativeWavelength from '@lightninglabs/wdk-wallet-wavelength/native'

import { createIpcRelay } from '../lib/ipc-relay'
import type { CommandResponse, WalletState, WorkletEvent } from '../lib/types'

// Full daemon stop+boot can take minutes on a flaky network.
const LIFECYCLE_COMMANDS = new Set(['init-wallet', 'add-account', 'switch-account'])
// switch-account doesn't wait for the mailbox/swap-server connection that the
// first Lightning call opens.
const SLOW_FIRST_USE_COMMANDS = new Set(['create-lightning-invoice', 'pay-lightning-invoice', 'quote-pay-lightning-invoice'])
const COMMAND_TIMEOUT_MS = 30_000
const SLOW_FIRST_USE_TIMEOUT_MS = 60_000
const LIFECYCLE_TIMEOUT_MS = 180_000

/** Callers own wallet-level state (walletMeta, active account). */
export function useWalletWorklet() {
  const [walletState, setWalletState] = useState<WalletState>('initializing')
  const [workletReady, setWorkletReady] = useState(false)
  const [restartKey, setRestartKey] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // The native boot call has no progress signal; this distinguishes waiting
  // from hung.
  const [initElapsedSec, setInitElapsedSec] = useState(0)

  const workletRef = useRef<Worklet | undefined>(undefined)
  const commandIdRef = useRef(0)
  const pendingRef = useRef<Record<number, (data: CommandResponse) => void>>({})
  const bufferRef = useRef('')
  const ipcRef = useRef<any>(null)
  const relayTeardownRef = useRef<(() => void) | null>(null)
  const initStartedRef = useRef(false)
  // add-account/switch-account aren't cancellable, so a late success must be
  // reconciled against wallet-meta rather than dropped.
  const reconcileLateLifecycleResponseRef = useRef<(command: string, response: CommandResponse) => void>(() => {})
  const currentLifecycleTimeoutMsRef = useRef(LIFECYCLE_TIMEOUT_MS)
  const workletEventRef = useRef<(event: WorkletEvent) => void>(() => {})

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
          // Boot/close keep running after we give up, so lifecycle commands
          // keep the slot and send a late response to the reconciler.
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

  // The daemon is a process-wide singleton with no way to cancel a stuck
  // native call, so recreating the Worklet is the only recovery. A JS reload
  // alone doesn't kill the native Worklet, and its late write throws EPIPE.
  const restartWorklet = useCallback(() => {
    // Settle rather than clear: pending promises would never run callers'
    // finally blocks and the UI would strand.
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
      // Reset for every new worklet so a replacement gets a fresh init.
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
            // Android's IPC also carries the transport's own messages, which
            // would collide on id; createIpcRelay handles them.
            if (typeof msg.method === 'string' || typeof msg.ok === 'boolean' || msg.type === 'activityEvent') {
              continue
            }

            if (typeof (msg as { event?: unknown }).event === 'string') {
              const event = msg as unknown as WorkletEvent
              appendLog(`EVT ${event.event} ${JSON.stringify(event)}`)
              workletEventRef.current(event)
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

      // Android reaches the daemon through the relay; iOS runs it in-process.
      if (Platform.OS === 'android') {
        if (NativeWavelength) {
          relayTeardownRef.current = createIpcRelay({
            ipc: IPC,
            nativeWavelength: NativeWavelength,
            activityEmitter: DeviceEventEmitter,
          })
        } else {
          // Not fatal, but every facade call will hang awaiting a response.
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

  // Without this, iOS can tear down the worklet under an in-flight IPC op
  // when the app backgrounds.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      workletRef.current?.update(nextState)
    })
    return () => subscription.remove()
  }, [])

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
    workletEventRef,
  }
}
