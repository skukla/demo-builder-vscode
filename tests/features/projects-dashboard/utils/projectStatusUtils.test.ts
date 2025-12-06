/**
 * Unit tests for projectStatusUtils
 *
 * Tests the shared utility functions for project status display:
 * - getStatusText: Returns human-readable status text
 * - getStatusVariant: Returns StatusDot variant for visual indication
 * - getFrontendPort: Extracts port from running project's component instances
 */

import type { Project, ProjectStatus } from '@/types/base';
import {
    getStatusText,
    getStatusVariant,
    getFrontendPort,
    StatusVariant,
} from '@/features/projects-dashboard/utils/projectStatusUtils';
import { createMockProject, createRunningProject } from '../testUtils';

describe('projectStatusUtils', () => {
    describe('getStatusText', () => {
        it('should return "Running on port X" when status is running and port provided', () => {
            // Given: Running status with port 3000
            const status: ProjectStatus = 'running';
            const port = 3000;

            // When: Getting status text
            const result = getStatusText(status, port);

            // Then: Should include port number
            expect(result).toBe('Running on port 3000');
        });

        it('should return "Running" when status is running and no port', () => {
            // Given: Running status without port
            const status: ProjectStatus = 'running';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should just say Running
            expect(result).toBe('Running');
        });

        it('should return "Starting..." for starting status', () => {
            // Given: Starting status
            const status: ProjectStatus = 'starting';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should include ellipsis
            expect(result).toBe('Starting...');
        });

        it('should return "Stopping..." for stopping status', () => {
            // Given: Stopping status
            const status: ProjectStatus = 'stopping';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should include ellipsis
            expect(result).toBe('Stopping...');
        });

        it('should return "Stopped" for stopped status', () => {
            // Given: Stopped status
            const status: ProjectStatus = 'stopped';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should say Stopped
            expect(result).toBe('Stopped');
        });

        it('should return "Stopped" for ready status', () => {
            // Given: Ready status (project is ready but not running)
            const status: ProjectStatus = 'ready';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should say Stopped (ready means stopped/available)
            expect(result).toBe('Stopped');
        });

        it('should return "Error" for error status', () => {
            // Given: Error status
            const status: ProjectStatus = 'error';

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should say Error
            expect(result).toBe('Error');
        });

        it('should return "Stopped" for unknown status (default case)', () => {
            // Given: Unknown/unhandled status (cast to bypass TypeScript)
            const status = 'unknown' as ProjectStatus;

            // When: Getting status text
            const result = getStatusText(status);

            // Then: Should default to Stopped
            expect(result).toBe('Stopped');
        });
    });

    describe('getStatusVariant', () => {
        it('should return "success" for running status', () => {
            // Given: Running status
            const status: ProjectStatus = 'running';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be success (green)
            expect(result).toBe('success');
        });

        it('should return "warning" for starting status', () => {
            // Given: Starting status (transitional)
            const status: ProjectStatus = 'starting';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be warning (yellow/amber)
            expect(result).toBe('warning');
        });

        it('should return "warning" for stopping status', () => {
            // Given: Stopping status (transitional)
            const status: ProjectStatus = 'stopping';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be warning (yellow/amber)
            expect(result).toBe('warning');
        });

        it('should return "error" for error status', () => {
            // Given: Error status
            const status: ProjectStatus = 'error';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be error (red)
            expect(result).toBe('error');
        });

        it('should return "neutral" for stopped status', () => {
            // Given: Stopped status
            const status: ProjectStatus = 'stopped';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be neutral (gray)
            expect(result).toBe('neutral');
        });

        it('should return "neutral" for ready status', () => {
            // Given: Ready status
            const status: ProjectStatus = 'ready';

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should be neutral (gray)
            expect(result).toBe('neutral');
        });

        it('should return "neutral" for unknown status (default case)', () => {
            // Given: Unknown/unhandled status
            const status = 'unknown' as ProjectStatus;

            // When: Getting variant
            const result = getStatusVariant(status);

            // Then: Should default to neutral
            expect(result).toBe('neutral');
        });
    });

    describe('getFrontendPort', () => {
        it('should return undefined when project status is not running', () => {
            // Given: Stopped project
            const project = createMockProject({ status: 'stopped' });

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should be undefined (not running)
            expect(result).toBeUndefined();
        });

        it('should return undefined when project has no componentInstances', () => {
            // Given: Running project with no component instances
            const project = createMockProject({
                status: 'running',
                componentInstances: undefined,
            });

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should be undefined (no components)
            expect(result).toBeUndefined();
        });

        it('should return port from first component instance with a port', () => {
            // Given: Running project with component that has port
            const project = createRunningProject();
            // createRunningProject sets status: 'running' and has citisignal-nextjs with port: 3000

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should return the port
            expect(result).toBe(3000);
        });

        it('should return undefined when no component instances have ports', () => {
            // Given: Running project with components but none have ports
            const project = createMockProject({
                status: 'running',
                componentInstances: {
                    'api-mesh': {
                        id: 'api-mesh',
                        name: 'API Mesh',
                        status: 'deployed',
                        // No port property
                    },
                    'commerce-backend': {
                        id: 'commerce-backend',
                        name: 'Commerce Backend',
                        status: 'running',
                        // No port property
                    },
                },
            });

            // When: Getting frontend port
            const result = getFrontendPort(project);

            // Then: Should be undefined (no ports)
            expect(result).toBeUndefined();
        });
    });
});
