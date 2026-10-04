/**
 * Export then import loses nothing (PL-56c + PL-56d).
 *
 * One project with every field the project file carries is exported through the
 * one writer (`createExportSettings`), written to text, read back through the
 * one reader (`readProjectFile`), opened in the wizard (`useWizardState`), and
 * turned into the creation wire (`buildProjectConfig`). Each field the SC set is
 * then asserted on that wire against the ORIGINAL project, field by field.
 *
 * What does not round-trip, and why (each pinned below, so a change is a
 * decision rather than a drift):
 *   - credentials: never in the file (D24); the SC enters them again;
 *   - the storefront repository and DA.live site: the sender's, carried as
 *     provenance only; the receiver creates their own, after signing in;
 *   - `commerce` and `aiPrompts`: they travel in the file, but creation takes
 *     neither as an input (no creation path writes `commerce`; saved prompts are
 *     not created with a project).
 */

import { CATALOG_API_KEY } from '@/core/config/envVarKeys';
import { readProjectFile } from '@/core/state/projectFileReader';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import { settingsFileV1WithSecrets } from '../../../../helpers/projectFileFixtures';
import { stateFor } from './hooks/useWizardState.testUtils';
import { CUSTOM_APP, MESH, everyFieldProject, exportThenRead } from './projectFileRoundTrip.testUtils';

describe('export then import: the creation wire equals the original project', () => {
    const original = everyFieldProject();
    const imported = exportThenRead(original);
    const state = stateFor({ importedSettings: imported, existingProjectNames: [] });
    const wire = buildProjectConfig(state, imported, undefined, () => undefined);

    it('opens the wizard in import mode', () => {
        expect(state.wizardMode).toBe('import');
    });

    it('keeps the name and the title', () => {
        expect(wire.projectName).toBe(original.name);
        expect(wire.projectTitle).toBe(original.title);
    });

    it('keeps the package, the added demo row and the stack', () => {
        expect(wire.selectedPackage).toBe(original.selectedPackage);
        expect(wire.demo).toStrictEqual(original.demo);
        expect(wire.selectedStack).toBe(original.selectedStack);
    });

    it('keeps the addons and both kinds of block library', () => {
        expect(wire.selectedAddons).toStrictEqual(original.selectedAddons);
        expect(wire.selectedBlockLibraries).toStrictEqual(original.selectedBlockLibraries);
        expect(wire.customBlockLibraries).toStrictEqual(original.customBlockLibraries);
    });

    it('keeps every setting, store scope included, and no credential', () => {
        const { [CATALOG_API_KEY]: _credential, ...withoutCredential } =
            original.componentConfigs?.['adobe-commerce-accs'] ?? {};
        expect(wire.componentConfigs).toStrictEqual({ 'adobe-commerce-accs': withoutCredential });
    });

    it('keeps the integrations, the custom source and the API picks', () => {
        expect(wire.selectedAppBuilderComponents).toStrictEqual([CUSTOM_APP, MESH]);
        expect(wire.appBuilderComponentSources).toStrictEqual({
            [CUSTOM_APP]: { owner: 'acme', repo: 'pricing', branch: 'main', name: 'Pricing' },
        });
        expect(wire.componentApiPicks).toStrictEqual(original.componentApiPicks);
    });

    it('keeps the mesh, where creation installs it', () => {
        expect(wire.components?.dependencies).toContain(MESH);
    });

    it('keeps the datapack and the discovered store structure', () => {
        expect(wire.datapack).toStrictEqual(original.datapack);
        expect(wire.commerceStoreStructure).toStrictEqual(original.commerceStoreStructure);
    });

    it('keeps the Adobe org, project and workspace, ids and names', () => {
        expect(wire.adobe).toStrictEqual({
            organization: 'ORG@AdobeOrg',
            organizationName: 'Example Org',
            projectId: 'p-123',
            projectName: '833BronzeShark',
            projectTitle: 'Bodea Console Project',
            workspace: 'w-456',
            workspaceName: 'Stage',
            workspaceTitle: 'Stage Workspace',
        });
    });

    describe('what does not round-trip, by design', () => {
        it('the storefront: the sender’s repo is provenance, never the new project’s', () => {
            expect(imported.source?.storefront).toStrictEqual({
                githubRepo: 'someone/bodea-demo',
                daLiveOrg: 'someone',
                daLiveSite: 'bodea-demo',
            });
            expect(wire.edsConfig).toBeUndefined();
        });

        it('sign-ins: GitHub and DA.live are asked as for a new project, never assumed', () => {
            expect(state.edsConfig).toBeUndefined();
        });

        it('commerce and saved prompts travel in the file but are not creation inputs', () => {
            expect(imported.commerce).toStrictEqual(original.commerce);
            expect(imported.aiPrompts).toStrictEqual(original.aiPrompts);
            expect(wire).not.toHaveProperty('commerce');
            expect(wire).not.toHaveProperty('aiPrompts');
        });
    });
});

describe('the name on a receiving machine that already has the project', () => {
    it('makes the slug unique and leaves the title for the SC to name', () => {
        const imported = exportThenRead(everyFieldProject());
        const state = stateFor({ importedSettings: imported, existingProjectNames: ['bodea-demo'] });

        expect(state.projectName).toBe('bodea-demo-copy');
        // A title would show "Bodea Demo" over a folder named bodea-demo-copy.
        expect(state.projectTitle).toBeUndefined();
    });
});

describe('a version-1 file written before 2026-10 still imports', () => {
    it('opens in the wizard with its settings, integrations and picks, and no credential', () => {
        const read = readProjectFile(JSON.stringify(settingsFileV1WithSecrets()));
        if (!read.ok) throw new Error(read.error);
        const state = stateFor({ importedSettings: read.file });

        expect(read.migratedFrom).toBe(1);
        expect(state.selectedPackage).toBe('bodea');
        expect(state.selectedStack).toBe('eds-accs');
        expect(state.componentConfigs?.['adobe-commerce-accs']).toMatchObject({ ACCS_STORE_VIEW_CODE: 'bodea_us' });
        expect(state.componentConfigs?.['adobe-commerce-accs']).not.toHaveProperty(CATALOG_API_KEY);
        expect(state.selectedAppBuilderComponents).toStrictEqual(['eds-accs-mesh']);
        expect(state.appBuilderComponentSources).toStrictEqual(settingsFileV1WithSecrets().appBuilderComponentSources);
        // The flat list had no owner; it lands under the unattributed key, never dropped.
        expect(state.selectedConsoleApis).toStrictEqual({
            'someone-pricing-app': ['CommerceCloudService'],
            __existing__: ['CommerceCloudService'],
        });
        // Its storefront is the sender's: provenance, not a setting.
        expect(state.edsConfig).toBeUndefined();
    });
});
