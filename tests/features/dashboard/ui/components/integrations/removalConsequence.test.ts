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
