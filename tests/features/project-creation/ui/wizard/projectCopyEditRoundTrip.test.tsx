/**
 * Copy and Edit read the same file Import reads (PL-56e).
 *
 * The sibling of projectFileRoundTrip.test.tsx, on the same every-field project:
 *
 *   - Copy from Existing opens the wizard with `copySeedFromProject` (the file
 *     Export writes, read back through `readProjectFile`), so its creation wire
 *     must be Import's wire, field for field.
 *   - Edit opens with `extractSettingsFromProject` (that file plus the SC's own
 *     setting values and storefront). Finish with nothing changed must send every
 *     travelling field back as it was: a field the edit wire drops is a field the
 *     save can delete, which is how this item was found.
 */

import { CATALOG_API_KEY } from '@/core/config/envVarKeys';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import {
    copySeedFromProject,
    extractSettingsFromProject,
} from '@/features/projects-dashboard/services/settingsSerializer';
import { stateFor } from './hooks/useWizardState.testUtils';
import { CUSTOM_APP, MESH, everyFieldProject, exportThenRead } from './projectFileRoundTrip.testUtils';

const original = everyFieldProject();

function wireFor(settings: Parameters<typeof buildProjectConfig>[1]) {
    const state = stateFor({ importedSettings: settings, existingProjectNames: [] });
    return { state, wire: buildProjectConfig(state, settings, undefined, () => undefined) };
}

describe('Copy from Existing: the same wire as Import from File', () => {
    const read = copySeedFromProject(original);
    if (!read.ok) throw new Error(read.error);
    const copied = wireFor(read.file);
    const imported = wireFor(exportThenRead(original));

    it('reads the project through the one reader, as the current version', () => {
        expect(read.migratedFrom).toBeUndefined();
        expect(read.newerThanSupported).toBeUndefined();
    });

    it('opens the wizard in import mode, signed in to nothing', () => {
        expect(copied.state.wizardMode).toBe('import');
        expect(copied.state.edsConfig).toBeUndefined();
    });

    it('sends exactly the creation wire an import of its export sends', () => {
        expect(copied.wire).toStrictEqual(imported.wire);
    });

    it('carries no credential (control: the setting beside it did travel)', () => {
        const configs = copied.wire.componentConfigs?.['adobe-commerce-accs'];
        expect(configs).toMatchObject({ ACCS_STORE_VIEW_CODE: 'bodea_us' });
        expect(configs).not.toHaveProperty(CATALOG_API_KEY);
    });

    it('gets its own repository: the source storefront never reaches the wire', () => {
        expect(copied.wire.edsConfig).toBeUndefined();
    });
});

describe('Edit, Finish with nothing changed: every travelling field goes back as it was', () => {
    const settings = extractSettingsFromProject(original);
    const state = stateFor({
        editProject: {
            projectName: original.name,
            projectTitle: original.title,
            projectPath: original.path,
            settings,
        },
    });
    const wire = buildProjectConfig(state, settings, undefined, () => undefined);

    it('opens in edit mode on the project itself', () => {
        expect(state.wizardMode).toBe('edit');
        expect(wire.editProjectPath).toBe(original.path);
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

    it('keeps every setting value, the credential included: it is the SC’s own project', () => {
        expect(wire.componentConfigs).toStrictEqual(original.componentConfigs);
    });

    it('keeps the integrations, the custom source, the API picks and the mesh', () => {
        expect(wire.selectedAppBuilderComponents).toStrictEqual([CUSTOM_APP, MESH]);
        expect(wire.appBuilderComponentSources).toStrictEqual({
            [CUSTOM_APP]: { owner: 'acme', repo: 'pricing', branch: 'main', name: 'Pricing' },
        });
        expect(wire.componentApiPicks).toStrictEqual(original.componentApiPicks);
        expect(wire.components?.dependencies).toContain(MESH);
    });

    it('keeps the datapack and the discovered store structure', () => {
        expect(wire.datapack).toStrictEqual(original.datapack);
        expect(wire.commerceStoreStructure).toStrictEqual(original.commerceStoreStructure);
    });

    it('keeps the Adobe org, project and workspace', () => {
        expect(wire.adobe).toMatchObject({
            organization: original.adobe?.organization,
            projectId: original.adobe?.projectId,
            workspace: original.adobe?.workspace,
        });
    });

    it('reopens its own storefront, with the sign-ins re-checked rather than asked again', () => {
        expect(state.edsConfig).toMatchObject({
            repoMode: 'existing',
            repoName: 'bodea-demo',
            selectedRepo: { fullName: 'someone/bodea-demo' },
            githubAuth: { isChecking: true, user: { login: 'someone' } },
            daLiveOrg: 'someone',
        });
        expect(wire.edsConfig).toMatchObject({ repoName: 'bodea-demo' });
    });
});
