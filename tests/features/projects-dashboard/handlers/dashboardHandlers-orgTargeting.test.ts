/**
 * The projects-list staleness read must be org-targeted, per project.
 *
 * `orgContextEnv`'s docblock is explicit that an unwrapped `aio` path is not
 * "untargeted, therefore harmless": the CLI falls back to its process-global
 * `aio console where` selection, which this extension deliberately stopped
 * writing, so it holds whatever an earlier session or another tool left there.
 * That is how deployMeshHeadless deployed into a DELETED project for two days.
 *
 * The WRITE paths were wrapped after that incident; this READ path was not.
 * Evidence from one user session (2026-08-04) — the same api-mesh:describe,
 * the same mesh, minutes apart:
 *
 *   21:34:03  code=2  "Unable to get mesh details"   <- status/startup, unwrapped
 *   21:34:55  code=0  succeeded                      <- deploy path, wrapped
 *
 * `detectMeshChanges` reaches the CLI whenever the staleness baseline is empty
 * (it fetches the deployed config to establish one), which is every mesh added
 * from the dashboard before the record-parity fix.
 *
 * These assert the WRAPPING, not the CLI result: the wrap is the contract, and
 * its absence is invisible from the outside because an unwrapped call still
 * "works" whenever the ambient selection happens to be right.
 */

import * as os from 'os';
import * as path from 'path';
import { handleGetProjects } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { createMockProject, createProjectsDashboardContext } from '../testUtils';

// Mock mesh staleness detection
jest.mock('@/core/state/appBuilderComponentState', () => ({
    ...jest.requireActual('@/core/state/appBuilderComponentState'),
    hasMeshDeploymentRecord: jest.fn().mockReturnValue(false),
}));
jest.mock('@/features/mesh/services/meshStatusResolver', () => ({
    determineMeshStatus: jest.fn().mockResolvedValue('deployed'),
}));

// Make filesystem path-safety checks deterministic and independent of the host.
// validateProjectPath() canonicalizes via fs.realpathSync; on a machine without
// a real ~/.demo-builder/projects directory the validator would reject otherwise
// valid in-tree paths. Identity realpathSync keeps the security prefix check
// intact (traversal paths still resolve outside the base) while letting valid
// project paths through regardless of what exists on disk.
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn((p: string) => p),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    detectMeshChanges: jest.fn().mockResolvedValue({ hasChanges: false }),
}));

// Org targeting is ambient (AsyncLocalStorage), so the only way to observe it is
// to watch the wrapper. Pass-through, so the wrapped work still runs.
const mockWithOrgContext = jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn());
const mockBuildOrgTarget = jest.fn((adobe?: { organization?: string }) => ({
    orgId: adobe?.organization ?? '',
}));
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (t: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(t, fn),
    buildOrgTargetFromProjectAdobe: (adobe?: { organization?: string }) =>
        mockBuildOrgTarget(adobe),
}));


// Mock vscode
jest.mock(
    'vscode',
    () => ({
        commands: {
            executeCommand: jest.fn(),
        },
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue('cards'),
            }),
        },
        Uri: {
            file: jest.fn((p: string) => ({ fsPath: p, path: p })),
            parse: jest.fn((s: string) => ({ toString: () => s, url: s })),
        },
        env: {
            clipboard: {
                writeText: jest.fn(),
            },
            openExternal: jest.fn(),
        },
        window: {
            showInformationMessage: jest.fn(),
        },
    }),
    { virtual: true }
);

describe('handleGetProjects — org targeting', () => {
    describe('mesh staleness enrichment', () => {
        // `detectMeshChanges` reaches the `aio` CLI whenever the staleness baseline
        // is empty (it fetches the deployed config to establish one). Unwrapped,
        // that call inherits the CLI's process-global console selection — which
        // this extension deliberately stopped writing — so it queries whatever org
        // some earlier session left selected. Observed 2026-08-04: the same
        // api-mesh:describe returned code=2 here and code=0 inside the deploy's
        // wrapper, minutes apart, against the same mesh.
        it('runs the staleness read inside withOrgContext', async () => {
            const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
            const { determineMeshStatus } = require('@/features/mesh/services/meshStatusResolver');
            const { detectMeshChanges } = require('@/features/mesh/services/stalenessDetector');

            const project = createMockProject({
                componentConfigs: { 'api-mesh': { SOME_VAR: 'value' } },
                adobe: { organization: 'org-A', projectId: 'p1', projectName: 'p1', workspace: 'w1', authenticated: true },
            });
            const context = createProjectsDashboardContext([project]);

            hasMeshDeploymentRecord.mockReturnValue(true);
            detectMeshChanges.mockResolvedValue({ hasChanges: false });
            determineMeshStatus.mockResolvedValue('deployed');

            await handleGetProjects(context as any);

            expect(mockWithOrgContext).toHaveBeenCalled();
            expect(mockBuildOrgTarget).toHaveBeenCalledWith(
                expect.objectContaining({ organization: 'org-A' })
            );
        });

        // The loop walks EVERY project, so one wrapper around the whole loop would
        // target every project at the first one's org — which is worse than no
        // wrapper, because it would confidently query the wrong org.
        it('targets each project at its OWN org, not the first one seen', async () => {
            const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
            const { determineMeshStatus } = require('@/features/mesh/services/meshStatusResolver');
            const { detectMeshChanges } = require('@/features/mesh/services/stalenessDetector');

            const projectA = createMockProject({
                name: 'a',
                path: path.join(os.homedir(), '.demo-builder', 'projects', 'a'),
                componentConfigs: { 'api-mesh': { V: '1' } },
                adobe: { organization: 'org-A', projectId: 'p1', projectName: 'p1', workspace: 'w1', authenticated: true },
            });
            const projectB = createMockProject({
                name: 'b',
                path: path.join(os.homedir(), '.demo-builder', 'projects', 'b'),
                componentConfigs: { 'api-mesh': { V: '2' } },
                adobe: { organization: 'org-B', projectId: 'p2', projectName: 'p2', workspace: 'w2', authenticated: true },
            });
            const context = createProjectsDashboardContext([projectA, projectB]);

            hasMeshDeploymentRecord.mockReturnValue(true);
            detectMeshChanges.mockResolvedValue({ hasChanges: false });
            determineMeshStatus.mockResolvedValue('deployed');

            await handleGetProjects(context as any);

            const orgs = mockBuildOrgTarget.mock.calls.map(([adobe]) => adobe?.organization);
            expect(orgs).toEqual(expect.arrayContaining(['org-A', 'org-B']));
        });

    });
});
