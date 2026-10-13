/**
 * configure_project — what a settings change reaches (PL-76).
 *
 * The agent's change now goes through the Configure screen's own staging. Before,
 * it marked only the mesh, never the storefront, rewrote no `.env` file, and wrote
 * the SaaS store-code names on every backend, so on PaaS nothing read them.
 */

// The testUtils first: it registers the fakes the tool's module binds (see there).
import {
    getCurrentProject,
    mockRegenerateProjectEnvFiles,
    saveProject,
    serve,
} from './configureProjectTool.testUtils';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const SCOPE = { website: 'base', store: 'main', storeView: 'default' };

/** An Edge Delivery SaaS project whose storefront was published with other codes. */
function publishedEdsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/p/demo',
        selectedStack: 'eds-accs',
        componentSelections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'old' } },
        edsStorefrontState: {
            envVars: { ACCS_STORE_VIEW_CODE: 'old' },
            lastPublished: '2026-10-01T00:00:00Z',
        },
        edsStorefrontStatusSummary: 'published',
        ...overrides,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRegenerateProjectEnvFiles.mockResolvedValue(undefined);
});

describe('configure_project — the storefront', () => {
    it('marks the storefront out of date when the store scope reaches it', async () => {
        getCurrentProject.mockResolvedValue(publishedEdsProject());

        const out = await serve()({ storeScope: SCOPE });

        const saved = saveProject.mock.calls[0][0] as Project;
        expect(saved.edsStorefrontStatusSummary).toBe('stale');
        expect(out.storefrontMarkedStale).toEqual(expect.arrayContaining(['ACCS_STORE_VIEW_CODE']));
        expect(out.note).toMatch(/republish/);
    });

    it('leaves the storefront alone when nothing it reads changed', async () => {
        getCurrentProject.mockResolvedValue(publishedEdsProject());

        const out = await serve()({ env: { 'adobe-commerce-accs': { SOME_OTHER_VAR: 'x' } } });

        const saved = saveProject.mock.calls[0][0] as Project;
        expect(saved.edsStorefrontStatusSummary).toBe('published');
        expect(out).not.toHaveProperty('storefrontMarkedStale');
    });
});

describe('configure_project — the .env files', () => {
    it('rewrites them from the saved project after a settings change', async () => {
        getCurrentProject.mockResolvedValue(publishedEdsProject());

        await serve()({ storeScope: SCOPE });

        expect(mockRegenerateProjectEnvFiles).toHaveBeenCalledTimes(1);
        const [project] = mockRegenerateProjectEnvFiles.mock.calls[0] as [Project];
        expect(project.componentConfigs?.['adobe-commerce-accs']).toMatchObject({
            ACCS_STORE_VIEW_CODE: 'default',
        });
    });

    it('leaves them alone when the call only records a datapack', async () => {
        getCurrentProject.mockResolvedValue(publishedEdsProject());

        await serve()({ datapack: { name: 'citisignal', version: '1.0.0' } });

        expect(mockRegenerateProjectEnvFiles).not.toHaveBeenCalled();
    });

    it('still saves, and says so, when they cannot be rewritten', async () => {
        getCurrentProject.mockResolvedValue(publishedEdsProject());
        mockRegenerateProjectEnvFiles.mockRejectedValue(new Error('disk full'));

        const out = await serve()({ storeScope: SCOPE });

        expect(saveProject).toHaveBeenCalledTimes(1);
        expect(out.envFilesNotWritten).toBe('disk full');
    });
});

describe('configure_project — store scope on each backend', () => {
    it('writes the names PaaS reads on a PaaS project', async () => {
        getCurrentProject.mockResolvedValue(
            createMockProject({
                componentSelections: { frontend: 'headless', backend: 'adobe-commerce-paas' },
                componentConfigs: {},
            }),
        );

        const out = await serve()({ storeScope: SCOPE });

        const saved = saveProject.mock.calls[0][0] as Project;
        expect(saved.componentConfigs?.['adobe-commerce-paas']).toStrictEqual({
            ADOBE_COMMERCE_WEBSITE_CODE: 'base',
            ADOBE_COMMERCE_STORE_CODE: 'main',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
        });
        // And the scope counts as set: it used to stay "unset" on PaaS forever.
        expect(out.stillUnset).not.toContain('storeScope');
    });

    it('writes the SaaS names on a SaaS project', async () => {
        getCurrentProject.mockResolvedValue(publishedEdsProject({ componentConfigs: {} }));

        await serve()({ storeScope: SCOPE });

        const saved = saveProject.mock.calls[0][0] as Project;
        expect(saved.componentConfigs?.['adobe-commerce-accs']).toMatchObject({
            ACCS_WEBSITE_CODE: 'base',
            ACCS_STORE_CODE: 'main',
            ACCS_STORE_VIEW_CODE: 'default',
        });
    });
});
