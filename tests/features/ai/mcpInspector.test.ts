/**
 * mcpInspector tests
 *
 * Reads `<project>/.claude/mcp.json`, spawns each declared server via the
 * @modelcontextprotocol/sdk Client + StdioClientTransport, calls tools/list
 * with pagination, returns McpInventoryEntry[].
 *
 * Per-server 15s timeout. Module-level TTL cache (5min ±10%). Cache clear
 * via `clearMcpCache(serverId?)`.
 */

import * as fsPromises from 'fs/promises';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
}));

// SDK mocks — capture constructor calls and let tests script behavior.
const clientInstances: Array<{
    connect: jest.Mock;
    listTools: jest.Mock;
    close: jest.Mock;
}> = [];
const transportInstances: Array<{ command: string; args: string[]; env?: Record<string, string>; cwd?: string; stderr?: string }> = [];

// Per-transport stderr chunk queues, indexed by the order in which transports
// are constructed. Tests pre-populate via queueStderr(index, [...]) before
// invoking inspectAllServers; the mocked transport's stderr.read() drains
// from the corresponding queue, mirroring Node's paused-Readable semantics.
const pendingStderrQueues: Buffer[][] = [];

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: jest.fn().mockImplementation(() => {
        const instance = {
            connect: jest.fn().mockResolvedValue(undefined),
            listTools: jest.fn().mockResolvedValue({ tools: [] }),
            close: jest.fn().mockResolvedValue(undefined),
        };
        clientInstances.push(instance);
        return instance;
    }),
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: jest.fn().mockImplementation((opts: {
        command: string; args: string[]; env?: Record<string, string>; cwd?: string; stderr?: string;
    }) => {
        const idx = transportInstances.length;
        transportInstances.push(opts);
        const stderrPipe = opts.stderr === 'pipe'
            ? {
                on: jest.fn(),
                read: jest.fn(() => {
                    const queue = pendingStderrQueues[idx];
                    return queue ? (queue.shift() ?? null) : null;
                }),
            }
            : undefined;
        return { stderr: stderrPipe };
    }),
    // Mirror the SDK's safe-to-inherit env allowlist. Tests assert this set,
    // not process.env's full contents.
    getDefaultEnvironment: jest.fn(() => ({ PATH: '/usr/bin:/bin', HOME: '/home/test' })),
}));

/** Queue stderr chunks for the transport that will be constructed at `idx`. */
function queueStderr(idx: number, chunks: string[]): void {
    pendingStderrQueues[idx] = chunks.map(s => Buffer.from(s, 'utf-8'));
}

/** Restore a single env var to its original value (undefined → delete). */
function restoreEnv(key: string, original: string | undefined): void {
    if (original === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = original;
    }
}

import { inspectAllServers, clearMcpCache, MCP_INSPECT_TIMEOUT_MS } from '@/features/ai/mcpInspector';

const readFileMock = fsPromises.readFile as jest.Mock;

const PROJECT_PATH = '/projects/demo';
const MCP_JSON_PATH = `${PROJECT_PATH}/.claude/mcp.json`;

