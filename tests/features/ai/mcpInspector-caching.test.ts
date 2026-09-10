/**
 * mcpInspector tests - caching & the extended env allowlist
 *
 * Split from mcpInspector.test.ts to stay under the max-lines limit; the
 * stderr-capture half split again into `mcpInspector-stderr.test.ts`. The
 * SDK/fs harness lives in `mcpInspector.testUtils.ts` and is imported from
 * there — including the subject itself, which is what makes the hoisting work
 * (the factories lift above the subject import inside testUtils, not here).
 */

import {
    clearMcpCache,
    clientInstances,
    inspectAllServers,
    resetMcpInspectorMocks,
    restoreEnv,
    scriptClientOnce,
    setMcpJson,
    transportInstances,
    PROJECT_PATH,
} from './mcpInspector.testUtils';

beforeEach(() => {
    resetMcpInspectorMocks();
});

/**
 * Spawn one third-party server with `overrides` applied to `process.env`
 * (an `undefined` value deletes the var), and hand back the env the transport
 * was constructed with. Every allowlist spec is that same set-restore dance.
 */
async function spawnWithEnv(
    overrides: Record<string, string | undefined>
): Promise<Record<string, string> | undefined> {
    const originals = Object.keys(overrides).map((k) => [k, process.env[k]] as const);
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    try {
        setMcpJson({ mcpServers: { srv: { command: 'node', args: [] } } });
        await inspectAllServers(PROJECT_PATH);
        return transportInstances[0].env;
    } finally {
        for (const [key, value] of originals) restoreEnv(key, value);
    }
}

describe('inspectAllServers', () => {
    describe('caching', () => {
        it('returns cached result on second call without spawning again', async () => {
            setMcpJson({ mcpServers: { srv: { command: 'node', args: [] } } });

            await inspectAllServers(PROJECT_PATH);
            await inspectAllServers(PROJECT_PATH);

            // Two cached results → only one spawn
            expect(clientInstances).toHaveLength(1);
        });

        it('re-spawns after clearMcpCache() clears all entries', async () => {
            setMcpJson({ mcpServers: { srv: { command: 'node', args: [] } } });

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
            setMcpJson({ mcpServers: { bad: { command: 'node', args: [] } } });

            // Both attempts crash: a cached failure would spawn only once.
            scriptClientOnce({ connect: jest.fn().mockRejectedValue(new Error('crash')) });
            scriptClientOnce({ connect: jest.fn().mockRejectedValue(new Error('crash')) });

            await inspectAllServers(PROJECT_PATH);
            await inspectAllServers(PROJECT_PATH);

            expect(clientInstances).toHaveLength(2);
        });
    });

    describe('extended env allowlist (third-party MCPs)', () => {
        it('forwards PLAYWRIGHT_BROWSERS_PATH when set on process.env', async () => {
            const env = await spawnWithEnv({
                PLAYWRIGHT_BROWSERS_PATH: '/Users/test/Library/Caches/ms-playwright',
            });

            expect(env?.PLAYWRIGHT_BROWSERS_PATH).toBe(
                '/Users/test/Library/Caches/ms-playwright'
            );
        });

        it('forwards NODE_OPTIONS when set on process.env', async () => {
            const env = await spawnWithEnv({ NODE_OPTIONS: '--max-old-space-size=4096' });

            expect(env?.NODE_OPTIONS).toBe('--max-old-space-size=4096');
        });

        it('forwards XDG_CACHE_HOME when set on process.env', async () => {
            const env = await spawnWithEnv({ XDG_CACHE_HOME: '/home/test/.cache' });

            expect(env?.XDG_CACHE_HOME).toBe('/home/test/.cache');
        });

        // The other three entries of EXTRA_ALLOWED_ENV_VARS. Each is here on its
        // own merits (a Playwright MCP behind a mirror needs the download host;
        // XDG_DATA_HOME resolves caches on Linux), and each was forwarded by
        // nothing anyone had tested.
        it('forwards the remaining allowlisted config vars', async () => {
            const env = await spawnWithEnv({
                PLAYWRIGHT_DOWNLOAD_HOST: 'https://mirror.internal',
                PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
                XDG_DATA_HOME: '/home/test/.local/share',
            });

            expect(env?.PLAYWRIGHT_DOWNLOAD_HOST).toBe('https://mirror.internal');
            expect(env?.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).toBe('1');
            expect(env?.XDG_DATA_HOME).toBe('/home/test/.local/share');
        });

        // Absent, not present-and-undefined: an explicit `undefined` value in the
        // child env is not the same as leaving the variable unset, and only the
        // key list can tell the two apart.
        it('omits an allowlisted var entirely when it is undefined on process.env', async () => {
            const env = await spawnWithEnv({ PLAYWRIGHT_BROWSERS_PATH: undefined });

            expect(Object.keys(env ?? {})).not.toContain('PLAYWRIGHT_BROWSERS_PATH');
        });

        it('does NOT forward arbitrary env vars outside the extended allowlist', async () => {
            const env = await spawnWithEnv({ SOME_RANDOM_VAR: 'should not leak' });

            expect(env?.SOME_RANDOM_VAR).toBeUndefined();
        });

        // serverConfig.env wins last, so a server may set a key the allowlist
        // also carries. Passing no env at all must still leave the allowlist intact.
        it('keeps the allowlisted env when the server declares none of its own', async () => {
            const env = await spawnWithEnv({ NODE_OPTIONS: '--trace-warnings' });

            expect(env?.NODE_OPTIONS).toBe('--trace-warnings');
            expect(env?.PATH).toBe('/usr/bin:/bin');
        });
    });
});
