/**
 * Tests for meshStatusHelpers — sendDemoStatusUpdate
 *
 * The mesh-status resolution logic moved to
 * features/mesh/services/meshStatusResolver (tested there); this file covers
 * the dashboard-side status push that stayed behind.
 */

import type { Project } from '@/types';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

describe('meshStatusHelpers', () => {
    const mockMeshPath = '/projects/demo/components/commerce-mesh';
    describe('sendDemoStatusUpdate (keyed-only project)', () => {
        it('posts deployed status with the keyed endpoint when no meshState exists', async () => {
            const {
                sendDemoStatusUpdate,
            } = require('@/features/dashboard/handlers/meshStatusHelpers');

            const project = {
                name: 'demo',
                path: '/projects/demo',
                status: 'ready',
                meshStatusSummary: 'deployed',
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        status: 'deployed',
                        path: mockMeshPath,
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://keyed-mesh.adobe.io/graphql',
                        envVars: { MESH_ID: 'mesh123' },
                    },
                },
            } as unknown as Project;

            const postMessage = jest.fn();
            const context = {
                panel: { webview: { postMessage } },
                stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
                logger: {
                    debug: jest.fn(),
                    info: jest.fn(),
                    warn: jest.fn(),
                    error: jest.fn(),
                    trace: jest.fn(),
                },
            } as any;

            await sendDemoStatusUpdate(context);

            expect(postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'statusUpdate',
                    payload: expect.objectContaining({
                        mesh: expect.objectContaining({
                            status: 'deployed',
                            endpoint: 'https://keyed-mesh.adobe.io/graphql',
                        }),
                    }),
                })
            );
        });
    });
});
