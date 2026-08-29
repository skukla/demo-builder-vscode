/**
 * The proxy session — the reconnect behaviour every agent depends on.
 *
 * WHAT THIS COVERS THAT NOTHING DID. `src/mcp-proxy.ts` measured 0% coverage
 * while its two helpers (`mcpProxyFraming`, `mcpProxyRetry`) were fully tested —
 * a shape that reads like a well-covered module and is not. The helpers answer
 * "is this line an initialize?" and "is this error retryable?"; nothing asked
 * whether the proxy REPLAYS the handshake correctly, or buffers in order, or
 * drops exactly one duplicate response.
 *
 * That gap mattered because this is the code that hides an extension-host reload
 * from a running agent. When it is wrong the agent does not error — it hangs, or
 * silently loses a request, or sees two `initialize` responses and gets confused
 * about which session it is in.
 */

import { createProxySession, type ProxySession } from '@/features/ai/server/mcpProxySession';

/** A session whose two sinks are recorded rather than written anywhere. */
function makeSession(): {
    session: ProxySession;
    toServer: string[];
    toClient: string[];
} {
    const toServer: string[] = [];
    const toClient: string[] = [];
    const session = createProxySession({
        toServer: (l) => toServer.push(l),
        toClient: (l) => toClient.push(l),
    });
    return { session, toServer, toClient };
}

const INIT = (id: string | number) =>
    `${JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: {} })}\n`;
const INITIALIZED = `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`;
const INIT_RESPONSE = (id: string | number) =>
    `${JSON.stringify({ jsonrpc: '2.0', id, result: { capabilities: {} } })}\n`;
const CALL = (id: number) =>
    `${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: {} })}\n`;

describe('while connected, the session is a passthrough', () => {
    it('forwards client lines to the server', () => {
        const { session, toServer } = makeSession();
        session.onConnected(false, '/projects/demo');

        session.fromClient(CALL(1));

        expect(toServer).toEqual([CALL(1)]);
    });

    it('forwards server lines to the client', () => {
        const { session, toClient } = makeSession();
        session.onConnected(false, '/projects/demo');

        session.fromServer(INIT_RESPONSE(1));

        expect(toClient).toEqual([INIT_RESPONSE(1)]);
    });

    it('announces the session directory FIRST on every connection', () => {
        // The server sniffs each connection anew to scope current-project tools
        // (connectionScope.ts). If this is not the first thing written — or is
        // skipped on a reconnect — the reconnected session is scoped to nothing.
        const { session } = makeSession();
        expect(session.onConnected(false, '/projects/demo')[0]).toBe('#cwd:/projects/demo\n');
        session.onDisconnected();
        expect(session.onConnected(true, '/projects/demo')[0]).toBe('#cwd:/projects/demo\n');
    });
});

describe('while disconnected, client traffic is held rather than dropped', () => {
    it('buffers instead of writing to a server that is not there', () => {
        const { session, toServer } = makeSession();

        session.fromClient(CALL(1));

        expect(toServer).toEqual([]);
        expect(session.inspect().pendingCount).toBe(1);
    });

    it('replays what it buffered, IN ORDER, when the connection returns', () => {
        // Order is the whole point: these are JSON-RPC requests and the client is
        // matching responses by id, but a tool call that depends on an earlier
        // one still has to arrive after it.
        const { session } = makeSession();
        session.fromClient(CALL(1));
        session.fromClient(CALL(2));
        session.fromClient(CALL(3));

        const out = session.onConnected(false, '/projects/demo');

        expect(out).toEqual(['#cwd:/projects/demo\n', CALL(1), CALL(2), CALL(3)]);
        expect(session.inspect().pendingCount).toBe(0);
    });

    it('buffers again after a later disconnect', () => {
        const { session, toServer } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(CALL(1));
        expect(toServer).toHaveLength(1);

        session.onDisconnected();
        session.fromClient(CALL(2));

        expect(toServer).toHaveLength(1); // not written
        expect(session.inspect().pendingCount).toBe(1);
    });
});

