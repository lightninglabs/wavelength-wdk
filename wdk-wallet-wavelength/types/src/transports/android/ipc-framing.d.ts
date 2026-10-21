/**
 * Encodes a value as one newline-terminated JSON line.
 *
 * @param {unknown} value
 * @returns {Uint8Array}
 */
export function encodeMessage(value: unknown): Uint8Array;
/**
 * @param {number} id
 * @param {string} method
 * @param {unknown} [params]
 * @returns {Uint8Array} A newline-terminated request line.
 */
export function encodeRequest(id: number, method: string, params?: unknown): Uint8Array;
/**
 * @param {number} id
 * @param {unknown} result
 * @returns {Uint8Array} A newline-terminated success-response line.
 */
export function encodeOkResponse(id: number, result: unknown): Uint8Array;
/**
 * @param {number} id
 * @param {string} error
 * @returns {Uint8Array} A newline-terminated failure-response line.
 */
export function encodeErrorResponse(id: number, error: string): Uint8Array;
/** Buffers IPC chunks and yields a parsed message per complete line. */
export class LineDecoder {
    /** @private */
    private _buffer;
    /**
     * @param {unknown} chunk
     * @returns {unknown[]} Every fully-parsed JSON message completed by this
     * chunk, in arrival order.
     */
    push(chunk: unknown): unknown[];
}
