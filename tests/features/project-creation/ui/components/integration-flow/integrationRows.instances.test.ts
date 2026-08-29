/**
 * integrationRows — AI-built instance (shell-source discriminator) slice.
 *
 * Split from integrationRows.test.ts to keep both files under the eslint
 * max-lines limit. Covers the shell-source discriminator: a row is an AI-built
 * instance iff its source {owner, repo} matches the blank catalog entry's
 * source. Mesh/catalog/custom/ordering coverage lives in the sibling
 * integrationRows.test.ts; shared fixtures in integrationRows.testUtils.ts.
 */

import { resolveIntegrationRows } from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import type { IntegrationRow } from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import { BASELINE_CODE } from '@/features/project-creation/ui/components/integration-flow/apiAccessConstants';
import { state, MESH_ENTRY, ERP_ENTRY, BLANK_ENTRY, CATALOG } from './integrationRows.testUtils';

describe('resolveIntegrationRows — AI-built instances (shell-source discriminator)', () => {
    // The discriminator is the SOURCE REPO, not name presence: the keyed runner
    // writes `name` for EVERY integration (imports get name = repo), so after an
    // edit-mode round-trip a plain import also carries a name. A row is an
    // AI-built instance iff its source {owner, repo} matches the blank catalog
    // entry's source — hence these tests pass the catalog WITH the blank entry.
    const WITH_BLANK = [MESH_ENTRY, ERP_ENTRY, BLANK_ENTRY];

    /** A shell instance: a custom-URL source cloning the shell TEMPLATE repo. */
    const INSTANCE_SOURCE = {
        owner: 'skukla',
        repo: 'app-builder-shell',
        branch: 'main',
        name: 'Firefly Image Gen',
    };

    it('renders a shell-sourced record as an AI-built instance row (user name, blank kind, AI sourceLine)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['firefly-image-gen'],
                appBuilderComponentSources: { 'firefly-image-gen': INSTANCE_SOURCE },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows).toEqual([
            {
                id: 'firefly-image-gen',
                kind: 'blank',
                name: 'Firefly Image Gen',
                sourceLine: 'Custom integration · built with AI',
                needsSetup: true,
                apis: [BASELINE_CODE],
                renamable: true,
            } satisfies IntegrationRow,
        ]);
    });

    it('never leaks the template repo name into an instance row', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['firefly-image-gen'],
                appBuilderComponentSources: { 'firefly-image-gen': INSTANCE_SOURCE },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(JSON.stringify(rows)).not.toContain('app-builder-shell');
    });

    it('renders two named instances as two distinct rows, each with its own name', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['order-sync', 'firefly-image-gen'],
                appBuilderComponentSources: {
                    'order-sync': { ...INSTANCE_SOURCE, name: 'Order Sync' },
                    'firefly-image-gen': INSTANCE_SOURCE,
                },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows.map((r) => [r.id, r.name, r.kind])).toEqual([
            ['order-sync', 'Order Sync', 'blank'],
            ['firefly-image-gen', 'Firefly Image Gen', 'blank'],
        ]);
    });

    it('carries the API picks keyed under the instance id (baseline + free picks)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['firefly-image-gen'],
                appBuilderComponentSources: { 'firefly-image-gen': INSTANCE_SOURCE },
                selectedConsoleApis: { 'firefly-image-gen': ['FireflySDK'] },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows[0].apis).toEqual([BASELINE_CODE, 'FireflySDK']);
    });

    it('keeps custom-import rendering for an unnamed non-shell source beside an instance (pin)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['firefly-image-gen', 'acme-widget'],
                appBuilderComponentSources: {
                    'firefly-image-gen': INSTANCE_SOURCE,
                    'acme-widget': { owner: 'acme', repo: 'widget' },
                },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows.map((r) => [r.id, r.kind, r.name, r.sourceLine])).toEqual([
            [
                'firefly-image-gen',
                'blank',
                'Firefly Image Gen',
                'Custom integration · built with AI',
            ],
            ['acme-widget', 'custom', 'widget', 'Custom integration · acme/widget'],
        ]);
    });

    it('a NAMED non-shell import stays a custom row (edit round-trip regression: name = repo)', () => {
        // After the edit-mode round-trip the keyed map carries name for EVERY
        // integration (imports get name = repo). Name presence must NOT flip an
        // import to "built with AI" — only the shell template source does.
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: {
                    'acme-widget': { owner: 'acme', repo: 'widget', name: 'widget' },
                },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows).toEqual([
            {
                id: 'acme-widget',
                kind: 'custom',
                name: 'widget',
                sourceLine: 'Custom integration · acme/widget',
                needsSetup: true,
                apis: [BASELINE_CODE],
            } satisfies IntegrationRow,
        ]);
    });

    it('a named non-shell import displays its name but keeps the repo sourceLine', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: {
                    'acme-widget': { owner: 'acme', repo: 'widget', name: 'My Widget' },
                },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows).toEqual([
            expect.objectContaining({
                kind: 'custom',
                name: 'My Widget',
                sourceLine: 'Custom integration · acme/widget',
            }),
        ]);
    });

    it("a shell-sourced row stays an instance ('blank') even when its name equals the repo", () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['skukla-app-builder-shell'],
                appBuilderComponentSources: {
                    'skukla-app-builder-shell': {
                        owner: 'skukla',
                        repo: 'app-builder-shell',
                        name: 'app-builder-shell',
                    },
                },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows).toEqual([
            expect.objectContaining({
                kind: 'blank',
                sourceLine: 'Custom integration · built with AI',
            }),
        ]);
    });

    it('an UNNAMED shell-sourced record (shell imported via URL) classifies as an instance', () => {
        // The discriminator is the repo alone: importing the shell template via
        // the custom-URL door is still an AI-built starter, not a repo identity.
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['skukla-app-builder-shell'],
                appBuilderComponentSources: {
                    'skukla-app-builder-shell': { owner: 'skukla', repo: 'app-builder-shell' },
                },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows).toEqual([
            expect.objectContaining({
                kind: 'blank',
                name: 'app-builder-shell',
                sourceLine: 'Custom integration · built with AI',
            }),
        ]);
    });

    it('a same-repo source under a DIFFERENT owner is a plain import (owner+repo must both match)', () => {
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['fork'],
                appBuilderComponentSources: {
                    fork: { owner: 'someone-else', repo: 'app-builder-shell', name: 'Fork' },
                },
            }),
            MESH_ENTRY,
            WITH_BLANK
        );

        expect(rows).toEqual([
            expect.objectContaining({
                kind: 'custom',
                sourceLine: 'Custom integration · someone-else/app-builder-shell',
            }),
        ]);
    });

    it('degrades to a custom row when the component list omits the blank entry (documented)', () => {
        // The blank catalog entry IS the discriminator's source of truth; hosts
        // pass the full integration-entry list (incl. blank). Without it there is
        // no template source to match, so a shell source renders as an import.
        const rows = resolveIntegrationRows(
            state({
                selectedAppBuilderComponents: ['firefly-image-gen'],
                appBuilderComponentSources: { 'firefly-image-gen': INSTANCE_SOURCE },
            }),
            MESH_ENTRY,
            CATALOG
        );

        expect(rows).toEqual([expect.objectContaining({ kind: 'custom' })]);
    });

    it('keeps the legacy entry.blank catalog branch for a fixed-id shell selection (pre-feature pin)', () => {
        const rows = resolveIntegrationRows(
            state({ selectedAppBuilderComponents: ['app-builder-shell'] }),
            MESH_ENTRY,
            [MESH_ENTRY, ERP_ENTRY, BLANK_ENTRY]
        );

        expect(rows).toEqual([
            expect.objectContaining({
                id: 'app-builder-shell',
                kind: 'blank',
                name: 'App Builder App',
            }),
        ]);
        // The legacy row has NO source record to carry a display name, so it is
        // not renamable (rename writes appBuilderComponentSources[id].name).
        expect(rows[0].renamable).toBeUndefined();
    });
});
