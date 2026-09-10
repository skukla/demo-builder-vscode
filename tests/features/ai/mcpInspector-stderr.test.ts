/**
 * mcpInspector tests - draining and decoding a failed child's stderr
 *
 * Split from `mcpInspector-caching.test.ts`. `readBufferedStderr` is the part
 * of the inspector that turns "the server died" into a diagnostic someone can
 * act on, and it makes four decisions nothing else does: when to stop reading,
 * what a non-Buffer chunk means, how much of a chatty child to keep, and where
 * the surviving tail begins.
 *
 * The SDK/fs harness lives in `mcpInspector.testUtils.ts` and is imported from
 * there — including the subject itself, which is what makes the hoisting work.
 */

import {
    inspectAllServers,
    MCP_INSPECT_TIMEOUT_MS,
    queueStderr,
    queueStderrRaw,
    resetMcpInspectorMocks,
    scriptClientOnce,
    setMcpJson,
    stderrTerminators,
    withoutStderrPipe,
    PROJECT_PATH,
} from './mcpInspector.testUtils';

/** The cap `readBufferedStderr` keeps, and the read budget derived from it. */
const TAIL_BYTES = 4 * 1024;

beforeEach(() => {
    resetMcpInspectorMocks();
});

/** Crash one server on connect and return the `error` string it reports. */
async function crashAndReadError(id = 'crashed', message = 'Connection closed'): Promise<string> {
    setMcpJson({ mcpServers: { [id]: { command: 'node', args: [] } } });
    scriptClientOnce({ connect: jest.fn().mockRejectedValue(new Error(message)) });

    const result = await inspectAllServers(PROJECT_PATH);
    return result[0].error ?? '';
}

/** What `crashAndReadError` returns when the child wrote `tail` to stderr. */
function withTail(tail: string, message = 'Connection closed'): string {
    return `${message}\nstderr (tail):\n${tail}`;
}

describe('inspectAllServers', () => {
    describe('stderr diagnostics on failure', () => {
        it('appends captured stderr tail to error message when child wrote stderr before failing', async () => {
            queueStderr(0, ['Error: cannot find module @playwright/mcp\n']);

            const error = await crashAndReadError('crashed', 'MCP error -32000: Connection closed');

            expect(error).toMatch(/Connection closed/);
            expect(error).toMatch(/stderr \(tail\):/);
            expect(error).toMatch(/cannot find module @playwright\/mcp/);
        });

        it('omits the stderr tail section entirely when child wrote no stderr', async () => {
            // No queueStderr — empty queue means read() returns null immediately.
            const error = await crashAndReadError('silent');

            expect(error).toBe('Connection closed');
            expect(error).not.toMatch(/stderr/);
        });

        // The SDK hands back no stderr stream at all when the child died before
        // the pipe was established, even though we asked for `stderr: 'pipe'`.
        // Reading from it anyway would throw out of the failure handler and lose
        // the diagnostic we were building.
        it('reports the bare failure when the transport exposes no stderr stream', async () => {
            withoutStderrPipe();

            const error = await crashAndReadError('unpiped');

            expect(error).toBe('Connection closed');
        });

        it('appends stderr tail on the timeout path too', async () => {
            jest.useFakeTimers();
            setMcpJson({ mcpServers: { hung: { command: 'node', args: [] } } });
            queueStderr(0, ['waiting for browser binary…\n']);

            scriptClientOnce({
                connect: jest.fn().mockImplementation(
                    () =>
                        new Promise(() => {
                            /* never */
                        })
                ),
            });

            const promise = inspectAllServers(PROJECT_PATH);
            await jest.advanceTimersByTimeAsync(MCP_INSPECT_TIMEOUT_MS + 100);
            const result = await promise;

            expect(result[0].status).toBe('timeout');
            expect(result[0].error).toMatch(/stderr \(tail\):/);
            expect(result[0].error).toMatch(/waiting for browser binary/);
            jest.useRealTimers();
        });
    });

    describe('draining the stderr stream', () => {
        it('concatenates consecutive chunks with nothing between them', async () => {
            queueStderr(0, ['cannot find ', 'module x']);

            const error = await crashAndReadError();

            expect(error).toBe(withTail('cannot find module x'));
        });

        it('trims the whitespace a child wraps its output in', async () => {
            queueStderr(0, ['\n   Error: boom  \n\n']);

            const error = await crashAndReadError();

            expect(error).toBe(withTail('Error: boom'));
        });

        // A drained Readable answers `null`, but one that has ended can answer
        // `undefined` — and a drain loop that only checks for `null` never
        // terminates on it.
        it('stops draining when the stream answers undefined instead of null', async () => {
            queueStderrRaw(0, [Buffer.from('boom', 'utf-8')]);
            stderrTerminators[0] = undefined;

            const error = await crashAndReadError();

            expect(error).toBe(withTail('boom'));
        });

        // Six 4 KB chunks against a 16 KB read budget: the drain stops once the
        // budget is passed, so the LAST chunk never reaches the buffer and the
        // 4 KB tail comes from the fifth.
        it('stops reading once the accumulated stderr passes the read budget', async () => {
            const chunks = ['A', 'B', 'C', 'D', 'E', 'F'].map((c) => c.repeat(TAIL_BYTES));
            queueStderr(0, chunks);

            const error = await crashAndReadError();

            expect(error).toBe(withTail('E'.repeat(TAIL_BYTES)));
        });
    });

    describe('truncating to the last 4 KB', () => {
        it('truncates stderr to roughly the last 4 KB when child wrote a long error', async () => {
            // 8 KB of filler followed by a tail marker. After truncation the marker
            // must survive but the bulk of the filler must be gone.
            const filler = 'A'.repeat(8 * 1024);
            queueStderr(0, [`${filler}TAIL_MARKER\n`]);

            const error = await crashAndReadError('verbose');

            expect(error).toMatch(/TAIL_MARKER/);
            const aRunMatch = error.match(/A+/);
            const aRunLength = aRunMatch ? aRunMatch[0].length : 0;
            expect(aRunLength).toBeLessThanOrEqual(TAIL_BYTES);
        });

        // Below the cap nothing is cut. Slicing unconditionally would still
        // shorten anything longer than half the cap, because the start index
        // goes negative and counts back from the END instead.
        it('keeps every byte of a message that fits under the cap', async () => {
            const message = 'C'.repeat(3000);
            queueStderr(0, [message]);

            const error = await crashAndReadError('chatty');

            expect(error).toBe(withTail(message));
        });

        // The cut can land in the middle of whitespace: 10 bytes of overflow puts
        // the tail's first character on the space at index 10.
        it('trims whitespace the truncation cut exposes at the front', async () => {
            queueStderr(0, [`${'A'.repeat(10)} ${'B'.repeat(TAIL_BYTES - 1)}`]);

            const error = await crashAndReadError('overflowing');

            expect(error).toBe(withTail('B'.repeat(TAIL_BYTES - 1)));
        });
    });

    describe('decoding a chunk', () => {
        it('takes a raw string chunk as written', async () => {
            queueStderrRaw(0, ['listen EADDRINUSE']);

            const error = await crashAndReadError();

            expect(error).toBe(withTail('listen EADDRINUSE'));
        });

        // An object-mode stream can emit anything. Whatever is neither a Buffer
        // nor a string carries no diagnostic, and stringifying it would put
        // "[object Object]" in front of the SC instead.
        it('drops a chunk that is neither a Buffer nor a string', async () => {
            queueStderrRaw(0, [{ notAChunk: true }]);

            const error = await crashAndReadError('objectMode');

            expect(error).toBe('Connection closed');
        });
    });
});
