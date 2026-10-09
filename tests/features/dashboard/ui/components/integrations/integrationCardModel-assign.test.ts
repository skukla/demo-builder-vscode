/**
 * integrationCardModel — "Assign products" and "Undo last assignment" on an ERP's card
 * (AB-74). Offered on an ERP its integration serves in a LIST (`listedAs`), while both are
 * deployed; the undo only once an assignment is recorded on the ERP.
 */

import { deriveSystemCard, type IdentifiedAppBuilderComponent } from './integrationCardModel.testUtils';
import type { LinkedCard } from '@/core/ui/components/integrations/integrationCardModel.types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/** The demo ERP as the bundled catalog declares it: served in its integration's list. */
const CATALOG: AppBuilderComponentCatalogEntry[] = [
    {
        id: 'demo-erp',
        name: 'ERP',
        description: '',
        kind: 'system',
        boundTo: 'erp-integration',
        systemType: 'ERP',
        listedAs: { envVar: 'ERP_ID', adapter: 'demo-erp' },
        source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
    },
];

function erp(over: Partial<IdentifiedAppBuilderComponent> = {}): IdentifiedAppBuilderComponent {
    return {
        id: 'demo-erp',
        kind: 'system',
        status: 'deployed',
        name: 'Accuform ERP',
        source: { owner: 'skukla', repo: 'demo-erp' },
        url: 'https://ns.adobeio-static.net/index.html',
        ...over,
    };
}

function usedBy(status: LinkedCard['status'] = 'deployed'): LinkedCard {
    return { id: 'erp-integration', name: 'ERP integration', status, statusLabel: 'Deployed', dotVariant: 'success' };
}

describe('Assign products on an ERP card', () => {
    it('is offered after the demo controls while both halves are deployed', () => {
        expect(deriveSystemCard(erp(), undefined, usedBy(), CATALOG).menuActions).toEqual([
            'open',
            'load-demo-data',
            'simulate-downtime',
            'assign-products',
            'redeploy',
            'remove',
        ]);
    });

    it('adds the undo once an assignment is recorded', () => {
        const assigned = erp({ erpAssignment: { at: '2026-10-09T10:00:00Z', value: 'accuform', previous: [] } });
        expect(deriveSystemCard(assigned, undefined, usedBy(), CATALOG).menuActions).toContain('undo-assignment');
    });

    it('is not offered while the integration is not deployed', () => {
        const actions = deriveSystemCard(erp(), undefined, usedBy('error'), CATALOG).menuActions;
        expect(actions).not.toContain('assign-products');
        expect(actions).not.toContain('undo-assignment');
    });

    it('is not offered on a system its integration does not serve in a list', () => {
        const unlisted = CATALOG.map(({ listedAs: _listed, ...entry }) => entry);
        expect(deriveSystemCard(erp(), undefined, usedBy(), unlisted).menuActions).not.toContain('assign-products');
    });
});
