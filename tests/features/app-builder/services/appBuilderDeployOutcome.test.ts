/**
 * appBuilderDeployOutcome — the one keyed deploy-record writer.
 *
 * This suite covers the FAILURE REASON specifically. Until 2026-08-03 a failed
 * deploy persisted `status: 'error'` and nothing else, so the card could say
 * "Deploy failed" and had no way to say why — the reason existed only in the
 * logs at the moment of failure, and the only way to see it again was to run the
 * deploy again. That is how a mesh sat broken for two days.
 *
 * Key-resolution and identity-preservation are exercised through the callers'
 * suites (deployMeshHeadless, appBuilderComponentRunner-keyed-state).
 */

import { recordDeployOutcome } from '@/features/app-builder/services/appBuilderDeployOutcome';
import type { Project } from '@/types/base';

function project(): Project {
    return {
        name: 'p',
        path: '/p',
        appBuilderComponents: {
            mesh: {
                kind: 'mesh',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-mesh' },
                endpoint: 'https://graph.adobe.io/api/demo/graphql',
            },
        },
    } as unknown as Project;
}

describe('recordDeployOutcome — failure reason', () => {
    it('persists the reason a deploy failed', () => {
        const p = project();

        recordDeployOutcome(p, 'mesh', 'mesh', {
            status: 'error',
            error: 'The specified organization, project, and workspace combination is invalid',
        });

        expect(p.appBuilderComponents?.mesh).toMatchObject({
            status: 'error',
            error: 'The specified organization, project, and workspace combination is invalid',
        });
    });

    // THE TRAP. This writer merges `...existing, ...outcome`, so a success
    // outcome that simply omits `error` leaves the PREVIOUS failure's message
    // sitting on a now-deployed component — the drawer would explain a failure
    // that had since been fixed. Exactly the shape of the `meshStatusSummary`
    // bug this module's callers already carry a comment about.
    it('clears a stale reason when a later deploy succeeds', () => {
        const p = project();
        recordDeployOutcome(p, 'mesh', 'mesh', { status: 'error', error: 'boom' });

        recordDeployOutcome(p, 'mesh', 'mesh', {
            status: 'deployed',
            endpoint: 'https://graph.adobe.io/api/demo/graphql',
            lastDeployed: '2026-08-03T00:00:00.000Z',
        });

        expect(p.appBuilderComponents?.mesh.status).toBe('deployed');
        expect(p.appBuilderComponents?.mesh.error).toBeUndefined();
    });

    it('clears a stale reason on any non-error status, not just deployed', () => {
        const p = project();
        recordDeployOutcome(p, 'mesh', 'mesh', { status: 'error', error: 'boom' });

        recordDeployOutcome(p, 'mesh', 'mesh', { status: 'stale' });

        expect(p.appBuilderComponents?.mesh.error).toBeUndefined();
    });

    it('leaves the reason alone when a failure is re-recorded without one', () => {
        const p = project();
        recordDeployOutcome(p, 'mesh', 'mesh', { status: 'error', error: 'the real reason' });

        // A caller that knows only "it failed" must not erase a better message.
        recordDeployOutcome(p, 'mesh', 'mesh', { status: 'error' });

        expect(p.appBuilderComponents?.mesh.error).toBe('the real reason');
    });
});

