/**
 * Where a deployed app's URLs come from — the app config first, get-url second.
 *
 * Split from `appDeployment.test.ts` (2026-09-16): that file was at the 750-line CI
 * limit, and this is its own question anyway — which SOURCE answers, and what is
 * logged about it.
 */

jest.mock('fs', () => ({
    promises: { access: jest.fn(), readFile: jest.fn(), mkdtemp: jest.fn(), rm: jest.fn() },
}));

jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { LONG: 180000 } }));

jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    extractAioErrorDetail: jest.requireActual('@/features/app-builder/services/runtimeCredentials')
        .extractAioErrorDetail,
    fetchRuntimeCredentials: jest.fn().mockResolvedValue({
        namespace: 'test-namespace',
        auth: 'fake-test-pw-not-a-secret',
    }),
}));

const mockDeclaresIms = jest.fn().mockResolvedValue(false);
const mockListActions = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    declaresIncludeImsCredentials: (...args: unknown[]) => mockDeclaresIms(...args),
    listDeclaredActions: (...args: unknown[]) => mockListActions(...args),
}));

import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import type { DeclaredAction } from '@/features/app-builder/services/appConfigPackages';
import { urlsForDeclaredActions } from '@/features/app-builder/services/deployedUrls';
import { mockFs, createMockCommandManager, createMockLogger } from './appDeployment.testUtils';

function ok(stdout = '') {
    return { code: 0, stdout, stderr: '', duration: 0 };
}

// =============================================================================

/**
 * The CLI has no answer for an EXTENSION-layout app. On the Bodea redeploy
 * (2026-09-16) `aio app get-url` exited 2 with "Cannot read properties of undefined
 * (reading 'packages')", and `aio app deploy` printed only the static SPA URL — so the
 * App Management install was skipped for want of its `/app-management/` URL. The
 * app's own config declares every action, and the namespace is already resolved, so
 * the URLs are derived from those; `get-url` runs only when the config names none.
 */
describe('deployed URLs are derived from the app config, with get-url as the fallback', () => {
    const NS = 'https://test-namespace.adobeioruntime.net/api/v1';
    const INSTALL: DeclaredAction = { packageName: 'app-management', actionName: 'installation', web: true };
    const INFO: DeclaredAction = { packageName: 'starter-kit', actionName: 'info', web: false };
    let cm: ReturnType<typeof createMockCommandManager>;
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        cm = createMockCommandManager();
        logger = createMockLogger();
        mockFs.access.mockRejectedValue(new Error('ENOENT'));
        mockDeclaresIms.mockResolvedValue(false);
        mockListActions.mockResolvedValue([]);
    });

    /** Every command succeeds, except get-url, which answers `getUrlOut` (default: the Bodea failure). */
    function wire(getUrlOut?: string) {
        cm.execute.mockImplementation((command: string) => {
            if (command.includes('get-url')) {
                return Promise.resolve(
                    getUrlOut === undefined
                        ? { code: 2, stdout: '', stderr: "Error: Cannot read properties of undefined (reading 'packages')", duration: 0 }
                        : ok(getUrlOut),
                );
            }
            return Promise.resolve(ok());
        });
    }

    const commands = () => cm.execute.mock.calls.map((args: unknown[]) => args[0] as string);

    it('derives the URLs from the declared actions in the resolved namespace, and never runs get-url', async () => {
        wire();
        mockListActions.mockResolvedValue([INSTALL, INFO]);

        const result = await deployAppComponent('/erp-integration', cm, logger);

        expect(mockListActions).toHaveBeenCalledWith('/erp-integration');
        expect(result.data?.deployedUrls).toStrictEqual({
            'runtime/app-management/installation': `${NS}/web/app-management/installation`,
            'runtime/starter-kit/info': `${NS}/starter-kit/info`,
        });
        expect(commands().some((c) => c.includes('get-url'))).toBe(false);
    });

    it('falls back to get-url when the config declares no actions', async () => {
        wire(JSON.stringify({ runtime: { 'demo-erp/health': `${NS}/web/demo-erp/health` } }));

        const result = await deployAppComponent('/standalone', cm, logger);

        expect(result.data?.deployedUrls).toStrictEqual({ 'runtime/demo-erp/health': `${NS}/web/demo-erp/health` });
    });

    it('is a success with no URLs when neither source has any — never a failed deploy', async () => {
        wire();

        const result = await deployAppComponent('/erp-integration', cm, logger);

        expect(result.success).toBe(true);
        expect(result.data?.deployedUrls).toStrictEqual({});
    });

    it('says which source the URLs came from', async () => {
        wire();
        mockListActions.mockResolvedValue([INSTALL]);

        await deployAppComponent('/erp-integration', cm, logger);

        expect(JSON.stringify(logger.info.mock.calls)).toContain('derived from the app config');
    });
});

describe('urlsForDeclaredActions', () => {
    it('puts web actions under /web/ and keys every entry the way get-url does', () => {
        expect(
            urlsForDeclaredActions('285361-ns-stage', [
                { packageName: 'demo-erp', actionName: 'health', web: true },
                { packageName: 'demo-erp', actionName: 'events-retry', web: false },
            ]),
        ).toStrictEqual({
            'runtime/demo-erp/health': 'https://285361-ns-stage.adobeioruntime.net/api/v1/web/demo-erp/health',
            'runtime/demo-erp/events-retry': 'https://285361-ns-stage.adobeioruntime.net/api/v1/demo-erp/events-retry',
        });
    });

    it('is empty for an app that declares nothing', () => {
        expect(urlsForDeclaredActions('ns', [])).toStrictEqual({});
    });
});
