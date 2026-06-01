/**
 * Unit tests for the MCP proxy framing/handshake helpers — the pure logic
 * behind the proxy's reload-resilient reconnect + initialize-replay.
 */

import { LineBuffer, classifyHandshake, isInitResponse } from '@/features/ai/server/mcpProxyFraming';

describe('LineBuffer', () => {
    it('emits complete newline-terminated lines, keeping the newline', () => {
        const buf = new LineBuffer();
        expect(buf.push('{"a":1}\n{"b":2}\n')).toEqual(['{"a":1}\n', '{"b":2}\n']);
    });

    it('retains a partial tail until its newline arrives', () => {
        const buf = new LineBuffer();
        expect(buf.push('{"a":')).toEqual([]); // no newline yet
        expect(buf.push('1}\n')).toEqual(['{"a":1}\n']);
    });

    it('handles a line split across several chunks', () => {
        const buf = new LineBuffer();
        expect(buf.push('{"hel')).toEqual([]);
        expect(buf.push('lo":')).toEqual([]);
        expect(buf.push('true}\n')).toEqual(['{"hello":true}\n']);
    });

    it('emits multiple lines and buffers the trailing partial in one push', () => {
        const buf = new LineBuffer();
        expect(buf.push('a\nb\nc')).toEqual(['a\n', 'b\n']);
        expect(buf.push('\n')).toEqual(['c\n']);
    });
});

describe('classifyHandshake', () => {
    it('detects an initialize request and captures its id', () => {
        const line = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'initialize', params: {} });
        expect(classifyHandshake(line)).toEqual({ kind: 'initialize', id: 7 });
    });

    it('captures a string id', () => {
        const line = JSON.stringify({ jsonrpc: '2.0', id: 'init-1', method: 'initialize' });
        expect(classifyHandshake(line)).toEqual({ kind: 'initialize', id: 'init-1' });
    });

    it('detects the initialized notification', () => {
        const line = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        expect(classifyHandshake(line)).toEqual({ kind: 'initialized' });
    });

    it('treats other methods as "other"', () => {
        const line = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        expect(classifyHandshake(line)).toEqual({ kind: 'other' });
    });

    it('treats non-JSON / partial lines as "other" without throwing', () => {
        expect(classifyHandshake('{"id":1,"method":"initi')).toEqual({ kind: 'other' });
        expect(classifyHandshake('')).toEqual({ kind: 'other' });
    });
});

describe('isInitResponse', () => {
    it('matches the result response for the captured init id', () => {
        const line = JSON.stringify({ jsonrpc: '2.0', id: 7, result: { capabilities: {} } });
        expect(isInitResponse(line, 7)).toBe(true);
    });

    it('matches an error response for the captured init id', () => {
        const line = JSON.stringify({ jsonrpc: '2.0', id: 7, error: { code: -1, message: 'x' } });
        expect(isInitResponse(line, 7)).toBe(true);
    });

    it('does not match a different id', () => {
        const line = JSON.stringify({ jsonrpc: '2.0', id: 8, result: {} });
        expect(isInitResponse(line, 7)).toBe(false);
    });

    it('does not match a request/notification (no result/error) with the same id', () => {
        const line = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' });
        expect(isInitResponse(line, 7)).toBe(false);
    });

    it('returns false for non-JSON without throwing', () => {
        expect(isInitResponse('not json', 7)).toBe(false);
    });
});
