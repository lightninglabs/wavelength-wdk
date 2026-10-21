'use strict'

import b4a from 'b4a'

import { encodeMessage, encodeRequest, encodeOkResponse, encodeErrorResponse, LineDecoder } from '../src/transports/android/ipc-framing.js'

describe('ipc-framing', () => {
  describe('encodeMessage/encodeRequest/encodeOkResponse/encodeErrorResponse', () => {
    it('encodes a plain value as one newline-terminated JSON line, as bytes', () => {
      const encoded = encodeMessage({ foo: 'bar' })
      expect(encoded).toBeInstanceOf(Uint8Array)
      expect(b4a.toString(encoded)).toBe('{"foo":"bar"}\n')
    })

    it('encodes a request', () => {
      expect(b4a.toString(encodeRequest(1, 'getInfo', {}))).toBe('{"id":1,"method":"getInfo","params":{}}\n')
    })

    it('encodes a success response', () => {
      expect(b4a.toString(encodeOkResponse(1, { walletState: 'ready' }))).toBe('{"id":1,"ok":true,"result":{"walletState":"ready"}}\n')
    })

    it('encodes a failure response', () => {
      expect(b4a.toString(encodeErrorResponse(1, 'boom'))).toBe('{"id":1,"ok":false,"error":"boom"}\n')
    })
  })

  describe('LineDecoder', () => {
    it('decodes a single complete line pushed in one chunk', () => {
      const decoder = new LineDecoder()
      const messages = decoder.push('{"id":1,"method":"getInfo"}\n')
      expect(messages).toEqual([{ id: 1, method: 'getInfo' }])
    })

    it('returns an empty array for a still-partial line', () => {
      const decoder = new LineDecoder()
      const messages = decoder.push('{"id":1,"method":"get')
      expect(messages).toEqual([])
    })

    it('assembles a message split across multiple chunks', () => {
      const decoder = new LineDecoder()
      expect(decoder.push('{"id":1,"met')).toEqual([])
      expect(decoder.push('hod":"getInfo"}')).toEqual([])
      expect(decoder.push('\n')).toEqual([{ id: 1, method: 'getInfo' }])
    })

    it('decodes multiple messages coalesced into a single chunk', () => {
      const decoder = new LineDecoder()
      const messages = decoder.push('{"id":1,"method":"getInfo"}\n{"id":2,"method":"balance"}\n')
      expect(messages).toEqual([
        { id: 1, method: 'getInfo' },
        { id: 2, method: 'balance' }
      ])
    })

    it('handles a chunk containing one complete message plus a trailing partial one', () => {
      const decoder = new LineDecoder()
      const first = decoder.push('{"id":1,"method":"getInfo"}\n{"id":2,"met')
      expect(first).toEqual([{ id: 1, method: 'getInfo' }])

      const second = decoder.push('hod":"balance"}\n')
      expect(second).toEqual([{ id: 2, method: 'balance' }])
    })

    it('accepts raw bytes (b4a-produced buffers), not just strings', () => {
      const decoder = new LineDecoder()
      const bytes = b4a.from('{"id":1,"method":"getInfo"}\n', 'utf8')
      expect(decoder.push(bytes)).toEqual([{ id: 1, method: 'getInfo' }])
    })

    it('ignores empty lines (e.g. a lone trailing newline)', () => {
      const decoder = new LineDecoder()
      expect(decoder.push('\n')).toEqual([])
    })

    it('round-trips encodeRequest/encodeOkResponse/encodeErrorResponse through the decoder', () => {
      const decoder = new LineDecoder()
      const requestMessages = decoder.push(encodeRequest(1, 'getInfo', { foo: 'bar' }))
      expect(requestMessages).toEqual([{ id: 1, method: 'getInfo', params: { foo: 'bar' } }])

      const okMessages = decoder.push(encodeOkResponse(1, { walletState: 'ready' }))
      expect(okMessages).toEqual([{ id: 1, ok: true, result: { walletState: 'ready' } }])

      const errMessages = decoder.push(encodeErrorResponse(2, 'wallet actor not initialized'))
      expect(errMessages).toEqual([{ id: 2, ok: false, error: 'wallet actor not initialized' }])
    })

    it('throws on a completed line that is not valid JSON, rather than silently skipping it', () => {
      const decoder = new LineDecoder()
      expect(() => decoder.push('not json at all\n')).toThrow()
    })

    it('throws if an unterminated line grows past the buffered-char limit, and resets the buffer', () => {
      const decoder = new LineDecoder()
      const oversized = 'x'.repeat(4 * 1024 * 1024 + 1)

      expect(() => decoder.push(oversized)).toThrow(/exceeded/)

      expect(decoder.push('{"id":1,"method":"getInfo"}\n')).toEqual([{ id: 1, method: 'getInfo' }])
    })

    it('maintains independent buffers across separate instances', () => {
      const decoderA = new LineDecoder()
      const decoderB = new LineDecoder()

      decoderA.push('{"id":1,"met')
      const messagesB = decoderB.push('{"id":2,"method":"balance"}\n')

      expect(messagesB).toEqual([{ id: 2, method: 'balance' }])
      expect(decoderA.push('hod":"getInfo"}\n')).toEqual([{ id: 1, method: 'getInfo' }])
    })
  })
})
