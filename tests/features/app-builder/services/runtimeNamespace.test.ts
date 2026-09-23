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
    deleteRuntimePackage,
    listRuntimePackages,
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
            'the answer was not a list of packages'
        );
    });
});

describe('deleteRuntimePackage', () => {
    it('deletes the package recursively, with the key', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult());

        await deleteRuntimePackage(deps, 'demo-erp', ENV);

        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime package delete demo-erp --recursive',
            expect.objectContaining({ env: ENV })
        );
    });

    it('throws when the CLI refuses, naming the exit code when it gave no reason', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue({
            stdout: '',
            stderr: '',
            code: 2,
            duration: 0,
        });

        await expect(deleteRuntimePackage(deps, 'demo-erp', ENV)).rejects.toThrow(
            'aio runtime package delete demo-erp --recursive: exited with code 2'
        );
    });
});
