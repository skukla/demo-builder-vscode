/**
 * Structural invariant (ADR-011 D3 Step 03) — the "proper component structure" guard.
 *
 * The researched model: each integration is its own `components/<id>/` folder,
 * all deploy into ONE shared Adobe I/O workspace, coexisting because each carries
 * a DISTINCT OpenWhisk package (`deriveOwPackage(id)`) — the `aio app deploy`
 * prune boundary. This suite pins that invariant end-to-end through the keyed
 * runner (mocked at the shell/deploy-tail boundary):
 *
 *   N integrations ⇒ N folders `components/<id>/`, each deployed under a distinct
 *   `ow.package` (no two equal; none equal to the shared `application` /
 *   `dx-excshell-1`), each removable without touching the others.
 *
 * The add-door gate (`detectAppLayout` matches the repo's config shape against
 * the entry's declared layout) is pinned in appBuilderComponentRunner.test.ts
 * ("rejects a NON-standalone integration at the add door" and siblings).
 */

import type { Project } from '@/types/base';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

jest.setTimeout(5000);

// =============================================================================
// Mocks — shell boundary only (the runner's deploy tails are injected mocks)
// =============================================================================

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

// The config layout is filesystem-read at the add door; the invariant suite runs
// the happy path (the rejection is pinned in the runner suite).
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
}));

import {
    addAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { deriveOwPackage } from '@/features/app-builder/services/owPackageName';

import { createDeps as sharedCreateDeps } from './appBuilderComponentRunner.testUtils';
// =============================================================================
// Fixtures — N integrations
// =============================================================================

const INTEGRATION_IDS = ['erp-bridge', 'crm-sync', 'pim-feed'] as const;

function integrationEntry(id: string): AppBuilderComponentCatalogEntry {
    return {
        id,
        name: id,
        description: `Integration ${id}`,
        kind: 'integration',
        source: { owner: 'acme', repo: id, branch: 'main' },
        requiredApis: [],
    };
}

/**
 * The SHARED `createDeps`. This file had its own copy — same interface, its own
 * drift — which is what the duplicate-fake scans exist to find.
 */
const createDeps = sharedCreateDeps;

function createProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/proj',
        adobe: { organization: 'org-123', projectId: 'proj-456', workspace: 'ws-789' },
        componentInstances: {},
        ...overrides,
    } as unknown as Project;
}

/** Add every integration through the keyed runner, threading the persisted project. */
async function addAllIntegrations(deps: ReturnType<typeof createDeps>): Promise<Project> {
    let project = createProject();
    for (const id of INTEGRATION_IDS) {
        const result = await addAppBuilderComponent(project, integrationEntry(id), deps);
        expect(result.success).toBe(true);
        project = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
    }
    return project;
}

/** A project already carrying all N integrations (for the remove tests). */
function projectWithAllIntegrations(): Project {
    const componentInstances: Record<string, unknown> = {};
    const appBuilderComponents: Record<string, unknown> = {};
    for (const id of INTEGRATION_IDS) {
        componentInstances[id] = {
            id,
            name: id,
            type: 'app-builder',
            status: 'ready',
            path: `/proj/components/${id}`,
        };
        appBuilderComponents[id] = {
            kind: 'integration',
            status: 'deployed',
            source: { owner: 'acme', repo: id, branch: 'main' },
            url: `https://app/${id}`,
        };
    }
    return createProject({
        componentInstances: componentInstances as never,
        appBuilderComponents: appBuilderComponents as never,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

// =============================================================================
// N integrations ⇒ N folders, N distinct packages
// =============================================================================

describe('structural invariant: N integrations ⇒ N folders + N distinct ow.packages', () => {
    it('gives each of N integrations its own components/<id>/ folder', async () => {
        const deps = createDeps();
        const project = await addAllIntegrations(deps);

        const paths = INTEGRATION_IDS.map((id) => project.componentInstances?.[id]?.path);
        expect(paths).toEqual(INTEGRATION_IDS.map((id) => `/proj/components/${id}`));
        expect(new Set(paths).size).toBe(INTEGRATION_IDS.length);
    });

    it('deploys each integration under its own deriveOwPackage(id)', async () => {
        const deps = createDeps();
        await addAllIntegrations(deps);

        const owPackages = deps.deployApp.mock.calls.map((c: unknown[]) => c[1]);
        expect(owPackages).toEqual(INTEGRATION_IDS.map((id) => deriveOwPackage(id)));
    });

    it('never shares a package: all derived ow.packages are pairwise distinct', async () => {
        const deps = createDeps();
        await addAllIntegrations(deps);

        const owPackages = deps.deployApp.mock.calls.map((c: unknown[]) => c[1]);
        expect(new Set(owPackages).size).toBe(INTEGRATION_IDS.length);
    });

    it('never lands on the shared default packages (application / dx-excshell-1)', async () => {
        const deps = createDeps();
        await addAllIntegrations(deps);

        for (const owPackage of deps.deployApp.mock.calls.map((c: unknown[]) => c[1])) {
            expect(owPackage).not.toBe('application');
            expect(owPackage).not.toBe('dx-excshell-1');
        }
    });

    it('persists one keyed entry per integration (N entries, none clobbered)', async () => {
        const deps = createDeps();
        const project = await addAllIntegrations(deps);

        for (const id of INTEGRATION_IDS) {
            expect(project.appBuilderComponents?.[id]).toEqual(
                expect.objectContaining({ kind: 'integration', status: 'deployed' })
            );
        }
        expect(Object.keys(project.appBuilderComponents ?? {})).toHaveLength(
            INTEGRATION_IDS.length
        );
    });
});

// =============================================================================
// Remove targets only its own package
// =============================================================================

describe('structural invariant: remove targets only its own package', () => {
    it("runs the undeploy with the removed component's own cwd (its rewritten config IS the package)", async () => {
        const project = projectWithAllIntegrations();
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, 'crm-sync', deps);

        expect(result.success).toBe(true);
        const undeployCalls = deps.commandManager.execute.mock.calls.filter((c: unknown[]) =>
            String(c[0]).includes('app undeploy')
        );
        expect(undeployCalls).toHaveLength(1);
        expect((undeployCalls[0][1] as { cwd?: string }).cwd).toBe('/proj/components/crm-sync');
    });

    it("leaves sibling integrations' folders and keyed state untouched", async () => {
        const project = projectWithAllIntegrations();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'crm-sync', deps);

        expect(deps.componentManager.removeComponent).toHaveBeenCalledTimes(1);
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(
            project,
            'crm-sync',
            true
        );

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.['crm-sync']).toBeUndefined();
        expect(persisted.appBuilderComponents?.['erp-bridge']).toEqual(
            expect.objectContaining({ status: 'deployed', url: 'https://app/erp-bridge' })
        );
        expect(persisted.appBuilderComponents?.['pim-feed']).toEqual(
            expect.objectContaining({ status: 'deployed', url: 'https://app/pim-feed' })
        );
    });
});
