/**
 * What each derivation falls back to when its input is only half there.
 *
 * Every card in the grid is built from persisted state that older projects wrote
 * under older rules, plus a live override that may name an id nothing has stored
 * yet. So the interesting inputs are the partial ones: a source with an owner and
 * no repo, an errored mesh with nothing persisted behind it, a pending id the
 * bundled catalog has never heard of.
 *
 * Split from integrationCardModel.test.ts (481 lines) rather than grown into it.
 * The catalog-loader fake and the fixtures live in the shared testUtils.
 */

import {
    buildIntegrationCards,
    deriveIntegrationCard,
    deriveMeshCard,
    display,
    integration,
} from './integrationCardModel.testUtils';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

describe('deriveIntegrationCard — a half-written source', () => {
    // The em-dash is for a source we cannot NAME, and half a name is not a name:
    // `acme/` and `/erp-sync` read as identifiers you could go and look up.
    // Legacy entries carry exactly this shape — one field written, one not.
    it('renders the em-dash when the repo is missing', () => {
        const model = deriveIntegrationCard(
            integration({ id: 'legacy-app', source: { owner: 'acme', repo: '' } })
        );

        expect(model.sourceLine).toBe('—');
    });

    it('renders the em-dash when the owner is missing', () => {
        const model = deriveIntegrationCard(
            integration({ id: 'legacy-app', source: { owner: '', repo: 'erp-sync' } })
        );

        expect(model.sourceLine).toBe('—');
    });
});

describe('deriveIntegrationCard — what may be renamed', () => {
    // Rename writes the entry's display name, and only an integration HAS one:
    // the mesh card's name is the fixed string "API Mesh". The kind is checked
    // here rather than left to the caller because this derivation is exported
    // and `buildIntegrationCards` is not the only way in.
    it('does not offer rename for an entry that is not an integration', () => {
        const model = deriveIntegrationCard({
            ...integration({ id: 'eds-accs-mesh' }),
            kind: 'mesh',
        });

        expect(model.canRename).toBe(false);
    });
});

describe('deriveMeshCard — an error with nothing persisted behind it', () => {
    // The reason comes off the persisted entry, and a mesh can be reported
    // errored before any entry exists — a deploy that failed on its first run
    // leaves the status and no record. The card says "Deploy failed" with no
    // reason rather than failing to render at all.
    it('reports no reason when there is no mesh entry to read one from', () => {
        const model = deriveMeshCard(
            display({ text: 'Deployment failed' }),
            'error',
            undefined,
            false
        );

        expect(model.status).toBe('error');
        expect(model.message).toBeUndefined();
    });
});

describe('buildIntegrationCards — resolving a pending id against the passed catalog', () => {
    const ACME_CRM: AppBuilderComponentCatalogEntry = {
        id: 'acme-crm',
        name: 'Acme CRM',
        description: 'first in the list, and not the one asked for',
        kind: 'integration',
        source: { owner: 'acme', repo: 'crm', branch: 'main' },
    };
    const ACME_ERP: AppBuilderComponentCatalogEntry = {
        id: 'acme-erp',
        name: 'Acme ERP',
        description: 'second in the list, and the one asked for',
        kind: 'integration',
        source: { owner: 'acme', repo: 'erp', branch: 'main' },
    };

    // Deliberately ids the BUNDLED catalog does not carry: the passed list is
    // what the add flow knows and the bundled lookup is only the fallback, so a
    // fixture that appears in both cannot tell which one answered.
    it('finds the entry whose id MATCHES, not the first one it is handed', () => {
        const cards = buildIntegrationCards([], { 'acme-erp': { status: 'deploying' } }, [
            ACME_CRM,
            ACME_ERP,
        ]);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            id: 'acme-erp',
            name: 'Acme ERP',
            sourceLine: 'acme/erp',
        });
    });

    // The other half of the same rule: an id the passed list does not hold falls
    // through to the bundled lookup, and an id neither one holds renders as
    // itself rather than blank.
    it('falls back to the id when neither catalog carries it', () => {
        const cards = buildIntegrationCards([], { 'acme-erp': { status: 'deploying' } }, [
            ACME_CRM,
        ]);

        expect(cards[0]).toMatchObject({ id: 'acme-erp', name: 'acme-erp', sourceLine: '—' });
    });
});
