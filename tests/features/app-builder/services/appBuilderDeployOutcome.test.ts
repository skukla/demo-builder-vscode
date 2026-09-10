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

import {
    recordDeployOutcome,
    resolveKeyedComponentId,
} from '@/features/app-builder/services/appBuilderDeployOutcome';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

function project(): Project {
    return createMockProject({
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
    });
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
            { create: true }
        );

        expect(p.appBuilderComponents?.['commerce-eds-mesh']?.name).toBe('New Mesh');
        // The incumbent, untouched.
        expect(p.appBuilderComponents?.mesh?.endpoint).toBe(
            'https://graph.adobe.io/api/demo/graphql'
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
        const p = createMockProject({ name: 'p', path: '/p' });

        recordDeployOutcome(
            p,
            'integration',
            'erp-bridge',
            {
                status: 'deployed',
                name: 'ERP Bridge',
                source: { owner: 'acme', repo: 'erp-bridge', branch: 'main' },
            },
            { create: true }
        );

        const created = p.appBuilderComponents?.['erp-bridge'];
        expect(created).toEqual(
            expect.objectContaining({
                kind: 'integration',
                status: 'deployed',
                name: 'ERP Bridge',
                source: { owner: 'acme', repo: 'erp-bridge', branch: 'main' },
            })
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
    // Typed view of the stub: `as never` let the partial pass as Project but
    // made every property READ off it type as never too. The intersection keeps
    // the stub partial while the assertions typecheck against what they read.
    type ProjectStub = Parameters<typeof recordDeployOutcome>[0] & {
        componentInstances: Record<string, { id: string; subType: string; status: string }>;
        appBuilderComponents: Record<string, { status?: string; endpoint?: string }>;
    };

    function projectWithInstance(status = 'ready'): ProjectStub {
        return {
            componentInstances: {
                'eds-accs-mesh': { id: 'eds-accs-mesh', subType: 'mesh', status },
            },
            appBuilderComponents: {},
        } as unknown as ProjectStub;
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
        const project = createMockProject({ appBuilderComponents: {} });

        expect(() =>
            recordDeployOutcome(project, 'mesh', 'eds-accs-mesh', { status: 'deployed' })
        ).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// resolveKeyedComponentId — which entry an operation lands on.
//
// Two rules in sequence: the instance id wins whenever it is already keyed, and
// only an UNKEYED id falls through to the legacy-migration branch (reuse the one
// same-kind entry's key). Both the deploy write above and the per-id remove share
// this, so a wrong answer here either overwrites a sibling or clears the wrong
// card.
// ---------------------------------------------------------------------------
describe('resolveKeyedComponentId', () => {
    it('answers the instance id when that id is already keyed', () => {
        const p = project();

        expect(resolveKeyedComponentId(p, 'mesh', 'mesh')).toBe('mesh');
    });

    // The two rules DISAGREE only here, which is the only way to show the id-first
    // guard is load-bearing: a keyed entry is targeted by its own id even when a
    // lone entry of the asked-for kind sits under a different key. Drop the guard
    // and this call lands on 'mesh' — a write meant for the integration.
    it('prefers the keyed id over the lone same-kind entry under another key', () => {
        const p = createMockProject({
            appBuilderComponents: {
                mesh: { kind: 'mesh', status: 'deployed', source: { owner: '', repo: '' } },
                'erp-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                },
            },
        });

        expect(resolveKeyedComponentId(p, 'mesh', 'erp-sync')).toBe('erp-sync');
    });

    // The migration branch counts entries OF THE ASKED KIND, not entries. A
    // project with one mesh and one integration has exactly one mesh, so an
    // unkeyed mesh id resolves onto the migrated singleton; counting all entries
    // would see two, decline the reuse, and strand the write under a fresh key
    // beside the entry it was meant to update.
    it('reuses the ONE same-kind entry, ignoring entries of other kinds', () => {
        const p = createMockProject({
            appBuilderComponents: {
                mesh: { kind: 'mesh', status: 'deployed', source: { owner: '', repo: '' } },
                'erp-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                },
            },
        });

        expect(resolveKeyedComponentId(p, 'mesh', 'eds-accs-mesh')).toBe('mesh');
        expect(resolveKeyedComponentId(p, 'integration', 'wms-sync')).toBe('erp-sync');
    });

    it('keeps the given id when SEVERAL same-kind entries exist (the N-integration model)', () => {
        const p = createMockProject({
            appBuilderComponents: {
                'erp-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                },
                'crm-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                },
            },
        });

        expect(resolveKeyedComponentId(p, 'integration', 'wms-sync')).toBe('wms-sync');
    });

    // A project that has never keyed anything carries no record at all, not an
    // empty one. Reading it unguarded throws before any of the above runs.
    it('answers the given id on a project with no appBuilderComponents record', () => {
        const p = createMockProject();

        expect(p.appBuilderComponents).toBeUndefined();
        expect(resolveKeyedComponentId(p, 'mesh', 'eds-accs-mesh')).toBe('eds-accs-mesh');
    });
});

// ---------------------------------------------------------------------------
// providesEnvVars — the mesh endpoint the storefront is published against.
//
// The keyed entry's `providesEnvVars.MESH_ENDPOINT` is what `republishIfProvided`
// reads. Leaving the previous deploy's endpoint there points the storefront at
// the namespace the deploy just left.
// ---------------------------------------------------------------------------
describe('recordDeployOutcome — provided env vars', () => {
    function meshProviding(provided: Record<string, string> | undefined): Project {
        return createMockProject({
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-mesh' },
                    providesEnvVars: provided,
                },
            },
        });
    }

    it('refreshes MESH_ENDPOINT with the freshly deployed endpoint', () => {
        const p = meshProviding({ MESH_ENDPOINT: 'https://graph.adobe.io/api/OLD/graphql' });

        recordDeployOutcome(p, 'mesh', 'mesh', {
            status: 'deployed',
            endpoint: 'https://graph.adobe.io/api/NEW/graphql',
        });

        expect(p.appBuilderComponents?.mesh.providesEnvVars).toStrictEqual({
            MESH_ENDPOINT: 'https://graph.adobe.io/api/NEW/graphql',
        });
    });

    it('keeps the recorded endpoint when the outcome carries none', () => {
        const p = meshProviding({ MESH_ENDPOINT: 'https://graph.adobe.io/api/OLD/graphql' });

        recordDeployOutcome(p, 'mesh', 'mesh', { status: 'error', error: 'boom' });

        expect(p.appBuilderComponents?.mesh.providesEnvVars).toStrictEqual({
            MESH_ENDPOINT: 'https://graph.adobe.io/api/OLD/graphql',
        });
    });

    // Nothing is fabricated: the catalog decides what a component provides. An
    // integration that provides some OTHER var does not gain a MESH_ENDPOINT just
    // because its deploy returned an endpoint.
    it('does not add MESH_ENDPOINT to an entry that does not provide it', () => {
        const p = createMockProject({
            appBuilderComponents: {
                'erp-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    providesEnvVars: { ERP_URL: 'https://erp/old' },
                },
            },
        });

        recordDeployOutcome(p, 'integration', 'erp-sync', {
            status: 'deployed',
            endpoint: 'https://runtime/erp-sync',
        });

        expect(p.appBuilderComponents?.['erp-sync'].providesEnvVars).toStrictEqual({
            ERP_URL: 'https://erp/old',
        });
    });

    it('leaves an entry that provides nothing providing nothing', () => {
        const p = meshProviding(undefined);

        recordDeployOutcome(p, 'mesh', 'mesh', {
            status: 'deployed',
            endpoint: 'https://graph.adobe.io/api/NEW/graphql',
        });

        expect(p.appBuilderComponents?.mesh.providesEnvVars).toBeUndefined();
    });

    // A CREATE has no existing entry, so the outcome carries what the catalog says
    // this component provides — and that map is refreshed the same way.
    it('takes the provided map from the outcome on a create, endpoint refreshed', () => {
        const p = createMockProject();

        recordDeployOutcome(
            p,
            'mesh',
            'eds-accs-mesh',
            {
                status: 'deployed',
                endpoint: 'https://graph.adobe.io/api/NEW/graphql',
                providesEnvVars: { MESH_ENDPOINT: '' },
            },
            { create: true }
        );

        expect(p.appBuilderComponents?.['eds-accs-mesh'].providesEnvVars).toStrictEqual({
            MESH_ENDPOINT: 'https://graph.adobe.io/api/NEW/graphql',
        });
    });
});

