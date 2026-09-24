/**
 * runtimeNamespace — Runtime commands that carry the namespace key, and a list
 * that never answers "empty" for "could not look".
 *
 * On 2026-09-21 `aio app undeploy` and `aio runtime package list` both ran
 * without the key; both failed with "An AUTH key must be specified", and the
 * list's empty output was read as a clean namespace while fifteen packages
 * kept running. These pin the two halves of that: the key rides every command,
 * and a failed or unreadable list throws.
 *
 * The credential download is mocked; the command runner is a fake whose calls
 * are asserted, since HOW `aio` is invoked is the thing under test.
 */

const mockFetchRuntimeCredentials = jest.fn();
jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    ...jest.requireActual('@/features/app-builder/services/runtimeCredentials'),
    fetchRuntimeCredentials: (...args: unknown[]) => mockFetchRuntimeCredentials(...args),
}));

import {
    deleteRuntimeEntity,
    listRuntimeActivations,
    listRuntimeNames,
    listRuntimePackages,
    readRuntimeActivation,
    runInNamespace,
    runtimeNamespaceEnv,
} from '@/features/app-builder/services/runtimeNamespace';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createFailureResult, createSuccessResult } from '../../../helpers/commandResultFake';
import { createMockLogger } from '../../../helpers/loggerFake';

const ENV = { AIO_RUNTIME_NAMESPACE: 'ns-stage', AIO_RUNTIME_AUTH: 'fake-test-auth-not-a-secret' };

function makeDeps() {
    return { commandManager: createMockCommandExecutor(), logger: createMockLogger() };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRuntimeCredentials.mockResolvedValue({
        namespace: ENV.AIO_RUNTIME_NAMESPACE,
        auth: ENV.AIO_RUNTIME_AUTH,
    });
});

describe('runtimeNamespaceEnv', () => {
    it("answers the targeted workspace's namespace and key as aio's two variables", async () => {
        const deps = makeDeps();

        await expect(runtimeNamespaceEnv(deps)).resolves.toEqual(ENV);
        expect(mockFetchRuntimeCredentials).toHaveBeenCalledWith(
            deps.commandManager,
            deps.logger,
            'auto'
        );
    });

    it('throws when the credentials cannot be fetched', async () => {
        mockFetchRuntimeCredentials.mockRejectedValue(new Error('Runtime credential fetch failed'));

        await expect(runtimeNamespaceEnv(makeDeps())).rejects.toThrow(
            'Runtime credential fetch failed'
        );
    });
});

describe('runInNamespace', () => {
    it('hands the command the namespace env, and a cwd and streaming only when asked', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult());

        await runInNamespace(deps, 'aio app undeploy', ENV, { cwd: '/app', streaming: true });
        await runInNamespace(deps, 'aio runtime package list --json', ENV);

        expect(deps.commandManager.execute.mock.calls).toEqual([
            [
                'aio app undeploy',
                {
                    cwd: '/app',
                    streaming: true,
                    useNodeVersion: 'auto',
                    enhancePath: true,
                    shell: true,
                    timeout: TIMEOUTS.LONG,
                    env: ENV,
                },
            ],
            [
                'aio runtime package list --json',
                {
                    useNodeVersion: 'auto',
                    enhancePath: true,
                    shell: true,
                    timeout: TIMEOUTS.LONG,
                    env: ENV,
                },
            ],
        ]);
    });
});

describe('listRuntimePackages', () => {
    it('answers the package names, dropping entries with no name', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(
            createSuccessResult(
                JSON.stringify([{ name: 'erp' }, {}, { name: '' }, { name: 'demo-erp' }])
            )
        );

        await expect(listRuntimePackages(deps, ENV)).resolves.toEqual(['erp', 'demo-erp']);
    });

    it('answers an empty namespace as an empty list', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult('[]\n'));

        await expect(listRuntimePackages(deps, ENV)).resolves.toStrictEqual([]);
    });

    it('fetches the key itself when none is handed in', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult('[]'));

        await listRuntimePackages(deps);

        expect(mockFetchRuntimeCredentials).toHaveBeenCalledTimes(1);
        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime package list --json',
            expect.objectContaining({ env: ENV })
        );
    });

    // The 2026-09-21 case, exactly: the CLI refused and printed nothing to stdout.
    it("throws on a refusal, in the CLI's own words — never an empty list", async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(
            createFailureResult(
                ' ›   Error: failed to list the packages: An AUTH key must be specified'
            )
        );

        await expect(listRuntimePackages(deps, ENV)).rejects.toThrow(
            'aio runtime package list --json: Error: failed to list the packages: An AUTH key must be specified'
        );
    });

    it('throws when the answer is not a list', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult(''));

        await expect(listRuntimePackages(deps, ENV)).rejects.toThrow(
            'the answer was not a list'
        );
    });
});

