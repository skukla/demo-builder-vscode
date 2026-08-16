/**
 * integrationCards Tests — wizard rows → shared card models.
 *
 * The wizard's producer for the card `core/ui/components/integrations` renders.
 * Its whole job is saying what a PRE-BUILD card knows: identity, origin, which
 * APIs it will provision, and which of those the user may still change. It must
 * NOT invent deploy state — nothing is deployed while the wizard is running, so
 * a status here would read identically on every card and mean nothing.
 *
 * Pure module: no React, no wizard state, no catalog lookups. Rows in, models
 * out. The row resolution itself is `integrationRows.ts` and is pinned by its
 * own suite.
 */

import {
    sublineFor,
    toIntegrationCards,
} from '@/features/project-creation/ui/components/integration-flow/integrationCards';
import type { IntegrationRow } from '@/features/project-creation/ui/components/integration-flow/integrationRows';

function row(overrides: Partial<IntegrationRow> = {}): IntegrationRow {
    return {
        id: 'erp-sync',
        kind: 'custom',
        name: 'ERP Sync',
        sourceLine: 'Custom integration · acme/erp-sync',
        needsSetup: false,
        apis: ['AdobeIOManagementAPISDK', 'GraphQLServiceSDK'],
        ...overrides,
    };
}

describe('toIntegrationCards', () => {
    it('carries identity straight through from the row', () => {
        const [card] = toIntegrationCards([row()]);

        expect(card.id).toBe('erp-sync');
        expect(card.name).toBe('ERP Sync');
        expect(card.sourceLine).toBe('Custom integration · acme/erp-sync');
        expect(card.apis).toEqual(['AdobeIOManagementAPISDK', 'GraphQLServiceSDK']);
    });

    it('preserves row order (mesh, then catalog, then custom)', () => {
        const cards = toIntegrationCards([
            row({ id: 'eds-accs-mesh', kind: 'mesh', name: 'API Mesh' }),
            row({ id: 'order-sync', kind: 'catalog', name: 'Order Sync' }),
            row({ id: 'crm', kind: 'custom', name: 'CRM Integration' }),
        ]);

        expect(cards.map((card) => card.id)).toEqual(['eds-accs-mesh', 'order-sync', 'crm']);
    });

    it('returns an empty list for no rows', () => {
        expect(toIntegrationCards([])).toEqual([]);
    });

    // Nothing is deployed yet. A status would be the same on every card, so the
    // card gets its subline instead (IntegrationCard.subline) and these fields
    // exist only to satisfy the shared shape.
    describe('carries no deploy state', () => {
        it.each([
            ['url', 'url'],
            ['deployedUrls', 'deployedUrls'],
            ['lastDeployed', 'lastDeployed'],
            ['commerceScope', 'commerceScope'],
            ['message', 'message'],
        ])('leaves %s undefined', (_label, key) => {
            const [card] = toIntegrationCards([row()]);

            expect(card[key as keyof typeof card]).toBeUndefined();
        });

        it('pins status to not-deployed with an empty label', () => {
            const [card] = toIntegrationCards([row()]);

            expect(card.status).toBe('not-deployed');
            expect(card.statusLabel).toBe('');
        });
    });

    describe('menu actions', () => {
        // The existing isApiEditable rule, one home: only custom/blank rows carry
        // FREE API picks. A mesh's and a catalog entry's APIs are deterministic,
        // so offering "Manage APIs" on them would open a picker that can change
        // nothing.
        it.each([
            ['custom', 'custom', ['manage-apis', 'remove']],
            ['blank', 'blank', ['manage-apis', 'remove']],
            ['mesh', 'mesh', ['remove']],
            ['catalog', 'catalog', ['remove']],
        ])('offers %s the right verbs', (_label, kind, expected) => {
            const [card] = toIntegrationCards([row({ kind: kind as IntegrationRow['kind'] })]);

            expect(card.menuActions).toEqual(expected);
        });

        it('always offers Remove — every row can be dropped from the build', () => {
            for (const kind of ['mesh', 'catalog', 'blank', 'custom'] as const) {
                const [card] = toIntegrationCards([row({ kind })]);
                expect(card.menuActions).toContain('remove');
            }
        });
    });

    // Untested until iteration 2 of the verify loop, which proved it by reverting
    // `kindLabel: KIND_LABELS[row.kind]` to `kindLabel: row.kind` and watching all
    // 1004 suites stay green. The labels must match the dashboard's word for word:
    // both surfaces name the same four things, and `kindLabel` is what a detail
    // view would render.
    describe('kindLabel', () => {
        it.each([
            ['mesh', 'mesh', 'API Mesh'],
            ['catalog', 'catalog', 'Pre-built'],
            ['blank', 'blank', 'Custom · blank starter'],
            ['custom', 'custom', 'Imported repo'],
        ])('labels a %s row', (_name, kind, expected) => {
            const [card] = toIntegrationCards([row({ kind: kind as IntegrationRow['kind'] })]);

            expect(card.kindLabel).toBe(expected);
        });

        it('never emits the raw kind enum', () => {
            for (const kind of ['mesh', 'catalog', 'blank', 'custom'] as const) {
                const [card] = toIntegrationCards([row({ kind })]);
                expect(card.kindLabel).not.toBe(kind);
            }
        });

        // The dashboard refuses to call a blank starter "built with AI" — it is an
        // empty shell you build out later, and the other wording described the
        // intended workflow as though it had happened (reported 2026-07-31). The
        // wizard must not reintroduce it on the same concept.
        it('does not claim a blank starter was built with AI', () => {
            const [card] = toIntegrationCards([row({ kind: 'blank' })]);

            expect(card.kindLabel).not.toMatch(/built with ai/i);
        });
    });

    describe('flags', () => {
        it('marks only the mesh row as mesh', () => {
            const [mesh] = toIntegrationCards([row({ kind: 'mesh' })]);
            const [custom] = toIntegrationCards([row({ kind: 'custom' })]);

            expect(mesh.isMesh).toBe(true);
            expect(custom.isMesh).toBe(false);
        });

        it('allows rename only where the row says so', () => {
            const [renamable] = toIntegrationCards([row({ renamable: true })]);
            const [plain] = toIntegrationCards([row()]);

            expect(renamable.canRename).toBe(true);
            expect(plain.canRename).toBe(false);
        });

        it('marks AI-built instances so the subline can read as prose, not a repo', () => {
            const [ai] = toIntegrationCards([row({ kind: 'blank' })]);
            const [imported] = toIntegrationCards([row({ kind: 'custom' })]);

            expect(ai.sourceIsAi).toBe(true);
            expect(imported.sourceIsAi).toBe(false);
        });
    });
});

