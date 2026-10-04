/**
 * A blank-starter app's card offers "Save to GitHub" just above Remove; once Demo
 * Builder saved it, the card names the new repository and offers the undo instead
 * (AB-1c). Nothing is offered mid-deploy, and nothing on an imported or pre-built app.
 */

import {
    BLANK_SOURCE,
    deriveIntegrationCard,
    type IdentifiedAppBuilderComponent,
} from './integrationCardModel.testUtils';

function blankApp(over: Partial<IdentifiedAppBuilderComponent> = {}): IdentifiedAppBuilderComponent {
    return {
        id: 'order-sync',
        kind: 'integration',
        status: 'deployed',
        name: 'Order Sync',
        source: { ...BLANK_SOURCE },
        ...over,
    };
}

const SAVED = {
    source: { owner: 'steve', repo: 'order-sync', branch: 'main' },
    promotion: { from: { ...BLANK_SOURCE }, at: '2026-10-05T00:00:00.000Z' },
};

describe('the repository verbs on an integration card', () => {
    it('offers "Save to GitHub" on a blank-starter app, just above Remove', () => {
        expect(deriveIntegrationCard(blankApp()).menuActions).toEqual([
            'open',
            'redeploy',
            'manage-apis',
            'save-to-github',
            'remove',
        ]);
    });

    it('offers the undo instead once saved, and names the repository', () => {
        const model = deriveIntegrationCard(blankApp(SAVED));

        expect(model.menuActions).toEqual([
            'open',
            'redeploy',
            'manage-apis',
            'delete-github-repo',
            'remove',
        ]);
        expect(model.kindLabel).toBe('Custom · saved to GitHub');
        expect(model.sourceLine).toBe('steve/order-sync');
        expect(model.canRename).toBe(true);
    });

    it('offers neither mid-deploy', () => {
        expect(deriveIntegrationCard(blankApp({ status: 'deploying' })).menuActions).toStrictEqual([]);
    });

    it('offers neither on an imported repository or the catalog starter itself', () => {
        const imported = deriveIntegrationCard(
            blankApp({ source: { owner: 'acme', repo: 'erp-sync' } }),
        );
        const catalogItself = deriveIntegrationCard(blankApp({ id: 'app-builder-shell' }));

        for (const model of [imported, catalogItself]) {
            expect(model.menuActions).not.toContain('save-to-github');
            expect(model.menuActions).not.toContain('delete-github-repo');
        }
    });
});
