/**
 * Stale system links (AB-70).
 *
 * A removed system's id used to stay in its integration's `systems` list, and a
 * later system added under the same id then read as linked before its add had
 * finished. `withoutStaleSystemLinks` is what the removal and the manifest writer
 * both run the keyed map through, so the rule is pinned here once rather than
 * through either caller.
 */

import { withoutStaleSystemLinks } from '@/core/state/appBuilderComponentState';
import { makeAppBuilderComponent } from './appBuilderComponentState.testUtils';

describe('withoutStaleSystemLinks', () => {
    it('drops a system id nothing in the map carries, and keeps the ones that are there', () => {
        const integration = makeAppBuilderComponent({
            kind: 'integration',
            systems: ['demo-erp', 'demo-erp-2'],
        });
        const erp = makeAppBuilderComponent({ kind: 'system' });

        const pruned = withoutStaleSystemLinks({ 'erp-integration': integration, 'demo-erp': erp });

        expect(pruned).toStrictEqual({
            'erp-integration': { ...integration, systems: ['demo-erp'] },
            'demo-erp': erp,
        });
    });

    it('copies the record it changes and leaves the one it was handed alone', () => {
        const integration = makeAppBuilderComponent({ kind: 'integration', systems: ['gone'] });

        const pruned = withoutStaleSystemLinks({ 'erp-integration': integration });

        expect(pruned['erp-integration']).not.toBe(integration);
        expect(integration.systems).toStrictEqual(['gone']);
    });

    it('keeps an emptied list as an empty list, which says "no system"', () => {
        const integration = makeAppBuilderComponent({ kind: 'integration', systems: ['gone'] });

        const pruned = withoutStaleSystemLinks({ 'erp-integration': integration });

        expect(pruned['erp-integration'].systems).toStrictEqual([]);
    });

    it('hands back the SAME record when every link still resolves', () => {
        const integration = makeAppBuilderComponent({ kind: 'integration', systems: ['demo-erp'] });
        const erp = makeAppBuilderComponent({ kind: 'system' });

        const pruned = withoutStaleSystemLinks({ 'erp-integration': integration, 'demo-erp': erp });

        expect(pruned['erp-integration']).toBe(integration);
    });

    it('hands back the SAME record for a component that links no systems at all', () => {
        const mesh = makeAppBuilderComponent();

        const pruned = withoutStaleSystemLinks({ mesh });

        expect(pruned).toStrictEqual({ mesh });
        expect(pruned.mesh).toBe(mesh);
    });
});