// ---------------------------------------------------------------------------
// create mode — added 2026-08-04 when the ADD path was consolidated onto this
// writer. Until then the add built and persisted its own state, which is how the
// failure reason came to be dropped: a second writer that reimplemented the
// merge and omitted a field.
// ---------------------------------------------------------------------------
describe('recordDeployOutcome — create', () => {
    it('keys by the given id, NOT the migration branch of resolveKeyedComponentId', () => {
        // One same-kind entry exists under a different key. Without `create`, the
        // migration branch reuses it — which for an ADD overwrites the incumbent.
        const p = project();

        recordDeployOutcome(
            p,
            'mesh',
            'commerce-eds-mesh',
            { status: 'deployed', name: 'New Mesh', source: { owner: 'skukla', repo: 'x' } },
            { create: true },
        );

        expect(p.appBuilderComponents?.['commerce-eds-mesh']?.name).toBe('New Mesh');
        // The incumbent, untouched.
        expect(p.appBuilderComponents?.mesh?.endpoint).toBe(
            'https://graph.adobe.io/api/demo/graphql',
        );
    });

    it('WITHOUT create, the same call lands on the migrated singleton', () => {
        const p = project();

        recordDeployOutcome(p, 'mesh', 'commerce-eds-mesh', { status: 'deployed' });

        // Proof the guard above is load-bearing rather than decorative.
        expect(p.appBuilderComponents?.['commerce-eds-mesh']).toBeUndefined();
        expect(p.appBuilderComponents?.mesh?.status).toBe('deployed');
    });

    it('takes identity from the outcome when there is no entry to inherit it from', () => {
        const p = { name: 'p', path: '/p' } as unknown as Project;

        recordDeployOutcome(
            p,
            'integration',
            'erp-bridge',
            {
                status: 'deployed',
                name: 'ERP Bridge',
                source: { owner: 'acme', repo: 'erp-bridge', branch: 'main' },
            },
            { create: true },
        );

        const created = p.appBuilderComponents?.['erp-bridge'];
        expect(created).toEqual(
            expect.objectContaining({
                kind: 'integration',
                status: 'deployed',
                name: 'ERP Bridge',
                source: { owner: 'acme', repo: 'erp-bridge', branch: 'main' },
            }),
        );
    });

    it('an UPDATE keeps the identity it already has', () => {
        const p = project();
        p.appBuilderComponents!.mesh.name = 'Commerce Mesh';

        recordDeployOutcome(p, 'mesh', 'mesh', { status: 'deployed' });

        // An outcome carrying no name must not blank the stored one.
        expect(p.appBuilderComponents?.mesh?.name).toBe('Commerce Mesh');
        expect(p.appBuilderComponents?.mesh?.source).toEqual({
            owner: 'skukla',
            repo: 'commerce-mesh',
        });
    });
});


// The keyed entry and the COMPONENT INSTANCE both carry a status, and different
// surfaces read different ones: the integrations grid reads the keyed entry, while
// `handleRequestStatus` reads `getMeshComponentInstance(project)?.status`.
//
// REGRESSION (2026-08-04, live): after adding a mesh the keyed entry said
// "deployed" and the instance still said "ready" — the install outcome, never
// advanced. `deployMeshHeadless` sets `meshComponent.status` by hand, so a
// REDEPLOY looked right and an ADD did not; the dashboard reported mesh=ready and
// the grid rendered "Not Deployed" for a mesh that had just verified successfully.
//
// Advancing it HERE — in the one keyed deploy-record writer every deploy path
// lands on — is what makes the two paths agree, instead of adding a third writer.
describe('recordDeployOutcome also advances the component instance', () => {
    function projectWithInstance(status = 'ready') {
        return {
            componentInstances: {
                'eds-accs-mesh': { id: 'eds-accs-mesh', subType: 'mesh', status },
            },
            appBuilderComponents: {},
        } as never;
    }

    it('marks the instance deployed on a successful deploy', () => {
        const project = projectWithInstance();

        recordDeployOutcome(project, 'mesh', 'eds-accs-mesh', {
            status: 'deployed',
            endpoint: 'https://mesh/graphql',
        });

        expect(project.componentInstances['eds-accs-mesh'].status).toBe('deployed');
    });

    it('marks the instance errored on a failed deploy', () => {
        const project = projectWithInstance();

        recordDeployOutcome(project, 'mesh', 'eds-accs-mesh', {
            status: 'error',
            error: 'boom',
        });

        expect(project.componentInstances['eds-accs-mesh'].status).toBe('error');
    });

    // The keyed entry stays the authority on everything else; this only mirrors
    // the deploy STATUS onto the instance the dashboard happens to read.
    it('still records the keyed entry as before', () => {
        const project = projectWithInstance();

        recordDeployOutcome(project, 'mesh', 'eds-accs-mesh', {
            status: 'deployed',
            endpoint: 'https://mesh/graphql',
        });

        expect(project.appBuilderComponents['eds-accs-mesh']).toMatchObject({
            status: 'deployed',
            endpoint: 'https://mesh/graphql',
        });
    });

    it('is a no-op when the project has no such instance', () => {
        const project = { appBuilderComponents: {} } as never;

        expect(() =>
            recordDeployOutcome(project, 'mesh', 'eds-accs-mesh', { status: 'deployed' }),
        ).not.toThrow();
    });
});
