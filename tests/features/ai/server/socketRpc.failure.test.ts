/**
 * The test RPC client FAILS when the peer goes away — it does not hang.
 *
 * This exists because of a flake that was recorded twice as "unreproduced": one test
 * in `inExtensionMcpServer.socketOwnership.test.ts` intermittently died on jest's
 * 10-second limit during a full parallel run, and passed alone every time it was
 * checked.
 *
 * The timeout was read as slowness, and it was not. Running that suite under full CPU
 * saturation (32 spinners on 16 cores) moved the test body from 381ms to 645ms — under
 * 2x, because its waits are wall-clock `setTimeout`s that do not stretch when the CPU
 * is busy. Starvation cannot account for a 26x overrun, so something was HANGING.
 *
 * It was this helper. `SocketRpc` listened for `data` and nothing else, so a peer that
 * accepted the connection and then closed WITHOUT replying left the promise in
 * `pending` unsettled forever. The reload race that suite exists to exercise produces
 * exactly that: a client connects to the outgoing server, writes `initialize`, and the
 * outgoing server is disposed before it answers.
 *
 * WHY THIS IS NOT PAPERING OVER THE FLAKE. The fix does not make a failing thing pass.
 * It changes an unbounded wait into a named error, so that if the reload race really
 * does strand a client, the suite says "socket closed with 1 request in flight"
 * instead of jest saying "exceeded timeout" and naming only the test. A flaky test
 * that reports a mystery teaches people to re-run; one that reports a cause does not.
 *
 * @see tests/features/ai/server/inExtensionMcpServer.testUtils.ts
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { connectAndInit } from './inExtensionMcpServer.testUtils';

describe('SocketRpc fails rather than hanging', () => {
    let socketPath: string;
    let server: net.Server | undefined;

    beforeEach(() => {
        const id = Math.random().toString(16).slice(2, 10);
        socketPath = path.join(os.tmpdir(), `dbmcp-rpcfail-${id}.sock`);
    });

    afterEach(async () => {
        await new Promise<void>((resolve) => {
            if (!server) return resolve();
            server.close(() => resolve());
        });
        server = undefined;
        fs.rmSync(socketPath, { force: true });
    });

    /** A server that accepts a connection and then hangs up without answering. */
    function serveThenClose(): Promise<void> {
        return new Promise((resolve) => {
            server = net.createServer((socket) => {
                socket.on('data', () => socket.destroy());
            });
            server.listen(socketPath, () => resolve());
        });
    }

    it('rejects an in-flight request when the peer closes without replying', async () => {
        await serveThenClose();

        /**
         * Before the fix this call never settled and the test died on jest's own
         * timeout. The assertion is that it REJECTS — and that the message names the
         * socket rather than the test, which is the whole difference between a
         * finding and a mystery.
         */
        await expect(connectAndInit(socketPath)).rejects.toThrow(/SocketRpc: socket (closed|error)/);
    }, 15000);

    it('CONTROL: a server that answers is unaffected', async () => {
        // Without this, the assertion above would also pass against a client that
        // rejected everything, including working connections.
        server = net.createServer((socket) => {
            socket.setEncoding('utf8');
            socket.on('data', (chunk: string) => {
                for (const line of chunk.split('\n').filter((l) => l.trim())) {
                    const msg = JSON.parse(line);
                    if (msg.id == null) continue;
                    socket.write(
                        JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true } }) + '\n'
                    );
                }
            });
        });
        await new Promise<void>((resolve) => server!.listen(socketPath, () => resolve()));

        const { socket, rpc } = await connectAndInit(socketPath);

        // Assert explicitly rather than relying on "it did not throw": a control
        // whose only claim is the absence of an exception passes just as happily
        // when the helper stops doing anything at all.
        const res = await rpc.request(2, 'anything', {});
        expect(res.result).toEqual({ ok: true });
        expect(socket.destroyed).toBe(false);
        socket.end();
    }, 15000);
});
