/**
 * integrationCardModel — the edges of each card's menu, and what a card says it is.
 *
 * The sibling suites walk the common statuses. These are the cases between them:
 * a menu item that belongs to a DEPLOYED card showing up on one that is not, a
 * verb offered to an integration that only half qualifies for it, and the fields a
 * card or its link is recognised by.
 */

import {
    buildIntegrationCards,
    deriveIntegrationCard,
    deriveSystemCard,
    integration,
    type IdentifiedAppBuilderComponent,
} from './integrationCardModel.testUtils';

function erp(over: Partial<IdentifiedAppBuilderComponent> = {}): IdentifiedAppBuilderComponent {
    return {
        id: 'demo-erp',
        kind: 'system',
        status: 'deployed',
        name: 'Nordwind ERP',
        source: { owner: 'skukla', repo: 'demo-erp' },
        ...over,
    };
}

describe('an integration card that is not deployed', () => {
    // Its install record outlives the deployment it describes. The Admin entry and
    // the reinstall both act on a running app, so neither is offered without one.
    it('offers no Commerce Admin entry and no reinstall, whatever its install record says', () => {
        const card = deriveIntegrationCard(
            integration({ status: 'error', installation: { status: 'installed' } }),
        );

        expect(card.menuActions).toStrictEqual(['retry', 'open', 'manage-apis', 'remove']);
    });
});

describe('a system card that is not deployed and serves no screen', () => {
    it('offers only its status verb and its removal', () => {
        const card = deriveSystemCard(erp({ status: 'error' }), undefined, undefined, []);

        expect(card.menuActions).toStrictEqual(['retry', 'remove']);
    });

    it('is a system card, never a mesh card', () => {
        const card = deriveSystemCard(erp(), undefined, undefined, []);

        expect(card.isSystem).toBe(true);
        expect(card.isMesh).toBe(false);
    });
});

describe("the integration's own ERP verbs", () => {
    // Both halves are needed: it is added once (so its card is the only way to a
    // second ERP) AND a system lists itself under it (so there is an ERP to add).
    it('are not offered to an add-once integration that no system lists itself under', () => {
        const card = deriveIntegrationCard(
            integration({ id: 'solo', catalogId: 'solo-with-setup', status: 'deployed' }),
        );

        expect(card.menuActions).toStrictEqual(['open', 'redeploy', 'manage-apis', 'remove']);
    });

    it('sit just above Remove on the ERP integration', () => {
        const card = deriveIntegrationCard(
            integration({ id: 'erp-integration', status: 'deployed' }),
        );

        expect(card.menuActions).toStrictEqual([
            'open',
            'redeploy',
            'manage-apis',
            'add-erp',
            'load-demo-data',
            'reset-records',
            'remove',
        ]);
    });
});

describe('the setup checklist on an integration card', () => {
    it('is absent when the catalog entry declares no steps', () => {
        expect(deriveIntegrationCard(integration())).not.toHaveProperty('setupChecklist');
    });

    // A value entered once per ERP is spelled out per ERP, by the short name of each
    // system card the integration uses.
    it('carries the declared steps, with a per-ERP value named for each ERP it uses', () => {
        const card = deriveIntegrationCard(
            integration({ id: 'solo', catalogId: 'solo-with-setup' }),
            undefined,
            [
                { id: 'erp-1', name: 'Nordwind ERP', status: 'deployed', statusLabel: 'Deployed', dotVariant: 'success' },
                { id: 'erp-2', name: 'Acme', status: 'deployed', statusLabel: 'Deployed', dotVariant: 'success' },
            ],
        );

        expect(card.setupChecklist).toHaveLength(1);
        expect(card.setupChecklist?.[0]).toMatchObject({
            id: 'second-source',
            state: 'open',
            enter: ['Nordwind warehouse', 'Acme warehouse'],
        });
    });
});

describe('what linked cards call each other', () => {
    it("carries each card's type badge across the link", () => {
        const [own, system] = buildIntegrationCards(
            [integration({ id: 'erp-integration', name: 'ERP integration' }), erp()],
            {},
        );

        expect(own.linked?.cards).toStrictEqual([
            expect.objectContaining({ id: 'demo-erp', typeBadge: 'ERP' }),
        ]);
        expect(system.linked?.cards).toStrictEqual([
            expect.objectContaining({ id: 'erp-integration', typeBadge: 'Integration' }),
        ]);
    });
});

describe('a card for a component still being added', () => {
    it('is an integration card when the catalog says the id is an integration', () => {
        const [card] = buildIntegrationCards([], { 'sfdc-connector': { status: 'deploying' } });

        expect(card.typeBadge).toBe('Integration');
        expect(card).not.toHaveProperty('isSystem');
    });

    it('is a system card when the catalog says the id is a system', () => {
        const [card] = buildIntegrationCards([], { 'demo-erp': { status: 'deploying' } });

        expect(card.typeBadge).toBe('ERP');
        expect(card.isSystem).toBe(true);
    });
});
