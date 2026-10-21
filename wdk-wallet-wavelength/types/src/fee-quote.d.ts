/** @typedef {import('@lightninglabs/wavelength-core').PrepareSendResult} PrepareSendResult */
/**
 * Returns the quoted fee, throwing if unknown: `feeKnown: false` comes with
 * `expectedFeeSat: 0`, which would read as a free send.
 *
 * @param {PrepareSendResult} prepared - The prepareSend quote.
 * @param {string} operation - The calling method, named in the error message.
 * @returns {bigint} The quoted fee, in satoshis.
 * @throws {Error} If the daemon could not determine the fee up front.
 */
export function assertQuotedFee(prepared: PrepareSendResult, operation: string): bigint;
export type PrepareSendResult = import("@lightninglabs/wavelength-core").PrepareSendResult;
