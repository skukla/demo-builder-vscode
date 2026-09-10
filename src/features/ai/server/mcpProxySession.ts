/**
 * The proxy's session state machine — everything `mcp-proxy.ts` does that is
 * NOT talking to a socket.
 *
 * WHY IT IS ITS OWN MODULE. `src/mcp-proxy.ts` is a script: it attaches stdin
 * handlers and mutates module-scope state at import time, then calls `main()`.
 * Importing it from a test starts a real proxy, so none of it could be covered —
 * measured at 0% while its extracted helpers (`mcpProxyFraming`,
 * `mcpProxyRetry`) sat at full coverage. The uncovered part was not trivial
 * glue; it is the reconnect logic every agent session depends on when the
 * extension host reloads.
 *
 * So the state machine moves here, dependencies arrive as parameters (ADR-015),
 * and `mcp-proxy.ts` keeps only the wiring: real stdin, a real socket, real
 * timers.
 *
 * WHAT IT HAS TO GET RIGHT, and why each matters:
 *
 *  - **capture the handshake** — `initialize` and `initialized` arrive once, at
 *    the start, and must be replayed verbatim to a restarted server or the
 *    session is dead
 *  - **buffer while disconnected** — anything the client sends during a reload
 *    gap has to arrive after reconnect, in order, or the client sees a dropped
 *    request
 *  - **swallow exactly one init response** — the replay makes the server answer
 *    `initialize` a second time, and a client that receives two is confused. One,
 *    and only the one matching the replayed id.
 */

import { LineBuffer, classifyHandshake, isInitResponse } from './mcpProxyFraming';

/**
 * Where the session sends what it decides to forward.
 *
 * ONE output mechanism, deliberately. The first version of this module had
 * `onConnected` RETURN its lines while everything else wrote through a sink —
 * two ways out of the same object, so a reader had to know which path used
 * which, and the connect path could not be observed the way the steady-state
 * path was. The justification given at the time (the caller controls socket
 * ordering) did not survive inspection: the sink writes to the same socket, in
 * call order.
 */
export interface ProxySessionSinks {
    /** To the server. Called only while connected. */
    toServer(line: string): void;
    /** To the client (the agent's stdout). */
    toClient(line: string): void;
}

export interface ProxySession {
    /** Feed a raw chunk from the client. Framing and routing happen inside. */
    fromClient(chunk: string): void;
    /** Feed a raw chunk from the server. */
    fromServer(chunk: string): void;
    /**
     * The connection came up. Writes the preamble, any replay, and the buffered
     * backlog through `toServer`, in that order.
     *
     * @param isReconnect - a replay is only correct on a RECONNECT; doing it on
     *   the first connection would send the handshake twice.
     */
    onConnected(isReconnect: boolean, cwd: string): void;
    /** The connection dropped; subsequent client lines buffer again. */
    onDisconnected(): void;
    /** Test/diagnostic view. Never used for control flow. */
    inspect(): {
        connected: boolean;
        handshakeCaptured: boolean;
        pendingCount: number;
        swallowing: boolean;
    };
}

export function createProxySession(sinks: ProxySessionSinks): ProxySession {
    let connected = false;

    // The captured client→server handshake, replayed after a server restart.
    let initLine: string | undefined;
    let initId: string | number | null = null;
    let initializedLine: string | undefined;
    let handshakeCaptured = false;

    // Client→server lines held while disconnected (e.g. during a reload gap).
    const pending: string[] = [];
    const clientLines = new LineBuffer();

    // Server→client framing — needed to drop the one replayed init response.
    const serverLines = new LineBuffer();
    let swallowInitId: string | number | null | undefined; // set only during a replay

    return {
        fromClient(chunk) {
            for (const line of clientLines.push(chunk)) {
                if (!handshakeCaptured) {
                    const h = classifyHandshake(line.trim());
                    if (h.kind === 'initialize') {
                        initLine = line;
                        initId = h.id ?? null;
                    } else if (h.kind === 'initialized') {
                        initializedLine = line;
                        handshakeCaptured = true;
                    }
                }
                if (connected) {
                    sinks.toServer(line);
                } else {
                    pending.push(line);
                }
            }
        },

        fromServer(chunk) {
            for (const line of serverLines.push(chunk)) {
                if (swallowInitId !== undefined && isInitResponse(line.trim(), swallowInitId)) {
                    swallowInitId = undefined; // ate the duplicate; resume passthrough
                    continue;
                }
                sinks.toClient(line);
            }
        },

        onConnected(isReconnect, cwd) {
            connected = true;

            // Session-directory preamble — the FIRST bytes on every connection,
            // reconnects included: the fresh server end sniffs each connection
            // anew. MCP lines all start with '{', so '#cwd:' is unambiguous.
            sinks.toServer(`#cwd:${cwd}\n`);

            if (isReconnect && handshakeCaptured && initLine) {
                swallowInitId = initId;
                sinks.toServer(initLine);
                if (initializedLine) sinks.toServer(initializedLine);
            }

            // Everything buffered during the gap, in arrival order.
            while (pending.length) sinks.toServer(pending.shift() as string);
        },

        onDisconnected() {
            connected = false;
        },

        inspect: () => ({
            connected,
            handshakeCaptured,
            pendingCount: pending.length,
            swallowing: swallowInitId !== undefined,
        }),
    };
}
