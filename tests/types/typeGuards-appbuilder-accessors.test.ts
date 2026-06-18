/**
 * Type Guards Tests - App Builder Component Accessor
 *
 * Tests for the single kept App Builder accessor:
 * - getAppBuilderInstance (custom app lookup via subType === 'app')
 *
 * The app is SINGULAR (a demo workspace holds at most one custom app) and lives
 * alongside the mesh, so this accessor must isolate the app from the mesh and
 * other instances. Mirrors typeGuards-mesh-accessors.test.ts.
 */

import { getAppBuilderInstance } from '@/types/typeGuards';
import { Project, ComponentInstance } from '@/types/base';

describe('typeGuards - App Builder Accessor', () => {
    const createApp = (id: string, overrides: Partial<ComponentInstance> = {}): ComponentInstance => ({
        id,
        name: 'My App',
        type: 'app-builder',
        subType: 'app',
        status: 'installed',
        ...overrides,
    } as ComponentInstance);

    const createProjectWithAppAndMesh = (): Project => ({
        name: 'test-project',
        componentInstances: {
            'my-app': createApp('my-app'),
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'Commerce API Mesh',
                type: 'dependency',
                subType: 'mesh',
                status: 'deployed',
            },
            'citisignal': { id: 'citisignal', name: 'CitiSignal', type: 'frontend', status: 'ready' },
        },
    } as unknown as Project);

    describe('getAppBuilderInstance', () => {
        it('returns the app instance, isolated from the coexisting mesh', () => {
            const app = getAppBuilderInstance(createProjectWithAppAndMesh());
            expect(app).toBeDefined();
            expect(app?.id).toBe('my-app');
            expect(app?.subType).toBe('app');
        });

        it('returns undefined when the project has a mesh but no app', () => {
            const project = {
                componentInstances: {
                    'commerce-mesh': { id: 'commerce-mesh', subType: 'mesh', status: 'deployed' },
                },
            } as unknown as Project;
            expect(getAppBuilderInstance(project)).toBeUndefined();
        });

        it('returns undefined for undefined project', () => {
            expect(getAppBuilderInstance(undefined)).toBeUndefined();
        });

        it('returns undefined for null project', () => {
            expect(getAppBuilderInstance(null)).toBeUndefined();
        });

        it('returns undefined when componentInstances is empty', () => {
            const project = { componentInstances: {} } as unknown as Project;
            expect(getAppBuilderInstance(project)).toBeUndefined();
        });
    });
});
