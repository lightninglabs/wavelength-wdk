/**
 * Creates the Bare Android transport's {@link WavelengthClient}.
 *
 * @param {unknown} [options] - Ignored.
 * @returns {WavelengthClient} The Bare Android transport client.
 */
export default function createWavelengthTransport(options?: unknown): WavelengthClient;
export class BareAndroidWavelengthClient extends BaseWavelengthClient {
    /** @type {ServerTransport} */
    serverTransport: ServerTransport;
    /** @private */
    private _ipc;
    /** @private */
    private _decoder;
    /**
     * @private
     * @type {Map<number, { resolve: (value: unknown) => void, reject: (err: Error) => void }>}
     */
    private _pending;
    /** @private */
    private _activityStoppedByClient;
    /**
     * @private
     * @param {unknown} chunk
     */
    private _handleIpcData;
    /**
     * @private
     * @param {string} method
     * @param {unknown} [params]
     * @returns {Promise<unknown>}
     */
    private _sendRequest;
    /**
     * @private
     * @param {ActivityEventMessage} msg
     */
    private _handleActivityEvent;
}
export type FacadeMethod = import("@lightninglabs/wavelength-core").FacadeMethod;
export type WavelengthClient = import("@lightninglabs/wavelength-core").WavelengthClient;
export type ActivityStreamOptions = import("@lightninglabs/wavelength-core").ActivityStreamOptions;
export type ActivityEventMessage = {
    type: "activityEvent";
    kind: "entry" | "end" | "error";
    payload: string;
};
export type ResponseMessage = {
    type?: undefined;
    id: number;
    ok: boolean;
    result?: unknown;
    error?: string;
};
export type ServerTransport = "rest" | "grpc";
import { BaseWavelengthClient } from '@lightninglabs/wavelength-core';
