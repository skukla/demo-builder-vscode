/**
 * The runner's `prepareStore` dep, as production wires it (owner, 2026-10-22): the ERP
 * integration's first install prepares the store before the fill. What is asserted is what
 * the preparation is HANDED — the project, the entry, the sign-in, the credential store and
 * the save — and that an entry with nothing to prepare is left alone.
 */

const mockPrepare = jest.fn();
jest.mock('@/features/project-creation/services/erpStorePreparation', () => ({
    prepareStoreOnAdd: (...a: unknown[]) => mockPrepare(...a),
}));

import { erpRunnerDeps, type ErpRunnerContext } from '@/features/project-creation/services/erpRunnerDeps';
import type { AppBuilderComponentCatalogEntry, SetupStep } from '@/types/appBuilderComponents';
import { createMockProject } from '../../../helpers/projectFake';

const FIX_STEP: SetupStep = { id: 'price-scope', title: 'Prices', why: 'w', where: 'Admin', fix: { kind: 'config', items: [] } };
const ERP_ENTRY = { id: 'erp-integration', name: 'ERP Integration', kind: 'integration', fillsSystem: true, setupSteps: [FIX_STEP] } as AppBuilderComponentCatalogEntry;

function ctx(): ErpRunnerContext {
    return {
        authManager: { name: 'auth' },
        secrets: { name: 'secrets' },
        saveProject: jest.fn(),
    } as unknown as ErpRunnerContext;
}

beforeEach(() => mockPrepare.mockReset().mockResolvedValue({ status: 'prepared' }));

describe('erpRunnerDeps prepareStore', () => {
    it('prepares the store for an entry that fills a system, handed the sign-in, the credentials and the save', async () => {
        const host = ctx();
        const project = createMockProject();
        const onStep = jest.fn();

        const outcome = await erpRunnerDeps(host, () => async () => undefined).prepareStore!(project, ERP_ENTRY, onStep);

        expect(outcome).toStrictEqual({ status: 'prepared' });
        expect(mockPrepare).toHaveBeenCalledWith(
            project,
            ERP_ENTRY,
            { authManager: host.authManager, credentials: host.secrets, saveProject: host.saveProject },
            onStep,
        );
    });

    it('leaves an entry with no step Demo Builder can apply alone', async () => {
        const outcome = await erpRunnerDeps(ctx(), () => async () => undefined).prepareStore!(
            createMockProject(),
            { ...ERP_ENTRY, setupSteps: [] },
            jest.fn(),
        );

        expect(outcome).toStrictEqual({ status: 'prepared' });
        expect(mockPrepare).not.toHaveBeenCalled();
    });
});
