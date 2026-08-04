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

