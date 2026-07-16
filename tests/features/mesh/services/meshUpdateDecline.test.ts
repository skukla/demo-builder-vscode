/**
 * meshUpdateDecline — the "Later" decline flow's state writes/reads
 * (ADR-011 D3 Step 06).
 *
 * The configure command's decline branch historically wrote
 * `meshState.userDeclinedUpdate`/`declinedAt` only. Step 06 mirrors the write
 * onto the keyed mesh appBuilderComponents entry (both-writes during the
 * transition, like Step 02) and reads keyed-first, so the flags survive
 * Step 07's retirement of the singular meshState write-side.
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

describe('markMeshUpdateDeclined (both-writes)', () => {
    it('writes the decline flags to BOTH meshState and the keyed mesh entry', () => {
        const project = makeProject({
            meshState: legacyMeshState(),
            appBuilderComponents: { 'commerce-mesh': keyedMesh() },
        });

        const marked = markMeshUpdateDeclined(project);

        expect(marked).toBe(true);
        expect(project.meshState?.userDeclinedUpdate).toBe(true);
        expect(project.meshState?.declinedAt).toEqual(expect.any(String));
        const keyed = project.appBuilderComponents?.['commerce-mesh'] as {
            userDeclinedUpdate?: boolean;
            declinedAt?: string;
        };
        expect(keyed.userDeclinedUpdate).toBe(true);
        // The two writes carry the SAME timestamp (one decline event).
        expect(keyed.declinedAt).toBe(project.meshState?.declinedAt);
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
