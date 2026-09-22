/**
 * integrationCardModel — linked cards (the ERP integration and the ERP it
 * uses; linked cards plan). The system is a card of its own, right after its
 * integration's, with its own status, a type badge, and a link to the other.
 */

import {
    buildIntegrationCards,
    deriveIntegrationCard,
    deriveSystemCard,
    integration,
    type IdentifiedAppBuilderComponent,
} from './integrationCardModel.testUtils';

import type { LinkedCard } from '@/core/ui/components/integrations/integrationCardModel.types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

const CATALOG: AppBuilderComponentCatalogEntry[] = [
    {
        id: 'demo-erp',
        name: 'ERP',
        description: '',
        kind: 'system',
        boundTo: 'erp-integration',
        systemType: 'ERP',
        source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
    },
];

function erp(over: Partial<IdentifiedAppBuilderComponent> = {}): IdentifiedAppBuilderComponent {
    return {
        id: 'demo-erp',
        kind: 'system',
        status: 'deployed',
        name: 'Nordwind',
        source: { owner: 'skukla', repo: 'demo-erp' },
        url: 'https://ns.adobeio-static.net/index.html',
        lastDeployed: '2026-09-14T10:00:00Z',
        ...over,
    };
}
const pairIntegration = (over: Partial<IdentifiedAppBuilderComponent> = {}) =>
    integration({ id: 'erp-integration', name: 'ERP integration', url: 'https://x/app', ...over });

function usedBy(status: LinkedCard['status'] = 'deployed'): LinkedCard {
    return { id: 'erp-integration', name: 'ERP integration', status, statusLabel: 'Deployed', dotVariant: 'success' };
}

describe('deriveSystemCard', () => {
    it('is a system card: type badge and kind from the catalog, screen URL, no rename, Used by', () => {
        const card = deriveSystemCard(erp(), undefined, usedBy(), CATALOG);
        expect(card).toMatchObject({
            id: 'demo-erp',
            isSystem: true,
            typeBadge: 'ERP',
            kindLabel: 'ERP',
            name: 'Nordwind',
            status: 'deployed',
            url: 'https://ns.adobeio-static.net/index.html',
            urlLabel: 'Screen',
            canRename: false,
            linked: { label: 'Used by', cards: [usedBy()] },
        });
        expect(card.lastDeployed).toBeDefined();
    });

    it('offers its screen, reset, redeploy and remove while both halves are deployed', () => {
        const card = deriveSystemCard(erp(), undefined, usedBy(), CATALOG);
        expect(card.menuActions).toEqual(['open', 'reset-records', 'redeploy', 'remove']);
    });

    it('offers no reset while its integration is not deployed', () => {
        const card = deriveSystemCard(erp(), undefined, usedBy('error'), CATALOG);
        expect(card.menuActions).toEqual(['open', 'redeploy', 'remove']);
    });

    it('shows its OWN failure, and no reset', () => {
        const card = deriveSystemCard(erp({ status: 'error', error: 'database not provisioned' }), undefined, usedBy(), CATALOG);
        expect(card.status).toBe('error');
        expect(card.statusLabel).toBe('Deploy failed');
        expect(card.message).toBe('database not provisioned');
        expect(card.menuActions).not.toContain('reset-records');
    });

    it('offers no verbs while either half is deploying', () => {
        expect(deriveSystemCard(erp(), undefined, usedBy('deploying'), CATALOG).menuActions).toStrictEqual([]);
        const deploying = deriveSystemCard(erp(), { status: 'deploying', message: 'Deploying Nordwind…' }, usedBy(), CATALOG);
        expect(deploying.statusLabel).toBe('Deploying Nordwind…');
        expect(deploying.menuActions).toStrictEqual([]);
    });

    it('reads "System" when the catalog names no type', () => {
        const card = deriveSystemCard(erp({ id: 'unknown-system' }), undefined, undefined, CATALOG);
        expect(card.typeBadge).toBe('System');
        expect(card).not.toHaveProperty('linked');
    });
});

describe('deriveIntegrationCard with systems', () => {
    it('lists the systems it Uses, and keeps its own verbs', () => {
        const system: LinkedCard = { id: 'demo-erp', name: 'Nordwind', status: 'error', statusLabel: 'Deploy failed', dotVariant: 'error' };
        const card = deriveIntegrationCard(pairIntegration(), undefined, [system]);
        expect(card.linked).toEqual({ label: 'Uses', cards: [system] });
        // Its own status: a broken system shows on the system's card, not here.
        expect(card.status).toBe('deployed');
        expect(card.menuActions).toEqual(['open', 'redeploy', 'manage-apis', 'remove']);
    });

    it('an integration that stands alone has no link', () => {
        expect(deriveIntegrationCard(integration({ url: 'https://x/app' }))).not.toHaveProperty('linked');
    });
});

