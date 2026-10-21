/**
 * Runs one facade call. A start rejected by a stale process-wide daemon
 * handle is retried once after stop(); any other failure is wrapped in a
 * {@link WavelengthError}.
 *
 * @template [T=unknown]
 * @param {() => Promise<T>} attempt - Makes one facade call attempt.
 * @param {Object} [options]
 * @param {boolean} [options.canRecoverStaleStart] - Whether this call is a
 * start-family method eligible for stale-handle recovery.
 * @param {() => Promise<unknown>} [options.stop] - Stops a stale process-wide
 * daemon handle, used only when `canRecoverStaleStart` is true.
 * @returns {Promise<T>}
 */
export function invokeFacadeWithRetry<T = unknown>(attempt: () => Promise<T>, { canRecoverStaleStart, stop }?: {
    canRecoverStaleStart?: boolean;
    stop?: () => Promise<unknown>;
}): Promise<T>;
/** @typedef {import('@lightninglabs/wavelength-core').FacadeMethod} FacadeMethod */
export const START_METHODS: Set<string>;
export type FacadeMethod = import("@lightninglabs/wavelength-core").FacadeMethod;
