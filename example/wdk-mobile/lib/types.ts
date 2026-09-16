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
  // Indices confirmed to have completed a real switch-account/add-account
  // response before -- reopening one of these is expected to be fast, since
  // its local profile already exists. Absent on WalletMeta persisted before
  // this field existed; treat a missing value as [] wherever it's read.
  provisionedAccounts?: number[]
}

export type Balances = {
  confirmed: bigint
}

// Raw daemon Entry, passed through unmodified by the worklet driver -- see
// generated.d.ts's Entry for the full shape (progress/request sub-objects
// are typed loosely below since the activity row only needs the top-level
// fields; the raw JSON is still shown on-demand behind "Details").
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

// Exit feature types -- see wavelength-core's generated.d.ts for the
// authoritative shapes; field names/casing match the daemon's wdk-wallet-
// wavelength wrapper exactly (getExitPlan/exit/exitStatus/exitSummary/
// sweepWallet), so these mirror that wire format rather than renaming.
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

// The shape every sendCommand() caller destructures -- a superset of every
// command's response, since responses are dispatched by id, not typed per
// command at the transport layer.
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
  // Exit feature
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
