/**
 * removalConsequence — the Remove dialog's second line for the mesh: plain
 * "loses its endpoint" by default, and, when the project's demo needs the mesh,
 * that its storefront stops working until the mesh is added again.
 */

import { deriveMeshCard } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { removalConsequence } from '@/features/dashboard/ui/components/integrations/removalConsequence';
import { MESH_NEEDED_NOTE } from '@/features/components/services/demoPackageLoader';

const meshCard = deriveMeshCard({ color: 'green', text: 'Deployed' }, 'deployed', undefined, false, 'eds-commerce-mesh');

describe('removalConsequence — the mesh', () => {
    it('says the storefront loses its endpoint', () => {
        expect(removalConsequence(meshCard)).toMatch(/storefront loses its API Mesh endpoint/);
    });

    it("says the demo stops working when the project's demo needs the mesh", () => {
        expect(removalConsequence({ ...meshCard, neededByDemo: true })).toBe(MESH_NEEDED_NOTE);
    });
});

// Removal undoes the ERP integration's store setup first, and says so before the click
// (2026-10-19: removing it had left 139 tags, the attribute on 12 sets and the preparation).
describe('removalConsequence — the ERP integration and its ERPs', () => {
    const link = { id: 'demo-erp', name: 'Justrite ERP', status: 'deployed', statusLabel: 'Deployed', dotVariant: 'success' } as const;
    const base = { ...meshCard, isMesh: false, linked: { cards: [link] } };

    it('says the integration undoes its store setup in Commerce first', () => {
        expect(removalConsequence(base)).toContain(
            'Its store setup is undone in Commerce first: the ERP tags on products, erp_owner on the attribute sets Demo Builder added it to, and what Prepare this store changed.',
        );
    });

    it("says an ERP clears its products' tags", () => {
        expect(removalConsequence({ ...base, isSystem: true })).toContain("Its products' ERP tags are cleared in Commerce first.");
    });

    it('CONTROL: says nothing of it for an integration with no ERP', () => {
        expect(removalConsequence({ ...meshCard, isMesh: false })).toBeUndefined();
    });
});
