/**
 * Creates the Bare native-addon transport's {@link WavelengthClient}.
 *
 * @param {unknown} [options] - Ignored.
 * @returns {WavelengthClient} The Bare native-addon transport client.
 */
export default function createWavelengthTransport(options?: unknown): WavelengthClient;
export class BareWavelengthClient extends BaseWavelengthClient {
    /** @type {ServerTransport} */
    serverTransport: ServerTransport;
    _opening: {};
    _subscription: addon.Subscription;
    /**
     * @private
     * @param {import('@lightninglabs/wavelength-bare-addon').Subscription} subscription - The addon's stream handle.
     * @returns {Promise<void>}
     */
    private _pumpActivityStream;
}
export type FacadeMethod = import("@lightninglabs/wavelength-core").FacadeMethod;
export type WavelengthClient = import("@lightninglabs/wavelength-core").WavelengthClient;
export type ActivityStreamOptions = import("@lightninglabs/wavelength-core").ActivityStreamOptions;
export type ServerTransport = "rest" | "grpc";
import { BaseWavelengthClient } from '@lightninglabs/wavelength-core';
import addon from '@lightninglabs/wavelength-bare-addon';
