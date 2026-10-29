/**
 * AddIntegrationFlowAdapter — the ERP integration's add waits for its confirm (owner,
 * 2026-10-22). Its add prepares the store, some of it for every website on the Commerce, so
 * the commit hands the add to the screen's confirm instead of sending it; every other entry
 * still sends at once.
 */

import { mockPostMessage } from '../../../../helpers/webviewClientMock';
import { CATALOG, modalProps, renderAdapter, resetCaptured } from './AddIntegrationFlowAdapter.testUtils';
import type { AppBuilderComponentCatalogEntry, SetupStep } from '@/types/appBuilderComponents';

const FIX_STEP: SetupStep = { id: 'price-scope', title: 'Prices', why: 'w', where: 'Admin', fix: { kind: 'config', items: [] } };
const ERP_INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'd',
    kind: 'integration',
    fillsSystem: true,
    setupSteps: [FIX_STEP],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

beforeEach(() => {
    jest.clearAllMocks();
    resetCaptured();
});

describe('AddIntegrationFlowAdapter — the add that prepares the store', () => {
    it('hands the ERP integration to the confirm, with the payload it built, and sends nothing', () => {
        const onAddStarted = jest.fn();
        const onConfirmAdd = jest.fn();
        renderAdapter({ catalog: [...CATALOG, ERP_INTEGRATION], onAddStarted, onConfirmAdd });

        modalProps().builder.onAppBuilderComponentToggle('erp-integration', true, 'Justrite ERP');

        expect(mockPostMessage).not.toHaveBeenCalled();
        expect(onAddStarted).not.toHaveBeenCalled();
        expect(onConfirmAdd).toHaveBeenCalledWith({
            id: 'erp-integration',
            name: 'Justrite ERP',
            payload: { id: 'erp-integration', apis: undefined, name: 'Justrite ERP' },
        });
    });

    it('CONTROL: an entry that prepares nothing is still sent at once', () => {
        const onAddStarted = jest.fn();
        const onConfirmAdd = jest.fn();
        renderAdapter({ catalog: [...CATALOG, ERP_INTEGRATION], onAddStarted, onConfirmAdd });

        modalProps().builder.onAppBuilderComponentToggle('erp-sync', true);

        expect(onConfirmAdd).not.toHaveBeenCalled();
        expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', expect.objectContaining({ id: 'erp-sync' }));
    });
});
