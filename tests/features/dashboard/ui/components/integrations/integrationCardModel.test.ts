/**
 * integrationCardModel Tests — deriveIntegrationCard (integrations grid, Step 2)
 *
 * The keyed-integration half of the pure derivation module behind the dashboard
 * card grid + drawer: the full status matrix, the "at most ONE face affordance"
 * invariant, override precedence (ported from the retired list suite as pure
 * tests), kindLabel/canRename derivation, and url/lastDeployed resolution.
 *
 * deriveMeshCard and buildIntegrationCards live in
 * integrationCardModel-mesh.test.ts; the catalog-loader fake and the fixtures
 * in integrationCardModel.testUtils.ts.
 */

import {
    barActionIds,
    BLANK_SOURCE,
    deriveIntegrationCard,
    deriveMeshCard,
    display,
    INTEGRATION_STATUSES,
    integration,
    MESH_STATUSES,
    meshEntry,
    type RowStatusOverride,
} from './integrationCardModel.testUtils';

// ---------------------------------------------------------------------------
// deriveIntegrationCard — status matrix
// ---------------------------------------------------------------------------
describe('deriveIntegrationCard — status matrix', () => {
    it('not-deployed: neutral dot, "Not deployed", Deploy face, Deploy(primary)·Manage APIs·Remove(danger) bar', () => {
        const model = deriveIntegrationCard(integration({ status: 'not-deployed' }));

        expect(model.status).toBe('not-deployed');
        expect(model.dotVariant).toBe('neutral');
        expect(model.statusLabel).toBe('Not deployed');
        expect(model.faceAction).toEqual({ kind: 'deploy' });
        expect(model.barActions).toEqual([
            { action: 'deploy', label: 'Deploy', emphasis: 'primary' },
            { action: 'manage-apis', label: 'Manage APIs', emphasis: 'secondary' },
            { action: 'remove', label: 'Remove', emphasis: 'danger' },
        ]);
    });

    it('deploying: info dot, "Deploying…", NO face, EMPTY bar', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'not-deployed' }),
            { status: 'deploying', message: 'Deploying erp-sync…' },
        );

        expect(model.status).toBe('deploying');
        expect(model.dotVariant).toBe('info');
        expect(model.statusLabel).toBe('Deploying…');
        expect(model.message).toBe('Deploying erp-sync…');
        expect(model.faceAction).toBeUndefined();
        expect(model.barActions).toEqual([]);
    });

    it('deployed (with url): success dot, "Deployed", Open face, Redeploy·Verify·Manage APIs·Remove bar', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'deployed', url: 'https://245bce.adobeio-static.net' }),
        );

        expect(model.status).toBe('deployed');
        expect(model.dotVariant).toBe('success');
        expect(model.statusLabel).toBe('Deployed');
        expect(model.faceAction).toEqual({
            kind: 'open',
            url: 'https://245bce.adobeio-static.net',
        });
        expect(model.barActions).toEqual([
            { action: 'redeploy', label: 'Redeploy', emphasis: 'secondary' },
            { action: 'verify', label: 'Verify', emphasis: 'secondary' },
            { action: 'manage-apis', label: 'Manage APIs', emphasis: 'secondary' },
            { action: 'remove', label: 'Remove', emphasis: 'danger' },
        ]);
    });

    it('deployed WITHOUT any url: no face affordance at all', () => {
        const model = deriveIntegrationCard(integration({ status: 'deployed' }));
        expect(model.faceAction).toBeUndefined();
    });

    it('stale: warning dot, "Update available", Update face, Update(primary)·Verify·Manage APIs·Remove bar', () => {
        const model = deriveIntegrationCard(integration({ status: 'stale' }));

        expect(model.status).toBe('stale');
        expect(model.dotVariant).toBe('warning');
        expect(model.statusLabel).toBe('Update available');
        expect(model.faceAction).toEqual({ kind: 'update' });
        expect(model.barActions).toEqual([
            { action: 'update', label: 'Update', emphasis: 'primary' },
            { action: 'verify', label: 'Verify', emphasis: 'secondary' },
            { action: 'manage-apis', label: 'Manage APIs', emphasis: 'secondary' },
            { action: 'remove', label: 'Remove', emphasis: 'danger' },
        ]);
    });

    it('error: error dot, "Deploy failed", Retry face, Retry(primary)·Manage APIs·Remove bar', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'error' }),
            { status: 'error', message: 'aio deploy failed' },
        );

        expect(model.status).toBe('error');
        expect(model.dotVariant).toBe('error');
        expect(model.statusLabel).toBe('Deploy failed');
        expect(model.message).toBe('aio deploy failed');
        expect(model.faceAction).toEqual({ kind: 'retry' });
        expect(model.barActions).toEqual([
            { action: 'retry', label: 'Retry', emphasis: 'primary' },
            { action: 'manage-apis', label: 'Manage APIs', emphasis: 'secondary' },
            { action: 'remove', label: 'Remove', emphasis: 'danger' },
        ]);
    });

    it('stale is DISTINCT from deployed (dot, label, face, primary bar action)', () => {
        const stale = deriveIntegrationCard(integration({ status: 'stale' }));
        const deployed = deriveIntegrationCard(integration({ status: 'deployed' }));

        expect(stale.dotVariant).not.toBe(deployed.dotVariant);
        expect(stale.statusLabel).not.toBe(deployed.statusLabel);
        expect(stale.faceAction).toEqual({ kind: 'update' });
        expect(stale.barActions[0]).toEqual({
            action: 'update',
            label: 'Update',
            emphasis: 'primary',
        });
    });

    it('Remove(danger) is present on every status EXCEPT deploying', () => {
        for (const status of INTEGRATION_STATUSES) {
            const model = deriveIntegrationCard(integration({ status: 'not-deployed' }), {
                status,
            });
            const remove = model.barActions.find((a) => a.action === 'remove');
            if (status === 'deploying') {
                expect(remove).toBeUndefined();
            } else {
                expect(remove).toEqual({ action: 'remove', label: 'Remove', emphasis: 'danger' });
            }
        }
    });

    it('Manage APIs is present on not-deployed/deployed/stale/error (workspace-scoped, pre-deploy included)', () => {
        for (const status of INTEGRATION_STATUSES) {
            const model = deriveIntegrationCard(integration({ status: 'not-deployed' }), {
                status,
            });
            const expected = status !== 'deploying';
            expect(barActionIds(model).includes('manage-apis')).toBe(expected);
        }
    });

    it('an unknown live status falls back to the not-deployed treatment (never crashes the grid)', () => {
        const model = deriveIntegrationCard(integration(), { status: 'garbage-status' });
        expect(model.status).toBe('not-deployed');
        expect(model.statusLabel).toBe('Not deployed');
    });
});

