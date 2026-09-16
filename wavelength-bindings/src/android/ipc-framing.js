'use strict'

import b4a from 'b4a'

/**
 * Encodes any plain JS value as one newline-terminated JSON line, ready to
 * write directly onto an IPC stream.
 *
 * @param {unknown} value
 * @returns {Uint8Array}
 */
export function encodeMessage (value) {
  return b4a.from(JSON.stringify(value) + '\n')
}

/**
 * @param {number} id
 * @param {string} method
 * @param {unknown} [params]
 * @returns {Uint8Array} A newline-terminated request line.
 */
export function encodeRequest (id, method, params) {
  return encodeMessage({ id, method, params })
}

/**
 * @param {number} id
 * @param {unknown} result
 * @returns {Uint8Array} A newline-terminated success-response line.
 */
export function encodeOkResponse (id, result) {
  return encodeMessage({ id, ok: true, result })
}

/**
 * @param {number} id
 * @param {string} error
 * @returns {Uint8Array} A newline-terminated failure-response line.
 */
export function encodeErrorResponse (id, error) {
  return encodeMessage({ id, ok: false, error })
}

const MAX_BUFFERED_CHARS = 4 * 1024 * 1024

/**
 * Buffers raw IPC chunks (bytes or strings) and yields fully-parsed JSON
 * messages as complete lines arrive.
 */
export class LineDecoder {
  constructor () {
    /** @private */
    this._buffer = ''
  }

  /**
   * @param {unknown} chunk
   * @returns {unknown[]} Every fully-parsed JSON message completed by this
   * chunk, in arrival order.
   */
  push (chunk) {
    this._buffer += typeof chunk === 'string' ? chunk : b4a.toString(chunk)

    const lines = this._buffer.split('\n')
    this._buffer = lines.pop() ?? ''

    if (this._buffer.length > MAX_BUFFERED_CHARS) {
      const length = this._buffer.length
      this._buffer = ''
      throw new Error(`LineDecoder: unterminated line exceeded ${MAX_BUFFERED_CHARS} buffered chars (got ${length}) -- dropping buffer`)
    }

    const messages = []
    for (const line of lines) {
      if (!line) continue
      messages.push(JSON.parse(line))
    }
    return messages
  }
}
