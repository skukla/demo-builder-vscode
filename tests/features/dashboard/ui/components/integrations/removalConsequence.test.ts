/**
 * removalConsequence — what the Remove dialog adds after its first line, a line each: for the mesh, plain "loses
 * its endpoint" by default, and, when the project's demo needs the mesh, that its storefront
 * stops working; for the ERP integration and its ERPs, what goes with them.
 */

import { deriveMeshCard } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { removalConsequence } from '@/features/dashboard/ui/components/integrations/removalConsequence';

const meshCard = deriveMeshCard({ color: 'green', text: 'Deployed' }, 'deployed', undefined, false, 'eds-commerce-mesh');

describe('removalConsequence — the mesh', () => {
    it('says the storefront loses its endpoint', () => {
        expect(removalConsequence(meshCard)).toEqual(['Your storefront loses its API Mesh endpoint until you deploy a new mesh.']);
    });

    it("says the demo stops working when the project's demo needs the mesh", () => {
        expect(removalConsequence({ ...meshCard, neededByDemo: true })).toEqual([
            "This demo needs the API Mesh, and without it the storefront won't work.",
        ]);
    });
});

// Removal undoes the ERP integration's store setup first, and says so before the click
// (2026-10-19: removing it had left 139 tags, the attribute on 12 sets and the preparation).
describe('removalConsequence — the ERP integration and its ERPs', () => {
    const link = { id: 'demo-erp', name: 'Justrite ERP', status: 'deployed', statusLabel: 'Deployed', dotVariant: 'success' } as const;
    const base = { ...meshCard, isMesh: false, linked: { cards: [link] } };

    it('says the integration undoes its store setup in Commerce first', () => {
        const lines = removalConsequence(base);
        expect(lines).toContain('It first undoes its store setup in Commerce: the ERP tags on products and what the demo setup applied.');
        expect(lines).toContain('That includes erp_owner on the attribute sets Demo Builder added it to.');
    });

    it("says an ERP clears its products' tags", () => {
        expect(removalConsequence({ ...base, isSystem: true })).toContain("It first clears its products' ERP tags in Commerce.");
    });

    it('says each consequence as a short line of its own', () => {
        const lines = removalConsequence({ ...base, installation: { label: 'Installed', failed: false } }) ?? [];
        expect(lines).toEqual([
            'It also removes Justrite ERP, with its records.',
            'It first undoes its store setup in Commerce: the ERP tags on products and what the demo setup applied.',
            'That includes erp_owner on the attribute sets Demo Builder added it to.',
            'It does not clear a listing under Apps > App Management in Commerce Admin. If you associated it there, unassociate it first.',
        ]);
        // The fullest case: no sentence in it runs past about 20 words (owner, 2026-11-02).
        for (const sentence of lines.flatMap((line) => line.split(/(?<=\.) /))) {
            expect(sentence.split(' ').length).toBeLessThanOrEqual(20);
        }
    });

    it('CONTROL: says nothing of it for an integration with no ERP', () => {
        expect(removalConsequence({ ...meshCard, isMesh: false })).toBeUndefined();
    });
});
