/**
 * @typedef {Object} WasmHostBootstrapOptions
 * @property {string} runtimeDir - Directory containing the runtime assets:
 * `wavewalletdk.wasm`, `wasm_exec.js`, `sqlite-bridge.js`, `sqlite-worker.js`.
 */
/**
 * @typedef {Object} WasmHost
 * @property {(method: string, params?: unknown) => Promise<unknown>} call
 */
/**
 * Prepares Bare to host the Wavewalletdk WASM module, starts it, and waits
 * for its facade entrypoint.
 *
 * @param {WasmHostBootstrapOptions} options
 * @returns {Promise<WasmHost>}
 */
export default function bootstrapWasmHost({ runtimeDir }: WasmHostBootstrapOptions): Promise<WasmHost>;
export type WasmHostBootstrapOptions = {
    /**
     * - Directory containing the runtime assets:
     * `wavewalletdk.wasm`, `wasm_exec.js`, `sqlite-bridge.js`, `sqlite-worker.js`.
     */
    runtimeDir: string;
};
export type WasmHost = {
    call: (method: string, params?: unknown) => Promise<unknown>;
};
