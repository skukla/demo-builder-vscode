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
import { createMockProject } from '../../../helpers/projectFake';

function makeProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/tmp/demo',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        ...overrides,
    });
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

describe('markMeshUpdateDeclined (keyed-only write, Step 07)', () => {
    it('writes the decline flags to the keyed entry (found by kind under any key)', () => {
        const project = makeProject({
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
    });

    it('writes the entry under the canonical mesh key too', () => {
        const project = makeProject({
            appBuilderComponents: { mesh: keyedMesh() },
        });

        const marked = markMeshUpdateDeclined(project);

        expect(marked).toBe(true);
        const keyed = project.appBuilderComponents?.mesh as { userDeclinedUpdate?: boolean };
        expect(keyed.userDeclinedUpdate).toBe(true);
    });

    it('returns false and fabricates nothing when no keyed mesh exists', () => {
        const project = makeProject();

        const marked = markMeshUpdateDeclined(project);

        expect(marked).toBe(false);
        expect(project.appBuilderComponents).toBeUndefined();
    });
});

describe('isMeshUpdateDeclined (keyed-only read)', () => {
    it('reads the flag from the keyed mesh entry', () => {
        const project = makeProject({
            appBuilderComponents: {
                'commerce-mesh': keyedMesh({ userDeclinedUpdate: true }),
            },
        });

        expect(isMeshUpdateDeclined(project)).toBe(true);
    });

    it('returns false when the keyed entry lacks the flag', () => {
        // Legacy pre-Step-06 declines are folded into the keyed entry at load
        // (PL-1 phase 2 removed the in-memory fallback).
        const project = makeProject({
            appBuilderComponents: { 'commerce-mesh': keyedMesh() },
        });

        expect(isMeshUpdateDeclined(project)).toBe(false);
    });
});
