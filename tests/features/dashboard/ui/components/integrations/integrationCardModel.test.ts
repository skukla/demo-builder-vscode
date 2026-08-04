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
// Failure reason (persisted, survives a reload)
// ---------------------------------------------------------------------------
describe('deriveIntegrationCard — failure reason', () => {
    // REGRESSION: `message` came ONLY from the live status override, which the
    // extension pushes during a deploy. Reopen the panel — or reload the window —
    // and the override is gone, so an errored card said "Deploy failed" and could
    // not say why. The reason is now persisted on the entry, so the drawer can
    // still answer the question tomorrow.
    it('surfaces the persisted reason when there is no live override', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'error', error: 'invalid org/project/workspace combination' }),
        );

        expect(model.message).toBe('invalid org/project/workspace combination');
    });

    it('lets a live override win — an in-flight deploy is fresher than the record', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'error', error: 'yesterday' }),
            { status: 'error', message: 'right now' },
        );

        expect(model.message).toBe('right now');
    });

    it('does not show a stale reason on a card that is no longer failing', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'deployed', error: 'a failure since fixed' }),
        );

        expect(model.message).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// deriveIntegrationCard — status matrix
// ---------------------------------------------------------------------------
describe('deriveIntegrationCard — status matrix', () => {
    it('not-deployed: neutral dot, "Not deployed", Deploy LEADS the menu', () => {
        const model = deriveIntegrationCard(integration({ status: 'not-deployed' }));

        expect(model.status).toBe('not-deployed');
        expect(model.dotVariant).toBe('neutral');
        expect(model.statusLabel).toBe('Not deployed');
        // The status verb is a kebab item like every other verb, and it leads:
        // on a card that needs something, that something is the first item.
        expect(model.menuActions).toEqual(['deploy', 'manage-apis', 'remove']);
    });

    // REGRESSION: the live step text used to land ONLY on `message`, which the
    // card FACE never renders (it prints `statusLabel`, IntegrationCard.tsx:181)
    // — so a deploying integration card sat on a constant "Deploying…" while the
    // steps went to a drawer nobody has open during a deploy. Harmless while the
    // progress notification also carried them; a silent regression the moment it
    // stopped. The mesh card never had this problem: its statusLabel IS the live
    // text. Both card kinds now behave the same way.
    it('deploying: info dot, the LIVE STEP as the label, NO face, NO menu', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'not-deployed' }),
            { status: 'deploying', message: 'Deploying erp-sync…' },
        );

        expect(model.status).toBe('deploying');
        expect(model.dotVariant).toBe('info');
        expect(model.statusLabel).toBe('Deploying erp-sync…');
        // NOT also on `message`: the drawer prints label AND message, so leaving
        // both set would print the same step twice in the flyout.
        expect(model.message).toBeUndefined();
        // Nothing is offered mid-deploy: every item would race the runner.
        expect(model.menuActions).toEqual([]);
    });

    it('deploying with no step reported yet: falls back to the static label', () => {
        const model = deriveIntegrationCard(integration(), { status: 'deploying' });

        expect(model.statusLabel).toBe('Deploying…');
    });

    // Deliberately NOT promoted to the label: a failure reason is a full CLI
    // sentence and would blow out an 11px uppercase card face. The face says
    // "Deploy failed"; the reason stays in the drawer.
    it('error: keeps the reason on message and the terse label on the face', () => {
        const model = deriveIntegrationCard(
            integration({
                status: 'error',
                error: 'The specified organization, project, and workspace combination is invalid',
            }),
        );

        expect(model.statusLabel).toBe('Deploy failed');
        expect(model.message).toBe(
            'The specified organization, project, and workspace combination is invalid'
        );
    });

    it('deployed (with url): success dot, "Deployed", NO face, Open leads the menu', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'deployed', url: 'https://245bce.adobeio-static.net' }),
        );

        expect(model.status).toBe('deployed');
        expect(model.dotVariant).toBe('success');
        expect(model.statusLabel).toBe('Deployed');
        // A healthy card asks for nothing, so its menu carries no status verb —
        // just the deliberate actions. Redeploy appears here and only here:
        // there has to be a deployment before redoing one means anything.
        expect(model.menuActions).toEqual(['open', 'redeploy', 'manage-apis', 'remove']);
    });

    // Verify was REMOVED (2026-08-03). It never verified the integration: the
    // handler called getOrganizationsSdkOnly() and posted 'deployed' if the token
    // could list ANY org, so a deleted integration verified green and a genuinely
    // failed card flipped to Deployed until the next reload. The org-reachability
    // question it actually answered is already covered by the deploy guards and
    // the org-mismatch detection.
    // No url ⇒ no Open. The other three still stand, so the kebab renders.
    it('deployed WITHOUT any url: menu drops Open, keeps the rest', () => {
        const model = deriveIntegrationCard(integration({ status: 'deployed' }));

        expect(model.url).toBeUndefined();
        expect(model.menuActions).toEqual(['redeploy', 'manage-apis', 'remove']);
    });

    it('stale: warning dot, "Update available", Update LEADS the menu', () => {
        const model = deriveIntegrationCard(integration({ status: 'stale' }));

        expect(model.status).toBe('stale');
        expect(model.dotVariant).toBe('warning');
        expect(model.statusLabel).toBe('Update available');
        // No Redeploy beside it: Update IS the redeploy here, and two names for
        // one intent in one menu is what this whole change removed.
        expect(model.menuActions).toEqual(['update', 'manage-apis', 'remove']);
    });

    it('error: error dot, "Deploy failed", Retry face, Manage APIs·Remove menu', () => {
        const model = deriveIntegrationCard(
            integration({ status: 'error' }),
            { status: 'error', message: 'aio deploy failed' },
        );

        expect(model.status).toBe('error');
        expect(model.dotVariant).toBe('error');
        expect(model.statusLabel).toBe('Deploy failed');
        expect(model.message).toBe('aio deploy failed');
        expect(model.menuActions).toEqual(['retry', 'manage-apis', 'remove']);
    });

    it('stale is DISTINCT from deployed (dot, label, menu verb)', () => {
        const stale = deriveIntegrationCard(integration({ status: 'stale' }));
        const deployed = deriveIntegrationCard(integration({ status: 'deployed' }));

        expect(stale.dotVariant).not.toBe(deployed.dotVariant);
        expect(stale.statusLabel).not.toBe(deployed.statusLabel);
        // Each carries the redeploy under the name its state earns, never both.
        expect(stale.menuActions).toContain('update');
        expect(stale.menuActions).not.toContain('redeploy');
        expect(deployed.menuActions).toContain('redeploy');
        expect(deployed.menuActions).not.toContain('update');
    });

    it('Remove is present on every status EXCEPT deploying', () => {
        for (const status of INTEGRATION_STATUSES) {
            const model = deriveIntegrationCard(integration({ status: 'not-deployed' }), {
                status,
            });
            if (status === 'deploying') {
                expect(model.menuActions).not.toContain('remove');
            } else {
                expect(model.menuActions).toContain('remove');
            }
        }
    });

    it('Manage APIs is present on not-deployed/deployed/stale/error (workspace-scoped, pre-deploy included)', () => {
        for (const status of INTEGRATION_STATUSES) {
            const model = deriveIntegrationCard(integration({ status: 'not-deployed' }), {
                status,
            });
            const expected = status !== 'deploying';
            expect(model.menuActions.includes('manage-apis')).toBe(expected);
        }
    });

    it('an unknown live status falls back to the not-deployed treatment (never crashes the grid)', () => {
        const model = deriveIntegrationCard(integration(), { status: 'garbage-status' });
        expect(model.status).toBe('not-deployed');
        expect(model.statusLabel).toBe('Not deployed');
    });
});

