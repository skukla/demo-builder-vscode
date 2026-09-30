/**
 * Which ERP a fill is for (AB-16g). The fill merges that ERP's pairs into the one key map the
 * integration keeps for every ERP, replacing the rows of the ERP it names. An added ERP whose
 * catalog entry cannot be resolved used to be filled as the FIRST ERP (`erp`), so its pairs
 * replaced the first ERP's; that is one way Northwind's pairs could have gone. Such a fill now
 * stops with the reason instead.
 */

import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockProject } from '../../../helpers/projectFake';
import type { AppBuilderComponentState, Project } from '@/types/base';

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    ...jest.requireActual('@/features/components/services/appBuilderComponentCatalogLoader'),
    // listedAs as the bundled catalog declares it (app-builder-components.json, demo-erp).
    getAppBuilderComponentCatalog: jest.fn(() => [
        { id: 'erp-integration', kind: 'integration' },
        { id: 'demo-erp', kind: 'system', boundTo: 'erp-integration', listedAs: { envVar: 'ERP_ID', adapter: 'demo-erp' } },
    ]),
}));

// Below the mock on purpose: the fill must bind to it.
import { fillErpForProject } from '@/features/project-creation/services/erpFillForProject';

const ERP: AppBuilderComponentState = {
    kind: 'system',
    status: 'deployed',
    name: 'Northwind',
    usedBy: 'erp-integration',
    source: { owner: 'skukla', repo: 'demo-erp' },
};

function project(added: AppBuilderComponentState): Project {
    return createMockProject({
        name: 'bodea',
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                systems: ['demo-erp', 'demo-erp-2'],
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
            },
            'demo-erp': ERP,
            'demo-erp-2': added,
        },
    });
}

const deps = { authManager: createMockAuthenticationService(), getAuth: async () => undefined };

describe('fillErpForProject — which ERP it fills', () => {
    it('stops, naming the ERP, when an added ERP cannot be told from the first', async () => {
        const outcome = await fillErpForProject(project({ ...ERP, name: 'Contoso' }), 'erp-integration', deps, 'demo-erp-2');

        expect(outcome).toEqual({
            status: 'failed',
            detail: 'Cannot tell which ERP "demo-erp-2" is in the integration\'s list, so its pairs could replace another ERP\'s. Redeploy it, then load demo data again.',
        });
    });

    it('goes past the target for an added ERP that names its catalog entry (control)', async () => {
        const outcome = await fillErpForProject(project({ ...ERP, name: 'Contoso', catalogId: 'demo-erp' }), 'erp-integration', deps, 'demo-erp-2');

        // The next check is the sign-in: the target resolved.
        expect(outcome).toEqual({ status: 'failed', detail: 'Adobe sign-in required.' });
    });

    it('still fills the first ERP by its own entry', async () => {
        const outcome = await fillErpForProject(project({ ...ERP, name: 'Contoso', catalogId: 'demo-erp' }), 'erp-integration', deps);

        expect(outcome).toEqual({ status: 'failed', detail: 'Adobe sign-in required.' });
    });
});