function setMcpJson(config: unknown): void {
    readFileMock.mockImplementation(async (filePath: string) => {
        if (filePath === MCP_JSON_PATH) return JSON.stringify(config);
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    clientInstances.length = 0;
    transportInstances.length = 0;
    pendingStderrQueues.length = 0;
    clearMcpCache();
});

describe('inspectAllServers', () => {
    describe('mcp.json file handling', () => {
        it('returns empty array when mcp.json is missing', async () => {
            readFileMock.mockImplementation(async () => {
                const err = new Error('ENOENT') as NodeJS.ErrnoException;
                err.code = 'ENOENT';
                throw err;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result).toEqual([]);
        });

        it('returns empty array when mcp.json is malformed JSON', async () => {
            readFileMock.mockResolvedValue('{ not valid json');

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result).toEqual([]);
        });

        it('returns empty array when mcp.json has no mcpServers key', async () => {
            setMcpJson({ foo: 'bar' });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result).toEqual([]);
        });

        it('returns empty array when mcpServers is empty', async () => {
            setMcpJson({ mcpServers: {} });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result).toEqual([]);
        });
    });

    describe('happy path', () => {
        it('inspects a single server and returns its tool list', async () => {
            setMcpJson({
                mcpServers: {
                    'demo-builder': { command: 'node', args: ['/path/to/mcp.js'] },
                },
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: 'demo-builder',
                status: 'ok',
                tools: [],
            });
        });

        it('falls back to empty description when a tool omits or returns a non-string description', async () => {
            setMcpJson({
                mcpServers: { 'srv': { command: 'node', args: [] } },
            });

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockResolvedValue(undefined),
                    listTools: jest.fn().mockResolvedValue({
                        tools: [
                            { name: 'missing-desc' },                    // no description field
                            { name: 'non-string-desc', description: 42 }, // protocol violation
                        ],
                    }),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0].tools).toEqual([
                { name: 'missing-desc', description: '' },
                { name: 'non-string-desc', description: '' },
            ]);
        });

        it('returns tool name + description per advertised tool', async () => {
            setMcpJson({
                mcpServers: { 'demo-builder': { command: 'node', args: [] } },
            });

            // Configure the next Client to return tools — must run before inspectAllServers
            // so the Client mock implementation captures it.
            // Use a setup-on-construction approach: replace the default `listTools` mock
            // before the call by overriding the Client implementation:
            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockResolvedValue(undefined),
                    listTools: jest.fn().mockResolvedValue({
                        tools: [
                            { name: 'list_projects', description: 'List demo projects' },
                            { name: 'sync_storefront', description: 'Sync git + Helix' },
                        ],
                    }),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0].tools).toEqual([
                { name: 'list_projects', description: 'List demo projects' },
                { name: 'sync_storefront', description: 'Sync git + Helix' },
            ]);
        });

        it('inspects multiple servers in parallel', async () => {
            setMcpJson({
                mcpServers: {
                    'demo-builder': { command: 'node', args: ['/a.js'] },
                    'adobe-app-builder': { command: 'node', args: ['/b.js'] },
                },
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result).toHaveLength(2);
            expect(result.map(r => r.id).sort()).toEqual(['adobe-app-builder', 'demo-builder']);
            expect(clientInstances).toHaveLength(2);
        });
    });

    describe('pagination', () => {
        it('paginates through multiple pages of tools/list', async () => {
            setMcpJson({ mcpServers: { 'srv': { command: 'node', args: [] } } });

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const listTools = jest.fn()
                    .mockResolvedValueOnce({ tools: [{ name: 't1', description: 'one' }], nextCursor: 'page-2' })
                    .mockResolvedValueOnce({ tools: [{ name: 't2', description: 'two' }], nextCursor: 'page-3' })
                    .mockResolvedValueOnce({ tools: [{ name: 't3', description: 'three' }] });
                const instance = {
                    connect: jest.fn().mockResolvedValue(undefined),
                    listTools,
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0].tools).toHaveLength(3);
            expect(result[0].tools?.map(t => t.name)).toEqual(['t1', 't2', 't3']);
            expect(clientInstances[0].listTools).toHaveBeenCalledTimes(3);
        });
    });

    describe('transport configuration', () => {
        it('passes command, args, env, cwd, and stderr=pipe to the transport', async () => {
            setMcpJson({
                mcpServers: {
                    'srv': {
                        command: 'node',
                        args: ['/a.js'],
                        env: { FOO: 'bar' },
                    },
                },
            });

            await inspectAllServers(PROJECT_PATH);

            expect(transportInstances).toHaveLength(1);
            expect(transportInstances[0]).toMatchObject({
                command: 'node',
                args: ['/a.js'],
                cwd: PROJECT_PATH,
                stderr: 'pipe',
            });
            // server-declared env is forwarded
            expect(transportInstances[0].env?.FOO).toBe('bar');
            // SDK allowlist is honored
            expect(transportInstances[0].env?.PATH).toBe('/usr/bin:/bin');
            expect(transportInstances[0].env?.HOME).toBe('/home/test');
        });

        it('does NOT spread the extension host process.env into the child env', async () => {
            // Sentinel that should never appear if the SDK allowlist is honored.
            const ORIGINAL = process.env.SECRET_THAT_MUST_NOT_LEAK;
            process.env.SECRET_THAT_MUST_NOT_LEAK = 'leaked';
            try {
                setMcpJson({
                    mcpServers: { 'srv': { command: 'node', args: [] } },
                });

                await inspectAllServers(PROJECT_PATH);

                expect(transportInstances[0].env?.SECRET_THAT_MUST_NOT_LEAK).toBeUndefined();
            } finally {
                if (ORIGINAL === undefined) delete process.env.SECRET_THAT_MUST_NOT_LEAK;
                else process.env.SECRET_THAT_MUST_NOT_LEAK = ORIGINAL;
            }
        });

        it('allows serverConfig.env to override allowlisted keys', async () => {
            setMcpJson({
                mcpServers: {
                    'srv': { command: 'node', args: [], env: { PATH: '/custom' } },
                },
            });

            await inspectAllServers(PROJECT_PATH);

            expect(transportInstances[0].env?.PATH).toBe('/custom');
        });
    });

    describe('error paths', () => {
        it('reports timeout when connect or listTools exceeds the per-server budget', async () => {
            jest.useFakeTimers();
            setMcpJson({ mcpServers: { 'slow': { command: 'node', args: [] } } });

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockImplementation(() => new Promise(() => { /* never */ })),
                    listTools: jest.fn(),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const promise = inspectAllServers(PROJECT_PATH);
            await jest.advanceTimersByTimeAsync(MCP_INSPECT_TIMEOUT_MS + 100);
            const result = await promise;

            expect(result[0]).toMatchObject({ id: 'slow', status: 'timeout' });
            expect(clientInstances[0].close).toHaveBeenCalled();
            jest.useRealTimers();
        });

        it('reports error when connect throws (server crashes on spawn)', async () => {
            setMcpJson({ mcpServers: { 'bad': { command: 'missing-binary', args: [] } } });

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockRejectedValue(new Error('spawn ENOENT')),
                    listTools: jest.fn(),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0]).toMatchObject({ id: 'bad', status: 'error' });
            expect(result[0].error).toMatch(/spawn ENOENT/);
        });

        it('reports error when listTools fails with method-not-found', async () => {
            setMcpJson({ mcpServers: { 'no-tools': { command: 'node', args: [] } } });

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockResolvedValue(undefined),
                    listTools: jest.fn().mockRejectedValue(new Error('-32601 Method not found')),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0]).toMatchObject({ id: 'no-tools', status: 'error' });
            expect(result[0].error).toMatch(/Method not found/);
        });

        it('always calls client.close() in finally, even on error', async () => {
            setMcpJson({ mcpServers: { 'bad': { command: 'node', args: [] } } });

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockRejectedValue(new Error('boom')),
                    listTools: jest.fn(),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            await inspectAllServers(PROJECT_PATH);

            expect(clientInstances[0].close).toHaveBeenCalled();
        });

        it('isolates server failures (one server failing does not block others)', async () => {
            setMcpJson({
                mcpServers: {
                    'good': { command: 'node', args: [] },
                    'bad': { command: 'node', args: [] },
                },
            });

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client
                .mockImplementationOnce(() => {
                    const instance = {
                        connect: jest.fn().mockResolvedValue(undefined),
                        listTools: jest.fn().mockResolvedValue({ tools: [{ name: 'ok', description: 'fine' }] }),
                        close: jest.fn().mockResolvedValue(undefined),
                    };
                    clientInstances.push(instance);
                    return instance;
                })
                .mockImplementationOnce(() => {
                    const instance = {
                        connect: jest.fn().mockRejectedValue(new Error('crash')),
                        listTools: jest.fn(),
                        close: jest.fn().mockResolvedValue(undefined),
                    };
                    clientInstances.push(instance);
                    return instance;
                });

            const result = await inspectAllServers(PROJECT_PATH);

            const byId = Object.fromEntries(result.map(r => [r.id, r]));
            // Order in mcpServers is deterministic in the mock, but rely on results either way:
            const okEntry = byId['good'] ?? byId['bad'];
            const failEntry = (byId['good']?.status === 'ok') ? byId['bad'] : byId['good'];
            expect(okEntry.status).toBe('ok');
            expect(failEntry.status).toBe('error');
        });
    });

    describe('caching', () => {
        it('returns cached result on second call without spawning again', async () => {
            setMcpJson({ mcpServers: { 'srv': { command: 'node', args: [] } } });

            await inspectAllServers(PROJECT_PATH);
            await inspectAllServers(PROJECT_PATH);

            // Two cached results → only one spawn
            expect(clientInstances).toHaveLength(1);
        });

        it('re-spawns after clearMcpCache() clears all entries', async () => {
            setMcpJson({ mcpServers: { 'srv': { command: 'node', args: [] } } });

            await inspectAllServers(PROJECT_PATH);
            clearMcpCache();
            await inspectAllServers(PROJECT_PATH);

            expect(clientInstances).toHaveLength(2);
        });

        it('re-spawns only the cleared server when clearMcpCache(id) is called', async () => {
            setMcpJson({
                mcpServers: {
                    'srv-a': { command: 'node', args: [] },
                    'srv-b': { command: 'node', args: [] },
                },
            });

            await inspectAllServers(PROJECT_PATH); // 2 spawns
            clearMcpCache('srv-a');
            await inspectAllServers(PROJECT_PATH); // re-spawn only srv-a → 1 new

            expect(clientInstances).toHaveLength(3);
        });

        it('does not cache timeout or error results (always retried next call)', async () => {
            setMcpJson({ mcpServers: { 'bad': { command: 'node', args: [] } } });

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementation(() => {
                const instance = {
                    connect: jest.fn().mockRejectedValue(new Error('crash')),
                    listTools: jest.fn(),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            await inspectAllServers(PROJECT_PATH);
            await inspectAllServers(PROJECT_PATH);

            expect(clientInstances).toHaveLength(2);
        });
    });

    describe('extended env allowlist (third-party MCPs)', () => {
        it('forwards PLAYWRIGHT_BROWSERS_PATH when set on process.env', async () => {
            const ORIGINAL = process.env.PLAYWRIGHT_BROWSERS_PATH;
            process.env.PLAYWRIGHT_BROWSERS_PATH = '/Users/test/Library/Caches/ms-playwright';
            try {
                setMcpJson({ mcpServers: { 'srv': { command: 'node', args: [] } } });

                await inspectAllServers(PROJECT_PATH);

                expect(transportInstances[0].env?.PLAYWRIGHT_BROWSERS_PATH)
                    .toBe('/Users/test/Library/Caches/ms-playwright');
            } finally {
                restoreEnv('PLAYWRIGHT_BROWSERS_PATH', ORIGINAL);
            }
        });

        it('forwards NODE_OPTIONS when set on process.env', async () => {
            const ORIGINAL = process.env.NODE_OPTIONS;
            process.env.NODE_OPTIONS = '--max-old-space-size=4096';
            try {
                setMcpJson({ mcpServers: { 'srv': { command: 'node', args: [] } } });

                await inspectAllServers(PROJECT_PATH);

                expect(transportInstances[0].env?.NODE_OPTIONS).toBe('--max-old-space-size=4096');
            } finally {
                restoreEnv('NODE_OPTIONS', ORIGINAL);
            }
        });

        it('forwards XDG_CACHE_HOME when set on process.env', async () => {
            const ORIGINAL = process.env.XDG_CACHE_HOME;
            process.env.XDG_CACHE_HOME = '/home/test/.cache';
            try {
                setMcpJson({ mcpServers: { 'srv': { command: 'node', args: [] } } });

                await inspectAllServers(PROJECT_PATH);

                expect(transportInstances[0].env?.XDG_CACHE_HOME).toBe('/home/test/.cache');
            } finally {
                restoreEnv('XDG_CACHE_HOME', ORIGINAL);
            }
        });

        it('omits an allowlisted var entirely when it is undefined on process.env', async () => {
            const ORIGINAL = process.env.PLAYWRIGHT_BROWSERS_PATH;
            delete process.env.PLAYWRIGHT_BROWSERS_PATH;
            try {
                setMcpJson({ mcpServers: { 'srv': { command: 'node', args: [] } } });

                await inspectAllServers(PROJECT_PATH);

                expect(transportInstances[0].env?.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined();
            } finally {
                restoreEnv('PLAYWRIGHT_BROWSERS_PATH', ORIGINAL);
            }
        });

        it('does NOT forward arbitrary env vars outside the extended allowlist', async () => {
            const ORIGINAL = process.env.SOME_RANDOM_VAR;
            process.env.SOME_RANDOM_VAR = 'should not leak';
            try {
                setMcpJson({ mcpServers: { 'srv': { command: 'node', args: [] } } });

                await inspectAllServers(PROJECT_PATH);

                expect(transportInstances[0].env?.SOME_RANDOM_VAR).toBeUndefined();
            } finally {
                restoreEnv('SOME_RANDOM_VAR', ORIGINAL);
            }
        });
    });

    describe('stderr diagnostics on failure', () => {
        it('appends captured stderr tail to error message when child wrote stderr before failing', async () => {
            setMcpJson({ mcpServers: { 'crashed': { command: 'node', args: [] } } });
            queueStderr(0, ['Error: cannot find module @playwright/mcp\n']);

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockRejectedValue(new Error('MCP error -32000: Connection closed')),
                    listTools: jest.fn(),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0]).toMatchObject({ id: 'crashed', status: 'error' });
            expect(result[0].error).toMatch(/Connection closed/);
            expect(result[0].error).toMatch(/stderr \(tail\):/);
            expect(result[0].error).toMatch(/cannot find module @playwright\/mcp/);
        });

        it('omits the stderr tail section entirely when child wrote no stderr', async () => {
            setMcpJson({ mcpServers: { 'silent': { command: 'node', args: [] } } });
            // No queueStderr — empty queue means read() returns null immediately.

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockRejectedValue(new Error('Connection closed')),
                    listTools: jest.fn(),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0]).toMatchObject({ id: 'silent', status: 'error' });
            expect(result[0].error).toBe('Connection closed');
            expect(result[0].error).not.toMatch(/stderr/);
        });

        it('truncates stderr to roughly the last 4 KB when child wrote a long error', async () => {
            setMcpJson({ mcpServers: { 'verbose': { command: 'node', args: [] } } });
            // 8 KB of filler followed by a tail marker. After truncation the marker
            // must survive but the bulk of the filler must be gone.
            const filler = 'A'.repeat(8 * 1024);
            queueStderr(0, [`${filler}TAIL_MARKER\n`]);

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockRejectedValue(new Error('Connection closed')),
                    listTools: jest.fn(),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0].error).toMatch(/TAIL_MARKER/);
            const aRunMatch = result[0].error?.match(/A+/);
            const aRunLength = aRunMatch ? aRunMatch[0].length : 0;
            expect(aRunLength).toBeLessThanOrEqual(4096);
        });

        it('appends stderr tail on the timeout path too', async () => {
            jest.useFakeTimers();
            setMcpJson({ mcpServers: { 'hung': { command: 'node', args: [] } } });
            queueStderr(0, ['waiting for browser binary…\n']);

            const ClientModule = jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { Client: jest.Mock };
            ClientModule.Client.mockImplementationOnce(() => {
                const instance = {
                    connect: jest.fn().mockImplementation(() => new Promise(() => { /* never */ })),
                    listTools: jest.fn(),
                    close: jest.fn().mockResolvedValue(undefined),
                };
                clientInstances.push(instance);
                return instance;
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
});