// ---------------------------------------------------------------------------
// NO face affordance — the calm-card invariant, both producers, every status
// ---------------------------------------------------------------------------
describe('no face affordance — every verb is a menu item', () => {
    // Spectrum deprecated the card-face button ("Don't use quick actions"): a
    // button on a card that is itself clickable presents conflicting nested
    // actions. Neither producer may reintroduce one.
    it('integration cards: no faceAction on ANY status', () => {
        for (const status of INTEGRATION_STATUSES) {
            const model = deriveIntegrationCard(
                integration({ status: 'not-deployed', url: 'https://a.example' }),
                { status },
            );
            expect('faceAction' in model).toBe(false);
        }
    });

    it('mesh cards: no faceAction on ANY mesh status', () => {
        for (const status of MESH_STATUSES) {
            const model = deriveMeshCard(display(), status, meshEntry(), false);
            expect('faceAction' in model).toBe(false);
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

    // The override message still reaches the card — as the LABEL, which is the
    // only status text the card face renders. It used to land on `message`, where
    // nothing on the face read it.
    it('passes the override message through as the status label while deploying', () => {
        const model = deriveIntegrationCard(integration(), {
            status: 'deploying',
            message: 'Installing dependencies…',
        });
        expect(model.statusLabel).toBe('Installing dependencies…');
        expect(model.message).toBeUndefined();
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

    it('blank-source match: "Custom · blank starter" + a build-it-out caption', () => {
        const model = deriveIntegrationCard(
            integration({
                id: 'my-firefly-gen',
                name: 'Firefly Image Gen',
                source: { owner: 'skukla', repo: 'app-builder-shell' },
            }),
        );

        expect(model.kindLabel).toBe('Custom · blank starter');
        // NOT "built with AI" — the shell is empty until the user builds it.
        expect(model.sourceLine).toBe('Blank starter — build it out');
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
    // The card menu, which is what makes API access reachable from the grid
    // without opening the flyout first. Rename is NOT here — it is the name's
    // own inline pencil, matching ProjectCard.
    describe('menuActions', () => {
        it.each([
            ['not-deployed', 'deploy'],
            ['stale', 'update'],
            ['error', 'retry'],
        ] as const)('leads with the status verb, then Manage APIs + Remove on %s', (status, verb) => {
            const model = deriveIntegrationCard(integration({ status }));
            expect(model.menuActions).toEqual([verb, 'manage-apis', 'remove']);
        });

        // Deployed is the exception: its deploy verb is not on the face (a healthy
        // card is calm), so Redeploy joins the menu.
        it('adds Redeploy on deployed', () => {
            const model = deriveIntegrationCard(integration({ status: 'deployed' }));
            expect(model.menuActions).toEqual(['redeploy', 'manage-apis', 'remove']);
        });

        // Both would race the runner: an API change mid-deploy fights the
        // subscribe, and a remove would delete files out from under it.
        it('offers NOTHING while deploying', () => {
            const model = deriveIntegrationCard(integration({ status: 'deploying' }));
            expect(model.menuActions).toEqual([]);
        });
    });
});
