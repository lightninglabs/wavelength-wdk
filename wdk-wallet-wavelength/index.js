'use strict'

/** @typedef {import('@lightninglabs/wavelength-core').RuntimeConfig} RuntimeConfig */
/** @typedef {import('@lightninglabs/wavelength-core').CreateWalletResult} CreateWalletResult */
/** @typedef {import('@lightninglabs/wavelength-core').UnlockWalletResult} UnlockWalletResult */
/** @typedef {import('@lightninglabs/wavelength-core').DepositResult} DepositResult */
/** @typedef {import('@lightninglabs/wavelength-core').ReceiveResult} ReceiveResult */
/** @typedef {import('@lightninglabs/wavelength-core').SendResult} SendResult */
/** @typedef {import('@lightninglabs/wavelength-core').PrepareSendResult} PrepareSendResult */
/** @typedef {import('@lightninglabs/wavelength-core').ListResult} ListResult */
/** @typedef {import('@lightninglabs/wavelength-core').Entry} Entry */
/** @typedef {import('@lightninglabs/wavelength-core').Balance} Balance */
/** @typedef {import('@lightninglabs/wavelength-core').ExitRequest} ExitRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ExitResult} ExitResult */
/** @typedef {import('@lightninglabs/wavelength-core').ExitStatusRequest} ExitStatusRequest */
/** @typedef {import('@lightninglabs/wavelength-core').ExitStatusResult} ExitStatusResult */
/** @typedef {import('@lightninglabs/wavelength-core').ExitSummaryResult} ExitSummaryResult */
/** @typedef {import('@lightninglabs/wavelength-core').GetExitPlanRequest} GetExitPlanRequest */
/** @typedef {import('@lightninglabs/wavelength-core').GetExitPlanResult} GetExitPlanResult */
/** @typedef {import('@lightninglabs/wavelength-core').SweepWalletRequest} SweepWalletRequest */
/** @typedef {import('@lightninglabs/wavelength-core').SweepWalletResult} SweepWalletResult */

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */

/** @typedef {import('./src/wallet-manager-wavelength.js').WavelengthWalletConfig} WavelengthWalletConfig */
/** @typedef {import('./src/wallet-account-wavelength.js').WavelengthTransaction} WavelengthTransaction */
/** @typedef {import('./src/wallet-account-wavelength.js').LightningInvoiceOptions} LightningInvoiceOptions */
/** @typedef {import('./src/wallet-account-wavelength.js').PayLightningInvoiceOptions} PayLightningInvoiceOptions */

export { default } from './src/wallet-manager-wavelength.js'

export { default as WalletAccountWavelength } from './src/wallet-account-wavelength.js'

export { default as WalletAccountReadOnlyWavelength } from './src/wallet-account-read-only-wavelength.js'

export {
  WAVELENGTH_ACCOUNT_NAMESPACE,
  WAVELENGTH_ACCOUNT_NETWORK_IDS,
  wavelengthAccountDataDir,
  wavelengthAccountDerivationPath
} from './src/external-seed-account.js'
