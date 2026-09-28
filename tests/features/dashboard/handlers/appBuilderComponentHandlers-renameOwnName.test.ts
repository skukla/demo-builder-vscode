/**
 * Renaming the ERP integration (AB-16o): a pre-built integration NAMED FROM AN INPUT.
 *
 * Other pre-built integrations still refuse a rename (their redeploy writes the
 * catalog name back). This one's name comes from `INTEGRATION_DISPLAY_NAME`, so a
 * rename sets that input as well as the card's name: the next deploy then carries
 * the new name to Commerce and records it again, rather than reverting it. The
 * rename itself deploys nothing; it says how the name reaches Commerce.
 *
 * The catalog entries are the SHIPPED ones (`jest.requireActual`), because the
 * input a rename writes is the catalog's `nameFromEnvVar`.
 */

import {
    handleRenameAppBuilderComponent,
    mockDeployAppBuilderComponent,
    mockGetAppBuilderComponentEntry,
    resetHandlerMocks,
    setupMocks,
} from './appBuilderComponentHandlers.testUtils';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

const shippedCatalog = jest.requireActual<
    typeof import('@/features/components/services/appBuilderComponentCatalogLoader')
>('@/features/components/services/appBuilderComponentCatalogLoader');

const INTEGRATION: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    name: 'Northwind ERP Integration',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

function setupErpRename() {
    const mocks = setupMocks({
        appBuilderComponents: { 'erp-integration': { ...INTEGRATION } },
        componentConfigs: { 'erp-integration': { ERP_DISPLAY_NAME: 'Northwind ERP' } },
    });
    mockGetAppBuilderComponentEntry.mockImplementation(
        (id: string): AppBuilderComponentCatalogEntry | undefined => shippedCatalog.getAppBuilderComponentEntry(id),
    );
    return mocks;
}

function savedProject(mockContext: ReturnType<typeof setupMocks>['mockContext']) {
    const calls = (mockContext.stateManager.saveProject as jest.Mock).mock.calls;
    return calls[calls.length - 1][0];
}

beforeEach(() => {
    resetHandlerMocks();
});

describe("renaming the ERP integration, whose name is one of its inputs", () => {
    it("renames the card AND sets the integration's name input, keeping the ERP's name", async () => {
        const { mockContext } = setupErpRename();

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'erp-integration',
            name: '  Bodea ERP Hub ',
        });

        expect(result.success).toBe(true);
        const saved = savedProject(mockContext);
        expect(saved.appBuilderComponents['erp-integration'].name).toBe('Bodea ERP Hub');
        expect(saved.componentConfigs['erp-integration']).toEqual({
            ERP_DISPLAY_NAME: 'Northwind ERP',
            INTEGRATION_DISPLAY_NAME: 'Bodea ERP Hub',
        });
    });

    it("deploys nothing, and says Commerce's labels change on the integration's next update", async () => {
        const { mockContext } = setupErpRename();

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'erp-integration',
            name: 'Bodea ERP Hub',
        });

        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
        const note = (result as { note?: string }).note;
        expect(note).toContain('Commerce Admin');
        expect(note).toContain('next update');
        expect(note).toContain('update_integration');
        // The person who renamed from the card is told too, without waiting on them.
        const { window } = jest.requireMock('vscode') as { window: { showInformationMessage: jest.Mock } };
        expect(window.showInformationMessage).toHaveBeenCalledWith(note);
    });

    it('a second copy writes its own name input, not the first copy\'s', async () => {
        const mocks = setupMocks({
            appBuilderComponents: {
                'erp-integration': { ...INTEGRATION },
                'erp-integration-2': { ...INTEGRATION, catalogId: 'erp-integration', name: 'Contoso ERP Integration' },
            },
        });
        mockGetAppBuilderComponentEntry.mockImplementation(
            (id: string): AppBuilderComponentCatalogEntry | undefined => shippedCatalog.getAppBuilderComponentEntry(id),
        );

        await handleRenameAppBuilderComponent(mocks.mockContext, { id: 'erp-integration-2', name: 'Contoso hub' });

        const saved = savedProject(mocks.mockContext);
        expect(saved.componentConfigs['erp-integration-2']).toEqual({ INTEGRATION_DISPLAY_NAME: 'Contoso hub' });
        expect(saved.componentConfigs['erp-integration']).toBeUndefined();
    });
});
