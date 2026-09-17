/**
 * erpIntegrationHandlers — 'openErpScreen': open the ERP's own screen with the
 * key only the extension holds. The key must reach the browser and nothing else.
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

const mockErpEntry = {
    id: 'demo-erp',
    name: 'ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    screen: { action: 'screen', keyEnvVar: 'ERP_SCREEN_KEY' },
};
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentCatalog: jest.fn(() => [mockErpEntry]),
    getAppBuilderComponentEntry: jest.fn((id: string) => (id === 'demo-erp' ? mockErpEntry : undefined)),
    buildCustomIntegrationEntry: jest.fn(),
    entryFitsProjectAxes: jest.fn().mockReturnValue(true),
}));

const mockOpenInIncognito = jest.fn();
jest.mock('@/core/utils/browserUtils', () => ({
    openInIncognito: (...a: unknown[]) => mockOpenInIncognito(...a),
}));

jest.mock('@/features/dashboard/handlers/dashboardHandlers', () => ({
    handleRequestStatus: jest.fn().mockResolvedValue({ success: true }),
}));

import { setupMocks } from './dashboardHandlers.testUtils';
import { secretKey } from '@/features/app-builder/services/secretKey';
import { handleOpenErpScreen } from '@/features/dashboard/handlers/erpIntegrationHandlers';
import { ErrorCode } from '@/types/errorCodes';

const SCREEN = 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/screen';
const KEY = 'screen-key-for-tests';
const ERP: AppBuilderComponentState = {
    kind: 'system',
    status: 'deployed',
    name: 'Nordwind',
    source: { owner: 'skukla', repo: 'demo-erp' },
    url: SCREEN,
    deployedUrls: {
        'runtime/demo-erp/health': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health',
        'runtime/demo-erp/screen': SCREEN,
    },
};

function contextWith(erp: AppBuilderComponentState | undefined, storeKey = true) {
    const project: Partial<Project> = {
        appBuilderComponents: {
            'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 'skukla', repo: 'x' } },
            ...(erp ? { 'demo-erp': erp } : {}),
        },
    };
    const mocks = setupMocks(project);
    if (storeKey) {
        void mocks.mockContext.context.secrets.store(
            secretKey(mocks.mockProject.path, 'demo-erp', 'ERP_SCREEN_KEY'),
            KEY,
        );
    }
    return mocks.mockContext;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockOpenInIncognito.mockResolvedValue(true);
});

describe('handleOpenErpScreen', () => {
    it('opens the screen with its key in a private window, and answers the address without the key', async () => {
        const context = contextWith(ERP);

        const result = await handleOpenErpScreen(context, { id: 'erp-integration' });

        expect(mockOpenInIncognito).toHaveBeenCalledWith(`${SCREEN}/?key=${KEY}`);
        expect(result).toEqual({ success: true, data: { id: 'erp-integration', erp: 'demo-erp', screenUrl: SCREEN } });
    });

    it('logs nothing that carries the key', async () => {
        const context = contextWith(ERP);

        await handleOpenErpScreen(context, { id: 'erp-integration' });

        const logger = context.logger as unknown as Record<string, jest.Mock>;
        const logged = JSON.stringify(['debug', 'info', 'warn', 'error'].map((level) => logger[level].mock.calls));
        expect(logged).not.toContain(KEY);
    });

    it('refuses an integration with no ERP in the project', async () => {
        const context = contextWith(undefined, false);

        const result = await handleOpenErpScreen(context, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockOpenInIncognito).not.toHaveBeenCalled();
    });

    it('refuses an ERP deployed before it had a screen, and says to redeploy', async () => {
        const context = contextWith({ ...ERP, deployedUrls: { h: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health' } });

        const result = await handleOpenErpScreen(context, { id: 'erp-integration' });

        expect(result).toEqual({
            success: false,
            error: 'Nordwind has no screen deployed. Redeploy it to add one.',
            code: ErrorCode.INVALID_OPERATION,
        });
        expect(mockOpenInIncognito).not.toHaveBeenCalled();
    });

    it('refuses when this machine holds no key, and says to redeploy', async () => {
        const context = contextWith(ERP, false);

        const result = await handleOpenErpScreen(context, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect((result as { error: string }).error).toContain('Redeploy it');
        expect(mockOpenInIncognito).not.toHaveBeenCalled();
    });

    it('requires an id', async () => {
        const context = contextWith(ERP);

        const result = await handleOpenErpScreen(context, {});

        expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
    });
});
