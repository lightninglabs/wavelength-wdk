export type ButtonVariant = 'primary' | 'danger' | 'secondary'

export type WalletState = 'initializing' | 'unlocked' | 'error' | 'disconnected'
export type Screen =
  | 'home'
  | 'send'
  | 'mnemonic'
  | 'logs'
  | 'exit'
  | 'onboarding-create'
  | 'onboarding-import'

export type WalletMeta = {
  seedPhrase: string
  accounts: number[]
  activeAccountIndex: number
  // Indices that completed a switch/add-account before, so reopening is fast.
  // Absent on older persisted meta; treat missing as [].
  provisionedAccounts?: number[]
}

export type Balances = {
  confirmed: bigint
}

// Raw daemon Entry; nested objects stay loose because the UI reads only the
// top-level fields.
export type EntryKind = 'send' | 'receive' | 'deposit' | 'exit'
export type EntryStatus = 'pending' | 'complete' | 'failed'
export type ActivityEntry = {
  id: string
  kind: EntryKind
  status: EntryStatus
  amountSat: number
  feeSat: number
  counterparty: string
  createdAt: string
  updatedAt: string
  note: string
  failureReason: string
} & Record<string, unknown>

export type WorkletEvent =
  | { event: 'activity'; index: number; entry: ActivityEntry }
  | { event: 'activity-stream'; index: number; state: 'ended' }
  | { event: 'activity-stream'; index: number; state: 'failed'; message: string }

// Field names and casing mirror the wire format; do not rename.
export type WalletVTXO = {
  outpoint: string
  amountSat: number
  status: string
  batchExpiry: number
  relativeExpiry: number
  commitmentTxid: string
}

export type ExitInfeasibilityReason = 'unspecified' | 'sweep_below_dust' | 'uneconomical' | 'wallet_underfunded' | 'wallet_too_few_inputs'

export type ExitJobStatus = 'unspecified' | 'pending' | 'materializing' | 'csv_pending' | 'sweeping' | 'completed' | 'failed'

export type ExitSummaryEntry = {
  outpoint: string
  status: ExitJobStatus
  vTXOAmountSat: number
  estTotalFeeSat: number
  estNetRecoveredSat: number
}

export type ExitPlanEntry = {
  outpoint: string
  fundingAddress: string
  requiredConfirmations: number
  requiredFeeUTXOCount: number
  usableFeeUTXOCount: number
  recommendedUTXOAmountSat: number
  recommendedTotalFundingSat: number
  fundingShortfallSat: number
  canStart: boolean
  infeasibilityReason: ExitInfeasibilityReason
  exitJobFound: boolean
  exitStatus: ExitJobStatus
  sweepTxid: string
  lastError: string
  err: string
}

export type WalletSweepInput = {
  outpoint: string
  amountSat: number
}

export type SweepPreview = {
  inputs: WalletSweepInput[]
  totalInputSat: number
  estimatedFeeSat: number
  netAmountSat: number
  feeRateSatPerVByte: number
  canBroadcast: boolean
  txid: string
  failureReason: string
}

export type ExitSummaryData = {
  totalExits: number
  totalVTXOAmountSat: number
  totalEstFeeSat: number
  totalEstNetRecoveredSat: number
}

export type WalletData = {
  balances: Balances | null
  depositAddress: string | null
  mnemonic: string[] | null
  syncStatus: string | null
}

// A superset of every command's response: responses are dispatched by id, not
// typed per command.
export interface CommandResponse {
  id?: number
  command?: string
  status?: string
  error?: string
  address?: string
  satoshis?: string
  confirmedSat?: string
  synced?: boolean
  walletState?: string
  identityPubKey?: string
  imported?: boolean
  words?: string[]
  hash?: string
  fee?: string
  invoice?: string
  feeSat?: string
  success?: boolean
  message?: string
  entries?: ActivityEntry[]
  index?: number
  path?: string
  seedPhrase?: string
  initialized?: boolean
  vtxos?: WalletVTXO[]
  exits?: ExitSummaryEntry[]
  totalExits?: number
  totalVTXOAmountSat?: number
  totalEstFeeSat?: number
  totalEstNetRecoveredSat?: number
  plans?: ExitPlanEntry[]
  feeRateSatPerVByte?: number
  canStart?: boolean
  totalFundingShortfallSat?: number
  totalRecommendedFundingSat?: number
  cooperative?: boolean
  queuedOutpoints?: string[]
  created?: boolean
  actorID?: string
  cooperativeError?: string
  found?: boolean
  sweepTxid?: string
  lastError?: string
  phaseDetail?: string
  bestCaseBlocksRemaining?: number
  currentHeight?: number
  inputs?: WalletSweepInput[]
  totalInputSat?: number
  estimatedFeeSat?: number
  netAmountSat?: number
  canBroadcast?: boolean
  txid?: string
  failureReason?: string
}
