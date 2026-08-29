/**
 * The proxy session — the reconnect behaviour every agent depends on.
 *
 * WHAT THIS COVERS THAT NOTHING DID. `src/mcp-proxy.ts` measured 0% coverage
 * while its two helpers (`mcpProxyFraming`, `mcpProxyRetry`) were fully tested —
 * a shape that reads like a well-covered module and is not. The helpers answer
 * "is this line an initialize?" and "is this error retryable?"; nothing asked
 * whether the proxy REPLAYS the handshake correctly, buffers in order, or drops
 * exactly one duplicate response.
 *
 * That gap mattered because this is the code that hides an extension-host reload
 * from a running agent. When it is wrong the agent does not error — it hangs, or
 * silently loses a request, or sees two `initialize` responses and gets confused
 * about which session it is in.
 */

import { createProxySession, type ProxySession } from '@/features/ai/server/mcpProxySession';

const INIT = (id: string | number) =>
    `${JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: {} })}\n`;
const INITIALIZED = `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`;
const INIT_RESPONSE = (id: string | number) =>
    `${JSON.stringify({ jsonrpc: '2.0', id, result: { capabilities: {} } })}\n`;
const CALL = (id: number) =>
    `${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: {} })}\n`;

interface Harness {
    session: ProxySession;
    toServer: string[];
    toClient: string[];
    /** Forget what has been written so far — see `established`. */
    clear(): void;
}

function makeSession(): Harness {
    const toServer: string[] = [];
    const toClient: string[] = [];
    const session = createProxySession({
        toServer: (l) => toServer.push(l),
        toClient: (l) => toClient.push(l),
    });
    return {
        session,
        toServer,
        toClient,
        clear() {
            toServer.length = 0;
            toClient.length = 0;
        },
    };
}

/**
 * A session that is up, has completed its handshake, and has forgotten the
 * traffic that got it there.
 *
 * `onConnected` writes its preamble through the same `toServer` sink as
 * everything else — one output mechanism, deliberately — so without this every
 * assertion about a RECONNECT would have to restate the first connection too.
 * Tests about the connect sequence itself do not clear.
 */
function established(cwd = '/p'): Harness {
    const h = makeSession();
    h.session.onConnected(false, cwd);
    h.session.fromClient(INIT(7));
    h.session.fromClient(INITIALIZED);
    h.clear();
    return h;
}

describe('while connected, the session is a passthrough', () => {
    it('forwards client lines to the server', () => {
        const { session, toServer } = established();

        session.fromClient(CALL(1));

        expect(toServer).toEqual([CALL(1)]);
    });

    it('forwards server lines to the client', () => {
        const { session, toClient } = established();

        session.fromServer(CALL(1));

        expect(toClient).toEqual([CALL(1)]);
    });

    it('announces the session directory FIRST on every connection', () => {
        // The server sniffs each connection anew to scope current-project tools
        // (connectionScope.ts). If this is not the first thing written — or is
        // skipped on a reconnect — the reconnected session is scoped to nothing.
        const h = makeSession();

        h.session.onConnected(false, '/projects/demo');
        expect(h.toServer[0]).toBe('#cwd:/projects/demo\n');

        h.clear();
        h.session.onDisconnected();
        h.session.onConnected(true, '/projects/demo');
        expect(h.toServer[0]).toBe('#cwd:/projects/demo\n');
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
        // Order is the point: a tool call that depends on an earlier one still
        // has to arrive after it.
        const { session, toServer } = makeSession();
        session.fromClient(CALL(1));
        session.fromClient(CALL(2));
        session.fromClient(CALL(3));

        session.onConnected(false, '/p');

        expect(toServer).toEqual(['#cwd:/p\n', CALL(1), CALL(2), CALL(3)]);
        expect(session.inspect().pendingCount).toBe(0);
    });

    it('buffers again after a later disconnect', () => {
        const { session, toServer } = established();

        session.onDisconnected();
        session.fromClient(CALL(2));

        expect(toServer).toEqual([]);
        expect(session.inspect().pendingCount).toBe(1);
    });
});