describe('recordDeployOutcome — identity defaults', () => {
    // The legacy migration's own placeholder. A never-keyed component has no
    // source to inherit and the outcome may not carry one, and `source` is not
    // optional on the entry — an empty owner/repo is the shape the rest of the
    // code already handles.
    it('gives a never-keyed component the empty source the migration uses', () => {
        const p = createMockProject();

        recordDeployOutcome(p, 'mesh', 'eds-accs-mesh', { status: 'deployed' }, { create: true });

        expect(p.appBuilderComponents?.['eds-accs-mesh'].source).toStrictEqual({
            owner: '',
            repo: '',
        });
    });

    it('records a failure with no reason on a component that has no entry yet', () => {
        const p = createMockProject();

        recordDeployOutcome(p, 'mesh', 'eds-accs-mesh', { status: 'error' }, { create: true });

        expect(p.appBuilderComponents?.['eds-accs-mesh'].error).toBeUndefined();
    });
});

describe('recordDeployOutcome — which statuses reach the component instance', () => {
    function projectWithReadyInstance(): Project {
        return createMockProject({
            appBuilderComponents: {},
            componentInstances: {
                'eds-accs-mesh': {
                    id: 'eds-accs-mesh',
                    name: 'Mesh',
                    path: '/p/components/eds-accs-mesh',
                    status: 'ready',
                },
            },
        });
    }

    // Only the two TERMINAL statuses mirror. An in-progress or stale outcome must
    // not overwrite the instance, or the dashboard reads a transient as settled.
    it('leaves the instance alone for a non-terminal status', () => {
        const p = projectWithReadyInstance();

        recordDeployOutcome(p, 'mesh', 'eds-accs-mesh', { status: 'stale' });

        expect(p.componentInstances?.['eds-accs-mesh'].status).toBe('ready');
    });

    it('stamps lastUpdated when it does mirror', () => {
        const p = projectWithReadyInstance();

        recordDeployOutcome(p, 'mesh', 'eds-accs-mesh', { status: 'deployed' });

        expect(p.componentInstances?.['eds-accs-mesh'].lastUpdated).toBeInstanceOf(Date);
    });

    it('is a no-op on a project carrying no componentInstances record at all', () => {
        const p = createMockProject({ componentInstances: undefined });

        expect(() =>
            recordDeployOutcome(p, 'mesh', 'eds-accs-mesh', { status: 'deployed' })
        ).not.toThrow();
    });
});
