/**
 * Tests for meshStatusHelpers — the two Adobe-context type guards and the
 * dashboard-side status push.
 *
 * The mesh-status RESOLUTION logic moved to
 * features/mesh/services/meshStatusResolver (tested there); what stayed behind
 * is the translation the dashboard needs — `stale` is `config-changed` on this
 * surface — and the decision about which of the two mesh objects is consulted.
 * Every assertion here drives the real state accessors rather than mocking
 * them, because the thing that goes wrong is reading the component INSTANCE
 * where the deploy RECORD was meant (the 2026-08-04 regression).
 */

import {
    hasAdobeProjectContext,
    hasAdobeWorkspaceContext,
    sendDemoStatusUpdate,
} from '@/features/dashboard/handlers/meshStatusHelpers';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import type { Project } from '@/types/base';

const mockMeshPath = '/projects/demo/components/commerce-mesh';

/** A project whose `adobe` block carries exactly the fields named. */
function withAdobe(adobe: Record<string, unknown> | undefined): Project {
    return createMockProject({ adobe: adobe as Project['adobe'] });
}

describe('hasAdobeWorkspaceContext', () => {
    it('accepts a project carrying org, project AND workspace', () => {
        expect(
            hasAdobeWorkspaceContext(
                withAdobe({ organization: 'org', projectId: 'proj', workspace: 'stage' })
            )
        ).toBe(true);
    });

    it('rejects a missing project without reading through it', () => {
        expect(hasAdobeWorkspaceContext(null)).toBe(false);
        expect(hasAdobeWorkspaceContext(undefined)).toBe(false);
    });

    it('rejects a project with no adobe block at all', () => {
        expect(hasAdobeWorkspaceContext(withAdobe(undefined))).toBe(false);
    });

    // Workspace is the field this guard adds over hasAdobeProjectContext, so a
    // project-only context must NOT satisfy it.
    it('rejects org + project when the workspace is missing', () => {
        expect(
            hasAdobeWorkspaceContext(withAdobe({ organization: 'org', projectId: 'proj' }))
        ).toBe(false);
    });

    it('rejects project + workspace when the organization is missing', () => {
        expect(
            hasAdobeWorkspaceContext(withAdobe({ projectId: 'proj', workspace: 'stage' }))
        ).toBe(false);
    });
});

describe('hasAdobeProjectContext', () => {
    it('accepts org + project, with no workspace required', () => {
        expect(
            hasAdobeProjectContext(withAdobe({ organization: 'org', projectId: 'proj' }))
        ).toBe(true);
    });

    it('rejects a missing project without reading through it', () => {
        expect(hasAdobeProjectContext(null)).toBe(false);
        expect(hasAdobeProjectContext(undefined)).toBe(false);
    });

    it('rejects a project with no adobe block at all', () => {
        expect(hasAdobeProjectContext(withAdobe(undefined))).toBe(false);
    });

    it('rejects a project id with no organization', () => {
        expect(hasAdobeProjectContext(withAdobe({ projectId: 'proj' }))).toBe(false);
    });

    it('rejects an organization with no project id', () => {
        expect(hasAdobeProjectContext(withAdobe({ organization: 'org' }))).toBe(false);
    });
});

/** A mesh COMPONENT INSTANCE at `status`, with no deploy record of its own. */
function meshInstance(status: string) {
    return {
        'commerce-mesh': {
            id: 'commerce-mesh',
            name: 'API Mesh',
            subType: 'mesh',
            status,
            path: mockMeshPath,
        },
    } as unknown as Project['componentInstances'];
}

/** The deploy RECORD — where an endpoint lives, and what `not-deployed` turns on. */
function meshDeployRecord() {
    return {
        mesh: {
            kind: 'mesh',
            status: 'deployed',
            source: { owner: '', repo: '' },
            endpoint: 'https://keyed-mesh.adobe.io/graphql',
            envVars: { MESH_ID: 'mesh123' },
        },
    } as unknown as Project['appBuilderComponents'];
}

function serve(project: Project | null, opts: { panel?: boolean } = {}) {
    const postMessage = jest.fn();
    const getCurrentProject = jest.fn().mockResolvedValue(project);
    const context = createMockHandlerContext({
        panel: (opts.panel === false
            ? undefined
            : { webview: { postMessage } }) as unknown as HandlerContext['panel'],
        stateManager: createMockStateManager({ getCurrentProject }),
    });
    return { context, postMessage, getCurrentProject };
}

/** The payload the dashboard actually receives. */
function payloadFrom(postMessage: jest.Mock) {
    expect(postMessage).toHaveBeenCalledTimes(1);
    return postMessage.mock.calls[0][0].payload;
}

