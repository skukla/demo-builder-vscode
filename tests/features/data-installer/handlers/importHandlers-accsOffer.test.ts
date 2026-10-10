/**
 * The "Set up credentials automatically" OFFER the import spine makes.
 *
 * `needsAccsCredentials: true` on a credential refusal is the only thing that puts
 * the provisioning button in front of the user. The button calls
 * `provision-accs-credentials` (`provisionAccsHandler.test.ts`); THIS pins when the
 * refusal carries the flag — and it lives on the spine's suite because the flag is
 * set in `prepareImport`, not in the handler it points at.
 *
 * Moved from `importHandlers-provisionAccs.test.ts` when that handler got its own
 * module (2026-10-08).
 */

import { importHandlers, makeImportHarness, setupSettings } from './importHandlers.testUtils';
import type { Project } from '@/types/base';

/**
 * A FACTORY, deliberately: the handler mutates the project's componentConfigs
 * before saving (the production pattern configure.ts uses), so a shared fixture
 * object gets the pair written into it by one test and hands every later test a
 * project that already has credentials. That exact pollution shipped in this
 * file's first version and made the refusal-flag test fail only in full-file
 * order — the flag was fine; the fixture had been given credentials.
 */
function accsProject(): Partial<Project> {
    return {
        name: 'demo-accs',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://x.api.commerce.adobe.com/t/graphql',
            },
        },
        adobe: {
            organization: '285361',
            projectId: 'proj-1',
            projectName: 'p',
            workspace: 'ws-1',
            authenticated: true,
        },
    };
}

const DRY_RUN = {
    datapackName: 'bodea',
    version: 'main',
    commerceInstance: 'inst',
    dataTypes: ['categories'],
};

describe('the needs-accs-credentials refusal carries its flag', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // The access guard runs before credentials — without settings the
        // refusal is "no URL configured" and never reaches the credential branch.
        setupSettings();
    });

    it('marks the credential refusal so the UI can offer provisioning', async () => {
        const { context } = makeImportHarness(accsProject()); // ACCS, no OAuth pair in configs

        const result = await importHandlers['validate-datapack-import'](context, DRY_RUN);

        expect(result.success).toBe(false);
        expect(result.data).toMatchObject({ needsAccsCredentials: true });
    });
});

/**
 * The flag is an OFFER, and an offer must be honourable.
 *
 * `needsAccsCredentials: true` is the only thing that puts "Set up credentials
 * automatically" in front of the user. The button calls
 * `provision-accs-credentials`, which refuses without
 * `adobe.organization`/`projectId`/`workspace` — so on a project with no Adobe
 * binding the modal offered a button whose only possible outcome was a second
 * refusal.
 *
 * A datapack write needs an OAuth S2S pair, and one can exist only inside an
 * Adobe I/O workspace. A project that selected no App Builder components has no
 * workspace to create it in. That is a real limitation, not a UI bug, and the
 * honest surface for it is the plain "credentials are missing" message with no
 * button — not a button that cannot work.
 *
 * The predicate is now shared with the guard it has to agree with, so the two
 * cannot drift apart.
 */
describe('the offer appears only where provisioning could actually run', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupSettings();
    });

    async function refusalFor(project: unknown) {
        const { context } = makeImportHarness(project);
        return importHandlers['validate-datapack-import'](context, DRY_RUN);
    }

    it('still refuses when the project has no Adobe binding — positive control', async () => {
        const result = await refusalFor({ ...accsProject(), adobe: undefined });

        expect(result.success).toBe(false);
    });

    it('withholds the offer when there is no Adobe project binding at all', async () => {
        const result = await refusalFor({ ...accsProject(), adobe: undefined });

        expect(result.data).toMatchObject({ needsAccsCredentials: false });
    });

    it('withholds the offer when the binding names no workspace', async () => {
        const result = await refusalFor({
            ...accsProject(),
            adobe: { organization: '285361', projectId: 'proj-1', authenticated: true },
        });

        expect(result.data).toMatchObject({ needsAccsCredentials: false });
    });

    it('withholds the offer when the binding names no project', async () => {
        const result = await refusalFor({
            ...accsProject(),
            adobe: { organization: '285361', workspace: 'ws-1', authenticated: true },
        });

        expect(result.data).toMatchObject({ needsAccsCredentials: false });
    });

    /** The full binding is exactly what the provisioning guard demands. */
    it('withholds the offer for a PaaS gap, even on a fully-bound project', async () => {
        // A complete Adobe binding is only HALF the condition. The other half is
        // that the gap is one provisioning can close — a PaaS project missing its
        // admin username and password is not, and a button offering to create an
        // OAuth pair would fix nothing.
        const paasWithBinding = {
            name: 'demo-paas',
            componentSelections: { backend: 'adobe-commerce-paas' },
            componentConfigs: { 'adobe-commerce-paas': {} },
            adobe: {
                organization: 'org-1',
                projectId: 'proj-1',
                workspace: 'ws-1',
            },
        };

        const result = await refusalFor(paasWithBinding);

        expect(result.data).toMatchObject({ needsAccsCredentials: false });
    });

    it('offers when the binding is complete', async () => {
        const result = await refusalFor(accsProject());

        expect(result.data).toMatchObject({ needsAccsCredentials: true });
    });
});
