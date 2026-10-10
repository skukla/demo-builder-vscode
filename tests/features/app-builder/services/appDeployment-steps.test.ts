/**
 * The steps a deploy takes before the deploy command, and what it tells the person
 * watching.
 *
 * The progress callback is the only thing an SC sees for the minute or two a deploy
 * takes, so WHICH steps are announced is a decision: an extension-layout app points
 * itself at the workspace and never goes looking for where it will run, a standalone
 * app does the opposite, and the CLI update is announced only once it was agreed to.
 */

jest.mock('fs', () => ({
    promises: { access: jest.fn(), readFile: jest.fn(), mkdtemp: jest.fn(), rm: jest.fn() },
}));

jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { LONG: 180000, VERY_LONG: 600000 } }));

jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    extractAioErrorDetail: jest.requireActual('@/features/app-builder/services/runtimeCredentials')
        .extractAioErrorDetail,
    aioOutputTail: jest.requireActual('@/features/app-builder/services/runtimeCredentials')
        .aioOutputTail,
    readRuntimeCredentials: jest.fn().mockResolvedValue({
        namespace: 'test-namespace',
        auth: 'fake-test-pw-not-a-secret',
    }),
    fetchRuntimeCredentials: jest.fn().mockResolvedValue({
        namespace: 'test-namespace',
        auth: 'fake-test-pw-not-a-secret',
    }),
}));

const mockListActions = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    declaresIncludeImsCredentials: () => Promise.resolve(false),
    listDeclaredActions: (...args: unknown[]) => mockListActions(...args),
}));

import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import type { DeclaredAction } from '@/features/app-builder/services/appConfigPackages';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { mockFs, createMockCommandManager, createMockLogger } from './appDeployment.testUtils';

const DEPLOYING = OPERATION_STAGES.deployingApp.label;
const POINTING = 'Pointing the app at your workspace';
const FINDING = 'Finding where the app will run';
const STALE_ERROR =
    'action build failed, webpack compilation errors: ' +
    '"CodeGenerationError: Self-reference dependency has unused export name"';
const INSTALL: DeclaredAction = {
    packageName: 'app-management',
    actionName: 'installation',
    web: true,
};

function ok(stdout = '') {
    return { code: 0, stdout, stderr: '', duration: 0 };
}

describe('what a deploy announces while it runs', () => {
    let cm: ReturnType<typeof createMockCommandManager>;
    let logger: ReturnType<typeof createMockLogger>;
    let onProgress: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        cm = createMockCommandManager();
        logger = createMockLogger();
        onProgress = jest.fn();
        mockFs.access.mockRejectedValue(new Error('ENOENT'));
        mockFs.mkdtemp.mockResolvedValue('/tmp/db-use-test');
        mockFs.rm.mockResolvedValue(undefined);
        mockListActions.mockResolvedValue([]);
        cm.execute.mockResolvedValue(ok());
    });

    /** The details announced under the "Deploying the app" stage, in order. */
    const deployDetails = () =>
        onProgress.mock.calls.filter(([label]) => label === DEPLOYING).map(([, detail]) => detail);

    it('tells a standalone app’s watcher it is finding where the app will run, then deploying', async () => {
        await deployAppComponent('/app', cm, logger, { onProgress });

        expect(deployDetails()).toStrictEqual([FINDING, 'Running aio app deploy']);
    });

    it('tells an extension app’s watcher it is pointing at the workspace, and never that it is looking', async () => {
        await deployAppComponent('/app', cm, logger, { onProgress, layout: 'extension' });

        expect(deployDetails()).toStrictEqual([POINTING, 'Running aio app deploy']);
    });

    it('announces the address lookup, with no detail, only when the config names no actions', async () => {
        await deployAppComponent('/app', cm, logger, { onProgress });
        expect(onProgress).toHaveBeenCalledWith(OPERATION_STAGES.resolvingAppUrl.label, '');

        onProgress.mockClear();
        mockListActions.mockResolvedValue([INSTALL]);
        await deployAppComponent('/app', cm, logger, { onProgress });
        expect(onProgress).not.toHaveBeenCalledWith(
            OPERATION_STAGES.resolvingAppUrl.label,
            expect.anything()
        );
    });

    it('reports a deploy whose addresses came from the app config as a success', async () => {
        mockListActions.mockResolvedValue([INSTALL]);

        const result = await deployAppComponent('/app', cm, logger);

        expect(result.success).toBe(true);
        expect(result.data?.url).toBe(
            'https://test-namespace.adobeioruntime.net/api/v1/web/app-management/installation'
        );
    });

    describe('when the Adobe CLI turns out to be out of date', () => {
        beforeEach(() => {
            let deploys = 0;
            cm.execute.mockImplementation((command: string) => {
                if (command.startsWith('aio app deploy') && deploys++ === 0) {
                    return Promise.resolve({
                        code: 1,
                        stdout: '',
                        stderr: STALE_ERROR,
                        duration: 0,
                    });
                }
                return Promise.resolve(ok());
            });
        });

        it('announces the CLI update, naming the command, once the SC agreed to it', async () => {
            const result = await deployAppComponent('/app', cm, logger, {
                onProgress,
                confirmToolchainRefresh: () => Promise.resolve(true),
            });

            expect(result.success).toBe(true);
            expect(onProgress).toHaveBeenCalledWith(
                OPERATION_STAGES.updatingCli.label,
                'npm install -g @adobe/aio-cli'
            );
        });

        it('announces no CLI update when the SC declined', async () => {
            await deployAppComponent('/app', cm, logger, {
                onProgress,
                confirmToolchainRefresh: () => Promise.resolve(false),
            });

            expect(onProgress).not.toHaveBeenCalledWith(
                OPERATION_STAGES.updatingCli.label,
                expect.anything()
            );
        });
    });
});

describe('the install a deploy runs first', () => {
    it('installs the app as an integration — dev dependencies included — under the app’s Node', async () => {
        const cm = createMockCommandManager();
        cm.execute.mockResolvedValue(ok());
        // A package.json is there, and it has no build script: only the integration
        // install runs for that, the mesh install does not.
        mockFs.access.mockResolvedValue(undefined);
        mockListActions.mockResolvedValue([INSTALL]);

        await deployAppComponent('/app', cm, createMockLogger(), { nodeVersion: '22' });

        expect(cm.execute).toHaveBeenCalledWith(
            'npm install --no-fund --ignore-scripts',
            expect.objectContaining({ cwd: '/app', useNodeVersion: '22' }),
        );
    });
});
