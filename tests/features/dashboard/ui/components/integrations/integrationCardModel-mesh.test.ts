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
    barActionIds,
    buildIntegrationCards,
    deriveMeshCard,
    display,
    FAKE_CATALOG,
    integration,
    MESH_STATUSES,
    meshEntry,
    type IdentifiedAppBuilderComponent,
} from './integrationCardModel.testUtils';

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
    it('checking: neutral dot, NO face, EMPTY bar', () => {
        const model = deriveMeshCard(display({ color: 'gray', text: 'Checking…' }), 'checking', meshEntry(), false);

        expect(model.status).toBe('checking');
        expect(model.dotVariant).toBe('neutral');
        expect(model.faceAction).toBeUndefined();
        expect(model.barActions).toEqual([]);
    });

    it('undefined status behaves as checking (unresolved)', () => {
        const model = deriveMeshCard(display({ color: 'gray', text: 'Checking…' }), undefined, undefined, false);

        expect(model.status).toBe('checking');
        expect(model.faceAction).toBeUndefined();
        expect(model.barActions).toEqual([]);
    });

    it('needs-auth: warning dot, Sign in face + Sign in(primary) bar', () => {
        const model = deriveMeshCard(
            display({ color: 'orange', text: 'Session expired' }),
            'needs-auth',
            meshEntry(),
            false,
        );

        expect(model.status).toBe('needs-auth');
        expect(model.dotVariant).toBe('warning');
        expect(model.faceAction).toEqual({ kind: 'sign-in', disabled: false });
        expect(model.barActions).toEqual([
            { action: 'sign-in', label: 'Sign in', emphasis: 'primary', disabled: false },
        ]);
    });

    it('not-deployed: neutral dot, Deploy face + Deploy(primary) bar', () => {
        const model = deriveMeshCard(
            display({ color: 'gray', text: 'Not deployed' }),
            'not-deployed',
            undefined,
            false,
        );

        expect(model.status).toBe('not-deployed');
        expect(model.dotVariant).toBe('neutral');
        expect(model.faceAction).toEqual({ kind: 'deploy', disabled: false });
        expect(model.barActions).toEqual([
            { action: 'deploy', label: 'Deploy', emphasis: 'primary', disabled: false },
        ]);
    });

    it('deploying: info dot, NO face, EMPTY bar (pulse rides the status)', () => {
        const model = deriveMeshCard(
            display({ color: 'blue', text: 'Deploying mesh…' }),
            'deploying',
            meshEntry(),
            true,
        );

        expect(model.status).toBe('deploying');
        expect(model.dotVariant).toBe('info');
        expect(model.faceAction).toBeUndefined();
        expect(model.barActions).toEqual([]);
    });

    it('deployed: success dot, NO Open face (GraphQL endpoint is not browsable — deliberate prototype deviation), Redeploy(secondary) bar', () => {
        const model = deriveMeshCard(display(), 'deployed', meshEntry(), false);

        expect(model.status).toBe('deployed');
        expect(model.dotVariant).toBe('success');
        expect(model.faceAction).toBeUndefined();
        expect(model.barActions).toEqual([
            { action: 'redeploy', label: 'Redeploy', emphasis: 'secondary', disabled: false },
        ]);
    });

    it.each(['config-changed', 'update-declined', 'config-incomplete'] as const)(
        '%s maps to the stale treatment: warning dot, Update face + Update(primary) bar',
        (meshStatus) => {
            const model = deriveMeshCard(
                display({ color: 'yellow', text: 'Update available' }),
                meshStatus,
                meshEntry(),
                false,
            );

            expect(model.status).toBe('stale');
            expect(model.dotVariant).toBe('warning');
            expect(model.faceAction).toEqual({ kind: 'update', disabled: false });
            expect(model.barActions).toEqual([
                { action: 'update', label: 'Update', emphasis: 'primary', disabled: false },
            ]);
        },
    );

    it('error: error dot, Retry face + Retry(primary) bar', () => {
        const model = deriveMeshCard(
            display({ color: 'red', text: 'Deployment failed' }),
            'error',
            meshEntry(),
            false,
        );

        expect(model.status).toBe('error');
        expect(model.dotVariant).toBe('error');
        expect(model.faceAction).toEqual({ kind: 'retry', disabled: false });
        expect(model.barActions).toEqual([
            { action: 'retry', label: 'Retry', emphasis: 'primary', disabled: false },
        ]);
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

    // No menu on the mesh: nothing about it is user-editable (no rename, no
    // API picks of its own).
    it('carries an EMPTY menu in any mesh status', () => {
        for (const status of MESH_STATUSES) {
            expect(deriveMeshCard(display(), status, meshEntry(), false).menuActions).toEqual([]);
        }
    });

    it('statusLabel is ALWAYS statusDisplay.text (the live vocabulary is unchanged)', () => {
        for (const status of MESH_STATUSES) {
            const model = deriveMeshCard(
                display({ text: 'The live text' }),
                status,
                meshEntry(),
                false,
            );
            expect(model.statusLabel).toBe('The live text');
        }
    });

    it('NO Manage APIs and NO Remove in ANY mesh status', () => {
        for (const status of MESH_STATUSES) {
            const model = deriveMeshCard(display(), status, meshEntry(), false);
            expect(barActionIds(model)).not.toContain('manage-apis');
            expect(barActionIds(model)).not.toContain('remove');
        }
    });

    it('isActionDisabled true propagates to EVERY bar action and face action', () => {
        for (const status of MESH_STATUSES) {
            const model = deriveMeshCard(display(), status, meshEntry(), true);
            for (const action of model.barActions) {
                expect(action.disabled).toBe(true);
            }
            if (model.faceAction && model.faceAction.kind !== 'open') {
                expect(model.faceAction.disabled).toBe(true);
            }
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
