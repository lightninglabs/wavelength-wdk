/**
 * Fallback for the `"bare"` and `"default"` conditions: an unlisted
 * `Bare.platform` or a non-Bare runtime. `Bare` is read defensively so Node
 * reports the unsupported runtime, not a ReferenceError.
 *
 * @param {unknown} [options] - Ignored.
 * @returns {never} Never returns; always throws.
 */
export default function createWavelengthTransport(options?: unknown): never;
