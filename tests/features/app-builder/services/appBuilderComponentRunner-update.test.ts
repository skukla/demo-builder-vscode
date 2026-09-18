/**
 * Runner — updating an installed integration (AB-13, step 3): fetch the newer
 * code, install its dependencies, redeploy. The fetch and the install are
 * handed in; these tests assert what each is asked and what the SC is told.
 */

import { updateAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import type { SourceUpdateResult } from '@/features/app-builder/services/integrationSourceUpdate';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: jest.fn(async () => 'extension'),
}));

const ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'Commerce to ERP',
    kind: 'integration',
    layout: 'extension',
    lifecycle: 'app-management',
    nodeVersion: '24',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};
const PATH = '/proj/components/erp-integration';
const URLS = {
    'app-management/installation':
        'https://ns.adobeioruntime.net/api/v1/web/app-management/installation',
};
const UPDATED: SourceUpdateResult = {
    status: 'updated',
    detail: 'Updated the integration from d32eb96 to 7804f3e.',
    from: 'd32eb96',
    to: '7804f3e',
};

function installedProject(installedVersion = '0.1.0'): Project {
    return createProject({
        appBuilderComponents: {
            [ENTRY.id]: {
                kind: 'integration',
                status: 'deployed',
                source: ENTRY.source,
                installation: { status: 'installed', version: installedVersion },
                updateAvailable: { commit: '7804f3e', checkedAt: '2026-09-17T00:00:00Z' },
            },
        },
        componentInstances: {
            [ENTRY.id]: { id: ENTRY.id, name: ENTRY.name, status: 'ready', path: PATH },
        },
    });
}

function updateDeps(fetched: SourceUpdateResult, overrides: Record<string, unknown> = {}) {
    return createDeps({
        catalog: [ENTRY],
        deployApp: jest.fn().mockResolvedValue({
            success: true,
            data: { url: 'https://app/api', deployedUrls: URLS },
        }),
        installAppManagement: jest.fn().mockResolvedValue({
            status: 'upgraded',
            version: '0.2.0',
            detail: 'Upgraded in Commerce to version 0.2.0.',
        }),
        readAppVersion: jest.fn().mockResolvedValue('0.2.0'),
        fetchComponentSource: jest.fn().mockResolvedValue(fetched),
        installComponentDependencies: jest.fn().mockResolvedValue({ success: true }),
        ...overrides,
    });
}

