/**
 * The three `aio` probes inside `checkAdobeCLI` should run concurrently.
 *
 * Measured on darwin 2026-08-10, warm, against a live signed-in CLI: running
 * `aio config get ims.contexts.cli`, `aio console where --json` and
 * `aio console org list --json` one after another took 5.9s / 6.1s; the same
 * three started together took 2.3s / 2.9s. Each aio invocation pays ~1.7s of
 * Node/oclif startup before it does any work, and that cost is what overlaps.
 *
 * Concurrency is safe here for two reasons, both verified rather than assumed:
 *   - The three functions write DISJOINT fields of the report section
 *     (`authConfigured`/token fields · `currentContext` · `canListOrgs` +
 *     `organizationCount`), so no two race on the same slot. An earlier reading
 *     that `checkCurrentContext` also wrote `canListOrgs` was a grep-window
 *     artifact — there is exactly one write site, in `checkOrganizations`.
 *   - `checkTools()` runs `aio --version` before this, and that invocation
 *     performs and awaits the one-time telemetry opt-out write
 *     (`EnvironmentSetup.ensureAdobeCLIConfigured`). By the time these three
 *     start, its `telemetryConfigured` latch is set, so they take the
 *     early-return path whether they run together or apart.
 *
 * The test asserts OVERLAP, not elapsed time: it holds every command unresolved
 * and checks that all three were dispatched. Timing an assertion here would
 * measure the mock.
 */

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        logCommand: jest.fn(),
    })),
}));

const mockExecute = jest.fn();
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: () => ({ execute: (...a: unknown[]) => mockExecute(...a) }),
    },
}));

import { checkAdobeCLI } from '@/commands/diagnosticsChecks';
import type { CommandCheckResult } from '@/commands/diagnosticsReport';

const AUTH_PROBE = 'aio config get ims.contexts.cli';
const CONTEXT_PROBE = 'aio console where --json';
const ORGS_PROBE = 'aio console org list --json';

/** The tool result `checkTools` hands in — aio installed, version already known. */
const AIO_INSTALLED: CommandCheckResult = {
    installed: true,
    output: '@adobe/aio-cli/11.1.2',
    duration: 1742,
};

/** Every command string the executor was asked to run. */
const ranCommands = (): string[] => mockExecute.mock.calls.map((c) => String(c[0]));

/**
 * Let every already-queued microtask run, so anything the code was ready to
 * dispatch has been dispatched. Nothing resolves — the executor stays pending.
 */
const flushMicrotasks = (): Promise<void> => Promise.resolve().then(() => undefined);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('checkAdobeCLI — the aio probes run together', () => {
    it('dispatches all three probes before any of them resolves', async () => {
        // Never resolves: the only way all three commands can be in flight is if
        // the code did not await one before starting the next.
        mockExecute.mockImplementation(() => new Promise(() => undefined));

        void checkAdobeCLI(AIO_INSTALLED);
        await flushMicrotasks();

        expect(ranCommands()).toEqual(
            expect.arrayContaining([AUTH_PROBE, CONTEXT_PROBE, ORGS_PROBE])
        );
    });

    it('still populates every field the probes own', async () => {
        // The complement. Running them concurrently must not drop a result: each
        // probe writes a different slot and all three have to land.
        mockExecute.mockImplementation((command: string) => {
            if (command === AUTH_PROBE) {
                return Promise.resolve({
                    stdout: JSON.stringify({ access_token: 'fake-token-not-a-secret' }),
                    stderr: '',
                    code: 0,
                });
            }
            if (command === CONTEXT_PROBE) {
                return Promise.resolve({
                    stdout: JSON.stringify({ org: { name: 'Acme' } }),
                    stderr: '',
                    code: 0,
                });
            }
            return Promise.resolve({ stdout: JSON.stringify([{ id: '1' }]), stderr: '', code: 0 });
        });

        const adobe = await checkAdobeCLI(AIO_INSTALLED);

        expect(adobe.authConfigured).toBe(true);
        expect(adobe.hasToken).toBe(true);
        expect(adobe.currentContext).toEqual({
            org: 'Acme',
            project: 'Not selected',
            workspace: 'Not selected',
        });
        expect(adobe.canListOrgs).toBe(true);
        expect(adobe.organizationCount).toBe(1);
    });

    it('lets one failing probe report its own failure without sinking the others', async () => {
        // Promise.all rejects on the first rejection, which would abandon the
        // other two results. Each probe swallows its own error via checkCommand,
        // so this pins that the whole section still comes back populated.
        mockExecute.mockImplementation((command: string) => {
            if (command === CONTEXT_PROBE) {
                return Promise.reject(new Error('aio console where exploded'));
            }
            return Promise.resolve({ stdout: '[]', stderr: '', code: 0 });
        });

        const adobe = await checkAdobeCLI(AIO_INSTALLED);

        expect(adobe.currentContext).toBeUndefined();
        expect(adobe.canListOrgs).toBe(true);
    });
});
