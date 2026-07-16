/**
 * meshUpdateDecline — the "Later" decline flow's state writes/reads.
 *
 * Keyed-only write (ADR-011 D3 Step 07): the decline lands on the keyed mesh
 * appBuilderComponents entry (the singular meshState write-side is retired);
 * reads are keyed-first with a legacy-synthesis fallback for pre-migration
 * in-memory projects.
 */

import {
    markMeshUpdateDeclined,
    isMeshUpdateDeclined,
} from '@/features/mesh/services/meshUpdateDecline';
import type { Project, AppBuilderComponentState } from '@/types/base';

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo',
        path: '/tmp/demo',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        ...overrides,
    } as Project;
}

function keyedMesh(overrides: Record<string, unknown> = {}): AppBuilderComponentState {
    return {
        kind: 'mesh',
        status: 'deployed',
        source: { owner: '', repo: '' },
        endpoint: 'https://mesh/graphql',
        ...overrides,
    } as AppBuilderComponentState;
}

function legacyMeshState(): NonNullable<Project['meshState']> {
    return {
        envVars: {},
        sourceHash: 'abc',
        lastDeployed: '2026-07-01T00:00:00Z',
        endpoint: 'https://mesh/graphql',
    };
}

describe('markMeshUpdateDeclined (keyed-only write, Step 07)', () => {
    it('writes the decline flags to the keyed entry only — the legacy meshState write-side is retired', () => {
        const project = makeProject({
            meshState: legacyMeshState(),
            appBuilderComponents: { 'commerce-mesh': keyedMesh() },
        });

        const marked = markMeshUpdateDeclined(project);

        expect(marked).toBe(true);
        const keyed = project.appBuilderComponents?.['commerce-mesh'] as {
            userDeclinedUpdate?: boolean;
            declinedAt?: string;
        };
        expect(keyed.userDeclinedUpdate).toBe(true);
        expect(keyed.declinedAt).toEqual(expect.any(String));
        // ADR-011 D3 Step 07: the singular meshState write-side is retired —
        // the in-memory legacy stays untouched (readers are keyed-first).
        expect(project.meshState?.userDeclinedUpdate).toBeUndefined();
    });

    it('writes only the keyed entry for a keyed-only project (post-Step-07 world)', () => {
        const project = makeProject({
            appBuilderComponents: { mesh: keyedMesh() },
        });

        const marked = markMeshUpdateDeclined(project);

        expect(marked).toBe(true);
        expect(project.meshState).toBeUndefined();
        const keyed = project.appBuilderComponents?.mesh as { userDeclinedUpdate?: boolean };
        expect(keyed.userDeclinedUpdate).toBe(true);
    });

    it('returns false and fabricates nothing when neither state exists', () => {
        const project = makeProject();

        const marked = markMeshUpdateDeclined(project);

        expect(marked).toBe(false);
        expect(project.meshState).toBeUndefined();
        expect(project.appBuilderComponents).toBeUndefined();
    });
});

describe('isMeshUpdateDeclined (keyed-first read)', () => {
    it('reads the flag from the keyed mesh entry', () => {
        const project = makeProject({
            appBuilderComponents: {
                'commerce-mesh': keyedMesh({ userDeclinedUpdate: true }),
            },
        });

        expect(isMeshUpdateDeclined(project)).toBe(true);
    });

    it('falls back to meshState when the keyed entry lacks the flag (pre-Step-06 decline)', () => {
        const project = makeProject({
            meshState: { ...legacyMeshState(), userDeclinedUpdate: true },
            appBuilderComponents: { 'commerce-mesh': keyedMesh() },
        });

        expect(isMeshUpdateDeclined(project)).toBe(true);
    });

    it('returns false when neither carries the flag', () => {
        const project = makeProject({
            meshState: legacyMeshState(),
            appBuilderComponents: { 'commerce-mesh': keyedMesh() },
        });

        expect(isMeshUpdateDeclined(project)).toBe(false);
    });
});