describe('updateAppBuilderComponent', () => {
    it("fetches the entry's branch, installs dependencies with the entry's Node, then redeploys and installs", async () => {
        const deps = updateDeps(UPDATED);
        const project = installedProject();

        const result = await updateAppBuilderComponent(project, ENTRY.id, deps);

        expect(result).toEqual({ success: true, detail: UPDATED.detail });
        expect(deps.fetchComponentSource).toHaveBeenCalledWith(PATH, 'main');
        expect(deps.installComponentDependencies).toHaveBeenCalledWith(
            PATH,
            expect.objectContaining({
                id: ENTRY.id,
                configuration: expect.objectContaining({ nodeVersion: '24', strictInstall: true }),
            }),
        );
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
        expect(project.appBuilderComponents?.[ENTRY.id]?.installation).toMatchObject({
            status: 'upgraded',
            version: '0.2.0',
        });
        expect(project.appBuilderComponents?.[ENTRY.id]?.updateAvailable).toBeUndefined();
        expect(deps.saveProject).toHaveBeenLastCalledWith(
            expect.objectContaining({
                appBuilderComponents: expect.objectContaining({
                    [ENTRY.id]: expect.not.objectContaining({ updateAvailable: expect.anything() }),
                }),
            }),
        );
    });

    it('installs dependencies before it deploys', async () => {
        const order: string[] = [];
        const deps = updateDeps(UPDATED, {
            installComponentDependencies: jest.fn(async () => {
                order.push('install');
                return { success: true };
            }),
            deployApp: jest.fn(async () => {
                order.push('deploy');
                return { success: true, data: { url: 'https://app/api', deployedUrls: URLS } };
            }),
        });

        await updateAppBuilderComponent(installedProject(), ENTRY.id, deps);

        expect(order).toEqual(['install', 'deploy']);
    });

    it('stops at a refused fetch with its reason, deploying nothing', async () => {
        const refused: SourceUpdateResult = {
            status: 'refused',
            detail: 'The integration folder has changes of its own (a.js). Commit or undo them, then update again.',
        };
        const deps = updateDeps(refused);
        const project = installedProject();

        const result = await updateAppBuilderComponent(project, ENTRY.id, deps);

        expect(result).toEqual({ success: false, error: refused.detail });
        expect(project.appBuilderComponents?.[ENTRY.id]?.updateAvailable).toBeDefined();
        expect(deps.installComponentDependencies).not.toHaveBeenCalled();
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('stops at a failed fetch with its reason', async () => {
        const deps = updateDeps({ status: 'failed', detail: 'Could not fetch main from GitHub: offline.' });

        const result = await updateAppBuilderComponent(installedProject(), ENTRY.id, deps);

        expect(result).toEqual({ success: false, error: 'Could not fetch main from GitHub: offline.' });
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('says a failed dependency install after the fetch, and does not deploy', async () => {
        const deps = updateDeps(UPDATED, {
            installComponentDependencies: jest.fn().mockResolvedValue({ success: false, error: 'npm ERR! ERESOLVE' }),
        });

        const result = await updateAppBuilderComponent(installedProject(), ENTRY.id, deps);

        expect(result).toEqual({
            success: false,
            error: 'Updated the integration from d32eb96 to 7804f3e. Its dependencies did not install: npm ERR! ERESOLVE',
        });
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('leaves a current clone alone when Commerce already has its version', async () => {
        const deps = updateDeps(
            { status: 'current', detail: 'The integration is already up to date.' },
            { readAppVersion: jest.fn().mockResolvedValue('0.2.0') },
        );

        const project = installedProject('0.2.0');
        const result = await updateAppBuilderComponent(project, ENTRY.id, deps);

        expect(result).toEqual({ success: true, detail: 'The integration is already up to date.' });
        expect(project.appBuilderComponents?.[ENTRY.id]?.updateAvailable).toBeUndefined();
        expect(deps.installComponentDependencies).not.toHaveBeenCalled();
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('redeploys a current clone whose version Commerce does not have yet', async () => {
        const deps = updateDeps({ status: 'current', detail: 'The integration is already up to date.' });

        const result = await updateAppBuilderComponent(installedProject('0.1.0'), ENTRY.id, deps);

        expect(result.success).toBe(true);
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
        expect(deps.installComponentDependencies).not.toHaveBeenCalled();
    });

    // 2026-09-18: an Update fetched the ERP's code and then failed to deploy, which
    // left the clone current. The next Update found nothing new, answered success
    // and deployed nothing, while the card was told "Deployed".
    it('redeploys a current clone whose last deploy failed, installing its dependencies first', async () => {
        const deps = updateDeps(
            { status: 'current', detail: 'The integration is already up to date.' },
            { readAppVersion: jest.fn().mockResolvedValue('0.2.0') },
        );
        const project = installedProject('0.2.0');
        project.appBuilderComponents![ENTRY.id].status = 'error';

        const result = await updateAppBuilderComponent(project, ENTRY.id, deps);

        expect(result.success).toBe(true);
        expect(deps.installComponentDependencies).toHaveBeenCalledTimes(1);
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
        expect(project.appBuilderComponents?.[ENTRY.id]?.status).toBe('deployed');
    });

    it("a failed redeploy keeps the component's own name, not the catalog's", async () => {
        const deps = updateDeps(UPDATED, {
            deployApp: jest.fn().mockResolvedValue({ success: false, error: 'aio app deploy failed' }),
        });
        const project = installedProject();
        project.appBuilderComponents![ENTRY.id].name = 'Acme ERP sync';

        await updateAppBuilderComponent(project, ENTRY.id, deps);

        expect(project.appBuilderComponents?.[ENTRY.id]).toMatchObject({ status: 'error', name: 'Acme ERP sync' });
    });

    it('passes a failed redeploy through unchanged', async () => {
        const deps = updateDeps(UPDATED, {
            deployApp: jest.fn().mockResolvedValue({ success: false, error: 'aio app deploy failed' }),
        });

        const project = installedProject();
        const result = await updateAppBuilderComponent(project, ENTRY.id, deps);

        expect(result.success).toBe(false);
        expect(result.detail).toBeUndefined();
        expect(project.appBuilderComponents?.[ENTRY.id]?.updateAvailable).toBeDefined();
    });

    it('fetches the default branch when the record names none', async () => {
        const deps = updateDeps(UPDATED);
        const project = installedProject();
        const state = project.appBuilderComponents?.[ENTRY.id];
        if (state) state.source = { owner: 'skukla', repo: 'commerce-erp-integration' };

        await updateAppBuilderComponent(project, ENTRY.id, deps);

        expect(deps.fetchComponentSource).toHaveBeenCalledWith(PATH, 'main');
    });

    it('refuses an unknown integration, and a caller that wired no update', async () => {
        const deps = updateDeps(UPDATED);
        await expect(updateAppBuilderComponent(installedProject(), 'nope', deps)).resolves.toEqual({
            success: false,
            error: 'AppBuilderComponent "nope" not found.',
        });

        const bare = createDeps({ catalog: [ENTRY] });
        await expect(updateAppBuilderComponent(installedProject(), ENTRY.id, bare)).resolves.toEqual({
            success: false,
            error: 'Updating integrations is not available here.',
        });
    });
});