describe('listRuntimeNames', () => {
    it('lists rules and triggers with their own command, and the same key', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(
            createSuccessResult(JSON.stringify([{ name: 'erp-refresh-on-timer' }]))
        );

        await expect(listRuntimeNames(deps, 'rule', ENV)).resolves.toEqual(['erp-refresh-on-timer']);
        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime rule list --json',
            expect.objectContaining({ env: ENV })
        );
    });
});

describe('deleteRuntimeEntity', () => {
    it('deletes the package recursively, with the key', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult());

        await deleteRuntimeEntity(deps, 'package', 'demo-erp', ENV);

        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime package delete demo-erp --recursive',
            expect.objectContaining({ env: ENV })
        );
    });

    // A rule or trigger is not a container: `--recursive` belongs to packages only.
    it('deletes a rule or a trigger by name, without --recursive', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult());

        await deleteRuntimeEntity(deps, 'rule', 'erp-refresh-on-timer', ENV);
        await deleteRuntimeEntity(deps, 'trigger', 'erp-refresh-timer', ENV);

        expect(deps.commandManager.execute.mock.calls.map((call) => call[0])).toEqual([
            'aio runtime rule delete erp-refresh-on-timer',
            'aio runtime trigger delete erp-refresh-timer',
        ]);
    });

    it('throws when the CLI refuses, naming the exit code when it gave no reason', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue({
            stdout: '',
            stderr: '',
            code: 2,
            duration: 0,
        });

        await expect(deleteRuntimeEntity(deps, 'package', 'demo-erp', ENV)).rejects.toThrow(
            'aio runtime package delete demo-erp --recursive: exited with code 2'
        );
    });
});

describe('listRuntimeActivations', () => {
    // One row exactly as `aio runtime activation list --json` printed it live on 2026-09-24.
    const RAW = [
        {
            activationId: '583ceebe8d6249edbceebe8d62f9edd7',
            annotations: [
                { key: 'path', value: '285361-ns-acmeerp/demo-erp/events-retry' },
                { key: 'waitTime', value: 9 },
                { key: 'kind', value: 'nodejs:22' },
                { key: 'timeout', value: false },
            ],
            duration: 102,
            end: 1790287255084,
            name: 'events-retry',
            namespace: '285361-ns-acmeerp',
            publish: false,
            start: 1790287254982,
            statusCode: 0,
            version: '0.0.2',
        },
    ];

    it('runs the list with the key, caps the limit at 50, filters by action, and shapes each row', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult(JSON.stringify(RAW)));

        const rows = await listRuntimeActivations(deps, ENV, { limit: 500, action: 'demo-erp/events-retry' });

        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime activation list "demo-erp/events-retry" --json --limit 50',
            expect.objectContaining({ env: ENV, shell: true }),
        );
        expect(rows).toEqual([
            {
                activationId: '583ceebe8d6249edbceebe8d62f9edd7',
                action: 'demo-erp/events-retry',
                startedAt: new Date(1790287254982).toISOString(),
                durationMs: 102,
                statusCode: 0,
                kind: 'nodejs:22',
            },
        ]);
    });

    it('throws when the list fails or is not a list — never an empty answer', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createFailureResult(' ›   Error: An AUTH key must be specified'));
        await expect(listRuntimeActivations(deps, ENV)).rejects.toThrow(/AUTH key/);
        deps.commandManager.execute.mockResolvedValue(createSuccessResult('{"not":"a list"}'));
        await expect(listRuntimeActivations(deps, ENV)).rejects.toThrow(/not a list/);
    });
});

describe('readRuntimeActivation', () => {
    it('reads the logs without the CLI banner and the result as JSON, by id, with the key', async () => {
        const deps = makeDeps();
        deps.commandManager.execute
            .mockResolvedValueOnce(createSuccessResult('=== activation logs 583ceebe8d6249edbceebe8d62f9edd7\n2026-09-24T21:43:03.598Z stdout: error: partner refresh failed\n'))
            .mockResolvedValueOnce(createSuccessResult('{"result":{"body":{"delivered":0}}}'));

        const read = await readRuntimeActivation(deps, ENV, '583ceebe8d6249edbceebe8d62f9edd7');

        expect(deps.commandManager.execute.mock.calls.map((c) => c[0])).toEqual([
            'aio runtime activation logs 583ceebe8d6249edbceebe8d62f9edd7',
            'aio runtime activation result 583ceebe8d6249edbceebe8d62f9edd7',
        ]);
        expect(read).toEqual({
            activationId: '583ceebe8d6249edbceebe8d62f9edd7',
            logs: ['2026-09-24T21:43:03.598Z stdout: error: partner refresh failed'],
            result: { result: { body: { delivered: 0 } } },
        });
    });

    it('refuses an id that is not 32 hex characters before running anything', async () => {
        const deps = makeDeps();
        await expect(readRuntimeActivation(deps, ENV, 'abc; rm -rf /')).rejects.toThrow(/32 hex/);
        expect(deps.commandManager.execute).not.toHaveBeenCalled();
    });
});
