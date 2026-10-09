/**
 * @typedef {Object} WasmWorkerHost
 * @property {(method: string, params?: unknown) => Promise<unknown>} call
 * @property {() => Promise<number>} terminate
 */
/**
 * Starts one Wavewalletdk WASM runtime in its own Bare worker isolate.
 *
 * @param {{runtimeDir: string}} options
 * @returns {Promise<WasmWorkerHost>}
 */
export default function createWasmWorkerHost({ runtimeDir }: {
    runtimeDir: string;
}): Promise<WasmWorkerHost>;
export type WasmWorkerHost = {
    call: (method: string, params?: unknown) => Promise<unknown>;
    terminate: () => Promise<number>;
};