describe('sendDemoStatusUpdate', () => {
    it('does nothing at all — not even a state read — when there is no panel', async () => {
        const { context, getCurrentProject } = serve(createMockProject(), { panel: false });

        await expect(sendDemoStatusUpdate(context)).resolves.toBeUndefined();
        expect(getCurrentProject).not.toHaveBeenCalled();
    });

    it('posts nothing when there is no current project', async () => {
        const { context, postMessage } = serve(null);

        await sendDemoStatusUpdate(context);

        expect(postMessage).not.toHaveBeenCalled();
    });

    /**
     * A frontend whose env vars have drifted from the ones captured when the
     * demo started. `detectFrontendChanges` is driven for real here: the
     * question is whether the STATUS gates it, not whether it works.
     */
    function projectWithDriftedFrontend(status: Project['status']): Project {
        return createMockProject({
            status,
            componentInstances: {
                'eds-storefront': edsStorefrontInstance(),
            },
            componentConfigs: { 'eds-storefront': { MESH_ENDPOINT: 'https://new.mesh/graphql' } },
            frontendEnvState: {
                envVars: { MESH_ENDPOINT: 'https://old.mesh/graphql' },
                capturedAt: '2026-01-01T00:00:00.000Z',
            },
        });
    }

    it('reports drifted frontend config while the demo is RUNNING', async () => {
        const { context, postMessage } = serve(projectWithDriftedFrontend('running'));

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).frontendConfigChanged).toBe(true);
    });

    // Not running means nothing has been captured to drift FROM, so the answer
    // is false without asking — the same drift, gated by status alone.
    it('reports no drift when the demo is not running, however stale the config', async () => {
        const { context, postMessage } = serve(projectWithDriftedFrontend('ready'));

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).frontendConfigChanged).toBe(false);
    });

    it('omits mesh entirely when the project has no mesh component', async () => {
        const { context, postMessage } = serve(createMockProject());

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh).toBeUndefined();
    });

    // The component INSTANCE status wins over any deploy record: a mesh that is
    // mid-deploy must not be reported by its last endpoint.
    it('reports a deploying mesh from the component instance', async () => {
        const { context, postMessage } = serve(
            createMockProject({
                componentInstances: meshInstance('deploying'),
                appBuilderComponents: meshDeployRecord(),
            })
        );

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh).toEqual({
            status: 'deploying',
            message: 'Deploying...',
        });
    });

    it('reports a failed mesh from the component instance', async () => {
        const { context, postMessage } = serve(
            createMockProject({
                componentInstances: meshInstance('error'),
                appBuilderComponents: meshDeployRecord(),
            })
        );

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh).toEqual({
            status: 'error',
            message: 'Deployment error',
        });
    });

    // An instance with no DEPLOY RECORD has never been deployed, whatever the
    // persisted summary says — this is the branch that reads the second object.
    it('reports not-deployed when the instance exists but no deploy record does', async () => {
        const { context, postMessage } = serve(
            createMockProject({
                componentInstances: meshInstance('ready'),
                meshStatusSummary: 'deployed',
            })
        );

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh).toEqual({ status: 'not-deployed' });
    });

    /** A deployed mesh whose persisted summary is `summary`. */
    function deployedMesh(summary?: string) {
        return createMockProject({
            componentInstances: meshInstance('ready'),
            appBuilderComponents: meshDeployRecord(),
            meshStatusSummary: summary as Project['meshStatusSummary'],
        });
    }

    it('posts the keyed endpoint with the persisted summary', async () => {
        const { context, postMessage } = serve(deployedMesh('deployed'));

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh).toEqual({
            status: 'deployed',
            endpoint: 'https://keyed-mesh.adobe.io/graphql',
        });
    });

    // The one translation this file exists for: the dashboard UI has no
    // 'stale', it has 'config-changed'.
    it('translates a stale summary to config-changed', async () => {
        const { context, postMessage } = serve(deployedMesh('stale'));

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh.status).toBe('config-changed');
    });

    it('reads an unknown summary as deployed, because the record says it is', async () => {
        const { context, postMessage } = serve(deployedMesh('unknown'));

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh.status).toBe('deployed');
    });

    it('reads an absent summary as deployed', async () => {
        const { context, postMessage } = serve(deployedMesh(undefined));

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh.status).toBe('deployed');
    });

    // Anything else passes straight through — only 'stale' and the two
    // no-answer values are rewritten.
    it('passes any other summary through untouched', async () => {
        const { context, postMessage } = serve(deployedMesh('error'));

        await sendDemoStatusUpdate(context);

        expect(payloadFrom(postMessage).mesh.status).toBe('error');
    });
});
