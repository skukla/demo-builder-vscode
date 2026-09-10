/**
 * Deploy-contract runner — the ADD arm's DEFAULTS and failure shapes.
 *
 * The sibling `appBuilderComponentRunner.test.ts` pins the happy paths and the
 * routing. This file pins what happens at the edges of those same paths, which
 * mutation testing showed nothing constrained: an installer that reports success
 * with nothing to show for it, a deploy tail that answers `{ success: true }` and
 * no data, the branch a catalog entry names, a provider that IS deployed, and
 * the post-deploy app-management install pass reporting through `onProgress`.
 *
 * Every assertion here is on an ARGUMENT a collaborator received or on state that
 * was persisted — never on a log line.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { Project } from '@/types/base';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { TransformedComponentDefinition } from '@/types/components';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockDetectAppLayout = jest.fn().mockResolvedValue('standalone');
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: (...args: unknown[]) => mockDetectAppLayout(...args),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    MESH_ENTRY,
    INTEGRATION_ENTRY,
    createDeps,
    createProject,
} from './appBuilderComponentRunner.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    mockDetectAppLayout.mockResolvedValue('standalone');
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

/** The keyed entry the last save carried. */
function persistedEntry(deps: ReturnType<typeof createDeps>, id: string) {
    const saved = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
    return saved.appBuilderComponents?.[id];
}

// =============================================================================
// cloneAndInstall — every way an install can fail to hand back a usable path
// =============================================================================

describe('addAppBuilderComponent — the install must hand back a path', () => {
    it("surfaces the installer's OWN error, and deploys nothing", async () => {
        const project = createProject();
        const deps = createDeps();
        deps.componentManager.installComponent.mockResolvedValue({
            success: false,
            error: 'npm install refused: engine-strict',
        });

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(result).toEqual({ success: false, error: 'npm install refused: engine-strict' });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });

    it('falls back to the standard message when the installer names no reason', async () => {
        const project = createProject();
        const deps = createDeps();
        deps.componentManager.installComponent.mockResolvedValue({ success: false });

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(result).toEqual({ success: false, error: 'Component installation failed.' });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });

    // `success: true` with no component is the shape a half-finished installer
    // returns. Deploying against it means deploying against `undefined`.
    it('treats success-with-no-component as a failed install', async () => {
        const project = createProject();
        const deps = createDeps();
        deps.componentManager.installComponent.mockResolvedValue({ success: true });

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(result).toEqual({ success: false, error: 'Component installation failed.' });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });

    it('treats a component with no path as a failed install', async () => {
        const project = createProject();
        const deps = createDeps();
        deps.componentManager.installComponent.mockResolvedValue({
            success: true,
            component: {
                id: MESH_ENTRY.id,
                name: MESH_ENTRY.name,
                type: 'dependency',
                subType: 'mesh',
                status: 'ready',
                path: '',
                lastUpdated: new Date(),
            },
        });

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(result).toEqual({ success: false, error: 'Component installation failed.' });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });
});

// =============================================================================
// buildDefinition — the clone the installer is asked for
// =============================================================================

describe('addAppBuilderComponent — the definition handed to the installer', () => {
    /** The definition argument of the single installComponent call. */
    function definition(deps: ReturnType<typeof createDeps>): TransformedComponentDefinition {
        return deps.componentManager.installComponent.mock.calls[0][1];
    }

    it('clones the BRANCH the catalog entry names', async () => {
        const entry: AppBuilderComponentCatalogEntry = {
            ...INTEGRATION_ENTRY,
            source: { owner: 'acme', repo: 'erp-bridge', branch: 'release/2026-09' },
        };
        const deps = createDeps();

        await addAppBuilderComponent(createProject(), entry, deps);

        expect(definition(deps).source).toEqual({
            type: 'git',
            url: 'https://github.com/acme/erp-bridge.git',
            branch: 'release/2026-09',
        });
    });
});

// =============================================================================
// findMissingProvider — the guard must also LET THROUGH
// =============================================================================

