// Hand-declared: `require.addon()` is opaque to TypeScript. The int64 getters
// resolve decimal strings.
declare const subscriptionBrand: unique symbol

declare namespace addon {
  /** Opaque stream handle; closed on GC if never closed explicitly. */
  type Subscription = { readonly [subscriptionBrand]: true }

  type JsonMethod = (reqJson?: string) => Promise<string | null>
  type JsonGetter = () => Promise<string | null>
}

declare const addon: {
  start(cfgJson: string): Promise<boolean>
  stop(): Promise<boolean>
  isRunning(): Promise<boolean>
  walletReady(): Promise<boolean>
  confirmedBalanceSat(): Promise<string>
  pendingInboundSat(): Promise<string>

  getInfo: addon.JsonGetter
  status: addon.JsonGetter
  balance: addon.JsonGetter

  startExternalSeedWallet: addon.JsonMethod
  createWallet: addon.JsonMethod
  unlockWallet: addon.JsonMethod
  openWalletFromPasskey: addon.JsonMethod
  deposit: addon.JsonMethod
  receive: addon.JsonMethod
  prepareSend: addon.JsonMethod
  sendPrepared: addon.JsonMethod
  list: addon.JsonMethod
  exit: addon.JsonMethod
  exitStatus: addon.JsonMethod
  exitSummary: addon.JsonMethod
  getExitPlan: addon.JsonMethod
  sweepWallet: addon.JsonMethod

  subscribe(reqJson?: string): Promise<addon.Subscription>
  /** Resolves null once the stream has ended cleanly. */
  subscriptionNext(subscription: addon.Subscription): Promise<string | null>
  subscriptionClose(subscription: addon.Subscription): Promise<void>
}

export = addon
