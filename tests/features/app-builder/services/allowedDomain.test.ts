/**
 * deriveAllowedDomain Test Suite (Step 07)
 *
 * Replicates the shipped behavior (setupInstructions.ts): the API Mesh apiKey
 * credential's mandatory `domain` is the selected frontend's `localhost:<port>`,
 * defaulting to `localhost:3000`. NOT the hardcoded `example.com` the spike used.
 */

import { deriveAllowedDomain } from '@/features/app-builder/services/allowedDomain';
import type { MeshSubscribeTarget } from '@/features/app-builder/services/ensureMeshApiSubscribed';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

function projectWithFrontend(frontendId: string, port?: number): Project {
    return createMockProject({
        name: 'p',
        created: new Date(),
        lastModified: new Date(),
        path: '/p',
        status: 'ready',
        componentSelections: { frontend: frontendId },
        componentInstances: {
            [frontendId]: { id: frontendId, name: frontendId, status: 'ready', port },
        },
    });
}

describe('deriveAllowedDomain', () => {
    it('should derive localhost:<port> from the selected frontend instance', () => {
        expect(deriveAllowedDomain(projectWithFrontend('headless', 4000))).toBe('localhost:4000');
    });

    it('should default to localhost:3000 when the frontend has no port', () => {
        expect(deriveAllowedDomain(projectWithFrontend('headless'))).toBe('localhost:3000');
    });

    it('should default to localhost:3000 when no frontend is selected', () => {
        const project = createMockProject({ name: 'p', status: 'ready', path: '/p' });
        expect(deriveAllowedDomain(project)).toBe('localhost:3000');
    });

    // The parameter type makes every field optional, and the caller is a project
    // mid-creation: each of the three hops below is genuinely absent at some point
    // in the flow. A missing hop must fall back to the default port, not throw and
    // abort the mesh subscribe — so each is driven separately here.
    describe('partially-populated projects', () => {
        it('should default when the project has no componentSelections at all', () => {
            const target: MeshSubscribeTarget = {};
            expect(deriveAllowedDomain(target)).toBe('localhost:3000');
        });

        it('should default when a frontend is selected but no instances exist yet', () => {
            const target: MeshSubscribeTarget = {
                componentSelections: { frontend: 'eds-storefront' },
            };
            expect(deriveAllowedDomain(target)).toBe('localhost:3000');
        });

        it('should default when the selected frontend has no instance of its own', () => {
            const target: MeshSubscribeTarget = {
                componentSelections: { frontend: 'eds-storefront' },
                componentInstances: {
                    'api-mesh': { id: 'api-mesh', name: 'API Mesh', status: 'ready' },
                },
            };
            expect(deriveAllowedDomain(target)).toBe('localhost:3000');
        });
    });

    it('should never return example.com', () => {
        expect(deriveAllowedDomain(projectWithFrontend('headless', 8080))).not.toContain(
            'example.com'
        );
    });
});