describe('addAppBuilderComponent — provider-before-consumer', () => {
    const CONSUMER: AppBuilderComponentCatalogEntry = {
        ...INTEGRATION_ENTRY,
        envSchema: [
            { name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh', providedBy: 'commerce-mesh' },
        ],
    };

    it('deploys a consumer whose provider IS already deployed', async () => {
        const project = createProject({
            appBuilderComponents: {
                'commerce-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
                    endpoint: 'https://mesh/graphql',
                },
            },
        });
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, CONSUMER, deps);

        expect(result.success).toBe(true);
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
    });

    it('lets an env var with no declared provider through', async () => {
        const entry: AppBuilderComponentCatalogEntry = {
            ...INTEGRATION_ENTRY,
            envSchema: [{ name: 'ERP_API_KEY', type: 'secret', label: 'Key' }],
        };
        const deps = createDeps();

        const result = await addAppBuilderComponent(createProject(), entry, deps);

        expect(result.success).toBe(true);
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// The outcome a deploy tail's EMPTY answer produces
// =============================================================================

describe('addAppBuilderComponent — a deploy tail that returns no data', () => {
    it('persists an empty mesh endpoint and mesh id rather than throwing', async () => {
        const project = createProject();
        const deps = createDeps({ deployMesh: jest.fn().mockResolvedValue({ success: true }) });

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(persistedEntry(deps, MESH_ENTRY.id)?.endpoint).toBe('');
        expect(project.componentInstances?.[MESH_ENTRY.id]?.metadata).toMatchObject({
            meshId: '',
            meshStatus: 'deployed',
        });
    });

    it('persists no url or deployedUrls for an integration deploy with no data', async () => {
        const deps = createDeps({ deployApp: jest.fn().mockResolvedValue({ success: true }) });

        const result = await addAppBuilderComponent(createProject(), INTEGRATION_ENTRY, deps);

        expect(result.success).toBe(true);
        const entry = persistedEntry(deps, INTEGRATION_ENTRY.id);
        expect(entry?.url).toBeUndefined();
        expect(entry?.deployedUrls).toBeUndefined();
    });

    // The catalog decides what a component provides. A mesh that declares nothing
    // must persist nothing and leave the storefront alone.
    it('a mesh entry declaring no providesEnvVars provides none and never republishes', async () => {
        const entry: AppBuilderComponentCatalogEntry = {
            ...MESH_ENTRY,
            providesEnvVars: undefined,
        };
        const deps = createDeps({ catalog: [entry] });

        const result = await addAppBuilderComponent(createProject(), entry, deps);

        expect(result.success).toBe(true);
        expect(persistedEntry(deps, entry.id)?.providesEnvVars).toBeUndefined();
        expect(deps.republishStorefront).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Identity — the source a created entry carries, transient and final
// =============================================================================

describe('addAppBuilderComponent — the identity written to the keyed entry', () => {
    const ENTRY: AppBuilderComponentCatalogEntry = {
        ...INTEGRATION_ENTRY,
        source: { owner: 'acme', repo: 'erp-bridge', branch: 'next' },
    };

    it('the TRANSIENT deploying entry already carries the source', async () => {
        const project = createProject();
        // The runner mutates ONE project object, so the saved reference is the
        // post-deploy state by the time the test reads it. Snapshot at save time.
        const saves: unknown[] = [];
        const deps = createDeps({
            saveProject: jest.fn(async (p: Project) => {
                saves.push(structuredClone(p.appBuilderComponents));
            }),
        });

        await addAppBuilderComponent(project, ENTRY, deps);

        expect((saves[0] as Project['appBuilderComponents'])?.[ENTRY.id]).toEqual({
            kind: 'integration',
            status: 'deploying',
            name: 'ERP Bridge',
            source: { owner: 'acme', repo: 'erp-bridge', branch: 'next' },
        });
    });

    it('the final entry carries the same source', async () => {
        const deps = createDeps();

        await addAppBuilderComponent(createProject(), ENTRY, deps);

        expect(persistedEntry(deps, ENTRY.id)?.source).toEqual({
            owner: 'acme',
            repo: 'erp-bridge',
            branch: 'next',
        });
    });
});

// =============================================================================
// The add door's rejection wording — the SC's only account of what was wrong
// =============================================================================

describe('addAppBuilderComponent — the layout rejection names what was found', () => {
    it('an unreadable app.config.yaml says so, rather than naming a shape', async () => {
        mockDetectAppLayout.mockResolvedValue(undefined);
        const deps = createDeps();

        const result = await addAppBuilderComponent(createProject(), INTEGRATION_ENTRY, deps);

        expect(result.success).toBe(false);
        expect(result.error).toContain('declares neither');
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('a wrong-but-readable shape is named', async () => {
        mockDetectAppLayout.mockResolvedValue('extension');
        const deps = createDeps();

        const result = await addAppBuilderComponent(createProject(), INTEGRATION_ENTRY, deps);

        expect(result.error).toContain('extension-shaped');
    });
});

// =============================================================================
// A throw inside the add is an answer, not a crash
// =============================================================================

describe('addAppBuilderComponent — a collaborator that throws', () => {
    it('returns the failure instead of propagating it', async () => {
        const deps = createDeps({
            subscribeRequiredApis: jest.fn().mockRejectedValue(new Error('org services timed out')),
        });

        const result = await addAppBuilderComponent(createProject(), MESH_ENTRY, deps);

        expect(result).toEqual({ success: false, error: 'org services timed out' });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });
});

// =============================================================================
// installIfAppManagement — what the SC is told while it runs, and afterwards
// =============================================================================

describe('addAppBuilderComponent — the app-management install pass reports back', () => {
    const APP_MGMT: AppBuilderComponentCatalogEntry = {
        ...INTEGRATION_ENTRY,
        id: 'starter-kit',
        name: 'Starter Kit',
        lifecycle: 'app-management',
        layout: 'extension',
    };

    beforeEach(() => {
        mockDetectAppLayout.mockResolvedValue('extension');
    });

    it("forwards the installer's own progress to the caller", async () => {
        const onProgress = jest.fn();
        const deps = createDeps({
            catalog: [APP_MGMT],
            onProgress,
            installAppManagement: jest.fn(
                async (
                    _p: Project,
                    _urls: Record<string, string> | undefined,
                    report?: (message: string) => void
                ) => {
                    report?.('Associating with Commerce...');
                    return { status: 'installed' as const };
                }
            ),
        });

        await addAppBuilderComponent(createProject(), APP_MGMT, deps);

        expect(onProgress).toHaveBeenCalledWith('Associating with Commerce...');
    });

    // The headless/MCP callers wire no onProgress at all; the installer still
    // reports, and the forwarding must simply do nothing.
    it('survives an installer that reports when nobody is listening', async () => {
        const deps = createDeps({
            catalog: [APP_MGMT],
            installAppManagement: jest.fn(
                async (
                    _p: Project,
                    _urls: Record<string, string> | undefined,
                    report?: (message: string) => void
                ) => {
                    report?.('Associating with Commerce...');
                    return { status: 'installed' as const };
                }
            ),
        });

        const result = await addAppBuilderComponent(createProject(), APP_MGMT, deps);

        expect(result.success).toBe(true);
    });

    it('a FAILED install pushes its detail to the caller and records it', async () => {
        const onProgress = jest.fn();
        const deps = createDeps({
            catalog: [APP_MGMT],
            onProgress,
            installAppManagement: jest
                .fn()
                .mockResolvedValue({ status: 'failed', detail: 'Commerce returned 401' }),
        });

        const result = await addAppBuilderComponent(createProject(), APP_MGMT, deps);

        expect(result.success).toBe(true);
        expect(onProgress).toHaveBeenCalledWith('Commerce returned 401');
        expect(persistedEntry(deps, APP_MGMT.id)?.installation).toMatchObject({
            status: 'failed',
            detail: 'Commerce returned 401',
        });
    });

    it('a failure with no detail still says the install did not finish', async () => {
        const onProgress = jest.fn();
        const deps = createDeps({
            catalog: [APP_MGMT],
            onProgress,
            installAppManagement: jest.fn().mockResolvedValue({ status: 'failed' }),
        });

        await addAppBuilderComponent(createProject(), APP_MGMT, deps);

        expect(onProgress).toHaveBeenCalledWith('Install into Commerce did not finish.');
    });

    it('a SUCCESSFUL install never pushes the did-not-finish line', async () => {
        const onProgress = jest.fn();
        const deps = createDeps({
            catalog: [APP_MGMT],
            onProgress,
            installAppManagement: jest.fn().mockResolvedValue({ status: 'installed' }),
        });

        await addAppBuilderComponent(createProject(), APP_MGMT, deps);

        expect(onProgress).not.toHaveBeenCalledWith('Install into Commerce did not finish.');
        expect(persistedEntry(deps, APP_MGMT.id)?.installation).toMatchObject({
            status: 'installed',
        });
    });
});