describe('buildIntegrationCards with a system', () => {
    it('puts the system card right after its integration, each naming the other', () => {
        const other = integration({ id: 'other' });
        const cards = buildIntegrationCards([erp(), other, pairIntegration()], {}, CATALOG);
        expect(cards.map((c) => c.id)).toEqual(['other', 'erp-integration', 'demo-erp']);
        expect(cards[1].linked?.cards.map((c) => c.name)).toEqual(['Nordwind']);
        expect(cards[2].linked?.cards.map((c) => c.name)).toEqual(['ERP integration']);
    });

    it('follows the stored link, not the catalog', () => {
        const cards = buildIntegrationCards(
            [pairIntegration({ systems: ['erp-b'] }), erp({ usedBy: undefined }), erp({ id: 'erp-b', name: 'Acme', usedBy: 'erp-integration' })],
            {},
            CATALOG,
        );
        expect(cards.map((c) => c.id)).toEqual(['erp-integration', 'erp-b', 'demo-erp']);
        expect(cards[2]).not.toHaveProperty('linked');
    });

    it("a system's deploying push lands on its own card and never synthesizes a second", () => {
        const cards = buildIntegrationCards(
            [pairIntegration(), erp({ status: 'deploying' })],
            { 'demo-erp': { status: 'deploying', message: 'Deploying Nordwind…' } },
            CATALOG,
        );
        expect(cards.map((c) => c.id)).toEqual(['erp-integration', 'demo-erp']);
        expect(cards[1].statusLabel).toBe('Deploying Nordwind…');
    });

    it('a system whose integration is gone still renders, so it can be removed', () => {
        const cards = buildIntegrationCards([erp()], {}, CATALOG);
        expect(cards.map((c) => c.id)).toEqual(['demo-erp']);
        expect(cards[0].menuActions).toContain('remove');
    });

    it('a system being added before its record exists is synthesized as a system card', () => {
        const cards = buildIntegrationCards([], { 'demo-erp': { status: 'deploying', message: 'Deploying ERP…' } }, CATALOG);
        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({ id: 'demo-erp', isSystem: true, typeBadge: 'ERP' });
    });
});

describe('a removal that stopped', () => {
    const REASON = 'Nothing was removed. The ERP could not be reached.';

    it('reads Removal stopped, says why, and offers Remove anyway last, on either card', () => {
        const integrationCard = deriveIntegrationCard(pairIntegration({ removalStopped: REASON }));
        const systemCard = deriveSystemCard(erp({ removalStopped: REASON }), undefined, usedBy(), CATALOG);

        for (const card of [integrationCard, systemCard]) {
            expect(card).toMatchObject({
                status: 'deployed',
                statusLabel: 'Removal stopped',
                dotVariant: 'warning',
                message: REASON,
                removalStopped: REASON,
            });
            expect(card.menuActions.slice(-2)).toEqual(['remove', 'remove-anyway']);
        }
    });

    it('shows the live status instead while something runs', () => {
        const card = deriveIntegrationCard(pairIntegration({ removalStopped: REASON }), {
            status: 'deploying',
            message: 'Removing ERP integration…',
        });

        expect(card.statusLabel).toBe('Removing ERP integration…');
        expect(card).not.toHaveProperty('removalStopped');
        expect(card.menuActions).toStrictEqual([]);
    });
});

describe('a caller with no catalog loaded yet', () => {
    it('reads the bundled catalog rather than showing the pair as two strangers', () => {
        const pair = [
            { ...integration({ id: 'erp-integration', name: 'ERP integration' }) },
            { ...erp({ id: 'demo-erp' }) },
        ];

        const cards = buildIntegrationCards(pair, {}, []);

        expect(cards.map((c) => c.id)).toEqual(['erp-integration', 'demo-erp']);
        expect(cards[0].linked?.cards.map((c) => c.id)).toEqual(['demo-erp']);
        expect(cards[1].linked?.cards.map((c) => c.id)).toEqual(['erp-integration']);
    });
});

// AB-23: a second pair's cards read as what they are — the pre-built ERP and its
// integration — not as an imported repo and a generic system.
describe('a second pair', () => {
    it("shows the second ERP as an ERP, from the entry it was made from", () => {
        const card = deriveSystemCard(
            erp({ id: 'demo-erp-2', catalogId: 'demo-erp', name: 'Contoso' }),
            undefined,
            undefined,
            CATALOG,
        );

        expect(card).toMatchObject({ id: 'demo-erp-2', typeBadge: 'ERP', name: 'Contoso' });
    });

    it('shows the second integration as pre-built, not as an imported repo', () => {
        const card = deriveIntegrationCard(
            pairIntegration({ id: 'erp-integration-2', catalogId: 'erp-integration', name: 'ERP integration 2' }),
        );

        expect(card.kindLabel).toBe('Pre-built');
    });
});
