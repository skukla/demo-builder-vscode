/**
 * Shared harness for the `mcpInspector` suite family.
 *
 * WHY THIS FILE EXISTS. Both suites carried a byte-identical 60-line preamble —
 * the fs mock, the SDK Client/StdioClientTransport fakes, the transport stderr
 * queues and the helpers over them. `mcpInspector-caching.test.ts` even said why
 * in its docblock: *"Re-declares the shared SDK/fs mock harness (jest.mock
 * factories must live in the test file due to hoisting)."*
 *
 * **That belief is wrong, and it is what produced the duplication.**
 * `babel-plugin-jest-hoist` lifts `jest.mock` above the imports OF THE MODULE IT
 * APPEARS IN. So a testUtils file may own the factories, provided it ALSO owns
 * the subject import — which is why `inspectAllServers` and friends are
 * re-exported from here and the specs never import the subject directly. That is
 * the rule in `.claude/skills/webview-test-authoring/` §3, and 59 files in this
 * repo already work this way.
 *
 * WHAT A SPEC GETS. Everything by name from here: the subject, the recorded
 * instance arrays, `queueStderr`, `setMcpJson`, `restoreEnv`, and
 * `resetMcpInspectorMocks`. A spec calls the reset from its OWN `beforeEach` — a
 * `beforeEach` declared in this file would not apply to a module that imports it.
 *
 * @see .rptc/backlog/2026-08-28-adr-016-enforcement-tooling.md (PL-14)
 * @see tests/sop/test-family-setup.test.ts
 */

import * as fsPromises from 'fs/promises';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
}));

// SDK mocks — capture constructor calls and let tests script behavior.
export const clientInstances: Array<{
    connect: jest.Mock;
    listTools: jest.Mock;
    close: jest.Mock;
}> = [];
export const transportInstances: Array<{
    command: string;
    args: string[];
    env?: Record<string, string>;
    cwd?: string;
    stderr?: string;
}> = [];

/**
 * Per-transport stderr chunk queues, indexed by the order in which transports
 * are constructed. Tests pre-populate via queueStderr(index, [...]) before
 * invoking inspectAllServers; the mocked transport's stderr.read() drains
 * from the corresponding queue, mirroring Node's paused-Readable semantics.
 */
export const pendingStderrQueues: Buffer[][] = [];

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
    StdioClientTransport: jest
        .fn()
        .mockImplementation(
            (opts: {
                command: string;
                args: string[];
                env?: Record<string, string>;
                cwd?: string;
                stderr?: string;
            }) => {
                const idx = transportInstances.length;
                transportInstances.push(opts);
                const stderrPipe =
                    opts.stderr === 'pipe'
                        ? {
                              on: jest.fn(),
                              read: jest.fn(() => {
                                  const queue = pendingStderrQueues[idx];
                                  return queue ? (queue.shift() ?? null) : null;
                              }),
                          }
                        : undefined;
                return { stderr: stderrPipe };
            }
        ),
    // Mirror the SDK's safe-to-inherit env allowlist. Tests assert this set,
    // not process.env's full contents.
    getDefaultEnvironment: jest.fn(() => ({ PATH: '/usr/bin:/bin', HOME: '/home/test' })),
}));

// The in-extension server is probed directly over its socket — not spawned as a
// proxy child. Mock the probe so tests can script its result.
//
// Shared even though only one suite scripts it today: leaving it out of the
// harness is what made the two preambles diverge by two modules, and a suite
// that later needs it would otherwise add a third copy.
jest.mock('@/features/ai/server/mcpSocketDiscovery', () => ({
    resolveProxyTarget: jest.fn(),
}));
jest.mock('@/features/ai/server/mcpToolProbe', () => ({
    probeInExtensionMcpTools: jest.fn(),
}));

// Below the factories on purpose: they hoist above it, so the subject binds to
// the mocked modules. `import/first` is NOT a registered rule in
// eslint.config.mjs — do not add a disable comment for it, that itself errors.
import {
    inspectAllServers,
    clearMcpCache,
    MCP_INSPECT_TIMEOUT_MS,
} from '@/features/ai/mcpInspector';
export { probeInExtensionMcpTools } from '@/features/ai/server/mcpToolProbe';
export { resolveProxyTarget } from '@/features/ai/server/mcpSocketDiscovery';
export { inspectAllServers, clearMcpCache, MCP_INSPECT_TIMEOUT_MS };

export const readFileMock = fsPromises.readFile as jest.Mock;

export const PROJECT_PATH = '/projects/demo';
export const MCP_JSON_PATH = `${PROJECT_PATH}/.claude/mcp.json`;

/** Serve `config` as the project's `.claude/mcp.json`; every other path ENOENTs. */
export function setMcpJson(config: unknown): void {
    readFileMock.mockImplementation(async (filePath: string) => {
        if (filePath === MCP_JSON_PATH) return JSON.stringify(config);
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
    });
}

/** Queue stderr chunks for the transport that will be constructed at `idx`. */
export function queueStderr(idx: number, chunks: string[]): void {
    pendingStderrQueues[idx] = chunks.map((s) => Buffer.from(s, 'utf-8'));
}

/** Restore a single env var to its original value (undefined → delete). */
export function restoreEnv(key: string, original: string | undefined): void {
    if (original === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = original;
    }
}

/**
 * Call from each spec's OWN `beforeEach`. A `beforeEach` declared in this file
 * would not apply to a module that imports it.
 *
 * MEASURED 2026-08-31 by deleting each line and re-running the family, because a
 * shared reset nobody has tested is a shared reset nobody can safely change:
 *
 *   jest.clearAllMocks()             2 tests fail without it
 *   clientInstances.length = 0       7 fail
 *   transportInstances.length = 0    8 fail
 *   clearMcpCache()                  22 fail
 *   pendingStderrQueues.length = 0   nothing fails
 *
 * The last one stays, and NOT because it is load-bearing today — it is not. It
 * stays because the queues are indexed by transport construction order, so
 * resetting `transportInstances` while leaving these would put the two out of
 * step and feed one test's stderr to another's transport. That is a real hazard
 * with no test behind it; the honest statement is that it is unproven, not that
 * it is proven. Anyone deleting it should write the test first.
 */
export function resetMcpInspectorMocks(): void {
    jest.clearAllMocks();
    clientInstances.length = 0;
    transportInstances.length = 0;
    pendingStderrQueues.length = 0;
    clearMcpCache();
}
