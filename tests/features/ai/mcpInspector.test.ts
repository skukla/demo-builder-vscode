/**
 * mcpInspector tests
 *
 * Reads `<project>/.claude/mcp.json`, spawns each declared server via the
 * @modelcontextprotocol/sdk Client + StdioClientTransport, calls tools/list
 * with pagination, returns McpInventoryEntry[].
 *
 * Per-server 15s timeout. Module-level TTL cache (5min ±10%). Cache clear
 * via `clearMcpCache(serverId?)`.
 *
 * The SDK/fs harness — and the subject import that makes its hoisting work —
 * lives in `mcpInspector.testUtils.ts`, shared with the caching suite.
 */

import {
    ClientMock,
    clientInstances,
    inspectAllServers,
    MCP_INSPECT_TIMEOUT_MS,
    MCP_JSON_PATH,
    probeInExtensionMcpTools,
    readFileMock,
    resetMcpInspectorMocks,
    resolveProxyTarget,
    scriptClientOnce,
    setMcpJson,
    transportInstances,
    PROJECT_PATH,
} from './mcpInspector.testUtils';

const probeMock = probeInExtensionMcpTools as jest.Mock;
const resolveTargetMock = resolveProxyTarget as jest.Mock;

beforeEach(() => {
    resetMcpInspectorMocks();
    // Default: resolution agrees with the pin. Tests that care override it.
    resolveTargetMock.mockImplementation(async (pin?: string) =>
        pin ? { socketPath: pin, via: 'env' } : { guidance: 'none' }
    );
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

        it('reads .claude/mcp.json under the project as utf-8', async () => {
            setMcpJson({ mcpServers: {} });

            await inspectAllServers(PROJECT_PATH);

            expect(readFileMock).toHaveBeenCalledWith(MCP_JSON_PATH, 'utf-8');
        });

        // ENOENT is the ONLY read failure that means "no MCPs configured".
        // Swallowing the rest would report a project with an unreadable
        // mcp.json as one that has no servers at all.
        it('rethrows a read failure that is not ENOENT', async () => {
            readFileMock.mockImplementation(async () => {
                const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
                err.code = 'EACCES';
                throw err;
            });

            await expect(inspectAllServers(PROJECT_PATH)).rejects.toThrow('EACCES');
        });
    });

    // Regression: Leah's first AI-verify showed "mcp demo-builder: timeout —
    // Exceeded 15000ms budget". The inspector spawned the stdio→UDS proxy and
    // ran a full SDK handshake that loops back into the same extension host;
    // under first-run contention (playwright + commerce-extensibility spawning
    // in parallel) that loopback starved past the 15s budget. The in-extension
    // server is the extension's OWN server — inspect it via the direct socket
    // probe (the same ground truth Diagnostics uses), not a spawned proxy.
    describe('in-extension server (direct socket probe)', () => {
        const DB_SOCKET = '/tmp/demo-builder.sock';

        function setDemoBuilderMcpJson(): void {
            setMcpJson({
                mcpServers: {
                    'demo-builder': {
                        command: 'node',
                        args: ['/ext/dist/mcp-proxy.js'],
                        env: { DEMO_BUILDER_MCP_SOCKET: DB_SOCKET },
                    },
                },
            });
        }

        // The pin lives in a file on disk and cannot heal itself. When the socket
        // it names is gone, probing it anyway reports `demo-builder · error` on
        // the AI badge while a live server sits in the discovery sweep. Resolution
        // is delegated to resolveProxyTarget so this path and the proxy's cannot
        // disagree about which socket is current.
        it('probes whatever resolution returns, not the pin, when the pin is stale', async () => {
            setDemoBuilderMcpJson();
            resolveTargetMock.mockResolvedValue({
                socketPath: '/tmp/other-window.sock',
                via: 'discovery',
            });
            probeMock.mockResolvedValue({ ok: true, tools: ['get_projects'] });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(resolveTargetMock).toHaveBeenCalledWith(DB_SOCKET, PROJECT_PATH);
            expect(probeMock).toHaveBeenCalledWith(
                '/tmp/other-window.sock',
                MCP_INSPECT_TIMEOUT_MS
            );
            expect(result[0]).toMatchObject({ id: 'demo-builder', status: 'ok' });
        });

        it('reports the guidance instead of probing when nothing is live', async () => {
            setDemoBuilderMcpJson();
            resolveTargetMock.mockResolvedValue({
                guidance: 'No running Demo Builder window found.',
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(probeMock).not.toHaveBeenCalled();
            expect(result[0]).toMatchObject({ id: 'demo-builder', status: 'error' });
            expect((result[0] as { error?: string }).error).toContain(
                'No running Demo Builder window'
            );
            // An empty list, not a missing one: the inventory UI counts tools.
            expect(result[0].tools).toStrictEqual([]);
        });

        it('reports an empty tool list when the probe succeeds without one', async () => {
            setDemoBuilderMcpJson();
            probeMock.mockResolvedValue({ ok: true });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0].status).toBe('ok');
            expect(result[0].tools).toStrictEqual([]);
        });

        it('falls back to a generic diagnostic when the probe fails without one', async () => {
            setDemoBuilderMcpJson();
            probeMock.mockResolvedValue({ ok: false });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0].status).toBe('error');
            expect(result[0].error).toBe('in-extension MCP probe failed');
        });

        it('probes the socket directly and never spawns the proxy', async () => {
            setDemoBuilderMcpJson();
            probeMock.mockResolvedValue({ ok: true, tools: ['get_projects', 'sign_in'] });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(probeMock).toHaveBeenCalledWith(DB_SOCKET, MCP_INSPECT_TIMEOUT_MS);
            // The proxy child is never spawned for the extension's own server.
            expect(transportInstances).toHaveLength(0);
            expect(result[0]).toMatchObject({
                id: 'demo-builder',
                status: 'ok',
                tools: [
                    { name: 'get_projects', description: '' },
                    { name: 'sign_in', description: '' },
                ],
            });
        });

        it('maps a probe timeout to status "timeout"', async () => {
            setDemoBuilderMcpJson();
            probeMock.mockResolvedValue({ ok: false, error: 'timed out after 15000ms' });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0]).toMatchObject({ id: 'demo-builder', status: 'timeout' });
        });

        it('maps a probe connection failure to status "error"', async () => {
            setDemoBuilderMcpJson();
            probeMock.mockResolvedValue({
                ok: false,
                error: 'connect ENOENT /tmp/demo-builder.sock',
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0].status).toBe('error');
            expect(result[0].error).toContain('ENOENT');
        });

        it('does not cache a failed probe — retries on the next call', async () => {
            // The reported bug was a transient first-run timeout. A failed probe
            // must NOT be cached, so the next verify re-probes and recovers.
            setDemoBuilderMcpJson();
            probeMock
                .mockResolvedValueOnce({ ok: false, error: 'timed out after 15000ms' })
                .mockResolvedValueOnce({ ok: true, tools: ['get_projects'] });

            const first = await inspectAllServers(PROJECT_PATH);
            const second = await inspectAllServers(PROJECT_PATH);

            expect(first[0].status).toBe('timeout');
            expect(second[0].status).toBe('ok');
            expect(probeMock).toHaveBeenCalledTimes(2);
        });

        it('still spawns the proxy for third-party servers (no socket env)', async () => {
            setMcpJson({
                mcpServers: {
                    'demo-builder': {
                        command: 'node',
                        args: ['/ext/dist/mcp-proxy.js'],
                        env: { DEMO_BUILDER_MCP_SOCKET: DB_SOCKET },
                    },
                    playwright: { command: 'npx', args: ['@playwright/mcp'] },
                },
            });
            probeMock.mockResolvedValue({ ok: true, tools: [] });

            await inspectAllServers(PROJECT_PATH);

            // Only the third-party server is spawned via the SDK transport.
            expect(transportInstances).toHaveLength(1);
            expect(transportInstances[0].command).toBe('npx');
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
                mcpServers: { srv: { command: 'node', args: [] } },
            });

            scriptClientOnce({
                listTools: jest.fn().mockResolvedValue({
                    tools: [
                        { name: 'missing-desc' }, // no description field
                        { name: 'non-string-desc', description: 42 }, // protocol violation
                    ],
                }),
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
            scriptClientOnce({
                listTools: jest.fn().mockResolvedValue({
                    tools: [
                        { name: 'list_projects', description: 'List demo projects' },
                        { name: 'sync_storefront', description: 'Sync git + Helix' },
                    ],
                }),
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
            expect(result.map((r) => r.id).sort()).toEqual(['adobe-app-builder', 'demo-builder']);
            expect(clientInstances).toHaveLength(2);
        });
    });

    describe('pagination', () => {
        it('paginates through multiple pages of tools/list', async () => {
            setMcpJson({ mcpServers: { srv: { command: 'node', args: [] } } });

            scriptClientOnce({
                listTools: jest
                    .fn()
                    .mockResolvedValueOnce({
                        tools: [{ name: 't1', description: 'one' }],
                        nextCursor: 'page-2',
                    })
                    .mockResolvedValueOnce({
                        tools: [{ name: 't2', description: 'two' }],
                        nextCursor: 'page-3',
                    })
                    .mockResolvedValueOnce({ tools: [{ name: 't3', description: 'three' }] }),
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0].tools).toHaveLength(3);
            expect(result[0].tools?.map((t) => t.name)).toEqual(['t1', 't2', 't3']);
            expect(clientInstances[0].listTools).toHaveBeenCalledTimes(3);
        });

        // The cursor the previous page returned has to reach the NEXT request, and
        // the first request has to carry no cursor at all — a `tools/list` that
        // always asks for page one paginates forever against a real server.
        it('sends no cursor on the first page and the previous page cursor after it', async () => {
            setMcpJson({ mcpServers: { srv: { command: 'node', args: [] } } });

            scriptClientOnce({
                listTools: jest
                    .fn()
                    .mockResolvedValueOnce({ tools: [], nextCursor: 'page-2' })
                    .mockResolvedValueOnce({ tools: [], nextCursor: 'page-3' })
                    .mockResolvedValueOnce({ tools: [] }),
            });

            await inspectAllServers(PROJECT_PATH);

            const listTools = clientInstances[0].listTools;
            expect(listTools).toHaveBeenNthCalledWith(1, {});
            expect(listTools).toHaveBeenNthCalledWith(2, { cursor: 'page-2' });
            expect(listTools).toHaveBeenNthCalledWith(3, { cursor: 'page-3' });
        });
    });

    describe('transport configuration', () => {
        it('passes command, args, env, cwd, and stderr=pipe to the transport', async () => {
            setMcpJson({
                mcpServers: {
                    srv: {
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
                    mcpServers: { srv: { command: 'node', args: [] } },
                });

                await inspectAllServers(PROJECT_PATH);

                expect(transportInstances[0].env?.SECRET_THAT_MUST_NOT_LEAK).toBeUndefined();
            } finally {
                if (ORIGINAL === undefined) delete process.env.SECRET_THAT_MUST_NOT_LEAK;
                else process.env.SECRET_THAT_MUST_NOT_LEAK = ORIGINAL;
            }
        });

        it('defaults args to an empty array when the server declares none', async () => {
            setMcpJson({ mcpServers: { srv: { command: 'node' } } });

            await inspectAllServers(PROJECT_PATH);

            expect(transportInstances[0].args).toStrictEqual([]);
        });

        // The name/version pair is what the server sees in the initialize
        // handshake; some servers gate behaviour on the client identity.
        it('announces the inspector identity to the server', async () => {
            setMcpJson({ mcpServers: { srv: { command: 'node', args: [] } } });

            await inspectAllServers(PROJECT_PATH);

            expect(ClientMock).toHaveBeenCalledWith({
                name: 'demo-builder-inspector',
                version: '1.0.0',
            });
        });

        it('allows serverConfig.env to override allowlisted keys', async () => {
            setMcpJson({
                mcpServers: {
                    srv: { command: 'node', args: [], env: { PATH: '/custom' } },
                },
            });

            await inspectAllServers(PROJECT_PATH);

            expect(transportInstances[0].env?.PATH).toBe('/custom');
        });
    });

    describe('error paths', () => {
        it('reports timeout when connect or listTools exceeds the per-server budget', async () => {
            jest.useFakeTimers();
            setMcpJson({ mcpServers: { slow: { command: 'node', args: [] } } });

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

            expect(result[0]).toMatchObject({ id: 'slow', status: 'timeout' });
            // The budget itself is the diagnostic — not the underlying
            // TimeoutError's own wording.
            expect(result[0].error).toBe(`Exceeded ${MCP_INSPECT_TIMEOUT_MS}ms budget`);
            expect(clientInstances[0].close).toHaveBeenCalled();
            jest.useRealTimers();
        });

        // A server that answers within the budget must NOT be cut off. Without a
        // real timeoutMs the race is decided by a zero-delay timer instead.
        it('gives a server the full budget before giving up on it', async () => {
            jest.useFakeTimers();
            setMcpJson({ mcpServers: { unhurried: { command: 'node', args: [] } } });

            scriptClientOnce({
                connect: jest
                    .fn()
                    .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5))),
            });

            const promise = inspectAllServers(PROJECT_PATH);
            await jest.advanceTimersByTimeAsync(10);
            const result = await promise;

            expect(result[0]).toMatchObject({ id: 'unhurried', status: 'ok' });
            jest.useRealTimers();
        });

        it('stringifies a rejection that is not an Error', async () => {
            setMcpJson({ mcpServers: { odd: { command: 'node', args: [] } } });

            scriptClientOnce({ connect: jest.fn().mockRejectedValue('spawn refused') });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0]).toMatchObject({ id: 'odd', status: 'error' });
            expect(result[0].error).toBe('spawn refused');
        });

        it('reports error when connect throws (server crashes on spawn)', async () => {
            setMcpJson({ mcpServers: { bad: { command: 'missing-binary', args: [] } } });

            scriptClientOnce({
                connect: jest.fn().mockRejectedValue(new Error('spawn ENOENT')),
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0]).toMatchObject({ id: 'bad', status: 'error' });
            expect(result[0].error).toMatch(/spawn ENOENT/);
        });

        it('reports error when listTools fails with method-not-found', async () => {
            setMcpJson({ mcpServers: { 'no-tools': { command: 'node', args: [] } } });

            scriptClientOnce({
                listTools: jest.fn().mockRejectedValue(new Error('-32601 Method not found')),
            });

            const result = await inspectAllServers(PROJECT_PATH);

            expect(result[0]).toMatchObject({ id: 'no-tools', status: 'error' });
            expect(result[0].error).toMatch(/Method not found/);
        });

        it('always calls client.close() in finally, even on error', async () => {
            setMcpJson({ mcpServers: { bad: { command: 'node', args: [] } } });

            scriptClientOnce({
                connect: jest.fn().mockRejectedValue(new Error('boom')),
            });

            await inspectAllServers(PROJECT_PATH);

            expect(clientInstances[0].close).toHaveBeenCalled();
        });

        it('isolates server failures (one server failing does not block others)', async () => {
            setMcpJson({
                mcpServers: {
                    good: { command: 'node', args: [] },
                    bad: { command: 'node', args: [] },
                },
            });

            scriptClientOnce({
                listTools: jest
                    .fn()
                    .mockResolvedValue({ tools: [{ name: 'ok', description: 'fine' }] }),
            });
            scriptClientOnce({
                connect: jest.fn().mockRejectedValue(new Error('crash')),
            });

            const result = await inspectAllServers(PROJECT_PATH);

            const byId = Object.fromEntries(result.map((r) => [r.id, r]));
            // Order in mcpServers is deterministic in the mock, but rely on results either way:
            const okEntry = byId['good'] ?? byId['bad'];
            const failEntry = byId['good']?.status === 'ok' ? byId['bad'] : byId['good'];
            expect(okEntry.status).toBe('ok');
            expect(failEntry.status).toBe('error');
        });
    });
});