// ---------------------------------------------------------------------------
// ≤1 face affordance — the calm-card invariant, both producers, every status
// ---------------------------------------------------------------------------
describe('at-most-one face affordance invariant', () => {
    it('integration cards: faceAction is a single object or undefined for EVERY status', () => {
        for (const status of INTEGRATION_STATUSES) {
            const model = deriveIntegrationCard(
                integration({ status: 'not-deployed', url: 'https://a.example' }),
                { status },
            );
            expect(Array.isArray(model.faceAction)).toBe(false);
            if (model.faceAction !== undefined) {
                expect(typeof model.faceAction.kind).toBe('string');
            }
        }
    });

    it('mesh cards: faceAction is a single object or undefined for EVERY mesh status', () => {
        for (const status of MESH_STATUSES) {
            const model = deriveMeshCard(display(), status, meshEntry(), false);
            expect(Array.isArray(model.faceAction)).toBe(false);
            if (model.faceAction !== undefined) {
                expect(typeof model.faceAction.kind).toBe('string');
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Override precedence — ported from AppBuilderComponentsList.test.tsx merge
// semantics (the hook's merged map feeds the model; the model applies it)
// ---------------------------------------------------------------------------
describe('deriveIntegrationCard — override precedence', () => {
    it('override.status wins over the persisted status', () => {
        const model = deriveIntegrationCard(integration({ status: 'deployed' }), {
            status: 'deploying',
        });
        expect(model.status).toBe('deploying');
    });

    it('no override: the persisted status and name render as seeded', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'deployed', name: 'Firefly Image Gen' }),
        );
        expect(model.status).toBe('deployed');
        expect(model.name).toBe('Firefly Image Gen');
    });

    it('applies an update-borne display name so a rename refreshes the card label live', () => {
        // Ported: the rename handler rides the per-id channel with the entry's
        // current status plus the new name — the seeded map never re-delivers.
        const model = deriveIntegrationCard(
            integration({ name: 'Firefly Image Gen' }),
            { status: 'deployed', name: 'Firefly Video Gen' },
        );
        expect(model.name).toBe('Firefly Video Gen');
    });

    it('keeps a RENAMED label when a later name-less push arrives (rename then redeploy)', () => {
        // Ported: deploy pushes omit `name`; the hook merges name-preserving
        // ({ name: name ?? prev.name }). The model must honor the merged
        // override's carried name over the stale seeded one.
        const afterRename: RowStatusOverride = { status: 'deployed', name: 'Firefly Video Gen' };
        const namelessPush = { status: 'deployed' as const, name: undefined };
        const merged: RowStatusOverride = {
            ...namelessPush,
            name: namelessPush.name ?? afterRename.name,
        };

        const model = deriveIntegrationCard(integration({ name: 'Firefly Image Gen' }), merged);
        expect(model.name).toBe('Firefly Video Gen');
    });

    it('a name-less override keeps the persisted display name (deploy pushes)', () => {
        const model = deriveIntegrationCard(
            integration({ name: 'Firefly Image Gen' }),
            { status: 'deployed' },
        );
        expect(model.name).toBe('Firefly Image Gen');
    });

    it('falls back to the id when neither override nor entry carries a name', () => {
        const model = deriveIntegrationCard(integration({ name: undefined }));
        expect(model.name).toBe('erp-sync');
    });

    it('passes the override message through (deploy progress / failure detail)', () => {
        const model = deriveIntegrationCard(integration(), {
            status: 'deploying',
            message: 'Installing dependencies…',
        });
        expect(model.message).toBe('Installing dependencies…');
    });

    it('message is undefined without an override', () => {
        const model = deriveIntegrationCard(integration());
        expect(model.message).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// kindLabel / AI caption / canRename
// ---------------------------------------------------------------------------
describe('deriveIntegrationCard — kindLabel + canRename', () => {
    it('catalog id hit: "Pre-built", apis from requiredApis, NOT renamable', () => {
        const model = deriveIntegrationCard(
            integration({
                id: 'sfdc-connector',
                source: { owner: 'adobe', repo: 'sfdc-connector' },
            }),
        );

        expect(model.kindLabel).toBe('Pre-built');
        expect(model.apis).toEqual(['I/O Management API', 'Campaign']);
        expect(model.sourceIsAi).toBe(false);
        expect(model.sourceLine).toBe('adobe/sfdc-connector');
        expect(model.canRename).toBe(false);
    });

    it('catalog id hit without requiredApis: apis is undefined', () => {
        const model = deriveIntegrationCard(
            integration({ id: 'no-apis-entry', source: { owner: 'adobe', repo: 'no-apis-entry' } }),
        );
        expect(model.apis).toBeUndefined();
    });

    it('blank-source match (AI-built instance): "Custom · built with AI" + "Built with AI" caption', () => {
        const model = deriveIntegrationCard(
            integration({
                id: 'my-firefly-gen',
                name: 'Firefly Image Gen',
                source: { owner: 'skukla', repo: 'app-builder-shell' },
            }),
        );

        expect(model.kindLabel).toBe('Custom · built with AI');
        expect(model.sourceLine).toBe('Built with AI');
        expect(model.sourceIsAi).toBe(true);
        expect(model.canRename).toBe(true);
    });

    it('fork mismatch: same repo under the WRONG owner is an Imported repo, not AI', () => {
        const model = deriveIntegrationCard(
            integration({ id: 'my-fork', source: { owner: 'acme', repo: 'app-builder-shell' } }),
        );

        expect(model.kindLabel).toBe('Imported repo');
        expect(model.sourceLine).toBe('acme/app-builder-shell');
        expect(model.sourceIsAi).toBe(false);
    });

    it('custom repo: "Imported repo" + mono owner/repo, renamable', () => {
        const model = deriveIntegrationCard(integration());

        expect(model.kindLabel).toBe('Imported repo');
        expect(model.sourceLine).toBe('acme/erp-sync');
        expect(model.sourceIsAi).toBe(false);
        expect(model.canRename).toBe(true);
    });

    it('catalog id wins over a blank source (id lookup precedes source match)', () => {
        const model = deriveIntegrationCard(
            integration({ id: 'app-builder-shell', source: BLANK_SOURCE }),
        );
        expect(model.kindLabel).toBe('Pre-built');
        expect(model.canRename).toBe(false);
    });

    it('an empty legacy source renders "—" instead of a bare slash', () => {
        const model = deriveIntegrationCard(
            integration({ id: 'legacy-app', source: { owner: '', repo: '' } }),
        );
        expect(model.sourceLine).toBe('—');
    });
});

// ---------------------------------------------------------------------------
// primaryUrl + urlLabel + lastDeployed
// ---------------------------------------------------------------------------
describe('deriveIntegrationCard — url + lastDeployed derivation', () => {
    it('prefers the primary url over deployedUrls', () => {
        const model = deriveIntegrationCard(
            integration({
                url: 'https://primary.example',
                deployedUrls: { app: 'https://other.example' },
            }),
        );
        expect(model.url).toBe('https://primary.example');
    });

    it('falls back to the FIRST deployedUrls value when url is absent', () => {
        const model = deriveIntegrationCard(
            integration({
                deployedUrls: { app: 'https://first.example', admin: 'https://second.example' },
            }),
        );
        expect(model.url).toBe('https://first.example');
        expect(model.deployedUrls).toEqual({
            app: 'https://first.example',
            admin: 'https://second.example',
        });
    });

    it('empty deployedUrls and no url: url is undefined, urlLabel still "App URL"', () => {
        const model = deriveIntegrationCard(integration({ deployedUrls: {} }));
        expect(model.url).toBeUndefined();
        expect(model.urlLabel).toBe('App URL');
    });

    it('identity fields: id, isMesh false, urlLabel "App URL"', () => {
        const model = deriveIntegrationCard(integration());
        expect(model.id).toBe('erp-sync');
        expect(model.isMesh).toBe(false);
        expect(model.urlLabel).toBe('App URL');
    });

    it('formats lastDeployed as a locale display string', () => {
        const iso = '2026-07-15T14:04:00.000Z';
        const model = deriveIntegrationCard(integration({ lastDeployed: iso }));
        expect(model.lastDeployed).toBe(new Date(iso).toLocaleString());
    });

    it('lastDeployed is undefined when absent', () => {
        const model = deriveIntegrationCard(integration());
        expect(model.lastDeployed).toBeUndefined();
    });

    it('lastDeployed is undefined when the persisted value is unparseable', () => {
        const model = deriveIntegrationCard(integration({ lastDeployed: 'not-a-date' }));
        expect(model.lastDeployed).toBeUndefined();
    });
});