describe('sublineFor', () => {
    // The count replaces the row's collapsible "APIs in use · N" list. Losing the
    // count would be a regression — it is the only pre-build signal that an
    // integration will provision anything. Losing the expanded NAMES is not: the
    // kebab's Manage APIs opens the picker, which lists them.
    it('joins the source line and the API count', () => {
        expect(sublineFor(toIntegrationCards([row()])[0])).toBe(
            'Custom integration · acme/erp-sync · 2 APIs',
        );
    });

    it('singularises a lone API', () => {
        expect(sublineFor(toIntegrationCards([row({ apis: ['AdobeIOManagementAPISDK'] })])[0])).toBe(
            'Custom integration · acme/erp-sync · 1 API',
        );
    });

    it('drops the source segment when the row has none', () => {
        expect(sublineFor(toIntegrationCards([row({ sourceLine: '' })])[0])).toBe('2 APIs');
    });

    // Every row carries at least the baseline (integrationRows.apiCodesFor), so
    // this is unreachable from the resolver — pinned so the helper degrades
    // honestly rather than printing "0 APIs" if that ever changes.
    it('drops the API segment when there are none', () => {
        expect(sublineFor(toIntegrationCards([row({ apis: [] })])[0])).toBe(
            'Custom integration · acme/erp-sync',
        );
    });
});
