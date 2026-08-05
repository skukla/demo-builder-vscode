/**
 * integrationCardModel Tests — deriveMeshCard + buildIntegrationCards
 * (integrations grid, Step 2)
 *
 * The mesh-peer-card half of the pure derivation module: the full mesh status
 * matrix (config drift collapsing to `stale`, no Manage APIs / Remove anywhere,
 * no Open↗ face on a deployed mesh), the mesh's fixed identity plus disabled
 * propagation, and grid assembly — one card per integration entry with its OWN
 * override, plus pending-card synthesis for an unknown-id `deploying` push.
 *
 * deriveIntegrationCard lives in integrationCardModel.test.ts; the
 * catalog-loader fake and the fixtures in integrationCardModel.testUtils.ts.
 */

import {
    buildIntegrationCards,
    deriveMeshCard,
    display,
    FAKE_CATALOG,
    integration,
    MESH_STATUSES,
    meshEntry,
    type IdentifiedAppBuilderComponent,
} from './integrationCardModel.testUtils';
import type { MeshStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';

// ---------------------------------------------------------------------------
// deriveMeshCard — mesh matrix
// ---------------------------------------------------------------------------
describe('deriveMeshCard — failure reason', () => {
    // The mesh card is the one that showed MESH ERROR for two days with nothing
    // to explain it. Its status LABEL is the live statusDisplay text; the reason
    // comes off the persisted entry.
    it('surfaces the persisted reason on an errored mesh', () => {
        const model = deriveMeshCard(
            display({ color: 'red', text: 'Mesh Error' }),
            'error',
            meshEntry({ status: 'error', error: 'invalid org/project/workspace combination' }),
            false,
        );

        expect(model.message).toBe('invalid org/project/workspace combination');
    });

    it('does not show a stale reason on a healthy mesh', () => {
        const model = deriveMeshCard(
            display(),
            'deployed',
            meshEntry({ status: 'deployed', error: 'a failure since fixed' }),
            false,
        );

        expect(model.message).toBeUndefined();
    });
});

describe('deriveMeshCard — status matrix', () => {
    it('checking: neutral dot, NO menu', () => {
        const model = deriveMeshCard(display({ color: 'gray', text: 'Checking…' }), 'checking', meshEntry(), false);

        expect(model.status).toBe('checking');
        expect(model.dotVariant).toBe('neutral');
        expect(model.menuActions).toEqual([]);
    });

    it('undefined status behaves as checking (unresolved)', () => {
        const model = deriveMeshCard(display({ color: 'gray', text: 'Checking…' }), undefined, undefined, false);

        expect(model.status).toBe('checking');
        expect(model.menuActions).toEqual([]);
    });

    it('needs-auth: warning dot, Sign in LEADS the menu', () => {
        const model = deriveMeshCard(
            display({ color: 'orange', text: 'Session expired' }),
            'needs-auth',
            meshEntry(),
            false,
        );

        expect(model.status).toBe('needs-auth');
        expect(model.dotVariant).toBe('warning');
        expect(model.menuActions[0]).toBe('sign-in');
    });

    it('not-deployed: neutral dot, Deploy LEADS the menu', () => {
        const model = deriveMeshCard(
            display({ color: 'gray', text: 'Not deployed' }),
            'not-deployed',
            undefined,
            false,
        );

        expect(model.status).toBe('not-deployed');
        expect(model.dotVariant).toBe('neutral');
        expect(model.menuActions[0]).toBe('deploy');
    });

    it('deploying: info dot, NO menu (pulse rides the status)', () => {
        const model = deriveMeshCard(
            display({ color: 'blue', text: 'Deploying mesh…' }),
            'deploying',
            meshEntry(),
            true,
        );

        expect(model.status).toBe('deploying');
        expect(model.dotVariant).toBe('info');
        expect(model.menuActions).toEqual([]);
    });

    it('deployed: success dot, NO Open (a GraphQL endpoint is not browsable), Redeploy in the MENU', () => {
        const model = deriveMeshCard(display(), 'deployed', meshEntry(), false);

        expect(model.status).toBe('deployed');
        expect(model.dotVariant).toBe('success');
        expect(model.menuActions).not.toContain('open');
        // Redeploy has to live somewhere once the flyout's button bar is gone,
        // and redeploying a working mesh is deliberate — so, the kebab.
        expect(model.menuActions).toEqual(['redeploy']);
    });

    // Remove needs a real keyed id: removeAppBuilderComponent looks the entry up,
    // so offering the verb without one would confirm a guaranteed "not found".
    it('offers Remove only once a real mesh component exists to tear down', () => {
        const withComponent = deriveMeshCard(
            display(),
            'deployed',
            meshEntry(),
            false,
            'eds-accs-mesh',
        );
        const withoutComponent = deriveMeshCard(display(), 'deployed', meshEntry(), false);

        expect(withComponent.menuActions).toEqual(['redeploy', 'remove']);
        expect(withComponent.componentId).toBe('eds-accs-mesh');
        expect(withoutComponent.menuActions).toEqual(['redeploy']);
        expect(withoutComponent.componentId).toBeUndefined();
    });

    it('withholds Redeploy while a mesh/demo operation is in flight', () => {
        const model = deriveMeshCard(display(), 'deployed', meshEntry(), true);

        // An action you cannot take is not offered. The bar used to render it
        // disabled; a menu item has no disabled state, so it is simply absent.
        expect(model.menuActions).toEqual([]);
    });

    it.each(['config-changed', 'update-declined'] as const)(
        '%s collapses to stale: warning dot, Update leads the menu',
        (meshStatus) => {
            const model = deriveMeshCard(
                display({ color: 'yellow', text: 'Update available' }),
                meshStatus,
                meshEntry(),
                false,
            );

            expect(model.status).toBe('stale');
            expect(model.dotVariant).toBe('warning');
            expect(model.menuActions[0]).toBe('update');
        },
    );

    // config-incomplete used to collapse into 'stale' with the other two. It no
    // longer does, and the reason is the label: once the card takes its label from
    // the same table as its dot, collapsing would have relabelled an incomplete
    // mesh "Update available" — which is not what missing required config means.
    // Its TREATMENT is deliberately unchanged (warning dot, Update leads); only
    // the status it keeps, and therefore the word it shows, is different.
    it('config-incomplete keeps its own status and label, with the stale treatment', () => {
        const model = deriveMeshCard(
            display({ color: 'orange', text: 'ignored — settled states read the table' }),
            'config-incomplete',
            meshEntry(),
            false,
        );

        expect(model.status).toBe('config-incomplete');
        expect(model.statusLabel).toBe('Incomplete');
        expect(model.dotVariant).toBe('warning');
        expect(model.menuActions[0]).toBe('update');
    });

    it('error: error dot, Retry LEADS the menu', () => {
        const model = deriveMeshCard(
            display({ color: 'red', text: 'Deployment failed' }),
            'error',
            meshEntry(),
            false,
        );

        expect(model.status).toBe('error');
        expect(model.dotVariant).toBe('error');
        expect(model.menuActions[0]).toBe('retry');
    });
});

describe('deriveMeshCard — identity + propagation', () => {
    it('fixed identity: id "mesh", isMesh, "API Mesh" name + kindLabel, NO source line, never renamable', () => {
        const model = deriveMeshCard(display(), 'deployed', meshEntry(), false);

        expect(model.id).toBe('mesh');
        expect(model.isMesh).toBe(true);
        expect(model.name).toBe('API Mesh');
        expect(model.kindLabel).toBe('API Mesh');
        expect(model.sourceIsAi).toBe(false);
        expect(model.canRename).toBe(false);
    });

    // The slot used to hold 'GraphQL bridge · Adobe I/O': a constant, identical on
    // every project in every state, typeset in the mono reserved for `owner/repo`
    // identifiers you can go look up. The mesh has no source repo, so it carries
    // no line rather than a placeholder standing in for one.
    it('carries NO sourceLine in any mesh status', () => {
        for (const status of MESH_STATUSES) {
            expect(
                deriveMeshCard(display(), status, meshEntry(), false).sourceLine
            ).toBeUndefined();
        }
    });

    // The mesh menu is the SAME shape as an integration's, minus the two items a
    // mesh does not have: 'open' (its endpoint answers POSTs, so it is copy-not-
    // browse) and 'manage-apis' (it has no API picks of its own).
    it('carries the status verb, and Redeploy only where there is a deployment to redo', () => {
        for (const status of MESH_STATUSES) {
            const model = deriveMeshCard(display(), status, meshEntry(), false);
            if (model.status === 'deploying' || model.status === 'checking') {
                expect(model.menuActions).toEqual([]);
            } else if (model.status === 'deployed') {
                expect(model.menuActions).toEqual(['redeploy']);
            } else {
                // deploy / update / retry / sign-in — one verb, never two.
                expect(model.menuActions).toHaveLength(1);
                expect(model.menuActions).not.toContain('redeploy');
            }
        }
    });

    // The live text used to win for EVERY status, which is how the mesh card came
    // to take its label from one table and its dot from another. Now it wins only
    // where it carries something a table cannot hold: the deploy step in flight,
    // and the two dashboard-only states. Every settled status reads the shared
    // table, so a mesh card and its integration peers cannot describe one state
    // two different ways.
    // `undefined` is here because toMeshCardStatus maps a missing status to
    // 'checking' — the card is still working out what it is looking at.
    const TRANSIENT: (MeshStatus | undefined)[] = [
        'checking',
        'needs-auth',
        'deploying',
        undefined,
    ];

    it('statusLabel is the live text while transient', () => {
        for (const status of MESH_STATUSES.filter((s) => TRANSIENT.includes(s))) {
            const model = deriveMeshCard(
                display({ text: 'The live text' }),
                status,
                meshEntry(),
                false,
            );
            expect(model.statusLabel).toBe('The live text');
        }
    });

    it('statusLabel ignores the live text once settled, reading the shared table', () => {
        for (const status of MESH_STATUSES.filter((s) => !TRANSIENT.includes(s))) {
            const model = deriveMeshCard(
                display({ text: 'The live text' }),
                status,
                meshEntry(),
                false,
            );
            expect(model.statusLabel).not.toBe('The live text');
            expect(model.statusLabel).toBeTruthy();
        }
    });

    it('NO Manage APIs and NO Remove in ANY mesh status', () => {
        for (const status of MESH_STATUSES) {
            const model = deriveMeshCard(display(), status, meshEntry(), false);
            expect(model.menuActions).not.toContain('manage-apis');
            expect(model.menuActions).not.toContain('remove');
        }
    });

    it('isActionDisabled true empties the menu', () => {
        for (const status of MESH_STATUSES) {
            const model = deriveMeshCard(display(), status, meshEntry(), true);
            // A menu item has no disabled state, so an unavailable action is
            // withheld rather than shown greyed.
            expect(model.menuActions).toEqual([]);
        }
    });

    it('endpoint rides url with the "Endpoint" label; lastDeployed comes from the mesh entry', () => {
        const iso = '2026-07-15T14:04:00.000Z';
        const model = deriveMeshCard(
            display(),
            'deployed',
            meshEntry({ lastDeployed: iso }),
            false,
        );

        expect(model.url).toBe('https://graph.adobe.io/api/demo/graphql');
        expect(model.urlLabel).toBe('Endpoint');
        expect(model.lastDeployed).toBe(new Date(iso).toLocaleString());
    });

    it('no mesh entry: url and lastDeployed are undefined', () => {
        const model = deriveMeshCard(
            display({ color: 'gray', text: 'Not deployed' }),
            'not-deployed',
            undefined,
            false,
        );
        expect(model.url).toBeUndefined();
        expect(model.lastDeployed).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// buildIntegrationCards — list assembly + pending-card synthesis
// ---------------------------------------------------------------------------
describe('buildIntegrationCards', () => {
    it('derives one card per integration entry, applying its OWN override only', () => {
        const components = [
            integration({ id: 'erp-sync', status: 'deployed' }),
            integration({ id: 'crm-sync', status: 'deployed', source: { owner: 'acme', repo: 'crm' } }),
        ];
        const cards = buildIntegrationCards(components, {
            'erp-sync': { status: 'deploying', message: 'Deploying erp-sync…' },
        });

        expect(cards).toHaveLength(2);
        expect(cards[0]).toMatchObject({ id: 'erp-sync', status: 'deploying' });
        expect(cards[1]).toMatchObject({ id: 'crm-sync', status: 'deployed' });
    });

    it('excludes non-integration kinds (the mesh card is derived separately)', () => {
        const meshComponent: IdentifiedAppBuilderComponent = {
            id: 'mesh',
            ...meshEntry(),
        };
        const cards = buildIntegrationCards([meshComponent, integration()], {});

        expect(cards).toHaveLength(1);
        expect(cards[0].id).toBe('erp-sync');
    });

    // REGRESSION (2026-08-04, live): removing a mesh showed TWO cards — the
    // derived peer card ("API Mesh — MESH DEPLOYED") beside a synthesized one
    // ("EDS ACCS API Mesh — REMOVING MESH"). `knownIds` is built from the
    // INTEGRATIONS only, so the mesh's own id is absent from it, and the row
    // status the operation pushes for that id reads as an unknown-id deploying
    // override — the one case that synthesizes a card. The mesh is already
    // represented; the caller says so by naming the id its mesh card covers.
    it('does not synthesize a second card for the id the mesh card already covers', () => {
        const cards = buildIntegrationCards(
            [{ id: 'eds-accs-mesh', ...meshEntry() }],
            { 'eds-accs-mesh': { status: 'deploying', message: 'Removing Mesh' } },
            undefined,
            'eds-accs-mesh',
        );

        expect(cards).toEqual([]);
    });

    // The add case, which is why the synthesis cannot simply be dropped for
    // mesh ids: with no mesh deployed there is no derived card to carry the
    // progress, so the synthesized one is the ONLY feedback. The caller passes
    // no covered id then.
    it('still synthesizes for a mesh id when no mesh card is rendered', () => {
        const cards = buildIntegrationCards(
            [],
            { 'eds-accs-mesh': { status: 'deploying', message: 'Adding Mesh' } },
            undefined,
            undefined,
        );

        expect(cards).toHaveLength(1);
        expect(cards[0].id).toBe('eds-accs-mesh');
    });

    it('synthesizes a pending card for an unknown-id deploying override (catalog name + source)', () => {
        const catalog = [FAKE_CATALOG['sfdc-connector']];
        const cards = buildIntegrationCards([], { 'sfdc-connector': { status: 'deploying' } }, catalog);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            id: 'sfdc-connector',
            name: 'Salesforce CRM',
            status: 'deploying',
            sourceLine: 'adobe/sfdc-connector',
            canRename: false,
        });
    });

    it('pending card falls back to the bundled catalog lookup when no catalog list is passed', () => {
        const cards = buildIntegrationCards([], { 'sfdc-connector': { status: 'deploying' } });

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({ id: 'sfdc-connector', name: 'Salesforce CRM' });
    });

    it('pending card for a fully unknown id: id as name, "—" source line, not renamable', () => {
        const cards = buildIntegrationCards([], { 'acme-erp-sync': { status: 'deploying' } });

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            id: 'acme-erp-sync',
            name: 'acme-erp-sync',
            status: 'deploying',
            sourceLine: '—',
            canRename: false,
        });
    });

    it('ignores terminal-status orphan overrides (removed cards must not resurrect)', () => {
        const cards = buildIntegrationCards([], {
            gone: { status: 'deployed' },
            failed: { status: 'error' },
        });
        expect(cards).toEqual([]);
    });

    it('a known-id deploying override merges into its card instead of synthesizing a duplicate', () => {
        const cards = buildIntegrationCards([integration({ id: 'erp-sync' })], {
            'erp-sync': { status: 'deploying' },
        });

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({ id: 'erp-sync', status: 'deploying' });
    });
});
