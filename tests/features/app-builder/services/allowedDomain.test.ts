/**
 * deriveAllowedDomain Test Suite (Step 07)
 *
 * Replicates the shipped behavior (setupInstructions.ts): the API Mesh apiKey
 * credential's mandatory `domain` is the selected frontend's `localhost:<port>`,
 * defaulting to `localhost:3000`. NOT the hardcoded `example.com` the spike used.
 */

import { deriveAllowedDomain } from '@/features/app-builder/services/allowedDomain';
import type { Project } from '@/types/base';

function projectWithFrontend(frontendId: string, port?: number): Project {
    return {
        name: 'p',
        created: new Date(),
        lastModified: new Date(),
        path: '/p',
        status: 'ready',
        componentSelections: { frontend: frontendId },
        componentInstances: {
            [frontendId]: { id: frontendId, name: frontendId, status: 'ready', port },
        },
    } as unknown as Project;
}

describe('deriveAllowedDomain', () => {
    it('should derive localhost:<port> from the selected frontend instance', () => {
        expect(deriveAllowedDomain(projectWithFrontend('headless', 4000))).toBe('localhost:4000');
    });

    it('should default to localhost:3000 when the frontend has no port', () => {
        expect(deriveAllowedDomain(projectWithFrontend('headless'))).toBe('localhost:3000');
    });

    it('should default to localhost:3000 when no frontend is selected', () => {
        const project = { name: 'p', status: 'ready', path: '/p' } as unknown as Project;
        expect(deriveAllowedDomain(project)).toBe('localhost:3000');
    });

    it('should never return example.com', () => {
        expect(deriveAllowedDomain(projectWithFrontend('headless', 8080))).not.toContain('example.com');
    });
});
