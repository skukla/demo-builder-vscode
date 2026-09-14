/**
 * integrationCardModel — the BOUND SYSTEM (the ERP that comes with the ERP
 * integration; plan step 05). A system never becomes a card: its status, its
 * screen and its verbs ride its integration's card, and the face reads the
 * pair's WORSE status.
 */

import {
    buildIntegrationCards,
    deriveIntegrationCard,
    integration,
    type IdentifiedAppBuilderComponent,
} from './integrationCardModel.testUtils';

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

// The pairing is read off the SYSTEM row's catalog entry (`boundTo`): the
// caller's catalog first, which is what the screen hands over.
const CATALOG: AppBuilderComponentCatalogEntry[] = [
    {
        id: 'demo-erp',
        name: 'ERP',
        description: '',
        kind: 'system',
        boundTo: 'erp-integration',
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
const pairIntegration = () => integration({ id: 'erp-integration', name: 'ERP integration', url: 'https://x/app' });

describe('deriveIntegrationCard with a bound system', () => {
    it('carries the system: name, status, screen URL, last deploy', () => {
        const card = deriveIntegrationCard(pairIntegration(), undefined, { component: erp() });
        expect(card.system).toMatchObject({
            id: 'demo-erp',
            name: 'Nordwind',
            status: 'deployed',
            statusLabel: 'Deployed',
            url: 'https://ns.adobeio-static.net/index.html',
        });
        expect(card.system?.lastDeployed).toBeDefined();
    });

    it('both deployed: the face is Deployed and the kebab offers the ERP verbs after the integration\'s', () => {
        const card = deriveIntegrationCard(pairIntegration(), undefined, { component: erp() });
        expect(card.status).toBe('deployed');
        expect(card.menuActions).toEqual([
            'open',
            'redeploy',
            'open-system',
            'reset-system',
            'redeploy-system',
            'manage-apis',
            'remove',
        ]);
    });

    it("the face reads the pair's WORSE status and names which half is wrong", () => {
        const card = deriveIntegrationCard(pairIntegration(), undefined, {
            component: erp({ status: 'error', error: 'database not provisioned' }),
        });
        expect(card.status).toBe('error');
        expect(card.statusLabel).toBe('Deploy failed');
        expect(card.message).toBe('Nordwind: Deploy failed');
        expect(card.system?.message).toBe('database not provisioned');
        // No reset through a broken pair; the ERP can still be redeployed.
        expect(card.menuActions).not.toContain('reset-system');
        expect(card.menuActions).toContain('redeploy-system');
    });

    it("while the ERP deploys first, the face shows its step and offers no verbs", () => {
        const card = deriveIntegrationCard(
            integration({ id: 'erp-integration', status: 'not-deployed' }),
            undefined,
            { component: erp({ status: 'deploying' }), override: { status: 'deploying', message: 'Deploying Nordwind…' } },
        );
        expect(card.status).toBe('deploying');
        expect(card.statusLabel).toBe('Deploying Nordwind…');
        expect(card.menuActions).toStrictEqual([]);
    });

    it('an integration that stands alone has no system and no system verbs', () => {
        const card = deriveIntegrationCard(integration({ url: 'https://x/app' }));
        expect(card.system).toBeUndefined();
        expect(card.menuActions).toEqual(['open', 'redeploy', 'manage-apis', 'remove']);
    });
});

describe('buildIntegrationCards with a bound system', () => {
    it('renders ONE card for the pair, the system riding its integration, never a card of its own', () => {
        const cards = buildIntegrationCards([pairIntegration(), erp()], {}, CATALOG);
        expect(cards.map((c) => c.id)).toEqual(['erp-integration']);
        expect(cards[0].system?.id).toBe('demo-erp');
    });

    it("the system's own deploying push lands on its integration's card and never synthesizes a second card", () => {
        const cards = buildIntegrationCards(
            [pairIntegration(), erp({ status: 'deploying' })],
            { 'demo-erp': { status: 'deploying', message: 'Deploying Nordwind…' } },
            CATALOG,
        );
        expect(cards.map((c) => c.id)).toEqual(['erp-integration']);
        expect(cards[0].system?.statusLabel).toBe('Deploying Nordwind…');
    });

    it('a system row with no integration in the project renders nothing (it is on its way out)', () => {
        expect(buildIntegrationCards([erp()], {}, CATALOG)).toStrictEqual([]);
    });
});