describe('the handshake is captured once and replayed on reconnect', () => {
    it('is not complete until `initialized` arrives', () => {
        const h = makeSession();
        h.session.onConnected(false, '/p');

        h.session.fromClient(INIT(7));
        expect(h.session.inspect().handshakeCaptured).toBe(false);

        h.session.fromClient(INITIALIZED);
        expect(h.session.inspect().handshakeCaptured).toBe(true);
    });

    it('does NOT replay on a first connection', () => {
        // Replaying here would send the handshake twice to a server that never
        // restarted.
        const h = established();

        h.session.onDisconnected();
        h.session.onConnected(false, '/p');

        expect(h.toServer).toEqual(['#cwd:/p\n']);
    });

    it('replays initialize AND initialized on a reconnect', () => {
        const h = established();

        h.session.onDisconnected();
        h.session.onConnected(true, '/p');

        expect(h.toServer).toEqual(['#cwd:/p\n', INIT(7), INITIALIZED]);
    });

    it('replays nothing when the handshake never completed', () => {
        // A client that sent `initialize` and died before `initialized` has no
        // session to restore; replaying half of one is worse than none.
        const h = makeSession();
        h.session.onConnected(false, '/p');
        h.session.fromClient(INIT(7));
        h.clear();

        h.session.onDisconnected();
        h.session.onConnected(true, '/p');

        expect(h.toServer).toEqual(['#cwd:/p\n']);
    });

    it('replays the handshake BEFORE the buffered traffic', () => {
        // A tool call arriving before the session is re-established is rejected
        // by the server, and the client never learns why.
        const h = established();
        h.session.onDisconnected();

        h.session.fromClient(CALL(42));
        h.session.onConnected(true, '/p');

        expect(h.toServer).toEqual(['#cwd:/p\n', INIT(7), INITIALIZED, CALL(42)]);
    });
});

describe('exactly one duplicate init response is swallowed', () => {
    /** An established session that has just reconnected, so a replay is armed. */
    function reconnected(): Harness {
        const h = established();
        h.session.onDisconnected();
        h.session.onConnected(true, '/p');
        h.clear();
        return h;
    }

    it('hides the replayed handshake response from the client', () => {
        const { session, toClient } = reconnected();

        session.fromServer(INIT_RESPONSE(7));

        expect(toClient).toEqual([]);
        expect(session.inspect().swallowing).toBe(false); // armed once, then spent
    });

    it('passes a genuine second one straight through', () => {
        const { session, toClient } = reconnected();

        session.fromServer(INIT_RESPONSE(7));
        session.fromServer(INIT_RESPONSE(7));

        expect(toClient).toEqual([INIT_RESPONSE(7)]);
    });

    it('does not swallow a response bearing a different id', () => {
        // The swallow is armed BY ID precisely so an in-flight tool response
        // that happens to land first is not eaten.
        const { session, toClient } = reconnected();

        session.fromServer(INIT_RESPONSE(99));

        expect(toClient).toEqual([INIT_RESPONSE(99)]);
        expect(session.inspect().swallowing).toBe(true); // still waiting for id 7
    });

    it('swallows nothing when there was no replay', () => {
        const { session, toClient } = established();

        session.fromServer(INIT_RESPONSE(7));

        expect(toClient).toEqual([INIT_RESPONSE(7)]);
    });
});

describe('framing survives chunk boundaries', () => {
    it('holds a partial client line until its newline arrives', () => {
        // TCP does not respect line boundaries, and a half-line forwarded early
        // is a parse error at the server end.
        const { session, toServer } = established();
        const line = CALL(1);

        session.fromClient(line.slice(0, 10));
        expect(toServer).toEqual([]);

        session.fromClient(line.slice(10));
        expect(toServer).toEqual([line]);
    });

    it('captures a handshake split across chunks', () => {
        const h = makeSession();
        h.session.onConnected(false, '/p');
        const init = INIT(7);

        h.session.fromClient(init.slice(0, 12));
        h.session.fromClient(init.slice(12));
        h.session.fromClient(INITIALIZED);
        h.clear();

        h.session.onDisconnected();
        h.session.onConnected(true, '/p');

        expect(h.toServer).toEqual(['#cwd:/p\n', init, INITIALIZED]);
    });

    it('swallows a duplicate response that arrives in pieces', () => {
        const h = established();
        h.session.onDisconnected();
        h.session.onConnected(true, '/p');
        h.clear();

        const response = INIT_RESPONSE(7);
        h.session.fromServer(response.slice(0, 15));
        h.session.fromServer(response.slice(15));

        expect(h.toClient).toEqual([]);
    });
});
