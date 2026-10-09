/**
 * Creates the Bare WASM transport's {@link WavelengthClient}.
 *
 * @param {{ wasmRuntimeDir?: string }} [options]
 * @returns {WavelengthClient} The Bare WASM transport client.
 */
export default function createWavelengthTransport({ wasmRuntimeDir }?: {
    wasmRuntimeDir?: string;
}): WavelengthClient;
/** @typedef {import('@lightninglabs/wavelength-core').FacadeMethod} FacadeMethod */
/** @typedef {import('@lightninglabs/wavelength-core').WavelengthClient} WavelengthClient */
/** @typedef {import('@lightninglabs/wavelength-core').ActivityStreamOptions} ActivityStreamOptions */
/** @typedef {'rest' | 'grpc'} ServerTransport */
export class BareWasmWavelengthClient extends BaseWavelengthClient {
    /**
     * @param {{ runtimeDir?: string }} [options]
     */
    constructor({ runtimeDir }?: {
        runtimeDir?: string;
    });
    /** @type {ServerTransport} */
    serverTransport: ServerTransport;
    /** @private */
    private _runtimeDir;
    /** @private */
    private _host;
    /** @private */
    private _readyPromise;
    /**
     * @private
     * @type {{ next: () => Promise<unknown>, close: () => unknown } | undefined}
     */
    private _subscription;
    /** @private */
    private _subscriptionStoppedByClient;
    /**
     * @private
     * @param {{ next: () => Promise<unknown>, close: () => unknown }} handle
     * @returns {Promise<void>}
     */
    private _pumpActivityStream;
    dispose(): Promise<number>;
}
export type FacadeMethod = import("@lightninglabs/wavelength-core").FacadeMethod;
export type WavelengthClient = import("@lightninglabs/wavelength-core").WavelengthClient;
export type ActivityStreamOptions = import("@lightninglabs/wavelength-core").ActivityStreamOptions;
export type ServerTransport = "rest" | "grpc";
import { BaseWavelengthClient } from '@lightninglabs/wavelength-core';