describe('the handshake is captured once and replayed on reconnect', () => {
    it('captures initialize and initialized from the client stream', () => {
        const { session } = makeSession();
        session.onConnected(false, '/p');

        session.fromClient(INIT(7));
        expect(session.inspect().handshakeCaptured).toBe(false); // not until initialized

        session.fromClient(INITIALIZED);
        expect(session.inspect().handshakeCaptured).toBe(true);
    });

    it('does NOT replay on the first connection', () => {
        // Replaying here would send the handshake twice to a server that never
        // restarted.
        const { session } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));
        session.fromClient(INITIALIZED);

        session.onDisconnected();
        const out = session.onConnected(false, '/p');

        expect(out).toEqual(['#cwd:/p\n']);
    });

    it('replays initialize AND initialized on a reconnect', () => {
        const { session } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));
        session.fromClient(INITIALIZED);

        session.onDisconnected();
        const out = session.onConnected(true, '/p');

        expect(out).toEqual(['#cwd:/p\n', INIT(7), INITIALIZED]);
    });

    it('replays nothing when the handshake never completed', () => {
        // A client that sent `initialize` and then died before `initialized`
        // has no session to restore; replaying half of one is worse than none.
        const { session } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));

        session.onDisconnected();
        const out = session.onConnected(true, '/p');

        expect(out).toEqual(['#cwd:/p\n']);
    });

    it('replays the handshake BEFORE the buffered traffic', () => {
        // A tool call arriving before the session is re-established is rejected
        // by the server, and the client never learns why.
        const { session } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));
        session.fromClient(INITIALIZED);
        session.onDisconnected();

        session.fromClient(CALL(42));
        const out = session.onConnected(true, '/p');

        expect(out).toEqual(['#cwd:/p\n', INIT(7), INITIALIZED, CALL(42)]);
    });
});

describe('exactly one duplicate init response is swallowed', () => {
    it('hides the replayed handshake response from the client', () => {
        const { session, toClient } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));
        session.fromClient(INITIALIZED);
        session.onDisconnected();
        session.onConnected(true, '/p');

        session.fromServer(INIT_RESPONSE(7)); // the replay's answer

        expect(toClient).toEqual([]);
        expect(session.inspect().swallowing).toBe(false); // armed once, then spent
    });

    it('passes everything AFTER it straight through', () => {
        const { session, toClient } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));
        session.fromClient(INITIALIZED);
        session.onDisconnected();
        session.onConnected(true, '/p');

        session.fromServer(INIT_RESPONSE(7));
        session.fromServer(INIT_RESPONSE(7)); // a genuine second one is NOT eaten

        expect(toClient).toEqual([INIT_RESPONSE(7)]);
    });

    it('does not swallow a response bearing a different id', () => {
        // The swallow is armed by id precisely so an in-flight tool response
        // that happens to land first is not eaten.
        const { session, toClient } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));
        session.fromClient(INITIALIZED);
        session.onDisconnected();
        session.onConnected(true, '/p');

        session.fromServer(INIT_RESPONSE(99));

        expect(toClient).toEqual([INIT_RESPONSE(99)]);
        expect(session.inspect().swallowing).toBe(true); // still waiting for id 7
    });

    it('swallows nothing when there was no replay', () => {
        const { session, toClient } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));
        session.fromClient(INITIALIZED);

        session.fromServer(INIT_RESPONSE(7));

        expect(toClient).toEqual([INIT_RESPONSE(7)]);
    });
});

describe('framing survives chunk boundaries', () => {
    it('holds a partial client line until its newline arrives', () => {
        // TCP does not respect line boundaries. A half-line forwarded early is a
        // parse error at the server end.
        const { session, toServer } = makeSession();
        session.onConnected(false, '/p');
        const line = CALL(1);

        session.fromClient(line.slice(0, 10));
        expect(toServer).toEqual([]);

        session.fromClient(line.slice(10));
        expect(toServer).toEqual([line]);
    });

    it('captures a handshake split across chunks', () => {
        const { session } = makeSession();
        session.onConnected(false, '/p');
        const init = INIT(7);

        session.fromClient(init.slice(0, 12));
        session.fromClient(init.slice(12));
        session.fromClient(INITIALIZED);

        expect(session.inspect().handshakeCaptured).toBe(true);
        session.onDisconnected();
        expect(session.onConnected(true, '/p')).toEqual(['#cwd:/p\n', init, INITIALIZED]);
    });

    it('swallows a duplicate response that arrives in pieces', () => {
        const { session, toClient } = makeSession();
        session.onConnected(false, '/p');
        session.fromClient(INIT(7));
        session.fromClient(INITIALIZED);
        session.onDisconnected();
        session.onConnected(true, '/p');

        const response = INIT_RESPONSE(7);
        session.fromServer(response.slice(0, 15));
        session.fromServer(response.slice(15));

        expect(toClient).toEqual([]);
    });
});
